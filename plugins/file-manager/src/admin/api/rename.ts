import type { APIRoute } from "astro";
import { hasFileSystem, envNotSupported } from "@astropress/core";
import * as fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { errMsg, json, sameOrigin } from "../../lib/http";
import {
  PathError,
  assertWritableRel,
  resolveSafe,
} from "../../lib/paths";

/**
 * POST /admin-ext/api/files/rename {path, to, confirm}
 * to 为新名称（basename），不允许含路径分隔符；目标已存在则 409。
 */
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
  if (body?.confirm !== true) return json({ error: "需要 confirm:true 确认" }, 403);

  const rel = body?.path;
  const to = body?.to;
  if (typeof rel !== "string" || !rel.trim()) return json({ error: "缺少 path" }, 400);
  if (typeof to !== "string" || !to.trim()) return json({ error: "缺少新名称 to" }, 400);
  if (to.includes("/") || to.includes("\\") || to === "." || to === "..") {
    return json({ error: "新名称不允许包含路径分隔符" }, 400);
  }
  if (to.includes("\0")) return json({ error: "非法的新名称" }, 400);

  try {
    assertWritableRel(rel);
    assertWritableRel(to);
    const abs = resolveSafe(rel);
    const st = await fs.stat(abs).catch(() => null);
    if (!st) return json({ error: "目标不存在" }, 404);

    const parent = dirname(abs);
    const newAbs = join(parent, to);
    const exists = await fs.stat(newAbs).catch(() => null);
    if (exists) return json({ error: "同名文件或目录已存在" }, 409);

    await fs.rename(abs, newAbs);
    return json({ ok: true, from: rel.replace(/\\/g, "/"), to });
  } catch (e) {
    if (e instanceof PathError) return json({ error: e.message }, e.status);
    return json({ error: errMsg(e) }, 400);
  }
};
