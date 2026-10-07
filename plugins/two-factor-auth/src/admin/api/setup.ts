import type { APIRoute } from "astro";
import { generateSecret, getOTPAuthURI } from "../../lib/totp";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ locals }) => {
  const user = (locals as any).user;
  if (!user) return json({ error: "未登录或登录已过期" }, 401);
  const secret = generateSecret();
  const uri = getOTPAuthURI(secret, user.userLogin || user.email || "user");
  return json({ ok: true, secret, uri });
};
