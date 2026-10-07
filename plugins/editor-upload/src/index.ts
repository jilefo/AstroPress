import { definePlugin } from "@astropress/core";

/**
 * Editor Media Upload — enhances the classic block editor with drag & drop,
 * paste upload, a media modal and a hardened upload endpoint.
 * All editor enhancements are DOM-event based via an injected script —
 * BlockEditor/ThemeEditor source files are never touched and deactivating
 * the plugin fully restores stock behaviour.
 */
export default definePlugin({
  name: "editor-upload",
  version: "0.1.0",
  description:
    "Editor upload enhancements: drag & drop, paste, multi-file with progress, media modal, hardened upload endpoint (MIME sniffing, extension whitelist, SVG sanitizing). Zero core modification.",
  register() {
    // All wiring is done by ./integration.admin (injectRoute + injectScript).
  },
});