import { createReadStream, existsSync, statSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { WebSocket, WebSocketServer } from "ws";
import { PiService, listSessions } from "./pi-service.ts";

const packageDir = dirname(fileURLToPath(import.meta.url));
// Package root: in dev (tsx) this is apps/server/src, in prod dist/ — both up one level.
const serverRoot = dirname(packageDir);

const execFileAsync = promisify(execFile);

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";

function findWorkspaceRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

// Agent working directory: PI_CWD env, else the monorepo root.
const cwd = resolve(process.env.PI_CWD ?? findWorkspaceRoot(packageDir));
// Built website to serve (single-process production mode), if present.
const webDist = resolve(process.env.WEB_DIST ?? join(serverRoot, "..", "website", "dist"));

let service = await PiService.createNew(cwd);
console.log(`[pi-web] agent cwd: ${cwd}`);
console.log(`[pi-web] session: ${service.session.sessionFile ?? "(new, in-memory)"}`);
const model = service.session.model;
console.log(`[pi-web] model: ${model ? `${model.provider}/${model.id}` : "default"}`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Expand `~` and resolve to an absolute directory path. */
function normalizeDirPath(input: string): string {
  const expanded = input.startsWith("~") ? join(homedir(), input.slice(1)) : input;
  return resolve(expanded);
}

/** Resolve a session's working directory, validating that it exists. */
function resolveSessionDir(input: string): string {
  const target = normalizeDirPath(input);
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    throw new Error(`Not a directory: ${target}`);
  }
  return target;
}

// ---------------------------------------------------------------------------
// WebSocket protocol
// ---------------------------------------------------------------------------

type ClientMessage =
  | { type: "prompt"; text: string }
  | { type: "steer"; text: string }
  | { type: "followUp"; text: string }
  | { type: "promoteToSteer"; text: string }
  | { type: "abort" }
  | { type: "newSession"; cwd?: string }
  | { type: "resume"; path: string }
  | { type: "ping" };

const clients = new Set<WebSocket>();
let streaming = false;

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(payload: unknown) {
  for (const ws of clients) send(ws, payload);
}

function serializeEvent(event: AgentSessionEvent): unknown {
  try {
    return JSON.parse(
      JSON.stringify(event, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
  } catch {
    return { type: event.type, serialized: false };
  }
}

function sessionState() {
  const session = service.session;
  const m = session.model;
  return {
    sessionId: session.sessionId,
    sessionFile: session.sessionFile ?? null,
    // The active session's own folder (from its header) is authoritative.
    cwd: session.sessionManager.getCwd() || service.cwd,
    streaming,
    model: m ? { provider: m.provider, id: m.id, name: m.name } : null,
    messages: session.messages,
    queue: service.getQueue(),
  };
}

// Subscribe to the active session; re-bind after every session replacement.
async function bindEvents() {
  await service.bind((event) => {
    if (event.type === "agent_start") streaming = true;
    else if (event.type === "agent_end") streaming = false;
    broadcast({ type: "event", event: serializeEvent(event) });
  });
}
await bindEvents();

function rawDataToString(data: WebSocket.RawData): string {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

async function handleClientMessage(ws: WebSocket, msg: ClientMessage) {
  switch (msg.type) {
    case "ping":
      send(ws, { type: "pong" });
      return;
    case "newSession": {
      const dir = msg.cwd ? resolveSessionDir(msg.cwd) : undefined;
      service = await PiService.createNew(dir ?? cwd);
      streaming = false;
      await bindEvents();
      send(ws, { type: "session", session: sessionState() });
      return;
    }
    case "resume": {
      service = await PiService.open(msg.path);
      streaming = false;
      await bindEvents();
      send(ws, { type: "session", session: sessionState() });
      return;
    }
    case "prompt":
      await service.prompt(msg.text);
      return;
    case "steer":
      await service.steer(msg.text);
      return;
    case "followUp":
      await service.followUp(msg.text);
      return;
    case "promoteToSteer":
      await service.promoteToSteer(msg.text);
      return;
    case "abort":
      await service.abort();
      return;
  }
}

// ---------------------------------------------------------------------------
// HTTP API + static file serving
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendError(res: ServerResponse, status: number, message: string) {
  sendJson(res, status, { error: message });
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body) return {};
  return JSON.parse(body);
}

function serveStatic(res: ServerResponse, pathname: string) {
  // Resolve inside webDist and prevent path traversal.
  const rel = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(webDist, "." + rel);
  if (!filePath.startsWith(webDist)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    res.writeHead(200, {
      "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
    });
    createReadStream(filePath).pipe(res);
    return;
  }
  // SPA fallback for client-side routes.
  if (existsSync(join(webDist, "index.html"))) {
    res.writeHead(200, { "content-type": MIME[".html"] });
    createReadStream(join(webDist, "index.html")).pipe(res);
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const { pathname } = url;

  try {
    if (pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        cwd: service.cwd,
        pid: process.pid,
        streaming,
        session: sessionState(),
      });
      return;
    }
    if (pathname === "/api/sessions") {
      const sessions = await listSessions();
      sendJson(res, 200, { sessions });
      return;
    }
    if (pathname === "/api/state") {
      sendJson(res, 200, sessionState());
      return;
    }
    if (pathname === "/api/fs/pick" && req.method === "POST") {
      // macOS native folder picker (NSOpenPanel) via osascript. The dialog is
      // modal on the desktop; this request stays pending until the user
      // chooses or cancels.
      try {
        const { stdout } = await execFileAsync(
          "osascript",
          ["-e", 'POSIX path of (choose folder with prompt "选择 Pi 工作目录")'],
          { timeout: 5 * 60 * 1000 },
        );
        const picked = stdout.trim();
        if (picked && existsSync(picked) && statSync(picked).isDirectory()) {
          console.log(`[pi-web] picked folder: ${picked}`);
          sendJson(res, 200, { path: picked });
        } else {
          sendJson(res, 200, { cancelled: true });
        }
      } catch {
        // User dismissed the dialog (osascript exits non-zero) or timed out.
        sendJson(res, 200, { cancelled: true });
      }
      return;
    }
    if (pathname === "/api/sessions" && req.method === "POST") {
      const body = (await readJsonBody(req)) as { cwd?: string };
      const dir = body.cwd ? resolveSessionDir(body.cwd) : undefined;
      service = await PiService.createNew(dir ?? cwd);
      streaming = false;
      await bindEvents();
      sendJson(res, 200, sessionState());
      return;
    }
    if (pathname === "/api/resume" && req.method === "POST") {
      const body = (await readJsonBody(req)) as { path?: string };
      if (!body.path) return sendError(res, 400, "Missing `path`.");
      service = await PiService.open(body.path);
      streaming = false;
      await bindEvents();
      sendJson(res, 200, sessionState());
      return;
    }
    if (pathname === "/api/prompt" && req.method === "POST") {
      const body = (await readJsonBody(req)) as { text?: string };
      if (!body.text) return sendError(res, 400, "Missing `text`.");
      await service.prompt(body.text);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (pathname === "/api/abort" && req.method === "POST") {
      await service.abort();
      sendJson(res, 200, { ok: true });
      return;
    }
    if (pathname.startsWith("/api/")) {
      sendError(res, 404, `Unknown API route: ${pathname}`);
      return;
    }

    // Static files (built website), only if a build exists.
    if (existsSync(join(webDist, "index.html"))) {
      serveStatic(res, pathname);
      return;
    }
    sendError(
      res,
      404,
      "No website build found. Run `vp run website#build`, or use the Vite dev server on port 5173.",
    );
  } catch (err) {
    console.error("[pi-web] request error:", err);
    sendError(res, 500, err instanceof Error ? err.message : String(err));
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  clients.add(ws);
  send(ws, { type: "hello", session: sessionState() });
  console.log(`[pi-web] client connected (${clients.size} total)`);

  ws.on("message", (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(rawDataToString(data)) as ClientMessage;
    } catch {
      send(ws, { type: "error", message: "Invalid JSON message." });
      return;
    }
    handleClientMessage(ws, msg).catch((err) => {
      console.error("[pi-web] ws error:", err);
      send(ws, {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    });
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[pi-web] client disconnected (${clients.size} total)`);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[pi-web] listening on http://${HOST}:${PORT}`);
});

process.on("SIGINT", async () => {
  await service.dispose();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await service.dispose();
  process.exit(0);
});
