import type { APIRoute } from "astro";
import scriptSource from "../scripts/panel.js?raw";

/** Serves the Language panel injector (injected into admin pages by admin-middleware). */
export const GET: APIRoute = async () =>
  new Response(scriptSource, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
