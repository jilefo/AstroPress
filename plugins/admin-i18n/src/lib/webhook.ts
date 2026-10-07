/**
 * n8n webhook client.
 *
 * Contract (canonical):
 *   POST <url>  { "texts": ["Dashboard", "Add New"], "target": "zh-CN" }
 *   200         { "translations": { "Dashboard": "仪表盘", ... } }
 *
 * The response normalizer also accepts common n8n shapes so the webhook
 * flow stays flexible:
 *   - flat map { "Dashboard": "仪表盘", ... }
 *   - array of rows: [{ original, translation }] with forgiving key names
 *     (original|source|text|key|en|input / translation|translated|target|
 *     zh|value|output|result)
 * Only requested keys are returned, never extra content.
 */

const TIMEOUT_MS = 12_000;

const SOURCE_KEYS = ["original", "source", "text", "key", "en", "input", "query"];
const TARGET_KEYS = ["translation", "translated", "translations", "target", "zh", "value", "output", "result"];

function pick(row: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

/** Normalize any accepted webhook response shape into { original → translation }. */
export function normalizeTranslations(raw: unknown, requested: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const wanted = new Set(requested);

  let map: unknown = raw;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (obj.translations && typeof obj.translations === "object") map = obj.translations;
    else if (obj.data && typeof obj.data === "object") map = obj.data; // n8n "Respond to Webhook" wraps payloads
  }

  if (Array.isArray(map)) {
    for (const row of map) {
      if (!row || typeof row !== "object") continue;
      const src = pick(row as Record<string, unknown>, SOURCE_KEYS);
      const dst = pick(row as Record<string, unknown>, TARGET_KEYS);
      if (src && dst && wanted.has(src)) out[src] = dst;
    }
    return out;
  }

  if (map && typeof map === "object") {
    for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
      if (wanted.has(k) && typeof v === "string" && v) out[k] = v;
    }
  }
  return out;
}

/** POST texts to the configured webhook. Throws on network/HTTP failure. */
export async function callWebhook(
  url: string,
  texts: string[],
  target: string
): Promise<{ translations: Record<string, string>; raw: unknown; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, target }),
      signal: controller.signal,
    });
    const bodyText = await res.text();
    if (!res.ok) throw new Error(`翻译 Webhook 返回错误（HTTP ${res.status}）：${bodyText.slice(0, 200)}`);
    let raw: unknown;
    try {
      raw = JSON.parse(bodyText);
    } catch {
      throw new Error(`翻译 Webhook 未返回 JSON：${bodyText.slice(0, 200)}`);
    }
    return { translations: normalizeTranslations(raw, texts), raw, status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

/** Validate + clean an incoming batch of texts from the browser. */
export function sanitizeTexts(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== "string") continue;
    const key = t.replace(/\s+/g, " ").trim();
    if (!key || key.length > 200 || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= 40) break;
  }
  return out;
}
