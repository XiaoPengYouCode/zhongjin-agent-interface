import {
  type AgentSession,
  type AgentSessionEvent,
  type AgentSessionRuntime,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  type SessionInfo,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

/** Structural copy of pi-agent-core's ThinkingLevel union. */
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/**
 * The runtime factory is cwd-agnostic: each PiService instance is built for
 * one session file and keeps its own runtime, so switching between sessions
 * never tears down another session's in-flight agent run.
 */
const createRuntime: Parameters<typeof createAgentSessionRuntime>[0] = async ({
  cwd,
  sessionManager,
  sessionStartEvent,
}) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({
      services,
      sessionManager,
      sessionStartEvent,
    })),
    services,
    diagnostics: services.diagnostics,
  };
};

/** Fallback working directory for sessions whose header has no cwd. */
const FALLBACK_CWD = process.env.PI_CWD ?? process.cwd();

/**
 * One Pi agent runtime bound to one persisted session. Multiple instances can
 * run concurrently (one per opened session), so leaving a session does not
 * interrupt work happening in another one.
 */
export class PiService {
  private readonly runtime: AgentSessionRuntime;
  readonly cwd: string;
  private unsubscribe: (() => void) | undefined;

  private constructor(runtime: AgentSessionRuntime, cwd: string) {
    this.runtime = runtime;
    this.cwd = cwd;
  }

  /** Open an existing session file. */
  static async open(sessionFile: string): Promise<PiService> {
    const sessionManager = SessionManager.open(sessionFile);
    const cwd = sessionManager.getCwd() || FALLBACK_CWD;
    const runtime = await createAgentSessionRuntime(createRuntime, {
      cwd,
      agentDir: getAgentDir(),
      sessionManager,
    });
    return new PiService(runtime, cwd);
  }

  /** Create a fresh session in the given working directory. */
  static async createNew(cwd: string): Promise<PiService> {
    const runtime = await createAgentSessionRuntime(createRuntime, {
      cwd,
      agentDir: getAgentDir(),
      sessionManager: SessionManager.create(cwd),
    });
    return new PiService(runtime, cwd);
  }

  get session(): AgentSession {
    return this.runtime.session;
  }

  get sessionFile(): string | undefined {
    return this.session.sessionFile;
  }

  /** Snapshot of the pending steering / follow-up queues. */
  getQueue(): { steering: readonly string[]; followUp: readonly string[] } {
    return {
      steering: this.session.getSteeringMessages(),
      followUp: this.session.getFollowUpMessages(),
    };
  }

  // -------------------------------------------------------------------
  // Model / thinking / stats
  // -------------------------------------------------------------------

  /** Enumerate known models across all providers. */
  listModels(): Array<{ provider: string; id: string; name: string }> {
    return this.runtime.services.modelRuntime.getModels().map((m) => ({
      provider: m.provider,
      id: m.id,
      name: m.name ?? m.id,
    }));
  }

  /** Switch the session to another model. */
  async setModel(provider: string, id: string): Promise<void> {
    const model = this.runtime.services.modelRuntime
      .getModels()
      .find((m) => m.provider === provider && m.id === id);
    if (!model) throw new Error(`Unknown model: ${provider}/${id}`);
    await this.session.setModel(model);
  }

  /** Current thinking level + available levels. */
  getThinking(): { current: string; available: string[] } {
    return {
      current: this.session.thinkingLevel ?? "off",
      available: this.session.getAvailableThinkingLevels(),
    };
  }

  /** Set thinking level (validated by the session). */
  setThinking(level: string): void {
    this.session.setThinkingLevel(level as ThinkingLevel);
  }

  /** Session usage stats (tokens, cost, context usage). */
  getStats(): ReturnType<AgentSession["getSessionStats"]> {
    return this.session.getSessionStats();
  }

  // -------------------------------------------------------------------
  // Message retract / edit-resend（基于会话树分支，不改写历史）
  // -------------------------------------------------------------------

