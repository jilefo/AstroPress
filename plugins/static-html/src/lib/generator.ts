import * as fs from "node:fs/promises";
import { join } from "node:path";
import { and, eq, desc } from "drizzle-orm";
import { getSiteInfo } from "@astropress/core/query";
import { wpPosts, wpOptions } from "@astropress/core/schema";
import type { StaticHtmlSettings } from "./settings";
import { isSafeOutputDir, resolveOutputDir, safeUrlPathToRel } from "./paths";
import {
  appendRun,
  isProcessRunning,
  loadState,
  markProcessRunning,
  saveState,
  type RunError,
  type RunState,
} from "./state";

/**
 * 静态 HTML 生成器。
 *
 * 流程（顺序保证快照一致）：
 *   1. DB 查询全部已发布文章/页面 → URL 清单（同一快照）
 *   2. 并发抓取首页/列表/文章/页面 HTML 落盘
 *   3. 可选：抽取并抓取页面引用的同源静态资源
 *   4. 最后统一写 sitemap.xml / rss.xml（全部页面就绪后才生成）
 *
 * 不清理旧目录（避免误删），仅覆盖同名文件；被删除文章的旧 HTML 需手工清理。
 */

const CONCURRENCY = 4;
const PAGE_TIMEOUT_MS = 20_000;
const ASSET_TIMEOUT_MS = 30_000;
const MAX_ASSETS = 2000;
const MAX_ERRORS = 50;

/** 与系统路由/端点冲突的页面 slug，不能当作 /{slug} 静态页导出 */
const RESERVED_SLUGS = new Set([
  "blog",
  "forms",
  "admin",
 "login",
  "logout",
  "api",
  "media",
  "search",
  "sitemap.xml",
  "rss.xml",
  "robots.txt",
  "favicon.ico",
]);

/** 不作为静态资源抓取的路径前缀（动态/后台端点） */
const ASSET_SKIP_PREFIX = ["/admin", "/admin-ext", "/api", "/login", "/logout", "/forms"];

/** 视为静态资源的扩展名（白名单，避免把 <a> 页面链接或动态端点当文件保存） */
const ASSET_EXT = new Set([
  "js", "mjs", "css", "map", "png", "jpg", "jpeg", "gif", "svg", "webp",
  "avif", "ico", "woff", "woff2", "ttf", "eot", "otf", "webmanifest",
  "json", "txt", "pdf", "mp4", "webm", "mp3", "wav", "ogg",
]);

/** 无扩展名但确定是构建产物的目录前缀（Vite 生产产物在 /_astro/；/@vite/ 为 dev 专用，不抓取） */
const ASSET_PREFIX = ["/_astro/", "/assets/"];

/**
 * 移除仅开发环境存在的标签：Vite HMR 客户端（/@vite/、/@fs/）、
 * Astro 调试工具栏、Vite 错误浮层。这些在静态部署环境是死链/噪音。
 */
function stripDevOnly(html: string): string {
  return html
    .replace(/<script\b[^>]*\bsrc=(?:"[^"]*\/@vite\/[^"]*"|'[^']*\/@vite\/[^']*')[^>]*>\s*<\/script>/gi, "")
    .replace(/<script\b[^>]*\bsrc=(?:"[^"]*\/@fs\/[^"]*"|'[^']*\/@fs\/[^']*')[^>]*>\s*<\/script>/gi, "")
    .replace(/<link\b[^>]*\bhref=(?:"[^"]*\/@vite\/[^"]*"|'[^']*\/@vite\/[^']*')[^>]*>/gi, "")
    .replace(/<link\b[^>]*\bhref=(?:"[^"]*\/@fs\/[^"]*"|'[^']*\/@fs\/[^']*')[^>]*>/gi, "")
    .replace(/<astro-dev-toolbar\b[\s\S]*?<\/astro-dev-toolbar>/gi, "")
    .replace(/<vite-error-overlay\b[\s\S]*?<\/vite-error-overlay>/gi, "");
}

