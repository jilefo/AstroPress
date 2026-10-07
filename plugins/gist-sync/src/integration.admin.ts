import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function gistSyncIntegration(): AstroIntegration {
  return {
    name: "astropress-gist-sync",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // 后台 Gist 同步页
        injectRoute({ pattern: "/admin-ext/gist-sync", entrypoint: p("admin", "index.astro"), prerender: false });
        // 设置读写（token 掩码回显）
        injectRoute({ pattern: "/admin-ext/api/gist-sync/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        // 推送配置到 Gist
        injectRoute({ pattern: "/admin-ext/api/gist-sync/push", entrypoint: p("admin", "api", "push.ts"), prerender: false });
        // 从 Gist 恢复配置（merge）
        injectRoute({ pattern: "/admin-ext/api/gist-sync/pull", entrypoint: p("admin", "api", "pull.ts"), prerender: false });
        // 同步历史
        injectRoute({ pattern: "/admin-ext/api/gist-sync/history", entrypoint: p("admin", "api", "history.ts"), prerender: false });
        // 后台侧边栏 Settings 子菜单
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
