import type { APIRoute } from "astro";
import { loadSettings, saveSettings } from "../../lib/settings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** textarea 每行一个 URL，前端已按行拆分为字符串数组 */
function toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0)
    .slice(0, 10);
}

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

  const db = (locals as any).db;
  const settings = await saveSettings(db, {
    enabled: !!body.enabled,
    removeComments: !!body.removeComments,
    collapseWhitespace: !!body.collapseWhitespace,
    resourceHints: !!body.resourceHints,
    dnsPrefetch: toStringArray(body.dnsPrefetch),
    preconnect: toStringArray(body.preconnect),
  });
  return json({ ok: true, settings });
};
