import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
/** injectRoute/addMiddleware entrypoints resolve relative to the user project
 *  root, so plugin files must be referenced by absolute path. */
const p = (...s: string[]) => join(pkgDir, ...s);

/**
 * Web-side integration: public config/strings APIs, multilingual sitemap,
 * the /ml/** translation renderer and the head-injection middleware.
 * Zero core files are modified — everything is injected via official
 * Astro Integration APIs.
 */
export default function multilingualIntegration(): AstroIntegration {
  return {
    name: "astropress-multilingual",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // Public endpoints deliberately live OUTSIDE /api/* — the stock admin
        // middleware requires a session for every /api path, which would put
        // the switcher script/config behind the login wall for anonymous
        // visitors. /ml-asset/* avoids the /ml/** renderer route.
        injectRoute({ pattern: "/ml-asset/config", entrypoint: p("routes", "api", "config.ts"), prerender: false });
        injectRoute({ pattern: "/ml-asset/switcher.js", entrypoint: p("routes", "api", "switcher.js.ts"), prerender: false });
        // /sitemap.xml 由专用 sitemap 插件统一提供（含 lastmod/priority/缓存头与 hreflang 支持），
        // 避免两个插件注册同一路由导致先注册者（本插件）覆盖功能更全的实现。
        injectRoute({ pattern: "/ml/[...path]", entrypoint: p("routes", "page", "ml.astro"), prerender: false });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
