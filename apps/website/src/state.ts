import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { fetchSessions, PiClient, postModel, postThinking } from "./lib/client.ts";
import { applyEvent, messagesToUi } from "./lib/messages.ts";
import type {
  AgentSessionEvent,
  ClientMessage,
  ConnectionState,
  SessionInfo,
  SessionState,
  UiMessage,
} from "./lib/types.ts";

export interface PiState {
  session: SessionState | null;
  messages: UiMessage[];
  streaming: boolean;
  queuedFollowUps: string[];
  queuedSteers: string[];
  error: string | null;
}

type Action =
  | { type: "reset-session"; session: SessionState }
  | { type: "agent-event"; event: AgentSessionEvent }
  | { type: "error"; message: string }
  | { type: "clear-error" };

const initialState: PiState = {
  session: null,
  messages: [],
  streaming: false,
  queuedFollowUps: [],
  queuedSteers: [],
  error: null,
};

function reducer(state: PiState, action: Action): PiState {
  switch (action.type) {
    case "reset-session":
      return {
        ...state,
        session: action.session,
        messages: messagesToUi(action.session.messages),
        streaming: action.session.streaming,
        queuedFollowUps: action.session.queue.followUp,
        queuedSteers: action.session.queue.steering,
        error: null,
      };
    case "agent-event": {
      const event = action.event;
      const next: PiState = {
        ...state,
        messages: applyEvent(state.messages, event),
      };
      if (event.type === "agent_start") next.streaming = true;
      else if (event.type === "agent_end") {
        next.streaming = false;
        next.queuedFollowUps = [];
        next.queuedSteers = [];
      } else if (event.type === "queue_update") {
        next.queuedFollowUps = [...event.followUp];
        next.queuedSteers = [...event.steering];
      } else if (event.type === "compaction_end" && event.aborted) {
        next.error = "会话压缩失败，请重试或开新会话。";
      }
      return next;
    }
    case "error":
      return { ...state, error: action.message };
    case "clear-error":
      return { ...state, error: null };
  }
}

export interface PiActions {
  prompt: (text: string) => void;
  followUp: (text: string) => void;
  promoteToSteer: (text: string) => void;
  removeFromQueue: (text: string) => void;
  abort: () => void;
  newSession: (cwd?: string) => void;
  resume: (path: string) => void;
  clearError: () => void;
  setModel: (provider: string, id: string) => Promise<void>;
  setThinkingLevel: (level: string) => Promise<void>;
}

export function usePi() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [conn, setConn] = useState<ConnectionState>("connecting");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const clientRef = useRef<PiClient | null>(null);

  useEffect(() => {
    const client = new PiClient();
    clientRef.current = client;

    const refresh = () => {
      fetchSessions()
        .then(setSessions)
        .catch(() => {});
    };

    client.onMessage((msg) => {
      switch (msg.type) {
        case "hello":
        case "session":
          dispatch({ type: "reset-session", session: msg.session });
          refresh();
          break;
        case "event":
          dispatch({ type: "agent-event", event: msg.event });
          if (msg.event.type === "agent_end") refresh();
          break;
        case "error":
          dispatch({ type: "error", message: msg.message });
          break;
      }
    });
    client.onState(setConn);
    client.connect();
    return () => client.close();
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    try {
      clientRef.current?.send(msg);
    } catch (err) {
      dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // 会话信息：文件夹名 + 统计卡片 + 模型选择
  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/state");
      if (!res.ok) return;
      const s = (await res.json()) as SessionState;
      dispatch({ type: "reset-session", session: s });
    } catch {
      // 忽略临时失败
    }
  }, []);

  const setModel = useCallback(
    async (provider: string, id: string) => {
      try {
        await postModel(provider, id);
      } catch (err) {
        dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
      await refreshSession();
    },
    [refreshSession],
  );

  const setThinkingLevel = useCallback(async (level: string) => {
    try {
      await postThinking(level);
    } catch (err) {
      dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const actions = useMemo<PiActions>(
    () => ({
      prompt: (text) => send({ type: "prompt", text }),
      followUp: (text) => send({ type: "followUp", text }),
      promoteToSteer: (text) => send({ type: "promoteToSteer", text }),
      removeFromQueue: (text) => send({ type: "removeFromQueue", text }),
      abort: () => send({ type: "abort" }),
      newSession: (cwd) => send({ type: "newSession", ...(cwd ? { cwd } : {}) }),
      resume: (path) => send({ type: "resume", path }),
      clearError: () => dispatch({ type: "clear-error" }),
      setModel,
      setThinkingLevel,
    }),
    [send, setModel, setThinkingLevel],
  );

  return { state, conn, sessions, actions };
}
