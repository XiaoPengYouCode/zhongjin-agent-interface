import { memo, useEffect, useState } from "react";
import { MdPsychology } from "react-icons/md";
import { Markdown } from "./Markdown.tsx";
import { ToolCallBlock } from "./ToolCallBlock.tsx";
import type { UiMessage, UiPart } from "../lib/types.ts";

const EDIT_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);

const TRASH_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

const CHECK_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const CLOSE_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

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
        <MdPsychology className="thinking-icon" />
        <span className="tool-name">thinking</span>
      </summary>
      <div className={streaming ? "thinking-text thinking-text-live" : "thinking-text"}>
        {part.text}
      </div>
    </details>
  );
}

interface UserMessageProps {
  message: UiMessage;
  onRetract: (entryId: string) => void;
  onEditResend: (entryId: string, text: string) => void;
}

function UserMessage({ message, onRetract, onEditResend }: UserMessageProps) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const entryId = message.entryId;

  const save = () => {
    const t = editText.trim();
    if (t && entryId && t !== message.text) onEditResend(entryId, t);
    setEditing(false);
  };

  return (
    <div className="msg-row msg-user">
      <div className="msg-user-wrap">
        {editing ? (
          <div className="msg-user-bubble msg-user-edit">
            <textarea
              className="msg-user-edit-input"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  save();
                } else if (e.key === "Escape") {
                  setEditing(false);
                }
              }}
              autoFocus
              rows={Math.min(8, Math.max(2, editText.split("\n").length))}
            />
            <div className="msg-user-edit-actions">
              <button className="icon-btn" onClick={save} title="保存 (⌘+Enter)">
                {CHECK_ICON}
              </button>
              <button className="icon-btn" onClick={() => setEditing(false)} title="取消 (Esc)">
                {CLOSE_ICON}
              </button>
            </div>
          </div>
        ) : (
          <div className="msg-bubble msg-user-bubble">
            {message.text}
            {entryId && (
              <div className="msg-user-actions">
                <button
                  className="icon-btn"
                  onClick={() => {
                    setEditText(message.text);
                    setEditing(true);
                  }}
                  title="编辑并重发"
                >
                  {EDIT_ICON}
                </button>
                <button
                  className="icon-btn"
                  onClick={() => onRetract(entryId)}
                  title="撤回该消息及之后的对话"
                >
                  {TRASH_ICON}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(function MessageBubble({
  message,
  onRetract,
  onEditResend,
}: {
  message: UiMessage;
  onRetract: (entryId: string) => void;
  onEditResend: (entryId: string, text: string) => void;
}) {
  if (message.role === "user") {
    return <UserMessage message={message} onRetract={onRetract} onEditResend={onEditResend} />;
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
