/**
 * 性能观测：`localStorage.setItem("pi-web-perf", "1")` 后开启。
 * 纯前端观测，输出到 console（不上报服务端）：
 * - 关键路径耗时（WS 事件处理）
 * - React Profiler 渲染耗时（哪个组件渲染慢）
 * longtask 观测已移除：Chrome 的 attribution 拿不到调用树，容易误导。
 */
const enabled = typeof localStorage !== "undefined" && localStorage.getItem("pi-web-perf") === "1";

let markSeq = 0;

function out(label: string, dur: number): void {
  if (dur < 8) return;
  console.warn(`[perf] ${label}: ${dur.toFixed(1)}ms`);
}

export const perf = {
  get on(): boolean {
    return enabled;
  },
  /** 开始一个测量段。 */
  mark(): string {
    if (!enabled) return "";
    const name = `p${++markSeq}`;
    performance.mark(name);
    return name;
  },
  /** 结束测量段并输出耗时。 */
  end(start: string, label: string): void {
    if (!enabled || !start) return;
    performance.measure(label, start);
    const entries = performance.getEntriesByName(label);
    const e = entries[entries.length - 1];
    if (e) out(label, e.duration);
  },
  /** 记录 React Profiler 渲染耗时。 */
  render(id: string, phase: string, duration: number): void {
    if (!enabled) return;
    out(`render:${id}:${phase}`, duration);
  },
};
