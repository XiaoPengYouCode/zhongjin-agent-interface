import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, sendError, sendJson } from "./http.ts";

/**
 * 可管理的配置文件白名单（name → 绝对路径）。
 * 只允许编辑这些文件，防止任意路径读写。
 */
export function settingsFiles(agentDir: string, cwd: string): Record<string, string> {
  return {
    "settings.json": join(agentDir, "settings.json"),
    "models.json": join(agentDir, "models.json"),
    "agents.md": join(cwd, "AGENTS.md"),
  };
}

/** 处理 /api/settings* 路由；未命中返回 false。 */
export async function handleSettingsRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  agentDir: string,
  cwd: string,
): Promise<boolean> {
  const pathname = url.pathname;
  if (!pathname.startsWith("/api/settings")) return false;
  const files = settingsFiles(agentDir, cwd);

  if (pathname === "/api/settings" && req.method === "GET") {
    sendJson(res, 200, {
      agentDir,
      cwd,
      files: Object.entries(files).map(([name, path]) => ({
        name,
        path,
        exists: existsSync(path),
      })),
    });
    return true;
  }

  if (pathname === "/api/settings/file" && req.method === "GET") {
    const name = url.searchParams.get("name") ?? "";
    const path = files[name];
    if (!path) return (sendError(res, 400, `Unknown settings file: ${name}`), true);
    if (!existsSync(path)) return (sendJson(res, 200, { name, content: "", exists: false }), true);
    sendJson(res, 200, { name, content: readFileSync(path, "utf8"), exists: true });
    return true;
  }

  if (pathname === "/api/settings/file" && req.method === "PUT") {
    const name = url.searchParams.get("name") ?? "";
    const path = files[name];
    if (!path) return (sendError(res, 400, `Unknown settings file: ${name}`), true);
    const body = (await readJsonBody(req)) as { content?: string };
    if (typeof body.content !== "string") return (sendError(res, 400, "Missing content."), true);
    if (name.endsWith(".json")) {
      try {
        JSON.parse(body.content);
      } catch (err) {
        return (
          sendError(res, 400, `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`),
          true
        );
      }
    }
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, body.content, "utf8");
    } catch (err) {
      return (
        sendError(
          res,
          500,
          `Failed to write ${name}: ${err instanceof Error ? err.message : String(err)}`,
        ),
        true
      );
    }
    sendJson(res, 200, { ok: true });
    return true;
  }

  return false;
}
