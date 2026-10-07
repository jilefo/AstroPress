import type { TranslationGroup } from "./links";
import type { MlSettings } from "./types";
import { esc } from "./types";

export interface HeadTagsInput {
  settings: MlSettings;
  group: TranslationGroup | null;
  path: string;
  lang: string;
  siteUrl: string;
  seoTitle: string;
  seoDescription: string;
}

/**
 * Build canonical / hreflang / Open Graph tags for head injection.
 * Translation URLs use the base slug for every language:
 *   /{code}/{baseSlug}  (default language stays at /{baseSlug})
 */
export function buildHeadTags(input: HeadTagsInput): string {
  const { settings: s, group, path, lang, siteUrl } = input;
  const base = siteUrl.replace(/\/+$/, "");
  const tags: string[] = [];

  const canon = lang !== s.defaultLang ? `${base}/${lang}${path}` : `${base}${path}`;
  tags.push(`<link rel="canonical" href="${esc(canon)}" />`);

  if (group) {
    const enabledCodes = new Set(s.languages.filter((l) => l.enabled).map((l) => l.code));
    for (const [code, slug] of Object.entries(group.members)) {
      if (!enabledCodes.has(code) && code !== s.defaultLang) continue;
      const href = code === s.defaultLang ? `${base}${path}` : `${base}/${code}${path}`;
      const locale = s.languages.find((l) => l.code === code)?.locale ?? code;
      tags.push(`<link rel="alternate" hreflang="${esc(locale)}" href="${esc(href)}" />`);
    }
    tags.push(`<link rel="alternate" hreflang="x-default" href="${esc(`${base}${path}`)}" />`);
  }

  if (input.seoTitle) tags.push(`<meta property="og:title" content="${esc(input.seoTitle)}" />`);
  if (input.seoDescription) tags.push(`<meta property="og:description" content="${esc(input.seoDescription)}" />`);
  tags.push(`<meta property="og:locale" content="${esc(langToLocale(lang, s))}" />`);
  if (group) {
    for (const code of Object.keys(group.members)) {
      if (code === lang) continue;
      tags.push(`<meta property="og:locale:alternate" content="${esc(langToLocale(code, s))}" />`);
    }
  }
  return tags.join("\n    ");
}

function langToLocale(code: string, s: MlSettings): string {
  return s.languages.find((l) => l.code === code)?.locale ?? code;
}