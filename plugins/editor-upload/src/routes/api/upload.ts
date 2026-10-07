import { wpPostmeta, wpPosts } from "@astropress/core/schema";
import type { APIRoute } from "astro";
import { sanitizeSvg } from "../../lib/sanitizeSvg";
import { sniffMime } from "../../lib/sniff";
import { putFile } from "../../lib/storage";
import { storageKey, validateUpload } from "../../lib/validate";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function nowStamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Hardened upload endpoint. Unlike the stock /api/media/upload this enforces:
 * extension whitelist, magic-byte MIME sniffing, size limit, SVG sanitizing,
 * session auth. Storage and DB conventions mirror the official endpoint.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);

  const maxBytes = Number(process.env.AP_UPLOAD_MAX_MB ?? 25) * 1024 * 1024;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "请以 multipart/form-data 格式上传文件" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "未收到上传文件" }, 400);
  const kindRaw = String(form.get("kind") ?? "image");
  const kind = kindRaw === "attachment" ? "attachment" : "image";

  const buf = new Uint8Array(await file.arrayBuffer());
  const verdict = validateUpload({ filename: file.name, size: file.size, buf, kind, maxBytes }, sniffMime);
  if (!verdict.ok) return json({ error: verdict.error }, verdict.status);

  const key = storageKey(file.name);
  let data: Uint8Array = buf;
  let mime = verdict.mime;
  if (verdict.ext === "svg") {
    const cleaned = sanitizeSvg(new TextDecoder().decode(buf));
    data = new TextEncoder().encode(cleaned);
    mime = "image/svg+xml";
  }
  // Never trust the client-declared file.type: unsigned content (no magic
  // bytes) gets application/octet-stream so the browser downloads it instead
  // of rendering attacker-supplied HTML/SVG from the media origin.
  const contentType = mime || "application/octet-stream";

  const stored = await putFile(locals, request, key, data, contentType);

  const [row] = await db
    .insert(wpPosts)
    .values({
      postAuthor: user.id,
      postTitle: file.name.replace(/[^a-zA-Z0-9._-]/g, "_"),
      postName: key,
      guid: stored.url,
      postStatus: "inherit",
      postType: "attachment",
      postMimeType: contentType,
      postDate: nowStamp(),
      postModified: nowStamp(),
    })
    .returning({ id: wpPosts.id });

  await db.insert(wpPostmeta).values({ postId: row.id, metaKey: "_wp_attached_file", metaValue: key });
  const alt = String(form.get("alt") ?? "");
  if (alt) {
    await db.insert(wpPostmeta).values({ postId: row.id, metaKey: "_wp_attachment_image_alt", metaValue: alt });
  }

  return json({ id: row.id, url: stored.url, filename: key }, 201);
};