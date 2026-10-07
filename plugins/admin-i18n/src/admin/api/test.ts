import type { APIRoute } from "astro";
import { effectiveWebhook, loadSettings } from "../../lib/settings";
import { callWebhook, normalizeTranslations, sanitizeTexts } from "../../lib/webhook";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** POST /admin-ext/api/i18n/test — send sample texts to the n8n webhook. */
export const POST: APIRoute = async ({ locals, request }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);

  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  const settings = await loadSettings(db);
  const webhook = effectiveWebhook(settings);
  if (!webhook) return json({ configured: false, error: "未配置翻译 Webhook 地址（请在设置中填写，或配置 AP_N8N_WEBHOOK_URL 环境变量）" });

  let texts = ["Dashboard", "Add New", "Excerpt"];
  try {
    const body = (await request.json()) as any;
    const custom = sanitizeTexts(body?.texts);
    if (custom.length) texts = custom.slice(0, 5);
  } catch { /* default sample */ }

  const started = Date.now();
  try {
    const { translations, raw } = await callWebhook(webhook, texts, settings.target);
    return json({ configured: true, texts, translations, raw, latencyMs: Date.now() - started });
  } catch (err) {
    return json({ configured: true, texts, latencyMs: Date.now() - started, error: String((err as Error)?.message ?? err) });
  }
};

/** GET — echo the expected contract for quick reference. */
export const GET: APIRoute = async () =>
  json({
    contract: {
      request: { texts: ["Dashboard", "Add New"], target: "zh-CN" },
      response: { translations: { Dashboard: "仪表盘", "Add New": "新建" } },
      acceptedAlternatives: "flat map, {data:{...}} wrapper, or rows [{original, translation}]",
    },
    normalizedSample: normalizeTranslations(
      { data: [{ original: "Dashboard", translation: "仪表盘" }] },
      ["Dashboard"]
    ),
  });
