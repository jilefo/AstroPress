import type { APIRoute } from "astro";
import { loadSettings, saveSettings, MAX_RULES } from "../../lib/settings";

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

  // 数值边界（limit 1~100000、windowSec 1~3600）、规则数量（最多 30 条）与
  // 名称/前缀截断、方法归一化均在 saveSettings 内的 normalizeSettings 统一处理
  const rules = Array.isArray(body?.rules) ? body.rules.slice(0, MAX_RULES) : [];

  const db = (locals as any).db;
  const settings = await saveSettings(db, {
    enabled: !!body?.enabled,
    rules,
  });
  return json({ ok: true, settings });
};
