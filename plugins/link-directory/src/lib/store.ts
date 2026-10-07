import { asc, eq, sql } from "drizzle-orm";
import { apLinkCats, apLinks } from "./schema";

export function nowStamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** 生成 slug：小写、非字母数字转 -、折叠连续 - */
export function slugify(input: string): string {
  const s = String(input ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s;
}

export interface LinkCat {
  id: number;
  name: string;
  slug: string;
  sort: number;
  createdAt: string;
}

export interface Link {
  id: number;
  catId: number;
  name: string;
  url: string;
  description: string;
  clicks: number;
  status: string;
  createdAt: string;
}

// ─── 分类 ──────────────────────────────────────────────────────────────────

export async function listCats(db: any): Promise<LinkCat[]> {
  const rows = await db
    .select()
    .from(apLinkCats)
    .orderBy(asc(apLinkCats.sort), asc(apLinkCats.id));
  return rows as LinkCat[];
}

export async function getCat(db: any, id: number): Promise<LinkCat | null> {
  const [row] = await db.select().from(apLinkCats).where(eq(apLinkCats.id, id)).limit(1);
  return (row as LinkCat) ?? null;
}

export async function catSlugExists(db: any, slug: string, excludeId?: number): Promise<boolean> {
  const [row] = await db
    .select({ id: apLinkCats.id })
    .from(apLinkCats)
    .where(eq(apLinkCats.slug, slug))
    .limit(1);
  return !!row && row.id !== excludeId;
}

/** 生成不冲突的 slug（空名回退 cat-<时间戳>，冲突追加 -2/-3…） */
export async function uniqueSlug(db: any, name: string, excludeId?: number): Promise<string> {
  let base = slugify(name);
  if (!base) base = "cat-" + Date.now().toString(36);
  let slug = base;
  let n = 2;
  while (await catSlugExists(db, slug, excludeId)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

export async function createCat(
  db: any,
  data: { name: string; slug?: string; sort?: number }
): Promise<LinkCat> {
  const name = data.name.trim();
  let slug = slugify(data.slug ?? name);
  if (!slug) slug = "cat-" + Date.now().toString(36);
  let candidate = slug;
  let n = 2;
  while (await catSlugExists(db, candidate)) candidate = `${slug}-${n++}`;
  const [row] = await db
    .insert(apLinkCats)
    .values({ name, slug: candidate, sort: data.sort ?? 0, createdAt: nowStamp() })
    .returning();
  return row as LinkCat;
}

export async function updateCat(
  db: any,
  id: number,
  patch: { name?: string; slug?: string; sort?: number }
): Promise<LinkCat | null> {
  const existing = await getCat(db, id);
  if (!existing) return null;
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.sort !== undefined) set.sort = patch.sort;
  if (patch.slug !== undefined) {
    const s = slugify(patch.slug);
    if (s) {
      let candidate = s;
      let n = 2;
      while (await catSlugExists(db, candidate, id)) candidate = `${s}-${n++}`;
      set.slug = candidate;
    }
  }
  if (Object.keys(set).length > 0) {
    await db.update(apLinkCats).set(set).where(eq(apLinkCats.id, id));
  }
  return getCat(db, id);
}

export async function countLinksInCat(db: any, catId: number): Promise<number> {
  const [row] = await db
    .select({ c: sql<number>`count(*)` })
    .from(apLinks)
    .where(eq(apLinks.catId, catId));
  return Number(row?.c ?? 0);
}

export async function deleteCat(db: any, id: number): Promise<boolean> {
  const existing = await getCat(db, id);
  if (!existing) return false;
  await db.delete(apLinkCats).where(eq(apLinkCats.id, id));
  return true;
}

// ─── 链接 ──────────────────────────────────────────────────────────────────

export async function listLinks(db: any, catId?: number): Promise<Link[]> {
  const q = db
    .select()
    .from(apLinks)
    .orderBy(asc(apLinks.catId), asc(apLinks.id));
  const rows = catId ? await q.where(eq(apLinks.catId, catId)) : await q;
  return rows as Link[];
}

export async function getLink(db: any, id: number): Promise<Link | null> {
  const [row] = await db.select().from(apLinks).where(eq(apLinks.id, id)).limit(1);
  return (row as Link) ?? null;
}

export async function createLink(
  db: any,
  data: { catId: number; name: string; url: string; description?: string; status?: string }
): Promise<Link> {
  const [row] = await db
    .insert(apLinks)
    .values({
      catId: data.catId,
      name: data.name.trim(),
      url: data.url.trim(),
      description: data.description?.trim() ?? "",
      clicks: 0,
      status: data.status ?? "pending",
      createdAt: nowStamp(),
    })
    .returning();
  return row as Link;
}

export async function updateLink(
  db: any,
  id: number,
  patch: Partial<Pick<Link, "catId" | "name" | "url" | "description" | "clicks" | "status">>
): Promise<Link | null> {
  const existing = await getLink(db, id);
  if (!existing) return null;
  const set: Record<string, unknown> = {};
  if (patch.catId !== undefined) set.catId = patch.catId;
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.url !== undefined) set.url = patch.url.trim();
  if (patch.description !== undefined) set.description = patch.description.trim();
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.clicks !== undefined) set.clicks = patch.clicks;
  if (Object.keys(set).length > 0) {
    await db.update(apLinks).set(set).where(eq(apLinks.id, id));
  }
  return getLink(db, id);
}

export async function deleteLink(db: any, id: number): Promise<boolean> {
  const existing = await getLink(db, id);
  if (!existing) return false;
  await db.delete(apLinks).where(eq(apLinks.id, id));
  return true;
}

/** 仅当链接为 approved 时 clicks+1，返回更新后的行（不存在或未审核返回 null） */
export async function incrementClick(db: any, id: number): Promise<Link | null> {
  const current = await getLink(db, id);
  if (!current || current.status !== "approved") return null;
  await db
    .update(apLinks)
    .set({ clicks: sql`${apLinks.clicks} + 1` })
    .where(eq(apLinks.id, id));
  return getLink(db, id);
}
