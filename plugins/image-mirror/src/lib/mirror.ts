import { and, eq } from "drizzle-orm";
import type { Database } from "@astropress/core";
import { wpPostmeta, wpPosts } from "@astropress/core/schema";
import { UnsafeUrlError, assertSafeRemoteUrl } from "./guard";
import { sniffImage } from "./sniff";
import { mediaBase, putFile } from "./storage";

/** Maximum number of remote images mirrored per single save. */
const MAX_IMAGES = Math.max(1, Number(process.env.AP_MIRROR_MAX_IMAGES ?? 20));
/** Maximum bytes accepted per remote image. */
const MAX_BYTES = Math.max(1, Number(process.env.AP_MIRROR_MAX_MB ?? 10)) * 1024 * 1024;
/** Per-request (per hop) fetch timeout in milliseconds. */
const TIMEOUT_MS = Math.max(1000, Number(process.env.AP_MIRROR_TIMEOUT_MS ?? 15000));
/** Parallel downloads per save. */
const CONCURRENCY = Math.max(1, Number(process.env.AP_MIRROR_CONCURRENCY ?? 3));
const MAX_REDIRECTS = 3;

const USER_AGENT =
  "Mozilla/5.0 (compatible; AstroPressImageMirror/1.0; +https://github.com/astropress)";

export interface MirrorResult {
  /** Images successfully mirrored this save. */
  mirrored: number;
  /** Remote images that failed (left untouched in content). */
  failed: number;
  /** Images skipped because MAX_IMAGES was reached (left untouched). */
  skipped: number;
  content: string;
  excerpt: string;
  changed: boolean;
}

const IMG_TAG_RE = /<img\b[^>]*>/gi;
const SRC_RE = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

/** Quick pre-filter used by the middleware before touching the request body. */
export function mightContainRemoteImages(content: string, excerpt: string): boolean {
  return /<img\b[^>]*\bsrc\s*=\s*["']?https?:/i.test(`${content}\n${excerpt}`);
}

/** Extract (HTML-entity decoded) src values of every <img> tag in the HTML. */
export function extractImageSrcs(html: string): string[] {
  const out: string[] = [];
  for (const tag of html.matchAll(IMG_TAG_RE)) {
    const m = SRC_RE.exec(tag[0]);
    if (!m) continue;
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (raw) out.push(decodeAttr(raw));
  }
  return out;
}

function decodeAttr(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

function encodeAttrVariant(s: string): string {
  return s.replace(/&/g, "&amp;");
}

/** Replace both the raw and the HTML-attribute-encoded form of src with dst. */
function rewriteSrc(html: string, src: string, dst: string): string {
  if (!html) return html;
  const encoded = encodeAttrVariant(src);
  let out = html.split(src).join(dst);
  if (encoded !== src) out = out.split(encoded).join(dst);
  return out;
}

function localHostsOf(request: Request): Set<string> {
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(request.url).host);
  } catch {
    /* ignore */
  }
  try {
    hosts.add(new URL(mediaBase(request)).host);
  } catch {
    /* ignore */
  }
  return hosts;
}

function nowStamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function randomSuffix(bytes = 6): string {
  let s = "";
  for (let i = 0; i < bytes; i++) s += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  return s;
}

/**
 * Mirror every external image referenced by a freshly-saved post into the
 * media library, persist attachment records and rewrite the post content /
 * excerpt. Failures on individual images never fail the save: their original
 * URLs are left in place and counted in `failed`.
 */
