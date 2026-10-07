import type { APIRoute } from "astro";
import { ApiError, createBackup } from "../../lib/backup-core";
import { json, sameOrigin } from "../../lib/http";

/**
 * POST /admin-ext/api/backup/create {includeMedia?: boolean}
 * 在内存中生成 .apzip 后写入 backups/。
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);
  if (!sameOrigin(request)) return json({ error: "CSRF 校验失败" }, 403);

  // 空体允许（默认包含媒体）；非空但必须是合法 JSON，畸形 body 返回 400，
  // 避免无效请求静默触发一次完整备份。
  let body: any = {};
  const raw = await request.text().catch(() => "");
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "请求体必须是合法 JSON" }, 400);
    }
    if (body === null || typeof body !== "object") {
      return json({ error: "请求体必须是 JSON 对象" }, 400);
    }
  }
  const includeMedia = body?.includeMedia !== false;

  try {
    const result = await createBackup(db, includeMedia);
    return json({
      ok: true,
      entry: {
        file: result.file,
        size: result.size,
        sizeMB: Math.round((result.size / 1024 / 1024) * 100) / 100,
        createdAt: result.manifest.createdAt,
        mediaCount: result.manifest.mediaCount,
        tablesCount: result.manifest.tables.length,
        skipped: result.mediaSkipped,
      },
    });
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
};
