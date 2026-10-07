/**
 * Storage adapter identical in convention to the stock media endpoint and to
 * plugin-editor-upload: Cloudflare R2 when the binding exists, otherwise the
 * local public/media directory. A duplicated copy is intentional — plugins
 * must not import each other's private internals.
 */

export interface PutResult {
  key: string;
  url: string;
  storage: "r2" | "local";
}

export async function putFile(
  locals: unknown,
  request: Request,
  key: string,
  data: Uint8Array,
  contentType: string
): Promise<PutResult> {
  const r2 = (locals as { runtime?: { env?: { R2?: { put: (k: string, v: Uint8Array, o?: unknown) => Promise<unknown> } } } })
    .runtime?.env?.R2;
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
