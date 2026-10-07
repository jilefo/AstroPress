import type { APIRoute } from "astro";
import * as fs from "node:fs/promises";
import { resolve, sep } from "node:path";
import { backupDir, ensureBackupDir } from "../../lib/paths";
import { backupPath, isSafeBackupName } from "../../lib/backup-core";
import { json } from "../../lib/http";
import { hasFileSystem, envNotSupported } from "@astropress/core";

/**
 * GET /admin-ext/api/backup/download?file=
 * 文件名白名单 + 规范化路径二次校验，防穿越。
 * 分块流式返回 application/zip。
 */
export const GET: APIRoute = async ({ locals, request }) => {
  if (!hasFileSystem()) return envNotSupported("备份与恢复");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);

  const file = new URL(request.url).searchParams.get("file") ?? "";
  if (!isSafeBackupName(file)) return json({ error: "非法的备份文件名" }, 400);

  const dir = await ensureBackupDir();
  const abs = resolve(backupPath(file));
  const root = resolve(backupDir) + sep;
  if (abs !== resolve(dir, file) || !abs.startsWith(root)) {
    return json({ error: "非法路径" }, 400);
  }

  let fh: any;
  try {
    fh = await fs.open(abs, "r");
  } catch {
    return json({ error: "备份不存在" }, 404);
  }

  const stat = await fh.stat();
  const chunkSize = 1024 * 1024;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = new Uint8Array(chunkSize);
        const { bytesRead } = await fh.read(chunk, 0, chunkSize, null);
        if (!bytesRead) {
          await fh.close();
          controller.close();
          return;
        }
        controller.enqueue(chunk.subarray(0, bytesRead));
      } catch (e) {
        await fh.close().catch(() => undefined);
        controller.error(e);
      }
    },
    async cancel() {
      await fh.close().catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(stat.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file)}`,
      "Cache-Control": "no-store",
    },
  });
};
