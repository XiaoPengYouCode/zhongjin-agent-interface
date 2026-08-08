import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble.tsx";
import type { UiMessage } from "../lib/types.ts";

export function MessageList({ messages }: { messages: UiMessage[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  // 程序化滚动触发 scroll 事件时，流式增长会让“距底距离”被高估，
  // 从而把 stick 误置为 false。记录时间戳，窗口期内不参与判定。
  const lastProgScroll = useRef(0);
  const DEBUG = useRef(
    typeof localStorage !== "undefined" && localStorage.getItem("pi-web-debug") === "1",
  );

  const logScroll = (msg: string, extra?: unknown) => {
    if (DEBUG.current) console.debug(`[scroll] ${msg}`, extra ?? "");
  };

  const scrollToBottom = () => {
    const el = scroller.current;
    if (!el) return;
    lastProgScroll.current = performance.now();
    el.scrollTop = el.scrollHeight;
    logScroll("programmatic scrollTop -> scrollHeight", {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    });
  };

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    if (performance.now() - lastProgScroll.current < 100) {
      logScroll("ignore (programmatic window)");
      return;
    }
    const next = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (next !== stick.current) {
      logScroll(`stick ${stick.current} -> ${next}`, {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      });
    }
    stick.current = next;
  };

  // 最新一条是用户刚发的消息时，强制滚到底部（用户可能之前上滑读过内容）。
  const lastIsUser = messages.length > 0 && messages[messages.length - 1].role === "user";

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (lastIsUser) stick.current = true;
    if (stick.current) {
      // 等布局稳定后再滚，避免读到旧高度。
      requestAnimationFrame(scrollToBottom);
    }
  }, [messages, lastIsUser]);

  // 输入框增高会压缩 .messages 的视口，底部内容被遮住；
  // 视口变矮时强制滚到底部，保持最新内容可见。
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let prevH = 0;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (prevH !== 0 && h < prevH) requestAnimationFrame(scrollToBottom);
      prevH = h;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (messages.length === 0) {
    return (
      <div className="messages" ref={scroller} onScroll={onScroll}>
        <div className="empty">
          <div className="empty-mark">π</div>
          <p className="empty-title">Pi Web</p>
          <p className="empty-hint">输入一条消息，开始和 Pi 对话。</p>
          <p className="empty-sub">会话与终端里的 Pi 共享，可以随时恢复。</p>
        </div>
      </div>
    );
  }

  return (
    <div className="messages" ref={scroller} onScroll={onScroll}>
      {messages.map((m) => (
        <MessageBubble key={m.key} message={m} />
      ))}
    </div>
  );
}
