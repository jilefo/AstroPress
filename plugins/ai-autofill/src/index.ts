import { definePlugin } from "@astropress/core";

/**
 * AI Autofill — one-click (and auto-on-publish) generation of excerpt, tags,
 * SEO title, meta description and focus keyword from the post title+content.
 * Uses the site's configured AI provider (Settings → AI) via the same option
 * the core AI assistant reads. Zero core modification.
 */
export default definePlugin({
  name: "ai-autofill",
  version: "0.1.0",
  description:
    "AI auto-fill for Excerpt / Tags / SEO Title / Meta Description / Focus Keyword. Manual button + auto-fill empty fields on publish. Zero core modification.",

  register() {
    // No registry side effects — everything lives in the Astro integration.
  },
});
