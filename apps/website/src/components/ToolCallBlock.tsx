import { memo, useEffect, useRef, useState } from "react";
import { DiffView } from "./DiffView.tsx";
import { HighlightedCommand, TerminalOutput } from "./TerminalOutput.tsx";
import { toolIcon, toolKind, toolSummary } from "../lib/tool-format.tsx";
import type { UiToolCall } from "../lib/types.ts";

interface EditEntry {
  oldText?: string;
  newText?: string;
}

function ToolBody({ part }: { part: UiToolCall }) {
  const args = (part.args ?? {}) as Record<string, unknown>;
  const kind = toolKind(part.name);

  if (kind === "terminal") {
    const command = String(args.command ?? "");
    return (
      <div className="tool-terminal">
        <div className="tool-terminal-command">
          <span className="tool-prompt">$</span>
          <HighlightedCommand command={command} />
        </div>
        {part.output && <TerminalOutput output={part.output} />}
        {part.state === "running" && !part.output && (
          <div className="tool-running-hint">执行中…</div>
        )}
      </div>
    );
  }

  if (kind === "edit") {
    const edits = Array.isArray(args.edits) ? (args.edits as EditEntry[]) : [];
    if (edits.length === 0) {
      return part.output ? <TerminalOutput output={part.output} /> : null;
    }
    return (
      <div className="tool-diffs">
        {edits.map((e, i) => (
          <div key={i} className="tool-diff-block">
            <div className="tool-diff-label">
              修改 {i + 1}/{edits.length}
            </div>
            <DiffView oldText={e.oldText ?? ""} newText={e.newText ?? ""} />
          </div>
        ))}
      </div>
    );
  }

  if (kind === "write") {
    const content = String(args.content ?? "");
    return <DiffView oldText="" newText={content} defaultMode="unified" />;
  }

  if (kind === "read") {
    const content = part.output || String(args.content ?? "");
    return content ? (
      <pre className="tool-output">
        <code>{content}</code>
      </pre>
    ) : null;
  }

  // 其他工具：输出原样展示。
  return part.output ? <TerminalOutput output={part.output} /> : null;
}

export const ToolCallBlock = memo(function ToolCallBlock({ part }: { part: UiToolCall }) {
  const [open, setOpen] = useState(part.state === "running");
  const outRef = useRef<HTMLDivElement>(null);

  // 执行中自动展开；结束后收起（与 thinking 一致），可手动点开查看。
  useEffect(() => {
    if (part.state === "running") setOpen(true);
    else setOpen(false);
  }, [part.state]);

  // 执行中让输出区内部滚动跟随最新内容（外层滚动到此即可看到结尾）。
  useEffect(() => {
    if (part.state === "running" && outRef.current) {
      outRef.current.scrollTop = outRef.current.scrollHeight;
    }
  }, [part.output, part.state]);

  return (
    <div className={`tool-call tool-${part.state}`}>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <span className="tool-kind-icon">{toolIcon(part.name)}</span>
          <span className="tool-name">{part.name}</span>
          <span
            className="tool-summary"
            title={toolSummary(part.name, (part.args ?? {}) as Record<string, unknown>)}
          >
            {toolSummary(part.name, (part.args ?? {}) as Record<string, unknown>)}
          </span>
          <span className="tool-state">
            {part.state === "running" ? (
              <span className="spinner" aria-label="running" />
            ) : part.state === "error" ? (
              "✕"
            ) : (
              "✓"
            )}
          </span>
        </summary>
        <div className="tool-body" ref={outRef}>
          <ToolBody part={part} />
        </div>
      </details>
    </div>
  );
});
