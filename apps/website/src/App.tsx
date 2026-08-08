import { Composer } from "./components/Composer.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { shortId } from "./lib/format.ts";
import { usePi } from "./state.ts";

export default function App() {
  const { state, conn, sessions, actions } = usePi();

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
        <header className="statusbar">
          <span className="status-left">
            {state.streaming ? (
              <span className="status-streaming">
                <span className="pulse-dot" /> 处理中
              </span>
            ) : (
              <span className="status-idle">就绪</span>
            )}
          </span>
          <span className="status-right">
            {state.session?.model && (
              <span
                className="model-chip"
                title={`${state.session.model.provider}/${state.session.model.id}`}
              >
                {state.session.model.name ?? state.session.model.id}
              </span>
            )}
            {state.session && (
              <span className="session-chip" title={state.session.sessionFile ?? undefined}>
                {shortId(state.session.sessionId)}
              </span>
            )}
          </span>
        </header>

        {state.error && (
          <div className="error-banner">
            <span>⚠ {state.error}</span>
            <button className="btn btn-ghost btn-xs" onClick={actions.clearError}>
              关闭
            </button>
          </div>
        )}

        <MessageList messages={state.messages} streaming={state.streaming} />

        <Composer
          streaming={state.streaming}
          queuedFollowUps={state.queuedFollowUps}
          queuedSteers={state.queuedSteers}
          onPrompt={actions.prompt}
          onSteer={actions.steer}
          onFollowUp={actions.followUp}
          onPromoteToSteer={actions.promoteToSteer}
          onAbort={actions.abort}
        />
      </main>
    </div>
  );
}
