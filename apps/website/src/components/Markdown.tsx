import { memo } from "react";
import MdRenderer from "marked-react";

/**
 * Markdown 渲染：marked-react（marked 的 React 封装）。
 * - 比 remark 系渲染器快约一个数量级（实测 2.3ms vs 38ms / 24KB 文档）
 * - 渲染真实 React 元素（无 dangerouslySetInnerHTML），HTML 转纯文本（无 XSS 面）
 * - gfm 开启 GitHub 风格（表格/删除线/任务列表）
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return <MdRenderer value={text} gfm />;
});
