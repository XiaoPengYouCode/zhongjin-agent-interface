import { memo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchModelPickerState } from "../lib/client.ts";
import { fetchSettings, fetchSettingsFile, saveSettingsFile } from "../lib/settings.ts";
import { qk } from "../lib/queries.ts";
import { usePiApi } from "../router.tsx";
import type { ThemeMode } from "../lib/theme.ts";

type SectionId = "general" | "models" | "auth" | "files" | "agents";

const SECTIONS: Array<{ id: SectionId; label: string; desc: string }> = [
  { id: "general", label: "通用", desc: "主题与路径" },
  { id: "models", label: "模型", desc: "默认模型选择" },
  { id: "auth", label: "认证", desc: "API Key 管理" },
  { id: "files", label: "配置文件", desc: "settings / models / auth" },
  { id: "agents", label: "AGENTS.md", desc: "项目/系统指令" },
];

/** 保存反馈条：保存中 / 已保存 / 错误。 */
function SaveStatus({
  status,
  error,
}: {
  status: "idle" | "saving" | "saved" | "error";
  error?: string;
}) {
  if (status === "idle") return null;
  return (
    <div className={`settings-status settings-status-${status}`}>
      {status === "saving" && "保存中…"}
      {status === "saved" && "✓ 已保存"}
      {status === "error" && `⚠ ${error ?? "保存失败"}`}
    </div>
  );
}

/** 可复用的文本编辑面板：textarea + 保存（JSON 文件带前端校验）。 */
function FileEditor({ name, label, json }: { name: string; label: string; json: boolean }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: qk.settingsFile(name),
    queryFn: () => fetchSettingsFile(name),
  });
  const [content, setContent] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  const save = useMutation({
    mutationFn: () => saveSettingsFile(name, content ?? ""),
    onSuccess: () => {
      setStatus("saved");
      void queryClient.invalidateQueries({ queryKey: qk.settingsFile(name) });
      void queryClient.invalidateQueries({ queryKey: qk.settings });
    },
    onError: (err) => {
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    },
  });

  const doSave = () => {
    if (content === null) return;
    if (json) {
      try {
        JSON.parse(content);
      } catch (e) {
        setStatus("error");
        setError(`JSON 格式错误：${e instanceof Error ? e.message : String(e)}`);
        return;
      }
    }
    setStatus("saving");
    save.mutate();
  };

  const value = content ?? data?.content ?? "";
  return (
    <div className="settings-pane">
      <h2 className="settings-title">{label}</h2>
      <p className="settings-desc">直接编辑 pi 的配置文件，保存后立即生效。</p>
      {isLoading ? (
        <div className="settings-muted">加载中…</div>
      ) : (
        <>
          <textarea
            className="settings-editor"
            spellCheck={false}
            value={value}
            onChange={(e) => {
              setContent(e.target.value);
              setStatus("idle");
            }}
          />
          <div className="settings-actions">
            <button className="btn" onClick={doSave} disabled={status === "saving"}>
              {status === "saving" ? "保存中…" : "保存"}
            </button>
            <SaveStatus status={status} error={error} />
          </div>
        </>
      )}
    </div>
  );
}

