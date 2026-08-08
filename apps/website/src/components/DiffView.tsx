import { useState } from "react";
import { diffLines } from "diff";

interface DiffViewProps {
  oldText: string;
  newText: string;
  defaultMode?: "split" | "unified";
}

interface Row {
  type: "ctx" | "del" | "add";
  oldLine: string | null;
  newLine: string | null;
}

function buildRows(oldText: string, newText: string): Row[] {
  const parts = diffLines(oldText, newText);
  const rows: Row[] = [];
  for (const part of parts) {
    const lines = part.value.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    if (part.added) {
      for (const l of lines) rows.push({ type: "add", oldLine: null, newLine: l });
    } else if (part.removed) {
      for (const l of lines) rows.push({ type: "del", oldLine: l, newLine: null });
    } else {
      for (const l of lines) rows.push({ type: "ctx", oldLine: l, newLine: l });
    }
  }
  return rows;
}

export function DiffView({ oldText, newText, defaultMode = "split" }: DiffViewProps) {
  const [mode, setMode] = useState<"split" | "unified">(defaultMode);
  const rows = buildRows(oldText, newText);

  const oldLines = rows.filter((r) => r.oldLine !== null).length;
  const newLines = rows.filter((r) => r.newLine !== null).length;
  const removed = rows.filter((r) => r.type === "del").length;
  const added = rows.filter((r) => r.type === "add").length;

  let oldNo = 0;
  let newNo = 0;

  return (
    <div className={`diff diff-${mode}`}>
      <div className="diff-head">
        <span className="diff-stats">
          <span className="diff-stat-add">+{added}</span>
          <span className="diff-stat-del">-{removed}</span>
          <span className="diff-stat-meta">
            {oldLines} → {newLines} 行
          </span>
        </span>
        <div className="diff-toggle" role="group">
          <button
            className={`diff-btn ${mode === "split" ? "active" : ""}`}
            onClick={() => setMode("split")}
            title="左右分栏"
          >
            左右
          </button>
          <button
            className={`diff-btn ${mode === "unified" ? "active" : ""}`}
            onClick={() => setMode("unified")}
            title="上下分栏"
          >
            上下
          </button>
        </div>
      </div>

      {mode === "split" ? (
        <div className="diff-split">
          <div className="diff-col">
            {rows.map((r, i) => {
              if (r.oldLine === null) return <div key={i} className="diff-line diff-gap" />;
              oldNo += 1;
              return (
                <div key={i} className={`diff-line diff-${r.type}`}>
                  <span className="diff-num">{oldNo}</span>
                  <code>{r.oldLine || " "}</code>
                </div>
              );
            })}
          </div>
          <div className="diff-col">
            {rows.map((r, i) => {
              if (r.newLine === null) return <div key={i} className="diff-line diff-gap" />;
              newNo += 1;
              return (
                <div key={i} className={`diff-line diff-${r.type}`}>
                  <span className="diff-num">{newNo}</span>
                  <code>{r.newLine || " "}</code>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="diff-unified">
          {rows.map((r, i) => {
            if (r.type === "add") newNo += 1;
            else oldNo += 1;
            return (
              <div key={i} className={`diff-line diff-${r.type}`}>
                <span className="diff-num">{r.type === "add" ? " " : oldNo}</span>
                <span className="diff-num">{r.type === "add" ? newNo : " "}</span>
                <code>{r.type === "add" ? r.newLine : r.oldLine}</code>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
