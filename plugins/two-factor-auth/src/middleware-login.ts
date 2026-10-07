import type { MiddlewareHandler } from "astro";
import { createDatabase, createD1Database } from "@astropress/core";
import { wpUsers, wpUsermeta } from "@astropress/core/schema";
import { verifyPassword } from "@astropress/auth";
import { eq, and } from "drizzle-orm";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { verifyTOTP } from "./lib/totp";

/**
 * 2FA 登录闸门（pre）：
 *
 * 核心登录路由不感知 2FA。本中间件在其之前执行：
 * - 账号不存在 / 密码错误：原样放行给核心处理（不破坏账号枚举防护与失败节流）；
 * - 用户已启用 2FA：必须携带正确且未重放的 TOTP code，否则直接重定向
 *   /login?error=2fa，核心路由不执行、不会建立会话（fail-closed）；
 * - 校验通过：用原始请求体重建请求后放行，由核心建立会话。
 *
 * 另：GET /login 时向表单注入验证码输入框（零核心改动）。
 */

async function getGateDb(ctx: Parameters<MiddlewareHandler>[0]): Promise<any | null> {
  const d1 = (ctx.locals as any).runtime?.env?.DB as D1Database | undefined;
  if (d1) return createD1Database(d1);
  if ((ctx.locals as any).db) return (ctx.locals as any).db;
  try {
    return await createDatabase((import.meta as any).env?.DATABASE_URL ?? "file:./local.db");
  } catch {
    return null;
  }
}

function readMeta(db: any, userId: number, key: string): Promise<string | null> {
  return db
    .select({ value: wpUsermeta.metaValue })
    .from(wpUsermeta)
    .where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, key)))
    .limit(1)
    .then((rows: Array<{ value: string }>) => rows[0]?.value ?? null);
}

async function writeMeta(db: any, userId: number, key: string, value: string): Promise<void> {
  const rows = await db
    .select({ id: wpUsermeta.umetaId })
    .from(wpUsermeta)
    .where(and(eq(wpUsermeta.userId, userId), eq(wpUsermeta.metaKey, key)))
    .limit(1);
  if (rows.length > 0) {
    await db.update(wpUsermeta).set({ metaValue: value }).where(eq(wpUsermeta.umetaId, rows[0].id));
  } else {
    await db.insert(wpUsermeta).values({ userId, metaKey: key, metaValue: value });
  }
}

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const { pathname } = ctx.url;

  // GET /login：放行后向表单注入可选验证码字段
  if (ctx.request.method === "GET" && pathname === "/login") {
    const res = await next();
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("text/html")) return res;
    try {
      const html = await res.text();
      if (!html.includes("</form>")) return new Response(html, res);
      const is2faError = ctx.url.searchParams.get("error") === "2fa";
      const field =
        `<p class="login-2fa"><label for="ap-login-code">验证器验证码（已启用两步验证时填写）</label>` +
        `<input type="text" id="ap-login-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 位数字"></p>` +
        (is2faError
          ? `<p style="color:#d63638">两步验证码错误或已过期，请重新输入。</p>`
          : "");
      const injected = html.replace("</form>", `${field}</form>`);
      const headers = new Headers(res.headers);
      headers.delete("content-length");
      return new Response(injected, { status: res.status, statusText: res.statusText, headers });
    } catch {
      return res;
    }
  }

  if (ctx.request.method !== "POST" || pathname !== "/api/auth/login") return next();

  // 运行时停用开关：插件被管理器停用时整闸放行（不消费 body，核心直接读原始请求）。
  // 获取状态失败时不绕过：安全闸门 fail-closed，继续后续 2FA 判定。
  try {
    const stateDb = await getGateDb(ctx);
    if (stateDb && (await isPluginDisabled(stateDb, "two-factor-auth"))) return next();
  } catch { /* 状态获取失败：继续执行闸门 */ }

  const raw = await ctx.request.text();
  const params = new URLSearchParams(raw);
  const username = params.get("username")?.trim() ?? "";
  const password = params.get("password") ?? "";
  const code = (params.get("code") ?? "").trim();

  // 基本字段缺失：交给核心处理
  if (!username || !password) return forwardOriginal(ctx, raw, next);

  const db = await getGateDb(ctx);
  if (!db) return forwardOriginal(ctx, raw, next);

  let enabled = false;
  let secret: string | null = null;
  try {
    const [user] = await db
      .select()
      .from(wpUsers)
      .where(eq(wpUsers.userLogin, username))
      .limit(1);
    if (!user) return forwardOriginal(ctx, raw, next);

    const valid = await verifyPassword(password, user.userPass);
    if (!valid) return forwardOriginal(ctx, raw, next);

    enabled = (await readMeta(db, Number(user.id), "_2fa_enabled")) === "1";
    if (enabled) {
      secret = await readMeta(db, Number(user.id), "_2fa_secret");
      if (!secret || !/^\d{6}$/.test(code) || !verifyTOTP(secret, code)) {
        return ctx.redirect("/login?error=2fa");
      }
      // 重放保护：同一 TOTP 在其有效窗口内不可二次使用
      const lastUsed = await readMeta(db, Number(user.id), "_2fa_last_totp");
      if (lastUsed === code) return ctx.redirect("/login?error=2fa");
      await writeMeta(db, Number(user.id), "_2fa_last_totp", code);
    }
  } catch {
    // 2FA 判定过程出错：fail-closed，绝不放行到建会话
    if (enabled) return ctx.redirect("/login?error=2fa");
    return forwardOriginal(ctx, raw, next);
  }

  return forwardOriginal(ctx, raw, next);
};

function forwardOriginal(
  ctx: Parameters<MiddlewareHandler>[0],
  raw: string,
  next: (req?: Request) => Promise<Response>
): Promise<Response> {
  const headers = new Headers(ctx.request.headers);
  headers.delete("content-length");
  return next(new Request(ctx.request, { method: "POST", headers, body: raw }));
}
