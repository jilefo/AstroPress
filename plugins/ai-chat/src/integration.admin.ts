import type { AstroIntegration } from "astro";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const p = (...s: string[]) => join(pkgDir, ...s);

/**
 * Admin-side integration:
 *   /admin-ext/ai-chat                  → 内嵌登录视图 + 聊天页
 *   /admin-ext/api/ai-chat/status       → GET: providers + viewport + sessions
 *   /admin-ext/api/ai-chat/login        → POST: { provider, action: open|check|close|logout }
 *   /admin-ext/api/ai-chat/view         → POST: 内嵌视图操作 open/click/type/press/scroll/navigate
 *   /admin-ext/api/ai-chat/screenshot   → GET: 实时画面 JPEG
 *   /admin-ext/api/ai-chat/send         → POST: { provider, prompt }
 *   /admin-ext/api/ai-chat/providers    → GET: provider metadata
 *   /admin-ext/api/ai-chat/editor-panel.js → GET: 编辑器侧边面板脚本（注入 /admin/posts/*）
 */
export default function aiChatIntegration(): AstroIntegration {
  return {
    name: "astropress-ai-chat-admin",
    hooks: {
      "astro:config:setup": ({ injectRoute, addMiddleware }) => {
        injectRoute({ pattern: "/admin-ext/ai-chat", entrypoint: p("admin", "index.astro"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/ai-chat/status", entrypoint: p("admin", "api", "status.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/ai-chat/login", entrypoint: p("admin", "api", "login.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/ai-chat/view", entrypoint: p("admin", "api", "view.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/ai-chat/screenshot", entrypoint: p("admin", "api", "screenshot.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/ai-chat/send", entrypoint: p("admin", "api", "send.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/ai-chat/providers", entrypoint: p("admin", "api", "providers.ts"), prerender: false });
        injectRoute({ pattern: "/admin-ext/api/ai-chat/editor-panel.js", entrypoint: p("admin", "api", "editor-panel.js.ts"), prerender: false });
        addMiddleware({ entrypoint: p("middleware.ts"), order: "post" });
      },
    },
  };
}
