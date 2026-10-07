import type { AdUnit } from "./types";
import { esc } from "./types";

/**
 * Render one ad unit as HTML. Admin-authored code (post_content) is trusted
 * input by design (same threat model as WordPress custom-HTML blocks);
 * every plugin-generated attribute is escaped. iframe+sandbox isolates
 * third-party scripts. Pure function — unit tested.
 */
export function renderAd(ad: AdUnit, slotKey: string): string {
  const id = `ap-ad-${ad.id}`;
  const cls = `ap-ad ap-ad--${esc(slotKey)}`;
  let body: string;
  switch (ad.kind) {
    case "image":
      body = `<img src="${esc(ad.content)}" alt="${esc(ad.title)}" loading="lazy" decoding="async" style="max-width:100%;height:auto;" />`;
      break;
    case "iframe":
      body = ad.sandbox
        ? `<iframe srcdoc="${esc(ad.content)}" sandbox="allow-scripts" loading="lazy" style="border:0;width:100%;" title="${esc(ad.title)}"></iframe>`
        : `<iframe srcdoc="${esc(ad.content)}" loading="lazy" style="border:0;width:100%;" title="${esc(ad.title)}"></iframe>`;
      break;
    default:
      body = ad.content;
  }
  const noscript = ad.noScriptFallback ? `<noscript>${ad.noScriptFallback}</noscript>` : "";
  const gdpr = ad.gdprConsentRequired ? ' data-ap-gdpr="1"' : "";
  return `<div id="${id}" class="${cls}" data-ap-ad-id="${id}" data-ap-track="1"${gdpr}>${body}${noscript}</div>`;
}

export function renderSlotPlaceholderMiss(slotKey: string): string {
  return `<!-- ap-ad: no active ad for "${esc(slotKey)}" -->`;
}