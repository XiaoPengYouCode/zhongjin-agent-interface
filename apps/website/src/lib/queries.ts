/**
 * 集中定义 tanstack-query 的 query keys —— 单一来源，避免各处拼 key。
 *
 * 会话模型：
 * - 全局数据（不随会话变）：sessions、skills、fs（目录浏览/搜索按 dir+query）
 * - 会话级数据（key 带 sessionId，切换会话自动重取、缓存天然隔离）：
 *   stats（用量）、models（模型列表 + 当前模型 + think 等级）
 */
export const qk = {
  /** 会话列表（侧边栏）。 */
  sessions: ["sessions"] as const,
  /** 用量统计：会话级。 */
  stats: (sessionId: string) => ["stats", sessionId] as const,
  /** 模型列表 + 当前模型 + think 等级：会话级（current 随会话变）。 */
  models: (sessionId: string) => ["models", sessionId] as const,
  /** skills 列表：全局（agentDir + cwd 加载）。 */
  skills: ["skills"] as const,
  /** 目录浏览（query 为空）或递归搜索（query ≥2 字符）：按 dir+query 缓存。 */
  fs: (dir: string, query: string) => ["fs", dir, query] as const,
};
