#!/usr/bin/env node
// Start the API server first, wait until healthy, then start the website.
// Avoids ECONNREFUSED races in the Vite proxy (/api and /ws) during parallel boot.
//
// Runs under `vp run dev`, so it must not spawn another `vp run` (the vite-plus
// task runner is single-instance: a nested instance fails its native spawn with
// EINVAL). It calls the underlying commands directly: tsx for the server, and
// vp's built-in dev command for the website.
import { spawn } from "node:child_process";
import { connect } from "node:net";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_PORT = 8787;
const WEB_PORT = 5173;
const HEALTH_URL = `http://127.0.0.1:${SERVER_PORT}/api/health`;
const BOOT_TIMEOUT_MS = 90_000;

function portInUse(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const sock = connect({ port, host });
    sock.once("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => resolve(false));
  });
}

// Fail fast if a stale dev session is holding the ports (EADDRINUSE).
for (const port of [SERVER_PORT, WEB_PORT]) {
  if (await portInUse(port)) {
    console.error(`[dev] 端口 ${port} 已被占用 —— 可能还有旧的 dev 会话在运行。`);
    console.error(`[dev] 请先停掉旧会话（或执行 lsof -i :${port} 查看占用进程），再重新运行。`);
    process.exit(1);
  }
}

function run(cmd, args, cwd) {
  // detached + kill(-pid) so tsx/node children die with the tree.
  return spawn(cmd, args, { stdio: "inherit", detached: true, cwd });
}
function stop(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

const serverBin = join(ROOT, "apps", "server", "node_modules", ".bin", "tsx");
if (!existsSync(serverBin)) {
  console.error(`[dev] 找不到 tsx（${serverBin}），请先执行 vp install`);
  process.exit(1);
}
const server = run(serverBin, ["watch", "src/index.ts"], join(ROOT, "apps", "server"));

let healthy = false;
const deadline = Date.now() + BOOT_TIMEOUT_MS;
while (!healthy && Date.now() < deadline) {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1000) });
    healthy = res.ok;
  } catch {
    // server still booting
  }
  if (!healthy) await sleep(500);
}

if (!healthy) {
  console.error(`[dev] server 未在 ${BOOT_TIMEOUT_MS / 1000}s 内就绪，退出`);
  stop(server);
  process.exit(1);
}
console.log(`[dev] server 已就绪（${SERVER_PORT}），启动 website…`);

const website = run("vp", ["dev"], join(ROOT, "apps", "website"));

const teardown = (code = 0) => {
  stop(server);
  stop(website);
  process.exit(code);
};
website.on("exit", (code) => teardown(code ?? 0));
server.on("exit", () => teardown(1));
process.on("SIGINT", () => teardown(130));
process.on("SIGTERM", () => teardown(143));
