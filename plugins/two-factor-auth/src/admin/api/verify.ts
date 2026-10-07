import type { APIRoute } from "astro";
import { verifyTOTP } from "../../lib/totp";
import { enable2FA } from "../../lib/store";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);
  try {
    const body = await request.json() as { secret?: string; code?: string };
    if (!body.secret || !body.code) return json({ error: "缺少密钥或验证码" }, 400);
    if (!verifyTOTP(body.secret, body.code.trim())) return json({ ok: false, error: "验证码不正确" });
    await enable2FA(db, user.id, body.secret);
    return json({ ok: true });
  } catch { return json({ error: "无效的请求" }, 400); }
};
