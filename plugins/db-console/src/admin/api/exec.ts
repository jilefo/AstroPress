import type { APIRoute } from "astro";
import { deriveColumns, sqlAll, sqlRun } from "@astropress/core";
import { errMsg, json, sameOrigin } from "../../lib/http";
import {
  MAX_SQL_LEN,
  MAX_EXEC_ROWS,
  classifyStatement,
  hasMultipleStatements,
  isForbiddenStatement,
  rowsToJson,
} from "../../lib/sql-util";

interface ExecResult {
  type: "query" | "write";
  columns: string[];
  rows: Record<string, unknown>[];
  changes: number | null;
  durationMs: number;
  truncated: boolean;
  error: string | null;
}

/**
 * POST /admin-ext/api/db-console/exec {sql, confirmWrite}
 *
 * 安全策略：
 *  - 必须登录；Origin 同源（CSRF）
 *  - 仅允许单条语句（字符串/注释内的分号已被识别）
 *  - ATTACH/DETACH/VACUUM 一律拒绝
 *  - 非 SELECT/SHOW/PRAGMA/EXPLAIN/DESCRIBE 必须 confirmWrite===true（否则 403）
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "数据库不可用" }, 503);
  if (!sameOrigin(request)) return json({ error: "CSRF 校验失败" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求体必须是 JSON" }, 400);
  }

  const sqlText = body?.sql;
  if (typeof sqlText !== "string") return json({ error: "sql 必须是字符串" }, 400);
  if (sqlText.length === 0) return json({ error: "SQL 不能为空" }, 400);
  if (sqlText.length > MAX_SQL_LEN) {
    return json({ error: `SQL 过长（上限 ${MAX_SQL_LEN} 字符）` }, 400);
  }

  const trimmed = sqlText.trim();
  if (isForbiddenStatement(trimmed)) {
    return json(
      { error: "ATTACH / DETACH / VACUUM 以及 PRAGMA writable_schema / trusted_schema 已禁用。需要回收数据库空间请先使用备份插件下载备份后离线处理。" },
      400
    );
  }
  if (hasMultipleStatements(trimmed)) {
    return json({ error: "只允许执行单条语句，请去掉多余的分号片段" }, 400);
  }

  const { kind } = classifyStatement(trimmed);
  if (kind === "write" && body.confirmWrite !== true) {
    return json({ error: "写操作必须先勾选确认框" }, 403);
  }

  const started = performance.now();
  const duration = () => Math.round((performance.now() - started) * 100) / 100;

  try {
    const durationMs = duration();
    if (kind === "query") {
      // 查询统一走 db.all：D1 的 db.run 返回 {results, meta}，不含 rows
      const allRows = await sqlAll(db, trimmed);
      const columns = deriveColumns(allRows);
      const truncated = allRows.length > MAX_EXEC_ROWS;
      const out: ExecResult = {
        type: "query",
        columns,
        rows: rowsToJson(truncated ? allRows.slice(0, MAX_EXEC_ROWS) : allRows, columns),
        changes: null,
        durationMs,
        truncated,
        error: truncated ? `结果超过 ${MAX_EXEC_ROWS} 行，仅返回前 ${MAX_EXEC_ROWS} 行，请加 LIMIT` : null,
      };
      return json(out);
    }
    const meta = await sqlRun(db, trimmed);
    const out: ExecResult = {
      type: "write",
      columns: [],
      rows: [],
      changes: meta.changes,
      durationMs,
      truncated: false,
      error: null,
    };
    return json(out);
  } catch (e) {
    const raw = errMsg(e);
    // Cloudflare D1 平台限制与内部对象统一中文提示，不泄漏英文原始错误
    let message = raw;
    if (/SQLITE_AUTH|not authorized/i.test(raw)) {
      message = "Cloudflare D1 平台禁止访问该内部对象（或该 PRAGMA 在 D1 上不可用）。";
    } else if (/too many terms in compound SELECT/i.test(raw)) {
      message = "Cloudflare D1 限制单条复合 SELECT（UNION/UNION ALL）最多 5 个分支，请拆分查询。";
    }
    const out: ExecResult = {
      type: kind,
      columns: [],
      rows: [],
      changes: null,
      durationMs: duration(),
      truncated: false,
      error: message,
    };
    // SQL 执行错误返回原文（HTTP 仍为 200，由页面红色展示）
    return json(out);
  }
};
