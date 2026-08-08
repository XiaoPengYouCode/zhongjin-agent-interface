import { useEffect, useState } from "react";
import { toolArgsPreview } from "../lib/format.ts";
import type { UiToolCall } from "../lib/types.ts";

export function ToolCallBlock({ part }: { part: UiToolCall }) {
  const [open, setOpen] = useState(part.state === "running" || part.output.length > 0);

  useEffect(() => {
    if (part.state === "running") setOpen(true);
  }, [part.state]);

  return (
    <div className={`tool-call tool-${part.state}`}>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <span className={`tool-dot tool-${part.state}`} />
          <span className="tool-name">{part.name}</span>
          <span className="tool-args">{toolArgsPreview(part.args)}</span>
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
        {part.output && (
          <pre className="tool-output">
            <code>{part.output}</code>
          </pre>
        )}
        {part.state === "running" && !part.output && (
          <div className="tool-running-hint">执行中…</div>
        )}
      </details>
    </div>
  );
}
