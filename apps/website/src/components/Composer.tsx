import { useEffect, useReducer, useRef, useState } from "react";
import { MdExtension } from "react-icons/md";
import { fetchFsItems, fetchSearchItems, fetchSkills } from "../lib/client.ts";
import type { FsItem, SkillInfo } from "../lib/client.ts";
import { fileTypeIcon } from "./FileIcon.tsx";
import { MentionPicker } from "./MentionPicker.tsx";
import {
  detectMention,
  fuzzyFilter,
  type MentionTrigger,
  type PickerItem,
} from "../lib/mention.ts";

interface ComposerProps {
  streaming: boolean;
  queuedFollowUps: string[];
  queuedSteers: string[];
  onPrompt: (text: string) => void;
  onFollowUp: (text: string) => void;
  onPromoteToSteer: (text: string) => void;
  onRemoveFromQueue: (text: string) => void;
  onEditQueued: (text: string, newText: string) => void;
  onAbort: () => void;
}

const SEND_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

const STOP_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);

const GUIDE_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const TRASH_ICON = (
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

const EDIT_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);

const CHECK_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const CLOSE_ICON = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

interface MentionState {
  open: boolean;
  trigger: MentionTrigger;
  query: string;
  triggerPos: number;
  dir: string;
  items: PickerItem[];
  index: number;
  loading: boolean;
}

type MentionAction =
  | { type: "open"; trigger: MentionTrigger; query: string; triggerPos: number; dir: string }
  | { type: "close" }
  | { type: "dir"; dir: string }
  | { type: "items"; items: PickerItem[]; loading: boolean }
  | { type: "index"; index: number };

const mentionReducer = (s: MentionState, a: MentionAction): MentionState => {
  switch (a.type) {
    case "open":
      return {
        ...s,
        open: true,
        trigger: a.trigger,
        query: a.query,
        triggerPos: a.triggerPos,
        dir: a.dir,
        index: 0,
        items: [],
        loading: true,
      };
    case "close":
      return { ...s, open: false };
    case "dir":
      return { ...s, dir: a.dir, query: "", index: 0, items: [], loading: true };
    case "items":
      return { ...s, items: a.items, loading: a.loading };
    case "index":
      return { ...s, index: a.index };
  }
};

const INITIAL_MENTION: MentionState = {
  open: false,
  trigger: "@",
  query: "",
  triggerPos: 0,
  dir: "",
  items: [],
  index: 0,
  loading: false,
};

/** 拉取候选（文件/skills），前端用 uFuzzy 模糊过滤。 */
async function loadMentionItems(
  trigger: MentionTrigger,
  query: string,
  dir: string,
  signal: AbortSignal,
  skillCache: React.MutableRefObject<SkillInfo[] | null>,
): Promise<PickerItem[]> {
  if (trigger === "$") {
    if (!skillCache.current) skillCache.current = await fetchSkills(signal);
    const skills: PickerItem[] = skillCache.current.map((s) => ({
      name: s.name,
      kind: "skill",
      insert: `/skill:${s.name}`,
      hint: s.scope === "global" ? "全局" : "项目",
      icon: <MdExtension />,
    }));
    return fuzzyFilter(skills, query);
  }
  const files =
    query.trim().length >= 2
      ? await fetchSearchItems(query, dir, signal) // 递归搜索（全项目）
      : await fetchFsItems(dir, signal); // 一层浏览（下钻用）
  const fileItems: PickerItem[] = files.map((f: FsItem) => ({
    name: f.path,
    kind: f.type,
    insert: f.path,
    hint: f.type === "dir" ? "目录" : "文件",
    icon: fileTypeIcon(f.name, f.type === "dir"),
  }));
  return fuzzyFilter(fileItems, query);
}

