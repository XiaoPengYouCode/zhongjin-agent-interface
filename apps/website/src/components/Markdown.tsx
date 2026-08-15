import { memo, useRef, type ReactNode } from "react";
import MdRenderer from "marked-react";

/**
 * Markdown 渲染：marked-react（marked 的 React 封装）。
 * - 比 remark 系渲染器快约一个数量级（实测 2.3ms vs 38ms / 24KB 文档）
 * - 渲染真实 React 元素（无 dangerouslySetInnerHTML），HTML 转纯文本（无 XSS 面）
 * - gfm 开启 GitHub 风格（表格/删除线/任务列表）
 *
 * 流式（streaming=true）时按行增量渲染：已完结的行渲染为 React 元素并缓存，
 * 行文本不变 → 元素引用复用 → 不重渲染；每帧只渲染最后一行，DOM 只追加。
 * 跨行的 markdown 结构（列表/代码块/表格）在流式期间按行粗略呈现，
 * 流结束（message_end → streaming=false）后全量渲染一次得到标准结构。
 */

/** 单行超过该长度时跳过行内 markdown 解析，直接纯文本（大 JSON 单行等）。 */
const LINE_MAX = 4096;

function renderLine(text: string): ReactNode {
  if (text.length > LINE_MAX) return text;
  return <MdRenderer value={text} gfm />;
}

function StreamingMarkdown({ text }: { text: string }) {
  // 已完结行的 React 元素缓存：跨渲染复用同一批元素引用（key 按行号），
  // React diff 时引用相同 → 跳过；新完结的行 push 追加，DOM 只增不改。
  const cache = useRef<ReactNode[]>([]);
  const doneCount = useRef(0);

  const lines = text.split("\n");
  const done = lines.length - 1; // 最后一行视为活跃行（可能继续增长）

  let cached = cache.current;
  if (done < doneCount.current) {
    // 文本被整体缩短/替换（编辑重发等）：作废缓存整体重建。
    cached = [];
    cache.current = cached;
    doneCount.current = 0;
  }
  if (done > doneCount.current) {
    for (let i = doneCount.current; i < done; i++) {
      const line = lines[i];
      cached.push(
        <div key={i} className="md-line">
          {line ? renderLine(line) : null}
        </div>,
      );
    }
    doneCount.current = done;
  }

  const live = lines[lines.length - 1];
  return (
    <div className="md-stream">
      {cached}
      <div className="md-line md-live">{live ? renderLine(live) : null}</div>
    </div>
  );
}

export const Markdown = memo(function Markdown({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  if (streaming) return <StreamingMarkdown text={text} />;
  return <MdRenderer value={text} gfm />;
});
