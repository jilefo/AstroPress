import { wpPostmeta, wpPosts } from "@astropress/core/schema";
import type { APIRoute } from "astro";
import { sniffAv } from "../../lib/sniff-av";
import { putFile } from "../../lib/storage";
import { storageKey, validateAv } from "../../lib/validate-av";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function nowStamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/**
 * POST /api/ap-media-av/upload
 * multipart: file=<audio|video>, kind=audio|video
 * 独立 100MB 上限（AP_AV_MAX_MB）；magic-byte 嗅探，拒绝一切非音视频内容。
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const db = (locals as any).db;
  const user = (locals as any).user;
  if (!db || !user) return json({ error: "未登录或登录已过期" }, 401);

  const origin = request.headers.get("origin");
  if (origin && new URL(request.url).origin !== origin) return json({ error: "请求来源校验失败（CSRF）" }, 403);

  const maxBytes = Number(process.env.AP_AV_MAX_MB ?? 100) * 1024 * 1024;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "请以 multipart/form-data 格式上传文件" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "未收到上传文件" }, 400);
  const kindRaw = String(form.get("kind") ?? "");
  if (kindRaw !== "audio" && kindRaw !== "video")
    return json({ error: "kind 必须是 audio 或 video" }, 400);

  const buf = new Uint8Array(await file.arrayBuffer());
  const verdict = validateAv({ filename: file.name, size: file.size, buf, kind: kindRaw, maxBytes }, sniffAv);
  if (!verdict.ok) return json({ error: verdict.error }, verdict.status);

  const key = storageKey(file.name);
  // 永远以嗅探到的 MIME 为准，防止伪造扩展名诱导浏览器当 HTML 渲染
  const contentType = verdict.mime;

  const stored = await putFile(locals, request, key, buf, contentType);

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

  return json({ id: row.id, url: stored.url, filename: key, mime: contentType }, 201);
};
