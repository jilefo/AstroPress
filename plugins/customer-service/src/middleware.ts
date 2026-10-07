import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { loadSettings } from "./lib/settings";

/**
 * 前台中间件（post 顺序）：
 *   - 仅在 GET、text/html、非 /admin、非 /api 的公开页面注入浮动客服组件
 *   - 注入内容完全自包含（内联 CSS/JS），幂等（重复加载不重复插入）
 *   - 移动端面板接近全宽
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJs(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "")
    .replace(/\n/g, "\\n")
    .replace(/<\//g, "<\\/");
}

function isValidColor(c: string): boolean {
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(c);
}

function buildWidget(s: {
  title: string;
  qq: string;
  wechat: string;
  telegram: string;
  email: string;
  phone: string;
  workingHours: string;
  position: "bottom-right" | "bottom-left";
  primaryColor: string;
}): string {
  const color = isValidColor(s.primaryColor) ? s.primaryColor : "#2271b1";
  const side = s.position === "bottom-left" ? "left" : "right";
  const title = escapeHtml(s.title || "联系客服");

  const items: string[] = [];
  if (s.qq) {
    const qq = escapeHtml(s.qq);
    items.push(
      `<div class="apcs-item" data-copy="${qq}" data-link="tencent://message/?uin=${encodeURIComponent(s.qq)}">` +
        `<span class="apcs-ico">QQ</span><span class="apcs-body"><span class="apcs-label">QQ</span><span class="apcs-val">${qq}</span></span>` +
        `</div>`
    );
  }
  if (s.wechat) {
    const wx = escapeHtml(s.wechat);
    items.push(
      `<div class="apcs-item" data-copy="${wx}">` +
        `<span class="apcs-ico">微</span><span class="apcs-body"><span class="apcs-label">微信</span><span class="apcs-val">${wx}</span></span>` +
        `</div>`
    );
  }
  if (s.telegram) {
    const tg = escapeHtml(s.telegram);
    const tgUser = s.telegram.replace(/^@/, "").replace(/^https?:\/\/t\.me\//i, "");
    items.push(
      `<div class="apcs-item" data-copy="${tg}" data-link="https://t.me/${encodeURIComponent(tgUser)}">` +
        `<span class="apcs-ico">✈</span><span class="apcs-body"><span class="apcs-label">Telegram</span><span class="apcs-val">${tg}</span></span>` +
        `</div>`
    );
  }
  if (s.email) {
    const em = escapeHtml(s.email);
    items.push(
      `<div class="apcs-item" data-copy="${em}" data-link="mailto:${encodeURIComponent(s.email)}">` +
        `<span class="apcs-ico">@</span><span class="apcs-body"><span class="apcs-label">邮箱</span><span class="apcs-val">${em}</span></span>` +
        `</div>`
    );
  }
  if (s.phone) {
    const ph = escapeHtml(s.phone);
    items.push(
      `<div class="apcs-item" data-copy="${ph}" data-link="tel:${encodeURIComponent(s.phone)}">` +
        `<span class="apcs-ico">☎</span><span class="apcs-body"><span class="apcs-label">电话</span><span class="apcs-val">${ph}</span></span>` +
        `</div>`
    );
  }
  if (s.workingHours) {
    items.push(
      `<div class="apcs-item apcs-hours">` +
        `<span class="apcs-ico">⏰</span><span class="apcs-body"><span class="apcs-label">工作时间</span><span class="apcs-val">${escapeHtml(s.workingHours)}</span></span>` +
        `</div>`
    );
  }
  if (items.length === 0) {
    items.push(`<div class="apcs-empty">暂未配置联系方式</div>`);
  }

  // 工作时间文本以配置数据形式传给前端脚本，由脚本解析判断在线状态（可选）
  const hoursJs = escapeJs(s.workingHours || "");

  return `
<div id="apcs-root" class="apcs-${side}">
  <style>
    #apcs-root{position:fixed;${side}:20px;bottom:20px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;font-size:14px;}
    #apcs-root *{box-sizing:border-box;margin:0;padding:0;}
    #apcs-root .apcs-fab{width:52px;height:52px;border-radius:50%;background:${color};color:#fff;border:0;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.25);transition:transform .15s ease;}
    #apcs-root .apcs-fab:hover{transform:scale(1.06);}
    #apcs-root .apcs-fab svg{width:26px;height:26px;fill:currentColor;}
    #apcs-root .apcs-panel{position:absolute;${side}:0;bottom:64px;width:300px;max-width:calc(100vw - 32px);background:#fff;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.2);overflow:hidden;display:none;}
    #apcs-root .apcs-panel.apcs-open{display:block;animation:apcs-in .18s ease;}
    @keyframes apcs-in{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
    #apcs-root .apcs-head{display:flex;align-items:center;justify-content:space-between;background:${color};color:#fff;padding:12px 14px;font-weight:600;}
    #apcs-root .apcs-status{font-size:12px;font-weight:400;opacity:.9;display:inline-flex;align-items:center;gap:4px;margin-left:8px;}
    #apcs-root .apcs-dot{width:8px;height:8px;border-radius:50%;display:inline-block;}
    #apcs-root .apcs-dot.on{background:#4ade80;}
    #apcs-root .apcs-dot.off{background:#cbd5e1;}
    #apcs-root .apcs-close{background:transparent;border:0;color:#fff;font-size:20px;line-height:1;cursor:pointer;padding:2px 6px;}
    #apcs-root .apcs-list{padding:8px;max-height:60vh;overflow:auto;}
    #apcs-root .apcs-item{display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;cursor:pointer;transition:background .12s ease;}
    #apcs-root .apcs-item:hover{background:#f1f5f9;}
    #apcs-root .apcs-item.apcs-hours{cursor:default;}
    #apcs-root .apcs-ico{flex-shrink:0;width:34px;height:34px;border-radius:8px;background:${color}1a;color:${color};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;}
    #apcs-root .apcs-body{display:flex;flex-direction:column;min-width:0;}
    #apcs-root .apcs-label{font-size:12px;color:#64748b;}
    #apcs-root .apcs-val{font-size:14px;color:#0f172a;word-break:break-all;}
    #apcs-root .apcs-empty{padding:18px;text-align:center;color:#64748b;font-size:13px;}
    #apcs-root .apcs-toast{position:absolute;${side}:0;bottom:64px;background:#0f172a;color:#fff;font-size:12px;padding:6px 12px;border-radius:6px;opacity:0;pointer-events:none;transition:opacity .2s ease;white-space:nowrap;}
    @media (max-width:480px){
      #apcs-root .apcs-panel{width:calc(100vw - 40px);}
    }
  </style>
  <div class="apcs-panel" id="apcs-panel" role="dialog" aria-label="${title}">
    <div class="apcs-head">
      <span>${title}<span class="apcs-status" id="apcs-status" style="display:none"><span class="apcs-dot" id="apcs-dot"></span><span id="apcs-status-text"></span></span></span>
      <button class="apcs-close" id="apcs-close" aria-label="关闭">&times;</button>
    </div>
    <div class="apcs-list">${items.join("")}</div>
  </div>
  <div class="apcs-toast" id="apcs-toast"></div>
  <button class="apcs-fab" id="apcs-fab" aria-label="${title}">
    <svg viewBox="0 0 24 24"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-9 9H7V9h4zm6 0h-4V9h4z"/></svg>
  </button>
</div>
<script>
(function () {
  if (window.__apcsInit) return;
  window.__apcsInit = true;
  var fab = document.getElementById("apcs-fab");
  var panel = document.getElementById("apcs-panel");
  var closeBtn = document.getElementById("apcs-close");
  var toast = document.getElementById("apcs-toast");
  if (!fab || !panel) return;

  function toggle(open) {
    var willOpen = typeof open === "boolean" ? open : !panel.classList.contains("apcs-open");
    panel.classList.toggle("apcs-open", willOpen);
  }
  fab.addEventListener("click", function () { toggle(); });
  if (closeBtn) closeBtn.addEventListener("click", function () { toggle(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") toggle(false);
  });

  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.style.opacity = "1";
    setTimeout(function () { toast.style.opacity = "0"; }, 1600);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showToast("已复制"); }, function () { fallback(); });
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); showToast("已复制"); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  panel.addEventListener("click", function (e) {
    var item = e.target && e.target.closest ? e.target.closest(".apcs-item") : null;
    if (!item || item.classList.contains("apcs-hours")) return;
    var link = item.getAttribute("data-link");
    var copy = item.getAttribute("data-copy");
    if (copy) copyText(copy);
    if (link) { try { window.location.href = link; } catch (err) {} }
  });

  // 在线状态：解析工作时间文本中的 HH:MM-HH:MM 时段（可选功能）
  var hours = '${hoursJs}';
  var statusEl = document.getElementById("apcs-status");
  var dotEl = document.getElementById("apcs-dot");
  var textEl = document.getElementById("apcs-status-text");
  if (hours && statusEl && dotEl && textEl) {
    var m = hours.match(/(\\d{1,2})[:：](\\d{2})\\s*[-~至—]\\s*(\\d{1,2})[:：](\\d{2})/);
    if (m) {
      var now = new Date();
      var cur = now.getHours() * 60 + now.getMinutes();
      var start = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
      var end = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
      var online = cur >= start && cur < end;
      statusEl.style.display = "inline-flex";
      dotEl.className = "apcs-dot " + (online ? "on" : "off");
      textEl.textContent = online ? "在线" : "离线";
    }
  }
})();
</script>`;
}

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const res = await next();

  if (ctx.request.method !== "GET") return res;
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;
  const path = ctx.url.pathname;
  if (path.startsWith("/admin") || path.startsWith("/api")) return res;

  const locals = ctx.locals as any;
  const db = locals.db ?? null;
  if (!db) return res;
  if (await isPluginDisabled(db, "customer-service")) return res;

  let settings;
  try {
    settings = await loadSettings(db);
  } catch {
    return res;
  }
  if (!settings.enabled) return res;

  const html = await res.clone().text();
  if (!html.includes("</body>")) return res;
  // 幂等：已注入则跳过
  if (html.includes('id="apcs-root"')) return res;

  const widget = buildWidget(settings);
  const injected = html.replace("</body>", `${widget}\n</body>`);
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
