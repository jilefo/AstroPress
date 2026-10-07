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

  // 取值合法性（枚举、长度、CR/LF、数值范围）统一由 saveSettings 规范化
  const db = (locals as any).db;
  const settings = await saveSettings(db, {
    enabled: !!body.enabled,
    nosniff: !!body.nosniff,
    frameOptions: body.frameOptions,
    referrerPolicy: String(body.referrerPolicy ?? ""),
    permissionsPolicy: String(body.permissionsPolicy ?? ""),
    hstsMaxAge: Number(body.hstsMaxAge),
    csp: String(body.csp ?? ""),
    cspReportOnly: !!body.cspReportOnly,
  });
  return json({ ok: true, settings });
};
