import type { APIRoute } from "astro";
import { startWarm } from "../../lib/warm";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** POST /admin-ext/api/cache-warmer/run — 立即触发一批预热（运行互斥，重复触发 409） */
export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  try {
    await request.json();
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  const db = (locals as any).db;
  // CF Workers：预热 promise 交给运行时 waitUntil 托管，避免 isolate 提前回收导致批次夭折
  const runtime = (locals as any).runtime;
  const wu = runtime?.ctx?.waitUntil;
  const schedule =
    typeof wu === "function" ? (p: Promise<void>) => wu.call(runtime.ctx, p) : undefined;
  if (!startWarm(db, "manual", schedule)) {
    return json({ error: "已有预热任务运行中" }, 409);
  }
  return json({ ok: true }, 202);
};
