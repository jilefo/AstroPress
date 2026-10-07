/** 统一 JSON 响应 */
export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

/** 写操作同源（Origin）校验，防 CSRF；无 Origin 头时放行（同源 GET / 非浏览器客户端） */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(request.url).origin === origin;
  } catch {
    return false;
  }
}

/**
 * 取访客 IP（与核心 forms/login 路由同一约定）。
 * 优先 cf-connecting-ip：Cloudflare 边缘写入并覆盖该头，客户端无法伪造。
 * 其次 x-forwarded-for 首段（可信反代场景）；均缺失时 "unknown"。
 * 不使用 Astro.clientAddress：@astrojs/cloudflare 下其 getter 会抛
 * ClientAddressNotAvailable，且经中间件 new Request() 重包后符号会丢失。
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  ).slice(0, 45);
}
