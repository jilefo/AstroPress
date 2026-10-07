import { getSiteInfo } from "@astropress/core/query";
import { wpPostmeta, wpPosts } from "@astropress/core/schema";
import { loadPermalinkSettings } from "@astropress/core/permalink";
import type { APIRoute } from "astro";
import { and, eq, desc } from "drizzle-orm";
import { loadSettings } from "../lib/settings";

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isoDate(s: string): string | null {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** 多语言 hreflang 数据（multilingual 插件的 _ml_group/_ml_lang postmeta）。
 *  表为空或插件未启用时静默返回空 Map，不产生额外开销之外的成本。 */
async function loadMlData(db: any): Promise<{
  groupMap: Map<number, string>;
  langMap: Map<number, string>;
  membersByGroup: Map<string, number[]>;
}> {
  const groupMap = new Map<number, string>();
  const langMap = new Map<number, string>();
  const membersByGroup = new Map<string, number[]>();
  try {
    const groupRows = await db
      .select({ postId: wpPostmeta.postId, val: wpPostmeta.metaValue })
      .from(wpPostmeta)
      .where(eq(wpPostmeta.metaKey, "_ml_group"));
    for (const g of groupRows) if (g.val) groupMap.set(g.postId, g.val);
    if (groupMap.size === 0) return { groupMap, langMap, membersByGroup };
    const langRows = await db
      .select({ postId: wpPostmeta.postId, val: wpPostmeta.metaValue })
      .from(wpPostmeta)
      .where(eq(wpPostmeta.metaKey, "_ml_lang"));
    for (const l of langRows) if (l.val) langMap.set(l.postId, l.val);
    for (const [postId, gid] of groupMap) {
      const arr = membersByGroup.get(gid) ?? [];
      arr.push(postId);
      membersByGroup.set(gid, arr);
    }
  } catch { /* postmeta 查询失败不影响主 sitemap 输出 */ }
  return { groupMap, langMap, membersByGroup };
}

// 渲染结果的进程内缓存：站点地图每次请求要跑 4-5 条查询（settings/siteinfo/postmeta×2/posts/pages），
// 内容分钟级一致，TTL 与响应 Cache-Control 对齐。设置保存后最多 300s 生效。
const XML_TTL_MS = 300_000;
let xmlCache: { xml: string; expires: number } | null = null;

// 两个 Response 分支共享的响应头（避免对象字面量重复 key）
const XML_HEADERS: Record<string, string> = {
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "public, max-age=300",
};

/** GET /sitemap.xml — XML 站点地图（公开端点） */
export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  if (!db) return new Response("服务器错误", { status: 500 });

  const settings = await loadSettings(db);
  if (!settings.enabled) {
    xmlCache = null;
    return new Response("站点地图未开启", { status: 404 });
  }

  const now = Date.now();
  if (xmlCache && xmlCache.expires > now) {
    return new Response(xmlCache.xml, { headers: XML_HEADERS });
  }

  const siteInfo = await getSiteInfo(db);
  const siteUrl = siteInfo.url.replace(/\/+$/, "");
  const ml = await loadMlData(db);
  // 文章出站形态跟随 permalink 设置（启用 → /{slug}，否则 /blog/{slug}；页面恒为 /{slug}）
  const perm = await loadPermalinkSettings(db);
  const postHref = (code: string | null, postName: string): string =>
    `${siteUrl}${code ? "/" + code : ""}${perm.enabled === false ? "/blog/" : "/"}${postName}`;
  const pageHref = (code: string | null, postName: string): string =>
    `${siteUrl}${code ? "/" + code : ""}/${postName}`;

  interface Entry {
    loc: string;
    lastmod?: string;
    changefreq: string;
    priority: string;
    alts: { code: string; href: string }[];
  }
  const entries: Entry[] = [];

  // 首页
  entries.push({ loc: siteUrl + "/", changefreq: "daily", priority: "1.0", alts: [] });

  const buildAlts = (postId: number, postName: string, postType: string): { code: string; href: string }[] => {
    const alts: { code: string; href: string }[] = [];
    const gid = ml.groupMap.get(postId);
    if (!gid) return alts;
    for (const memberId of ml.membersByGroup.get(gid) ?? []) {
      const code = ml.langMap.get(memberId);
      if (!code) continue;
      const href =
        postType === "page" ? pageHref(code, postName) : postHref(code, postName);
      alts.push({ code, href });
    }
    return alts;
  };

  // 文章
  const posts = await db
    .select({ id: wpPosts.id, postName: wpPosts.postName, postDate: wpPosts.postDate, postModified: wpPosts.postModified })
    .from(wpPosts)
    .where(and(eq(wpPosts.postStatus, "publish"), eq(wpPosts.postType, "post")))
    .orderBy(desc(wpPosts.postDate))
    .limit(settings.maxPosts);

  for (const p of posts) {
    if (ml.langMap.has(p.id)) continue; // 译文条目由主条目的 hreflang 指向，不单独列出
    entries.push({
      loc: postHref(null, p.postName),
      lastmod: isoDate(p.postModified || p.postDate) || undefined,
      changefreq: "weekly",
      priority: "0.8",
      alts: buildAlts(p.id, p.postName, "post"),
    });
  }

  // 页面（可选）
  if (settings.includePages) {
    const pages = await db
      .select({ id: wpPosts.id, postName: wpPosts.postName, postDate: wpPosts.postDate, postModified: wpPosts.postModified })
      .from(wpPosts)
      .where(and(eq(wpPosts.postStatus, "publish"), eq(wpPosts.postType, "page")))
      .orderBy(desc(wpPosts.postDate));
    for (const p of pages) {
      if (ml.langMap.has(p.id)) continue;
      entries.push({
        loc: siteUrl + "/" + p.postName,
        lastmod: isoDate(p.postModified || p.postDate) || undefined,
        changefreq: "monthly",
        priority: "0.6",
        alts: buildAlts(p.id, p.postName, "page"),
      });
    }
  }

  const hasAlts = entries.some((e) => e.alts.length > 0);
  const items = entries
    .map(function (e) {
      const lm = e.lastmod ? `\n    <lastmod>${escXml(e.lastmod)}</lastmod>` : "";
      const alts = e.alts
        .map((a) => `\n    <xhtml:link rel="alternate" hreflang="${escXml(a.code)}" href="${escXml(a.href)}"/>`)
        .join("");
      return `  <url>\n    <loc>${escXml(e.loc)}</loc>${lm}${alts}\n    <changefreq>${escXml(e.changefreq)}</changefreq>\n    <priority>${escXml(e.priority)}</priority>\n  </url>`;
    })
    .join("\n");

  const xhtmlNs = hasAlts ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : "";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${xhtmlNs}>\n${items}\n</urlset>`;

  xmlCache = { xml, expires: now + XML_TTL_MS };

  return new Response(xml, { headers: XML_HEADERS });
};
