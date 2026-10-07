import type { APIRoute } from "astro";
import { resolveLang } from "../../lib/resolve";
import { loadSettings } from "../../lib/settings";

export const GET: APIRoute = async ({ locals, request }) => {
  const db = (locals as any).db;
  const settings = await loadSettings(db);
  const current = resolveLang(request, settings) ?? settings.defaultLang;
  return new Response(
    JSON.stringify({
      defaultLang: settings.defaultLang,
      urlStrategy: settings.urlStrategy,
      current,
      languages: settings.languages.filter((l) => l.enabled),
    }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
  );
};