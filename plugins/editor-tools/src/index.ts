import { definePlugin } from "@astropress/core";

/**
 * Editor Tools — toolbar buttons injected next to the core editor:
 *   排版  one-click auto-format (empty-line cleanup, CJK↔Latin spacing,
 *         half→full-width punctuation around CJK)
 *   互译  one-click translate the editor content between Chinese and
 *         English (auto direction detection), using the site's configured
 *         AI provider (Settings → AI). Tags are preserved.
 *
 * Zero core modification — the script activates around
 * `.ap-wysiwyg-editor` and locates the toolbar by DOM position.
 */
export default definePlugin({
  name: "editor-tools",
  version: "0.1.0",
  description:
    "Editor toolbar tools: one-click auto-format (CJK spacing/punctuation, empty-line cleanup) and Chinese↔English content translation via the site's AI provider. Zero core modification.",

  register() {
    // No registry side effects — everything lives in the Astro integration.
  },
});
