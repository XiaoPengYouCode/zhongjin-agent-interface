import type {
  AgentMessage,
  AgentSessionEvent,
  AssistantContent,
  AssistantMessageEvent,
  ImageContent,
  TextContent,
  ToolResultMessage,
  UiMessage,
  UiPart,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Message → UI conversion
// ---------------------------------------------------------------------------

function textOf(content: string | (TextContent | ImageContent)[]): string {
  if (typeof content === "string") return content;
  return content
    .map((c) => (c.type === "text" ? c.text : c.type === "image" ? "📷 [image]" : ""))
    .join("");
}

function partsOf(content: AssistantContent[]): UiPart[] {
  return content.map((c) => {
    if (c.type === "text") return { kind: "text", text: c.text } as const;
    if (c.type === "thinking") return { kind: "thinking", text: c.thinking } as const;
    return {
      kind: "toolCall",
      id: c.id,
      name: c.name,
      args: c.arguments,
      output: "",
      state: "done",
    } as const;
  });
}

let keyCounter = 0;
function nextKey(): string {
  return `m${++keyCounter}`;
}

function attachToolResult(messages: UiMessage[], result: ToolResultMessage): UiMessage[] {
  // Find the last tool call part with a matching id across recent assistant messages.
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const j = msg.parts.findIndex((p) => p.kind === "toolCall" && p.id === result.toolCallId);
    if (j === -1) continue;
    const output = textOf(result.content);
    const state: "error" | "done" = result.isError ? "error" : "done";
    const parts: UiPart[] = msg.parts.map((p, k) =>
      // 已累积的流式输出优先保留：turn_end 的 result 可能与 partial 累加不完全一致，
      // 整体替换会触发 TerminalOutput 重建 DOM（内容闪一下）。
      k === j && p.kind === "toolCall" ? { ...p, output: p.output || output, state } : p,
    );
    const copy = messages.slice();
    copy[i] = { ...msg, parts };
    return copy;
  }
  // Orphaned result (e.g. detached tool call): render a synthetic part.
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant") {
    const copy = messages.slice();
    copy[copy.length - 1] = {
      ...last,
      parts: [
        ...last.parts,
        {
          kind: "toolCall",
          id: result.toolCallId,
          name: result.toolName,
          args: {},
          output: textOf(result.content),
          state: result.isError ? "error" : "done",
        },
      ],
    };
    return copy;
  }
  return messages;
}

/** Convert a full message list (from a resumed session) into UI messages. */
export function messagesToUi(
  messages: AgentMessage[],
  prev?: UiMessage[],
  entries?: Array<{ entryId: string; text: string }>,
): UiMessage[] {
  let out: UiMessage[] = [];
  let idx = 0;
  let ei = 0;
  for (const m of messages) {
    if (m.role === "user") {
      const entry = entries && ei < entries.length ? entries[ei] : undefined;
      out.push({
        key: `u${idx}`, // 基于位置的稳定 key：全量重建时可复用已有 DOM
        role: "user",
        text: textOf(m.content),
        parts: [],
        timestamp: m.timestamp,
        streaming: false,
        // 在生成时附加（而非生成后），复用比较时 entryId 才是对的。
        entryId: entry?.entryId,
      });
      if (entry) ei += 1;
    } else if (m.role === "assistant") {
      out.push({
        key: `u${idx}`,
        role: "assistant",
        text: "",
        parts: partsOf(m.content),
        model: m.model,
        timestamp: m.timestamp,
        streaming: false,
      });
    } else {
      out = attachToolResult(out, m);
      continue;
    }
    idx += 1;
  }
  // 复用未变化的消息/part 引用：快照重建（agent_end 后的 refreshSession、
  // 会话切换、重连）时保持引用稳定，让 React.memo 跳过未变消息的渲染。
  if (prev && prev.length > 0 && out.length === prev.length) {
    for (let i = 0; i < out.length; i++) {
      const p = prev[i];
      if (p && p.key === out[i].key && sameUiMessage(p, out[i])) out[i] = p;
    }
  }
  return out;
}

