import type { MiddlewareHandler } from "astro";
import { mightContainRemoteImages, mirrorSavedPost } from "./lib/mirror";

const PUT_POST_RE = /^\/api\/posts\/\d+$/;

interface SavePayload {
  content?: unknown;
  excerpt?: unknown;
  id?: unknown;
}

/**
 * Post middleware with two jobs:
 *
 *  1. Intercept the stock save endpoints (POST /api/posts, PUT /api/posts/:id).
 *     The stock handler runs unchanged; after it succeeds, remote images in the
 *     submitted content are sideloaded and the saved row is rewritten in place.
 *     Counts are reported back on the response via X-Ap-Mirrored /
 *     X-Ap-Mirror-Failed headers for the injected editor script.
 *
 *  2. Inject /api/ap-mirror/image-mirror.js into admin HTML pages so the
 *     editor view refreshes itself with the rewritten content after saving.
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const { request, locals } = ctx;
  const path = ctx.url.pathname;
  const db = (locals as { db?: unknown }).db;

  const isCreate = request.method === "POST" && path === "/api/posts";
  const isUpdate = request.method === "PUT" && PUT_POST_RE.test(path);

  if ((isCreate || isUpdate) && db) {
    let payload: SavePayload | null = null;
    try {
      payload = (await request.clone().json()) as SavePayload;
    } catch {
      payload = null;
    }

    const content = typeof payload?.content === "string" ? payload.content : "";
    const excerpt = typeof payload?.excerpt === "string" ? payload.excerpt : "";

    if (payload && mightContainRemoteImages(content, excerpt)) {
      const res = await next();
      if (!res.ok) return res;

      try {
        let postId: number;
        if (isUpdate) {
          postId = Number(path.split("/").pop());
        } else {
          const data = (await res.clone().json()) as { id?: unknown };
          postId = Number(data?.id);
        }

        if (Number.isFinite(postId) && postId > 0) {
          const result = await mirrorSavedPost(
            db as Parameters<typeof mirrorSavedPost>[0],
            postId,
            content,
            excerpt,
            request,
            locals
          );

          if (result.mirrored > 0) {
            const headers = new Headers(res.headers);
            headers.set("X-Ap-Mirrored", String(result.mirrored));
            if (result.failed > 0) headers.set("X-Ap-Mirror-Failed", String(result.failed));
            headers.delete("content-length");
            return new Response(res.body, {
              status: res.status,
              statusText: res.statusText,
              headers,
            });
          }
        }
      } catch (err) {
        // Mirroring must never break saving.
        console.error("[image-mirror] post-save mirror failed:", err);
      }

      return res;
    }
  }

  // Script injection for admin HTML pages only — public pages never use it
  // and anonymous visitors would just get a 302 from the auth-walled /api path.
  if (!ctx.url.pathname.startsWith("/admin")) return next();
  const res = await next();
  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  const html = await res.clone().text();
  if (!html.includes("</head>")) return res;

  const injected = html.replace(
    "</head>",
    `<script src="/api/ap-mirror/image-mirror.js" defer></script>\n</head>`
  );
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
