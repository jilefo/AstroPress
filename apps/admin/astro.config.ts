import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import node from "@astrojs/node";
import react from "@astrojs/react";
import { astropress } from "@astropress/core/integration";
import securitySuite from "@astropress/plugin-security-suite/integration";
import mediaSuite from "@astropress/plugin-media-suite/integration";
import perfSuite from "@astropress/plugin-perf-suite/integration";
import editorSuite from "@astropress/plugin-editor-suite/integration";
import aiSuite from "@astropress/plugin-ai-suite/integration";
import seoSuite from "@astropress/plugin-seo-suite/integration";
import siteSuite from "@astropress/plugin-site-suite/integration";
import syncSuite from "@astropress/plugin-sync-suite/integration";
import opsSuite from "@astropress/plugin-ops-suite/integration";
import adminSuite from "@astropress/plugin-admin-suite/integration";
import pluginManagerIntegration from "@astropress/plugin-manager/integration.admin";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";

// Resolve DB path relative to this config file so it works regardless of
// which directory turbo/pnpm runs the dev server from.
const __dirname = dirname(fileURLToPath(import.meta.url ?? "file:///"));
const dbPath = resolve(__dirname, "../../local.db");

// Default to Node adapter (local dev, Docker, VPS).
// Set ASTRO_ADAPTER=cloudflare for Cloudflare Pages builds.
const isCloudflare = process.env.ASTRO_ADAPTER === "cloudflare";

/**
 * CF 兼容：workerd 旧模块注册表中，打包 chunk 的 import.meta.url 为 undefined，
 * 顶层 fileURLToPath(import.meta.url ?? "file:///") 会抛 TypeError 并导致整个中间件链初始化失败。
 * 构建期统一加 "file:///" 兜底（Node 下 import.meta.url 必为字符串，兜底永不触发；
 * CF 下相关 fs 路径均在 hasFileSystem 守卫之后才使用）。
 */
function cfImportMetaGuard() {
  return {
    name: "ap-cf-import-meta-guard",
    enforce: "pre" as const,
    transform(code: string, _id: string) {
      if (!code.includes("import.meta.url")) return null;
      const out = code
        .replace(/fileURLToPath\(import\.meta\.url\)/g, 'fileURLToPath(import.meta.url ?? "file:///")')
        .replace(/createRequire\(import\.meta\.url\)/g, 'createRequire(import.meta.url ?? "file:///")')
        .replace(/new URL\((?!"file:\/\/\/")([^,()]+),\s*import\.meta\.url\)/g,
                 'new URL($1, import.meta.url ?? "file:///")');
      return out === code ? null : { code: out, map: null };
    },
  };
}

/**
 * CF 兼容②：workerd SSR 构建（ssr.target=webworker + noExternal）下，Astro 4 的页面→样式
 * 映射全部丢失（manifest styles:[]），<style is:global> 被编译成 "/* empty css *\/"，
 * 线上后台/插件页零样式。本插件在 Astro 编译之前（enforce:pre）处理 .astro 源码：
 *  - <style is:global> 块提升为 frontmatter 模板字符串；
 *  - 页面含 <AdminLayout>：作为 pageCss prop 传入，由布局在 <head> 内 set:html 输出
 *    （slot 内的 <style> 会被 Astro 样式传播链收集，而该链正是 CF 丢失的映射，必须移出 slot）；
 *  - 无布局的路由页：在模板根级直接 set:html 输出。
 * 仅 CF 构建启用。
 */
function cfGlobalStyleInline() {
  return {
    name: "ap-cf-global-style-inline",
    enforce: "pre" as const,
    // 必须用 load 而非 transform：Astro 核心编译插件同为 pre-transform 且注册更早，
    // transform 阶段拿到的已是编译后 JS（is:global 已被吃掉）。
    // load 在所有 transform 之前提供模块源码，这里返回预处理后的 .astro，
    // Astro 编译器随后编译的就是「frontmatter 常量 + pageCss prop」版本。
    load(id: string) {
      if (!id.endsWith(".astro")) return null;
      let raw: string;
      try {
        raw = readFileSync(id, "utf-8");
      } catch {
        return null;
      }
      if (!raw.includes("<style") || !raw.includes("is:global")) return null;
      return convertGlobalStyles(raw);
    },
  };
}

