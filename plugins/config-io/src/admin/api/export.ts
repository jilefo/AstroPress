import type { APIRoute } from "astro";
import { buildExport, IoError, parseSections } from "../../lib/io";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

function fileStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    "-" +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

/**
 * GET /admin-ext/api/config-io/export?sections=settings,plugins,themes,content
 * 登录鉴权；响应 Content-Disposition: attachment，浏览器直接下载。
 */
export const GET: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  if (!db) return json({ error: "服务器错误" }, 500);

  const sections = parseSections(new URL(request.url).searchParams.get("sections"));
  if (sections.length === 0) return json({ error: "没有有效的配置段" }, 400);

  try {
    const envelope = await buildExport(db, sections);
    const body = JSON.stringify(envelope, null, 2);
    const filename = `astropress-config-${fileStamp()}.json`;
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof IoError) return json({ error: e.message }, e.status);
    console.error("[config-io] export failed:", e);
    return json({ error: "导出失败，请稍后再试" }, 500);
  }
};
