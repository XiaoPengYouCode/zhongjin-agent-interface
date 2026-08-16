import { useEffect } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import { MessageBubble } from "./MessageBubble.tsx";
import type { UiMessage } from "../lib/types.ts";

export function MessageList({
  messages,
  onRetract,
  onEditResend,
}: {
  messages: UiMessage[];
  onRetract: (entryId: string) => void;
  onEditResend: (entryId: string, text: string) => void;
}) {
  // 自动贴底（use-stick-to-bottom）：内容增长（流式输出 / 块展开动画 / 图片
  // 加载）时自动跟随，内容收缩不丢贴底；用户上滑即取消跟随，滚回底部附近
  // 自动恢复。程序化滚动与用户滚动的区分基于 ResizeObserver + 无 debounce，
  // 不依赖 scrollHeight 估算，与 .msg-row 的 content-visibility 兼容。
  const { scrollRef, contentRef, scrollToBottom } = useStickToBottom({
    resize: "smooth", // 流式增长：弹簧动画平滑跟随（固定时长 easing 在变尺寸内容下会抽搐）
    initial: "instant", // 首屏 / 切会话：直接落到底部，不做动画
  });

  // 最新一条是用户刚发的消息时，强制滚到底部（用户可能之前上滑读过内容）。
  const lastIsUser = messages.length > 0 && messages[messages.length - 1].role === "user";
  useEffect(() => {
    if (lastIsUser) void scrollToBottom();
  }, [lastIsUser, scrollToBottom]);

  // 输入框增高会压缩 .messages 的视口，底部内容被遮住。库只监听内容高度，
  // 视口变矮需自己补：仍贴底时跟随滚到底部（上滑未回底时不抢占）。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let prevH = 0;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (prevH !== 0 && h < prevH) void scrollToBottom({ preserveScrollPosition: true });
      prevH = h;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef, scrollToBottom]);

  return (
    <div className="messages" ref={scrollRef}>
      <div ref={contentRef}>
        {messages.length === 0 ? (
          <div className="empty">
            <div className="empty-mark">π</div>
            <p className="empty-title">Pi Web</p>
            <p className="empty-hint">输入一条消息，开始和 Pi 对话。</p>
            <p className="empty-sub">会话与终端里的 Pi 共享，可以随时恢复。</p>
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.key}
              message={m}
              onRetract={onRetract}
              onEditResend={onEditResend}
            />
          ))
        )}
      </div>
    </div>
  );
}
