import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { loadSettings } from "./lib/settings";
import { sanitizeHtml, safeUrl } from "./lib/sanitize-html";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderFooter(settings: Awaited<ReturnType<typeof loadSettings>>): string {
  const parts: string[] = [];

  if (settings.copyright) {
    parts.push(`<span class="ap-footer-item">${escapeHtml(settings.copyright)}</span>`);
  }

  if (settings.icp) {
    parts.push(
      `<a class="ap-footer-item" href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">${escapeHtml(settings.icp)}</a>`
    );
  }

  if (settings.police) {
    parts.push(
      `<a class="ap-footer-item" href="http://www.beian.gov.cn/portal/registerSystemInfo" target="_blank" rel="noopener noreferrer">${escapeHtml(settings.police)}</a>`
    );
  }

  for (const link of settings.links) {
    if (!link.label || !link.url) continue;
    // 协议白名单：javascript:/vbscript: 等伪协议直接丢弃该链接
    const safe = safeUrl(link.url);
    if (safe === null) continue;
    const isExternal = /^https?:\/\//i.test(safe);
    const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : "";
    parts.push(`<a class="ap-footer-item" href="${escapeHtml(safe)}"${target}>${escapeHtml(link.label)}</a>`);
  }

  if (settings.customHtml) {
    parts.push(`<div class="ap-footer-custom">${sanitizeHtml(settings.customHtml)}</div>`);
  }

  if (settings.showPoweredBy) {
    parts.push(
      `<span class="ap-footer-item ap-footer-powered">Powered by <a href="https://github.com/your-org/astropress" target="_blank" rel="noopener noreferrer">AstroPress</a></span>`
    );
  }

  if (parts.length === 0) return "";

  return `
<style>
.ap-footer {
  margin-top: 48px;
  padding: 24px 16px;
  border-top: 1px solid #e5e7eb;
  text-align: center;
  font-size: 13px;
  line-height: 1.8;
  color: #6b7280;
}
.ap-footer-item {
  display: inline-block;
  margin: 0 8px;
  color: inherit;
  text-decoration: none;
}
a.ap-footer-item:hover {
  color: #374151;
  text-decoration: underline;
}
.ap-footer-custom {
  margin-top: 8px;
}
.ap-footer-powered a {
  color: inherit;
  text-decoration: none;
}
.ap-footer-powered a:hover {
  text-decoration: underline;
}
</style>
<footer id="ap-footer" class="ap-footer">
  ${parts.join("\n  ")}
</footer>`.trim();
}

/**
 * 前台中间件：在所有公开 HTML 页面注入页脚
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const res = await next();

  if (ctx.request.method !== "GET") return res;
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;
  if (ctx.url.pathname.startsWith("/admin") || ctx.url.pathname.startsWith("/api/")) return res;

  const locals = ctx.locals as any;
  const db = locals.db ?? null;
  if (!db) return res;
  if (await isPluginDisabled(db, "footer")) return res;

  // 先查设置（15s 缓存，廉价）：未启用时直接跳过 res.clone().text()，
  // 避免每个公开页面请求都把整页 HTML 复制一份。
  let settings;
  try {
    settings = await loadSettings(db);
  } catch {
    return res;
  }
  if (!settings.enabled) return res;

  const html = await res.clone().text();
  if (!html.includes("</body>")) return res;
  // 幂等：用 DOM id 判定，避免正文里出现 "ap-footer" 字样导致漏注入
  if (html.includes('id="ap-footer"')) return res;

  const footer = renderFooter(settings);
  if (!footer) return res;

  const injected = html.replace("</body>", `${footer}\n</body>`);
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
