import type { APIRoute } from "astro";

// Proxy media files from the admin server.
// In dev, media is stored in apps/admin/public/media/ served at localhost:4321.
// In production, set MEDIA_BASE_URL to the R2 public URL or CDN origin.
const MEDIA_BASE = (import.meta.env.MEDIA_BASE_URL ?? "http://localhost:4321").replace(/\/$/, "");

export const GET: APIRoute = async ({ params }) => {
  const path = params.path ?? "";
  const upstream = `${MEDIA_BASE}/media/${path}`;

  try {
    const res = await fetch(upstream);
    if (!res.ok) return new Response("文件不存在", { status: 404 });

    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    const body = await res.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("文件不存在", { status: 404 });
  }
};
