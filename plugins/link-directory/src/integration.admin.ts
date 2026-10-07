import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function linkDirectoryIntegration(): AstroIntegration {
  return {
    name: "astropress-link-directory",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // 后台管理页：分类 CRUD + 链接 CRUD（内联编辑）+ 设置
        injectRoute({ pattern: "/admin-ext/links", entrypoint: p("admin", "index.astro"), prerender: false });
        // 后台 API：分类 CRUD
        injectRoute({ pattern: "/admin-ext/api/links/cats", entrypoint: p("admin", "api", "cats.ts"), prerender: false });
        // 后台 API：链接 CRUD + 设置读写
        injectRoute({ pattern: "/admin-ext/api/links", entrypoint: p("admin", "api", "links.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/links/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        // 公开：网站目录页 + 跳转计数
        injectRoute({ pattern: "/directory", entrypoint: p("routes", "directory.astro"), prerender: false });
        injectRoute({ pattern: "/ap-links/click", entrypoint: p("routes", "click.ts"), prerender: false });
        // 后台侧边栏顶级菜单
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
