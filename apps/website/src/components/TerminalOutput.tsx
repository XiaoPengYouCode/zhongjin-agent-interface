import { useLayoutEffect, useMemo, useRef } from "react";
import anser from "anser";
import { highlightCode } from "../lib/highlight.ts";

/** bash 命令摘要行：语法高亮（无 ANSI，纯命令）。 */
export function HighlightedCommand({ command }: { command: string }) {
  const html = useMemo(() => highlightCode(undefined, command), [command]);
  return (
    <code className="tool-command" dangerouslySetInnerHTML={{ __html: html }} title={command} />
  );
}

/** 先转义再交给 anser，防止 bash 输出中的 HTML 被注入。 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toHtml(s: string): string {
  return anser.ansiToHtml(escapeHtml(s), { use_classes: false });
}

/**
 * 尾部缓冲长度：容纳未完成的 ANSI 转义序列（SGR 最长约 20 字节）。
 * 流式增量渲染时末尾若干字符暂不渲染，等下一帧拼上后续内容再解析，
 * 避免 `\x1b[31` 这类半截序列被 anser 当普通文本输出。
 */
const TAIL = 32;

/**
 * bash 执行输出：ANSI 色码渲染。
 * 流式（live=true）时增量追加：只解析新增部分并 insertAdjacentHTML，
 * 已渲染的 DOM 节点不被重建（全量重建是长输出卡顿的主因）。
 * 输出被整体替换（编辑/重置）时自动检测并重建。
 */
export function TerminalOutput({ output, live = false }: { output: string; live?: boolean }) {
  const codeRef = useRef<HTMLElement>(null);
  const rendered = useRef(0); // 已渲染的 output 字符数（不含尾缓冲）
  const tail = useRef(""); // 未渲染的尾部缓冲
  const prev = useRef(""); // 上一帧的 output（前缀校验）

  useLayoutEffect(() => {
    const el = codeRef.current;
    if (!el) return;
    const prevText = prev.current;
    prev.current = output;
    // 内容被整体替换（append-only 之外的场景）：重建整个 DOM。
    const appended =
      output.length >= prevText.length && output.slice(0, prevText.length) === prevText;
    if (!appended) {
      el.innerHTML = "";
      rendered.current = 0;
      tail.current = "";
    }
    let pending = tail.current + output.slice(rendered.current);
    if (!pending) return;
    if (live && pending.length > TAIL) {
      const cut = pending.length - TAIL;
      tail.current = pending.slice(cut);
      pending = pending.slice(0, cut);
    } else {
      tail.current = "";
    }
    if (pending) el.insertAdjacentHTML("beforeend", toHtml(pending));
    rendered.current = output.length - tail.current.length;
  }, [output, live]);

  return (
    <pre className="tool-output">
      <code ref={codeRef} />
    </pre>
  );
}