/** 浅比较两条 UI 消息（含 parts）是否完全一致（引用可安全复用）。 */
function sameUiMessage(a: UiMessage, b: UiMessage): boolean {
  if (
    a.role !== b.role ||
    a.text !== b.text ||
    a.model !== b.model ||
    a.timestamp !== b.timestamp ||
    a.streaming !== b.streaming ||
    a.entryId !== b.entryId
  )
    return false;
  if (a.parts.length !== b.parts.length) return false;
  for (let i = 0; i < a.parts.length; i++) {
    if (!partEqual(a.parts[i], b.parts[i])) return false;
  }
  return true;
}

/** 逐字段比较单个 part（类型守卫保证 TS 收窄）。 */
function partEqual(x: UiPart, y: UiPart): boolean {
  if (x.kind === "text") return y.kind === "text" && x.text === y.text;
  if (x.kind === "thinking") return y.kind === "thinking" && x.text === y.text;
  return (
    y.kind === "toolCall" &&
    x.id === y.id &&
    x.name === y.name &&
    x.output === y.output &&
    x.state === y.state &&
    JSON.stringify(x.args) === JSON.stringify(y.args)
  );
}

// ---------------------------------------------------------------------------
// Streaming event → UI state updates
// ---------------------------------------------------------------------------

/**
 * Apply one agent event to the UI message list. Returns the updated list.
 * Only the affected message is cloned; unchanged messages keep their
 * references so React.memo can skip re-rendering them.
 */
export function applyEvent(messages: UiMessage[], event: AgentSessionEvent): UiMessage[] {
  switch (event.type) {
    case "message_start": {
      const m = event.message;
      if (m.role === "user") {
        return [
          ...messages,
          {
            key: nextKey(),
            role: "user",
            text: textOf(m.content),
            parts: [],
            timestamp: m.timestamp,
            streaming: false,
          },
        ];
      }
      if (m.role === "assistant") {
        return [
          ...messages,
          {
            key: nextKey(),
            role: "assistant",
            text: "",
            parts: partsOf(m.content),
            model: m.model,
            timestamp: m.timestamp,
            streaming: true,
          },
        ];
      }
      if (m.role === "toolResult") return attachToolResult(messages, m);
      return messages;
    }
    case "message_update": {
      const m = event.message;
      if (m.role !== "assistant") return messages;
      return withLastAssistant(messages, (last) => {
        // 增量路径：content 结构与 UI parts 一致时，把 text/thinking delta 直接
        // 追加到对应 part——不重建 parts 数组、toolCall part 引用保持稳定。
        const updated = applyTextDelta(last.parts, m.content, event.assistantMessageEvent);
        if (updated) return { ...last, parts: updated, model: m.model, streaming: true };
        // 结构变化（新 text/thinking/toolCall 出现）或非文本增量：全量重建。
        return {
          ...last,
          parts: mergeToolState(partsOf(m.content), last.parts),
          model: m.model,
          streaming: true,
        };
      });
    }
    case "message_end": {
      const m = event.message;
      if (m.role === "assistant") {
        return withLastAssistant(messages, (last) => ({
          ...last,
          parts: mergeToolState(partsOf(m.content), last.parts),
          model: m.model,
          streaming: false,
        }));
      }
      if (m.role === "toolResult") return attachToolResult(messages, m);
      return messages;
    }
    case "turn_end": {
      let next = messages;
      for (const result of event.toolResults) next = attachToolResult(next, result);
      return next;
    }
    case "tool_execution_start": {
      return markTool(messages, event.toolCallId, (p) => {
        p.state = "running";
        p.output = "";
        // 事件自带完整参数（流式期间 UI 里的 args 可能是旧引用）：执行时更新。
        if (event.args !== undefined) p.args = event.args;
      });
    }
    case "tool_execution_update": {
      return markTool(messages, event.toolCallId, (p) => {
        p.output += partialToText(event.partialResult);
      });
    }
    case "tool_execution_end": {
      return markTool(messages, event.toolCallId, (p) => {
        p.state = event.isError ? "error" : "done";
        if (!p.output) p.output = resultToText(event.result);
      });
    }
    default:
      return messages;
  }
}