/** 通用：主题选择 + 路径信息。 */
function GeneralPane() {
  const { theme, setTheme } = usePiApi();
  const { data } = useQuery({ queryKey: qk.settings, queryFn: fetchSettings });
  const options: Array<{ mode: ThemeMode; label: string; icon: ReactNode }> = [
    { mode: "system", label: "跟随系统", icon: <span className="theme-dot">◐</span> },
    { mode: "light", label: "亮色", icon: <span className="theme-dot">☀</span> },
    { mode: "dark", label: "暗色", icon: <span className="theme-dot">☾</span> },
  ];
  return (
    <div className="settings-pane">
      <h2 className="settings-title">通用</h2>
      <div className="settings-row">
        <div className="settings-row-label">主题</div>
        <div className="theme-options">
          {options.map((o) => (
            <button
              key={o.mode}
              className={`theme-option ${theme === o.mode ? "active" : ""}`}
              onClick={() => setTheme(o.mode)}
            >
              {o.icon}
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="settings-row">
        <div className="settings-row-label">Agent 目录</div>
        <code className="settings-path">{data?.agentDir ?? "…"}</code>
      </div>
      <div className="settings-row">
        <div className="settings-row-label">项目目录</div>
        <code className="settings-path">{data?.cwd ?? "…"}</code>
      </div>
      <p className="settings-hint">
        会话与模型配置存放在 agent 目录；AGENTS.md 项目级按项目生效，系统级对所有项目生效。
      </p>
    </div>
  );
}

/** 模型：默认 provider/model 选择（合并写回 settings.json）。 */
function ModelsPane() {
  const { state } = usePiApi();
  const sessionId = state.session?.sessionId ?? "";
  const queryClient = useQueryClient();
  const { data: picker } = useQuery({
    queryKey: qk.models(sessionId),
    queryFn: fetchModelPickerState,
  });
  const { data: settings } = useQuery({
    queryKey: qk.settingsFile("settings.json"),
    queryFn: () => fetchSettingsFile("settings.json"),
  });
  const [provider, setProvider] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  // 默认值：settings.json 的 defaultProvider/defaultModel；无配置时取当前会话模型。
  const defaultProvider =
    provider ??
    (settings
      ? (parseSettings(settings.content)?.defaultProvider ?? picker?.current?.provider ?? "")
      : "");
  const defaultModel =
    model ??
    (settings ? (parseSettings(settings.content)?.defaultModel ?? picker?.current?.id ?? "") : "");

  const providers = useMemoProviders(picker?.models);
  const modelsOfProvider = (picker?.models ?? []).filter((m) => m.provider === defaultProvider);

  const save = () => {
    if (!settings) return;
    if (!defaultProvider || !defaultModel) {
      setStatus("error");
      setError("请选择 provider 和模型");
      return;
    }
    let obj: Record<string, unknown>;
    try {
      obj = settings.content ? JSON.parse(settings.content) : {};
    } catch (e) {
      setStatus("error");
      setError(`settings.json 解析失败：${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    obj.defaultProvider = defaultProvider;
    obj.defaultModel = defaultModel;
    setStatus("saving");
    saveSettingsFile("settings.json", JSON.stringify(obj, null, 2))
      .then(() => {
        setStatus("saved");
        void queryClient.invalidateQueries({ queryKey: qk.settingsFile("settings.json") });
      })
      .catch((err) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  return (
    <div className="settings-pane">
      <h2 className="settings-title">模型</h2>
      <p className="settings-desc">
        设置新会话的默认模型（写入 settings.json 的 defaultProvider / defaultModel）。
      </p>
      <div className="settings-row">
        <div className="settings-row-label">Provider</div>
        <select
          className="settings-select"
          value={defaultProvider}
          onChange={(e) => {
            setProvider(e.target.value);
            setModel(null);
          }}
        >
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-row">
        <div className="settings-row-label">模型</div>
        <select
          className="settings-select"
          value={defaultModel}
          onChange={(e) => setModel(e.target.value)}
        >
          {modelsOfProvider.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.id}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-actions">
        <button className="btn" onClick={save} disabled={status === "saving"}>
          {status === "saving" ? "保存中…" : "保存默认模型"}
        </button>
        <SaveStatus status={status} error={error} />
      </div>
      <p className="settings-hint">
        当前会话的模型不受影响，新会话（及新 agent 任务）使用此默认值。
      </p>
    </div>
  );
}

function parseSettings(
  content: string,
): { defaultProvider?: string; defaultModel?: string } | null {
  try {
    const o = JSON.parse(content) as { defaultProvider?: string; defaultModel?: string };
    return o;
  } catch {
    return null;
  }
}

function useMemoProviders(models: Array<{ provider: string }> | undefined): string[] {
  return [...new Set((models ?? []).map((m) => m.provider))];
}

/** 认证：API Key 管理（auth.json）。 */
function AuthPane() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: qk.settingsFile("auth.json"),
    queryFn: () => fetchSettingsFile("auth.json"),
  });
  const [entries, setEntries] = useState<Record<string, { key: string; show: boolean }> | null>(
    null,
  );
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | undefined>(undefined);

  // 当前条目：优先本地编辑态，否则从文件内容解析。
  const parsed: Record<string, { key: string; show: boolean }> | null =
    entries ?? parseAuth(data?.content ?? "");

  const setKey = (p: string, key: string) => {
    setEntries((prev) => {
      const base = prev ?? parsed ?? {};
      return { ...base, [p]: { key, show: base[p]?.show ?? false } };
    });
    setStatus("idle");
  };
  const remove = (p: string) => {
    setEntries((prev) => {
      const base = { ...(prev ?? parsed) };
      delete base[p];
      return base;
    });
    setStatus("idle");
  };
  const add = () => {
    const name = newName.trim();
    if (!name || !newKey.trim()) return;
    setEntries((prev) => ({
      ...(prev ?? parsed),
      [name]: { key: newKey.trim(), show: false },
    }));
    setNewName("");
    setNewKey("");
    setStatus("idle");
  };

  const save = () => {
    if (!parsed) return;
    const obj: Record<string, { type: string; key: string }> = {};
    for (const [p, e] of Object.entries(parsed)) {
      if (!e.key.trim()) continue; // 空 key 条目视为删除
      obj[p] = { type: "api_key", key: e.key.trim() };
    }
    setStatus("saving");
    saveSettingsFile("auth.json", JSON.stringify(obj, null, 2))
      .then(() => {
        setStatus("saved");
        void queryClient.invalidateQueries({ queryKey: qk.settingsFile("auth.json") });
      })
      .catch((err) => {
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  const providers = Object.keys(parsed ?? {});
  return (
    <div className="settings-pane">
      <h2 className="settings-title">认证</h2>
      <p className="settings-desc">
        管理各 provider 的 API Key（写入 auth.json）。Key 显示/隐藏可切换。
      </p>
      {!parsed ? (
        <div className="settings-muted">加载中…</div>
      ) : (
        <>
          {providers.map((p) => (
            <div key={p} className="auth-row">
              <span className="auth-provider">{p}</span>
              <div className="auth-key-wrap">
                <input
                  className="auth-key"
                  type={parsed[p].show ? "text" : "password"}
                  value={parsed[p].key}
                  onChange={(e) => setKey(p, e.target.value)}
                  placeholder="API Key"
                  spellCheck={false}
                  autoComplete="off"
                />
                <button
                  className="icon-btn"
                  onClick={() =>
                    setEntries((prev) => ({
                      ...(prev ?? parsed),
                      [p]: { key: parsed[p].key, show: !parsed[p].show },
                    }))
                  }
                  title={parsed[p].show ? "隐藏" : "显示"}
                >
                  {parsed[p].show ? EYE_OFF_ICON : EYE_ICON}
                </button>
                <button
                  className="icon-btn"
                  onClick={() => remove(p)}
                  title="移除该 provider 的 Key"
                >
                  {TRASH_ICON_AUTH}
                </button>
              </div>
            </div>
          ))}
          <div className="auth-row">
            <input
              className="auth-provider-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="provider 名（如 openai）"
              spellCheck={false}
            />
            <div className="auth-key-wrap">
              <input
                className="auth-key"
                type="password"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="新 API Key"
                spellCheck={false}
                autoComplete="off"
              />
              <button
                className="btn btn-ghost btn-xs"
                onClick={add}
                disabled={!newName.trim() || !newKey.trim()}
              >
                添加
              </button>
            </div>
          </div>
          <div className="settings-actions">
            <button className="btn" onClick={save} disabled={status === "saving"}>
              {status === "saving" ? "保存中…" : "保存"}
            </button>
            <SaveStatus status={status} error={error} />
          </div>
          <p className="settings-hint">
            保存时清空 key 的条目会被移除；保存后需重启 agent 会话或新建任务生效。
          </p>
        </>
      )}
    </div>
  );
}

function parseAuth(content: string): Record<string, { key: string; show: boolean }> | null {
  try {
    const o = JSON.parse(content) as Record<string, { type?: string; key?: string }>;
    const out: Record<string, { key: string; show: boolean }> = {};
    for (const [p, v] of Object.entries(o)) {
      if (v && typeof v === "object" && typeof v.key === "string") {
        out[p] = { key: v.key, show: false };
      }
    }
    return out;
  } catch {
    return null;
  }
}

const EYE_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EYE_OFF_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <path d="M1 1l22 22" />
  </svg>
);

const TRASH_ICON_AUTH = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

/** 配置文件：settings.json / models.json / auth.json 直接编辑。 */
function FilesPane() {
  const [active, setActive] = useState<string>("settings.json");
  const { data } = useQuery({ queryKey: qk.settings, queryFn: fetchSettings });
  const editable = (data?.files ?? []).filter((f) => f.name.endsWith(".json"));
  return (
    <div className="settings-pane">
      <h2 className="settings-title">配置文件</h2>
      <p className="settings-desc">JSON 文件保存前会校验格式；保存后立即生效。</p>
      <div className="settings-file-tabs">
        {editable.map((f) => (
          <button
            key={f.name}
            className={`settings-file-tab ${active === f.name ? "active" : ""}`}
            onClick={() => setActive(f.name)}
          >
            {f.name}
            {!f.exists && <span className="settings-file-new">（新建）</span>}
          </button>
        ))}
      </div>
      <FileEditor key={active} name={active} label={active} json />
    </div>
  );
}

/** AGENTS.md：项目级 / 系统级指令编辑。 */
const AGENT_FILES: Array<{ name: string; label: string }> = [
  { name: "agents.md", label: "项目 AGENTS.md" },
  { name: "agents.system.md", label: "系统 AGENTS.md" },
];

function AgentsPane() {
  const [active, setActive] = useState<string>("agents.md");
  const { data } = useQuery({ queryKey: qk.settings, queryFn: fetchSettings });
  const exists = (name: string) => data?.files.find((f) => f.name === name)?.exists;
  return (
    <div className="settings-pane">
      <h2 className="settings-title">AGENTS.md</h2>
      <p className="settings-desc">
        项目 AGENTS.md 按项目生效；系统 AGENTS.md（~/.pi/agent/AGENTS.md）对所有项目生效。
      </p>
      <div className="settings-file-tabs">
        {AGENT_FILES.map((f) => (
          <button
            key={f.name}
            className={`settings-file-tab ${active === f.name ? "active" : ""}`}
            onClick={() => setActive(f.name)}
          >
            {f.label}
            {exists(f.name) === false && <span className="settings-file-new">（新建）</span>}
          </button>
        ))}
      </div>
      <FileEditor
        key={active}
        name={active}
        label={active === "agents.md" ? "AGENTS.md（项目级）" : "AGENTS.md（系统级）"}
        json={false}
      />
    </div>
  );
}

export const SettingsView = memo(function SettingsView() {
  const [section, setSection] = useState<SectionId>("general");
  return (
    <main className="settings">
      <nav className="settings-nav">
        <div className="settings-nav-head">
          <span className="settings-nav-title">设置</span>
          <Link to="/" className="btn btn-ghost btn-xs" title="返回聊天">
            ← 返回
          </Link>
        </div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`settings-nav-item ${section === s.id ? "active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            <span className="settings-nav-label">{s.label}</span>
            <span className="settings-nav-desc">{s.desc}</span>
          </button>
        ))}
      </nav>
      <div className="settings-main">
        {section === "general" && <GeneralPane />}
        {section === "models" && <ModelsPane />}
        {section === "auth" && <AuthPane />}
        {section === "files" && <FilesPane />}
        {section === "agents" && <AgentsPane />}
      </div>
    </main>
  );
});
