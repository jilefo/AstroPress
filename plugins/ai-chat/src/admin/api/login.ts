import type { APIRoute } from "astro";
import { openLoginPage, checkLoginStatus, closeSession, logoutSession } from "../../lib/browser";
import { hasChildProcess, envNotSupported } from "@astropress/core";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasChildProcess()) return envNotSupported("AI 平台登录（需要浏览器子进程）");
  const user = (locals as any).user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "CSRF" }, 403);

  let body: { provider?: string; action?: string };
  try {
    body = (await request.json()) as { provider?: string; action?: string };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.provider || !body.action) return json({ error: "provider and action required" }, 400);

  try {
    if (body.action === "open") {
      const result = await openLoginPage(body.provider);
      return json({ ok: true, ...result });
    }
    if (body.action === "check") {
      const result = await checkLoginStatus(body.provider);
      return json({ ok: true, ...result });
    }
    if (body.action === "close") {
      // 仅关闭浏览器上下文，保留本地登录态
      await closeSession(body.provider);
      return json({ ok: true });
    }
    if (body.action === "logout") {
      // 退出登录：关闭并清除本地 profile
      await logoutSession(body.provider);
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (err: any) {
    return json({ error: err?.message ?? String(err) }, 502);
  }
};
