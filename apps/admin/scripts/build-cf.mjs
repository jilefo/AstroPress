// 跨平台设置 ASTRO_ADAPTER=cloudflare 后执行 astro build（Windows cmd 不支持 KEY=VAL 前缀语法）
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const r = spawnSync("astro", ["build"], {
  stdio: "inherit",
  shell: true, // Windows 下 astro 为 .cmd，需 shell 解析
  env: { ...process.env, ASTRO_ADAPTER: "cloudflare" },
});
if (r.status !== 0) process.exit(r.status ?? 1);

// 静态资产目录排除 _worker.js（服务端代码不能作为公开 asset 上传，wrangler 强制校验）
writeFileSync("dist/.assetsignore", "_worker.js\n", "utf-8");
console.log("已写入 dist/.assetsignore");

// ─────────────────────────────────────────────────────────────────────────────
// Patch Cloudflare adapter 入口：非法百分号编码守卫 + 全局中文错误兜底
//
// 背景：请求含 %ff / %c0%af 等非法 UTF-8 百分号序列时，Astro 在中间件链之前的
// 路由解码阶段抛 URIError，adapter fetch 无 try/catch，workerd 直接回
// `error code: 1101`（英文 500）。插件的 pre 中间件来不及执行，只能在 worker
// 入口层拦截。adapter 升级后若锚点变化，本步骤会 fail-loud 终止构建。
// ─────────────────────────────────────────────────────────────────────────────
const adapterFile = join(__dirname, "..", "dist", "_worker.js", "_@astrojs-ssr-adapter.mjs");
if (existsSync(adapterFile)) {
  let code = readFileSync(adapterFile, "utf-8");

  const helpers = `
// ── AstroPress patch: 非法 URL 编码守卫 + 中文错误兜底（由 scripts/build-cf.mjs 注入）──
function __apHasInvalidPercentEncoding(pathname, search) {
  const raw = pathname + search;
  let seg = [];
  const flush = () => {
    if (!seg.length) return true;
    try { new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(seg)); seg = []; return true; }
    catch { return false; }
  };
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "%") {
      const h = raw[i + 1], l = raw[i + 2];
      if (!h || !l || !/[0-9a-fA-F]/.test(h) || !/[0-9a-fA-F]/.test(l)) return true;
      seg.push(parseInt(h + l, 16)); i += 2;
    } else if (seg.length && !flush()) return true;
  }
  if (seg.length && !flush()) return true;
  return false;
}
const __AP_ERR_400 = ${'`'}<!DOCTYPE html><html lang="zh-hans"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>请求地址有误 — 400</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#f6f7f9;color:#1f2937;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.c{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:40px 36px;max-width:520px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.05)}.n{font-size:56px;font-weight:700;color:#d97706;line-height:1;margin-bottom:14px}h1{font-size:19px;font-weight:600;margin-bottom:10px}p{font-size:14px;color:#6b7280;line-height:1.7}a{display:inline-block;margin-top:22px;padding:9px 22px;background:#0f766e;color:#fff!important;text-decoration:none;border-radius:8px;font-size:14px}</style></head><body><div class="c"><div class="n">400</div><h1>请求地址有误</h1><p>您访问的网址中含有无法识别的字符，服务器无法处理该请求。<br>请检查地址是否完整，或返回首页继续浏览。</p><a href="/">← 返回首页</a></div></body></html>${'`'};
const __AP_ERR_500 = ${'`'}<!DOCTYPE html><html lang="zh-hans"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>服务暂时不可用 — 500</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:#f6f7f9;color:#1f2937;min-height:100vh;display:flex;align:center;justify-content:center;padding:24px}.c{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:40px 36px;max-width:520px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.05)}.n{font-size:56px;font-weight:700;color:#dc2626;line-height:1;margin-bottom:14px}h1{font-size:19px;font-weight:600;margin-bottom:10px}p{font-size:14px;color:#6b7280;line-height:1.7}a{display:inline-block;margin-top:22px;padding:9px 22px;background:#0f766e;color:#fff!important;text-decoration:none;border-radius:8px;font-size:14px}</style></head><body><div class="c"><div class="n">500</div><h1>服务暂时不可用</h1><p>服务器在处理请求时遇到问题，我们会尽快恢复。<br>请稍后刷新重试，或返回首页继续浏览其他内容。</p><a href="/">← 返回首页</a></div></body></html>${'`'};
const __AP_ERR_HEADERS = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
// ── end AstroPress patch ──
`;

  // 锚点 1：fetch 入口紧跟的 URL 解析 → 前置编码守卫
  const anchor1 = "const fetch = async (request, env, context) => {\n    const { pathname } = new URL(request.url);";
  const replace1 = `const fetch = async (request, env, context) => {
    {
      let __apU;
      try { __apU = new URL(request.url); }
      catch { return new Response(__AP_ERR_400, { status: 400, headers: __AP_ERR_HEADERS }); }
      if (__apHasInvalidPercentEncoding(__apU.pathname, __apU.search)) {
        return new Response(__AP_ERR_400, { status: 400, headers: __AP_ERR_HEADERS });
      }
    }
    const { pathname } = new URL(request.url);`;

  // 锚点 2：render 调用 → try/catch 中文 500 兜底
  const anchor2 = "const response = await app.render(request, { routeData, locals });";
  const replace2 = `let response;
    try {
      response = await app.render(request, { routeData, locals });
    } catch (__apErr) {
      console.error("[AstroPress] render error:", __apErr);
      return new Response(__AP_ERR_500, { status: 500, headers: __AP_ERR_HEADERS });
    }`;

  if (!code.includes(anchor1) || !code.includes(anchor2)) {
    console.error("✗ build-cf patch 失败：adapter 入口锚点已变化，请检查 @astrojs/cloudflare 版本");
    process.exit(1);
  }
  code = code.replace(anchor1, replace1).replace(anchor2, replace2);
  // 辅助函数注入到文件头部 import 区之后
  const insertAt = (() => {
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) if (!lines[i].startsWith("import ")) return lines.slice(0, i).join("\n").length;
    return 0;
  })();
  code = code.slice(0, insertAt) + "\n" + helpers + code.slice(insertAt);
  writeFileSync(adapterFile, code, "utf-8");
  console.log("已 patch worker 入口：非法编码 400 守卫 + 中文 500 兜底");
} else {
  console.error("✗ 未找到 adapter 入口文件，patch 跳过（构建产物异常）");
  process.exit(1);
}

// 生成 dist/_headers：CF Workers Assets 层直接应答静态文件（不进 Worker/中间件），
// asset-cache 插件的 Cache-Control 规则对这类路径无效，必须在资产层声明。
// 规则与 asset-cache 插件默认值对齐：/_astro/* 1年 immutable；/media/* 与核心 R2 端点一致 1年 immutable。
const headers = [
  "# AstroPress: asset-layer cache rules (generated by build-cf.mjs; static assets bypass the Worker middleware)",
  "/_astro/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "",
  "/media/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "",
].join("\n");
writeFileSync("dist/_headers", headers, "utf-8");
console.log("已写入 dist/_headers（资产层强缓存规则）");
