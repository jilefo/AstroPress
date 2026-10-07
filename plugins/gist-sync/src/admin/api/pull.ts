import type { APIRoute } from "astro";
import { ALL_SECTIONS, IoError, parseEnvelope, runImport } from "../../lib/io";
import { extractFileContent, getGist, GitHubError } from "../../lib/github";
import { appendHistory, loadSettings } from "../../lib/settings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

/**
 * POST /admin-ext/api/gist-sync/pull {confirm:true}
 * GET /gists/{id} 取回配置文件 → 与 config-io 相同的校验与导入逻辑（merge 模式）。
 * 返回导入摘要 {importedSections, summary, errors}；同步历史记录最近 20 条。
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }
  if (body?.confirm !== true) return json({ error: "需要 confirm:true 确认" }, 403);

  const settings = await loadSettings(db);
  if (!settings.token) return json({ error: "尚未配置 GitHub Token，请先保存设置" }, 400);
  if (!settings.gistId) return json({ error: "尚未配置 Gist ID，无法拉取恢复" }, 400);

  const syncedAt = new Date().toISOString();
  try {
    const gist = await getGist(settings.token, settings.gistId);
    const content = extractFileContent(gist, settings.filename);
    if (content === null) {
      throw new IoError(404, `Gist 中不存在文件 ${settings.filename}，请检查文件名设置`);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throw new IoError(400, "Gist 文件内容不是合法 JSON");
    }

    const envelope = parseEnvelope(raw);
    const result = await runImport(db, envelope, [...ALL_SECTIONS]);

    await appendHistory(db, {
      time: syncedAt,
      direction: "pull",
      ok: true,
      message: `恢复完成（${result.importedSections.join(", ") || "无匹配 section"}）：+${result.summary.inserted} / ~${result.summary.updated} / 跳过 ${result.summary.skipped} / 失败 ${result.summary.failed}`,
      gistId: settings.gistId,
    });

    return json({ ...result, gistId: settings.gistId, syncedAt });
  } catch (e) {
    const message =
      e instanceof GitHubError || e instanceof IoError
        ? e.message
        : e instanceof Error
          ? e.message
          : "恢复失败";
    await appendHistory(db, { time: syncedAt, direction: "pull", ok: false, message, gistId: settings.gistId }).catch(() => {});
    if (e instanceof GitHubError) return json({ error: e.message }, e.status === 0 ? 502 : e.status);
    if (e instanceof IoError) return json({ error: e.message }, e.status);
    console.error("[gist-sync] pull failed:", e);
    return json({ error: "恢复失败，请稍后再试" }, 500);
  }
};
