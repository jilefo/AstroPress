import type { APIRoute } from "astro";
import { createDriver, DriverError } from "../../lib/drivers";
import { json, sameOrigin } from "../../lib/http";
import { loadSettings } from "../../lib/settings";
import { hasChildProcess, envNotSupported } from "@astropress/core";

/**
 * POST /admin-ext/api/git-sync/test
 * 用已保存的设置测试与远端仓库的连通性（GET /repos/{owner}/{repo}）。
 * 平台 HTTP 错误透传状态码与平台 message。
 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasChildProcess()) return envNotSupported("Git 连接测试");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);
  if (!sameOrigin(request)) return json({ error: "CSRF 校验失败" }, 403);

  const settings = await loadSettings(db);
  try {
    const driver = createDriver(settings);
    const info = await driver.testConnection();
    return json({ ok: true, platform: driver.platform, info });
  } catch (e) {
    if (e instanceof DriverError) {
      return json({ error: e.message }, e.status >= 400 ? e.status : 502);
    }
    // 非驱动异常（DB/内部错误）不透传原始消息，只留服务端日志
    console.error("[git-sync] 连接测试异常：", e);
    return json({ error: "连接测试失败（内部错误，详情见服务器日志）" }, 502);
  }
};
