import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function twoFactorAuthIntegration(): AstroIntegration {
  return {
    name: "astropress-two-factor-auth",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/two-factor-auth", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/2fa/setup", entrypoint: p("admin", "api", "setup.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/2fa/verify", entrypoint: p("admin", "api", "verify.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/2fa/disable", entrypoint: p("admin", "api", "disable.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/2fa/status", entrypoint: p("admin", "api", "status.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware-login.ts"), order: "pre" });
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
