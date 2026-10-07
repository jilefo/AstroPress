import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

/**
 * Admin-side integration:
 *   /api/ap-media-av/upload         → 音视频上传（独立大小限制 + MIME 嗅探）
 *   /api/ap-media-av/media-av.js    → 编辑器增强脚本（post 中间件注入）
 */
export default function mediaAvAdminIntegration(): AstroIntegration {
  return {
    name: "astropress-media-av",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/api/ap-media-av/upload", entrypoint: p("routes", "api", "upload.ts"), prerender: false });
        injectRoute({ pattern: "/api/ap-media-av/media-av.js", entrypoint: p("routes", "api", "media-av.js.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
