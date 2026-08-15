import { useLayoutEffect, useMemo, useRef } from "react";
import anser from "anser";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import python from "highlight.js/lib/languages/python";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("python", python);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);

/** 给代码片段挑一个合适的语言做高亮。 */
function pickLanguage(text: string): string | undefined {
  const first = text.split("\n").find((l) => l.trim().length > 0) ?? "";
  const trimmed = first.trim();
  if (trimmed.startsWith("#!")) return "bash";
  if (trimmed.startsWith("```")) return undefined;
  const match = /\.(\w+)$/.exec(text.trim().split("\n")[0] ?? "");
  if (!match) return undefined;
  switch (match[1]) {
    case "ts":
    case "tsx":
      return "typescript";
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return "javascript";
    case "json":
    case "jsonc":
      return "json";
    case "yaml":
    case "yml":
      return "yaml";
    case "py":
      return "python";
    case "go":
      return "go";
    case "rs":
      return "rust";
    case "sh":
    case "bash":
      return "bash";
    default:
      return undefined;
  }
}

function highlight(text: string): string {
  const lang = pickLanguage(text);
  if (!lang) return text;
  try {
    return hljs.highlight(text, { language: lang }).value;
  } catch {
    return text;
  }
}

/** bash 命令摘要行：语法高亮（无 ANSI，纯命令）。 */
export function HighlightedCommand({ command }: { command: string }) {
  const html = useMemo(() => highlight(command), [command]);
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
