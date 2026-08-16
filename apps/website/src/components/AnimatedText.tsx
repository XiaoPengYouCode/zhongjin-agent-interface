import { memo } from "react";
import { motion } from "motion/react";

const CJK_RE = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/;

/**
 * 拆分流式文本为动画 token：中文按字符、英文按空格词，空白保留。
 * 流式 delta 追加时新 token 挂载播放动画，已渲染 token（索引 key 稳定）
 * 复用不重播 —— 文本"渐进浮现"而不是整块弹出。
 */
export function splitTokens(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/(\s+)/)) {
    if (part === "") continue;
    if (/^\s+$/.test(part)) {
      // 空白（含换行）：统一输出为空格，保留词间距。
      out.push(" ".repeat(part.length));
      continue;
    }
    if (CJK_RE.test(part)) {
      for (const ch of part) out.push(ch);
    } else {
      out.push(part);
    }
  }
  return out;
}

/** 超过该长度不逐 token 动画，直接渲染（长文档/大代码块保性能）。 */
const MAX_ANIMATE = 2000;

/** 流式文本渐进浮现：新 token 淡入上移，已渲染 token 保持原位不动。 */
export const AnimatedText = memo(function AnimatedText({ text }: { text: string }) {
  if (text.length > MAX_ANIMATE) return text;
  const tokens = splitTokens(text);
  return (
    <>
      {tokens.map((t, i) =>
        t === " " ? (
          " "
        ) : (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            style={{ display: "inline-block" }}
          >
            {t}
          </motion.span>
        ),
      )}
    </>
  );
});
