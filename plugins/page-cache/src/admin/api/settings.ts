import type { APIRoute } from "astro";
import { loadSettings, saveSettings, MAX_EXCLUDES, EXCLUDE_MAX_LEN } from "../../lib/settings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  const settings = await loadSettings(db);
  return json(settings);
};

export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  // 数值边界（ttlSec 1~86400、maxEntries 10~5000）与 excludes（每项截 200 字符、最多 30 项）
  // 在 saveSettings 内的 normalizeSettings 统一处理
  const excludes = Array.isArray(body.excludes)
    ? body.excludes.slice(0, MAX_EXCLUDES).map((x: unknown) => String(x ?? "").slice(0, EXCLUDE_MAX_LEN))
    : [];

  const db = (locals as any).db;
  const settings = await saveSettings(db, {
    enabled: !!body.enabled,
    ttlSec: body.ttlSec,
    maxEntries: body.maxEntries,
    cache404: !!body.cache404,
    cacheWithQuery: !!body.cacheWithQuery,
    excludes,
  });
  return json({ ok: true, settings });
};
