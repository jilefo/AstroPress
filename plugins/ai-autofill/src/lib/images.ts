/**
 * AI 图文：把文本提示词转成真实图片（text_to_image 服务），存入 R2/本地，
 * 返回可公开访问的 URL。这样文章里的图片是真实可显示的资源，而不是
 * LLM 凭空编造的图片链接或裸 URL。
 */

const TTI_ENDPOINT = "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image";
const SIZES = ["square_hd", "square", "portrait_4_3", "portrait_16_9", "landscape_4_3", "landscape_16_9"] as const;
export type ImageSize = (typeof SIZES)[number];

export interface GeneratedImage {
  url: string;
  key: string;
}

/** 调用 text_to_image，返回图片字节与 MIME */
async function renderImage(prompt: string, size: ImageSize): Promise<{ bytes: Uint8Array; mime: string }> {
  const u = `${TTI_ENDPOINT}?prompt=${encodeURIComponent(prompt)}&image_size=${size}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(u, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`text_to_image HTTP ${res.status}`);
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    if (!mime.startsWith("image/")) throw new Error("text_to_image 未返回图片");
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 1000) throw new Error("text_to_image 返回数据过小");
    return { bytes, mime };
  } finally {
    clearTimeout(timer);
  }
}

const extFor = (mime: string): string => {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
};

const monthDir = () => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}${mm}`;
};

const randId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `id${Date.now()}${Math.floor(Math.random() * 1e6)}`).replace(/-/g, "").slice(0, 16);

function mediaBase(request: Request): string {
  return (process.env.MEDIA_BASE_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
}

/**
 * 生成图片并持久化：
 *  - Cloudflare：存 R2（key: ai/{YYYYMM}/{id}.jpg），URL 走 /media/{key}
 *  - 本地 dev：写 public/media/...
 * 可选写入 wp_posts attachment 记录，与官方媒体库保持一致。
 */
export async function generateAndStore(
  locals: any,
  request: Request,
  prompt: string,
  size: ImageSize = "landscape_16_9"
): Promise<GeneratedImage> {
  const { bytes, mime } = await renderImage(prompt, size);
  const ext = extFor(mime);
  const key = `ai/${monthDir()}/${randId()}.${ext}`;

  const r2 = locals?.runtime?.env?.R2 as { put: (k: string, v: Uint8Array, o?: any) => Promise<unknown> } | undefined;
  if (r2) {
    await r2.put(key, bytes, { httpMetadata: { contentType: mime } });
  } else {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "public", "media", ...key.split("/").slice(0, -1));
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(process.cwd(), "public", "media", key), bytes);
  }

  // 登记为媒体附件（失败不阻断，图片本身已可访问）
  try {
    const db = locals?.db;
    const user = locals?.user;
    if (db && user) {
      const { wpPosts, wpPostmeta } = await import("@astropress/core/schema");
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      const [row] = await db
        .insert(wpPosts)
        .values({
          postAuthor: user.id,
          postTitle: `AI ${key.split("/").pop()}`,
          postName: key,
          guid: `/media/${key}`,
          postStatus: "inherit",
          postType: "attachment",
          postMimeType: mime,
          postDate: now,
          postModified: now,
        })
        .returning({ id: wpPosts.id });
      await db.insert(wpPostmeta).values({ postId: row.id, metaKey: "_wp_attached_file", metaValue: key });
    }
  } catch {
    /* attachment 记录非关键 */
  }

  return { url: `${mediaBase(request)}/media/${key}`, key };
}

/** 判断用户主题/指令是否要求图文（中英文关键词） */
export function wantsImages(topic: string): boolean {
  return /配图|图文|插图|插画|封面图|图片|照片|带图|多图|排版精美|image|photo|illustration|with pictures?|配图/i.test(topic);
}
