import { definePlugin, registerSidebarPanel } from "@astropress/core";

/**
 * AstroPress plugin manifest. The heavy lifting lives in the Astro
 * integrations (./integration for web, ./integration.admin for admin);
 * this manifest keeps the plugin visible in the AstroPress plugin system.
 */
export default definePlugin({
  name: "multilingual",
  version: "0.1.0",
  description:
    "Multilingual content: per-language posts linked in translation groups, hreflang/canonical/sitemap injection, switcher and string bundles. Zero core modification.",
  register() {
    registerSidebarPanel("multilingual", {
      id: "multilingual",
      title: "Language",
      // Empty array = every post type (registry treats [] as "no restriction"),
      // so page and custom post type editors get the panel too. The links API
      // and the /ml renderer are post-id based and type-agnostic.
      postTypes: [],
      componentId: "MultilingualPanel",
    });
  },
});