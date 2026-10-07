import type { MiddlewareHandler } from "astro";

/**
 * URL 合法性守卫（pre，全站最外层）：
 *
 * Cloudflare Workers 上，若请求路径或查询串含「非法百分号编码」（如 /%ff、/%c0%af），
 * Astro 路由在 decodeURIComponent 阶段抛 URIError，未被捕获时平台直接返回
 * `error code: 1101`（英文 500）——访客看到的就是「一堆英文的出错页」。
 *
 * 这里在进入任何路由/解码逻辑前，把连续的 %XX 字节段按 UTF-8 严格解码，
 * 任一字节段非法即直接返回 400 中文友好页，绝不把异常冒泡到平台。
 * Node 部署同样适用（防御畸形请求行）。
 */

/** 判断 URL 的 pathname+search 中是否含非法百分号序列（畸形转义或非 UTF-8 字节段）。 */
export function hasInvalidPercentEncoding(pathname: string, search: string): boolean {
  const raw = pathname + search;
  let seg: number[] = [];
  const flush = () => {
    if (!seg.length) return true;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(seg));
      seg = [];
      return true;
    } catch {
      return false;
    }
  };
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "%") {
      const h = raw[i + 1];
      const l = raw[i + 2];
      if (!h || !l || !/[0-9a-fA-F]/.test(h) || !/[0-9a-fA-F]/.test(l)) {
        return true; // %zz、%2 等残缺/非十六进制转义
      }
      seg.push(parseInt(h + l, 16));
      i += 2;
    } else if (seg.length) {
      if (!flush()) return true; // 当前连续字节段不是合法 UTF-8
    }
  }
  if (seg.length && !flush()) return true;
  return false;
}

const BAD_REQUEST_HTML = `<!DOCTYPE html>
<html lang="zh-hans">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>请求地址有误 — 400</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; background: #f6f7f9; color: #1f2937; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 40px 36px; max-width: 520px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,.05); }
  .code { font-size: 56px; font-weight: 700; color: #d97706; line-height: 1; margin-bottom: 14px; }
  h1 { font-size: 19px; font-weight: 600; margin-bottom: 10px; }
  p { font-size: 14px; color: #6b7280; line-height: 1.7; }
  a { display: inline-block; margin-top: 22px; padding: 9px 22px; background: #0f766e; color: #fff !important; text-decoration: none; border-radius: 8px; font-size: 14px; }
  a:hover { background: #0d665f; }
</style>
</head>
<body>
  <div class="card">
    <div class="code">400</div>
    <h1>请求地址有误</h1>
    <p>您访问的网址中含有无法识别的字符，服务器无法处理该请求。<br>请检查地址是否完整，或返回首页继续浏览。</p>
    <a href="/">← 返回首页</a>
  </div>
</body>
</html>`;

export const onRequest: MiddlewareHandler = async (ctx, next) => {
  try {
    const u = ctx.url;
    if (hasInvalidPercentEncoding(u.pathname, u.search)) {
      return new Response(BAD_REQUEST_HTML, {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  } catch {
    // ctx.url 自身异常（理论上不会）：拒绝而非 500
    return new Response(BAD_REQUEST_HTML, {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return next();
};
