import type { IncomingMessage, ServerResponse } from "node:http";

export function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

export function sendError(res: ServerResponse, status: number, message: string) {
  sendJson(res, status, { error: message });
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (!body) return {};
  return JSON.parse(body);
}
