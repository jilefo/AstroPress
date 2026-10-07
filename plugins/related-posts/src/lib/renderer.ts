import type { RelatedSettings } from "./settings";
import type { PostItem } from "./render";

export function renderSection(title: string, items: PostItem[], css: string, postBase = "/"): string {
  if (items.length === 0) return "";
  const lis = items
    .map(
      (p) => `
        <li style="margin:0 0 12px;padding-bottom:12px;border-bottom:1px solid #e2e8f0">
          <a href="${postBase}${encodeURIComponent(p.slug)}" style="font-weight:600;color:#1d4ed8;text-decoration:none">${escapeHtml(p.title)}</a>
          ${p.excerpt ? `<p style="margin:4px 0 0;font-size:14px;color:#64748b;line-height:1.5">${escapeHtml(p.excerpt)}</p>` : ""}
        </li>`
    )
    .join("");
  return `<section class="related-posts-section" style="margin-top:40px">
    <h3 style="font-size:18px;font-weight:700;margin-bottom:12px;color:#0f172a">${escapeHtml(title)}</h3>
    <ul style="list-style:none;padding:0;margin:0">${lis}</ul>
  </section>`;
}

export function renderBlock(
  settings: RelatedSettings,
  related: PostItem[],
  random: PostItem[],
  popular: PostItem[],
  postBase = "/"
): string {
  if (!settings.enabled) return "";
  const parts: string[] = [];
  if (related.length > 0) parts.push(renderSection("相关文章", related, settings.css, postBase));
  if (random.length > 0) parts.push(renderSection("随机推荐", random, settings.css, postBase));
  if (popular.length > 0) parts.push(renderSection("热门文章", popular, settings.css, postBase));
  if (parts.length === 0) return "";
  // 自定义 CSS 注入 <style>：剔除可闭合 style 的序列，防止存储型 breakout
  const safeCss = settings.css ? settings.css.replace(/<\s*\//g, "<\\/").replace(/[<>]/g, "") : "";
  const custom = safeCss ? `<style>${safeCss}</style>` : "";
  return `<div id="related-posts-block" style="margin-top:48px;padding-top:32px;border-top:1px solid #cbd5e1">
    ${settings.heading ? `<h2 style="font-size:20px;font-weight:700;margin-bottom:20px;color:#0f172a">${escapeHtml(settings.heading)}</h2>` : ""}
    ${parts.join("")}
    ${custom}
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
