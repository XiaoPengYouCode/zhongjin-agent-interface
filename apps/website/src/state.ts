import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSessions, PiClient, postModel, postThinking } from "./lib/client.ts";
import { qk } from "./lib/queries.ts";
import { applyEvent, messagesToUi } from "./lib/messages.ts";
import { perf } from "./lib/perf.ts";
import type {
  AgentSessionEvent,
  ClientMessage,
  ConnectionState,
  SessionState,
  SessionStatus,
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
  | { type: "agent-events"; events: AgentSessionEvent[] }
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
    case "reset-session": {
      // 传入旧列表与 entries：未变化的消息/part 引用被复用，
      // 避免快照重建（agent_end 后 refreshSession 等）触发全列表重渲染。
      const ui = messagesToUi(
        action.session.messages,
        state.messages,
        action.session.messageEntries,
      );
      return {
        ...state,
        session: action.session,
        messages: ui,
        streaming: action.session.streaming,
        queuedFollowUps: action.session.queue.followUp,
        queuedSteers: action.session.queue.steering,
        error: null,
      };
    }
    case "agent-event": {
      const event = action.event;
      const next: PiState = {
        ...state,
        messages: applyEvent(state.messages, event),
      };
      if (event.type === "agent_start") next.streaming = true;
      // agent_end 不能置 streaming=false：SDK 在 agent_end 广播后可能仍在
      // compaction/retry/continuation（_isAgentRunActive 要到 agent_settled 才释放），
      // 提前置 false 会让输入框走 prompt 路径并撞上 SDK 的 already-processing 错误。
      else if (event.type === "agent_settled") next.streaming = false;
      else if (event.type === "queue_update") {
        next.queuedFollowUps = [...event.followUp];
        next.queuedSteers = [...event.steering];
      } else if (event.type === "compaction_end" && event.aborted) {
        next.error = "会话压缩失败，请重试或开新会话。";
      }
      return next;
    }
    // 高频流式事件（message_update / tool_execution_update）经 rAF 合并后
    // 批量应用：只影响 messages，逐个 apply（tool_execution_update 的增量
    // 不能丢），一次 dispatch 一次渲染。
    case "agent-events": {
      let messages = state.messages;
      // queue_update 与流式事件同帧合并：clear→refill 的中间空态不渲染，
      // 排队↔引导切换时只应用最终队列（否则 1→0→1 会闪一下）。
      let followUps: string[] | null = null;
      let steers: string[] | null = null;
      for (const event of action.events) {
        messages = applyEvent(messages, event);
        if (event.type === "queue_update") {
          followUps = [...event.followUp];
          steers = [...event.steering];
        }
      }
      return {
        ...state,
        messages,
        ...(followUps !== null && steers !== null
          ? { queuedFollowUps: followUps, queuedSteers: steers }
          : {}),
      };
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
  editQueued: (text: string, newText: string) => void;
  demoteToFollowUp: (text: string) => void;
  retract: (entryId: string) => void;
  editResend: (entryId: string, text: string) => void;
  abort: () => void;
  newSession: (cwd?: string) => void;
  resume: (path: string) => void;
  renameSession: (name: string) => void;
  deleteSession: (path: string) => void;
  clearError: () => void;
  setModel: (provider: string, id: string) => Promise<void>;
  setThinkingLevel: (level: string) => Promise<void>;
}

export function usePi() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [conn, setConn] = useState<ConnectionState>("connecting");
  // 左侧栏会话状态（服务端 WS session-status 推送 / hello 快照）。
  const [statuses, setStatuses] = useState<Record<string, SessionStatus>>({});
  const clientRef = useRef<PiClient | null>(null);
  const queryClient = useQueryClient();

  // 会话列表：tanstack 缓存，WS 事件时 invalidate。
  const { data: sessions = [] } = useQuery({
    queryKey: qk.sessions,
    queryFn: fetchSessions,
    staleTime: 30_000,
  });

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

  useEffect(() => {
    const client = new PiClient();
    clientRef.current = client;

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: qk.sessions });
    };

    // ---- 高频流式事件（message_update / tool_execution_update）rAF 合并 ----
    // 流式输出时这些事件每 token/chunk 一条；直接 dispatch 会以事件频率触发
    // 全量 React 渲染（markdown 重解析 / DOM 重建）。合并到每帧一次：
    // 渲染频率封顶到帧率，感知延迟最多 1 帧，流式大文档的成本大幅下降。
    let pendingEvents: AgentSessionEvent[] | null = null;
    let rafId = 0;
    const flushNow = (): void => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      if (!pendingEvents) return;
      const events = pendingEvents;
      pendingEvents = null;
      dispatch({ type: "agent-events", events });
    };
    const queueEvent = (event: AgentSessionEvent): void => {
      (pendingEvents ??= []).push(event);
      if (!rafId) rafId = requestAnimationFrame(flushNow);
    };
    const isHighFreq = (e: AgentSessionEvent): boolean =>
      e.type === "message_update" ||
      e.type === "tool_execution_update" ||
      // 队列切换（clear→refill 多条事件）同帧合并，避免 1→0→1 闪烁。
      e.type === "queue_update";

    client.onMessage((msg) => {
      const p = perf.mark();
      try {
        switch (msg.type) {
          case "hello":
            setStatuses(msg.statuses);
            dispatch({ type: "reset-session", session: msg.session });
            refresh();
            break;
          case "session":
            dispatch({ type: "reset-session", session: msg.session });
            refresh();
            break;
          case "session-status":
            // 增量合并：覆盖对应会话的 running/review/error。
            setStatuses((prev) => ({ ...prev, ...msg.statuses }));
            break;
          case "event": {
            const event = msg.event;
            if (isHighFreq(event)) {
              queueEvent(event);
              break;
            }
            // 非高频事件立即处理；agent_end 前先把本帧未 flush 的
            // 流式事件同步应用，避免末尾 update 在 end 之后覆盖 streaming。
            flushNow();
            dispatch({ type: "agent-event", event });
            if (event.type === "agent_end") {
              refresh();
              // 任务结束后刷新会话状态：让刚发的消息带上 entryId（可编辑/撤回）
              void refreshSession();
            }
            break;
          }
          case "error":
            dispatch({ type: "error", message: msg.message });
            break;
        }
      } finally {
        perf.end(p, `ws:${msg.type}:${msg.type === "event" ? msg.event.type : ""}`);
      }
    });
    client.onState(setConn);
    client.connect();
    return () => client.close();
  }, [queryClient, refreshSession]);

  const send = useCallback((msg: ClientMessage) => {
    try {
      clientRef.current?.send(msg);
    } catch (err) {
      dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  // 切换模型 / think 等级：mutation，成功后失效模型缓存并刷新会话状态。
  const modelMutation = useMutation({
    mutationFn: ({ provider, id }: { provider: string; id: string; sessionId: string }) =>
      postModel(provider, id),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: qk.models(vars.sessionId) });
      void refreshSession();
    },
  });
  const thinkingMutation = useMutation({
    mutationFn: (level: string) => postThinking(level),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.models(state.session?.sessionId ?? "") });
    },
  });

  const setModel = useCallback(
    async (provider: string, id: string) => {
      try {
        await modelMutation.mutateAsync({
          provider,
          id,
          sessionId: state.session?.sessionId ?? "",
        });
      } catch (err) {
        dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
    },
    [modelMutation, state.session?.sessionId],
  );

  const setThinkingLevel = useCallback(
    async (level: string) => {
      try {
        await thinkingMutation.mutateAsync(level);
      } catch (err) {
        dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
      }
    },
    [thinkingMutation],
  );

  const actions = useMemo<PiActions>(
    () => ({
      prompt: (text) => send({ type: "prompt", text }),
      followUp: (text) => send({ type: "followUp", text }),
      promoteToSteer: (text) => send({ type: "promoteToSteer", text }),
      removeFromQueue: (text) => send({ type: "removeFromQueue", text }),
      editQueued: (text, newText) => send({ type: "editQueued", text, newText }),
      demoteToFollowUp: (text) => send({ type: "demoteToFollowUp", text }),
      retract: (entryId) => send({ type: "retract", entryId }),
      editResend: (entryId, text) => send({ type: "editResend", entryId, text }),
      abort: () => send({ type: "abort" }),
      newSession: (cwd) => send({ type: "newSession", ...(cwd ? { cwd } : {}) }),
      resume: (path) => send({ type: "resume", path }),
      renameSession: (name) => send({ type: "renameSession", name }),
      deleteSession: (path) => send({ type: "deleteSession", path }),
      clearError: () => dispatch({ type: "clear-error" }),
      setModel,
      setThinkingLevel,
    }),
    [send, setModel, setThinkingLevel],
  );

  return { state, conn, sessions, statuses, actions };
}
