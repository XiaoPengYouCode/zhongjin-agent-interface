import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { pickFolder } from "../lib/fs.ts";
import { timeAgo } from "../lib/format.ts";
import type { SessionInfo, SessionStatus } from "../lib/types.ts";

interface SidebarProps {
  sessions: SessionInfo[];
  /** WS 实时推送的会话状态（按会话文件路径），优先于 sessions 查询里的快照。 */
  statuses: Record<string, SessionStatus>;
  currentFile: string | null;
  currentCwd: string | null;
  onNew: (cwd?: string) => void;
  onResume: (path: string) => void;
  onDelete: (path: string) => void;
}

function titleOf(s: SessionInfo): string {
  if (s.name) return s.name;
  if (s.firstMessage) return s.firstMessage.replace(/\s+/g, " ").slice(0, 40);
  return "新会话";
}

function folderLabel(cwd: string): string {
  if (!cwd) return "（未知目录）";
  const parts = cwd.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : cwd;
}

/** Group the (already most-recent-first) session list by working directory. */
function groupByFolder(sessions: SessionInfo[]): Array<{ cwd: string; items: SessionInfo[] }> {
  const groups: Array<{ cwd: string; items: SessionInfo[] }> = [];
  const index = new Map<string, { cwd: string; items: SessionInfo[] }>();
  for (const s of sessions) {
    const cwd = s.cwd || "";
    let group = index.get(cwd);
    if (!group) {
      group = { cwd, items: [] };
      index.set(cwd, group);
      groups.push(group);
    }
    group.items.push(s);
  }
  return groups;
}

function NewSessionButton({ onPicked }: { onPicked: (cwd?: string) => void }) {
  const [picking, setPicking] = useState(false);

  const handleClick = async () => {
    if (picking) return;
    setPicking(true);
    try {
      const path = await pickFolder();
      if (path) onPicked(path);
      // Cancelled: do nothing.
    } catch {
      // Dialog error — ignore.
    } finally {
      setPicking(false);
    }
  };

  return (
    <button
      className="btn btn-new"
      onClick={handleClick}
      disabled={picking}
      title={picking ? "正在选择文件夹…" : "新建会话：选择工作目录"}
    >
      {picking ? "…" : "＋ 新建"}
    </button>
  );
}

function SessionIndicator({ status }: { status: SessionStatus }) {
  if (status.running) {
    return (
      <span className="session-indicator session-spinner" title="运行中" aria-label="运行中" />
    );
  }
  if (status.error) {
    return <span className="session-indicator session-dot session-dot-error" title="运行出错" />;
  }
  if (status.review) {
    return <span className="session-indicator session-dot session-dot-review" title="待查看" />;
  }
  return null;
}

const TRASH_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

/** 删除按钮：两步确认（先点变红色“确认?”，3 秒内再点执行），防止误删。 */
function SessionDeleteButton({ onDelete }: { onDelete: () => void }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const click = () => {
    if (!armed) {
      setArmed(true);
      timer.current = window.setTimeout(() => setArmed(false), 3000);
      return;
    }
    window.clearTimeout(timer.current);
    onDelete();
  };

  return (
    <button
      className={`session-del ${armed ? "armed" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        click();
      }}
      title={armed ? "再次点击确认删除" : "删除会话（移入废纸篓）"}
      aria-label={armed ? "确认删除会话" : "删除会话"}
    >
      {armed ? "确认?" : TRASH_ICON}
    </button>
  );
}

export const Sidebar = memo(function Sidebar({
  sessions,
  statuses,
  currentFile,
  currentCwd,
  onNew,
  onResume,
  onDelete,
}: SidebarProps) {
  const [query, setQuery] = useState("");
  // 每分钟重渲染一次，让会话相对时间（timeAgo）保持新鲜。
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNow((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);
  // Groups the user manually expanded (persisted). The group containing the
  // active session is always shown expanded.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("pi-web-expanded-groups");
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const groups = groupByFolder(sessions);

  useEffect(() => {
    try {
      localStorage.setItem("pi-web-expanded-groups", JSON.stringify([...expanded]));
    } catch {
      // Ignore persistence errors.
    }
  }, [expanded]);

  const isGroupOpen = (cwd: string) => expanded.has(cwd) || cwd === currentCwd;

  const toggleGroup = (cwd: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cwd)) next.delete(cwd);
      else next.add(cwd);
      return next;
    });
  };

  // Filter groups by session title or folder path, then hide empty ones.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (s) => titleOf(s).toLowerCase().includes(q) || g.cwd.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand">
          <span className="brand-mark">π</span>
          <span className="brand-name">Pi Web</span>
        </div>
        <div className="sidebar-head-actions">
          <Link
            to="/settings"
            className="btn btn-ghost btn-xs sidebar-settings-btn"
            title="设置"
            aria-label="设置"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
          <NewSessionButton onPicked={onNew} />
        </div>
      </div>

      <div className="session-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索会话或目录…"
          spellCheck={false}
        />
      </div>

      <div className="session-list">
        {filtered.length === 0 && (
          <div className="session-empty">
            {sessions.length === 0 ? "还没有会话" : "没有匹配的会话"}
          </div>
        )}
        {filtered.map((group) => {
          const open = isGroupOpen(group.cwd);
          return (
            <div key={group.cwd} className="session-group">
              <div className="session-group-head-row">
                <button
                  className="session-group-head"
                  title={group.cwd}
                  onClick={() => toggleGroup(group.cwd)}
                >
                  <span className={`group-chevron ${open ? "" : "collapsed"}`}>▾</span>
                  <svg
                    className="folder-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="folder-name">{folderLabel(group.cwd)}</span>
                </button>
                <span className="folder-count">{group.items.length}</span>
                <button
                  className="group-new"
                  onClick={() => onNew(group.cwd)}
                  aria-label="在此文件夹新建会话"
                  title="在此文件夹新建会话"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </div>
              {open &&
                group.items.map((s) => {
                  const status = statuses[s.path] ?? s.status;
                  return (
                    <div
                      key={s.path}
                      className={`session-item ${s.path === currentFile ? "active" : ""}`}
                    >
                      <button
                        className="session-item-main"
                        onClick={() => onResume(s.path)}
                        title={s.path}
                      >
                        <div className="session-title">{titleOf(s)}</div>
                        <div className="session-time">{timeAgo(s.modified)}</div>
                      </button>
                      {status && <SessionIndicator status={status} />}
                      <SessionDeleteButton onDelete={() => onDelete(s.path)} />
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>
    </aside>
  );
});
