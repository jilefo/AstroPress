import type { APIRoute } from "astro";
import { hasFileSystem, envNotSupported } from "@astropress/core";
import * as fs from "node:fs/promises";
import { errMsg, json, sameOrigin } from "../../lib/http";
import {
  PathError,
  assertWritableRel,
  resolveSafe,
} from "../../lib/paths";

/** POST /admin-ext/api/files/delete {paths[], confirm} — 递归删除文件/目录 */
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

  const paths = body?.paths;
  if (!Array.isArray(paths) || !paths.length) {
    return json({ error: "缺少 paths 数组" }, 400);
  }

  const deleted: string[] = [];
  const errors: string[] = [];
  for (const rel of paths) {
    if (typeof rel !== "string" || !rel.trim()) {
      errors.push("存在空路径，已跳过");
      continue;
    }
    try {
      assertWritableRel(rel);
      const abs = resolveSafe(rel);
      await fs.rm(abs, { recursive: true, force: false });
      deleted.push(rel.replace(/\\/g, "/"));
    } catch (e: any) {
      if (e instanceof PathError) {
        errors.push(`${rel}: ${e.message}`);
      } else if (e?.code === "ENOENT") {
        errors.push(`${rel}: 不存在`);
      } else {
        errors.push(`${rel}: ${errMsg(e)}`);
      }
    }
  }

  if (!deleted.length && errors.length) return json({ error: errors.join("；") }, 400);
  return json({ ok: errors.length === 0, deleted, errors });
};
