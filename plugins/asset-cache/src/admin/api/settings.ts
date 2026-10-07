import type { APIRoute } from "astro";
import { loadSettings, saveSettings } from "../../lib/settings";

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

  // 数值边界（0~31536000）、extraRules 去重/限项（最多 30 条）统一由 saveSettings 规范化
  const extraRules = Array.isArray(body.extraRules)
    ? body.extraRules.map((x: any) => ({ ext: String(x?.ext ?? ""), maxAge: Number(x?.maxAge) }))
    : [];

  const db = (locals as any).db;
  const settings = await saveSettings(db, {
    enabled: !!body.enabled,
    astroMaxAge: body.astroMaxAge,
    mediaMaxAge: body.mediaMaxAge,
    staticMaxAge: body.staticMaxAge,
    forceOverride: !!body.forceOverride,
    extraRules,
  });
  return json({ ok: true, settings });
};
