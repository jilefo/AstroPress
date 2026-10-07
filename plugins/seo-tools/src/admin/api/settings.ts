import type { APIRoute } from "astro";
import { loadSettings, saveSettings } from "../../lib/settings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);
  const s = await loadSettings(db);
  return json(s);
};

export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);

  const current = await loadSettings(db);

  const feedEnabled = typeof body.feedEnabled === "boolean" ? body.feedEnabled : current.feedEnabled;
  let feedCount = typeof body.feedCount === "number" ? body.feedCount : current.feedCount;
  feedCount = Math.max(1, Math.min(100, feedCount));
  const feedTitle = typeof body.feedTitle === "string" ? body.feedTitle : current.feedTitle;
  const feedDescription = typeof body.feedDescription === "string" ? body.feedDescription : current.feedDescription;
  const robotsExtra = typeof body.robotsExtra === "string" ? body.robotsExtra : current.robotsExtra;

  const updated = await saveSettings(db, { feedEnabled, feedCount, feedTitle, feedDescription, robotsExtra });
  return json({ ok: true, settings: updated });
};
