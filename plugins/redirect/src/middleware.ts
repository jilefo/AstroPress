import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { bumpHits, loadRedirects, type RedirectRule } from "./lib/store";
import { getPreDb } from "./lib/db";

/**
 * post 中间件：核心中间件已注入 locals.db，在路由 handler 前拦截请求，命中规则时直接返回 301/302。
 *
 * - 跳过插件禁用检查（共享缓存 @astropress/core/plugin-state，15 秒 TTL + 变更主动失效，出错视为启用）
 * - 跳过后台 / API / 静态资源等前缀，以及最后一段含 . 的路径
 * - 先精确匹配（不区分大小写），再通配匹配（from 以 /* 结尾做前缀匹配）
 * - 保留原 query string，带循环保护
 * - 命中后异步 hits+1（互斥锁 + try/catch，不阻塞响应）
 */

// ---- 重定向规则缓存（10 秒）----
let rdCache: { at: number; list: RedirectRule[] } | null = null;
async function getRedirects(db: any): Promise<RedirectRule[]> {
  if (rdCache && Date.now() - rdCache.at < 10000) return rdCache.list;
  const list = await loadRedirects(db);
  rdCache = { at: Date.now(), list };
  return list;
}

/** 命中后让下一次请求重新加载规则，保证命中次数及时反映 */
export function invalidateRedirectsCache(): void {
  rdCache = null;
}

// 需要跳过的路径前缀（后台、API、静态资源等）。
// 同时供管理 API 复用：命中这些前缀的规则永远不会触发，保存时直接拒绝，
// 避免用户建立「看似成功但永不生效」的重定向。
export const REDIRECT_SKIP_PREFIXES = [
  "/admin",
  "/api",
  "/admin-ext",
  "/ap-",
  "/ml-asset",
  "/ml/",
  "/media",
  "/_astro",
  "/login",
  "/search",
  "/rss.xml",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
];

function shouldSkip(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  for (const prefix of REDIRECT_SKIP_PREFIXES) {
    if (lower.startsWith(prefix)) return true;
  }
  // 最后一段含 . 的视为静态文件（如 /img/logo.png）
  const lastSeg = lower.split("/").pop() ?? "";
  if (lastSeg.includes(".")) return true;
  return false;
}

interface MatchResult {
  rule: RedirectRule;
  target: string;
}

/** 先精确匹配（不区分大小写），再通配匹配（from 以 /* 结尾） */
function matchRule(list: RedirectRule[], pathname: string): MatchResult | null {
  const lower = pathname.toLowerCase();
  for (const r of list) {
    if (!r.enabled) continue;
    if (r.from.toLowerCase() === lower) return { rule: r, target: r.to };
  }
  for (const r of list) {
    if (!r.enabled) continue;
    if (!r.from.endsWith("/*")) continue;
    const prefix = r.from.slice(0, -2); // 去掉 /*
    if (!(lower === prefix.toLowerCase() || lower.startsWith(prefix.toLowerCase() + "/"))) continue;
    // 剩余路径（前缀之后的部分）
    const rest = pathname.slice(prefix.length);
    if (r.to.endsWith("/*")) {
      // 目标也是通配：把剩余路径拼接到目标前缀后
      return { rule: r, target: r.to.slice(0, -2) + rest };
    }
    return { rule: r, target: r.to };
  }
  return null;
}

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const pathname = ctx.url.pathname;

  // 跳过无需处理的路径
  if (shouldSkip(pathname)) return next();

  // post 中间件：核心中间件已注入 locals.db，优先使用；pre 兼容回退到自建连接
  const locals = ctx.locals as any;
  const db = locals.db ?? (await getPreDb(locals));
  if (!db) return next();

  // 插件被禁用时直接放行
  if (await isPluginDisabled(db, "redirect")) return next();

  let list: RedirectRule[];
  try {
    list = await getRedirects(db);
  } catch {
    return next();
  }
  if (!list.length) return next();

  const hit = matchRule(list, pathname);
  if (!hit) return next();

  // 保留原 query string 拼到目标后
  const target = hit.target + ctx.url.search;

  // 循环保护（多跳）：仅判断第一跳无法发现通配规则组成的环
  // （/a/*→/b/* 与 /b/x→/a/x 各自保存都合法，但请求会无限 301）。
  // 从第一跳目标开始沿规则链最多模拟 5 跳，出现已访问路径即放弃重写放行。
  let firstTargetPath = hit.target;
  if (/^https?:\/\//i.test(firstTargetPath)) {
    try {
      firstTargetPath = new URL(firstTargetPath).pathname;
    } catch {
      return next();
    }
  } else {
    firstTargetPath = firstTargetPath.split(/[?#]/)[0];
  }
  if (firstTargetPath.toLowerCase() === pathname.toLowerCase()) return next();

  const visited = new Set<string>([pathname.toLowerCase()]);
  let cursor = firstTargetPath;
  for (let hop = 0; hop < 5; hop++) {
    const key = cursor.toLowerCase();
    if (visited.has(key)) return next(); // 链上回环
    visited.add(key);
    const nextHit = matchRule(list, cursor);
    if (!nextHit) break; // 落到正常路由
    let nextPath = nextHit.target;
    if (/^https?:\/\//i.test(nextPath)) break; // 外链无法本地继续模拟
    cursor = nextPath.split(/[?#]/)[0];
  }

  // 命中计数 +1：异步执行，失败静默忽略，不阻塞响应
  bumpHits(db, hit.rule.id).then(invalidateRedirectsCache).catch(() => {});

  return new Response(null, { status: hit.rule.type, headers: { Location: target } });
};
