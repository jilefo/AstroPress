import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function dbConsoleIntegration(): AstroIntegration {
  return {
    name: "astropress-db-console",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // Adminer 风格后台页
        injectRoute({
          pattern: "/admin-ext/db-console",
          entrypoint: p("admin", "index.astro"),
          prerender: false,
        });
        // 表/视图列表
        injectRoute({
          pattern: "/admin-ext/api/db-console/tables",
          entrypoint: p("admin", "api", "tables.ts"),
          prerender: false,
        });
        // 浏览数据
        injectRoute({
          pattern: "/admin-ext/api/db-console/browse",
          entrypoint: p("admin", "api", "browse.ts"),
          prerender: false,
        });
        // 表结构
        injectRoute({
          pattern: "/admin-ext/api/db-console/structure",
          entrypoint: p("admin", "api", "structure.ts"),
          prerender: false,
        });
        // SQL 执行
        injectRoute({
          pattern: "/admin-ext/api/db-console/exec",
          entrypoint: p("admin", "api", "exec.ts"),
          prerender: false,
        });
        // 单元格行内编辑
        injectRoute({
          pattern: "/admin-ext/api/db-console/update",
          entrypoint: p("admin", "api", "update.ts"),
          prerender: false,
        });
        // 导出 CSV / SQL
        injectRoute({
          pattern: "/admin-ext/api/db-console/export",
          entrypoint: p("admin", "api", "export.ts"),
          prerender: false,
        });
        // 后台侧边栏注入
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
