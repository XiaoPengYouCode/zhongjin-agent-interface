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
        {part.output && <TerminalOutput output={part.output} live={part.state === "running"} />}
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
  const summary = toolSummary(part.name, (part.args ?? {}) as Record<string, unknown>);
  const [open, setOpen] = useState(part.state === "running");
  const outRef = useRef<HTMLDivElement>(null);
  const collapseRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(
    part.state === "running" ? undefined : 0,
  );

  // 执行中自动展开；结束后保持展开（不自动收起——连续工具调用时反复
  // 展开/收起是“忽闪忽闪”的主因），用户可手动折叠。
  useEffect(() => {
    if (part.state === "running") setOpen(true);
  }, [part.state]);

  // 高度：执行中不设高度（自然高度，输出实时增长无需逐 chunk 测量）；
  // 非执行中展开时测量内容高度（供折叠动画使用），折叠时归零。
  // 折叠优先于 running：执行中用户手动收起也应生效（否则收起后又被拽开）。
  useEffect(() => {
    const el = collapseRef.current;
    if (!el) return;
    if (!open) {
      setHeight(0);
      return;
    }
    if (part.state === "running") {
      setHeight(undefined);
      return;
    }
    const id = requestAnimationFrame(() => setHeight(el.scrollHeight));
    return () => cancelAnimationFrame(id);
  }, [open, part.state]);

  // 展开/折叠时强制外层滚动到底一次；再延迟一次覆盖展开动画结束后的最终高度。
  useEffect(() => {
    const scroll = () => document.dispatchEvent(new CustomEvent("pi:autoscroll"));
    scroll();
    const t = window.setTimeout(scroll, 260);
    return () => window.clearTimeout(t);
  }, [open]);

  // 执行中让输出区内部滚动跟随最新内容（外层滚动到此即可看到结尾）。
  // 移入 rAF：避免每 chunk 同步写 scrollTop 强制布局。
  useEffect(() => {
    if (part.state !== "running") return;
    const id = requestAnimationFrame(() => {
      if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [part.output, part.state]);

  return (
    <div className={`tool-call tool-${part.state}`}>
      <button className="tool-call-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="tool-kind-icon">{toolIcon(part.name)}</span>
        <span className="tool-name">{part.name}</span>
        <span className="tool-summary" title={summary.text}>
          {summary.node}
        </span>
        {part.state === "running" && <span className="spinner" aria-label="running" />}
      </button>
      <div
        className="tool-body-collapse"
        ref={collapseRef}
        style={{
          height,
          // 执行中不设高度（自然高度），无需过渡；
          // 手动开合（非执行中）才走平滑动画。
          transition: part.state === "running" ? "none" : undefined,
        }}
      >
        <div className="tool-body" ref={outRef}>
          <ToolBody part={part} />
        </div>
      </div>
    </div>
  );
});
