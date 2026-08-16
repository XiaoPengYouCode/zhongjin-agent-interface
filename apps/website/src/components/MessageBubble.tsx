import { memo, useState, type ReactNode } from "react";
import { MdErrorOutline } from "react-icons/md";
import { Markdown } from "./Markdown.tsx";
import { ThinkingBlock, ToolCallBlock } from "./ToolCallBlock.tsx";
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
          <div className="msg-bubble msg-user-bubble">{message.text}</div>
        )}
        {entryId && !editing && (
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
    </div>
  );
}

/**
 * 把 parts 渲染为平铺序列（不做嵌套 Fragment）：
 * - defer 规则（think 后跟 bash 时，think 移到 bash 后面）保持；
 * - 每个块用「原始 part 索引」作稳定 key：流式中 bash 出现导致 think 换位时，
 *   React 按 key 移动 DOM 而非卸载重挂载 → 折叠状态/高度动画不丢失、不错位。
 */
function renderParts(message: UiMessage): ReactNode[] {
  const parts = message.parts;
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.kind === "thinking") {
      // 后跟工具块的思考：挪到该工具块之后渲染（“跟在 bash 后面”），
      // 动作/输出在前、理由在后；消息末尾的思考保持原位。
      let j = i + 1;
      while (j < parts.length && parts[j].kind === "thinking") j++;
      if (j < parts.length && parts[j].kind === "toolCall") continue;
      out.push(<ThinkingBlock key={`t${i}`} part={part} animate={message.streaming} />);
      continue;
    }
    if (part.kind === "toolCall") {
      // 紧跟其后的思考块（含连续多个）：渲染在工具块之后，
      // 与前一条 defer 规则对应（思考 → 工具 在显示时变为 工具 → 思考）。
      const before: Extract<UiPart, { kind: "thinking" }>[] = [];
      for (let k = i - 1; k >= 0; k--) {
        const p = parts[k];
        if (p.kind !== "thinking") break;
        before.unshift(p);
      }
      out.push(<ToolCallBlock key={part.id} part={part} />);
      before.forEach((p, k) => {
        // 原始索引 key：与未 defer 时的 key 一致，换位不重挂载。
        out.push(
          <ThinkingBlock key={`t${i - before.length + k}`} part={p} animate={message.streaming} />,
        );
      });
      continue;
    }
    // 流式期间 content 里可能出现空的 text part：跳过，
    // 否则会作为 0 高度的“幽灵块”在工具块之间制造/吞掉间距。
    if (!part.text) continue;
    out.push(
      <div key={`m${i}`} className="markdown-body">
        <Markdown text={part.text} animate={message.streaming} />
      </div>,
    );
  }
  return out;
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
        {renderParts(message)}
        {message.error && (
          <div className="msg-error" role="alert">
            <MdErrorOutline className="msg-error-icon" />
            <span className="msg-error-text">{message.error}</span>
          </div>
        )}
      </div>
    </div>
  );
});
