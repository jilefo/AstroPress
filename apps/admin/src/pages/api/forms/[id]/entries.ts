import type { APIRoute } from "astro";
import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

const key = (id: string) => `astropress_form_entries_${id}`;

async function getEntries(db: any, formId: string): Promise<any[]> {
  const [row] = await db.select({ value: wpOptions.optionValue }).from(wpOptions)
    .where(eq(wpOptions.optionName, key(formId))).limit(1);
  return row?.value ? JSON.parse(row.value) : [];
}

async function saveEntries(db: any, formId: string, entries: any[]) {
  await db.insert(wpOptions)
    .values({ optionName: key(formId), optionValue: JSON.stringify(entries) })
    .onConflictDoUpdate({ target: wpOptions.optionName, set: { optionValue: JSON.stringify(entries) } });
}

export const GET: APIRoute = async ({ params, url, locals }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });
  const entries = await getEntries(db, params.id!);
  const status = url.searchParams.get("status");
  const page = Number(url.searchParams.get("page") ?? 1);
  const perPage = 20;
  const filtered = status && status !== "all" ? entries.filter(e => e.status === status) : entries;
  const total = filtered.length;
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  return new Response(JSON.stringify({ entries: paged.reverse(), total, page, perPage }), { headers: { "Content-Type": "application/json" } });
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const db = locals.db;
  if (!locals.user || !db) return new Response("未登录或登录已过期", { status: 401 });
  const { entryId, status, action } = await request.json() as any;
  const entries = await getEntries(db, params.id!);
  let updated = entries;
  if (action === "delete") {
    updated = entries.filter(e => e.id !== entryId);
  } else if (action === "bulk_delete") {
    const ids: string[] = entryId; // array for bulk
    updated = entries.filter(e => !ids.includes(e.id));
  } else if (action === "bulk_status") {
    const ids: string[] = entryId;
    updated = entries.map(e => ids.includes(e.id) ? { ...e, status } : e);
  } else {
    updated = entries.map(e => e.id === entryId ? { ...e, status } : e);
  }
  await saveEntries(db, params.id!, updated);
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
};
