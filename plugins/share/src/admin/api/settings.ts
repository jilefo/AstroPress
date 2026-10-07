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

  const incomingPlatforms: any = body?.platforms ?? {};
  const db = (locals as any).db;
  const settings = await saveSettings(db, {
    enabled: !!body.enabled,
    heading: String(body.heading ?? "分享这篇文章").slice(0, 80),
    position: (["after", "before", "both"] as const).includes(body.position) ? body.position : "after",
    platforms: {
      wechat: !!incomingPlatforms.wechat,
      weibo: !!incomingPlatforms.weibo,
      qq: !!incomingPlatforms.qq,
      zhihu: !!incomingPlatforms.zhihu,
      twitter: !!incomingPlatforms.twitter,
      facebook: !!incomingPlatforms.facebook,
      linkedin: !!incomingPlatforms.linkedin,
      telegram: !!incomingPlatforms.telegram,
      whatsapp: !!incomingPlatforms.whatsapp,
      copylink: !!incomingPlatforms.copylink,
    },
  });
  return json({ ok: true, settings });
};
