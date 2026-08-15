import type {
  AgentMessage,
  AgentSessionEvent,
  AssistantContent,
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
export function messagesToUi(messages: AgentMessage[]): UiMessage[] {
  let out: UiMessage[] = [];
  let idx = 0;
  for (const m of messages) {
    if (m.role === "user") {
      out.push({
        key: `u${idx}`, // 基于位置的稳定 key：全量重建时可复用已有 DOM
        role: "user",
        text: textOf(m.content),
        parts: [],
        timestamp: m.timestamp,
        streaming: false,
      });
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
  return out;
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
      return withLastAssistant(messages, (last) => ({
        ...last,
        // 保留已累积的 tool 输出/状态，避免 partsOf 重建时被清空。
        parts: mergeToolState(partsOf(m.content), last.parts),
        model: m.model,
        streaming: true,
      }));
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
    // 状态/输出没变时复用原对象，保持引用稳定，让 React.memo 生效。
    if (prev && prev.kind === "toolCall" && (prev.output !== p.output || prev.state !== p.state)) {
      return { ...p, output: prev.output, state: prev.state };
    }
    return p;
  });
}

function markTool(
  messages: UiMessage[],
  toolCallId: string,
  fn: (part: Extract<UiPart, { kind: "toolCall" }>) => void,
): UiMessage[] {
  const idx = messages.findIndex(
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
