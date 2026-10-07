import type { APIRoute } from "astro";
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { json, errMsg } from "../../lib/http";
import { ensureStorageRoot, storageRoot } from "../../lib/paths";
import { hasFileSystem, envNotSupported } from "@astropress/core";

/** 递归统计存储目录：文件数 + 总字节数 */
async function walk(dir: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const dirents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const d of dirents) {
    const abs = join(dir, d.name);
    try {
      if (d.isDirectory()) {
        const sub = await walk(abs);
        files += sub.files;
        bytes += sub.bytes;
      } else if (d.isFile()) {
        const st = await fs.stat(abs);
        files += 1;
        bytes += st.size;
      }
    } catch {
      // 枚举期间被删除的条目跳过
    }
  }
  return { files, bytes };
}

/** GET /admin-ext/api/webdav/stats — 存储目录磁盘占用统计 */
export const GET: APIRoute = async ({ locals }) => {
  if (!hasFileSystem()) return envNotSupported("WebDAV 存储");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  try {
    await ensureStorageRoot();
    const { files, bytes } = await walk(storageRoot);
    return json({ ok: true, files, bytes, dir: storageRoot });
  } catch (e) {
    return json({ error: errMsg(e) }, 500);
  }
};
