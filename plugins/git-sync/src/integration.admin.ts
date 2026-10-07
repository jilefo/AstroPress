import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function gitSyncIntegration(): AstroIntegration {
  return {
    name: "astropress-git-sync",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // Git 同步管理页
        injectRoute({
          pattern: "/admin-ext/git-sync",
          entrypoint: p("admin", "index.astro"),
          prerender: false,
        });
        // 设置读取 / 保存
        injectRoute({
          pattern: "/admin-ext/api/git-sync/settings",
          entrypoint: p("admin", "api", "settings.ts"),
          prerender: false,
        });
        // 测试连接
        injectRoute({
          pattern: "/admin-ext/api/git-sync/test",
          entrypoint: p("admin", "api", "test.ts"),
          prerender: false,
        });
        // 立即同步
        injectRoute({
          pattern: "/admin-ext/api/git-sync/sync",
          entrypoint: p("admin", "api", "sync.ts"),
          prerender: false,
        });
        // 同步历史
        injectRoute({
          pattern: "/admin-ext/api/git-sync/history",
          entrypoint: p("admin", "api", "history.ts"),
          prerender: false,
        });
        // 后台侧边栏注入
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
