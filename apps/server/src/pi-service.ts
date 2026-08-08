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

  /** Attach (or re-attach) the event listener. */
  async bind(listener: (event: AgentSessionEvent) => void): Promise<void> {
    this.unsubscribe?.();
    await this.session.bindExtensions({});
    this.unsubscribe = this.session.subscribe(listener);
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