export function Composer({
  streaming,
  queuedFollowUps,
  queuedSteers,
  onPrompt,
  onFollowUp,
  onPromoteToSteer,
  onRemoveFromQueue,
  onEditQueued,
  onAbort,
}: ComposerProps) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const lastEsc = useRef(0);

  // 排队消息就地编辑
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  // @ / $ 选择器：useReducer 状态机 + effect 依赖驱动加载。
  const [mention, dispatch] = useReducer(mentionReducer, INITIAL_MENTION);
  const skillCache = useRef<SkillInfo[] | null>(null);

  // query / trigger / dir 变化 → 防抖 120ms 加载；cleanup 取消过期请求。
  useEffect(() => {
    if (!mention.open) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const items = await loadMentionItems(
          mention.trigger,
          mention.query,
          mention.dir,
          ctrl.signal,
          skillCache,
        );
        dispatch({ type: "items", items, loading: false });
      } catch {
        if (!ctrl.signal.aborted) dispatch({ type: "items", items: [], loading: false });
      }
    }, 120);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [mention.open, mention.trigger, mention.query, mention.dir]);
  // 随输入自动增高，CSS max-height 封顶（约 10 行）。
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const trimmed = text.trim();
  // 处理中且输入框为空 → 停止；否则 → 发送（处理中时发送即排队）。
  const showStop = streaming && !trimmed;

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const caret = e.target.selectionStart ?? value.length;
    setText(value);
    const m = detectMention(value, caret);
    if (!m) {
      if (mention.open) dispatch({ type: "close" });
      return;
    }
    // 保持已打开的目录（@ 下钻后继续输入过滤）；同状态时 reducer 不变，effect 不重跑。
    dispatch({
      type: "open",
      trigger: m.trigger,
      query: m.query,
      triggerPos: m.triggerPos,
      dir: mention.open ? mention.dir : "",
    });
  };

  const enterDir = (dir: string) => dispatch({ type: "dir", dir });

  const insertItem = (item: PickerItem) => {
    const next = `${text.slice(0, mention.triggerPos)}${item.insert} ${text.slice(
      mention.triggerPos + 1 + mention.query.length,
    )}`;
    setText(next);
    dispatch({ type: "close" });
    const pos = mention.triggerPos + item.insert.length + 1;
    requestAnimationFrame(() => {
      const el = taRef.current;
      if (el) el.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      const now = Date.now();
      if (now - lastEsc.current < 400) {
        e.preventDefault();
        lastEsc.current = 0;
        onAbort();
      } else {
        lastEsc.current = now;
      }
      return;
    }
    if (mention.open && mention.items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        dispatch({ type: "index", index: (mention.index + 1) % mention.items.length });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        dispatch({
          type: "index",
          index: (mention.index - 1 + mention.items.length) % mention.items.length,
        });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const item = mention.items[mention.index];
        if (!item) return;
        if (item.kind === "dir") enterDir(item.insert);
        else insertItem(item);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (showStop) return;
      const t = trimmed;
      if (!t) return;
      if (streaming) onFollowUp(t);
      else onPrompt(t);
      setText("");
    }
  };

  const saveEdit = () => {
    if (editingIdx === null) return;
    const target =
      editingIdx < queuedFollowUps.length
        ? queuedFollowUps[editingIdx]
        : queuedSteers[editingIdx - queuedFollowUps.length];
    const v = editValue.trim();
    if (v && v !== target) onEditQueued(target, v);
    setEditingIdx(null);
  };

  const hasQueue = queuedSteers.length > 0 || queuedFollowUps.length > 0;

  return (
    <div className="composer">
      {hasQueue && (
        <div className="queue-panel">
          {queuedSteers.map((t, i) => (
            <div className="queue-item queue-item-steer" key={`s${i}`}>
              <span className="queue-tag">引导</span>
              <span className="queue-text">{t}</span>
              <button className="icon-btn" onClick={() => onRemoveFromQueue(t)} title="移出队列">
                {TRASH_ICON}
              </button>
            </div>
          ))}
          {queuedFollowUps.map((t, i) =>
            editingIdx === i ? (
              <div className="queue-item" key={`f${i}`}>
                <span className="queue-tag">排队</span>
                <input
                  className="queue-edit"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveEdit();
                    } else if (e.key === "Escape") {
                      setEditingIdx(null);
                    }
                  }}
                  autoFocus
                />
                <button className="icon-btn" onClick={saveEdit} title="保存">
                  {CHECK_ICON}
                </button>
                <button className="icon-btn" onClick={() => setEditingIdx(null)} title="取消">
                  {CLOSE_ICON}
                </button>
              </div>
            ) : (
              <div className="queue-item" key={`f${i}`}>
                <span className="queue-tag">排队</span>
                <span className="queue-text">{t}</span>
                <button
                  className="icon-btn"
                  onClick={() => {
                    setEditingIdx(i);
                    setEditValue(t);
                  }}
                  title="编辑"
                >
                  {EDIT_ICON}
                </button>
                <button
                  className="icon-btn"
                  onClick={() => onPromoteToSteer(t)}
                  title="打断当前任务，立即发送"
                >
                  {GUIDE_ICON}
                </button>
                <button className="icon-btn" onClick={() => onRemoveFromQueue(t)} title="移出队列">
                  {TRASH_ICON}
                </button>
              </div>
            ),
          )}
        </div>
      )}
      <div className="composer-row">
        {mention.open && (
          <MentionPicker
            trigger={mention.trigger}
            dir={mention.dir}
            query={mention.query}
            items={mention.items}
            index={mention.index}
            loading={mention.loading}
            onSelect={insertItem}
            onEnterDir={enterDir}
            onBack={() =>
              enterDir(
                mention.dir.includes("/") ? mention.dir.slice(0, mention.dir.lastIndexOf("/")) : "",
              )
            }
            onHover={(i) => dispatch({ type: "index", index: i })}
          />
        )}
        <textarea
          ref={taRef}
          value={text}
          onChange={onInput}
          onKeyDown={onKeyDown}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          rows={1}
          autoFocus
        />
        <button
          className="btn-send"
          onClick={() => {
            if (showStop) {
              onAbort();
              return;
            }
            const t = trimmed;
            if (!t) return;
            if (streaming) onFollowUp(t);
            else onPrompt(t);
            setText("");
          }}
          disabled={!showStop && !trimmed}
          title={showStop ? "停止当前任务" : "发送"}
        >
          {showStop ? STOP_ICON : SEND_ICON}
        </button>
      </div>
    </div>
  );
}
