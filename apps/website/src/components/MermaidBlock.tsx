import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

/** 跟随应用亮/暗主题（data-theme 属性变化时自动切换并重渲染）。 */
function useColorScheme(): "dark" | "light" {
  const [scheme, setScheme] = useState<"dark" | "light">(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setScheme(el.dataset.theme === "light" ? "light" : "dark");
    });
    observer.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return scheme;
}

/** 元素进入视口（提前 300px 预取）才开始渲染，避免一次加载全部图表。 */
function useInView<T extends HTMLElement>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, inView];
}

/** 内容哈希：作为 mermaid 渲染 id 的一部分，主题切换/重渲染时避免 id 冲突。 */
function hashOf(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/**
 * mermaid 图表块：动态加载 mermaid（独立 chunk），进入视口后才渲染。
 * 渲染失败显示错误 + 重试按钮（保留上一次成功的 SVG）；失败也可看原文。
 */
export const MermaidBlock = memo(function MermaidBlock({ code }: { code: string }) {
  const scheme = useColorScheme();
  const [wrapRef, inView] = useInView<HTMLDivElement>();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  // 内容哈希 + 时间戳 + 随机：保证每次渲染 id 唯一，mermaid 内部不残留。
  const idRef = useRef<string>(`mmd-${hashOf(code)}`);
  const renderId = useMemo(
    () => `${idRef.current}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheme, retry],
  );

  useEffect(() => {
    if (!inView) return;
    let alive = true;
    setFailed(false);
    void (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true, // mermaid 默认会把错误 SVG 注入 DOM，关闭
          theme: scheme === "dark" ? "dark" : "default",
          fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
        });
        const { svg } = await mermaid.render(renderId, code);
        if (alive) {
          setSvg(svg);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, scheme, inView, renderId]);

  const retryRender = useCallback(() => setRetry((r) => r + 1), []);

  // 未进视口 / 加载中：固定高度占位，避免滚动时布局跳动。
  if (!svg) {
    return (
      <div className="md-mermaid-wrap" ref={wrapRef}>
        <div className="md-mermaid-loading">
          {failed ? (
            <>
              <span>图表渲染失败</span>
              <button className="md-mermaid-retry" onClick={retryRender}>
                重试
              </button>
              <details className="md-mermaid-fallback-details">
                <summary>查看原文</summary>
                <pre>
                  <code>{code}</code>
                </pre>
              </details>
            </>
          ) : (
            "⏳ 渲染图表…"
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="md-mermaid-wrap" ref={wrapRef}>
      <div className="md-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
});
