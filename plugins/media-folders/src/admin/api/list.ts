import type { APIRoute } from "astro";
import { listFolders } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ error: "未登录或登录已过期" }, 401);
  try {
    const folders = await listFolders(db);
    return json({ ok: true, folders });
  } catch (err: any) { return json({ error: String(err?.message ?? err).slice(0, 200) }, 500); }
};