/** 读取 permalink 插件是否生效（自身启用且未被插件管理器禁用）；生效时文章导出到 /{slug} 根路径 */
async function permalinkActive(db: any): Promise<boolean> {
  try {
    const [stRow, setRow] = await Promise.all([
      db.select({ v: wpOptions.optionValue }).from(wpOptions).where(eq(wpOptions.optionName, "astropress_plugin_states")).limit(1),
      db.select({ v: wpOptions.optionValue }).from(wpOptions).where(eq(wpOptions.optionName, "astropress_permalink_settings")).limit(1),
    ]);
    const states = stRow[0]?.v ? JSON.parse(stRow[0].v) : {};
    if (states["permalink"] === false) return false;
    const settings = setRow[0]?.v ? JSON.parse(setRow[0].v) : {};
    return settings.enabled !== false; // permalink 默认启用
  } catch {
    return false; // 读取失败时保守使用 /blog/ 路径（该路径在任何配置下都可访问）
  }
}

function looksLikeStaticAsset(pathname: string): boolean {
  if (ASSET_PREFIX.some((pre) => pathname.startsWith(pre))) return true;
  const last = pathname.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  if (dot <= 0) return false;
  return ASSET_EXT.has(last.slice(dot + 1).toLowerCase());
}

interface Entry {
  urlPath: string;
  outRel: string;
  kind: "home" | "post" | "page";
  lastmod: string | null;
  title?: string;
  excerpt?: string;
  date?: string;
}

