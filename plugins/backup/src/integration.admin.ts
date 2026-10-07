import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function backupIntegration(): AstroIntegration {
  return {
    name: "astropress-backup",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // 备份管理页
        injectRoute({
          pattern: "/admin-ext/backup",
          entrypoint: p("admin", "index.astro"),
          prerender: false,
        });
        // 备份列表
        injectRoute({
          pattern: "/admin-ext/api/backup/list",
          entrypoint: p("admin", "api", "list.ts"),
          prerender: false,
        });
        // 创建备份
        injectRoute({
          pattern: "/admin-ext/api/backup/create",
          entrypoint: p("admin", "api", "create.ts"),
          prerender: false,
        });
        // 下载（GET，走登录态 Cookie）
        injectRoute({
          pattern: "/admin-ext/api/backup/download",
          entrypoint: p("admin", "api", "download.ts"),
          prerender: false,
        });
        // 恢复（multipart：上传文件或既有备份名）
        injectRoute({
          pattern: "/admin-ext/api/backup/restore",
          entrypoint: p("admin", "api", "restore.ts"),
          prerender: false,
        });
        // 删除
        injectRoute({
          pattern: "/admin-ext/api/backup",
          entrypoint: p("admin", "api", "backup.ts"),
          prerender: false,
        });
        // 自动备份设置
        injectRoute({
          pattern: "/admin-ext/api/backup/settings",
          entrypoint: p("admin", "api", "settings.ts"),
          prerender: false,
        });
        // 后台侧边栏注入
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
