import type { APIRoute } from "astro";
import switcherSource from "../../scripts/switcher.js?raw";

/** Serves the language switcher script (injected into pages by middleware). */
export const GET: APIRoute = async () =>
  new Response(switcherSource, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });