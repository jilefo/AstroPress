import type { APIRoute } from "astro";
import { listMedia } from "../../../lib/media";

export const GET: APIRoute = async ({ url, locals }) => {
  const db = locals.db;
  if (!db) return new Response("数据库不可用", { status: 503 });

  const page = Number(url.searchParams.get("page") ?? "1");
  const search = url.searchParams.get("search") ?? undefined;
  const baseUrl = url.origin;
  const { items, total } = await listMedia(db, { page, search, baseUrl });

  return new Response(JSON.stringify({ items, total }), {
    headers: { "Content-Type": "application/json" },
  });
};
