import type { APIRoute } from "astro";
import { requireApiKey } from "./_auth";
import { appendLog } from "../../lib/logs";
import { wpPosts, wpPostmeta } from "@astropress/core/schema";
import { and, eq } from "drizzle-orm";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_TITLE_LEN = 500;
const MAX_META_KEYS = 50;
const ALLOWED_TYPES = new Set(["post", "page"]);

function slugify(text: string): string {
  // 与核心 slugify 同策略：保留 Unicode 字母/数字（含中文），空白与斜杠转连字符
  return (text || "")
    .normalize("NFKD")
    .toLowerCase()
    .trim()
    .replace(/[\s/\\]+/g, "-")
    .replace(/[^\p{L}\p{N}_-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

export const POST: APIRoute = async (ctx) => {
  const auth = await requireApiKey(ctx);
  if (auth instanceof Response) return auth;
  const { keyData } = auth;
  const db = (ctx.locals as any).db;

  if (!keyData.permissions.includes("publish")) {
    await appendLog(db, { action: "publish", keyId: keyData.id, keyName: keyData.name, status: "error", message: "权限不足：缺少 publish 权限" });
    return json({ error: "权限不足：当前 API 密钥没有发布权限" }, 403);
  }

  const contentLength = Number(ctx.request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: "请求体过大（上限 5 MB）" }, 413);
  }

  let body: any;
  try {
    // content-length 可被 chunked 编码绕过，解析前再按实际字节兜底
    const raw = await ctx.request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return json({ error: "请求体过大（上限 5 MB）" }, 413);
    }
    body = JSON.parse(raw);
  } catch (e) {
    if (e instanceof SyntaxError) return json({ error: "请求体不是合法 JSON" }, 400);
    throw e;
  }

  const { title, content, slug, type = "post", status = "draft", excerpt, meta } = body;
  // title/content 必填：无标题文章会成为前台 "(无标题)" 脏数据，无正文的空壳同理
  if (typeof title !== "string" || !title.trim()) {
    return json({ error: "title 为必填项，且必须是非空字符串" }, 400);
  }
  if (typeof content !== "string" || !content.trim()) {
    return json({ error: "content 为必填项，且必须是非空字符串" }, 400);
  }
  if (title.length > MAX_TITLE_LEN) {
    return json({ error: `标题过长（上限 ${MAX_TITLE_LEN} 字符）` }, 400);
  }
  if (!ALLOWED_TYPES.has(type)) {
    return json({ error: `不支持的内容类型 "${type}"（仅允许：post、page）` }, 400);
  }

  const postSlug = slug ? slugify(String(slug)) : slugify(String(title ?? "untitled"));
  if (!postSlug) {
    return json({ error: "由标题生成的 slug 为空，请改用拉丁字母/数字标题或显式传入 slug" }, 400);
  }
  const now = new Date().toISOString();

  try {
    // Check if post exists by slug AND type — a page must never overwrite a post.
    const [existing] = await db
      .select({ id: wpPosts.id })
      .from(wpPosts)
      .where(and(eq(wpPosts.postName, postSlug), eq(wpPosts.postType, type)))
      .limit(1);

    let postId: number;
    if (existing) {
      // Update
      postId = existing.id;
      await db.update(wpPosts).set({
        postTitle: title ?? "",
        postContent: content ?? "",
        postExcerpt: excerpt ?? "",
        postStatus: status,
        postModified: now,
      }).where(eq(wpPosts.id, postId));
    } else {
      // Insert
      await db.insert(wpPosts).values({
        postTitle: title,
        postContent: content,
        postExcerpt: excerpt ?? "",
        postStatus: status,
        postName: postSlug,
        postType: type,
        postDate: now,
        postModified: now,
        postAuthor: 1, // default admin
      });
      // D1 的 drizzle insert 不返回 lastInsertRowid（返回 meta.last_row_id，
      // Number(undefined)=NaN 序列化为 null）——按 slug+type 查回最可靠
      const [created] = await db
        .select({ id: wpPosts.id })
        .from(wpPosts)
        .where(and(eq(wpPosts.postName, postSlug), eq(wpPosts.postType, type)))
        .limit(1);
      if (!created) throw new Error("插入成功但回读不到文章");
      postId = created.id;
    }

    // Save meta fields if provided
    if (meta && typeof meta === "object") {
      const entries = Object.entries(meta).slice(0, MAX_META_KEYS);
      for (const [k, v] of entries) {
        if (typeof v !== "string") continue;
        if (!k || k.length > 191) continue;
        const [existingMeta] = await db
          .select({ id: wpPostmeta.metaId })
          .from(wpPostmeta)
          .where(eq(wpPostmeta.postId, postId))
          .where(eq(wpPostmeta.metaKey, k))
          .limit(1);
        if (existingMeta) {
          await db.update(wpPostmeta).set({ metaValue: v }).where(eq(wpPostmeta.metaId, existingMeta.id));
        } else {
          await db.insert(wpPostmeta).values({ postId, metaKey: k, metaValue: v });
        }
      }
    }

    await appendLog(db, {
      action: "publish",
      keyId: keyData.id,
      keyName: keyData.name,
      status: "success",
      message: `${existing ? "已更新" : "已发布"}${type === "page" ? "页面" : "文章"} "${postSlug}"（ID: ${postId}）`,
      payload: { postId, slug: postSlug, type, status },
    });

    return json({
      ok: true,
      action: existing ? "updated" : "created",
      postId,
      slug: postSlug,
      type,
      status,
      url: `/${type === "page" ? "" : "blog/"}${postSlug}`,
    });
  } catch (err: any) {
    await appendLog(db, {
      action: "publish",
      keyId: keyData.id,
      keyName: keyData.name,
      status: "error",
      message: err?.message ?? String(err),
    });
    console.error("[webhook-publisher] publish failed:", err);
    return json({ error: "发布失败，请检查服务端日志" }, 500);
  }
};
