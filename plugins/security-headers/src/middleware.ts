import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { loadSettings, type SecurityHeadersSettings } from "./lib/settings";

function applySecurityHeaders(headers: Headers, s: SecurityHeadersSettings): void {
  if (s.nosniff) {
    headers.set("X-Content-Type-Options", "nosniff");
  }
  if (s.frameOptions !== "off") {
    headers.set("X-Frame-Options", s.frameOptions);
  }
  if (s.referrerPolicy) {
    headers.set("Referrer-Policy", s.referrerPolicy);
  }
  if (s.permissionsPolicy) {
    headers.set("Permissions-Policy", s.permissionsPolicy);
  }
  if (s.hstsMaxAge > 0) {
    headers.set("Strict-Transport-Security", `max-age=${s.hstsMaxAge}; includeSubDomains`);
  }
  if (s.csp) {
    headers.set(
      s.cspReportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
      s.csp
    );
  }
}

/**
 * 中间件：只写响应头，不读取/不修改响应体。
 * - 前台：按设置应用全部安全头。
 * - 后台（/admin、/admin-ext）：仅注入「安全子集」——nosniff / X-Frame-Options /
 *   Referrer-Policy（对后台内联脚本零影响，补齐点击劫持与 MIME 嗅探防护）；
 *   CSP / Permissions-Policy / HSTS 不注入，避免误伤后台。仅作用于 text/html。
 * 任何异常均 fail-open：原样放行，next() 全程只调用一次。
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const isAdmin = ctx.url.pathname.startsWith("/admin");

  let settings: SecurityHeadersSettings | null = null;
  try {
    const locals = ctx.locals as any;
    const db = locals?.db ?? null;
    if (db && !(await isPluginDisabled(db, "security-headers"))) {
      const s = await loadSettings(db);
      if (s.enabled) settings = s;
    }
  } catch {
    settings = null;
  }
  if (!settings) return next();

  const res = await next();
  try {
    // 未改 body：不删 content-length，不调 res.clone()
    const headers = new Headers(res.headers);
    if (isAdmin) {
      const ctype = headers.get("content-type") || "";
      if (!ctype.includes("text/html")) return res;
      if (settings.nosniff) headers.set("X-Content-Type-Options", "nosniff");
      if (settings.frameOptions !== "off") headers.set("X-Frame-Options", "SAMEORIGIN");
      if (settings.referrerPolicy) headers.set("Referrer-Policy", settings.referrerPolicy);
    } else {
      applySecurityHeaders(headers, settings);
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  } catch {
    return res;
  }
};
