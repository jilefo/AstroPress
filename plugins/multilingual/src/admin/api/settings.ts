import type { APIRoute } from "astro";
import { loadSettings, saveSettings } from "../../lib/settings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);
  return json(await loadSettings(db));
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);

  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  try {
    // saveSettings sanitizes: code format, duplicates, defaultLang membership,
    // urlStrategy enum — invalid languages are rejected with a 400.
    const clean = await saveSettings(db, body);
    return json({ ok: true, settings: clean });
  } catch {
    return json({ error: "languages 必须是合法语言代码数组（如 zh-hans）" }, 400);
  }
};
