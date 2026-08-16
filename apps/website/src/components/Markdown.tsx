import { memo, useMemo } from "react";
import MdRenderer from "marked-react";
import remend from "remend";
import { CodeBlock } from "./CodeBlock.tsx";
import { MermaidBlock } from "./MermaidBlock.tsx";

/**
 * Markdown 渲染：marked-react（marked 的 React 封装）。
 * - 比 remark 系渲染器快约一个数量级（实测 2.3ms vs 38ms / 24KB 文档）
 * - 渲染真实 React 元素（无 dangerouslySetInnerHTML），HTML 转纯文本（无 XSS 面）
 * - gfm 开启 GitHub 风格（表格/删除线/任务列表）
 *
 * 流式（streaming=true）增量渲染：先把文本切成顶层段（正文段 / 围栏代码块），
 * 已完成段一次性渲染并缓存（引用稳定，React.memo 跳过）；只有最后一段随流式
 * 增长而重渲染。代码块在围栏闭合的下一行就成型为 <pre><code> 并带语法高亮，
 * 不再“结尾才变回正经渲染”，流式与终态结构一致 → 结束时无跳变。
 *
 * mermaid 围栏（```mermaid）闭合后异步渲染为图表，流式中先按代码块展示。
 */

/** 单行超过该长度时跳过行内 markdown 解析，直接纯文本（大 JSON 单行等）。 */
const LINE_MAX = 4096;

// ---------------------------------------------------------------------------
// 段切分（正文 / 围栏代码块）
// ---------------------------------------------------------------------------

type Seg =
  | { type: "md"; text: string }
  | { type: "code"; lang: string; text: string; open: boolean };

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*([\w+#.-]*)[ \t]*$/;

export function splitSegments(text: string): Seg[] {
  const segs: Seg[] = [];
  let md: string[] = [];
  let code: { lines: string[]; lang: string; marker: string } | null = null;

  const flushMd = () => {
    if (md.length === 0) return;
    segs.push({ type: "md", text: md.join("\n") });
    md = [];
  };
  const flushCode = (open: boolean) => {
    if (!code) return;
    segs.push({ type: "code", lang: code.lang, text: code.lines.join("\n"), open });
    code = null;
  };

  for (const line of text.split("\n")) {
    const m = FENCE_RE.exec(line);
    if (code) {
      if (m && m[1][0] === code.marker[0] && m[1].length >= code.marker.length) {
        flushCode(false);
      } else {
        code.lines.push(line);
      }
    } else if (m) {
      flushMd();
      code = { lines: [], lang: m[2], marker: m[1] };
    } else {
      md.push(line);
    }
  }
  flushCode(true);
  flushMd();
  return segs;
}

// ---------------------------------------------------------------------------
// 段渲染
// ---------------------------------------------------------------------------

/** 已完成正文段：整段一次性解析（缓存，内容不变则不重渲染）。 */
function MdBlock({ text }: { text: string }) {
  return useMemo(() => <MdRenderer value={text} gfm />, [text]);
}

/**
 * 流式正文段（始终用于最后一段，终态也用它，保证结束时无结构切换）：
 * 已完成部分整段渲染（列表/表格/标题结构正确），最后一行作为“活行”——
 * 先用 remend 补全未闭合语法（**text → **text**）再渲染，行内格式流式中即时生效；
 * 行补全后并入整段，结构不变。
 */
function LiveMdBlock({ text }: { text: string }) {
  const nl = text.lastIndexOf("\n");
  const head = nl === -1 ? "" : text.slice(0, nl);
  const live = nl === -1 ? text : text.slice(nl + 1);
  const headNode = useMemo(() => (head ? <MdRenderer value={head} gfm /> : null), [head]);
  const liveNode = useMemo(() => {
    if (!live) return null;
    if (live.length > LINE_MAX) return live;
    // 补全未闭合的行内语法（链接用纯文本模式，避免占位协议可点击）。
    return <MdRenderer value={remend(live, { linkMode: "text-only" })} gfm />;
  }, [live]);
  return (
    <>
      {headNode}
      {liveNode != null && <div className="md-live">{liveNode}</div>}
    </>
  );
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  const segs = useMemo(() => splitSegments(text), [text]);
  return (
    <>
      {segs.map((seg, i) => {
        const last = i === segs.length - 1;
        if (seg.type === "code") {
          // mermaid 围栏闭合后才出图；流式中的未闭合围栏先按代码块展示。
          if (seg.lang === "mermaid" && !seg.open) {
            return <MermaidBlock key={i} code={seg.text} />;
          }
          return <CodeBlock key={i} lang={seg.lang} text={seg.text} />;
        }
        if (last) return <LiveMdBlock key={i} text={seg.text} />;
        return <MdBlock key={i} text={seg.text} />;
      })}
    </>
  );
});
