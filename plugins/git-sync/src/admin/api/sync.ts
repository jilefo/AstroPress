import type { APIRoute } from "astro";
import { DriverError } from "../../lib/drivers";
import { json, sameOrigin } from "../../lib/http";
import { loadSettings } from "../../lib/settings";
import { runSync } from "../../lib/sync";
import { hasChildProcess, envNotSupported } from "@astropress/core";

/**
 * POST /admin-ext/api/git-sync/sync {confirm:true}
 * 执行一次同步：逐文件 PUT 到远端仓库，响应返回汇总（总数/成功/失败/逐文件结果/警告）。
 * 长任务：媒体逐文件推送，前端需显示 spinner。
 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasChildProcess()) return envNotSupported("Git 同步（需要本地 Git 与文件系统）");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);
  if (!sameOrigin(request)) return json({ error: "CSRF 校验失败" }, 403);

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (body?.confirm !== true) return json({ error: "写操作必须先确认" }, 403);

  const settings = await loadSettings(db);
  try {
    const summary = await runSync(db, settings);
    return json({ ok: summary.ok, summary });
  } catch (e) {
    if (e instanceof DriverError) {
      return json({ error: e.message }, e.status >= 400 ? e.status : 502);
    }
    // 非驱动异常（DB/文件系统等内部错误）不透传原始消息，只留服务端日志
    console.error("[git-sync] 同步执行异常：", e);
    return json({ error: "同步执行失败（内部错误，详情见服务器日志）" }, 500);
  }
};
