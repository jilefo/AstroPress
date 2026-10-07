export interface ImageSniff {
  ext: "png" | "jpeg" | "gif" | "webp" | "avif";
  mime: string;
}

/**
 * Magic-byte sniffing restricted to raster web image formats.
 * SVG is deliberately NOT accepted: sideloading remote SVG means storing
 * third-party active content (scripts/handlers) on our own origin.
 * Returns null when the bytes are not a recognized image.
 */
export function sniffImage(buf: Uint8Array): ImageSniff | null {
  const ascii = (start: number, end: number) =>
    String.fromCharCode(...Array.from(buf.slice(start, end)));

  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return { ext: "png", mime: "image/png" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return { ext: "jpeg", mime: "image/jpeg" };
  if (buf.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a"))
    return { ext: "gif", mime: "image/gif" };
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP")
    return { ext: "webp", mime: "image/webp" };
  if (buf.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12).toLowerCase();
    if (brand.startsWith("avif") || brand.startsWith("avis"))
      return { ext: "avif", mime: "image/avif" };
  }
  return null;
}
