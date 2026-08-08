import { Composer } from "./components/Composer.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { useTheme, type ThemeMode } from "./lib/theme.ts";
import { usePi } from "./state.ts";
import type { ReactNode } from "react";

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
  const { state, conn, sessions, actions } = usePi();
  const [theme, setTheme] = useTheme();

  const cycleTheme = () => {
    const i = THEME_ORDER.indexOf(theme);
    setTheme(THEME_ORDER[(i + 1) % THEME_ORDER.length]);
  };

  return (
    <div className="app">
      <Sidebar
        sessions={sessions}
        currentFile={state.session?.sessionFile ?? null}
        currentCwd={state.session?.cwd ?? null}
        conn={conn}
        onNew={actions.newSession}
        onResume={actions.resume}
      />

      <main className="chat">
        <StatusBar
          streaming={state.streaming}
          model={state.session?.model ?? null}
          sessionId={state.session?.sessionId ?? ""}
          sessionFile={state.session?.sessionFile ?? null}
          cwd={state.session?.cwd ?? ""}
          themeToggle={
            <button
              className="btn btn-ghost btn-xs theme-toggle"
              onClick={cycleTheme}
              title={`主题：${THEME_META[theme].label}（点击切换）`}
            >
              {THEME_META[theme].icon}
            </button>
          }
          onSetModel={actions.setModel}
          onSetThinkingLevel={actions.setThinkingLevel}
        />

        {state.error && (
          <div className="error-banner">
            <span>⚠ {state.error}</span>
            <button className="btn btn-ghost btn-xs" onClick={actions.clearError}>
              关闭
            </button>
          </div>
        )}

        <MessageList messages={state.messages} />

        <Composer
          streaming={state.streaming}
          queuedFollowUps={state.queuedFollowUps}
          queuedSteers={state.queuedSteers}
          onPrompt={actions.prompt}
          onFollowUp={actions.followUp}
          onPromoteToSteer={actions.promoteToSteer}
          onRemoveFromQueue={actions.removeFromQueue}
          onEditQueued={actions.editQueued}
          onAbort={actions.abort}
        />
      </main>
    </div>
  );
}
