import type { APIRoute } from "astro";
import { loadSettings, saveSettings } from "../../lib/settings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max).trim();

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const db = (locals as any).db;
  const settings = await loadSettings(db);
  // clientSecret 脱敏：只回传掩码，避免后台页被抓包泄钥；留空提交表示不修改
  return json({ ...settings, clientSecret: settings.clientSecret ? "••••••••" : "" });
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

  const db = (locals as any).db;
  const prev = await loadSettings(db);
  // clientSecret：掩码或留空时保留旧值
  const incomingSecret = str(body.clientSecret, 128);
  const clientSecret = !incomingSecret || incomingSecret === "••••••••" ? prev.clientSecret : incomingSecret;

  const settings = await saveSettings(db, {
    enabled: !!body.enabled,
    clientID: str(body.clientID, 128),
    clientSecret,
    repo: str(body.repo, 128).replace(/[^\w.\-]/g, ""),
    owner: str(body.owner, 64).replace(/[^\w\-]/g, ""),
    admin: str(body.admin, 512),
    idMode: body.idMode === "slug" ? "slug" : "pathname",
    language: str(body.language, 16) || "zh-CN",
    perPage: body.perPage,
    distractionFreeMode: !!body.distractionFreeMode,
    proxy: str(body.proxy, 256),
    titleFromPage: body.titleFromPage !== false,
  });
  return json({ ok: true, settings: { ...settings, clientSecret: settings.clientSecret ? "••••••••" : "" } });
};
