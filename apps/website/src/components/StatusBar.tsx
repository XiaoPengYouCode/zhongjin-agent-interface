import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { fetchModelPickerState, fetchStats } from "../lib/client.ts";
import { fmtTokens, folderName } from "../lib/format.ts";
import type { ModelInfo, ModelPickerState, SessionStats } from "../lib/types.ts";

interface StatusBarProps {
  streaming: boolean;
  model: { provider: string; id: string; name: string } | null;
  sessionId: string;
  sessionFile: string | null;
  cwd: string;
  themeToggle?: ReactNode;
  onSetModel: (provider: string, id: string) => Promise<void>;
  onSetThinkingLevel: (level: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hover popover
// ---------------------------------------------------------------------------

function Popover({ trigger, card }: { trigger: ReactNode; card: ReactNode }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const openSoon = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 120);
  };
  const closeSoon = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), 180);
  };

  return (
    <div
      className="popover-wrap"
      ref={wrap}
      onMouseEnter={openSoon}
      onMouseLeave={closeSoon}
      onClick={() => setOpen((v) => !v)}
    >
      {trigger}
      {open && <div className="popover">{card}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model picker card
// ---------------------------------------------------------------------------

function ModelCard({
  onSetModel,
  onSetThinkingLevel,
}: {
  onSetModel: StatusBarProps["onSetModel"];
  onSetThinkingLevel: StatusBarProps["onSetThinkingLevel"];
}) {
  const [state, setState] = useState<ModelPickerState | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchModelPickerState()
      .then((s) => {
        setState(s);
        if (s.current) setExpanded(new Set([s.current.provider]));
      })
      .catch(() => setState(null));
  }, []);

  if (!state) {
    return <div className="popover-empty">加载中…</div>;
  }

  const byProvider = new Map<string, ModelInfo[]>();
  for (const m of state.models) {
    const list = byProvider.get(m.provider) ?? [];
    list.push(m);
    byProvider.set(m.provider, list);
  }
  const providers = [...byProvider.entries()].sort((a, b) => b[1].length - a[1].length);

  const pick = async (m: ModelInfo) => {
    setBusy(`${m.provider}/${m.id}`);
    try {
      await onSetModel(m.provider, m.id);
      const fresh = await fetchModelPickerState();
      setState(fresh);
    } finally {
      setBusy(null);
    }
  };

  const setLevel = async (level: string) => {
    await onSetThinkingLevel(level);
    setState((prev) => (prev ? { ...prev, thinking: { ...prev.thinking, current: level } } : prev));
  };

  const toggle = (provider: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
      return next;
    });
  };

  return (
    <div className="model-card">
      <div className="model-card-section">
        <div className="model-card-title">思考等级</div>
        <div className="think-row">
          {state.thinking.available.map((l) => (
            <button
              key={l}
              className={`think-chip ${l === state.thinking.current ? "active" : ""}`}
              onClick={() => setLevel(l)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="model-card-section model-list-section">
        <div className="model-card-title">模型</div>
        <div className="model-list">
          {providers.map(([provider, models]) => {
            const open = expanded.has(provider);
            return (
              <div key={provider} className="model-group">
                <button className="model-group-head" onClick={() => toggle(provider)}>
                  <span className={`group-chevron ${open ? "" : "collapsed"}`}>▾</span>
                  <span className="model-provider">{provider}</span>
                  <span className="model-count">{models.length}</span>
                </button>
                {open &&
                  models.map((m) => {
                    const active =
                      state.current?.provider === m.provider && state.current.id === m.id;
                    const key = `${m.provider}/${m.id}`;
                    return (
                      <button
                        key={key}
                        className={`model-item ${active ? "active" : ""}`}
                        onClick={() => pick(m)}
                        disabled={busy === key}
                        title={key}
                      >
                        <span className="model-name">{m.name}</span>
                        <span className="model-id">{m.id}</span>
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session stats card
// ---------------------------------------------------------------------------

function ContextRing({ percent }: { percent: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(percent, 100));
  return (
    <svg className="ctx-ring" viewBox="0 0 52 52">
      <circle className="ctx-ring-bg" cx="26" cy="26" r={r} />
      <circle
        className="ctx-ring-fg"
        cx="26"
        cy="26"
        r={r}
        strokeDasharray={`${(c * pct) / 100} ${c}`}
        transform="rotate(-90 26 26)"
      />
      <text x="26" y="29" textAnchor="middle" className="ctx-ring-text">
        {pct.toFixed(0)}%
      </text>
    </svg>
  );
}

function MiniRing({ percent }: { percent: number }) {
  const r = 6.5;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(percent, 100));
  return (
    <svg className="mini-ring" viewBox="0 0 18 18">
      <circle className="mini-ring-bg" cx="9" cy="9" r={r} />
      <circle
        className="mini-ring-fg"
        cx="9"
        cy="9"
        r={r}
        strokeDasharray={`${(c * pct) / 100} ${c}`}
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}

function StatsCard({ stats }: { stats: SessionStats | null }) {
  if (!stats) {
    return <div className="popover-empty">加载中…</div>;
  }

  const ctx = stats.contextUsage;
  return (
    <div className="stats-card">
      <div className="stats-main">
        {ctx && (
          <div className="stats-ring-wrap">
            <ContextRing percent={ctx.percent} />
            <div className="stats-ring-meta">
              <div className="stats-ring-window">{fmtTokens(ctx.contextWindow)}</div>
              <div className="stats-ring-label">上下文</div>
            </div>
          </div>
        )}
        <div className="stats-grid">
          <div className="stats-item">
            <span className="stats-k">↑ 输入</span>
            <span className="stats-v">{fmtTokens(stats.tokens.input)}</span>
          </div>
          <div className="stats-item">
            <span className="stats-k">↓ 输出</span>
            <span className="stats-v">{fmtTokens(stats.tokens.output)}</span>
          </div>
          <div className="stats-item">
            <span className="stats-k">缓存读</span>
            <span className="stats-v">{fmtTokens(stats.tokens.cacheRead)}</span>
          </div>
          <div className="stats-item">
            <span className="stats-k">缓存写</span>
            <span className="stats-v">{fmtTokens(stats.tokens.cacheWrite)}</span>
          </div>
          <div className="stats-item">
            <span className="stats-k">成本</span>
            <span className="stats-v stats-cost">${stats.cost.toFixed(4)}</span>
          </div>
          <div className="stats-item">
            <span className="stats-k">消息</span>
            <span className="stats-v">{stats.totalMessages}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

export function StatusBar({
  streaming,
  model,
  sessionId,
  sessionFile,
  cwd,
  themeToggle,
  onSetModel,
  onSetThinkingLevel,
}: StatusBarProps) {
  const [stats, setStats] = useState<SessionStats | null>(null);

  // 挂载 + 每次任务结束后刷新用量。
  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (streaming) return;
    fetchStats()
      .then(setStats)
      .catch(() => {});
  }, [streaming]);

  const ctx = stats?.contextUsage;
  return (
    <header className="statusbar">
      <span className="status-left">
        {streaming && (
          <span className="status-streaming">
            <span className="pulse-dot" /> 处理中
          </span>
        )}
      </span>
      <span className="status-right">
        {themeToggle}
        {model && (
          <Popover
            trigger={
              <span className="model-chip" title={`${model.provider}/${model.id}`}>
                {model.name ?? model.id}
              </span>
            }
            card={<ModelCard onSetModel={onSetModel} onSetThinkingLevel={onSetThinkingLevel} />}
          />
        )}
        {sessionId && (
          <Popover
            trigger={
              <span className="session-chip" title={sessionFile ?? cwd ?? undefined}>
                <span className="session-folder">{folderName(cwd)}</span>
              </span>
            }
            card={<StatsCard stats={stats} />}
          />
        )}
        {ctx && (
          <Popover
            trigger={
              <span className="ctx-chip" title="上下文占用">
                <MiniRing percent={ctx.percent} />
                <span className="ctx-pct">{ctx.percent.toFixed(0)}%</span>
              </span>
            }
            card={<StatsCard stats={stats} />}
          />
        )}
      </span>
    </header>
  );
}
