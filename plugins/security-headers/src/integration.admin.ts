import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function securityHeadersIntegration(): AstroIntegration {
  return {
    name: "astropress-security-headers",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/security-headers", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/security-headers/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        // pre 守卫：必须在所有 post 中间件与路由解码之前拦截非法百分号编码（CF error 1101 防御）
        addMiddleware({ entrypoint: p("middleware-guard.ts"), order: "pre" });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
