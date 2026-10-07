import type { APIRoute } from "astro";
import * as fs from "node:fs/promises";
import { errMsg, json } from "../../lib/http";
import { PathError, isProtectedRel, resolveSafe } from "../../lib/paths";
import { listDirectories } from "../../lib/fs-util";
import { siteRoot } from "../../lib/paths";
import { hasFileSystem, envNotSupported } from "@astropress/core";

/**
 * GET /admin-ext/api/files/dirs?path=
 * 返回指定目录（默认站点根）下的全部子目录（相对 posix 路径，最多 3 层），
 * 供复制/移动的目录选择器使用。自动跳过隐藏目录与 node_modules。
 */
export const GET: APIRoute = async ({ locals, request }) => {
  if (!hasFileSystem()) return envNotSupported("文件管理");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);

  const rel = new URL(request.url).searchParams.get("path") ?? "";
  try {
    if (isProtectedRel(rel)) return json({ dirs: [] });
    const abs = rel ? resolveSafe(rel) : siteRoot;
    const st = await fs.stat(abs).catch(() => null);
    if (!st || !st.isDirectory()) return json({ error: "目录不存在" }, 404);
    const dirs = await listDirectories(abs);
    return json({ path: rel, dirs });
  } catch (e) {
    if (e instanceof PathError) return json({ error: e.message }, e.status);
    return json({ error: errMsg(e) }, 400);
  }
};