function isoDate(s?: string | null): string | null {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function toRfc822(s?: string | null): string | null {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  if (isNaN(d.getTime())) return null;
  return d.toUTCString();
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/** 页面 URL → 磁盘相对路径（目录式 index.html，静态主机友好） */
function pageOutRel(urlPath: string): string {
  if (urlPath === "/") return "index.html";
  return urlPath.split("/").filter(Boolean).join("/") + "/index.html";
}

async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ac.signal,
      redirect: "follow",
      headers: { "User-Agent": "AstroPress-StaticHtml/0.1 (+site static generator)", ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function pool<T>(items: T[], limit: number, worker: (item: T, idx: number) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

/** 从 HTML 的资源标签中抽取同源静态资源路径（仅 script/link/img/source/audio/video/use） */
function extractAssetPaths(html: string): string[] {
  const out = new Set<string>();
  const tagRe = /<(script|link|img|source|audio|video|use)\b([^>]*?)>/gi;
  const attrRe = /(?:\bsrc|\bhref|\bsrcset)\s*=\s*"([^"]*)"/gi;
  let tm: RegExpExecArray | null;
  while ((tm = tagRe.exec(html))) {
    const attrs = tm[2];
    let am: RegExpExecArray | null;
    attrRe.lastIndex = 0;
    while ((am = attrRe.exec(attrs))) {
      const raw = am[1];
      if (!raw) continue;
      // srcset 可能是 "a.jpg 1x, b.jpg 2x"
      for (const part of raw.split(",")) {
        const u = part.trim().split(/\s+/)[0];
        if (!u || !u.startsWith("/") || u.startsWith("//")) continue;
        const path = u.split("?")[0].split("#")[0];
        if (!path || path === "/") continue;
        if (ASSET_SKIP_PREFIX.some((pre) => path === pre || path.startsWith(pre + "/"))) continue;
        if (path === "/sitemap.xml" || path === "/rss.xml") continue;
        if (!looksLikeStaticAsset(path)) continue;
        const rel = safeUrlPathToRel(path);
        if (rel) out.add(path);
      }
    }
  }
  return [...out];
}

function buildSitemapXml(base: string, entries: Entry[]): string {
  const lines = entries.map((e) => {
    const pri = e.kind === "home" ? "1.0" : e.kind === "post" ? "0.8" : "0.6";
    const freq = e.kind === "home" ? "daily" : e.kind === "post" ? "weekly" : "monthly";
    const lm = e.lastmod ? `\n    <lastmod>${escXml(e.lastmod)}</lastmod>` : "";
    return `  <url>\n    <loc>${escXml(base + e.urlPath)}</loc>${lm}\n    <changefreq>${freq}</changefreq>\n    <priority>${pri}</priority>\n  </url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lines.join("\n")}\n</urlset>`;
}

function buildRssXml(base: string, title: string, description: string, posts: Entry[]): string {
  const items = posts
    .map((p) => {
      const pub = toRfc822(p.date);
      const desc = (p.excerpt || "").slice(0, 300);
      return `    <item>
      <title>${escXml(p.title ?? "")}</title>
      <link>${escXml(base + p.urlPath)}</link>
      <guid>${escXml(base + p.urlPath)}</guid>
      ${pub ? `<pubDate>${escXml(pub)}</pubDate>` : ""}
      <description>${escXml(desc)}</description>
    </item>`;
    })
    .join("\n");
  const lastBuild = posts[0]?.date ? toRfc822(posts[0].date) : new Date().toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escXml(title)}</title>
    <link>${escXml(base)}</link>
    <description>${escXml(description)}</description>
    <lastBuildDate>${escXml(lastBuild ?? new Date().toUTCString())}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

/**
 * 生成 Cloudflare Pages _worker.js
 * 静态文件由 Pages 自动伺服，_worker.js 仅处理：
 *  1. 目录式 URL 补 /index.html
 *  2. 404 回退到 /404.html（如果存在）
 *  3. 自定义 headers（缓存策略、安全头）
 */
function generateWorkerJs(entries: Entry[], base: string): string {
  const paths = entries.map((e) => e.urlPath).sort();
  return `// AstroPress Static HTML — Cloudflare Pages _worker.js
// Generated: ${new Date().toISOString()}
// Pages: ${paths.length} | Base: ${base}

const STATIC_PAGES = ${JSON.stringify(paths, null, 2)};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let pathname = url.pathname;

    // 1. 目录式 URL 规范化：/about → /about/index.html
    if (!pathname.endsWith("/") && !pathname.includes(".") && !pathname.endsWith(".html")) {
      const dirPath = pathname + "/";
      if (STATIC_PAGES.includes(dirPath) || STATIC_PAGES.includes(pathname)) {
        pathname = dirPath;
      }
    }
    if (pathname.endsWith("/")) {
      pathname += "index.html";
    }

    // 2. 尝试获取静态文件
    let response = await env.ASSETS.fetch(new Request(new URL(pathname, url.origin), request));

    // 3. 404 回退：显式缓存策略（与 HTML 一致，max-age=0 must-revalidate）+ 安全头，不再裸返回
    if (response.status === 404) {
      const notFound = await env.ASSETS.fetch(new URL("/404.html", url.origin));
      if (notFound.status === 200) {
        const notFoundHeaders = new Headers(notFound.headers);
        notFoundHeaders.set("Content-Type", "text/html; charset=utf-8");
        notFoundHeaders.set("Cache-Control", "public, max-age=0, must-revalidate");
        notFoundHeaders.set("X-Content-Type-Options", "nosniff");
        notFoundHeaders.set("X-Frame-Options", "SAMEORIGIN");
        notFoundHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
        return new Response(notFound.body, {
          status: 404,
          headers: notFoundHeaders,
        });
      }
    }

    // 4. 缓存与安全头
    const headers = new Headers(response.headers);
    const ext = pathname.split(".").pop()?.toLowerCase() || "";
    const cacheControl = getCacheControl(ext, pathname);
    if (cacheControl) headers.set("Cache-Control", cacheControl);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "SAMEORIGIN");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};

function getCacheControl(ext, pathname) {
  // 静态资源：1 年 immutable
  if (/^(js|mjs|css|png|jpg|jpeg|gif|svg|webp|avif|ico|woff|woff2|ttf|eot|otf)$/.test(ext)) {
    return "public, max-age=31536000, immutable";
  }
  // HTML：不缓存（或短缓存，视更新频率）
  if (ext === "html" || pathname.endsWith("/")) {
    return "public, max-age=0, must-revalidate";
  }
  // 其他（sitemap/rss/robots）：1 小时
  return "public, max-age=3600";
}
`;
}

/** 生成 _routes.json（Cloudflare Pages 路由配置，可选） */
function generateRoutesJson(entries: Entry[]): string {
  // 让 Pages 把静态资源请求直接交给 ASSETS，不经过 Worker
  return JSON.stringify(
    {
      version: 1,
      include: ["/*"],
      exclude: ["/_astro/*", "/media/*", "/*.js", "/*.css", "/*.png", "/*.jpg", "/*.svg", "/*.ico"],
    },
    null,
    2,
  );
}

export interface StartResult {
  ok: boolean;
  error?: string;
}

/**
 * 启动一次生成（异步执行，立即返回；进度通过 state 查询）。
 * 同进程已有任务运行时拒绝。
 */
export async function startGeneration(db: any, origin: string, trigger: "manual" | "schedule"): Promise<StartResult> {
  if (isProcessRunning()) return { ok: false, error: "已有生成任务正在运行" };

  const settings = await loadSettingsSafe(db);
  if (!settings) return { ok: false, error: "无法读取插件设置" };

  markProcessRunning(true);
  const startedAt = new Date().toISOString();
  const prev = await loadState(db);
  const state: RunState = {
    ...prev,
    running: true,
    trigger,
    startedAt,
    finishedAt: null,
    status: "running",
    phase: "准备中…",
    pages: 0,
    assets: 0,
    bytes: 0,
    outputDir: settings.outputDir,
    errors: [],
    origin: origin || prev.origin || "",
  };
  if (trigger === "schedule") state.lastAutoAt = startedAt;
  if (origin) state.origin = origin;
  await saveState(db, state);

  // 不 await：后台执行
  void runGeneration(db, settings, state, origin, trigger, startedAt).catch((e) => {
    // 兜底：runGeneration 内部已完整捕获，这里仅防未预期拒绝
    markProcessRunning(false);
    console.error("[static-html] generation crashed:", e);
  });

  return { ok: true };
}

async function loadSettingsSafe(db: any): Promise<StaticHtmlSettings | null> {
  try {
    const m = await import("./settings");
    return await m.loadSettings(db);
  } catch {
    return null;
  }
}

function pushError(state: RunState, errors: RunError[], e: RunError): void {
  if (errors.length < MAX_ERRORS) errors.push(e);
  state.errors = errors;
}

async function runGeneration(
  db: any,
  settings: StaticHtmlSettings,
  state: RunState,
  origin: string,
  trigger: "manual" | "schedule",
  startedAt: string,
): Promise<void> {
  const errors: RunError[] = [];
  let totalPages = 0;
  let totalAssets = 0;
  let totalBytes = 0;
  let lastSave = Date.now();

  const persist = async (force = false) => {
    if (!force && Date.now() - lastSave < 1000) return;
    lastSave = Date.now();
    state.pages = totalPages;
    state.assets = totalAssets;
    state.bytes = totalBytes;
    try {
      await saveState(db, state);
    } catch { /* 进度落库失败不致命 */ }
  };

  try {
    const siteInfo = await getSiteInfo(db);
    const base = (origin || siteInfo.url || state.origin || "").replace(/\/+$/, "");
    if (!/^https?:\/\/.+/i.test(base)) throw new Error("无法确定站点地址（origin 缺失），请在有访问时再试");

    if (!isSafeOutputDir(settings.outputDir)) throw new Error("输出目录不合法，已中止");
    const outDir = resolveOutputDir(settings.outputDir);
    // 生成前清空旧产物：避免已删除页面与上一代构建资源（如 dev 时期的 /@vite/client）残留
    await fs.rm(outDir, { recursive: true, force: true });
    await fs.mkdir(outDir, { recursive: true });

    // ---- 1. 同一 DB 快照收集 URL ----
    state.phase = "收集页面清单…";
    await persist(true);

    const entries: Entry[] = [{ urlPath: "/", outRel: "index.html", kind: "home", lastmod: isoDate(new Date().toISOString()) }];

    // 页面 slug 先收集：permalink 模式下文章与页面同 slug 冲突时文章回退 /blog/（与前台「页面优先」一致）
    const pageSlugs = new Set<string>();
    if (settings.includePages) {
      const pages = await db
        .select({
          title: wpPosts.postTitle,
          name: wpPosts.postName,
          date: wpPosts.postDate,
          modified: wpPosts.postModified,
        })
        .from(wpPosts)
        .where(and(eq(wpPosts.postStatus, "publish"), eq(wpPosts.postType, "page")))
        .orderBy(desc(wpPosts.postDate));
      for (const p of pages) {
        const slug = (p.name || "").trim();
        if (!slug || RESERVED_SLUGS.has(slug.toLowerCase()) || slug.startsWith("_")) continue;
        pageSlugs.add(slug);
        const urlPath = "/" + slug;
        entries.push({
          urlPath,
          outRel: pageOutRel(urlPath),
          kind: "page",
          lastmod: isoDate(p.modified || p.date),
          date: p.date ?? null,
        });
      }
    }

    const useRootPosts = await permalinkActive(db);

    const posts = await db
      .select({
        id: wpPosts.id,
        title: wpPosts.postTitle,
        name: wpPosts.postName,
        date: wpPosts.postDate,
        modified: wpPosts.postModified,
        excerpt: wpPosts.postExcerpt,
        content: wpPosts.postContent,
      })
      .from(wpPosts)
      .where(and(eq(wpPosts.postStatus, "publish"), eq(wpPosts.postType, "post")))
      .orderBy(desc(wpPosts.postDate))
      .limit(settings.maxPosts);

    for (const p of posts) {
      if (!p.name) continue;
      // permalink 生效且 slug 是安全单段、不与保留段/页面冲突时，导出到 /{slug}
      const rootOk =
        useRootPosts &&
        /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,199}$/.test(p.name) &&
        !RESERVED_SLUGS.has(p.name.toLowerCase()) &&
        !pageSlugs.has(p.name);
      const urlPath = rootOk ? "/" + p.name : "/blog/" + p.name;
      entries.push({
        urlPath,
        outRel: pageOutRel(urlPath),
        kind: "post",
        lastmod: isoDate(p.modified || p.date),
        title: p.title ?? "",
        excerpt: stripHtml(p.excerpt || p.content || ""),
        date: p.date ?? null,
      });
    }

    totalPages = entries.length;
    const htmlByPath = new Map<string, string>();

    // permalink 模式下导出到根路径的文章：HTML 内的 /blog/{slug} 内链重写为 /{slug}，
    // 否则静态部署后站内文章链接 404（仅替换本次确知导出的文章，避免误改）
    const rootSlugMap = new Map<string, string>();
    for (const e of entries) {
      if (e.kind === "post" && !e.urlPath.startsWith("/blog/")) {
        rootSlugMap.set(e.urlPath.slice(1), e.urlPath);
      }
    }
    const rewritePostLinks = (html: string): string => {
      if (rootSlugMap.size === 0) return html;
      const escBase = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // 相对 /blog/x 与绝对 https://host/blog/x 两种内链都重写；保留 ?/# 尾部，目录式补 /
      const re = new RegExp(
        `(href|src)=(["'])(?:${escBase})?\\/blog\\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,199})(\\/?(?:[?#][^"']*)?)\\2`, "g");
      return html.replace(re, (m, attr, q, slug, tail) => {
        const np = rootSlugMap.get(slug);
        if (!np) return m;
        const suffix = tail && tail.startsWith("/") ? tail : "/" + (tail || "");
        return `${attr}=${q}${np}${suffix}${q}`;
      });
    };

    // ---- 2. 抓取页面 HTML ----
    let donePages = 0;
    await pool(entries, CONCURRENCY, async (e) => {
      const url = base + e.urlPath;
      try {
        const res = await fetchWithTimeout(url, PAGE_TIMEOUT_MS);
        if (res.status !== 200) {
          pushError(state, errors, { url: e.urlPath, status: res.status, error: "HTTP " + res.status });
        } else {
          const html = rewritePostLinks(stripDevOnly(await res.text()));
          const ctype = res.headers.get("content-type") ?? "";
          if (!ctype.includes("html")) {
            pushError(state, errors, { url: e.urlPath, status: res.status, error: "非 HTML 响应：" + ctype });
          } else {
            const abs = join(outDir, e.outRel);
            await fs.mkdir(join(abs, ".."), { recursive: true });
            await fs.writeFile(abs, html, "utf8");
            totalBytes += Buffer.byteLength(html);
            htmlByPath.set(e.urlPath, html);
          }
        }
      } catch (err: any) {
        pushError(state, errors, { url: e.urlPath, error: err?.name === "AbortError" ? "抓取超时" : String(err?.message || err) });
      }
      donePages++;
      state.phase = `抓取页面 ${donePages}/${entries.length}`;
      await persist();
    });

    // ---- 3. 静态资源 ----
    if (settings.includeAssets) {
      const assetSet = new Set<string>();
      for (const html of htmlByPath.values()) {
        for (const a of extractAssetPaths(html)) assetSet.add(a);
        if (assetSet.size >= MAX_ASSETS) break;
      }
      const assets = [...assetSet].slice(0, MAX_ASSETS);
      let doneAssets = 0;
      await pool(assets, CONCURRENCY, async (path) => {
        const rel = safeUrlPathToRel(path);
        if (!rel) return;
        try {
          const res = await fetchWithTimeout(base + path, ASSET_TIMEOUT_MS);
          if (res.status !== 200) {
            pushError(state, errors, { url: path, status: res.status, error: "资源 HTTP " + res.status });
          } else {
            const buf = Buffer.from(await res.arrayBuffer());
            const abs = join(outDir, rel);
            await fs.mkdir(join(abs, ".."), { recursive: true });
            await fs.writeFile(abs, buf);
            totalBytes += buf.length;
            totalAssets++;
          }
        } catch (err: any) {
          pushError(state, errors, { url: path, error: err?.name === "AbortError" ? "资源抓取超时" : String(err?.message || err) });
        }
        doneAssets++;
        state.phase = `抓取静态资源 ${doneAssets}/${assets.length}`;
        await persist();
      });
    }

    // ---- 4. 所有页面就绪后，统一生成 sitemap.xml / rss.xml ----
    state.phase = "生成 sitemap.xml 与 rss.xml…";
    await persist(true);

    const sitemapXml = buildSitemapXml(base, entries);
    await fs.writeFile(join(outDir, "sitemap.xml"), sitemapXml, "utf8");
    totalBytes += Buffer.byteLength(sitemapXml);

    const siteInfo2 = await getSiteInfo(db);
    const rssXml = buildRssXml(
      base,
      siteInfo2.name || "AstroPress",
      siteInfo2.description || "",
      entries.filter((e) => e.kind === "post"),
    );
    await fs.writeFile(join(outDir, "rss.xml"), rssXml, "utf8");
    totalBytes += Buffer.byteLength(rssXml);

    // ---- 5. Cloudflare Pages 兼容模式：生成 _worker.js 入口 ----
    if (settings.outputMode === "pages") {
      state.phase = "生成 Cloudflare Pages _worker.js…";
      await persist(true);
      const workerJs = generateWorkerJs(entries, base);
      await fs.writeFile(join(outDir, "_worker.js"), workerJs, "utf8");
      totalBytes += Buffer.byteLength(workerJs);
      // 同时生成 _routes.json 供 Pages 路由配置
      const routesJson = generateRoutesJson(entries);
      await fs.writeFile(join(outDir, "_routes.json"), routesJson, "utf8");
      totalBytes += Buffer.byteLength(routesJson);
    }

    // ---- 收尾：状态 + 历史 ----
    const pageErrorCount = errors.filter((e) => !e.url.startsWith("/_astro") && !e.url.startsWith("/media")).length;
    const finalStatus: "ok" | "warn" | "error" = pageErrorCount > 0 ? "error" : errors.length > 0 ? "warn" : "ok";
    const finishedAt = new Date().toISOString();

    state.running = false;
    state.status = finalStatus;
    state.phase = pageErrorCount
      ? `完成，但有 ${pageErrorCount} 个页面失败`
      : errors.length
        ? `完成（${errors.length} 个资源失败）`
        : "生成完成";
    state.finishedAt = finishedAt;
    state.pages = totalPages;
    state.assets = totalAssets;
    state.bytes = totalBytes;
    state.errors = errors;
    await saveState(db, state);

    await appendRun(db, {
      startedAt,
      finishedAt,
      trigger,
      status: finalStatus,
      pages: totalPages,
      assets: totalAssets,
      bytes: totalBytes,
      outputDir: settings.outputDir,
      ms: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      errors,
    });
  } catch (e: any) {
    const finishedAt = new Date().toISOString();
    const msg = String(e?.message || e);
    pushError(state, errors, { url: "-", error: msg });
    state.running = false;
    state.status = "error";
    state.phase = "生成失败：" + msg;
    state.finishedAt = finishedAt;
    state.pages = totalPages;
    state.assets = totalAssets;
    state.bytes = totalBytes;
    state.errors = errors;
    try {
      await saveState(db, state);
      await appendRun(db, {
        startedAt,
        finishedAt,
        trigger,
        status: "error",
        pages: totalPages,
        assets: totalAssets,
        bytes: totalBytes,
        outputDir: settings.outputDir,
        ms: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
        errors,
      });
    } catch { /* 状态落库失败已无计可施 */ }
  } finally {
    markProcessRunning(false);
  }
}
