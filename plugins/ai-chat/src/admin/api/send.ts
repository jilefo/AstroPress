import type { APIRoute } from "astro";
import { sendPrompt } from "../../lib/browser";
import { hasChildProcess, envNotSupported } from "@astropress/core";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ locals, request }) => {
  if (!hasChildProcess()) return envNotSupported("AI 网页版助手（需要浏览器子进程）");
  const user = (locals as any).user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "CSRF" }, 403);

  let body: { provider?: string; prompt?: string };
  try {
    body = (await request.json()) as { provider?: string; prompt?: string };
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.provider || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return json({ error: "provider and prompt required" }, 400);
  }

  const result = await sendPrompt(body.provider, body.prompt.trim());
  if (result.error) return json({ error: result.error }, 400);
  return json({ ok: true, reply: result.reply });
};
