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

function attachToolResult(messages: UiMessage[], result: ToolResultMessage): void {
  // Find the last tool call part with a matching id across recent assistant messages.
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    for (let j = msg.parts.length - 1; j >= 0; j--) {
      const part = msg.parts[j];
      if (part.kind === "toolCall" && part.id === result.toolCallId) {
        const output = textOf(result.content);
        part.output = output;
        part.state = result.isError ? "error" : "done";
        return;
      }
    }
  }
  // Orphaned result (e.g. detached tool call): render a synthetic part.
  const last = messages[messages.length - 1];
  if (last && last.role === "assistant") {
    last.parts.push({
      kind: "toolCall",
      id: result.toolCallId,
      name: result.toolName,
      args: {},
      output: textOf(result.content),
      state: result.isError ? "error" : "done",
    });
  }
}

/** Convert a full message list (from a resumed session) into UI messages. */
export function messagesToUi(messages: AgentMessage[]): UiMessage[] {
  const out: UiMessage[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({
        key: nextKey(),
        role: "user",
        text: textOf(m.content),
        parts: [],
        timestamp: m.timestamp,
        streaming: false,
      });
    } else if (m.role === "assistant") {
      out.push({
        key: nextKey(),
        role: "assistant",
        text: "",
        parts: partsOf(m.content),
        model: m.model,
        timestamp: m.timestamp,
        streaming: false,
      });
    } else {
      attachToolResult(out, m);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Streaming event → UI state updates
// ---------------------------------------------------------------------------

/** Apply one agent event to the UI message list. Returns the updated list. */
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
      if (m.role === "toolResult") {
        const copy = messages.map((x) => ({ ...x, parts: x.parts.map((p) => ({ ...p })) }));
        attachToolResult(copy, m);
        return copy;
      }
      return messages;
    }
    case "message_update": {
      const m = event.message;
      if (m.role !== "assistant") return messages;
      const copy = messages.map((x) => ({ ...x, parts: x.parts.map((p) => ({ ...p })) }));
      const last = copy[copy.length - 1];
      if (!last || last.role !== "assistant") return messages;
      last.parts = partsOf(m.content);
      last.model = m.model;
      last.streaming = true;
      return copy;
    }
    case "message_end": {
      const m = event.message;
      if (m.role === "assistant") {
        const copy = messages.map((x) => ({ ...x, parts: x.parts.map((p) => ({ ...p })) }));
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant") {
          last.parts = partsOf(m.content);
          last.model = m.model;
          last.streaming = false;
        }
        return copy;
      }
      if (m.role === "toolResult") {
        const copy = messages.map((x) => ({ ...x, parts: x.parts.map((p) => ({ ...p })) }));
        attachToolResult(copy, m);
        return copy;
      }
      return messages;
    }
    case "turn_end": {
      const copy = messages.map((x) => ({ ...x, parts: x.parts.map((p) => ({ ...p })) }));
      for (const result of event.toolResults) attachToolResult(copy, result);
      return copy;
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

function markTool(
  messages: UiMessage[],
  toolCallId: string,
  fn: (part: Extract<UiPart, { kind: "toolCall" }>) => void,
): UiMessage[] {
  let changed = false;
  const copy = messages.map((x) => {
    if (x.role !== "assistant") return x;
    const parts = x.parts.map((p) => {
      if (p.kind !== "toolCall" || p.id !== toolCallId) return p;
      const next = { ...p };
      fn(next);
      changed = true;
      return next;
    });
    return parts === x.parts ? x : { ...x, parts };
  });
  return changed ? copy : messages;
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
