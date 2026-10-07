import type { MlSettings } from "./types";

/**
 * Returns the language code when the first path segment matches an enabled
 * language, e.g. "/zh-hans/about" -> "zh-hans". Used for prefix rewriting only.
 */
export function resolvePrefix(pathname: string, s: MlSettings): string | null {
  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return null;
  return s.languages.some((l) => l.enabled && l.code === seg) ? seg : null;
}

/**
 * Resolve current language with priority: URL prefix > ?lang= > ml_pref cookie
 * > Accept-Language. Returns null when nothing matches (use defaultLang).
 */
export function resolveLang(req: Request, s: MlSettings): string | null {
  const url = new URL(req.url);
  const prefix = resolvePrefix(url.pathname, s);
  if (prefix) return prefix;

  const param = url.searchParams.get("lang");
  if (param && s.languages.some((l) => l.enabled && l.code === param)) return param;

  const cookie = req.headers.get("cookie")?.match(/(?:^|;\s*)ml_pref=([a-z0-9-]+)/i)?.[1];
  if (cookie && s.languages.some((l) => l.enabled && l.code === cookie)) return cookie;

  const accept = req.headers.get("accept-language")?.split(",")[0]?.split(";")[0]?.toLowerCase() ?? "";
  if (accept) {
    const hit = s.languages.find(
      (l) => l.enabled && accept.startsWith(l.locale.toLowerCase()) || (l.enabled && accept.startsWith(l.code.toLowerCase()))
    );
    if (hit) return hit.code;
  }
  return null;
}