export async function mirrorSavedPost(
  db: Database,
  postId: number,
  rawContent: string | undefined,
  rawExcerpt: string | undefined,
  request: Request,
  locals: unknown
): Promise<MirrorResult> {
  const content = rawContent ?? "";
  const excerpt = rawExcerpt ?? "";
  const result: MirrorResult = {
    mirrored: 0,
    failed: 0,
    skipped: 0,
    content,
    excerpt,
    changed: false,
  };

  if (!mightContainRemoteImages(content, excerpt)) return result;

  const localHosts = localHostsOf(request);
  // Canonical href -> raw src as found in the HTML (URL normalization may add
  // e.g. a trailing slash, so both forms are tried when rewriting).
  const targets = new Map<string, string>();
  for (const src of [...extractImageSrcs(content), ...extractImageSrcs(excerpt)]) {
    let u: URL;
    try {
      u = new URL(src);
    } catch {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    if (localHosts.has(u.host)) continue;
    if (!targets.has(u.href)) targets.set(u.href, src);
  }

  if (targets.size === 0) return result;

  const queue = [...targets].map(([href, raw]) => ({ href, raw }));
  const accepted = queue.slice(0, MAX_IMAGES);
  result.skipped = queue.length - accepted.length;

  // Attachment rows inherit the post author.
  let authorId = 0;
  try {
    const [row] = await db
      .select({ author: wpPosts.postAuthor })
      .from(wpPosts)
      .where(eq(wpPosts.id, postId))
      .limit(1);
    authorId = row?.author ?? 0;
  } catch {
    /* post may vanish between save and mirror — proceed with author 0 */
  }

  // href -> local URL
  const replacements = new Map<string, string>();
  await runPool(CONCURRENCY, accepted, async (target) => {
    try {
      const localUrl = await sideload(db, target.href, request, locals, authorId);
      replacements.set(target.href, localUrl);
      result.mirrored++;
    } catch (err) {
      result.failed++;
      if (process.env.NODE_ENV !== "test") {
        const reason = err instanceof Error ? err.message : String(err);
        console.warn(`[image-mirror] failed: ${target.href} (${reason})`);
      }
    }
  });

  if (replacements.size === 0) return result;

  let nextContent = content;
  let nextExcerpt = excerpt;
  for (const target of accepted) {
    const localUrl = replacements.get(target.href);
    if (!localUrl) continue;
    // Try the attribute form first, then the canonicalized href.
    nextContent = rewriteSrc(rewriteSrc(nextContent, target.href, localUrl), target.raw, localUrl);
    nextExcerpt = rewriteSrc(rewriteSrc(nextExcerpt, target.href, localUrl), target.raw, localUrl);
  }

  result.changed = nextContent !== content || nextExcerpt !== excerpt;
  if (!result.changed) return result;

  result.content = nextContent;
  result.excerpt = nextExcerpt;

  await db
    .update(wpPosts)
    .set({
      ...(nextContent !== content ? { postContent: nextContent } : {}),
      ...(nextExcerpt !== excerpt ? { postExcerpt: nextExcerpt } : {}),
    })
    .where(eq(wpPosts.id, postId));

  return result;
}

/**
 * Resolve one remote URL to a local media URL. Previously mirrored sources are
 * reused via the _ap_source_url postmeta on their attachment row.
 */
async function sideload(
  db: Database,
  src: string,
  request: Request,
  locals: unknown,
  authorId: number
): Promise<string> {
  const existing = await db
    .select({ guid: wpPosts.guid })
    .from(wpPostmeta)
    .innerJoin(wpPosts, eq(wpPosts.id, wpPostmeta.postId))
    .where(
      and(
        eq(wpPostmeta.metaKey, "_ap_source_url"),
        eq(wpPostmeta.metaValue, src)
      )
    )
    .limit(1);
  if (existing[0]?.guid) return existing[0].guid;

  const { buf, ext, mime } = await downloadImage(src);
  const key = `${Date.now()}-${randomSuffix()}.${ext}`;
  const stored = await putFile(locals, request, key, buf, mime);

  const title = attachmentTitle(src, ext);
  const stamp = nowStamp();
  const [row] = await db
    .insert(wpPosts)
    .values({
      postAuthor: authorId,
      postTitle: title,
      postName: key,
      guid: stored.url,
      postStatus: "inherit",
      postType: "attachment",
      postMimeType: mime,
      postDate: stamp,
      postModified: stamp,
    })
    .returning({ id: wpPosts.id });

  await db
    .insert(wpPostmeta)
    .values({ postId: row.id, metaKey: "_wp_attached_file", metaValue: key });
  await db
    .insert(wpPostmeta)
    .values({ postId: row.id, metaKey: "_ap_source_url", metaValue: src });

  return stored.url;
}

function attachmentTitle(src: string, ext: string): string {
  let seg = "";
  try {
    seg = new URL(src).pathname.split("/").pop() ?? "";
  } catch {
    /* ignore */
  }
  seg = decodeURIComponent(seg).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  if (seg) return seg;
  try {
    return `${new URL(src).host.replace(/[^a-zA-Z0-9._-]/g, "_")}.${ext}`;
  } catch {
    return `mirror-${Date.now()}.${ext}`;
  }
}

interface Downloaded {
  buf: Uint8Array;
  ext: "png" | "jpeg" | "gif" | "webp" | "avif";
  mime: string;
}

/** Fetch with per-hop SSRF guard, redirect limit, timeout, size cap and sniff. */
async function downloadImage(srcUrl: string): Promise<Downloaded> {
  let url: URL;
  try {
    url = new URL(srcUrl);
  } catch {
    throw new Error("malformed URL");
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeRemoteUrl(url.href);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: `${url.origin}/`,
          "User-Agent": USER_AGENT,
        },
      });
    } catch (err) {
      throw new Error(
        err instanceof UnsafeUrlError
          ? err.message
          : err instanceof DOMException && err.name === "AbortError"
            ? "timeout"
            : "fetch failed"
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) throw new Error("too many redirects");
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) throw new Error("image too large");
    const body = res.body;
    if (!body) {
      const buffered = new Uint8Array(await res.arrayBuffer());
      if (buffered.byteLength > MAX_BYTES) throw new Error("image too large");
      return requireImage(buffered);
    }
    return requireImage(await readCapped(body, MAX_BYTES));
  }

  throw new Error("too many redirects");
}

function requireImage(buf: Uint8Array): Downloaded {
  const sn = sniffImage(buf);
  if (!sn) throw new Error("response is not a supported image");
  return { buf, ext: sn.ext, mime: sn.mime };
}

async function readCapped(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new Error("image too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

async function runPool<T>(limit: number, items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx]);
    }
  });
  await Promise.all(workers);
}
