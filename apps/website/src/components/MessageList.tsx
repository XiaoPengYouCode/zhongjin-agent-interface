import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble.tsx";
import type { UiMessage } from "../lib/types.ts";

export function MessageList({
  messages,
  streaming,
}: {
  messages: UiMessage[];
  streaming: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="messages" ref={scroller} onScroll={onScroll}>
        <div className="empty">
          <div className="empty-mark">π</div>
          <p className="empty-title">Pi Web</p>
          <p className="empty-hint">输入一条消息，开始和 Pi 对话。</p>
          <p className="empty-sub">
            会话与终端里的 Pi 共享（~/.pi/agent/sessions），可以随时恢复。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="messages" ref={scroller} onScroll={onScroll}>
      {messages.map((m) => (
        <MessageBubble key={m.key} message={m} />
      ))}
      {streaming && <div className="stream-hint">Pi 正在思考…</div>}
    </div>
  );
}
