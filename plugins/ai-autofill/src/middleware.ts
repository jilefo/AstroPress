import type { MiddlewareHandler } from "astro";
import { containsExternalImage, normalizeImageRefs } from "./lib/normalize-images";

const EXECUTE_PATH = "/api/ai/execute";
const CHAT_PATH = "/api/ai/chat";

/**
 * 三件事：
 *  1. POST /api/ai/execute（服务端动作执行闸门）：核心处理器直接改库、绕过
 *     保存端点（image-mirror 不生效），故在请求进入前把动作里的外链图片
 *     归一化为真实生成图片/剥离死链——任何直接调用方也无法绕过。
 *  2. POST /api/ai/chat：响应出口归一化 reply（自由文本 + ```action 块，
 *     覆盖浏览器端 setContent 动作），UI 永远不会收到/计划伪造图片链接。
 *  3. 旧有职责：仅在文章/页面/CPT 编辑页注入 /api/ap-autofill/script.js。
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const { request, locals } = ctx;
  const path = ctx.url.pathname;

  // ── 闸门 1：execute 请求体重写（fail-open，任何异常原样放行）──
  if (request.method === "POST" && path === EXECUTE_PATH && (locals as any)?.db) {
    try {
      const raw = await request.text();
      const ownHost = ctx.url.host;
      if (raw && containsExternalImage(raw, ownHost)) {
        const r = await normalizeImageRefs(raw, { locals, request });
        if (r.text !== raw) {
          const headers = new Headers(request.headers);
          headers.delete("content-length");
          const newReq = new Request(request, { method: "POST", headers, body: r.text });
          return next(newReq);
        }
      }
    } catch (err) {
      console.error("[ap-autofill] execute normalize failed:", err);
    }
  }

  const res = await next();

  // ── 闸门 2：chat 响应归一化（fail-open）──
  if (request.method === "POST" && path === CHAT_PATH) {
    try {
      const ctype = res.headers.get("content-type") ?? "";
      if (ctype.includes("application/json")) {
        const raw = await res.clone().text();
        const data = JSON.parse(raw) as { reply?: unknown };
        if (typeof data.reply === "string" && containsExternalImage(data.reply, ctx.url.host)) {
          // 从请求消息里尽量取标题线索（仅用于画面提示，失败给空串）
          let titleHint = "";
          try {
            const body = JSON.parse(await request.clone().text()) as { messages?: Array<{ content?: string }> };
            titleHint = body.messages?.[0]?.content?.slice(0, 80) ?? "";
          } catch { /* ignore */ }
          const r = await normalizeImageRefs(data.reply, { locals, request, titleHint });
          if (r.text !== data.reply) {
            const headers = new Headers(res.headers);
            headers.delete("content-length");
            return new Response(JSON.stringify({ ...data, reply: r.text }), {
              status: res.status,
              statusText: res.statusText,
              headers,
            });
          }
        }
      }
    } catch (err) {
      console.error("[ap-autofill] chat normalize failed:", err);
    }
    return res;
  }

  // ── 旧职责：编辑页注入脚本 ──
  // Only edit pages: /admin/posts/:id, /admin/pages/:id, /admin/cpt/:type/:id
  const isEditPage = /^\/admin\/(?:posts|pages)\/\d+/.test(path) || /^\/admin\/cpt\/[^/]+\/\d+/.test(path);
  if (!isEditPage) return res;

  const ctype = res.headers.get("content-type") ?? "";
  if (!ctype.includes("text/html")) return res;

  const html = await res.clone().text();
  if (!html.includes("</head>")) return res;

  const injected = html.replace(
    "</head>",
    `<script src="/api/ap-autofill/script.js" defer></script>\n</head>`
  );
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new Response(injected, { status: res.status, statusText: res.statusText, headers });
};
