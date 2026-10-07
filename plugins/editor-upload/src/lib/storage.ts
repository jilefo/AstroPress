/**
 * Storage adapter mirroring the official media upload conventions
 * (apps/admin/src/pages/api/media/upload.ts): Cloudflare R2 when the binding
 * exists, otherwise the local public/media directory. S3/OSS/COS are future
 * drivers behind the same putFile() signature.
 */

export interface PutResult {
  key: string;
  url: string;
  storage: "r2" | "local";
}

export async function putFile(
  locals: any,
  request: Request,
  key: string,
  data: Uint8Array,
  contentType: string
): Promise<PutResult> {
  const r2 = (locals as any).runtime?.env?.R2 as { put: (k: string, v: Uint8Array, o?: any) => Promise<unknown> } | undefined;
  if (r2) {
    await r2.put(key, data, { httpMetadata: { contentType } });
    return { key, url: `${mediaBase(request)}/media/${key}`, storage: "r2" };
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const dir = path.join(process.cwd(), "public", "media");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, key), data);
  return { key, url: `${mediaBase(request)}/media/${key}`, storage: "local" };
}

export function mediaBase(request: Request): string {
  return (process.env.MEDIA_BASE_URL ?? new URL(request.url).origin).replace(/\/+$/, "");
}