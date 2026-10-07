import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { loadSettings, type ShareSettings } from "./lib/settings";

/**
 * 前台中间件（post 顺序）：
 *   - 在单篇文章页（/blog/{slug}）注入社交分享按钮
 *   - 注入位置可配：文章内容后 / 前 / 前后都显示
 *   - 注入内容完全自包含（内联 CSS/JS，无外部依赖）
 *   - 幂等：已注入过的页面跳过
 */

interface PlatformDef {
  key: keyof ShareSettings["platforms"];
  label: string;
  // 微信/复制链接为 copy 动作，其余为 popup 分享链接模板
  action: "copy" | "popup";
  tmpl?: string;
  // 简单内联 SVG path（stroke 风格，与后台侧边栏图标风格一致）
  icon: string;
}

const PLATFORMS: PlatformDef[] = [
  { key: "wechat", label: "微信", action: "copy", icon: '<path d="M8.5 3C4.9 3 2 5.5 2 8.6c0 1.8.9 3.3 2.4 4.4l-.6 2 2.2-1.1c.6.2 1.2.3 1.9.3M15.5 8c-3.6 0-6.5 2.4-6.5 5.4s2.9 5.4 6.5 5.4c.7 0 1.3-.1 1.9-.3l2.2 1.1-.6-2c1.5-1.1 2.4-2.6 2.4-4.2 0-3-2.9-5.4-5.9-5.4z"/>' },
  { key: "weibo", label: "微博", action: "popup", tmpl: "https://service.weibo.com/share/share.php?url={url}&title={title}", icon: '<path d="M10.1 8.4c-3.6.3-6.4 2.6-6.4 5.3 0 2.9 3 4.9 6.3 4.6 3.4-.3 6-2.6 6-5.2 0-2.6-2.5-4.3-5.9-4.7z"/><path d="M9.6 15.9c-1.5.2-2.8-.6-2.9-1.7-.1-1.1 1.1-2.2 2.6-2.4 1.5-.2 2.8.6 2.9 1.7.1 1.1-1 2.2-2.6 2.4z"/><path d="M15.6 4.2c2.9-.7 5.5 1 5.6 3.7M15.3 7c1.4-.3 2.7.5 2.8 1.8"/>' },
  { key: "qq", label: "QQ", action: "popup", tmpl: "https://connect.qq.com/widget/shareqq/index.html?url={url}&title={title}", icon: '<path d="M12 3c-3 0-5 2.4-5 5.5 0 .5.1 1.1.2 1.6-.6.9-1.2 2.3-1.2 3.4 0 .8.6.9 1.2.3.4.5 1 .9 1.6 1.2-.9.4-1.6 1-1.6 1.7 0 1.1 2.1 1.6 4.8 1.3 2.7.3 4.8-.2 4.8-1.3 0-.7-.7-1.3-1.6-1.7.6-.3 1.2-.7 1.6-1.2.6.6 1.2.5 1.2-.3 0-1.1-.6-2.5-1.2-3.4.1-.5.2-1.1.2-1.6C17 5.4 15 3 12 3z"/>' },
  { key: "zhihu", label: "知乎", action: "popup", tmpl: "https://www.zhihu.com/pin?url={url}", icon: '<path d="M4 5h16v11h-7l-3 4v-4H4z"/><path d="M8 9h8M8 12h5"/>' },
  { key: "twitter", label: "Twitter/X", action: "popup", tmpl: "https://twitter.com/intent/tweet?url={url}&text={title}", icon: '<path d="M4 4l7.2 9.3L4.4 20h2.5l5.4-5.4L16.8 20H20l-7.5-9.7L18.9 4h-2.5l-4.6 4.7L8.2 4z"/>' },
  { key: "facebook", label: "Facebook", action: "popup", tmpl: "https://www.facebook.com/sharer/sharer.php?u={url}", icon: '<path d="M14 8h2.5V4.5H14c-2.2 0-4 1.8-4 4V11H7.5v3.5H10V21h3.5v-6.5h2.6l.4-3.5h-3V8.6c0-.3.2-.6.5-.6z"/>' },
  { key: "linkedin", label: "LinkedIn", action: "popup", tmpl: "https://www.linkedin.com/sharing/share-offsite/?url={url}", icon: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M8 10.5V17M8 7.4v.2M12 17v-3.8c0-1.5 1-2.7 2.4-2.7 1.4 0 2.1 1 2.1 2.7V17M12 10.5V17"/>' },
  { key: "telegram", label: "Telegram", action: "popup", tmpl: "https://t.me/share/url?url={url}&text={title}", icon: '<path d="M21 4.5L3 11.4l5 1.9 1.9 5.2 2.7-3.9 4.6 3.4z"/><path d="M21 4.5L8 13.3"/>' },
  { key: "whatsapp", label: "WhatsApp", action: "popup", tmpl: "https://wa.me/?text={title}%20{url}", icon: '<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"/><path d="M9 8.5c-.3.7-.5 1.4-.5 2 0 2.5 2.5 5 5 5 .6 0 1.3-.2 2-.5l-1.5-1.5-1 .5c-.8-.3-1.9-1.4-2.2-2.2l.5-1z"/>' },
  { key: "copylink", label: "复制链接", action: "copy", icon: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>' },
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderBlock(settings: ShareSettings): string {
  const buttons = PLATFORMS.filter((pf) => settings.platforms[pf.key])
    .map((pf) => {
      const dataTmpl = pf.tmpl ? ` data-tmpl="${esc(pf.tmpl)}"` : "";
      return `<button type="button" class="ap-share-btn" data-ap-share="${pf.action}"${dataTmpl} aria-label="分享到${esc(pf.label)}" title="${esc(pf.label)}"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${pf.icon}</svg><span>${esc(pf.label)}</span></button>`;
    })
    .join("");
  if (!buttons) return "";
  const heading = settings.heading ? `<div class="ap-share-heading">${esc(settings.heading)}</div>` : "";
  return `<div class="ap-share">${heading}<div class="ap-share-btns">${buttons}</div></div>`;
}

function renderInjection(settings: ShareSettings): string {
  const block = renderBlock(settings);
  if (!block) return "";
  return `
<div id="ap-share-root">
<style>
.ap-share{margin:24px 0;padding:16px 0;border-top:1px solid #e2e8f0}
.ap-share-heading{font-size:14px;font-weight:600;color:#475569;margin:0 0 10px}
.ap-share-btns{display:flex;flex-wrap:wrap;gap:8px}
.ap-share-btn{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#334155;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:6px 12px;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
.ap-share-btn:hover{background:#eef2ff;color:#3858e9;border-color:#c7d2fe}
.ap-share-btn svg{flex-shrink:0}
.ap-share-toast{position:fixed;left:50%;bottom:48px;transform:translateX(-50%) translateY(8px);background:#1e293b;color:#fff;font-size:13px;padding:8px 16px;border-radius:6px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:99999}
.ap-share-toast.is-show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>
${block}
<script>
(function () {
  var root = document.getElementById("ap-share-root");
  if (!root || root.dataset.apShareBound === "1") return;
  root.dataset.apShareBound = "1";
  var title = document.title;
  root.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".ap-share-btn") : null;
    if (!btn) return;
    var url = location.href;
    if (btn.getAttribute("data-ap-share") === "popup") {
      var tmpl = btn.getAttribute("data-tmpl") || "";
      var share = tmpl.split("{url}").join(encodeURIComponent(url)).split("{title}").join(encodeURIComponent(title));
      window.open(share, "_blank", "noopener,width=640,height=520");
      return;
    }
    var text = btn.getAttribute("data-ap-share") === "copy" && btn.textContent.indexOf("微信") > -1 ? url : url;
    function toast(msg) {
      var t = document.createElement("div");
      t.className = "ap-share-toast";
      t.textContent = msg;
      document.body.appendChild(t);
      requestAnimationFrame(function () { t.classList.add("is-show"); });
      setTimeout(function () {
        t.classList.remove("is-show");
        setTimeout(function () { t.remove(); }, 300);
      }, 2200);
    }
    function fallbackCopy() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (err) {}
      ta.remove();
    }
    var label = btn.textContent.replace(/\\s+/g, "");
    var okMsg = label.indexOf("微信") > -1 ? "已复制链接，请粘贴到微信" : "链接已复制";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, function () { fallbackCopy(); toast(okMsg); });
    } else {
      fallbackCopy();
      toast(okMsg);
    }
  });
})();
</script>
</div>`;
}

/**
 * 把内容插入到 </article> 前；页面没有 </article> 时退化为 </body> 前。
 */
function injectBeforeClose(html: string, fragment: string, tag: "article" | "body"): string {
  const close = `</${tag}>`;
  const idx = html.lastIndexOf(close);
  if (idx === -1) return html;
  return html.slice(0, idx) + fragment + "\n" + html.slice(idx);
}

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const res = await next();

  if (ctx.request.method !== "GET") return res;
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;
  if (ctx.url.pathname.startsWith("/api/") || ctx.url.pathname.startsWith("/admin")) return res;

  // 只处理单篇文章页：/blog/{slug}
  const m = ctx.url.pathname.match(/^\/blog\/([a-zA-Z0-9_-]+)\/?$/);
  if (!m) return res;

  const locals = ctx.locals as any;
  const db = locals.db ?? null;
  if (!db) return res;
  if (await isPluginDisabled(db, "share")) return res;

  // 先查设置（15s 缓存，廉价）：未启用时直接跳过 res.clone().text()，
  // 避免每个文章页请求都把整页 HTML 复制一份。
  let settings: ShareSettings;
  try {
    settings = await loadSettings(db);
  } catch {
    return res;
  }
  if (!settings.enabled) return res;

  const html = await res.clone().text();
  if (!html.includes('class="post-content"')) return res;
  if (html.includes('id="ap-share-root"')) return res; // 幂等：已注入则跳过

  const fragment = renderInjection(settings);
  if (!fragment) return res;

  let newHtml = html;
  const pos = settings.position;
  if (pos === "after" || pos === "both") {
    newHtml = newHtml.includes("</article>")
      ? injectBeforeClose(newHtml, fragment, "article")
      : injectBeforeClose(newHtml, fragment, "body");
  }
  if (pos === "before" || pos === "both") {
    const contentIdx = newHtml.indexOf('class="post-content"');
    if (contentIdx > -1) {
      // 找包含 class="post-content" 的标签起点，插到它前面
      const tagStart = newHtml.lastIndexOf("<", contentIdx);
      if (tagStart > -1) newHtml = newHtml.slice(0, tagStart) + fragment + "\n" + newHtml.slice(tagStart);
    } else {
      // 退化：插到 <article ...> 开始标签之后
      const articleOpen = newHtml.match(/<article\b[^>]*>/i);
      if (articleOpen && articleOpen.index !== undefined) {
        const at = articleOpen.index + articleOpen[0].length;
        newHtml = newHtml.slice(0, at) + "\n" + fragment + newHtml.slice(at);
      }
    }
  }

  if (newHtml === html) return res;
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(newHtml, { status: res.status, statusText: res.statusText, headers });
};
