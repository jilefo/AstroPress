import type { APIRoute } from "astro";
import { sql } from "drizzle-orm";
import { sqlOne, sqlRun, isCloudflareRuntime } from "@astropress/core";
import { measureDbBytes, isPragmaDenied } from "../../lib/stats";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const ALLOWED_ACTIONS = new Set([
  "vacuum",
  "analyze",
  "optimize",
  "delete_revisions",
]);

/**
 * POST /admin-ext/api/db-opt/run
 * body: { action: "vacuum"|"analyze"|"optimize"|"delete_revisions", confirm: true }
 *
 * 鉴权：登录态 + 同源 Origin（CSRF） + JSON 解析 + confirm 显式确认 + action 白名单。
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);

  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) {
    return json({ error: "CSRF 校验失败" }, 403);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求体不是合法 JSON" }, 400);
  }

  if (body?.confirm !== true) {
    return json({ error: "缺少确认参数 confirm" }, 400);
  }

  const action = String(body.action ?? "");
  if (!ALLOWED_ACTIONS.has(action)) {
    return json({ error: "不支持的操作类型" }, 400);
  }

  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);

  // 托管数据库（Cloudflare D1）禁止 VACUUM / ANALYZE / PRAGMA，直接中文拒绝，
  // 不把 SQLITE_AUTH 英文错误暴露给用户。删除修订版本是普通 DELETE，仍然允许。
  const PRAGMA_ACTIONS: Record<string, string> = {
    vacuum: "VACUUM（重建数据库文件）",
    analyze: "ANALYZE（更新优化器统计）",
    optimize: "PRAGMA optimize（常规维护）",
  };
  if (isCloudflareRuntime() && PRAGMA_ACTIONS[action]) {
    return json(
      { error: `Cloudflare D1 为托管数据库，不支持${PRAGMA_ACTIONS[action]}，该维护由平台自动完成；在 Node.js 部署（VPS/Docker）中可手动执行。` },
      400
    );
  }

  try {
    // 体积测量依赖 PRAGMA，D1 等托管库上降级为 null（不阻断删除修订版本）
    const measure = async () => {
      try { return await measureDbBytes(db); }
      catch { return { bytes: null as number | null, pageCount: null, pageSize: null }; }
    };
    const before = await measure();

    let deleted: number | undefined;
    if (action === "vacuum") {
      await sqlRun(db, sql`VACUUM`);
    } else if (action === "analyze") {
      await sqlRun(db, sql`ANALYZE`);
    } else if (action === "optimize") {
      await sqlRun(db, sql`PRAGMA optimize`);
    } else if (action === "delete_revisions") {
      // 先统计将删除的条数，再执行删除
      const row = await sqlOne(db, sql`SELECT COUNT(*) AS c FROM wp_posts WHERE post_type = 'revision'`);
      deleted = Number(row?.c ?? 0);
      await sqlRun(db, sql`DELETE FROM wp_posts WHERE post_type = 'revision'`);
    }

    const after = await measure();

    const result: Record<string, unknown> = {
      ok: true,
      action,
      bytesBefore: before.bytes,
      bytesAfter: after.bytes,
      reclaimed: before.bytes != null && after.bytes != null
        ? Math.max(0, before.bytes - after.bytes)
        : null,
    };
    if (deleted !== undefined) result.deleted = deleted;
    return json(result);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    if (isPragmaDenied(e)) {
      return json({ error: "当前托管数据库不支持该维护命令，请使用 Node.js 部署执行。" }, 400);
    }
    // 不向界面透传驱动英文原始错误
    console.error("[db-optimize] run failed:", raw);
    return json({ error: "数据库优化执行失败，请稍后重试。" }, 500);
  }
};
