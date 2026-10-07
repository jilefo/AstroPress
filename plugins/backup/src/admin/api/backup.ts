import type { APIRoute } from "astro";
import * as fs from "node:fs/promises";
import { resolve, sep } from "node:path";
import { backupDir, ensureBackupDir } from "../../lib/paths";
import { backupPath, isSafeBackupName } from "../../lib/backup-core";
import { json, sameOrigin } from "../../lib/http";
import { hasFileSystem, envNotSupported } from "@astropress/core";

/**
 * DELETE /admin-ext/api/backup?file=
 * 白名单 + 路径二次校验后删除。
 */
export const DELETE: APIRoute = async ({ locals, request }) => {
  if (!hasFileSystem()) return envNotSupported("备份与恢复");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  if (!sameOrigin(request)) return json({ error: "CSRF 校验失败" }, 403);

  const file = new URL(request.url).searchParams.get("file") ?? "";
  if (!isSafeBackupName(file)) return json({ error: "非法的备份文件名" }, 400);

  const dir = await ensureBackupDir();
  const abs = resolve(backupPath(file));
  if (abs !== resolve(dir, file) || !abs.startsWith(resolve(backupDir) + sep)) {
    return json({ error: "非法路径" }, 400);
  }

  try {
    await fs.unlink(abs);
  } catch {
    return json({ error: "备份不存在" }, 404);
  }
  return json({ ok: true, file });
};
