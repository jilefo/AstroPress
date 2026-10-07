import type { APIRoute } from "astro";
import { wpOptions } from "@astropress/core/schema";
import { inArray } from "drizzle-orm";

/**
 * 公开健康检查端点 —— 部署者与运维一键确认所有绑定就绪。
 * 不依赖认证，可被健康监控系统（UptimeRobot/Pingdom/CF Status）直接轮询。
 */
export const GET: APIRoute = async ({ locals }) => {
  const t0 = Date.now();
  const env = (locals as any).runtime?.env || {};
  const db = (locals as any).db;

  // 1. 数据库连通性 + 关键选项（schema 版本、setup 完成标志）
  let dbOk = false;
  let dbError: string | null = null;
  let schemaVersion: string | null = null;
  let setupComplete = false;
  try {
    if (!db) throw new Error("db_not_injected");
    const rows = await db
      .select({ name: wpOptions.optionName, value: wpOptions.optionValue })
      .from(wpOptions)
      .where(inArray(wpOptions.optionName, ["astropress_db_schema_version", "astropress_setup_complete"]))
      .limit(2);
    dbOk = true;
    for (const r of rows) {
      if (r.name === "astropress_db_schema_version") schemaVersion = r.value;
      if (r.name === "astropress_setup_complete") setupComplete = r.value === "1";
    }
  } catch (e: any) {
    dbError = (e?.message || "DB_ERROR").slice(0, 200);
  }

  // 2. 存储（R2）绑定检测
  const r2Ok = !!env.R2;

  // 3. AI（Workers AI）绑定检测
  const aiOk = !!env.AI;

  const healthy = dbOk && r2Ok;
  const payload = {
    ok: healthy,
    version: "1.0.3",
    environment: env.DB ? "cloudflare" : "nodejs",
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - t0,
    checks: {
      database: dbOk ? "ok" : (dbError || "unavailable"),
      storage: r2Ok ? "ok" : "missing_binding",
      ai: aiOk ? "ok" : "missing_binding",
      schemaVersion,
      setupComplete,
    },
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: healthy ? 200 : 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
};
