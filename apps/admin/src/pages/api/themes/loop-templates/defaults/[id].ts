import type { APIRoute } from "astro";
import { DEFAULT_LOOP_TEMPLATES } from "../../../../../lib/loopTemplates";

export const GET: APIRoute = async ({ locals, params }) => {
  if (!locals.user) return new Response("未登录或登录已过期", { status: 401 });
  const { id } = params;
  const tmpl = DEFAULT_LOOP_TEMPLATES.find(t => t.id === id);
  if (!tmpl) return new Response("列表模板不存在", { status: 404 });
  return new Response(JSON.stringify({ blocks: tmpl.blocks }), { headers: { "Content-Type": "application/json" } });
};
