import { definePlugin } from "@astropress/core";

/**
 * Admin UI i18n — translates the admin interface via a client-side DOM
 * text-node replacer backed by a built-in zh-CN dictionary, with an n8n
 * webhook as the fallback translation backend for uncovered strings.
 *
 * The heavy lifting lives in the Astro integration (./integration.admin):
 * script injection middleware, /api/ap-i18n/* endpoints and an
 * /admin-ext/i18n management page. No core file is modified.
 */
export default definePlugin({
  name: "admin-i18n",
  version: "0.1.0",
  description:
    "Translates the admin interface (built-in zh-CN dictionary + n8n webhook fallback for uncovered strings, cached in localStorage). Zero core modification.",

  register() {
    // No CPT/panel registration — translation is wired purely through the
    // Astro integration (script injection + /admin-ext/i18n page).
  },
});
