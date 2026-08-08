import uFuzzy from "@leeoniya/ufuzzy";
import type { ReactNode } from "react";

export type MentionTrigger = "@" | "$";

/** @ / $ 触发检测的纯函数结果。 */
export interface MentionMatch {
  trigger: MentionTrigger;
  query: string;
  /** 触发符在输入串中的位置。 */
  triggerPos: number;
}

/** 检测光标前是否处于 @ 或 $ 触发状态（行首或空白后）。 */
export function detectMention(value: string, caret: number): MentionMatch | null {
  const before = value.slice(0, caret);
  const m = /(^|\s)([@$])([\w\-./]*)$/.exec(before);
  if (!m) return null;
  return {
    trigger: m[2] as MentionTrigger,
    query: m[3],
    triggerPos: caret - m[3].length - 1,
  };
}

/** 选择器候选条目。 */
export interface PickerItem {
  name: string;
  kind: "file" | "dir" | "skill";
  insert: string;
  hint?: string;
  icon: ReactNode;
}

/** 模糊检索（fzf 风格）：query 为空返回全部。 */
const uf = new uFuzzy({});

export function fuzzyFilter<T extends { name: string }>(items: T[], query: string): T[] {
  if (!query) return items;
  const names = items.map((i) => i.name);
  const idxs = uf.filter(names, query);
  if (!idxs || idxs.length === 0) return [];
  const info = uf.info(idxs, names, query);
  const order = uf.sort(info, names, query);
  // sort 返回的是 filter 结果的位置 k，需经 idxs[k] 映射回条目。
  return order.map((k) => items[idxs[k]]);
}

/** 一次性计算所有条目的匹配区间（name → [[start,end],...]），用于高亮。 */
export function buildRangesMap<T extends { name: string }>(
  items: T[],
  query: string,
): Map<string, Array<[number, number]>> {
  const map = new Map<string, Array<[number, number]>>();
  if (!query) return map;
  const names = items.map((i) => i.name);
  const idxs = uf.filter(names, query);
  if (!idxs || idxs.length === 0) return map;
  const info = uf.info(idxs, names, query);
  idxs.forEach((ni, k) => {
    const flat = info.ranges[k];
    if (!flat || flat.length === 0) return;
    const pairs: Array<[number, number]> = [];
    for (let j = 0; j + 1 < flat.length; j += 2) pairs.push([flat[j], flat[j + 1]]);
    map.set(names[ni], pairs);
  });
  return map;
}
