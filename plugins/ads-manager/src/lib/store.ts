import { wpOptions, wpPostmeta, wpPosts } from "@astropress/core/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { AdSlot, AdUnit } from "./types";
import { listVal } from "./types";

const SLOTS_KEY = "astropress_ads_slots";

export async function loadSlots(db: any): Promise<AdSlot[]> {
  const [row] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where(eq(wpOptions.optionName, SLOTS_KEY))
    .limit(1);
  if (!row?.value) return [];
  try {
    const arr = JSON.parse(row.value);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function saveSlots(db: any, slots: AdSlot[]): Promise<void> {
  await db
    .insert(wpOptions)
    .values({ optionName: SLOTS_KEY, optionValue: JSON.stringify(slots) })
    .onConflictDoUpdate({ target: wpOptions.optionName, set: { optionValue: JSON.stringify(slots) } });
}

interface CacheEntry {
  slots: AdSlot[];
  units: AdUnit[];
  at: number;
}
let cache: CacheEntry | null = null;

export function invalidateAdsCache(): void {
  cache = null;
}

function metaMap(metas: Array<{ postId: number; key: string | null; val: string | null }>): Map<number, Map<string, string>> {
  const byPost = new Map<number, Map<string, string>>();
  for (const m of metas) {
    const inner = byPost.get(m.postId) ?? new Map<string, string>();
    inner.set(m.key ?? "", m.val ?? "");
    byPost.set(m.postId, inner);
  }
  return byPost;
}

/** Slots + published ap_ad units + their meta, cached 60s per process. */
export async function getAdsCache(db: any): Promise<{ slots: AdSlot[]; units: AdUnit[] }> {
  if (cache && Date.now() - cache.at < 60_000) return cache;

  const slots = await loadSlots(db);
  const rows = await db
    .select({ id: wpPosts.id, title: wpPosts.postTitle, content: wpPosts.postContent })
    .from(wpPosts)
    .where(and(eq(wpPosts.postType, "ap_ad"), eq(wpPosts.postStatus, "publish")));

  const units: AdUnit[] = [];
  if (rows.length > 0) {
    const ids = (rows as Array<{ id: number }>).map((r) => r.id);
    const metas = await db
      .select({ postId: wpPostmeta.postId, key: wpPostmeta.metaKey, val: wpPostmeta.metaValue })
      .from(wpPostmeta)
      .where(inArray(wpPostmeta.postId, ids));
    const byPost = metaMap(metas);
    for (const r of rows as Array<{ id: number; title: string; content: string }>) {
      const m = byPost.get(r.id) ?? new Map<string, string>();
      const weightRaw = m.get("ap_ad_weight");
      units.push({
        id: r.id,
        title: r.title,
        content: r.content,
        kind: (m.get("ap_ad_kind") as AdUnit["kind"]) || "html",
        slots: listVal(m.get("ap_ad_slots")),
        weight: weightRaw ? Number(weightRaw) || 1 : 1,
        scheduleStart: m.get("ap_ad_schedule_start") ?? "",
        scheduleEnd: m.get("ap_ad_schedule_end") ?? "",
        targeting: {
          langs: listVal(m.get("ap_ad_target_langs")),
          devices: listVal(m.get("ap_ad_target_devices")) as AdUnit["targeting"]["devices"],
          pathIncludes: listVal(m.get("ap_ad_target_paths")),
        },
        sandbox: m.get("ap_ad_sandbox") === "1" || m.get("ap_ad_sandbox") === "true",
        noScriptFallback: m.get("ap_ad_noscript") ?? "",
        gdprConsentRequired: m.get("ap_ad_gdpr") === "1" || m.get("ap_ad_gdpr") === "true",
      });
    }
  }

  cache = { slots, units, at: Date.now() };
  return cache;
}
