/** 统一 JSON 响应 */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/**
 * 写操作 Origin 校验（防 CSRF）。
 * 浏览器同源 fetch 会带上 Origin；无 Origin 头时不拦截（非浏览器客户端）。
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(request.url).origin === origin;
  } catch {
    return false;
  }
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
