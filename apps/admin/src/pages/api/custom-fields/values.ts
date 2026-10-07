import type { APIRoute } from "astro";
import { wpPostmeta } from "@astropress/core/schema";
import { eq, and, inArray } from "drizzle-orm";
import { readJsonBody } from "../../../lib/json-body";

export const GET: APIRoute = async ({ url, locals }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });

  const postId = Number(url.searchParams.get("postId"));
  if (!postId) return new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } });

  const rows = await db
    .select({ key: wpPostmeta.metaKey, value: wpPostmeta.metaValue })
    .from(wpPostmeta)
    .where(eq(wpPostmeta.postId, postId));

  const result: Record<string, string> = {};
  for (const row of rows) {
    if (row.key) result[row.key] = row.value ?? "";
  }

  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });

  const parsed = await readJsonBody<{ postId: number; values: Record<string, string> }>(request);
  if (!parsed.ok) return parsed.response;
  const { postId, values } = parsed.data;
  if (!postId || !values) return new Response(JSON.stringify({ error: "缺少文章 ID 或字段值" }), { status: 400, headers: { "Content-Type": "application/json" } });

  for (const [key, value] of Object.entries(values)) {
    const existing = await db
      .select({ metaId: wpPostmeta.metaId })
      .from(wpPostmeta)
      .where(and(eq(wpPostmeta.postId, postId), eq(wpPostmeta.metaKey, key)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(wpPostmeta)
        .set({ metaValue: value })
        .where(and(eq(wpPostmeta.postId, postId), eq(wpPostmeta.metaKey, key)));
    } else {
      await db
        .insert(wpPostmeta)
        .values({ postId, metaKey: key, metaValue: value });
    }
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
