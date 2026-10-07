import type { APIRoute } from "astro";
import { json, sameOrigin, errMsg } from "../../lib/http";
import { getToken, resetToken } from "../../lib/token";
import { hasFileSystem, envNotSupported } from "@astropress/core";

/**
 * GET  /admin-ext/api/webdav/token — 查询是否已生成 token（不返回明文）
 * POST /admin-ext/api/webdav/token — 生成/重置 token（body: { confirm: true }）
 */
export const GET: APIRoute = async ({ locals }) => {
  if (!hasFileSystem()) return envNotSupported("WebDAV 存储");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);
  try {
    const token = await getToken(db);
    return json({ hasToken: !!token });
  } catch (e) {
    return json({ error: errMsg(e) }, 500);
  }
};

export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasFileSystem()) return envNotSupported("WebDAV 存储");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  if (!sameOrigin(request)) return json({ error: "CSRF 校验失败" }, 403);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求体必须是 JSON" }, 400);
  }
  if (body?.confirm !== true) return json({ error: "缺少 confirm 确认" }, 400);

  try {
    const token = await resetToken(db);
    return json({ ok: true, token });
  } catch (e) {
    return json({ error: errMsg(e) }, 500);
  }
};
