import { definePlugin } from "@astropress/core";

/**
 * Media AV — audio/video support for the classic editor.
 * Adds 「音频」「视频」 toolbar buttons (upload with progress, or insert
 * from URL) and a hardened, MIME-sniffed upload endpoint with independent
 * size limit (AP_AV_MAX_MB, default 100MB).
 * Zero modification to core editor source.
 */
export default definePlugin({
  name: "media-av",
  version: "0.1.0",
  description:
    "Audio/video upload & insert for the editor: mp3/wav/m4a/aac/ogg/flac + mp4/webm/mov/m4v/ogv, magic-byte sniffing, upload progress, insert from URL.",
  register() {
    // All wiring is done by ./integration.admin (injectRoute + post middleware).
  },
});
