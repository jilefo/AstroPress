/**
 * Magic-byte sniffing for audio/video containers.
 * Returns {ext, mime} when a recognizable AV signature is present,
 * otherwise null. ftyp-family brands are disambiguated by brand string.
 */
export interface SniffResult {
  ext: string;
  mime: string;
}

export function sniffAv(buf: Uint8Array): SniffResult | null {
  const b = buf;
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...Array.from(b.slice(start, end)));
  const head = (n: number) => ascii(0, Math.min(n, b.length));
  const headLower = (n: number) => head(n).toLowerCase();

  // ── 音频 ──────────────────────────────────────────────────────
  // MP3: ID3 header
  if (b.length >= 3 && ascii(0, 3) === "ID3")
    return { ext: "mp3", mime: "audio/mpeg" };
  // MP3 frame sync: 11 set bits (0xFFE). Must precede ADTS check below.
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0)
    return { ext: "mp3", mime: "audio/mpeg" };
  // AAC ADTS: 12 set bits (0xFFF) + layer bits 00: 1111 00xx (MPEG-4) / 1111 10xx (MPEG-2)
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0)
    return { ext: "aac", mime: "audio/aac" };
  // FLAC: "fLaC"
  if (b.length >= 4 && ascii(0, 4) === "fLaC")
    return { ext: "flac", mime: "audio/flac" };
  // WAV: RIFF....WAVE
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE")
    return { ext: "wav", mime: "audio/wav" };

  // Ogg: capture pattern "OggS" → codec 由首个 bos 页的 codec 标识区分音/视频
  if (b.length >= 4 && ascii(0, 4) === "OggS") {
    const h = headLower(8192);
    if (h.includes("theora")) return { ext: "ogv", mime: "video/ogg" };
    // vorbis / Opus 都是纯音频
    return { ext: "oga", mime: "audio/ogg" };
  }

  // ── 视频 / ISO-BMFF 系列（ftyp brand 细分）────────────────────
  if (b.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12).toLowerCase();
    if (brand === "qt  ") return { ext: "mov", mime: "video/quicktime" };
    if (brand.startsWith("m4v")) return { ext: "m4v", mime: "video/x-m4v" };
    if (brand.startsWith("m4a") || brand.startsWith("m4b"))
      return { ext: "m4a", mime: "audio/mp4" };
    // isom/iso2/mp41/mp42/avc1/dash/msnv… 统一按 mp4
    return { ext: "mp4", mime: "video/mp4" };
  }

  // Matroska / WebM: EBML 0x1A45DFA3，按 DocType 区分
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    const h = headLower(8192);
    if (h.includes("matroska")) return { ext: "mkv", mime: "video/x-matroska" };
    return { ext: "webm", mime: "video/webm" };
  }

  return null;
}
