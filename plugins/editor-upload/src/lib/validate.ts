export const EXT_WHITELIST = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "avif",
  "pdf", "mp4", "mp3", "zip", "txt", "csv", "docx", "xlsx",
]);

export const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"]);

export function extensionOf(filename: string): string {
  return (filename.split(".").pop() ?? "").toLowerCase();
}

export function sizeOk(bytes: number, maxBytes: number): boolean {
  return bytes > 0 && bytes <= maxBytes;
}

export interface ValidateInput {
  filename: string;
  size: number;
  buf: Uint8Array;
  kind: "image" | "attachment";
  maxBytes: number;
}

export interface ValidateOk {
  ok: true;
  ext: string;
  mime: string;
}
export interface ValidateFail {
  ok: false;
  status: number;
  error: string;
}

export function validateUpload(input: ValidateInput, sniffMime: (b: Uint8Array) => { ext: string; mime: string } | null): ValidateOk | ValidateFail {
  const ext = extensionOf(input.filename);
  if (!ext || !EXT_WHITELIST.has(ext))
    return { ok: false, status: 415, error: `不允许上传扩展名 .${ext || "(空)"} 的文件` };
  if (!sizeOk(input.size, input.maxBytes))
    return { ok: false, status: 413, error: `文件超出 ${Math.round(input.maxBytes / 1024 / 1024)}MB 大小限制` };

  const real = sniffMime(input.buf);
  if (real) {
    // Office files are zip containers — magic says "zip", that is expected.
    const containerOk = (ext === "docx" || ext === "xlsx") && real.ext === "zip";
    const extOk = real.ext === ext || (ext === "jpg" && real.ext === "jpeg");
    if (!extOk && !containerOk) {
      return { ok: false, status: 415, error: `文件实际内容为 ${real.mime}，与扩展名 .${ext} 不符` };
    }
    if (input.kind === "image" && !real.mime.startsWith("image/"))
      return { ok: false, status: 415, error: `该文件不是图片（实际内容为 ${real.mime}）` };
    return { ok: true, ext, mime: real.mime };
  }

  // No signature: plain text (txt/csv) passes for attachments only.
  // Every image format has a recognizable signature (incl. text-based SVG),
  // so an unsigned "image" is by definition not an image.
  if (input.kind === "image")
    return { ok: false, status: 415, error: "无法识别为图片（缺少图片特征字节）" };
  return { ok: true, ext, mime: "" };
}

/** Official storage key convention: {Date.now()}-{sanitized name} (upload.ts:18-19). */
export function storageKey(filename: string): string {
  const clean = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${Date.now()}-${clean}`;
}