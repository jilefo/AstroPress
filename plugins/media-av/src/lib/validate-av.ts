export const AUDIO_EXTS = new Set(["mp3", "wav", "m4a", "aac", "ogg", "oga", "flac"]);
export const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "m4v", "ogv"]);

export function extensionOf(filename: string): string {
  return (filename.split(".").pop() ?? "").toLowerCase();
}

export function kindOfExt(ext: string): "audio" | "video" | null {
  if (AUDIO_EXTS.has(ext)) return "audio";
  if (VIDEO_EXTS.has(ext)) return "video";
  return null;
}

export function canonicalExt(ext: string): string {
  // ogg 容器按声明扩展名决定音/视频（嗅探侧已细分 oga/ogv）
  if (ext === "ogg") return "oga";
  return ext;
}

export interface ValidateInput {
  filename: string;
  size: number;
  buf: Uint8Array;
  /** 前端声明的期望类别（来自按钮：audio/video） */
  kind: "audio" | "video";
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

/**
 * 校验：扩展名白名单 + 大小限制 + magic bytes 必须存在且属于同一大类。
 * ogg 系列与 ftyp 系列以嗅探到的具体 ext/mime 为准（允许声明 ext 与嗅探
 * ext 在同大类内等价：.ogg→oga/ogv、.aac 等）。
 */
export function validateAv(
  input: ValidateInput,
  sniff: (b: Uint8Array) => { ext: string; mime: string } | null
): ValidateOk | ValidateFail {
  const ext = canonicalExt(extensionOf(input.filename));
  const extKind = kindOfExt(ext);
  if (!ext || !extKind)
    return { ok: false, status: 415, error: `不允许上传扩展名 .${ext || "(空)"} 的音视频文件` };
  if (extKind !== input.kind)
    return { ok: false, status: 415, error: `文件内容类型不匹配：应为 ${input.kind === "audio" ? "音频" : "视频"}` };
  if (!(input.size > 0 && input.size <= input.maxBytes))
    return { ok: false, status: 413, error: `文件超出 ${Math.round(input.maxBytes / 1024 / 1024)}MB 大小限制` };

  const real = sniff(input.buf);
  if (!real)
    return { ok: false, status: 415, error: "无法识别的音视频内容（缺少文件特征字节）" };
  const realKind = kindOfExt(real.ext);
  if (realKind !== input.kind)
    return { ok: false, status: 415, error: `文件实际内容为 ${real.mime}，与声明的${input.kind === "audio" ? "音频" : "视频"}类型不符` };

  // ext 允许在同大类内不同封装别名（声明 .ogg + 嗅探 oga/ogv 已由 kind 校验兜住）
  return { ok: true, ext: real.ext, mime: real.mime };
}

/** 官方存储 key 约定：{Date.now()}-{sanitized} */
export function storageKey(filename: string): string {
  const clean = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${Date.now()}-${clean}`;
}
