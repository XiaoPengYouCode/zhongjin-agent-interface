import { useEffect, useRef, useState } from "react";

interface ComposerProps {
  streaming: boolean;
  queuedFollowUps: string[];
  queuedSteers: string[];
  onPrompt: (text: string) => void;
  onFollowUp: (text: string) => void;
  onPromoteToSteer: (text: string) => void;
  onRemoveFromQueue: (text: string) => void;
  onAbort: () => void;
}

const SEND_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

const STOP_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

const GUIDE_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const TRASH_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export function Composer({
  streaming,
  queuedFollowUps,
  queuedSteers,
  onPrompt,
  onFollowUp,
  onPromoteToSteer,
  onRemoveFromQueue,
  onAbort,
}: ComposerProps) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 随输入自动增高，CSS max-height 封顶（约 10 行）。
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const trimmed = text.trim();
  // 处理中且输入框为空 → 停止；否则 → 发送（处理中时发送即排队）。
  const showStop = streaming && !trimmed;

  const onSendClick = () => {
    if (showStop) {
      onAbort();
      return;
    }
    const t = trimmed;
    if (!t) return;
    if (streaming) onFollowUp(t);
    else onPrompt(t);
    setText("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (showStop) return; // Enter 不触发停止，只点按钮
      const t = trimmed;
      if (!t) return;
      if (streaming) onFollowUp(t);
      else onPrompt(t);
      setText("");
    }
  };

  const hasQueue = queuedSteers.length > 0 || queuedFollowUps.length > 0;

  return (
    <div className="composer">
      {hasQueue && (
        <div className="queue-panel">
          {queuedSteers.map((t, i) => (
            <div className="queue-item queue-item-steer" key={`s${i}`}>
              <span className="queue-tag">引导</span>
              <span className="queue-text">{t}</span>
              <button
                className="icon-btn"
                onClick={() => onRemoveFromQueue(t)}
                title="移出队列"
              >
                {TRASH_ICON}
              </button>
            </div>
          ))}
          {queuedFollowUps.map((t, i) => (
            <div className="queue-item" key={`f${i}`}>
              <span className="queue-tag">排队</span>
              <span className="queue-text">{t}</span>
              <button
                className="icon-btn"
                onClick={() => onPromoteToSteer(t)}
                title="打断当前任务，立即发送"
              >
                {GUIDE_ICON}
              </button>
              <button
                className="icon-btn"
                onClick={() => onRemoveFromQueue(t)}
                title="移出队列"
              >
                {TRASH_ICON}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="composer-row">
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          rows={1}
          autoFocus
        />
        <button
          className="btn-send"
          onClick={onSendClick}
          disabled={!showStop && !trimmed}
          title={showStop ? "停止当前任务" : "发送"}
        >
          {showStop ? STOP_ICON : SEND_ICON}
        </button>
      </div>
    </div>
  );
}
