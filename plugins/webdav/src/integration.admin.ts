import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function webdavIntegration(): AstroIntegration {
  return {
    name: "astropress-webdav",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // WebDAV 协议端点（自带 Basic Auth，/webdav 不在核心登录中间件范围内）
        injectRoute({
          pattern: "/webdav/[...path]",
          entrypoint: p("routes", "webdav.ts"),
          prerender: false,
        });
        // WebDAV 管理页
        injectRoute({
          pattern: "/admin-ext/webdav",
          entrypoint: p("admin", "index.astro"),
          prerender: false,
        });
        // 专用 access token 生成/重置/查询
        injectRoute({
          pattern: "/admin-ext/api/webdav/token",
          entrypoint: p("admin", "api", "token.ts"),
          prerender: false,
        });
        // 存储目录磁盘占用统计
        injectRoute({
          pattern: "/admin-ext/api/webdav/stats",
          entrypoint: p("admin", "api", "stats.ts"),
          prerender: false,
        });
        // 后台侧边栏注入
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
      },
    },
  };
}
