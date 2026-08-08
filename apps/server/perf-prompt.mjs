import { WebSocket } from "ws";
const ws = new WebSocket("ws://127.0.0.1:8787/ws");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ended = false;
ws.on("message", (d) => {
  const m = JSON.parse(d.toString());
  if (m.type === "event" && m.event.type === "agent_end") ended = true;
});
ws.on("open", async () => {
  console.log("发送流式任务…");
  ws.send(
    JSON.stringify({
      type: "prompt",
      text: "请列出 /Users/flamingo/Projects/zhongjin-agent-interface 目录结构（用 ls -R 查看前3层），然后写一段 300 字的总结说明这个项目是做什么的",
    }),
  );
  for (let i = 0; i < 120; i++) {
    if (ended) break;
    await wait(500);
  }
  console.log("任务结束:", ended);
  process.exit(0);
});
setTimeout(() => process.exit(1), 65000);
