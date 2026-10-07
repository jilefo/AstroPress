import type { APIRoute } from "astro";
import { effectiveWebhook, loadSettings } from "../../lib/settings";
import { callWebhook, sanitizeTexts } from "../../lib/webhook";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/**
 * Login-protected proxy between the client engine and the user's n8n
 * webhook: keeps the webhook URL server-side (no CORS, no secret leak)
 * and lets the core session middleware gate access. The browser script
 * runs only inside logged-in admin pages, so cookies are always sent.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);

  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  const settings = await loadSettings(db);
  const webhook = effectiveWebhook(settings);
  if (!webhook) return json({ configured: false, translations: {} });

  let body: { texts?: unknown; target?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  const texts = sanitizeTexts(body.texts);
  if (!texts.length) return json({ configured: true, translations: {} });
  const target = typeof body.target === "string" && body.target.trim() ? body.target.trim() : settings.target;

  try {
    const { translations } = await callWebhook(webhook, texts, target);
    return json({ configured: true, translations });
  } catch (err) {
    return json({ configured: true, translations: {}, error: String((err as Error)?.message ?? err) }, 200);
  }
};
