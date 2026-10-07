import type { APIRoute } from "astro";
import { createAuth, verifyPassword } from "@astropress/auth";
import { wpUsers } from "@astropress/core/schema";
import { eq } from "drizzle-orm";

/**
 * 登录暴力破解节流（F-T8-08）：
 * 同 IP 在 15 分钟窗口内连续失败 10 次后锁定 15 分钟；成功登录清零。
 * 进程内 Map + 惰性清扫（与 comments 频控同构）。自托管单实例足够；
 * 多实例部署时各实例独立计数，最坏放宽 N 倍，不影响正确性。
 */
const WINDOW_MS = 15 * 60_000;
const LOCK_MS = 15 * 60_000;
const MAX_FAILS = 10;
const SWEEP_AT = 2_000;
interface FailState { fails: number; first: number; lockedUntil: number }
const fails = new Map<string, FailState>();
let lastSweep = 0;

function clientIp(request: Request): string {
  // 只从反向代理注入的请求头读取客户端 IP：
  // @astrojs/cloudflare 不支持 Astro.clientAddress（访问其 getter 会抛
  // ClientAddressNotAvailable），故不可使用；兜底 "unknown"。
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

function sweep(now: number): void {
  if (fails.size <= SWEEP_AT || now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [k, st] of fails) {
    if (st.lockedUntil < now && now - st.first >= WINDOW_MS) fails.delete(k);
  }
}

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const body = await request.text();
  const params = new URLSearchParams(body);
  const username = params.get("username")?.trim() ?? "";
  const password = params.get("password") ?? "";

  if (!username || !password) {
    return redirect("/login?error=invalid");
  }

  const db = locals.db;
  if (!db) return redirect("/login?error=unknown");

  const ip = clientIp(request);
  const now = Date.now();
  sweep(now);
  const st0 = fails.get(ip);
  if (st0 && st0.lockedUntil > now) {
    return redirect("/login?error=locked");
  }

  const [user] = await db
    .select()
    .from(wpUsers)
    .where(eq(wpUsers.userLogin, username))
    .limit(1);

  // 用户名不存在与密码错误走同一返回，避免账号枚举；失败统一计入节流
  if (!user) {
    registerFail(ip, now);
    return redirect("/login?error=invalid");
  }

  const valid = await verifyPassword(password, user.userPass);
  if (!valid) {
    registerFail(ip, now);
    return redirect("/login?error=invalid");
  }

  fails.delete(ip); // 成功登录清零
  const auth = createAuth(db as Parameters<typeof createAuth>[0]);
  const session = await auth.createSession(String(user.id), {});
  const cookie = auth.createSessionCookie(session.id);
  const response = redirect("/admin/dashboard");
  // 直接把 Set-Cookie 写入响应头，而非仅用 cookies.set()：
  // 当登录请求经过插件中间件 next(new Request())（Astro rewrite）时，Astro 4
  // 会在 rewrite 链中替换 cookie jar，cookies.set 的会话 cookie 落入孤儿 jar
  // 而丢失（登录后仍被判定未登录）。显式 Set-Cookie 头是普通响应头，随响应
  // 透传，不受 rewrite cookie jar 替换影响。
  response.headers.append("Set-Cookie", serializeSessionCookie(cookie));
  return response;
};

/** 把 Lucia 的 { name, value, attributes } 序列化为 Set-Cookie 头字符串。 */
function serializeSessionCookie(c: {
  name: string;
  value: string;
  attributes: {
    path?: string;
    maxAge?: number;
    domain?: string;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none" | boolean;
  };
}): string {
  const a = c.attributes;
  let out = `${c.name}=${c.value}`;
  if (a.path != null) out += `; Path=${String(a.path)}`;
  if (a.maxAge != null) out += `; Max-Age=${Math.floor(Number(a.maxAge))}`;
  if (a.domain) out += `; Domain=${String(a.domain)}`;
  if (a.httpOnly) out += "; HttpOnly";
  if (a.secure) out += "; Secure";
  if (a.sameSite) {
    // RFC 6265bis：Strict / Lax / None
    const s = String(a.sameSite).toLowerCase();
    const v = s === "lax" ? "Lax" : s === "none" ? "None" : "Strict";
    out += `; SameSite=${v}`;
  }
  return out;
}

function registerFail(ip: string, now: number): void {
  const prev = fails.get(ip);
  if (!prev || now - prev.first >= WINDOW_MS) {
    fails.set(ip, { fails: 1, first: now, lockedUntil: 0 });
    return;
  }
  prev.fails += 1;
  if (prev.fails >= MAX_FAILS) {
    prev.lockedUntil = now + LOCK_MS;
  }
  fails.set(ip, prev);
}
