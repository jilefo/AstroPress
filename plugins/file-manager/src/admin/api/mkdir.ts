import type { APIRoute } from "astro";
import * as fs from "node:fs/promises";
import { errMsg, json, sameOrigin } from "../../lib/http";
import { PathError, assertWritableRel, resolveSafe } from "../../lib/paths";
import { hasFileSystem, envNotSupported } from "@astropress/core";

/** POST /admin-ext/api/files/mkdir {path} — path 为待建目录的相对路径 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasFileSystem()) return envNotSupported("文件管理");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  if (!sameOrigin(request)) return json({ error: "CSRF 校验失败" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求体必须是 JSON" }, 400);
  }
  const rel = body?.path;
  if (typeof rel !== "string" || !rel.trim()) return json({ error: "缺少 path" }, 400);

  try {
    assertWritableRel(rel);
    const abs = resolveSafe(rel);
    await fs.mkdir(abs);
    return json({ ok: true, path: rel.replace(/\\/g, "/") });
  } catch (e: any) {
    if (e instanceof PathError) return json({ error: e.message }, e.status);
    if (e?.code === "EEXIST") return json({ error: "同名文件或目录已存在" }, 409);
    if (e?.code === "ENOENT") return json({ error: "父目录不存在" }, 400);
    return json({ error: errMsg(e) }, 400);
  }
};
