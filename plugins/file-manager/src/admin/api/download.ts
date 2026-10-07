import type { APIRoute } from "astro";
import * as fs from "node:fs/promises";
import { basename } from "node:path";
import { errMsg, json } from "../../lib/http";
import { PathError, resolveSafe } from "../../lib/paths";
import { hasFileSystem, envNotSupported } from "@astropress/core";

/**
 * GET /admin-ext/api/files/download?path= — 流式下载单文件（目录 400）。
 * 分块读取，Content-Disposition attachment。
 */
export const GET: APIRoute = async ({ locals, request }) => {
  if (!hasFileSystem()) return envNotSupported("文件管理");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);

  const rel = new URL(request.url).searchParams.get("path") ?? "";
  if (!rel) return json({ error: "缺少 path 参数" }, 400);

  try {
    const abs = resolveSafe(rel);
    const st = await fs.stat(abs).catch(() => null);
    if (!st) return json({ error: "文件不存在" }, 404);
    if (st.isDirectory()) return json({ error: "目录不能下载，请使用打包 ZIP" }, 400);

    const fh = await fs.open(abs, "r");
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

    const name = basename(abs);
    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(st.size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof PathError) return json({ error: e.message }, e.status);
    return json({ error: errMsg(e) }, 400);
  }
};
