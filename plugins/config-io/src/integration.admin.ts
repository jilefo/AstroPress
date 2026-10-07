import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function configIoIntegration(): AstroIntegration {
  return {
    name: "astropress-config-io",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // 后台导入导出页
        injectRoute({ pattern: "/admin-ext/config-io", entrypoint: p("admin", "index.astro"), prerender: false });
        // 导出 JSON（登录鉴权 + Content-Disposition attachment）
        injectRoute({ pattern: "/admin-ext/api/config-io/export", entrypoint: p("admin", "api", "export.ts"), prerender: false });
        // 导入 JSON（multipart，merge/replace）
        injectRoute({ pattern: "/admin-ext/api/config-io/import", entrypoint: p("admin", "api", "import.ts"), prerender: false });
        // 后台侧边栏 Settings 子菜单
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
