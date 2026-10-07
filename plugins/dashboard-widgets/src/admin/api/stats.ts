import type { APIRoute } from "astro";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);

  try {
    const { wpPosts, wpOptions } = await import("@astropress/core/schema");
    const { eq, and, desc, count, sql } = await import("drizzle-orm");

    // 评论数（ap_comments 为 comments 插件自建表，可能不存在）
    let commentTotal = 0;
    try {
      const { sqlOne } = await import("@astropress/core");
      const cRow = await sqlOne(db, sql`SELECT COUNT(*) as c FROM ap_comments`);
      commentTotal = Number((cRow as any)?.c ?? 0);
    } catch { commentTotal = 0; }

    // 并行查询所有统计数据
    const [
      [pubPosts], [draftPosts], [pages], [mediaCount], [userCount],
    ] = await Promise.all([
      db.select({ c: count() }).from(wpPosts).where(and(eq(wpPosts.postType, "post"), eq(wpPosts.postStatus, "publish"))),
      db.select({ c: count() }).from(wpPosts).where(and(eq(wpPosts.postType, "post"), eq(wpPosts.postStatus, "draft"))),
      db.select({ c: count() }).from(wpPosts).where(and(eq(wpPosts.postType, "page"), eq(wpPosts.postStatus, "publish"))),
      db.select({ c: count() }).from(wpPosts).where(eq(wpPosts.postType, "attachment")),
      db.select({ c: count() }).from((await import("@astropress/core/schema")).wpUsers),
    ]);

    // 最近 5 篇文章
    const recentPosts = await db
      .select({ id: wpPosts.id, title: wpPosts.postTitle, status: wpPosts.postStatus, date: wpPosts.postDate, author: wpPosts.postAuthor })
      .from(wpPosts)
      .where(eq(wpPosts.postType, "post"))
      .orderBy(desc(wpPosts.postDate))
      .limit(5);

    // 草稿列表
    const drafts = await db
      .select({ id: wpPosts.id, title: wpPosts.postTitle, date: wpPosts.postDate })
      .from(wpPosts)
      .where(and(eq(wpPosts.postType, "post"), eq(wpPosts.postStatus, "draft")))
      .orderBy(desc(wpPosts.postDate))
      .limit(10);

    // 系统健康：DB 大小（SQLite）
    let dbSize = "N/A";
    try {
      const [sizeRow] = await db.select({ val: sql<string>`printf('%.2f MB', page_count * page_size / 1048576.0))` }).from(sql`pragma_page_count(), pragma_page_size()`).limit(1);
      dbSize = sizeRow?.val ?? "N/A";
    } catch {
      try {
        const [pgCount] = await db.select({ v: sql<number>`page_count()` }).from(sql`pragma_page_count()`).limit(1);
        const [pgSize] = await db.select({ v: sql<number>`page_size()` }).from(sql`pragma_page_size()`).limit(1);
        if (pgCount?.v && pgSize?.v) {
          dbSize = ((pgCount.v * pgSize.v) / 1048576).toFixed(2) + " MB";
        }
      } catch { /* 非 SQLite */ }
    }

    // 表单数
    let formCount = 0;
    try {
      const formsRow = await db.select().from(wpOptions).where(eq(wpOptions.optionName, "astropress_forms")).get();
      if (formsRow?.optionValue) formCount = JSON.parse(formsRow.optionValue).length;
    } catch {}

    // 插件数
    let pluginCount = 0;
    try {
      const pluginRow = await db.select().from(wpOptions).where(eq(wpOptions.optionName, "astropress_plugin_states")).get();
      if (pluginRow?.optionValue) {
        const states = JSON.parse(pluginRow.optionValue) as Record<string, string>;
        pluginCount = Object.values(states).filter(v => v === "active").length;
      }
    } catch {}

    return json({
      ok: true,
      stats: {
        posts: pubPosts?.c ?? 0,
        drafts: draftPosts?.c ?? 0,
        pages: pages?.c ?? 0,
        media: mediaCount?.c ?? 0,
        users: userCount?.c ?? 0,
        comments: commentTotal,
        forms: formCount,
        plugins: pluginCount,
        dbSize,
      },
      recentPosts,
      drafts,
    });
  } catch (err: any) {
    return json({ error: String(err?.message ?? err).slice(0, 200) }, 500);
  }
};
