import type { APIRoute } from "astro";
import { ALL_SECTIONS, buildExport, IoError } from "../../lib/io";
import { createGist, GitHubError, updateGist } from "../../lib/github";
import { appendHistory, loadSettings, saveGistId } from "../../lib/settings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

/**
 * POST /admin-ext/api/gist-sync/push {confirm:true}
 * 导出全量配置信封 → 推送到 Gist：
 *   - 有 gistId：PATCH /gists/{id}
 *   - 无 gistId：POST /gists 创建私密 Gist，并把新 id 回写到设置
 * 返回 {gistId, url, syncedAt}；同步历史记录最近 20 条。
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

  const syncedAt = new Date().toISOString();
  try {
    const envelope = await buildExport(db, [...ALL_SECTIONS]);
    const content = JSON.stringify(envelope, null, 2);

    let result: { id: string; url: string };
    if (settings.gistId) {
      result = await updateGist(settings.token, settings.gistId, {
        filename: settings.filename,
        description: settings.description,
        content,
      });
    } else {
      result = await createGist(settings.token, {
        filename: settings.filename,
        description: settings.description,
        content,
      });
      if (result.id) await saveGistId(db, result.id);
    }

    await appendHistory(db, {
      time: syncedAt,
      direction: "push",
      ok: true,
      message: settings.gistId ? "已更新既有 Gist" : "已创建新的私密 Gist",
      gistId: result.id,
    });

    return json({ ok: true, gistId: result.id, url: result.url, syncedAt });
  } catch (e) {
    const message =
      e instanceof GitHubError || e instanceof IoError
        ? e.message
        : e instanceof Error
          ? e.message
          : "推送失败";
    await appendHistory(db, { time: syncedAt, direction: "push", ok: false, message }).catch(() => {});
    if (e instanceof GitHubError) return json({ error: e.message }, e.status === 0 ? 502 : e.status);
    if (e instanceof IoError) return json({ error: e.message }, e.status);
    console.error("[gist-sync] push failed:", e);
    return json({ error: "推送失败，请稍后再试" }, 500);
  }
};
