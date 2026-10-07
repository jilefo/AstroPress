import type { APIRoute } from "astro";
import { loadSettings, saveSettings } from "../../lib/settings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

function sanitizeUrl(v: unknown): string {
  const s = String(v ?? "").trim().slice(0, 500);
  if (!s) return "";
  // 允许站内路径（/media/...）与 http(s) 外链，拒绝 javascript: 等协议
  if (s.startsWith("/")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  return "";
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
    buttonText: String(body.buttonText ?? "☕ 打赏支持").slice(0, 40),
    heading: String(body.heading ?? "打赏支持").slice(0, 80),
    message: String(body.message ?? "").slice(0, 200),
    wechatQr: sanitizeUrl(body.wechatQr),
    alipayQr: sanitizeUrl(body.alipayQr),
    paypalLink: sanitizeUrl(body.paypalLink),
    applePayQr: sanitizeUrl(body.applePayQr),
    googlePayQr: sanitizeUrl(body.googlePayQr),
    afdianLink: sanitizeUrl(body.afdianLink),
    position: "after_content",
  });
  return json({ ok: true, settings });
};
