import type { AdSlot, AdUnit, ReqCtx } from "./types";

/**
 * Filter ad units for a slot and pick one by weighted random (simple A/B).
 * Pure function — fully covered by unit tests.
 */
export function pickAd(units: AdUnit[], slotKey: string, ctx: ReqCtx): AdUnit | null {
  const now = new Date();
  const pool = units.filter((u) => {
    if (u.kind !== "html" && u.kind !== "iframe" && u.kind !== "image") return false;
    if (!u.slots.includes(slotKey)) return false;
    if (u.scheduleStart && new Date(u.scheduleStart) > now) return false;
    if (u.scheduleEnd && new Date(u.scheduleEnd) < now) return false;
    const t = u.targeting;
    if (t.langs.length > 0 && (!ctx.lang || !t.langs.includes(ctx.lang))) return false;
    if (t.devices.length > 0 && !t.devices.includes(ctx.device)) return false;
    if (t.pathIncludes.length > 0 && !t.pathIncludes.some((p) => ctx.path.includes(p))) return false;
    return true;
  });
  if (pool.length === 0) return null;
  const total = pool.reduce((s, u) => s + Math.max(1, u.weight), 0);
  let r = Math.random() * total;
  for (const u of pool) {
    r -= Math.max(1, u.weight);
    if (r <= 0) return u;
  }
  return pool[pool.length - 1];
}

export function slotByKey(slots: AdSlot[], key: string): AdSlot | undefined {
  return slots.find((s) => s.key === key && s.enabled);
}