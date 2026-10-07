import { getSiteInfo } from "@astropress/core/query";
import type { APIRoute } from "astro";
import { loadSettings } from "../lib/settings";

export const GET: APIRoute = async ({ locals }) => {
  const db = (locals as any).db;
  if (!db) return new Response("服务器错误", { status: 500 });

  const s = await loadSettings(db);
  const siteUrl = (await getSiteInfo(db)).url.replace(/\/+$/, "");

  const extra = s.robotsExtra.trim();
  const extraLines = extra ? "\n" + extra.split("\n").map((l) => l.trim()).filter(Boolean).join("\n") : "";

  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin-ext
Disallow: /api
Disallow: /login${extraLines}
Sitemap: ${siteUrl}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
