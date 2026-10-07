import type { APIRoute } from "astro";
import scriptSource from "../../scripts/editor-tools.js?raw";

/** Serves the editor toolbar enhancement script (injected by middleware). */
export const GET: APIRoute = async () =>
  new Response(scriptSource, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
