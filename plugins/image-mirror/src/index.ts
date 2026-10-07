import { definePlugin } from "@astropress/core";

/**
 * Image Mirror — when a post/page/CPT is saved, external <img src> URLs in the
 * content (e.g. images pasted from another web page) are fetched server-side,
 * stored into the media library (R2 or local public/media), registered as
 * attachments and rewritten to local URLs inside the saved content.
 *
 * Everything is wired through ./integration.admin (injected route + post
 * middleware); no core/editor source file is modified, so AstroPress upgrades
 * stay clean. Deactivating the plugin fully restores stock behaviour.
 */
export default definePlugin({
  name: "image-mirror",
  version: "0.1.0",
  description:
    "Sideload external images on post save: remote <img src> URLs are downloaded, stored in the media library as attachments and rewritten to local URLs. SSRF-guarded, failure-tolerant. Zero core modification.",
  register() {
    // All wiring is done by ./integration.admin (injectRoute + addMiddleware).
  },
});
