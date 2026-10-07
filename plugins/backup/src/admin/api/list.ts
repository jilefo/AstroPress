import type { APIRoute } from "astro";
import { json } from "../../lib/http";
import { listBackupEntries } from "../../lib/backup-core";

/** GET /admin-ext/api/backup/list — 备份列表（manifest 解析失败仅返回文件信息） */
export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);

  try {
    const entries = await listBackupEntries();
    return json({ entries });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
};
