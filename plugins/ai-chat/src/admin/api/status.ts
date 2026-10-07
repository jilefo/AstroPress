import type { APIRoute } from "astro";
import { PROVIDERS } from "../../lib/providers";
import { listSessions, VIEWPORT } from "../../lib/browser";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const sessions = listSessions();
  return json({
    viewport: VIEWPORT,
    providers: PROVIDERS.map((p) => ({ id: p.id, name: p.name, url: p.url, loginUrl: p.loginUrl })),
    sessions,
  });
};
