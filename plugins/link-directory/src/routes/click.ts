import type { APIRoute } from "astro";
import { ensureSchema } from "../lib/schema";
import { incrementClick } from "../lib/store";

/**
 * GET /ap-links/click?id=123
 * 公开跳转端点：
 *   - 链接不存在或状态非 approved → 404（不暴露未审核链接）
 *   - clicks +1 后 302 到目标 URL
 */
export const GET: APIRoute = async ({ locals, request }) => {
  const db = (locals as any).db;
  if (!db) return new Response("服务器错误", { status: 500 });

  const id = parseInt(new URL(request.url).searchParams.get("id") ?? "", 10);
  if (!Number.isInteger(id) || id <= 0) {
    return new Response("页面不存在", { status: 404 });
  }

  try {
    await ensureSchema(db);
    const link = await incrementClick(db, id);
    if (!link) return new Response("页面不存在", { status: 404 });
    // 双重校验：目标必须是 http(s) URL（入库时已校验，跳转前再确认一次）
    if (!/^https?:\/\//i.test(link.url)) return new Response("页面不存在", { status: 404 });
    return new Response(null, { status: 302, headers: { Location: link.url } });
  } catch {
    return new Response("服务器错误", { status: 500 });
  }
};
