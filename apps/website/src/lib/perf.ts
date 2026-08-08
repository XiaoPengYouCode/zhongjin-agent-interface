/**
 * 性能观测：`localStorage.setItem("pi-web-perf", "1")` 后开启。
 * - 监听 long task（>50ms 主线程阻塞任务）
 * - 关键路径打点（WS 事件处理、消息构建等），>8ms 时记录
 * 数据批量上报到服务端日志（POST /api/perf），直接 tail 服务端日志即可查看。
 */
const enabled = typeof localStorage !== "undefined" && localStorage.getItem("pi-web-perf") === "1";

interface PerfEntry {
  label: string;
  dur: number;
  ts: number;
}

const buffer: PerfEntry[] = [];
let flushTimer: number | undefined;
let markSeq = 0;

function push(label: string, dur: number): void {
  if (dur < 8) return; // 只记录有意义的耗时
  buffer.push({ label, dur, ts: Date.now() });
  if (flushTimer === undefined) {
    flushTimer = window.setTimeout(() => {
      flushTimer = undefined;
      flush();
    }, 2000);
  }
}

function flush(): void {
  if (buffer.length === 0) return;
  const batch = buffer.splice(0);
  fetch("/api/perf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entries: batch }),
  }).catch(() => {
    // 上报失败不影响功能，丢弃
  });
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
  /** 结束测量段并记录耗时。 */
  end(start: string, label: string): void {
    if (!enabled || !start) return;
    performance.measure(label, start);
    const entries = performance.getEntriesByName(label);
    const e = entries[entries.length - 1];
    if (e) push(label, e.duration);
  },
};

/** 监听长任务（>50ms），定位主线程卡顿来源。 */
export function initPerfObserver(): void {
  if (!enabled || typeof PerformanceObserver === "undefined") return;
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const attr = (
          e as unknown as { attribution?: Array<{ containerType?: string; name?: string }> }
        ).attribution
          ?.map((a) => a.containerType || a.name || "")
          .filter(Boolean)
          .join(",");
        push(`longtask${attr ? `(${attr})` : ""}`, e.duration);
      }
    });
    po.observe({ entryTypes: ["longtask"] });
  } catch {
    // 环境不支持时静默
  }
}
