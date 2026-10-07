import { wpPostmeta, wpPosts } from "@astropress/core/schema";
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export const OPTIONS: APIRoute = async () => new Response(null, { status: 204, headers: CORS });

interface TrackEvent {
  adId: string;
  type: "imp" | "clk";
}

// In-process mutex: serializes stats updates to avoid duplicate rows
// under concurrent tracking events.
let queue: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

async function bumpStats(db: any, adId: string, day: string, type: "imp" | "clk"): Promise<void> {
  const postId = Number(adId.replace("ap-ad-", ""));
  if (!Number.isFinite(postId)) return;
  const [row] = await db
    .select({ id: wpPostmeta.metaId, val: wpPostmeta.metaValue })
    .from(wpPostmeta)
    .where(and(eq(wpPostmeta.postId, postId), eq(wpPostmeta.metaKey, "_ap_ad_stats")))
    .limit(1);
  let stats: Record<string, { imp: number; clk: number }> = {};
  if (row?.val) {
    try {
      stats = JSON.parse(row.val);
    } catch {
      stats = {};
    }
  }
  const bucket = stats[day] ?? { imp: 0, clk: 0 };
  if (type === "imp") bucket.imp += 1;
  else bucket.clk += 1;
  stats[day] = bucket;
  const serialized = JSON.stringify(stats);
  if (row) {
    await db.update(wpPostmeta).set({ metaValue: serialized }).where(eq(wpPostmeta.metaId, row.id));
  } else {
    // 首行插入前确认广告（ap_ad）真实存在，防止伪造 adId 刷出无限孤儿统计行
    const [ad] = await db
      .select({ id: wpPosts.id })
      .from(wpPosts)
      .where(and(eq(wpPosts.id, postId), eq(wpPosts.postType, "ap_ad")))
      .limit(1);
    if (!ad) return;
    await db.insert(wpPostmeta).values({ postId, metaKey: "_ap_ad_stats", metaValue: serialized });
  }
}

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  if (!db) return new Response(JSON.stringify({ error: "服务器错误" }), { status: 500, headers: CORS });

  // 50 个短事件的合法载荷不足 4KB，先卡 32KB 上限防巨包 JSON 缓冲消耗
  const MAX_TRACK_BODY = 32_768;
  const declaredLen = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLen) && declaredLen > MAX_TRACK_BODY) {
    return new Response(JSON.stringify({ error: "提交数据过大" }), { status: 413, headers: CORS });
  }

  let body: { events?: TrackEvent[] };
  try {
    body = (await request.json()) as { events?: TrackEvent[] };
  } catch {
    return new Response(JSON.stringify({ error: "请求参数有误" }), { status: 400, headers: CORS });
  }
  if (JSON.stringify(body ?? {}).length > MAX_TRACK_BODY) {
    return new Response(JSON.stringify({ error: "提交数据过大" }), { status: 413, headers: CORS });
  }
  const events = body?.events;
  if (!Array.isArray(events) || events.length === 0 || events.length > 50)
    return new Response(JSON.stringify({ error: "缺少事件数据 events[]（单次最多 50 条）" }), { status: 400, headers: CORS });

  const day = new Date().toISOString().slice(0, 10);
  for (const ev of events) {
    if (!ev || typeof ev.adId !== "string" || !/^ap-ad-\d+$/.test(ev.adId)) continue;
    if (ev.type !== "imp" && ev.type !== "clk") continue;
    try {
      await withLock(() => bumpStats(db, ev.adId, day, ev.type));
    } catch {
      /* skip single failing event */
    }
  }
  return new Response(JSON.stringify({ ok: true }), { headers: CORS });
};