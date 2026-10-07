import { eq, desc, count } from "drizzle-orm";
import type { Database } from "@astropress/core";
import { likeNeedle } from "@astropress/core";
import { wpPosts, wpPostmeta } from "@astropress/core/schema";

export interface MediaItem {
  id: number;
  title: string;
  filename: string;
  mimeType: string;
  url: string;
  date: string;
}

export async function listMedia(
  db: Database,
  opts: { page?: number; perPage?: number; search?: string; baseUrl?: string } = {}
): Promise<{ items: MediaItem[]; total: number }> {
  const { page = 1, perPage = 40, search, baseUrl } = opts;
  const offset = (page - 1) * perPage;

  const { and, like } = await import("drizzle-orm");

  const where = search
    ? and(eq(wpPosts.postType, "attachment"), like(wpPosts.postTitle, `%${likeNeedle(search)}%`))
    : eq(wpPosts.postType, "attachment");

  const [{ total }] = await db
    .select({ total: count() })
    .from(wpPosts)
    .where(where);

  const rows = await db
    .select()
    .from(wpPosts)
    .where(where)
    .orderBy(desc(wpPosts.postDate))
    .limit(perPage)
    .offset(offset);

  // Fetch URLs from postmeta
  const ids = rows.map((r: any) => r.id);
  let metaMap: Record<number, string> = {};

  if (ids.length > 0) {
    const metas = await db
      .select()
      .from(wpPostmeta)
      .where(eq(wpPostmeta.metaKey, "_wp_attached_file"));

    for (const m of metas) {
      if (ids.includes(m.postId)) {
        metaMap[m.postId] = m.metaValue ?? "";
      }
    }
  }

  const siteUrl = (import.meta.env.MEDIA_BASE_URL ?? baseUrl ?? "http://localhost:4321").replace(/\/$/, "");

  return {
    items: rows.map((r: any) => ({
      id: r.id,
      title: r.postTitle,
      filename: metaMap[r.id] ?? "",
      mimeType: r.postMimeType,
      url: `${siteUrl}/media/${metaMap[r.id] ?? ""}`,
      date: r.postDate,
    })),
    total,
  };
}
