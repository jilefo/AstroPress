import type { APIRoute } from "astro";
import { ensureSchema } from "../../lib/schema";
import { countLinksInCat, createCat, deleteCat, listCats, updateCat } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** 写操作 CSRF 校验：origin 存在时必须与请求同源 */
function checkOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return false;
  return true;
}

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);
  try {
    await ensureSchema(db);
    const cats = await listCats(db);
    const counts = await Promise.all(cats.map((c) => countLinksInCat(db, c.id)));
    return json(cats.map((c, i) => ({ ...c, linkCount: counts[i] })));
  } catch (e) {
    console.error("[link-directory] list cats failed:", e);
    return json({ error: "服务器开小差了，请稍后再试" }, 500);
  }
};

export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  if (!checkOrigin(request)) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  const name = String(body?.name ?? "").trim().slice(0, 60);
  if (!name) return json({ error: "名称不能为空" }, 400);
  const sort = Number.isFinite(body?.sort) ? Math.max(0, Math.min(9999, parseInt(body.sort, 10) || 0)) : 0;
  const slugRaw = body?.slug !== undefined ? String(body.slug).slice(0, 80) : undefined;

  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);
  try {
    await ensureSchema(db);
    const cat = await createCat(db, { name, slug: slugRaw, sort });
    return json({ ok: true, cat });
  } catch (e) {
    console.error("[link-directory] cat mutation failed:", e);
    return json({ error: "操作失败，请稍后再试" }, 400);
  }
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  if (!checkOrigin(request)) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  const id = parseInt(body?.id, 10);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "缺少记录 id" }, 400);

  const patch: { name?: string; slug?: string; sort?: number } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 60);
    if (!name) return json({ error: "名称不能为空" }, 400);
    patch.name = name;
  }
  if (body.slug !== undefined) patch.slug = String(body.slug).slice(0, 80);
  if (body.sort !== undefined) {
    if (!Number.isFinite(Number(body.sort))) return json({ error: "排序值必须是数字" }, 400);
    patch.sort = Math.max(0, Math.min(9999, parseInt(body.sort, 10) || 0));
  }

  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);
  try {
    await ensureSchema(db);
    const cat = await updateCat(db, id, patch);
    if (!cat) return json({ error: "分类不存在" }, 404);
    return json({ ok: true, cat });
  } catch (e) {
    console.error("[link-directory] cat mutation failed:", e);
    return json({ error: "操作失败，请稍后再试" }, 400);
  }
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  if (!checkOrigin(request)) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  const id = parseInt(new URL(request.url).searchParams.get("id") ?? "", 10);
  if (!Number.isInteger(id) || id <= 0) return json({ error: "缺少记录 id" }, 400);

  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);
  try {
    await ensureSchema(db);
    // 分类下仍有链接时拒绝删除，避免产生孤儿链接
    const n = await countLinksInCat(db, id);
    if (n > 0) return json({ error: `分类下还有 ${n} 条链接，请先移动或删除` }, 400);
    const ok = await deleteCat(db, id);
    if (!ok) return json({ error: "分类不存在" }, 404);
    return json({ ok: true });
  } catch (e) {
    console.error("[link-directory] cat mutation failed:", e);
    return json({ error: "操作失败，请稍后再试" }, 400);
  }
};
