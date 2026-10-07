import type { MiddlewareHandler } from "astro";
import { invalidateAdsCache } from "./lib/store";

const PUT_POST_RE = /^\/api\/posts\/\d+$/;
const VALUES_RE = /^\/api\/custom-fields\/values$/;

/**
 * Admin-side save interceptor: when an ad unit (ap_ad) changes through the
 * stock endpoints, drop the 60s ads cache immediately so the change is visible
 * on the next page view instead of up to a minute later. The stock handlers
 * run unchanged — no core file is touched.
 *
 * Covered endpoints:
 *  - POST /api/posts, PUT /api/posts/:id  (create / update / status change)
 *  - POST /api/custom-fields/values       (field-only edits: slots, weight,
 *    schedule, targeting — the editor saves these separately from the post)
 *
 * No body sniffing on purpose: after next() the stock handler has already
 * consumed the request body, so request.clone() would throw (undici rejects
 * cloning a disturbed body). Invalidating on every covered save is safe —
 * the cache is a single in-memory object ref, rebuilt on the next page view.
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const res = await next();

  const { request } = ctx;
  const path = ctx.url.pathname;
  const isPostSave =
    (request.method === "POST" && path === "/api/posts") ||
    (request.method === "PUT" && PUT_POST_RE.test(path));
  const isFieldSave = request.method === "POST" && VALUES_RE.test(path);
  if (!isPostSave && !isFieldSave) return res;
  if (!res.ok) return res;

  try {
    invalidateAdsCache();
  } catch {
    /* cache invalidation is best-effort */
  }
  return res;
};
