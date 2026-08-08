import type {
  ClientMessage,
  ConnectionState,
  ModelPickerState,
  ServerMessage,
  SessionInfo,
  SessionStats,
} from "./types.ts";

/** Minimal WebSocket client with auto-reconnect and JSON framing. */
export class PiClient {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners = new Set<(msg: ServerMessage) => void>();
  private stateListeners = new Set<(s: ConnectionState) => void>();
  private reconnectDelay = 800;
  private reconnectTimer: number | undefined;
  private closed = false;

  constructor(url = "/ws") {
    this.url = url;
  }

  onMessage(fn: (msg: ServerMessage) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onState(fn: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  connect(): void {
    this.closed = false;
    this.open();
  }

  private open(): void {
    this.setState("connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectDelay = 800;
      this.setState("open");
    };
    ws.onmessage = (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data as string) as ServerMessage;
      } catch {
        return;
      }
      for (const fn of this.listeners) fn(msg);
    };
    ws.onclose = () => {
      this.setState("closed");
      if (!this.closed) this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer !== undefined) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.closed) this.open();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10_000);
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      throw new Error("连接已断开");
    }
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  private setState(s: ConnectionState): void {
    for (const fn of this.stateListeners) fn(s);
  }
}

export async function fetchSessions(): Promise<SessionInfo[]> {
  const res = await fetch("/api/sessions");
  if (!res.ok) throw new Error(`Failed to fetch sessions (${res.status})`);
  const data = (await res.json()) as { sessions: SessionInfo[] };
  return data.sessions;
}

export async function fetchModelPickerState(): Promise<ModelPickerState> {
  const res = await fetch("/api/models");
  if (!res.ok) throw new Error(`Failed to fetch models (${res.status})`);
  return (await res.json()) as ModelPickerState;
}

export async function fetchStats(): Promise<SessionStats> {
  const res = await fetch("/api/stats");
  if (!res.ok) throw new Error(`Failed to fetch stats (${res.status})`);
  return (await res.json()) as SessionStats;
}

export async function postModel(provider: string, id: string): Promise<void> {
  await fetch("/api/model", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider, id }),
  });
}

export async function postThinking(level: string): Promise<void> {
  await fetch("/api/thinking", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ level }),
  });
}

export interface FsItem {
  name: string;
  type: "file" | "dir";
  path: string;
}

export async function fetchFsItems(dir = "", signal?: AbortSignal): Promise<FsItem[]> {
  const res = await fetch(`/api/fs/list?dir=${encodeURIComponent(dir)}`, { signal });
  if (!res.ok) throw new Error(`Failed to list files (${res.status})`);
  const data = (await res.json()) as { items: FsItem[] };
  return data.items;
}

export async function fetchSearchItems(
  q: string,
  dir = "",
  signal?: AbortSignal,
): Promise<FsItem[]> {
  const res = await fetch(
    `/api/fs/search?q=${encodeURIComponent(q)}&dir=${encodeURIComponent(dir)}`,
    { signal },
  );
  if (!res.ok) throw new Error(`Failed to search files (${res.status})`);
  const data = (await res.json()) as { items: FsItem[] };
  return data.items;
}

export interface SkillInfo {
  name: string;
  description: string;
  scope: "global" | "project";
}

export async function fetchSkills(signal?: AbortSignal): Promise<SkillInfo[]> {
  const res = await fetch("/api/skills", { signal });
  if (!res.ok) throw new Error(`Failed to fetch skills (${res.status})`);
  const data = (await res.json()) as { skills: SkillInfo[] };
  return data.skills;
}
