import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function themeSlotSyncIntegration(): AstroIntegration {
  return {
    name: "astropress-theme-slot-sync",
    hooks: {
      "astro:config:setup": ({ addMiddleware }) => {
        // post 中间件：主题激活 API 响应后自动同步模板槽位
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
