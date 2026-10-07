import type { APIRoute } from "astro";
import { loadKeys, createKey, deleteKey } from "../../lib/keys";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

async function requireAdmin(ctx: any) {
  const user = (ctx.locals as any).user;
  if (!user) return null;
  return user;
}

export const GET: APIRoute = async ({ locals }) => {
  const user = await requireAdmin({ locals });
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  const keys = await loadKeys(db);
  // Never expose key hashes — only metadata
  return json(keys.map((k) => ({ id: k.id, name: k.name, permissions: k.permissions, createdAt: k.createdAt, lastUsed: k.lastUsed })));
};

export const POST: APIRoute = async ({ locals, request }) => {
  const user = await requireAdmin({ locals });
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: { name?: string; permissions?: string[] };
  try {
    body = (await request.json()) as { name?: string; permissions?: string[] };
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }
  if (!body.name?.trim()) return json({ error: "名称不能为空" }, 400);

  const db = (locals as any).db;
  const result = await createKey(db, body.name.trim(), body.permissions ?? ["publish"]);
  return json({ ok: true, id: result.id, key: result.key, warning: "请立即保存此密钥，它不会再次显示。" });
};

export const DELETE: APIRoute = async ({ locals, request }) => {
  const user = await requireAdmin({ locals });
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return json({ error: "缺少记录 id" }, 400);

  const db = (locals as any).db;
  const ok = await deleteKey(db, id);
  return json({ ok });
};
