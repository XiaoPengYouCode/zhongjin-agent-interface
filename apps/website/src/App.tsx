import { Profiler, useMemo, type ReactNode } from "react";
import { Composer } from "./components/Composer.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { perf } from "./lib/perf.ts";
import { useTheme, type ThemeMode } from "./lib/theme.ts";
import { usePi } from "./state.ts";

/** 通用 Profiler 回调：渲染 >8ms 时上报。 */
function onRender(id: string, phase: "mount" | "update" | "nested-update", actualDuration: number) {
  perf.render(id, phase, actualDuration);
}

/** 开发模式包 Profiler 测量渲染耗时；生产环境零开销直通（Profiler 每次 commit 都有收集成本）。 */
function ProfilerWrap({ id, children }: { id: string; children: ReactNode }) {
  return import.meta.env.DEV ? (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  ) : (
    <>{children}</>
  );
}

const THEME_ORDER: ThemeMode[] = ["system", "light", "dark"];
const THEME_META: Record<ThemeMode, { icon: ReactNode; label: string }> = {
  system: {
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
    label: "跟随系统",
  },
  light: {
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    ),
    label: "亮色",
  },
  dark: {
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
    label: "暗色",
  },
};

export default function App() {
  const { state, conn, sessions, statuses, actions } = usePi();
  const [theme, setTheme] = useTheme();

  const cycleTheme = () => {
    const i = THEME_ORDER.indexOf(theme);
    setTheme(THEME_ORDER[(i + 1) % THEME_ORDER.length]);
  };

  // 引用稳定：StatusBar 是 memo 的，themeToggle 每次新建会使 memo 失效。
  const themeToggle = useMemo(
    () => (
      <button
        className="btn btn-ghost btn-xs theme-toggle"
        onClick={cycleTheme}
        title={`主题：${THEME_META[theme].label}（点击切换）`}
      >
        {THEME_META[theme].icon}
      </button>
    ),
    [theme],
  );

  // 会话标题兜底：无自定义名时用第一条用户消息（与侧边栏 titleOf 一致）。
  const fallbackTitle = useMemo(() => {
    const m = state.session?.messages.find((x) => x.role === "user");
    let text = "";
    if (m) {
      text =
        typeof m.content === "string"
          ? m.content
          : m.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    }
    return text.replace(/\s+/g, " ").trim().slice(0, 40) || "新会话";
  }, [state.session]);

  return (
    <div className="app">
      <Sidebar
        sessions={sessions}
        statuses={statuses}
        currentFile={state.session?.sessionFile ?? null}
        currentCwd={state.session?.cwd ?? null}
        conn={conn}
        onNew={actions.newSession}
        onResume={actions.resume}
        onDelete={actions.deleteSession}
      />

      <main className="chat">
        <StatusBar
          streaming={state.streaming}
          model={state.session?.model ?? null}
          sessionId={state.session?.sessionId ?? ""}
          sessionFile={state.session?.sessionFile ?? null}
          cwd={state.session?.cwd ?? ""}
          sessionName={state.session?.name ?? null}
          fallbackTitle={fallbackTitle}
          themeToggle={themeToggle}
          onSetModel={actions.setModel}
          onSetThinkingLevel={actions.setThinkingLevel}
          onRenameSession={actions.renameSession}
        />

        {state.error && (
          <div className="error-banner">
            <span>⚠ {state.error}</span>
            <button className="btn btn-ghost btn-xs" onClick={actions.clearError}>
              关闭
            </button>
          </div>
        )}

        <ProfilerWrap id="MessageList">
          <MessageList
            messages={state.messages}
            onRetract={actions.retract}
            onEditResend={actions.editResend}
          />
        </ProfilerWrap>

        <ProfilerWrap id="Composer">
          <Composer
            streaming={state.streaming}
            queuedFollowUps={state.queuedFollowUps}
            queuedSteers={state.queuedSteers}
            onPrompt={actions.prompt}
            onFollowUp={actions.followUp}
            onPromoteToSteer={actions.promoteToSteer}
            onRemoveFromQueue={actions.removeFromQueue}
            onEditQueued={actions.editQueued}
            onDemoteToFollowUp={actions.demoteToFollowUp}
            onAbort={actions.abort}
          />
        </ProfilerWrap>
      </main>
    </div>
  );
}
