import { memo, useMemo, useState } from "react";
import { highlightCode } from "../lib/highlight.ts";

const COPY_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CHECK_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/** 代码块：围栏语言显式高亮（带别名），未标注时按内容猜测；无匹配则纯文本。
 *  悬停显示语言标签 + 复制按钮（复制即整块拷贝）。 */
export const CodeBlock = memo(function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const html = useMemo(() => highlightCode(lang || undefined, text), [lang, text]);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用（权限等）：静默失败。
    }
  };

  return (
    <div className="md-code">
      <pre>
        <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
      <div className="md-code-bar">
        {lang && <span className="md-code-lang">{lang}</span>}
        <button className="md-code-copy" onClick={copy} title="复制代码">
          {copied ? CHECK_ICON : COPY_ICON}
          <span>{copied ? "已复制" : "复制"}</span>
        </button>
      </div>
    </div>
  );
});
