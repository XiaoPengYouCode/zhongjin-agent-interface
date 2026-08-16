import { memo, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * 活动块（Activity）：think 与工具调用共用的统一外壳。
 *
 * 头部一行：图标 + 名称 + 单行摘要 + [spinner]；主体可折叠。
 * 任何状态下都不自动展开（执行中也不），会话区高度稳定不跳动；
 * 展开/收起完全由用户手动控制。
 */
export const ActivityBlock = memo(function ActivityBlock({
  icon,
  name,
  summary,
  body,
  running = false,
  tone,
}: {
  icon: ReactNode;
  name: string;
  summary: ReactNode;
  body: ReactNode;
  running?: boolean;
  /** 状态着色：running=橙 / done=绿 / error=红；不传则中性灰。 */
  tone?: "running" | "done" | "error";
}) {
  const [open, setOpen] = useState(false);
  const outRef = useRef<HTMLDivElement>(null);
  const collapseRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(0);

  // 高度：执行中不设高度（自然高度，输出实时增长无需逐 chunk 测量）；
  // 非执行中展开时测量内容高度（供折叠动画使用），折叠时归零。
  // 手动展开优先于 running：执行中用户展开即看实时输出。
  useEffect(() => {
    const el = collapseRef.current;
    if (!el) return;
    if (!open) {
      setHeight(0);
      return;
    }
    if (running) {
      setHeight(undefined);
      return;
    }
    const id = requestAnimationFrame(() => setHeight(el.scrollHeight));
    return () => cancelAnimationFrame(id);
  }, [open, running]);

  // 执行中让输出区内部滚动跟随最新内容（外层滚动到此即可看到结尾）。
  // 移入 rAF：避免每 chunk 同步写 scrollTop 强制布局。
  useEffect(() => {
    if (!running) return;
    const id = requestAnimationFrame(() => {
      if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [running, body]);

  return (
    <div className={`act act-${tone ?? "idle"}`}>
      <button className="act-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="act-icon">{icon}</span>
        <span className="tool-name">{name}</span>
        <span className="act-summary">{summary}</span>
        {running && <span className="spinner" aria-label="running" />}
      </button>
      <div
        className="act-body-collapse"
        ref={collapseRef}
        style={{
          height,
          // 执行中不设高度（自然高度），无需过渡；
          // 手动开合（非执行中）才走平滑动画。
          transition: running ? "none" : undefined,
        }}
      >
        <div className="act-body" ref={outRef}>
          {body}
        </div>
      </div>
    </div>
  );
});
