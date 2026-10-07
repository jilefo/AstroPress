import { getSiteInfo } from "@astropress/core/query";
import { wpPostmeta, wpPosts } from "@astropress/core/schema";
import { loadPermalinkSettings } from "@astropress/core/permalink";
import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import { loadSettings } from "../lib/settings";

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  if (!db) return new Response("服务器错误", { status: 500 });

  const s = await loadSettings(db);
  const siteUrl = (await getSiteInfo(db)).url.replace(/\/+$/, "");
  const enabledCodes = s.languages.filter((l) => l.enabled).map((l) => l.code);

  const posts = await db
    .select({ id: wpPosts.id, name: wpPosts.postName, type: wpPosts.postType })
    .from(wpPosts)
    .where(and(eq(wpPosts.postStatus, "publish"), inArray(wpPosts.postType, ["post", "page"])));

  const groupRows = await db
    .select({ postId: wpPostmeta.postId, val: wpPostmeta.metaValue })
    .from(wpPostmeta)
    .where(eq(wpPostmeta.metaKey, "_ml_group"));
  const groupMap = new Map<number, string>();
  for (const g of groupRows) groupMap.set(g.postId, g.val ?? "");

  const langRows = await db
    .select({ postId: wpPostmeta.postId, val: wpPostmeta.metaValue })
    .from(wpPostmeta)
    .where(eq(wpPostmeta.metaKey, "_ml_lang"));
  const langMap = new Map<number, string>();
  for (const l of langRows) langMap.set(l.postId, l.val ?? "");

  const membersByGroup = new Map<string, number[]>();
  for (const [postId, gid] of groupMap) {
    const arr = membersByGroup.get(gid) ?? [];
    arr.push(postId);
    membersByGroup.set(gid, arr);
  }

  const urls: string[] = [];
  const escXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  // 文章出站形态跟随 permalink 设置（启用 → /{slug}，否则 /blog/{slug}；页面恒为 /{slug}）
  const perm = await loadPermalinkSettings(db);
  const postBase = perm.enabled === false ? "/blog/" : "/";
  for (const p of posts) {
    if (langMap.has(p.id)) continue; // 译文成员只出现在主条目的 hreflang 中
    const loc = p.type === "page" ? `${siteUrl}/${p.name}` : `${siteUrl}${postBase}${p.name}`;
    const alts: string[] = [];
    const gid = groupMap.get(p.id);
    if (gid) {
      for (const memberId of membersByGroup.get(gid) ?? []) {
        const code = langMap.get(memberId);
        if (!code || !enabledCodes.includes(code)) continue;
        // 默认语言不带语言前缀（与中间件 rewrite 规则一致）
        const href =
          code === s.defaultLang
            ? loc
            : p.type === "page"
              ? `${siteUrl}/${code}/${p.name}`
              : `${siteUrl}/${code}${postBase}${p.name}`;
        alts.push(`    <xhtml:link rel="alternate" hreflang="${escXml(code)}" href="${escXml(href)}"/>`);
      }
      // x-default 指向默认语言 URL
      alts.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${escXml(loc)}"/>`);
    }
    urls.push(`  <url>\n    <loc>${escXml(loc)}</loc>\n${alts.join("\n")}\n  </url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join("\n")}\n</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
