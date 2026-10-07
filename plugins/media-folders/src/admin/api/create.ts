import type { APIRoute } from "astro";
import { createFolder } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "未登录或登录已过期" }, 401);
  try {
    const body = await request.json() as { name?: string; parentId?: number };
    if (!body.name?.trim()) return json({ error: "名称不能为空" }, 400);
    const name = body.name.trim().slice(0, 100);
    if (/[<>"]/.test(name)) return json({ error: "名称不能包含 < > \" 字符" }, 400);
    const id = await createFolder(db, name, body.parentId ?? null);
    return json({ ok: true, id });
  } catch { return json({ error: "无效的请求" }, 400); }
};
