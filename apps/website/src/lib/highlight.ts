import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import typescript from "highlight.js/lib/languages/typescript";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import python from "highlight.js/lib/languages/python";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import cpp from "highlight.js/lib/languages/cpp";
import c from "highlight.js/lib/languages/c";
import java from "highlight.js/lib/languages/java";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import markdown from "highlight.js/lib/languages/markdown";
import sql from "highlight.js/lib/languages/sql";
import csharp from "highlight.js/lib/languages/csharp";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import ini from "highlight.js/lib/languages/ini";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("python", python);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("c", c);
hljs.registerLanguage("java", java);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("ini", ini);

const ALIASES: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsonc: "json",
  yml: "yaml",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  "c++": "cpp",
  "c#": "csharp",
  cs: "csharp",
  html: "xml",
  vue: "xml",
  md: "markdown",
  dockerfile: "dockerfile",
  toml: "ini",
  ini: "ini",
};

/** 从代码片段首行猜语言（无语言标注时的兜底）。 */
function detectLanguage(text: string): string | undefined {
  const first = text.split("\n").find((l) => l.trim().length > 0) ?? "";
  const trimmed = first.trim();
  if (trimmed.startsWith("#!")) return "bash";
  const match = /\.(\w+)$/.exec(text.trim().split("\n")[0] ?? "");
  if (!match) return undefined;
  return ALIASES[match[1]] ?? match[1];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * 语法高亮：显式 lang 优先（带别名映射），否则按内容猜测。
 * 返回高亮 HTML；语言不可用时返回转义后的纯文本。
 */
export function highlightCode(lang: string | undefined, text: string): string {
  const resolved = lang ? (ALIASES[lang] ?? lang) : detectLanguage(text);
  if (!resolved) return escapeHtml(text);
  try {
    return hljs.highlight(text, { language: resolved }).value;
  } catch {
    return escapeHtml(text);
  }
}
