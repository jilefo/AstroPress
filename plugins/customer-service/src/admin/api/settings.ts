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

  const color = String(body.primaryColor ?? "#2271b1");
  const db = (locals as any).db;
  const settings = await saveSettings(db, {
    enabled: !!body.enabled,
    title: String(body.title ?? "联系客服").slice(0, 40),
    qq: String(body.qq ?? "").slice(0, 30),
    wechat: String(body.wechat ?? "").slice(0, 60),
    telegram: String(body.telegram ?? "").slice(0, 60),
    email: String(body.email ?? "").slice(0, 120),
    phone: String(body.phone ?? "").slice(0, 40),
    workingHours: String(body.workingHours ?? "").slice(0, 120),
    position: body.position === "bottom-left" ? "bottom-left" : "bottom-right",
    primaryColor: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#2271b1",
  });
  return json({ ok: true, settings });
};
