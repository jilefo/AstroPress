import type { APIRoute } from "astro";
import { effectiveWebhook, invalidateSettingsCache, loadSettings, saveSettings } from "../../lib/settings";
import { DICTIONARY } from "../../lib/dictionary";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);
  const settings = await loadSettings(db);
  return json({
    ...settings,
    configured: Boolean(effectiveWebhook(settings)),
    hasEnvWebhook: Boolean((process.env.AP_N8N_WEBHOOK_URL ?? "").trim()),
    dictCount: Object.keys(DICTIONARY).length,
  });
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);

  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }
  if (typeof body?.enabled !== "boolean") return json({ error: "enabled 必须是布尔值 true/false" }, 400);
  const target = typeof body.target === "string" && body.target.trim() ? body.target.trim() : "zh-CN";
  if (!/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(target)) return json({ error: `目标语言代码不正确：${target}` }, 400);
  const webhookUrl = typeof body.webhookUrl === "string" ? body.webhookUrl.trim() : "";
  if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) return json({ error: "Webhook 地址必须是合法的 http(s) URL" }, 400);

  await saveSettings(db, { enabled: body.enabled, target, webhookUrl });
  invalidateSettingsCache();
  return json({ ok: true });
};
