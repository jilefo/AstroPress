/**
 * Plugin bootstrap — imported once in middleware.
 * Add new plugins here to register them with the system.
 *
 * ## Adding AI actions from a plugin
 *
 * Plugins can extend the AI assistant by registering custom actions.
 * Actions appear automatically in the AI system prompt and can be triggered
 * by the floating AI widget from any admin page.
 *
 * ```ts
 * import { registerAIAction } from "../lib/ai-registry";
 *
 * registerAIAction({
 *   type: "myPlugin:doSomething",
 *   description: "What this action does — shown to the AI",
 *   example: '{"type":"myPlugin:doSomething","param":"value"}',
 *   serverSide: true,
 *   handler: async (params, db, userId) => {
 *     // perform the action using db
 *     return { success: true, message: "Done.", navigate: "/admin/..." };
 *   },
 * });
 * ```
 *
 * Call registerAIAction() at module load time (top-level or in bootstrapPlugins).
 * The execute endpoint imports ai-actions.ts which must import your plugin file
 * for the action to be available server-side.
 */
import { loadPlugin } from "@astropress/core";
import seoPlugin from "@astropress/plugin-seo";
import adsManagerPlugin from "@astropress/plugin-ads-manager";
import editorUploadPlugin from "@astropress/plugin-editor-upload";
import editorToolsPlugin from "@astropress/plugin-editor-tools";
import imageMirrorPlugin from "@astropress/plugin-image-mirror";
import multilingualPlugin from "@astropress/plugin-multilingual";
import adminI18nPlugin from "@astropress/plugin-admin-i18n";
import aiChatPlugin from "@astropress/plugin-ai-chat";
import aiAutofillPlugin from "@astropress/plugin-ai-autofill";
import webhookPublisherPlugin from "@astropress/plugin-webhook-publisher";
import relatedPostsPlugin from "@astropress/plugin-related-posts";
import seoToolsPlugin from "@astropress/plugin-seo-tools";
import searchPlugin from "@astropress/plugin-search";
import redirectPlugin from "@astropress/plugin-redirect";
import pluginManagerPlugin from "@astropress/plugin-manager";
import commentsPlugin from "@astropress/plugin-comments";
import dbConsolePlugin from "@astropress/plugin-db-console";
import backupPlugin from "@astropress/plugin-backup";
import fileManagerPlugin from "@astropress/plugin-file-manager";
import linkDirectoryPlugin from "@astropress/plugin-link-directory";
import configIoPlugin from "@astropress/plugin-config-io";
import mediaAvPlugin from "@astropress/plugin-media-av";
import wpEditorPlugin from "@astropress/plugin-wp-editor";
import webdavPlugin from "@astropress/plugin-webdav";
import gistSyncPlugin from "@astropress/plugin-gist-sync";
import gitSyncPlugin from "@astropress/plugin-git-sync";
import permalinkPlugin from "@astropress/plugin-permalink";
import sitemapPlugin from "@astropress/plugin-sitemap";
import sharePlugin from "@astropress/plugin-share";
import customerServicePlugin from "@astropress/plugin-customer-service";
import footerPlugin from "@astropress/plugin-footer";
import donationPlugin from "@astropress/plugin-donation";
import staticHtmlPlugin from "@astropress/plugin-static-html";
import gitalkCommentPlugin from "@astropress/plugin-gitalk-comment";
import securityHeadersPlugin from "@astropress/plugin-security-headers";
import pageCachePlugin from "@astropress/plugin-page-cache";
import imageLazyPlugin from "@astropress/plugin-image-lazy";
import htmlOptPlugin from "@astropress/plugin-html-opt";
import errorMonitorPlugin from "@astropress/plugin-error-monitor";
import dbOptimizePlugin from "@astropress/plugin-db-optimize";
import assetCachePlugin from "@astropress/plugin-asset-cache";
import maintenanceModePlugin from "@astropress/plugin-maintenance-mode";
import rateLimitPlugin from "@astropress/plugin-rate-limit";
import activityLogPlugin from "@astropress/plugin-activity-log";
import revisionsPlugin from "@astropress/plugin-revisions";
import cacheWarmerPlugin from "@astropress/plugin-cache-warmer";
import userRolesPlugin from "@astropress/plugin-user-roles";
import dashboardWidgetsPlugin from "@astropress/plugin-dashboard-widgets";
import notificationCenterPlugin from "@astropress/plugin-notification-center";
import mediaFoldersPlugin from "@astropress/plugin-media-folders";
import twoFactorAuthPlugin from "@astropress/plugin-two-factor-auth";
import themeSlotSyncPlugin from "@astropress/plugin-theme-slot-sync";

let bootstrapped = false;

export function bootstrapPlugins(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  loadPlugin(seoPlugin);
  loadPlugin(adsManagerPlugin);
  loadPlugin(editorUploadPlugin);
  loadPlugin(editorToolsPlugin);
  loadPlugin(imageMirrorPlugin);
  loadPlugin(multilingualPlugin);
  loadPlugin(adminI18nPlugin);
  loadPlugin(aiChatPlugin);
  loadPlugin(aiAutofillPlugin);
  loadPlugin(webhookPublisherPlugin);
  loadPlugin(relatedPostsPlugin);
  loadPlugin(seoToolsPlugin);
  loadPlugin(searchPlugin);
  loadPlugin(redirectPlugin);
  loadPlugin(commentsPlugin);
  loadPlugin(dbConsolePlugin);
  loadPlugin(backupPlugin);
  loadPlugin(linkDirectoryPlugin);
  loadPlugin(configIoPlugin);
  loadPlugin(mediaAvPlugin);
  loadPlugin(wpEditorPlugin);
  loadPlugin(fileManagerPlugin);
  loadPlugin(webdavPlugin);
  loadPlugin(gistSyncPlugin);
  loadPlugin(gitSyncPlugin);
  loadPlugin(permalinkPlugin);
  loadPlugin(sitemapPlugin);
  loadPlugin(sharePlugin);
  loadPlugin(customerServicePlugin);
  loadPlugin(footerPlugin);
  loadPlugin(donationPlugin);
  loadPlugin(staticHtmlPlugin);
  loadPlugin(gitalkCommentPlugin);
  loadPlugin(securityHeadersPlugin);
  loadPlugin(pageCachePlugin);
  loadPlugin(imageLazyPlugin);
  loadPlugin(htmlOptPlugin);
  loadPlugin(errorMonitorPlugin);
  loadPlugin(dbOptimizePlugin);
  loadPlugin(assetCachePlugin);
  loadPlugin(maintenanceModePlugin);
  loadPlugin(rateLimitPlugin);
  loadPlugin(activityLogPlugin);
  loadPlugin(revisionsPlugin);
  loadPlugin(cacheWarmerPlugin);
  loadPlugin(userRolesPlugin);
  loadPlugin(dashboardWidgetsPlugin);
  loadPlugin(notificationCenterPlugin);
  loadPlugin(mediaFoldersPlugin);
  loadPlugin(twoFactorAuthPlugin);
  loadPlugin(themeSlotSyncPlugin);
  loadPlugin(pluginManagerPlugin);

  // To add AI actions from a plugin, call registerAIAction() here or in the
  // plugin's own module and import it above.
}