  /** 从消息 content（string 或 text 块数组）提取纯文本。 */
  private static contentText(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((c) =>
          c && typeof c === "object" && typeof (c as { text?: unknown }).text === "string"
            ? (c as { text: string }).text
            : "",
        )
        .join("");
    }
    return "";
  }

  /** 当前分支路径上的用户消息 entryId 序列（按顺序与 UI 消息配对）。 */
  getUserMessageEntries(): Array<{ entryId: string; text: string }> {
    const out: Array<{ entryId: string; text: string }> = [];
    for (const e of this.session.sessionManager.getBranch()) {
      if (e.type !== "message") continue;
      const m = e.message;
      if (m.role !== "user") continue;
      out.push({ entryId: e.id, text: PiService.contentText(m.content) });
    }
    return out;
  }

  /** 分支后同步 agent 状态：与 compaction 后的刷新方式一致。 */
  private refreshMessages(): void {
    const ctx = this.session.sessionManager.buildSessionContext();
    this.session.agent.state.messages = ctx.messages;
  }

  /** 把 leaf 回退到目标 entry 的前一条（目标消息及其后从当前路径移除，保留在树中）。 */
  private async branchBefore(entryId: string): Promise<void> {
    const branch = this.session.sessionManager.getBranch();
    const idx = branch.findIndex((e) => e.id === entryId);
    if (idx === -1) throw new Error(`Entry not found: ${entryId}`);
    if (idx === 0)
      this.session.sessionManager.resetLeaf(); // 编辑第一条：leaf 置空
    else this.session.sessionManager.branch(branch[idx - 1].id);
    this.refreshMessages();
  }

  /** 撤回：删除目标用户消息及之后的所有内容（旧路径保留为分支）。 */
  async retract(entryId: string): Promise<void> {
    await this.branchBefore(entryId);
  }

  /** 在已回退的分支上以新文本发送（配合 retract 使用，不重复 branch）。 */
  async sendAsUser(text: string): Promise<void> {
    await this.session.prompt(text);
  }

  /**
   * Promote one queued follow-up to a steering message (interrupt now).
   * The promoted text is taken out of the follow-up queue first, otherwise
   * it would be delivered twice (once as steer, once as follow-up).
   */
  async promoteToSteer(text: string): Promise<void> {
    const { steering, followUp } = this.session.clearQueue();
    await this.session.steer(text);
    for (const s of steering) if (s !== text) await this.session.steer(s);
    for (const f of followUp) if (f !== text) await this.session.followUp(f);
  }

  /** Remove one queued message (steering or follow-up) without delivering it. */
  async removeFromQueue(text: string): Promise<void> {
    const { steering, followUp } = this.session.clearQueue();
    for (const s of steering) if (s !== text) await this.session.steer(s);
    for (const f of followUp) if (f !== text) await this.session.followUp(f);
  }

  /** Replace one queued message's text in place. */
  async editQueued(text: string, newText: string): Promise<void> {
    const { steering, followUp } = this.session.clearQueue();
    for (const s of steering) await this.session.steer(s === text ? newText : s);
    for (const f of followUp) await this.session.followUp(f === text ? newText : f);
  }

  /** 把引导（steer）消息变回排队（follow-up）：两种模式平行，可双向切换。 */
  async demoteToFollowUp(text: string): Promise<void> {
    const { steering, followUp } = this.session.clearQueue();
    for (const s of steering) if (s !== text) await this.session.steer(s);
    for (const f of followUp) if (f !== text) await this.session.followUp(f);
    await this.session.followUp(text);
  }

  /** Attach (or re-attach) the event listener. */
  async bind(listener: (event: AgentSessionEvent) => void): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    await this.session.bindExtensions({});
    this.unsubscribe = this.session.subscribe(listener);
  }

  /** Detach the event listener without stopping the in-flight agent run. */
  unbind(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  async prompt(text: string): Promise<void> {
    await this.session.prompt(text);
  }

  async steer(text: string): Promise<void> {
    await this.session.steer(text);
  }

  async followUp(text: string): Promise<void> {
    await this.session.followUp(text);
  }

  async abort(): Promise<void> {
    await this.session.abort();
  }

  async dispose(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    await this.runtime.dispose();
  }
}

/** List sessions across all working directories, most recently modified first. */
export async function listSessions(): Promise<SessionInfo[]> {
  const sessions = await SessionManager.listAll();
  return sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
}
