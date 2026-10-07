import { definePlugin, registerPostType } from "@astropress/core";
import { ensureAdsInstalled } from "./install";

/**
 * Ads Manager — AstroPress plugin manifest.
 * Runtime wiring happens in the Astro integrations:
 *   ./integration        → web (slot rendering middleware + tracking API)
 *   ./integration.admin  → admin (slot management UI under /admin-ext)
 */
export default definePlugin({
  name: "ads-manager",
  version: "0.1.0",
  description:
    "Ad slot management with scheduling, language/device/path targeting, weighted A/B rotation, impression & click tracking. Zero core modification.",

  register() {
    // Registry side (mirrors the data-driven install; AdminLayout itself
    // reads wp_options.astropress_custom_post_types — see install.ts).
    registerPostType("ap_ad", {
      label: "Ad",
      pluralLabel: "Ads Manager",
      icon: "megaphone",
      public: false,
      showInMenu: true,
      supports: ["title", "editor", "custom-fields"],
      custom: true,
    });
  },
});

export { ensureAdsInstalled };
