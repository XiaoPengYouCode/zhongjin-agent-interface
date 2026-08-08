import { useState } from "react";

interface ComposerProps {
  streaming: boolean;
  queuedFollowUps: string[];
  queuedSteers: string[];
  onPrompt: (text: string) => void;
  onSteer: (text: string) => void;
  onFollowUp: (text: string) => void;
  onPromoteToSteer: (text: string) => void;
  onAbort: () => void;
}

export function Composer({
  streaming,
  queuedFollowUps,
  queuedSteers,
  onPrompt,
  onSteer,
  onFollowUp,
  onPromoteToSteer,
  onAbort,
}: ComposerProps) {
  const [text, setText] = useState("");

  const submit = (mode: "prompt" | "steer" | "followUp") => {
    const t = text.trim();
    if (!t) return;
    if (mode === "prompt") onPrompt(t);
    else if (mode === "steer") onSteer(t);
    else onFollowUp(t);
    setText("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit(streaming ? "followUp" : "prompt");
    }
  };

  const hasQueue = queuedSteers.length > 0 || queuedFollowUps.length > 0;

  return (
    <div className="composer">
      {hasQueue && (
        <div className="queue-panel">
          {queuedSteers.map((t, i) => (
            <div className="queue-item queue-item-steer" key={`s${i}`}>
              <span className="queue-tag">steer</span>
              <span className="queue-text">{t}</span>
            </div>
          ))}
          {queuedFollowUps.map((t, i) => (
            <div className="queue-item" key={`f${i}`}>
              <span className="queue-tag">排队</span>
              <span className="queue-text">{t}</span>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => onPromoteToSteer(t)}
                title="立即以这条消息引导：打断当前任务，steer 模式发送"
              >
                引导
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="composer-row">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            streaming
              ? "输入 follow-up（排队），或点击「打断」…"
              : "输入消息，Enter 发送，Shift+Enter 换行"
          }
          rows={1}
          autoFocus
        />
        {streaming ? (
          <div className="composer-actions">
            <button className="btn btn-ghost" onClick={onAbort} title="停止当前任务">
              ⏹ 停止
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => submit("steer")}
              disabled={!text.trim()}
              title="打断当前任务并发送新指令"
            >
              打断
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => submit("followUp")}
              disabled={!text.trim()}
              title="排队发送"
            >
              排队
            </button>
          </div>
        ) : (
          <button
            className="btn-send"
            onClick={() => submit("prompt")}
            disabled={!text.trim()}
            title="发送 (Enter)"
          >
            ↑
          </button>
        )}
      </div>
    </div>
  );
}
