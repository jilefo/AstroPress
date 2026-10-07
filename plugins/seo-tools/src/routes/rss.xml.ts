import { getSiteInfo } from "@astropress/core/query";
import { wpOptions, wpPosts } from "@astropress/core/schema";
import { loadPermalinkSettings, postPath } from "@astropress/core/permalink";
import type { APIRoute } from "astro";
import { and, eq, desc } from "drizzle-orm";
import { loadSettings } from "../lib/settings";

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** 将 MySQL 格式的 postDate（YYYY-MM-DD HH:MM:SS）转为 RFC-822 */
function toRfc822(s: string): string | null {
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) return null;
  return d.toUTCString();
}

export const GET: APIRoute = async ({ locals, request }) => {
  const db = (locals as any).db;
  if (!db) return new Response("服务器错误", { status: 500 });

  const s = await loadSettings(db);
  if (!s.feedEnabled) return new Response("RSS 订阅未开启", { status: 404 });

  const siteInfo = await getSiteInfo(db);
  const siteUrl = siteInfo.url.replace(/\/+$/, "");

  // 回退到站点默认标题/描述
  let feedTitle = s.feedTitle.trim();
  let feedDescription = s.feedDescription.trim();

  if (!feedTitle || !feedDescription) {
    const [blognameRow] = await db
      .select({ value: wpOptions.optionValue })
      .from(wpOptions)
      .where(eq(wpOptions.optionName, "blogname"))
      .limit(1);
    const [blogdescRow] = await db
      .select({ value: wpOptions.optionValue })
      .from(wpOptions)
      .where(eq(wpOptions.optionName, "blogdescription"))
      .limit(1);
    if (!feedTitle) feedTitle = blognameRow?.value ?? "AstroPress";
    if (!feedDescription) feedDescription = blogdescRow?.value ?? "";
  }

  const posts = await db
    .select({
      postTitle: wpPosts.postTitle,
      postName: wpPosts.postName,
      postDate: wpPosts.postDate,
      postExcerpt: wpPosts.postExcerpt,
      postContent: wpPosts.postContent,
    })
    .from(wpPosts)
    .where(and(eq(wpPosts.postStatus, "publish"), eq(wpPosts.postType, "post")))
    .orderBy(desc(wpPosts.postDate))
    .limit(s.feedCount);

  const lastBuildDate = posts.length > 0 ? toRfc822(posts[0].postDate ?? "") : new Date().toUTCString();

  // 文章出站形态跟随 permalink 设置（启用 → /{slug}，否则 /blog/{slug}）
  const perm = await loadPermalinkSettings(db);

  const items = posts
    .map((p: any) => {
      const link = siteUrl + postPath(p.postName, perm);
      const guid = link;
      const pubDate = toRfc822(p.postDate ?? "");
      const excerpt = stripHtml(p.postExcerpt ?? "");
      const content = stripHtml(p.postContent ?? "");
      const description = excerpt || content.slice(0, 300);
      const pubDateTag = pubDate ? `<pubDate>${escXml(pubDate)}</pubDate>` : "";
      return `    <item>
      <title>${escXml(p.postTitle ?? "")}</title>
      <link>${escXml(link)}</link>
      <guid>${escXml(guid)}</guid>
      ${pubDateTag}
      <description>${escXml(description)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escXml(feedTitle)}</title>
    <link>${escXml(siteUrl)}</link>
    <description>${escXml(feedDescription)}</description>
    <lastBuildDate>${escXml(String(lastBuildDate ?? new Date().toUTCString()))}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
};
