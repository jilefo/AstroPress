import type { APIRoute } from "astro";
import { eq, and } from "drizzle-orm";
import { wpPostmeta } from "@astropress/core/schema";
import { readJsonBody } from "../../../../lib/json-body";

export const GET: APIRoute = async ({ params, locals }) => {
  const db = locals.db;
  if (!db) return new Response("数据库不可用", { status: 503 });

  const postId = Number(params.id);
  const rows = await db
    .select({ key: wpPostmeta.metaKey, value: wpPostmeta.metaValue })
    .from(wpPostmeta)
    .where(eq(wpPostmeta.postId, postId));

  const meta = Object.fromEntries(rows.map((r: any) => [r.key ?? "", r.value ?? ""]));
  return new Response(JSON.stringify(meta), {
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const db = locals.db;
  if (!db || !locals.user) return new Response("未登录或登录已过期", { status: 401 });

  const postId = Number(params.id);
  const parsed = await readJsonBody<Record<string, string>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  for (const [key, value] of Object.entries(body)) {
    // Check if meta key exists
    const [existing] = await db
      .select({ metaId: wpPostmeta.metaId })
      .from(wpPostmeta)
      .where(and(eq(wpPostmeta.postId, postId), eq(wpPostmeta.metaKey, key)))
      .limit(1);

    if (existing) {
      await db
        .update(wpPostmeta)
        .set({ metaValue: value })
        .where(eq(wpPostmeta.metaId, existing.metaId));
    } else {
      await db.insert(wpPostmeta).values({ postId, metaKey: key, metaValue: value });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
};
