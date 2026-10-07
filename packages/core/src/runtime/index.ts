/**
 * 运行时环境检测 — Cloudflare Workers / Node.js 双运行时适配。
 *
 * Cloudflare Workers 运行时特征：
 *  - `navigator.userAgent === "Cloudflare-Workers"`（官方推荐检测方式）
 *  - 存在 `WebSocketPair` / `caches.default` 全局
 *  - 无持久文件系统（node:fs 读写调用会抛错）
 *
 * 注意：wrangler.toml 已启用 `nodejs_compat`，
 * node:path / node:os / node:crypto / node:buffer / node:util / node:events / node:stream
 * 在 Workers 上可用；只有 fs（磁盘读写）、child_process、net/tls 不可用。
 */

/** 是否运行在 Cloudflare Workers 环境 */
export function isCloudflareRuntime(): boolean {
  // 官方信号：CF Workers 的 navigator.userAgent 固定为 "Cloudflare-Workers"
  const nav = (globalThis as any).navigator;
  if (nav && typeof nav.userAgent === "string" && nav.userAgent === "Cloudflare-Workers") return true;
  // 兜底信号：WebSocketPair 仅存在于 Workers 运行时
  if (typeof (globalThis as any).WebSocketPair === "function") return true;
  // 构建期/SSR 期显式开关
  if (typeof process !== "undefined" && process.env?.ASTRO_ADAPTER === "cloudflare") return true;
  return false;
}

/** 当前环境是否支持本地文件系统读写 */
export function hasFileSystem(): boolean {
  return !isCloudflareRuntime();
}

/** 当前环境是否支持子进程（Playwright / git CLI 等） */
export function hasChildProcess(): boolean {
  return !isCloudflareRuntime();
}

/**
 * 生成一个 501 响应：当前部署环境不支持该功能。
 * 供 API 路由在 CF 环境下优雅降级使用。
 */
export function envNotSupported(feature: string): Response {
  return new Response(
    JSON.stringify({
      error: "ENV_NOT_SUPPORTED",
      message: `「${feature}」需要本地文件系统或子进程，Cloudflare Workers 环境不支持。请在 Node.js 部署（VPS/Docker/本地）中使用该功能。`,
    }),
    { status: 501, headers: { "Content-Type": "application/json" } },
  );
}
