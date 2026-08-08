import type { ClientMessage, ConnectionState, ServerMessage, SessionInfo } from "./types.ts";

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
