import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { wpPosts } from "@astropress/core/schema";
import { apComments, ensureSchema } from "../lib/schema";
import { loadSettings } from "../lib/settings";
import { checkRateLimit } from "../lib/ratelimit";
import { isValidEmail, safeWebsite } from "../lib/text";
import { getClientIp, json } from "../lib/http";

/**
 * POST /ap-comments/submit（公开端点，刻意放在 /api 与 /admin 之外避开登录墙）
 * 接受 application/json 与 application/x-www-form-urlencoded。
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  if (!db) return json({ error: "服务暂不可用" }, 503);

  try {
    await ensureSchema(db);
  } catch {
    return json({ error: "服务暂不可用" }, 503);
  }

  // ---- 解析 body（两种 content-type），先卡 64KB 上限防巨包内存消耗 ----
  const MAX_BODY = 65_536;
  const declaredLen = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BODY) {
    return json({ error: "请求体过大" }, 413);
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "请求体过大" }, 413);
  const ctype = (request.headers.get("content-type") ?? "").toLowerCase();
  const fields: Record<string, string> = {};
  if (ctype.includes("application/json")) {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ error: "无效的 JSON 数据" }, 400);
    }
    if (parsed === null || typeof parsed !== "object") return json({ error: "无效的请求数据" }, 400);
    for (const [k, v] of Object.entries(parsed)) fields[k] = typeof v === "string" ? v : String(v ?? "");
  } else if (ctype.includes("application/x-www-form-urlencoded")) {
    const form = new URLSearchParams(raw);
    for (const [k, v] of form.entries()) fields[k] = v;
  } else {
    return json({ error: "不支持的内容类型" }, 400);
  }

  const str = (k: string) => fields[k] ?? "";

  // ---- 蜜罐：静默伪装成功，不入库 ----
  if (str("ap_website").trim() !== "") {
    return json({ ok: true }, 202);
  }

  // ---- 解析所属文章：postId 或 slug(+postType) ----
  let postId = parseInt(str("postId"), 10);
  if (!Number.isFinite(postId) || postId <= 0) {
    const slug = str("slug").trim();
    if (!slug) return json({ error: "缺少文章标识" }, 400);
    const postType = str("postType").trim() || "post";
    const [row] = await db
      .select({ id: wpPosts.id })
      .from(wpPosts)
      .where(and(eq(wpPosts.postName, slug.slice(0, 200)), eq(wpPosts.postType, postType.slice(0, 32))))
      .limit(1);
    if (!row) return json({ error: "文章不存在" }, 400);
    postId = row.id;
  }

  const [post] = await db
    .select({ id: wpPosts.id, status: wpPosts.postStatus, commentStatus: wpPosts.commentStatus, postType: wpPosts.postType })
    .from(wpPosts)
    .where(eq(wpPosts.id, postId))
    .limit(1);
  if (!post) return json({ error: "文章不存在" }, 400);
  if (post.status !== "publish") return json({ error: "文章不存在" }, 400);

  const settings = await loadSettings(db);
  if (!settings.enabled) return json({ error: "评论功能已关闭" }, 400);
  // 管理员设置为关闭评论的文章类型（如 page）：公开端点同样拒绝，
  // 不能只靠前台中间件——直接 POST 会绕过它
  const closedTypes: string[] = Array.isArray((settings as any).closedTypes) ? (settings as any).closedTypes : [];
  if (closedTypes.includes(post.postType)) {
    return json({ error: "该内容类型未开放评论" }, 400);
  }
  if (post.commentStatus && post.commentStatus !== "open") {
    return json({ error: "该文章未开放评论" }, 400);
  }

  // ---- 字段校验（校验失败不消耗频控配额，避免用户输错几次即被封） ----
  const author = str("author").trim().slice(0, 50);
  if (author.length < 1 || author.length > 50) return json({ error: "昵称长度需为 1-50 个字符" }, 400);

  const email = str("email").trim().slice(0, 200);
  if (!isValidEmail(email)) return json({ error: "邮箱格式不正确" }, 400);

  const website = safeWebsite(str("website"));
  if (str("website").trim() !== "" && !website) {
    return json({ error: "网站地址仅允许 http(s):// 开头的合法链接" }, 400);
  }

  const content = str("content").trim();
  if (content.length < 1 || content.length > 4000) {
    return json({ error: "评论内容长度需为 1-4000 个字符" }, 400);
  }

  // ---- 反垃圾频控：仅对字段合法的提交计数（蜜罐/校验失败均不计数） ----
  const ip = getClientIp(request);
  if (!(await checkRateLimit(db, ip))) {
    return json({ error: "操作过于频繁，请稍后再试" }, 429);
  }

  // ---- 父评论：必须同文且已批准，否则置 0 ----
  let parent = 0;
  const parentRaw = parseInt(str("parent"), 10);
  if (Number.isFinite(parentRaw) && parentRaw > 0) {
    const [prow] = await db
      .select({ id: apComments.id, postId: apComments.postId, status: apComments.status })
      .from(apComments)
      .where(eq(apComments.id, parentRaw))
      .limit(1);
    if (prow && prow.postId === postId && prow.status === "approved") parent = parentRaw;
  }

  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 255);
  const status: "pending" | "approved" = settings.autoApprove ? "approved" : "pending";

  try {
    await db.insert(apComments).values({
      postId,
      parent,
      author,
      email,
      website,
      content,
      status,
      ip,
      userAgent,
      createdAt: new Date().toISOString(),
    });
  } catch {
    return json({ error: "评论提交失败，请稍后再试" }, 500);
  }

  return json({ ok: true, status }, 201);
};
