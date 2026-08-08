import type { ReactNode } from "react";
import { diffLines } from "diff";

// ---------------------------------------------------------------------------
// Per-tool metadata: icon + human-readable summary (no raw JSON in the UI).
// ---------------------------------------------------------------------------

export type ToolKind = "terminal" | "edit" | "write" | "read" | "other";

function icon(paths: ReactNode, viewBox = "0 0 24 24"): ReactNode {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths}
    </svg>
  );
}

const TERMINAL_ICON = icon(
  <>
    <path d="M4 17l6-6-6-6M12 19h8" />
  </>,
);
const EDIT_ICON = icon(
  <>
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </>,
);
const WRITE_ICON = icon(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
  </>,
);
const READ_ICON = icon(
  <>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </>,
);
const DEFAULT_ICON = icon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </>,
);

export function toolIcon(name: string): ReactNode {
  switch (name) {
    case "bash":
    case "terminal":
    case "shell":
      return TERMINAL_ICON;
    case "edit":
    case "patch":
      return EDIT_ICON;
    case "write":
    case "create":
      return WRITE_ICON;
    case "read":
    case "view":
      return READ_ICON;
    default:
      return DEFAULT_ICON;
  }
}

export function toolKind(name: string): ToolKind {
  switch (name) {
    case "bash":
    case "terminal":
    case "shell":
      return "terminal";
    case "edit":
      return "edit";
    case "write":
      return "write";
    case "read":
      return "read";
    default:
      return "other";
  }
}

function fileName(path: string): string {
  const p = String(path ?? "");
  const parts = p.split("/");
  return parts[parts.length - 1] || p;
}

interface EditSummary {
  n: number;
  added: number;
  removed: number;
}

type SummaryResult = string | EditSummary;

function summarizeArgs(name: string, args: Record<string, unknown>): SummaryResult {
  switch (name) {
    case "bash": {
      const cmd = String(args.command ?? "");
      // 单行展示命令，避免超长；真正的完整命令在展开后可见。
      return cmd.replace(/\s+/g, " ").slice(0, 120);
    }
    case "read": {
      return String(args.path ?? "");
    }
    case "write": {
      const path = String(args.path ?? "");
      const lines = String(args.content ?? "").split("\n").length;
      return `${path}（新增 ${lines} 行）`;
    }
    case "edit": {
      const edits = Array.isArray(args.edits)
        ? (args.edits as Array<{ oldText?: string; newText?: string }>)
        : [];
      // 折叠态展示修改规模：N 处 · +新增/-删除 行数。
      let added = 0;
      let removed = 0;
      for (const e of edits) {
        const parts = diffLines(e.oldText ?? "", e.newText ?? "");
        for (const p of parts) {
          if (p.added) added += p.value.split("\n").filter(Boolean).length;
          else if (p.removed) removed += p.value.split("\n").filter(Boolean).length;
        }
      }
      const n = edits.length;
      return { n, added, removed };
    }
    default: {
      // 取 1-2 个非大对象的字段做摘要。
      const parts: string[] = [];
      for (const [k, v] of Object.entries(args)) {
        if (v == null) continue;
        if (typeof v === "string") parts.push(`${k}: ${v.slice(0, 60)}`);
        else if (typeof v === "number" || typeof v === "boolean") parts.push(`${k}: ${v}`);
        if (parts.length >= 2) break;
      }
      return parts.join(" · ");
    }
  }
}

/** 工具摘要：text 用于 title，node 用于显示（edit 带 +绿/-红）。 */
export function toolSummary(
  name: string,
  args: Record<string, unknown>,
): { text: string; node: ReactNode } {
  const edit = summarizeArgs(name, args) as unknown;
  if (name === "edit" && edit && typeof edit === "object") {
    const { n, added, removed } = edit as { n: number; added: number; removed: number };
    return {
      text: `${n} 处 · +${added}/-${removed}`,
      node: (
        <>
          {n} 处 · <span className="summary-add">+{added}</span>/
          <span className="summary-del">-{removed}</span>
        </>
      ),
    };
  }
  const text = name === "read" ? fileName(String(args.path ?? "")) || String(edit) : String(edit);
  return { text, node: text };
}
