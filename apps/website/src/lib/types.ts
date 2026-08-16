// ---------------------------------------------------------------------------
// Wire protocol shared with apps/server (mirrors the server-side types).
// ---------------------------------------------------------------------------

/** 会话状态指示（左侧栏）：running=转圈，review=蓝点，error=红点。 */
export interface SessionStatus {
  running: boolean;
  review: boolean;
  error: boolean;
}

/** A persisted session as listed by Pi's SessionManager. Dates arrive as ISO strings. */
export interface SessionInfo {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  /** 服务端实时状态（可能缺失，用 WS session-status 消息补齐）。 */
  status?: SessionStatus;
}

export interface SessionState {
  sessionId: string;
  sessionFile: string | null;
  cwd: string;
  streaming: boolean;
  model: { provider: string; id: string; name: string } | null;
  messages: AgentMessage[];
  /** 当前分支路径上的用户消息 entryId（按顺序与 messages 中的 user 消息配对）。 */
  messageEntries?: Array<{ entryId: string; text: string }>;
  queue: { steering: string[]; followUp: string[] };
}

export type ServerMessage =
  | { type: "hello"; session: SessionState; statuses: Record<string, SessionStatus> }
  | { type: "session"; session: SessionState }
  | { type: "event"; event: AgentSessionEvent }
  | { type: "session-status"; statuses: Record<string, SessionStatus> }
  | { type: "error"; message: string }
  | { type: "pong" };

export type ClientMessage =
  | { type: "prompt"; text: string }
  | { type: "steer"; text: string }
  | { type: "followUp"; text: string }
  | { type: "promoteToSteer"; text: string }
  | { type: "removeFromQueue"; text: string }
  | { type: "editQueued"; text: string; newText: string }
  | { type: "demoteToFollowUp"; text: string }
  | { type: "retract"; entryId: string }
  | { type: "editResend"; entryId: string; text: string }
  | { type: "abort" }
  | { type: "newSession"; cwd?: string }
  | { type: "resume"; path: string }
  | { type: "ping" };

// ---------------------------------------------------------------------------
// Agent messages (subset of the pi-ai message shapes, as they arrive over JSON)
// ---------------------------------------------------------------------------

export interface TextContent {
  type: "text";
  text: string;
}
export interface ThinkingContent {
  type: "thinking";
  thinking: string;
}
export interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}
export interface ToolCallContent {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
export type AssistantContent = TextContent | ThinkingContent | ToolCallContent;

export interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}
export interface AssistantMessage {
  role: "assistant";
  content: AssistantContent[];
  model: string;
  stopReason: string;
  errorMessage?: string;
  timestamp: number;
}
export interface ToolResultMessage {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  isError: boolean;
  timestamp: number;
}
export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;

// ---------------------------------------------------------------------------
// Session events (subset we render; unknown types are ignored)
// ---------------------------------------------------------------------------

export type AssistantMessageEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string };

export type AgentSessionEvent =
  | { type: "agent_start" }
  | { type: "agent_end" }
  | { type: "agent_settled" } // SDK 真正空闲（agent_end 后 compaction/retry 完成）
  | { type: "turn_start" }
  | { type: "turn_end"; message: AssistantMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | {
      type: "message_update";
      message: AssistantMessage;
      assistantMessageEvent: AssistantMessageEvent;
    }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; partialResult: unknown }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }
  | { type: "queue_update"; steering: readonly string[]; followUp: readonly string[] }
  | { type: "entry_appended" }
  | { type: "compaction_start"; reason: string }
  | { type: "compaction_end"; reason: string; aborted: boolean }
  | { type: "thinking_level_changed"; level: string };

// ---------------------------------------------------------------------------
// UI model
// ---------------------------------------------------------------------------

export interface UiText {
  kind: "text";
  text: string;
}
export interface UiThinking {
  kind: "thinking";
  text: string;
}
export interface UiToolCall {
  kind: "toolCall";
  id: string;
  name: string;
  args: unknown;
  output: string;
  state: "running" | "done" | "error";
}
export type UiPart = UiText | UiThinking | UiToolCall;

export interface UiMessage {
  key: string;
  role: "user" | "assistant";
  text: string;
  parts: UiPart[];
  model?: string;
  timestamp?: number;
  streaming: boolean;
  /** 服务端会话树中的 entry id（用户消息撤回/编辑用），运行中可能暂缺。 */
  entryId?: string;
  /** 运行失败信息（assistant 消息 stopReason=error / errorMessage），渲染为错误块。 */
  error?: string;
}

export type ConnectionState = "connecting" | "open" | "closed";

// ---------------------------------------------------------------------------
// Model picker / session stats
// ---------------------------------------------------------------------------

export interface ModelInfo {
  provider: string;
  id: string;
  name: string;
}

export interface ModelPickerState {
  models: ModelInfo[];
  current: ModelInfo | null;
  thinking: { current: string; available: string[] };
}

export interface SessionStats {
  sessionId: string;
  sessionFile?: string | null;
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  toolResults: number;
  totalMessages: number;
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  contextUsage?: { tokens: number; contextWindow: number; percent: number };
}
