import { memo } from "react";
import { MdPsychology } from "react-icons/md";
import { ActivityBlock } from "./ActivityBlock.tsx";
import { AnimatedText } from "./AnimatedText.tsx";
import { DiffView } from "./DiffView.tsx";
import { HighlightedCommand, TerminalOutput } from "./TerminalOutput.tsx";
import { toolIcon, toolKind, toolSummary } from "../lib/tool-format.tsx";
import type { UiPart, UiToolCall } from "../lib/types.ts";

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

/** 工具调用块：ActivityBlock 外壳 + 工具专属摘要与内容渲染。 */
export const ToolCallBlock = memo(function ToolCallBlock({ part }: { part: UiToolCall }) {
  const summary = toolSummary(part.name, (part.args ?? {}) as Record<string, unknown>);
  return (
    <ActivityBlock
      icon={toolIcon(part.name)}
      name={part.name}
      summary={summary.node}
      body={<ToolBody part={part} />}
      running={part.state === "running"}
      tone={part.state}
    />
  );
});

/** 思考块：与工具调用同一 ActivityBlock 外壳。
 *  头部摘要为单行窗（只显示最新一行，流式与结束后一致）；
 *  主体为思考全文（默认收起，可手动展开查看）。 */
export const ThinkingBlock = memo(function ThinkingBlock({
  part,
  animate = false,
}: {
  part: Extract<UiPart, { kind: "thinking" }>;
  /** 流式消息时思考正文逐 token 渐进浮现。 */
  animate?: boolean;
}) {
  return (
    <ActivityBlock
      icon={<MdPsychology className="act-icon-accent" />}
      name="think"
      summary={<span className="act-summary-live">{part.text}</span>}
      body={
        <div className="act-think-body">
          {animate ? <AnimatedText text={part.text} /> : part.text}
        </div>
      }
    />
  );
});
