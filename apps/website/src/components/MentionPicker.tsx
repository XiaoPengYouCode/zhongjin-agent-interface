import { useMemo } from "react";
import { buildRangesMap } from "../lib/mention.ts";
import type { PickerItem } from "../lib/mention.ts";
import { MdFolder } from "react-icons/md";

interface MentionPickerProps {
  trigger: "@" | "$";
  dir: string;
  query: string;
  items: PickerItem[];
  index: number;
  loading: boolean;
  onSelect: (item: PickerItem) => void;
  onEnterDir: (dir: string) => void;
  onBack: () => void;
  onHover: (i: number) => void;
}

/** 高亮 name 中匹配 query 的片段。 */
function Highlighted({ name, ranges }: { name: string; ranges?: Array<[number, number]> }) {
  if (!ranges || ranges.length === 0) return <>{name}</>;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(name.slice(cursor, start));
    parts.push(<mark key={start}>{name.slice(start, end)}</mark>);
    cursor = end;
  }
  if (cursor < name.length) parts.push(name.slice(cursor));
  return <>{parts}</>;
}

/** @ 文件 / $ skills 选择器浮层（受控组件，纯渲染）。 */
export function MentionPicker({
  trigger,
  dir,
  query,
  items,
  index,
  loading,
  onSelect,
  onEnterDir,
  onBack,
  onHover,
}: MentionPickerProps) {
  const rangesMap = useMemo(() => buildRangesMap(items, query), [items, query]);

  return (
    <div className="picker">
      {loading && items.length > 0 && <div className="picker-progress" />}
      {trigger === "@" && dir && (
        <div className="picker-path">
          <MdFolder />
          <span>{dir}</span>
        </div>
      )}
      {trigger === "@" && dir && (
        <button
          className="picker-item"
          onMouseDown={(e) => {
            e.preventDefault();
            onBack();
          }}
        >
          <span className="picker-icon picker-icon-dir">
            <MdFolder />
          </span>
          <span className="picker-name">..</span>
          <span className="picker-hint">上级</span>
        </button>
      )}
      {loading && items.length === 0 && <div className="picker-loading">加载中…</div>}
      {!loading && items.length === 0 && <div className="picker-loading">没有匹配的结果</div>}
      {items.map((it, i) => (
        <button
          key={`${it.kind}-${it.name}`}
          className={`picker-item ${i === index ? "active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            if (it.kind === "dir") onEnterDir(it.insert);
            else onSelect(it);
          }}
          onMouseEnter={() => onHover(i)}
        >
          <span className={`picker-icon picker-icon-${it.kind}`}>{it.icon}</span>
          <span className="picker-name">
            <Highlighted name={it.name} ranges={rangesMap.get(it.name)} />
          </span>
          <span className="picker-hint">{it.hint}</span>
        </button>
      ))}
    </div>
  );
}
