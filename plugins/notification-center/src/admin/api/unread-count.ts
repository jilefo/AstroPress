import type { APIRoute } from "astro";
import { unreadCount } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  if (!db || !(locals as any).user) return json({ count: 0 });
  try {
    const count = await unreadCount(db, (locals as any).user.id);
    return json({ count });
  } catch { return json({ count: 0 }); }
};
