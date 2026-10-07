import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { loadSettings, type DonationSettings } from "./lib/settings";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 图片地址白名单：http(s)、站内相对路径、data:image（管理员配置，前台再过滤一层防伪协议） */
function safeImgUrl(u: string): string {
  const v = (u || "").trim();
  return /^(?:https?:\/\/|\/(?!\/)|data:image\/)/i.test(v) ? v : "";
}
/** 跳转链接白名单：仅 http(s) 或站内相对路径，杜绝 javascript:/vbscript: */
function safeLinkUrl(u: string): string {
  const v = (u || "").trim();
  return /^(?:https?:\/\/|\/(?!\/))/i.test(v) ? v : "";
}

function renderInjection(s: DonationSettings): string {
  const buttonText = escapeHtml(s.buttonText);
  const heading = escapeHtml(s.heading);
  const message = escapeHtml(s.message);

  // 二维码类支付方式（图片）
  const qrMethods: Array<{ url: string; label: string }> = [
    { url: s.wechatQr, label: "微信支付" },
    { url: s.alipayQr, label: "支付宝" },
    { url: s.applePayQr, label: "Apple Pay" },
    { url: s.googlePayQr, label: "Google Pay" },
  ].filter((m) => m.url);
  const qrHtml = qrMethods
    .map((m) => {
      const src = safeImgUrl(m.url);
      if (!src) return "";
      return `<figure style="margin:0;text-align:center">
        <img src="${escapeHtml(src)}" alt="${escapeHtml(m.label)}收款码" loading="lazy" style="max-width:200px;width:100%;height:auto;border:1px solid #e2e8f0;border-radius:8px" />
        <figcaption style="margin-top:8px;font-size:13px;color:#334155">${escapeHtml(m.label)}</figcaption>
      </figure>`;
    })
    .filter(Boolean)
    .join("\n      ");

  // 链接类支付方式（跳转按钮）
  const linkMethods: Array<{ url: string; label: string; bg: string }> = [
    { url: s.paypalLink, label: "PayPal", bg: "#0070ba" },
    { url: s.afdianLink, label: "爱发电", bg: "#946ce6" },
  ].map((m) => ({ ...m, url: safeLinkUrl(m.url) })).filter((m) => m.url);
  const linksHtml = linkMethods
    .map(
      (m) => `<a href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:6px;background:${m.bg};color:#fff;text-decoration:none;border-radius:9999px;padding:8px 22px;font-size:14px;font-weight:600">${escapeHtml(m.label)} →</a>`
    )
    .join("\n      ");

  return `
<!-- astropress-donation -->
<div id="ap-donation" class="ap-donation" style="margin-top:48px;padding-top:32px;border-top:1px solid #cbd5e1;text-align:center">
  <button type="button" id="ap-donation-btn" style="display:inline-flex;align-items:center;gap:6px;background:#f59e0b;color:#fff;border:0;border-radius:9999px;padding:10px 28px;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.12)">${buttonText}</button>
</div>
<div id="ap-donation-modal" role="dialog" aria-modal="true" aria-labelledby="ap-donation-heading" hidden style="position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center">
  <div id="ap-donation-overlay" style="position:absolute;inset:0;background:rgba(15,23,42,.55)"></div>
  <div style="position:relative;background:#fff;border-radius:12px;padding:28px 28px 24px;max-width:520px;width:calc(100% - 48px);box-shadow:0 20px 50px rgba(0,0,0,.25);max-height:85vh;overflow:auto">
    <button type="button" id="ap-donation-close" aria-label="关闭" style="position:absolute;top:10px;right:12px;background:none;border:0;font-size:22px;line-height:1;color:#64748b;cursor:pointer">&times;</button>
    <h3 id="ap-donation-heading" style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0f172a;text-align:center">${heading}</h3>
    ${s.message ? `<p style="margin:0 0 20px;font-size:14px;color:#64748b;text-align:center;line-height:1.6">${message}</p>` : ""}
    ${qrHtml ? `<div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
      ${qrHtml}
    </div>` : ""}
    ${linksHtml ? `<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;${qrHtml ? "margin-top:20px;padding-top:16px;border-top:1px dashed #e2e8f0;" : ""}">
      ${linksHtml}
    </div>` : ""}
    ${!qrHtml && !linksHtml ? `<p style="margin:0;font-size:13px;color:#94a3b8;text-align:center">暂未配置收款方式</p>` : ""}
  </div>
</div>
<script>
(function () {
  var btn = document.getElementById("ap-donation-btn");
  var modal = document.getElementById("ap-donation-modal");
  if (!btn || !modal || modal.dataset.apDonationInit) return;
  modal.dataset.apDonationInit = "1";
  var closeBtn = document.getElementById("ap-donation-close");
  var overlay = document.getElementById("ap-donation-overlay");
  function open() {
    modal.hidden = false;
    modal.style.display = "flex";
    if (closeBtn) closeBtn.focus();
  }
  function close() {
    modal.hidden = true;
    modal.style.display = "none";
    btn.focus();
  }
  btn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (overlay) overlay.addEventListener("click", close);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !modal.hidden) close();
  });
})();
</script>`;
}

/**
 * 前台中间件：
 *   - 在单篇文章（post，/blog/{slug}）末尾注入打赏按钮 + 二维码模态框
 *   - 仅 GET、仅 text/html，跳过 /api/ 与 /admin
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  if (ctx.request.method !== "GET") return next();
  const res = await next();
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;
  if (ctx.url.pathname.startsWith("/api/") || ctx.url.pathname.startsWith("/admin")) return res;

  // 只处理单篇文章页：/blog/{slug}
  if (!/^\/blog\/[a-zA-Z0-9_-]+\/?$/.test(ctx.url.pathname)) return res;

  const locals = ctx.locals as any;
  const db = locals.db ?? null;
  if (!db) return res;
  if (await isPluginDisabled(db, "donation")) return res;

  // 先查设置（15s 缓存，廉价）：未启用时直接跳过 res.clone().text()，
  // 避免每个文章页请求都把整页 HTML 复制一份；DB 异常不拖垮页面。
  let settings;
  try {
    settings = await loadSettings(db);
  } catch {
    return res;
  }
  if (!settings.enabled) return res;

  const html = await res.clone().text();
  if (!html.includes('class="post-content"')) return res;
  // 幂等标记用 DOM id，避免 dev toolbar 的集成清单（含插件名）误命中
  if (html.includes('id="ap-donation"')) return res;

  const injection = renderInjection(settings);
  const newHtml = html.includes("</article>")
    ? html.replace("</article>", `${injection}\n</article>`)
    : html.replace("</body>", `${injection}\n</body>`);

  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(newHtml, { status: res.status, statusText: res.statusText, headers });
};
