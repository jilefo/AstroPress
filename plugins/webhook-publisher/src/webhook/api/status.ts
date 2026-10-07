import type { APIRoute } from "astro";
import { requireApiKey } from "./_auth";
import { loadLogs } from "../../lib/logs";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async (ctx) => {
  const auth = await requireApiKey(ctx);
  if (auth instanceof Response) return auth;
  const { keyData } = auth;
  const db = (ctx.locals as any).db;

  const logs = await loadLogs(db);
  return json({
    ok: true,
    key: { id: keyData.id, name: keyData.name, permissions: keyData.permissions },
    recentLogs: logs.slice(0, 20),
  });
};