/** 把 .astro 源码中的 <style is:global> 块转为 frontmatter 常量 + AdminLayout pageCss prop。 */
function convertGlobalStyles(code: string): string {
  const re = /<style\s+is:global>([\s\S]*?)<\/style>/g;
  const blocks: string[] = [];
  let out = code.replace(re, (_full, css: string) => {
    blocks.push(css);
    return "";
  });
  if (!blocks.length) return code;
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  const names = blocks.map((_css, i) => `__apGStyle${i}`);
  const decls =
    blocks.map((css, i) => `const ${names[i]} = \`\n${esc(css)}\`;`).join("\n") +
    `\nconst __apGStyles = [${names.join(", ")}].join("\\n");`;

  // 1) frontmatter 注入
  if (/^---\r?\n/.test(out)) {
    const rest = out.slice(4);
    const close = /\r?\n---(\r?\n|$)/.exec(rest);
    if (!close) return code;
    const pos = 4 + close.index + 1;
    out = out.slice(0, pos) + decls + "\n" + out.slice(pos);
  } else {
    out = `---\n${decls}\n---\n${out}`;
  }

  // 2) 输出点：优先注入 AdminLayout 开标签；否则模板根级直出
  const layoutTag = /<AdminLayout\b[^>]*>/.exec(out);
  if (layoutTag) {
    const tag = layoutTag[0];
    if (!/\bpageCss\s*=/.test(tag)) {
      const newTag = tag.slice(0, -1) + ` pageCss={__apGStyles}>`;
      out = out.slice(0, layoutTag.index) + newTag + out.slice(layoutTag.index + tag.length);
    }
  } else {
    out = out.replace(/(^---\r?\n[\s\S]*?\r?\n---(\r?\n))/,
      `$1<style set:html={__apGStyles} />\n`);
  }
  return out;
}

export default defineConfig({
  output: "server",
  adapter: isCloudflare ? cloudflare() : node({ mode: "standalone" }),
  // CF 构建：SSR manifest 的页面→样式映射在 workers 构建链中全部为空（284 页 styles:[]，
  // 但 CSS 文件本身已正确产出），导致线上页面零样式。inlineStylesheets:"always" 绕过映射，
  // 把各页用到的样式直接内联进 HTML（仅影响 CF 产物；Node 构建保持外链缓存友好）。
  build: isCloudflare ? { inlineStylesheets: "always" } : {},
  integrations: [
    react(),
    astropress({
      // Absolute path — always points to monorepo root local.db regardless of CWD.
      // Override for other backends:
      //   database: { url: "postgresql://user:pass@host/astropress" }
      //   database: { url: "libsql://your-db.turso.io", authToken: "ey..." }
      // On Cloudflare Pages the D1 binding is detected automatically.
      database: { url: `file:${dbPath}` },
    }),
    // ── 套件化注册：原 50+ 独立插件合并为 10 大套件（成员包零改动，仅聚合）──
    // 顺序敏感（Astro 后置中间件按注册顺序反序处理响应，越早注册越晚处理）：
    //   security-suite 最先注册 → 安全头/限流/维护在最外层，连缓存 HIT 响应也能补头，
    //     限流 429 与维护 503 抢在缓存命中前返回；
    //   perf-suite 紧随 → page-cache 缓存的是经全部插件注入与优化后的最终 HTML，
    //     image-lazy / html-opt / asset-cache 早于其他注入类插件注册；
    //   editor / ai / seo / site / sync / ops / admin 各套件内部保持原有相对顺序；
    //   plugin-manager 必须最后注册 → 其守卫与剥离逻辑需看到其他插件注入的完整 HTML。
    ...securitySuite(),
    ...mediaSuite(),
    ...perfSuite(),
    ...editorSuite(),
    ...aiSuite(),
    ...seoSuite(),
    ...siteSuite(),
    ...syncSuite(),
    ...opsSuite(),
    ...adminSuite(),
    pluginManagerIntegration(),
  ],
  vite: {
    plugins: isCloudflare ? [cfImportMetaGuard(), cfGlobalStyleInline()] : [],
    ssr: {
      // CF 构建：node:* 一律外置，由 nodejs_compat 运行时提供（ssr.external 只认字符串，不支持正则）
      // （fs/child_process 等不可用模块的调用点均已加 hasFileSystem 守卫，构建期只需能解析）
      external: isCloudflare
        ? [
            "node:fs", "node:fs/promises", "node:path", "node:url", "node:os",
            "node:crypto", "node:buffer", "node:util", "node:events", "node:stream",
            "node:dns/promises", "node:child_process", "node:http", "node:https",
            "node:net", "node:tls", "node:zlib", "node:assert", "node:process",
          ]
        : ["node:fs/promises", "node:path", "node:fs", "node:os", "node:dns/promises"],
    },
    build: {
      rollupOptions: {
        // playwright 的工具包引用 kerberos 等原生可选依赖，Node 构建仅警告即可
        onwarn(warning: any, warn: any) {
          if (warning?.code === "MODULE_LEVEL_DIRECTIVE" ||
              /could not be resolved|failed to resolve import/i.test(String(warning?.message ?? ""))) return;
          warn(warning);
        },
      },
    },
    resolve: {
      // CF 构建：postgres 驱动/playwright 不参与（D1 替代、无浏览器子进程），别名为桩模块避免打包解析失败
      alias: isCloudflare
        ? [
            { find: "postgres", replacement: "/src/stubs/postgres-stub.ts" },
            { find: "drizzle-orm/postgres-js", replacement: "/src/stubs/postgres-stub.ts" },
            { find: "playwright-core", replacement: "/src/stubs/playwright-stub.ts" },
            { find: "playwright", replacement: "/src/stubs/playwright-stub.ts" },
          ]
        : [],
    },
  },
});
