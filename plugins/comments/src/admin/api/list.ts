import type { APIRoute } from "astro";
import { ensureSchema } from "../../lib/schema";
import { loadSettings } from "../../lib/settings";
import { getStatusCounts, isCommentStatus, listComments } from "../../lib/comments";
import { json } from "../../lib/http";

/** GET /admin-ext/api/comments/list?status=&postId=&page=&q= */
export const GET: APIRoute = async ({ locals, url }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;

  try {
    await ensureSchema(db);
  } catch {
    return json({ error: "数据表初始化失败" }, 500);
  }

  const statusParam = url.searchParams.get("status") ?? "pending";
  const status = isCommentStatus(statusParam) ? statusParam : "pending";
  const postIdRaw = parseInt(url.searchParams.get("postId") ?? "", 10);
  const postId = Number.isFinite(postIdRaw) && postIdRaw > 0 ? postIdRaw : undefined;
  const q = url.searchParams.get("q") ?? "";
  const pageRaw = parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const settings = await loadSettings(db);
  const [{ items, total }, counts] = await Promise.all([
    listComments(db, { status, postId, q, page, perPage: settings.perPage }),
    getStatusCounts(db),
  ]);

  return json({ items, total, page, perPage: settings.perPage, counts });
};