/** Clone only the last message if it is an assistant message, apply fn, return new array. */
function withLastAssistant(messages: UiMessage[], fn: (last: UiMessage) => UiMessage): UiMessage[] {
  const i = messages.length - 1;
  const last = messages[i];
  if (!last || last.role !== "assistant") return messages;
  const copy = messages.slice();
  copy[i] = fn(last);
  return copy;
}

/** Keep toolCall output/state from the current UI parts across partsOf rebuilds. */
function mergeToolState(fresh: UiPart[], current: UiPart[]): UiPart[] {
  return fresh.map((p) => {
    if (p.kind !== "toolCall") return p;
    const prev = current.find((c) => c.kind === "toolCall" && c.id === p.id);
    if (prev && prev.kind === "toolCall") {
      if (
        prev.output === p.output &&
        prev.state === p.state &&
        JSON.stringify(prev.args) === JSON.stringify(p.args)
      ) {
        // 输出/状态/参数都没变：复用 UI 里已累积的对象，引用稳定让 React.memo 生效。
        return prev;
      }
      // 有变化：保留 UI 已累积的输出/状态，参数用最新（fresh）的。
      return { ...p, output: prev.output, state: prev.state };
    }
    return p;
  });
}

/**
 * text_delta / thinking_delta 增量路径：content 结构与当前 UI parts 一致时，
 * 直接把 delta 追加到最后一个对应类型的 part，跳过全量重建。
 * 结构不一致（新 part 出现等）返回 null，由调用方走全量重建自愈。
 */
function applyTextDelta(
  parts: UiPart[],
  content: AssistantContent[],
  delta: AssistantMessageEvent,
): UiPart[] | null {
  if (delta.type !== "text_delta" && delta.type !== "thinking_delta") return null;
  if (structureSignature(content) !== structureSignatureOf(parts)) return null;
  const target = delta.type === "text_delta" ? ("text" as const) : ("thinking" as const);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p.kind !== target) continue;
    const copy = parts.slice();
    copy[i] = { ...p, text: p.text + delta.delta };
    return copy;
  }
  return null;
}

/** content 的 part 序列签名（kind + toolCall id）。 */
function structureSignature(content: AssistantContent[]): string {
  return content.map((c) => (c.type === "toolCall" ? `t:${c.id}` : c.type)).join("|");
}

function structureSignatureOf(parts: UiPart[]): string {
  return parts.map((p) => (p.kind === "toolCall" ? `t:${p.id}` : p.kind)).join("|");
}

function markTool(
  messages: UiMessage[],
  toolCallId: string,
  fn: (part: Extract<UiPart, { kind: "toolCall" }>) => void,
): UiMessage[] {
  // 工具事件几乎总指向最后一条 assistant 消息：反向查找避免大会话下
  // 每个 tool update 都从头遍历全部消息（O(n) → 期望 O(1)）。
  const idx = messages.findLastIndex(
    (x) =>
      x.role === "assistant" && x.parts.some((p) => p.kind === "toolCall" && p.id === toolCallId),
  );
  if (idx === -1) return messages;
  const msg = messages[idx];
  if (msg.role !== "assistant") return messages;
  const parts = msg.parts.map((p) => {
    if (p.kind !== "toolCall" || p.id !== toolCallId) return p;
    const next = { ...p };
    fn(next);
    return next;
  });
  if (parts === msg.parts) return messages;
  const copy = messages.slice();
  copy[idx] = { ...msg, parts };
  return copy;
}

// ---------------------------------------------------------------------------
// Tool output extraction
// ---------------------------------------------------------------------------

function partialToText(partial: unknown): string {
  if (partial == null) return "";
  if (typeof partial === "string") return partial;
  if (typeof partial === "object") {
    const o = partial as Record<string, unknown>;
    for (const key of ["partial", "delta", "output", "text"]) {
      if (typeof o[key] === "string") return o[key] as string;
    }
  }
  return JSON.stringify(partial);
}

function resultToText(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  if (typeof result === "object") {
    const o = result as Record<string, unknown>;
    if (Array.isArray(o.content)) {
      const text = (o.content as { type?: string; text?: string }[])
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text)
        .join("");
      if (text) return text;
    }
    const details = o.details as Record<string, unknown> | undefined;
    if (details && typeof details.result === "string") return details.result;
  }
  return JSON.stringify(result, null, 2);
}
