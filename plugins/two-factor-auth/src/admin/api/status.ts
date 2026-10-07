import type { APIRoute } from "astro";
import { is2FAEnabled } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ enabled: false });
  try {
    const enabled = await is2FAEnabled(db, user.id);
    return json({ ok: true, enabled });
  } catch { return json({ enabled: false }); }
};
