import type { APIRoute } from "astro";
import scriptSource from "../../scripts/admin-i18n.js?raw";
import { DICTIONARY } from "../../lib/dictionary";
import { effectiveWebhook, loadSettings } from "../../lib/settings";

/**
 * Serves the i18n client engine with the built-in dictionary and current
 * settings embedded (no-store so settings changes take effect on reload).
 */
export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  const settings = await loadSettings(db);
  const cfg = {
    enabled: settings.enabled,
    target: settings.target,
    configured: Boolean(effectiveWebhook(settings)),
  };
  const bootstrap =
    `window.__AP_I18N_DICT__=${JSON.stringify(DICTIONARY)};` +
    `window.__AP_I18N_CFG__=${JSON.stringify(cfg)};\n`;
  return new Response(bootstrap + scriptSource, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
