import { Fragment, memo, useEffect, useRef, useState } from "react";
import { MdErrorOutline, MdPsychology } from "react-icons/md";
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

function ThinkingBlock({
  part,
  streaming,
}: {
  part: Extract<UiPart, { kind: "thinking" }>;
  streaming: boolean;
}) {
  // 流式中强制展开（单行窗）；结束后保持展开，可手动收起；历史消息默认收起。
  const [open, setOpen] = useState(streaming);
  const everStreamed = useRef(streaming);
  useEffect(() => {
    if (streaming) {
      setOpen(true);
      everStreamed.current = true;
    } else if (everStreamed.current) {
      // 流式结束：自动保持展开，避免 20px 单行窗瞬间消失造成跳动。
      setOpen(true);
    }
  }, [streaming]);

  const collapseRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(streaming ? 20 : 0);

  // 展开/收起/流式结束时把容器高度过渡到目标高度（流式期间固定 20px 单行窗，
  // 结束后动画展开到全文高度，上限 260px 由 .thinking-text 的 max-height 控制）。
  useEffect(() => {
    const el = collapseRef.current;
    if (!el) return;
    if (!open) {
      setHeight(0);
      return;
    }
    const id = requestAnimationFrame(() => setHeight(streaming ? 20 : el.scrollHeight));
    return () => cancelAnimationFrame(id);
  }, [open, streaming]);

  // 展开/收起/流式结束的高度动画由 .thinking-collapse 的 height 过渡驱动，
  // 外层自动滚动由 MessageList 的 ResizeObserver 跟随（贴底时生效），无需广播。
  return (
    <div className="thinking">
      <button className="thinking-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <MdPsychology className="thinking-icon" />
        <span className="tool-name">think</span>
      </button>
      <div
        className="thinking-collapse"
        ref={collapseRef}
        style={{
          height,
          // 流式期间固定单行窗高度，无需过渡；结束展开与手动开合走平滑动画。
          transition: streaming ? "none" : undefined,
        }}
      >
        <div className={streaming ? "thinking-text thinking-text-live" : "thinking-text"}>
          {part.text}
        </div>
      </div>
    </div>
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
          if (part.kind === "thinking") {
            // 后跟工具块的思考：挪到该工具块之后渲染（“跟在 bash 后面”），
            // 动作/输出在前、理由在后；消息末尾的思考保持原位。
            let j = i + 1;
            while (j < message.parts.length && message.parts[j].kind === "thinking") j++;
            if (j < message.parts.length && message.parts[j].kind === "toolCall") return null;
            return <ThinkingBlock key={i} part={part} streaming={message.streaming} />;
          }
          if (part.kind === "toolCall") {
            // 紧跟其后的思考块（含连续多个）：渲染在工具块之后，
            // 与前一条 defer 规则对应（思考 → 工具 在显示时变为 工具 → 思考）。
            const before: Extract<UiPart, { kind: "thinking" }>[] = [];
            for (let k = i - 1; k >= 0; k--) {
              const p = message.parts[k];
              if (p.kind !== "thinking") break;
              before.unshift(p);
            }
            return (
              <Fragment key={i}>
                <ToolCallBlock key={part.id} part={part} />
                {before.map((p, k) => (
                  <ThinkingBlock key={k} part={p} streaming={message.streaming} />
                ))}
              </Fragment>
            );
          }
          // 流式期间 content 里可能出现空的 text part：跳过，
          // 否则会作为 0 高度的“幽灵块”在工具块之间制造/吞掉间距。
          if (!part.text) return null;
          return (
            <div key={i} className="markdown-body">
              <Markdown text={part.text} streaming={message.streaming} />
            </div>
          );
        })}
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
