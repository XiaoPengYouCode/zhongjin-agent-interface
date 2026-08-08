import { memo, useEffect } from "react";
import { Markdown } from "./Markdown.tsx";
import { ToolCallBlock } from "./ToolCallBlock.tsx";
import type { UiMessage, UiPart } from "../lib/types.ts";

/** 广播一次自动滚动请求（thinking/tool 展开折叠时由各组件触发）。 */
function requestAutoScroll() {
  document.dispatchEvent(new CustomEvent("pi:autoscroll"));
}

function ThinkingBlock({
  part,
  streaming,
}: {
  part: Extract<UiPart, { kind: "thinking" }>;
  streaming: boolean;
}) {
  // thinking 出现（展开）与结束（折叠）时，强制外层滚动到底一次。
  useEffect(() => {
    requestAutoScroll();
  }, [streaming]);

  return (
    <details className="thinking" open={streaming}>
      <summary>
        <span className="thinking-dot" />
        <span className="tool-name">thinking</span>
      </summary>
      <div className={streaming ? "thinking-text thinking-text-live" : "thinking-text"}>
        {part.text}
      </div>
    </details>
  );
}

export const MessageBubble = memo(function MessageBubble({ message }: { message: UiMessage }) {
  if (message.role === "user") {
    return (
      <div className="msg-row msg-user">
        <div className="msg-bubble msg-user-bubble">{message.text}</div>
      </div>
    );
  }

  return (
    <div className="msg-row msg-assistant">
      <div className="msg-bubble msg-assistant-bubble">
        {message.parts.map((part, i) => {
          if (part.kind === "thinking")
            return <ThinkingBlock key={i} part={part} streaming={message.streaming} />;
          if (part.kind === "toolCall") return <ToolCallBlock key={part.id} part={part} />;
          return (
            <div key={i} className="markdown-body">
              <Markdown text={part.text} />
            </div>
          );
        })}
      </div>
    </div>
  );
});
