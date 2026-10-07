import type { APIRoute } from "astro";
import scriptSource from "../../scripts/image-mirror.js?raw";

/** Serves the Image Mirror editor script (injected into admin pages by middleware). */
export const GET: APIRoute = async () =>
  new Response(scriptSource, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
