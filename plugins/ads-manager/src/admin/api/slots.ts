import type { APIRoute } from "astro";
import { invalidateAdsCache, loadSlots, saveSlots } from "../../lib/store";
import type { AdSlot } from "../../lib/types";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

function validSlot(s: AdSlot): boolean {
  return (
    typeof s.key === "string" &&
    /^[\w-]+$/.test(s.key) &&
    typeof s.name === "string" &&
    typeof s.enabled === "boolean"
  );
}

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);
  return json({ slots: await loadSlots(db) });
};

export const PUT: APIRoute = async ({ locals, request }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: { slots?: AdSlot[] };
  try {
    body = (await request.json()) as { slots?: AdSlot[] };
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }
  const slots = body?.slots;
  if (!Array.isArray(slots) || !slots.every(validSlot))
    return json({ error: "每个广告位必须包含 key、name、enabled 字段" }, 400);

  const keys = new Set(slots.map((s) => s.key));
  if (keys.size !== slots.length) return json({ error: "广告位 key 存在重复" }, 400);

  await saveSlots(db, slots);
  invalidateAdsCache();
  return json({ ok: true });
};
