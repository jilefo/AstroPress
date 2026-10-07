export interface SniffResult {
  ext: string;
  mime: string;
}

/**
 * Magic-byte MIME sniffing. Returns null when the format has no reliable
 * signature (e.g. plain text) — callers treat null as "allowed but unverified".
 */
export function sniffMime(buf: Uint8Array): SniffResult | null {
  const b = buf;
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...Array.from(b.slice(start, end)));

  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return { ext: "png", mime: "image/png" };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { ext: "jpeg", mime: "image/jpeg" };
  if (b.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a"))
    return { ext: "gif", mime: "image/gif" };
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
    return { ext: "webp", mime: "image/webp" };
  if (b.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12).toLowerCase();
    if (brand.startsWith("avif") || brand.startsWith("avis"))
      return { ext: "avif", mime: "image/avif" };
    return { ext: "mp4", mime: "video/mp4" };
  }
  if (b.length >= 5 && ascii(0, 5) === "%PDF-")
    return { ext: "pdf", mime: "application/pdf" };
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07))
    return { ext: "zip", mime: "application/zip" };
  if (b.length >= 3 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33)
    return { ext: "mp3", mime: "audio/mpeg" };
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0)
    return { ext: "mp3", mime: "audio/mpeg" };
  // Windows PE / Linux ELF executables — recognized so they never fall
  // through to the "no signature" allowance
  if (b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a)
    return { ext: "exe", mime: "application/x-msdownload" };
  if (b.length >= 4 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46)
    return { ext: "elf", mime: "application/x-elf" };
  if (b.length >= 5) {
    const head = ascii(0, 200).trim().toLowerCase();
    if (head.startsWith("<?xml") || head.startsWith("<svg"))
      return { ext: "svg", mime: "image/svg+xml" };
  }
  return null;
}