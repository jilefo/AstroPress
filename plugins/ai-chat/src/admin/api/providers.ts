import type { APIRoute } from "astro";
import { PROVIDERS } from "../../lib/providers";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  return json(PROVIDERS.map((p: { id: string; name: string; url: string }) => ({ id: p.id, name: p.name, url: p.url })));
};
