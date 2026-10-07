import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

export default function commentsIntegration(): AstroIntegration {
  return {
    name: "astropress-comments",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        // 后台评论管理页
        injectRoute({ pattern: "/admin-ext/comments", entrypoint: p("admin", "index.astro"), prerender: false });
        // 后台 API：列表 / 批量动作 / 回复 / 设置（GET+POST）
        injectRoute({ pattern: "/admin-ext/api/comments/list", entrypoint: p("admin", "api", "list.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/comments/action", entrypoint: p("admin", "api", "action.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/comments/reply", entrypoint: p("admin", "api", "reply.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/comments/settings", entrypoint: p("admin", "api", "settings.ts"), prerender: false });
        // 公开提交端点（刻意放在 /api 与 /admin 之外，避开登录墙）
        injectRoute({ pattern: "/ap-comments/submit", entrypoint: p("routes", "submit.ts"), prerender: false });
        // 后台侧边栏菜单 + 前台文章页评论注入
        addMiddleware({ entrypoint: p("middleware-admin.ts"), order: "post" });
        addMiddleware({ entrypoint: p("middleware-web.ts"), order: "post" });
      },
    },
  };
}
