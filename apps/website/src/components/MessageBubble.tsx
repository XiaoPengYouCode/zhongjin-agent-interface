import { Markdown } from "./Markdown.tsx";
import { ToolCallBlock } from "./ToolCallBlock.tsx";
import type { UiMessage, UiPart } from "../lib/types.ts";

function ThinkingBlock({ part }: { part: Extract<UiPart, { kind: "thinking" }> }) {
  return (
    <details className="thinking">
      <summary>
        <span className="thinking-dot" />
        <span className="tool-name">thinking</span>
      </summary>
      <div className="thinking-text">{part.text}</div>
    </details>
  );
}

export function MessageBubble({ message }: { message: UiMessage }) {
  if (message.role === "user") {
    return (
      <div className="msg-row msg-user">
        <div className="msg-bubble msg-user-bubble">{message.text}</div>
      </div>
    );
  }

  const lastTextIndex = message.parts.findLastIndex((p) => p.kind === "text");
  return (
    <div className="msg-row msg-assistant">
      <div className="msg-bubble msg-assistant-bubble">
        {message.parts.map((part, i) => {
          if (part.kind === "thinking") return <ThinkingBlock key={i} part={part} />;
          if (part.kind === "toolCall") return <ToolCallBlock key={part.id} part={part} />;
          return (
            <div key={i} className="markdown-body">
              <Markdown text={part.text} />
              {message.streaming && i === lastTextIndex && <span className="cursor" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
