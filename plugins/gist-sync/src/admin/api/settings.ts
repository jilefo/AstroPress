import type { APIRoute } from "astro";
import { loadSettings, saveSettings } from "../../lib/settings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

/**
 * GET /admin-ext/api/gist-sync/settings
 * 返回设置；token 掩码为 ****（hasToken 标记是否存在），绝不明文回显。
 */
export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);

  const s = await loadSettings(db);
  return json({
    ok: true,
    settings: {
      token: s.token ? "****" : "",
      hasToken: !!s.token,
      gistId: s.gistId,
      filename: s.filename,
      description: s.description,
    },
  });
};

/**
 * POST /admin-ext/api/gist-sync/settings {token?, gistId?, filename?, description?}
 * 写操作：同源校验。token 提交空值不覆盖已存 token。
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  const next = await saveSettings(db, {
    token: typeof body.token === "string" ? body.token.trim() : undefined,
    gistId: typeof body.gistId === "string" ? body.gistId : undefined,
    filename: typeof body.filename === "string" ? body.filename : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
  });

  return json({
    ok: true,
    settings: {
      token: next.token ? "****" : "",
      hasToken: !!next.token,
      gistId: next.gistId,
      filename: next.filename,
      description: next.description,
    },
  });
};
