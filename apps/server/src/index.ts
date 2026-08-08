import { getAgentDir, loadSkills } from "@earendil-works/pi-coding-agent";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
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

// sessionId → 存活实例。切换后旧实例仍在后台跑 agent，退出时统一释放；
// 恢复同一会话时复用实例，避免同一会话文件被两个 runtime 同时写。
const services = new Map<string, PiService>();
services.set(service.session.sessionId, service);

/**
 * 切换到另一个会话：先解绑旧实例的事件监听，避免旧会话的流式事件
 * 串进新会话窗口（旧 agent 继续后台运行，只是事件不再广播）。
 */
async function switchService(next: PiService): Promise<void> {
  service.unbind();
  service = next;
  services.set(next.session.sessionId, next);
  streaming = false;
  await bindEvents();
}

/** 恢复会话：若已有存活实例（后台仍在跑），复用并重新绑定，而不是再开一个 runtime。 */
async function openOrReuse(sessionFile: string): Promise<PiService> {
  for (const s of services.values()) {
    if (s.sessionFile === sessionFile) return s;
  }
  return PiService.open(sessionFile);
}
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
  | { type: "removeFromQueue"; text: string }
  | { type: "editQueued"; text: string; newText: string }
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
      await switchService(await PiService.createNew(dir ?? cwd));
      send(ws, { type: "session", session: sessionState() });
      return;
    }
    case "resume": {
      await switchService(await openOrReuse(msg.path));
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
    case "removeFromQueue":
      await service.removeFromQueue(msg.text);
      return;
    case "editQueued":
      await service.editQueued(msg.text, msg.newText);
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
    if (pathname === "/api/models") {
      const m = service.session.model;
      sendJson(res, 200, {
        models: service.listModels(),
        current: m ? { provider: m.provider, id: m.id, name: m.name ?? m.id } : null,
        thinking: service.getThinking(),
      });
      return;
    }
    if (pathname === "/api/model" && req.method === "POST") {
      const body = (await readJsonBody(req)) as { provider?: string; id?: string };
      if (!body.provider || !body.id) return sendError(res, 400, "Missing provider/id.");
      await service.setModel(body.provider, body.id);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (pathname === "/api/thinking" && req.method === "POST") {
      const body = (await readJsonBody(req)) as { level?: string };
      if (!body.level) return sendError(res, 400, "Missing level.");
      service.setThinking(body.level);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (pathname === "/api/fs/search") {
      // @ 输入 ≥2 字符时递归搜索（跳过 node_modules/.git/dist 等，200 条上限）。
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const dirParam = (url.searchParams.get("dir") ?? "").replace(/^\/+|\/+$/g, "");
      const baseDir = resolve(service.cwd, dirParam);
      if (!baseDir.startsWith(service.cwd)) {
        sendError(res, 400, "Invalid dir.");
        return;
      }
      const SKIP = new Set([
        "node_modules",
        ".git",
        "dist",
        "build",
        "target",
        ".next",
        ".venv",
        "__pycache__",
      ]);
      const results: Array<{ name: string; type: "file"; path: string }> = [];
      const walk = (dir: string, rel: string) => {
        if (results.length >= 200) return;
        let entries;
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const e of entries) {
          if (results.length >= 200) return;
          if (e.name.startsWith(".")) continue;
          if (SKIP.has(e.name)) continue;
          const relPath = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walk(join(dir, e.name), relPath);
          else if (e.name.toLowerCase().includes(q)) {
            results.push({ name: relPath, type: "file", path: relPath });
          }
        }
      };
      walk(baseDir, dirParam);
      sendJson(res, 200, { items: results });
      return;
    }
    if (pathname === "/api/stats") {
      sendJson(res, 200, service.getStats());
      return;
    }
    if (pathname === "/api/fs/list") {
      // @ 选文件：浏览当前工作目录（dir 参数下钻），q 过滤当前层。
      const q = (url.searchParams.get("q") ?? "").toLowerCase();
      const dirParam = (url.searchParams.get("dir") ?? "").replace(/^\/+|\/+$/g, "");
      const baseDir = resolve(service.cwd, dirParam);
      // 防路径穿越：目标目录必须在 cwd 内。
      if (!baseDir.startsWith(service.cwd)) {
        sendError(res, 400, "Invalid dir.");
        return;
      }
      const items: Array<{ name: string; type: "file" | "dir"; path: string }> = [];
      try {
        for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
          if (entry.name.startsWith(".")) continue;
          if (q && !entry.name.toLowerCase().includes(q)) continue;
          items.push({
            name: entry.name,
            type: entry.isDirectory() ? "dir" : "file",
            path: dirParam ? `${dirParam}/${entry.name}` : entry.name,
          });
        }
      } catch {
        // 目录不可读时返回空列表
      }
      items.sort((a, b) =>
        a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1,
      );
      sendJson(res, 200, { cwd: service.cwd, dir: dirParam, items: items.slice(0, 60) });
      return;
    }
    if (pathname === "/api/skills") {
      // $ 选 skills：从 agent 目录 + 项目加载，标注来源（全局/项目）。
      const agentDir = getAgentDir();
      const { skills } = await loadSkills({
        cwd: service.cwd,
        agentDir,
        skillPaths: [],
        includeDefaults: true,
      });
      sendJson(res, 200, {
        skills: skills.map((s) => ({
          name: s.name,
          description: s.description,
          scope: s.baseDir.startsWith(agentDir) ? "global" : "project",
        })),
      });
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
      await switchService(await PiService.createNew(dir ?? cwd));
      sendJson(res, 200, sessionState());
      return;
    }
    if (pathname === "/api/resume" && req.method === "POST") {
      const body = (await readJsonBody(req)) as { path?: string };
      if (!body.path) return sendError(res, 400, "Missing `path`.");
      await switchService(await openOrReuse(body.path));
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

async function shutdown(code: number) {
  for (const s of services.values()) {
    try {
      await s.dispose();
    } catch {
      // 忽略单个实例的释放失败
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));
