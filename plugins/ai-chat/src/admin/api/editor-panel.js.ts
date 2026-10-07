import type { APIRoute } from "astro";
import scriptSource from "../../scripts/editor-panel.js?raw";

/** Serves the editor-side AI assistant panel script (injected into /admin/posts pages by middleware). */
export const GET: APIRoute = async () =>
  new Response(scriptSource, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
