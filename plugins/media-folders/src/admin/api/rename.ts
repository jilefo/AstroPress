import type { APIRoute } from "astro";
import { renameFolder } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "未登录或登录已过期" }, 401);
  try {
    const body = await request.json() as { id?: number; name?: string };
    if (!body.id || !body.name?.trim()) return json({ error: "缺少文件夹 id 或新名称" }, 400);
    const name = body.name.trim().slice(0, 100);
    if (/[<>"]/.test(name)) return json({ error: "名称不能包含 < > \" 字符" }, 400);
    await renameFolder(db, body.id, name);
    return json({ ok: true });
  } catch { return json({ error: "无效的请求" }, 400); }
};
