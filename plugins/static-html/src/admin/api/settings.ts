import type { APIRoute } from "astro";
import { loadSettings, saveSettings } from "../../lib/settings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const settings = await loadSettings((locals as any).db);
  return json(settings);
};

export const POST: APIRoute = async ({ locals, request }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或无权限" }, 401);
  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "CSRF" }, 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "无效的 JSON" }, 400);
  }

  // 全量替换：仅取白名单字段（非法输出目录会回退默认值）
  const settings = await saveSettings((locals as any).db, {
    enabled: body.enabled !== false,
    outputDir: String(body.outputDir ?? ""),
    schedule: String(body.schedule ?? "manual"),
    scheduleTime: String(body.scheduleTime ?? "03:00"),
    scheduleWeekday: Number(body.scheduleWeekday ?? 0),
    includePages: body.includePages !== false,
    includeAssets: body.includeAssets !== false,
    maxPosts: Number(body.maxPosts ?? 2000),
    outputMode: body.outputMode === "pages" ? "pages" : "static",
  });
  return json({ ok: true, settings });
};
