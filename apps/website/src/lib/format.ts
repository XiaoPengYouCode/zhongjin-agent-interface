export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "刚刚";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} 天前`;
  return new Date(iso).toLocaleDateString();
}

export function shortId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

export function toolArgsPreview(args: unknown): string {
  if (args == null) return "";
  const s = JSON.stringify(args);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}
