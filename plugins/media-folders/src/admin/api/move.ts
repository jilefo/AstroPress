import type { APIRoute } from "astro";
import { moveMedia } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "未登录或登录已过期" }, 401);
  try {
    const body = await request.json() as { mediaIds?: number[]; folderId?: number | null };
    if (!body.mediaIds?.length) return json({ error: "请选择要移动的媒体文件" }, 400);
    await moveMedia(db, body.mediaIds.slice(0, 100), body.folderId ?? null);
    return json({ ok: true });
  } catch { return json({ error: "无效的请求" }, 400); }
};
