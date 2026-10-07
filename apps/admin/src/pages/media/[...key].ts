import type { APIRoute } from "astro";

/**
 * 媒体文件公开访问：Cloudflare 走 R2，本地 dev 由 Node fs 提供 public/media。
 *
 * 安全（F-T8-12）：key 来自 [...rest]，%2F 会被解码成路径分隔符，
 * 必须做段白名单 + 解析后目录包含校验，杜绝 .. 穿越任意读文件（如 local.db）。
 */
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

function isSafeKey(key: string): boolean {
  if (!key || key.includes("\\")) return false;
  const segs = key.split("/");
  return segs.length > 0 && segs.every((s) => s.length > 0 && s !== "." && s !== ".." && SEGMENT_RE.test(s));
}

// Serves media files from R2 on Cloudflare, or redirects to the static
// public/media/ directory on local dev (Astro serves it as a static asset).
export const GET: APIRoute = async ({ params, locals }) => {
  const key = params.key as string;
  if (!key || !isSafeKey(key)) return new Response("文件不存在", { status: 404 });

  const r2 = (locals as any).runtime?.env?.R2 as R2Bucket | undefined;

  if (r2) {
    const obj = await r2.get(key);
    if (!obj) return new Response("文件不存在", { status: 404 });

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("cache-control", "public, max-age=31536000, immutable");

    return new Response(obj.body as BodyInit, { headers });
  }

  // Local dev: static files live in public/media/ — serve via Node fs
  try {
    const { readFile } = await import("node:fs/promises");
    const { join, resolve, sep } = await import("node:path");
    const mediaRoot = resolve(process.cwd(), "public", "media");
    const filePath = resolve(join(mediaRoot, key));
    // 二次兜底：符号链接/异常解析后仍必须位于 mediaRoot 之内
    if (filePath !== mediaRoot && !filePath.startsWith(mediaRoot + sep)) {
      return new Response("文件不存在", { status: 404 });
    }
    const buffer = await readFile(filePath);
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    const mime: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
      pdf: "application/pdf", mp4: "video/mp4", mp3: "audio/mpeg",
    };
    return new Response(buffer, {
      headers: { "content-type": mime[ext] ?? "application/octet-stream" },
    });
  } catch {
    return new Response("文件不存在", { status: 404 });
  }
};
