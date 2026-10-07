import type { APIRoute } from "astro";
import { loadSettings, saveSettings } from "../../lib/settings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  const settings = await loadSettings(db);
  return json(settings);
};

export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的 JSON 数据" }, 400);
  }

  const links = Array.isArray(body.links)
    ? body.links
        .slice(0, 5)
        .map((l: any) => ({
          label: String(l?.label ?? "").slice(0, 50),
          url: String(l?.url ?? "").slice(0, 500),
        }))
        .filter((l: any) => l.label && l.url)
    : [];

  const db = (locals as any).db;
  const settings = await saveSettings(db, {
    enabled: !!body.enabled,
    copyright: String(body.copyright ?? "").slice(0, 200),
    icp: String(body.icp ?? "").slice(0, 100),
    police: String(body.police ?? "").slice(0, 100),
    links,
    customHtml: String(body.customHtml ?? "").slice(0, 2000),
    showPoweredBy: !!body.showPoweredBy,
  });
  return json({ ok: true, settings });
};
