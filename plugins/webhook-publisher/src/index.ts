import { definePlugin } from "@astropress/core";

/**
 * Webhook Publisher — exposes a REST API for external systems to publish
 * content to AstroPress. Supports posts, pages, and custom post types.
 *
 * Authentication: API key via `Authorization: Bearer <key>` or `X-API-Key: <key>`.
 * Keys are managed in the admin UI (/admin-ext/webhooks).
 *
 * Endpoints (all under /api/webhook/*, outside the login-walled /api/* zone
 * because they use their own key-based auth):
 *   POST /api/webhook/publish    — create or update a post
 *   POST /api/webhook/delete     — delete a post by ID or slug
 *   GET  /api/webhook/status     — list recent webhook calls
 *   GET  /api/webhook/keys       — list API keys (admin only)
 *   POST /api/webhook/keys       — create a new API key (admin only)
 *   DELETE /api/webhook/keys/:id — revoke a key (admin only)
 *
 * Zero core modification.
 */
export default definePlugin({
  name: "webhook-publisher",
  version: "0.1.0",
  description:
    "REST API / Webhook endpoint for external content publishing. API-key auth, supports posts/pages/CPTs, create/update/delete operations. Zero core modification.",

  register() {
    // No registry side effects — everything lives in the Astro integration.
  },
});
