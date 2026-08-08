import { useEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble.tsx";
import type { UiMessage } from "../lib/types.ts";

export function MessageList({ messages }: { messages: UiMessage[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // 最新一条是用户刚发的消息时，强制滚到底部（用户可能之前上滑读过内容）。
  const lastIsUser = messages.length > 0 && messages[messages.length - 1].role === "user";

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (lastIsUser) stick.current = true;
    if (stick.current) {
      // 等布局稳定后再滚，避免读到旧高度。
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages, lastIsUser]);

  // 输入框增高/变矮会改变 .messages 的视口高度，底部内容可能被遮住；
  // 监听容器尺寸变化，贴底时跟随滚到底部。
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (!stick.current) return;
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight;
      });
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
