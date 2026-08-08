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
  const summary = toolSummary(part.name, (part.args ?? {}) as Record<string, unknown>);
  const [open, setOpen] = useState(part.state === "running");
  const outRef = useRef<HTMLDivElement>(null);
  const collapseRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(
    part.state === "running" ? undefined : 0,
  );

  // 执行中自动展开；结束后收起（与 thinking 一致），可手动点开查看。
  useEffect(() => {
    if (part.state === "running") setOpen(true);
    else setOpen(false);
  }, [part.state]);

  // 展开/收起时把容器高度过渡到内容高度。
  // 折叠动画只由 open 驱动：done 后内容更新不再重测，
  // 避免流式 message_update 把正在折叠的容器重新拉回展开（卡出空白）。
  useEffect(() => {
    const el = collapseRef.current;
    if (!el) return;
    if (!open) {
      setHeight(0);
      return;
    }
    setHeight(el.scrollHeight);
  }, [open, part.state === "running" ? part.output : null]);

  // 展开/折叠时强制外层滚动到底一次；再延迟一次覆盖展开动画结束后的最终高度。
  useEffect(() => {
    const scroll = () => document.dispatchEvent(new CustomEvent("pi:autoscroll"));
    scroll();
    const t = window.setTimeout(scroll, 260);
    return () => window.clearTimeout(t);
  }, [open]);

  // 执行中让输出区内部滚动跟随最新内容（外层滚动到此即可看到结尾）。
  useEffect(() => {
    if (part.state === "running" && outRef.current) {
      outRef.current.scrollTop = outRef.current.scrollHeight;
    }
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
          // 执行中禁用过渡：输出实时增长，外层滚动才能拿到真实高度；
          // 手动开合和结束折叠时才走平滑动画。
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
