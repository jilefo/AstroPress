/**
 * Shared auth helper — extracts and validates the API key from the request.
 * Returns the validated ApiKey or null.
 */
import type { APIContext } from "astro";
import { validateKey } from "../../lib/keys";

export async function requireApiKey(ctx: APIContext): Promise<{ key: string; keyData: any } | Response> {
  const db = (ctx.locals as any).db;
  if (!db) return new Response(JSON.stringify({ error: "服务器错误" }), { status: 500 });

  const authHeader = ctx.request.headers.get("authorization") ?? "";
  const apiKeyHeader = ctx.request.headers.get("x-api-key") ?? "";
  const key = authHeader.replace(/^Bearer\s+/i, "").trim() || apiKeyHeader.trim();

  if (!key) {
    return new Response(JSON.stringify({ error: "缺少 API 密钥，请通过 Authorization: Bearer <密钥> 或 X-API-Key: <密钥> 传入" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const keyData = await validateKey(db, key);
  if (!keyData) {
    return new Response(JSON.stringify({ error: "API 密钥无效" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { key, keyData };
}
