import { useMemo } from "react";
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

/** bash 执行输出：ANSI 色码渲染。 */
export function TerminalOutput({ output }: { output: string }) {
  const html = useMemo(
    () => anser.ansiToHtml(escapeHtml(output), { use_classes: false }),
    [output],
  );
  return (
    <pre className="tool-output">
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}
