import type { APIRoute } from "astro";
import { hasChildProcess, envNotSupported } from "@astropress/core";
import { viewScreenshot, VIEWPORT } from "../../lib/browser";

/**
 * GET /admin-ext/api/ai-chat/screenshot?provider=deepseek&t=123
 * 返回内嵌浏览器视图的实时 JPEG。t 仅用于防缓存。
 */
export const GET: APIRoute = async ({ locals, url }) => {
  if (!hasChildProcess()) return envNotSupported("AI 会话截图（需要浏览器子进程）");
  const user = (locals as any).user;
  if (!user) return new Response("Unauthorized", { status: 401 });

  const provider = String(url.searchParams.get("provider") ?? "");
  if (!provider) return new Response("Bad request", { status: 400 });

  try {
    const { buf } = await viewScreenshot(provider);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Viewport-W": String(VIEWPORT.width),
        "X-Viewport-H": String(VIEWPORT.height),
      },
    });
  } catch (err: any) {
    // 会话启动失败时返回纯文本错误，前端显示提示而非破图
    return new Response(`screenshot failed: ${err?.message ?? String(err)}`, { status: 502 });
  }
};
