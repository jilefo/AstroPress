import type { APIRoute } from "astro";
import { LINK_STATUSES, ensureSchema } from "../../lib/schema";
import {
  createLink,
  deleteLink,
  getCat,
  listCats,
  listLinks,
  updateLink,
} from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** 写操作 CSRF 校验：origin 存在时必须与请求同源 */
function checkOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return false;
  return true;
}

/** URL 必须是 http(s):// 开头且可构造 */
function validUrl(u: unknown): u is string {
  if (typeof u !== "string" || u.length < 8 || u.length > 500) return false;
  if (!/^https?:\/\//i.test(u)) return false;
  try {
    new URL(u);
    return true;
  } catch {
    return false;
  }
}

export const GET: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);
  try {
    await ensureSchema(db);
    const catParam = new URL(request.url).searchParams.get("cat_id");
    const catId = catParam ? parseInt(catParam, 10) : undefined;
    const [cats, links] = await Promise.all([
      listCats(db),
      listLinks(db, Number.isInteger(catId) && (catId as number) > 0 ? catId : undefined),
    ]);
    const catMap = new Map(cats.map((c) => [c.id, c]));
    return json(
      links.map((l) => ({ ...l, catName: catMap.get(l.catId)?.name ?? "(已删除分类)" }))
    );
  } catch (e) {
    console.error("[link-directory] list failed:", e);
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

  const catId = parseInt(body?.catId ?? body?.cat_id, 10);
  if (!Number.isInteger(catId) || catId <= 0) return json({ error: "缺少分类 id" }, 400);
  const name = String(body?.name ?? "").trim().slice(0, 120);
  if (!name) return json({ error: "名称不能为空" }, 400);
  if (!validUrl(body?.url)) return json({ error: "链接必须是合法的 http(s) 地址" }, 400);
  const description = String(body?.description ?? "").slice(0, 500);
  const status = LINK_STATUSES.includes(body?.status) ? body.status : "pending";

  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);
  try {
    await ensureSchema(db);
    if (!(await getCat(db, catId))) return json({ error: "分类不存在" }, 400);
    const link = await createLink(db, { catId, name, url: body.url, description, status });
    return json({ ok: true, link });
  } catch (e) {
    console.error("[link-directory] mutation failed:", e);
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

  const patch: {
    catId?: number;
    name?: string;
    url?: string;
    description?: string;
    status?: string;
    clicks?: number;
  } = {};
  if (body.catId !== undefined || body.cat_id !== undefined) {
    const catId = parseInt(body.catId ?? body.cat_id, 10);
    if (!Number.isInteger(catId) || catId <= 0) return json({ error: "缺少分类 id" }, 400);
    patch.catId = catId;
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 120);
    if (!name) return json({ error: "名称不能为空" }, 400);
    patch.name = name;
  }
  if (body.url !== undefined) {
    if (!validUrl(body.url)) return json({ error: "链接必须是合法的 http(s) 地址" }, 400);
    patch.url = body.url;
  }
  if (body.description !== undefined) patch.description = String(body.description).slice(0, 500);
  if (body.status !== undefined) {
    if (!LINK_STATUSES.includes(body.status)) return json({ error: "状态值不合法（pending/approved）" }, 400);
    patch.status = body.status;
  }
  if (body.clicks !== undefined) {
    const clicks = parseInt(body.clicks, 10);
    if (!Number.isInteger(clicks) || clicks < 0) return json({ error: "点击数必须是非负整数" }, 400);
    patch.clicks = clicks;
  }

  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);
  try {
    await ensureSchema(db);
    if (patch.catId !== undefined && !(await getCat(db, patch.catId))) {
      return json({ error: "分类不存在" }, 400);
    }
    const link = await updateLink(db, id, patch);
    if (!link) return json({ error: "链接不存在" }, 404);
    return json({ ok: true, link });
  } catch (e) {
    console.error("[link-directory] mutation failed:", e);
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
    const ok = await deleteLink(db, id);
    if (!ok) return json({ error: "链接不存在" }, 404);
    return json({ ok: true });
  } catch (e) {
    console.error("[link-directory] mutation failed:", e);
    return json({ error: "操作失败，请稍后再试" }, 400);
  }
};
