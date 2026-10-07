import type { APIRoute } from "astro";
import { startGeneration } from "../../lib/generator";
import { isProcessRunning } from "../../lib/state";
import { hasFileSystem, envNotSupported } from "@astropress/core";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasFileSystem()) return envNotSupported("静态HTML生成（Cloudflare 上请直接使用 Pages 构建产物）");
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "CSRF" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的 JSON" }, 400);
  }
  if (body.confirm !== true) return json({ error: "缺少 confirm 确认" }, 400);

  if (isProcessRunning()) return json({ ok: false, error: "已有生成任务正在运行" }, 409);

  const reqOrigin = new URL(request.url).origin;
  const res = await startGeneration((locals as any).db, reqOrigin, "manual");
  if (!res.ok) return json({ ok: false, error: res.error || "启动失败" }, 409);
  return json({ ok: true });
};
