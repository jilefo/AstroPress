import type { APIRoute } from "astro";
import { loadSettings } from "../../lib/settings";
import { loadStrings, saveStrings } from "../../lib/strings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals, url }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);
  const settings = await loadSettings(db);
  const code = url.searchParams.get("code") ?? settings.defaultLang;
  return json({ code, strings: await loadStrings(db, code, settings.defaultLang) });
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: { code?: string; strings?: Record<string, string> };
  try {
    body = (await request.json()) as { code?: string; strings?: Record<string, string> };
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }
  if (!body.code || typeof body.strings !== "object" || body.strings === null)
    return json({ error: "缺少语言代码 code 或文案 strings" }, 400);
  for (const [k, v] of Object.entries(body.strings)) {
    if (typeof v !== "string") return json({ error: `"${k}" 的值必须是字符串` }, 400);
  }
  await saveStrings(db, body.code, body.strings);
  return json({ ok: true });
};
