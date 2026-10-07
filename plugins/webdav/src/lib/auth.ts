import { wpUsers } from "@astropress/core/schema";
import { eq } from "drizzle-orm";
import { getToken } from "./token";

const REALM_VALUE = 'Basic realm="AstroPress WebDAV", charset="UTF-8"';

/** 401 响应（带 WWW-Authenticate，触发客户端弹凭据框） */
export function unauthorized(): Response {
  return new Response("401 Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": REALM_VALUE,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

/** 解析 HTTP Basic 头；缺失或格式非法返回 null */
export function parseBasic(request: Request): { user: string; pass: string } | null {
  const h = request.headers.get("authorization");
  if (!h || !h.toLowerCase().startsWith("basic ")) return null;
  let decoded: string;
  try {
    decoded = atob(h.slice(6).trim());
  } catch {
    return null;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return null;
  return { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
}

/** 定长时间比较（避免时序侧信道） */
function safeEq(a: string, b: string): boolean {
  const ba = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= ba[i] ^ bb[i];
  return diff === 0;
}

/**
 * WebDAV Basic Auth 校验：用户名必须是 wp_users 中存在的站点用户，
 * 密码必须等于 wp_options 中的 WebDAV 专用 access token。
 */
export async function checkDavAuth(request: Request, db: any): Promise<boolean> {
  if (!db) return false;
  const cred = parseBasic(request);
  if (!cred || !cred.user || !cred.pass) return false;

  let token = "";
  try {
    token = await getToken(db);
  } catch {
    return false;
  }
  if (!token || !safeEq(cred.pass, token)) return false;

  try {
    const [u] = await db
      .select({ id: wpUsers.id })
      .from(wpUsers)
      .where(eq(wpUsers.userLogin, cred.user))
      .limit(1);
    return !!u;
  } catch {
    return false;
  }
}
