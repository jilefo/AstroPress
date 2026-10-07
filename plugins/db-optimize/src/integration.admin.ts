import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function dbOptimizeIntegration(): AstroIntegration {
  return {
    name: "astropress-db-optimize",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // 后台管理页
        injectRoute({
          pattern: "/admin-ext/db-optimize",
          entrypoint: p("admin", "index.astro"),
          prerender: false,
        });
        // 统计信息
        injectRoute({
          pattern: "/admin-ext/api/db-opt/stats",
          entrypoint: p("admin", "api", "stats.ts"),
          prerender: false,
        });
        // 执行优化操作
        injectRoute({
          pattern: "/admin-ext/api/db-opt/run",
          entrypoint: p("admin", "api", "run.ts"),
          prerender: false,
        });
        // 后台侧边栏注入（本插件无前台中间件）
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
