import type { APIRoute } from "astro";
import { getMeta } from "../../lib/registry";
import { wpOptions } from "@astropress/core/schema";
import { inArray } from "drizzle-orm";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

/** POST { slug } — 删除该插件在 wp_options 中的全部自有设置键 */
export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: { slug?: string };
  try {
    body = (await request.json()) as { slug?: string };
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }
  const meta = getMeta(String(body.slug ?? ""));
  if (!meta) return json({ error: "未知插件" }, 404);
  if (meta.system) return json({ error: "系统插件不可清除" }, 400);
  if (meta.optionKeys.length === 0) return json({ ok: true, removed: 0 });

  const db = (locals as any).db;
  await db.delete(wpOptions).where(inArray(wpOptions.optionName, meta.optionKeys));
  return json({ ok: true, removed: meta.optionKeys.length });
};
