import type { MiddlewareHandler } from "astro";
import { isPluginDisabled } from "@astropress/core/plugin-state";
import { loadSettings } from "./lib/settings";
import type { HtmlOptSettings } from "./lib/settings";

const SENSITIVE_RE = /<(script|style|pre|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi;
const COMMENT_RE = /<!--[\s\S]*?-->/g;

/**
 * 块级标签白名单。标签间换行空白只在两侧都是块级标签时折叠：
 * inline 兄弟标签（a/code/span/em…）之间的换行承担分隔语义，
 * 折叠会把“登录\n注册”渲染成“登录注册”，静默改变正文含义。
 */
const BLOCK_TAGS =
  "html|head|body|div|p|section|article|aside|header|footer|main|nav|ul|ol|li|dl|dt|dd|table|thead|tbody|tfoot|tr|td|th|form|blockquote|hr|figure|figcaption|picture|source|h1|h2|h3|h4|h5|h6|details|summary|fieldset|address";
const BLOCK_TAG_PIECE = `(?:${BLOCK_TAGS})`;
// 匹配 “块级标签（开或闭） + 含换行空白 + 块级标签（开或闭）”
const BLOCK_WS_RE = new RegExp(
  `(</${BLOCK_TAG_PIECE}\\s*>|<${BLOCK_TAG_PIECE}(?:\\s[^>]*?)?\\/?>)\\s*\\n[\\s\\t]*` +
  `(?=</${BLOCK_TAG_PIECE}\\s*>|<${BLOCK_TAG_PIECE}(?:\\s|>|/))`,
  "g"
);

function randomToken(): string {
  // 每次 transform 使用唯一占位符，避免正文恰好包含占位文本导致还原错乱
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 判断注释是否需要保留 */
function isPreservedComment(cmt: string): boolean {
  if (cmt.includes("[if")) return true; // 条件注释：<!--[if IE]>...<![endif]-->
  if (cmt.includes("noindex")) return true; // noindex SEO 指令注释
  // 以 "<!" 开头的特殊声明注释（<!-- 之后紧跟 !，如 <!--! ... -->）
  if (cmt.startsWith("<!--!")) return true;
  return false;
}

/**
 * HTML 精简 + 资源提示（纯函数）
 *
 * 步骤：保护敏感块 → 删注释 → 折叠标签间换行空白 → 还原敏感块 → 注入资源提示
 * @returns 有改动返回新 HTML 串；无改动返回 null（调用方应返回原始 Response）
 */
export function transform(html: string, settings: HtmlOptSettings): string | null {
  // a) 保护敏感块：script/style/pre/textarea 原文抽出，替换为一次性占位符
  const protectedBlocks: string[] = [];
  const token = randomToken();
  let work = html.replace(SENSITIVE_RE, (m) => {
    const idx = protectedBlocks.length;
    protectedBlocks.push(m);
    return ` APHTML${token}_${idx} `;
  });

  let changed = false;

  // b) 移除 HTML 注释（条件注释 / 特殊声明 / noindex 注释保留）
  if (settings.removeComments) {
    work = work.replace(COMMENT_RE, (cmt) => {
      if (isPreservedComment(cmt)) return cmt;
      changed = true;
      return "";
    });
  }

  // c) 折叠块级标签之间“含换行的空白”；inline 标签间距与同行空白保留
  if (settings.collapseWhitespace) {
    work = work.replace(BLOCK_WS_RE, (m, left: string) => {
      changed = true;
      return left;
    });
  }

  // d) 按本次 token 还原全部占位符
  const restoreRe = new RegExp(` APHTML${token}_(\\d+) `, "g");
  work = work.replace(restoreRe, (m, idx: string) => {
    const i = Number(idx);
    return i in protectedBlocks ? protectedBlocks[i] : m;
  });

  // e) 资源提示：在 </head> 前一次性注入（已存在同 href 则跳过）
  if (settings.resourceHints) {
    const links: string[] = [];
    const pushHint = (rel: "dns-prefetch" | "preconnect", href: string) => {
      if (!href) return;
      if (work.includes(`href="${href}"`)) return;
      links.push(`<link rel="${rel}" href="${href}">`);
    };
    for (const href of settings.dnsPrefetch) pushHint("dns-prefetch", href);
    for (const href of settings.preconnect) pushHint("preconnect", href);

    if (links.length > 0 && work.includes("</head>")) {
      work = work.replace("</head>", `${links.join("")}</head>`);
      changed = true;
    }
  }

  return changed ? work : null;
}

/**
 * 前台中间件：对公开 HTML 页面执行精简与资源提示注入
 */
export const onRequest: MiddlewareHandler = async (ctx, next) => {
  const res = await next();

  try {
    if (ctx.request.method !== "GET") return res;
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("text/html")) return res;

    const pathname = ctx.url.pathname;
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/api/") ||
      pathname.startsWith("/admin-ext")
    ) {
      return res;
    }

    const locals = ctx.locals as any;
    const db = locals.db ?? null;
    if (!db) return res;
    if (await isPluginDisabled(db, "html-opt")) return res;

    // 先查设置（15s 缓存，廉价）：未启用时直接跳过 res.clone().text()
    let settings;
    try {
      settings = await loadSettings(db);
    } catch {
      return res;
    }
    if (!settings.enabled) return res;

    const html = await res.clone().text();
    if (!html.includes("</head>") || !html.includes("</body>")) return res;

    const out = transform(html, settings);
    if (out === null) return res;

    const headers = new Headers(res.headers);
    headers.delete("content-length");
    headers.set("X-HTML-Opt", "on");
    return new Response(out, { status: res.status, statusText: res.statusText, headers });
  } catch {
    // fail-open：任何异常都返回原始响应
    return res;
  }
};
