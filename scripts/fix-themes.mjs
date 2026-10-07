#!/usr/bin/env node
/**
 * AstroPress theme package fixer
 *
 * 依据运行时真实契约修复 wp-themes/ 下的主题包：
 *   F1  manifest.json 去重：移除被 upload.ts 覆盖的 dead `templates` / `pages` 内联数组
 *   F2  loopTemplateId 归一化：不存在的自定义 id → 内置模板（否则静默回退）
 *   F3  theme.css 顶部注入 Web 字体 @import（AstroPress 不注入任何字体 <link>）
 *   F4  theme.css 追加 AstroPress 适配层（原 CSS 选择器指向 WP DOM，对前台完全无效）
 *
 * 幂等：可重复运行。用 `>>> ap-fonts >>>` / `>>> ap-adapter >>>` 区块包裹，重复运行会替换而非累积。
 *
 * 用法:
 *   node scripts/fix-themes.mjs --dry-run    # 只预览，不写盘
 *   node scripts/fix-themes.mjs              # 实际修复
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const THEMES_DIR = process.env.AP_THEMES_DIR
  ? path.resolve(ROOT, process.env.AP_THEMES_DIR)
  : path.join(ROOT, "wp-themes");
const DRY = process.argv.includes("--dry-run");
const ONLY = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length) ?? null;
const VERBOSE = process.argv.includes("--verbose");

const BUILTIN_LOOP_TEMPLATES = new Set([
  "default-with-image", "default-no-image", "default-horizontal", "default-magazine",
]);

/** 变量名 → BaseLayout 会在 theme.css *之后* 用 token 值覆盖 :root，因此不能依赖它们 */
const TOKEN_OVERRIDDEN_VARS = new Set([
  "--color-primary", "--color-primary-hover", "--color-bg", "--color-surface",
  "--color-border", "--color-text", "--color-muted", "--font-sans",
  "--font-heading", "--max-width", "--radius-md", "--radius-sm", "--section-y",
]);

// ────────────────────────────────────────────────────────────────────────────
// CSS 解析辅助
// ────────────────────────────────────────────────────────────────────────────

function extractRootVars(css) {
  const out = new Map();
  for (const block of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const d of block[1].matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)/g)) {
      if (!out.has(d[1])) out.set(d[1], d[2].trim());
    }
  }
  return out;
}

function extractScopedOverrideVars(css) {
  const out = new Map();
  for (const block of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (/:root/.test(block[1])) continue;
    for (const d of block[2].matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)/g)) {
      if (!out.has(d[1])) out.set(d[1], d[2].trim());
    }
  }
  return out;
}

function stripRegion(css, tag) {
  return css.replace(
    new RegExp(`/\\* >>> ${tag} >>> \\*/[\\s\\S]*?/\\* <<< ${tag} <<< \\*/\\s*`, "g"),
    ""
  );
}

const GENERIC_FAMILIES = new Set([
  "system-ui", "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto",
  "helvetica neue", "helvetica", "arial", "sans-serif", "serif", "monospace",
  "cursive", "fantasy", "georgia", "times new roman", "times", "courier new",
  "courier", "consolas", "monaco", "menlo", "fira code", "ui-sans-serif",
  "ui-serif", "ui-monospace", "pingfang sc", "hiragino sans gb",
  "microsoft yahei", "simsun", "noto sans", "noto serif", "inherit",
  "initial", "unset", "revert", "emoji",
]);

/** 解析 font-family 列表，保留原始大小写（Google Fonts 需要）；丢弃 var()/函数式取值 */
function parseFamilies(str) {
  if (typeof str !== "string") return [];
  return str
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter((s) => s && !/^[a-z-]+\(/i.test(s));
}

/** 单字重字体不能带 :wght@400;700，否则整个 @import 会 400 */
const WEIGHT_OVERRIDES = { courgette: null };
/** Google Fonts 改名 */
const GOOGLE_ALIASES = { muli: "Mulish" };
/** 不在 Google Fonts 上的字体 → 直接给可用的 CDN 样式表 */
const NON_GOOGLE_CSS = {
  "lxgw wenkai": "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css",
};

function buildFontImportBlock(families) {
  const google = [];
  const extraImports = [];
  const injected = [];

  for (const raw of families) {
    const key = raw.toLowerCase();
    if (GENERIC_FAMILIES.has(key)) continue;
    if (NON_GOOGLE_CSS[key]) {
      extraImports.push(`@import url("${NON_GOOGLE_CSS[key]}");`);
      injected.push(`${raw} (CDN)`);
      continue;
    }
    const family = GOOGLE_ALIASES[key] ?? raw;
    const hasOverride = Object.prototype.hasOwnProperty.call(WEIGHT_OVERRIDES, key);
    const weights = hasOverride ? WEIGHT_OVERRIDES[key] : "400;700";
    const slug = family.trim().replace(/\s+/g, "+");
    google.push(weights ? `family=${slug}:wght@${weights}` : `family=${slug}`);
    injected.push(weights ? `${family} ${weights}` : family);
  }

  if (google.length === 0 && extraImports.length === 0) return { block: "", injected: [] };

  const url = google.length
    ? `https://fonts.googleapis.com/css2?${google.join("&")}&display=swap`
    : null;
  const lines = [];
  if (url) lines.push(`@import url("${url}");`);
  lines.push(...extraImports);

  const block = [
    "/* >>> ap-fonts >>> */",
    "/* 主题声明的 Web 字体。AstroPress 不会注入字体 <link>，只能由主题 CSS 自行 @import。",
    "   若网络无法访问 Google Fonts（例如中国大陆），删除本区块即可，字体会回退到系统字体。 */",
    ...lines,
    "/* <<< ap-fonts <<< */",
  ].join("\n");

  return { block, injected };
}

// ────────────────────────────────────────────────────────────────────────────
// 适配层生成
// ────────────────────────────────────────────────────────────────────────────

/** 主题变量若不会被 BaseLayout 覆盖 → 用 var() 引用（可随用户改 token 之外的变量联动），否则写死字面量 */
function ref(varName, literal) {
  if (!varName) return literal;
  if (TOKEN_OVERRIDDEN_VARS.has(varName)) return literal;
  return `var(${varName}, ${literal})`;
}

function collectFacts(css, tokens) {
  const root = extractRootVars(css);
  const scoped = extractScopedOverrideVars(css);
  const has = (n) => root.has(n);
  const firstOf = (...names) => names.find(has);
  const valOf = (...names) => {
    const n = names.find(has);
    return n ? root.get(n) : undefined;
  };

  const tc = tokens?.colors ?? {};
  const tf = tokens?.fonts ?? {};
  const ts = tokens?.spacing ?? {};

  const primaryVar = firstOf("--color-primary");
  const primary = valOf("--color-primary") ?? tc.primary ?? "#2271b1";
  const primaryHover = valOf("--color-primary-hover") ?? primary;

  const accentVar = firstOf("--color-accent", "--color-secondary", "--color-link", "--link-color");
  const accent = valOf("--color-accent", "--color-secondary", "--color-link", "--link-color") ?? primary;

  const bgVar = firstOf("--color-bg", "--background", "--bg-color");
  const bg = valOf("--color-bg", "--background", "--bg-color") ?? tc.background ?? "#ffffff";

  const surfaceVar = firstOf("--color-surface", "--surface");
  const surface = valOf("--color-surface", "--surface") ?? tc.surface ?? "#f8f9fa";

  const borderVar = firstOf("--color-border", "--border-color");
  const border = valOf("--color-border", "--border-color") ?? tc.border ?? "#e9ecef";

  const textVar = firstOf("--color-text");
  const text = valOf("--color-text") ?? tc.text ?? "#212529";

  const mutedVar = firstOf("--color-muted", "--color-text-muted");
  const muted = valOf("--color-muted", "--color-text-muted") ?? tc.textMuted ?? "#6c757d";

  const radiusVar = firstOf("--radius", "--radius-md", "--radius-base", "--border-radius", "--card-radius");
  const radius = valOf("--radius", "--radius-md", "--radius-base", "--border-radius", "--card-radius") ?? ts.borderRadius ?? "8px";

  const shadowVar = firstOf("--shadow", "--shadow-md", "--card-shadow", "--box-shadow");
  const shadow = valOf("--shadow", "--shadow-md", "--card-shadow", "--box-shadow") ?? "0 2px 10px rgba(0,0,0,.06)";

  const fontBodyVar = firstOf("--font-body", "--font-family", "--font-sans");
  const fontBody = valOf("--font-body", "--font-family", "--font-sans") ?? tf.body ?? "system-ui, sans-serif";

  const fontHeadingVar = firstOf("--font-heading", "--font-title");
  const fontHeading = valOf("--font-heading", "--font-title") ?? tf.heading ?? fontBody;

  // 暗色模式：AstroPress 不会给 <html> 加 .dark，也没有 prefers-color-scheme 处理
  const darkVarNames = ["--color-bg", "--color-surface", "--color-border", "--color-text", "--color-muted"];
  const darkValues = darkVarNames
    .map((n) => (scoped.has(n) ? `    ${n}: ${scoped.get(n)};` : null))
    .filter(Boolean);

  return {
    primaryVar, primary, primaryHover,
    accentVar, accent,
    bgVar, bg, surfaceVar, surface, borderVar, border, textVar, text, mutedVar, muted,
    radiusVar, radius,
    shadowVar, shadow,
    fontBodyVar, fontBody,
    fontHeadingVar, fontHeading,
    darkValues,
  };
}

function buildAdapterBlock(f) {
  const lines = [];
  lines.push("/* >>> ap-adapter >>> */");
  lines.push(`/* ═══════════════════════════════════════════════════════════════════════
   AstroPress 适配层（生成，可手工微调）

   背景：BlockRenderer 输出的样式几乎全部是内联 style，而本包原有的
   theme.css 选择器（.post-card / .main-container / .nav-bar …）来自 WordPress
   模板结构，AstroPress 前台并不输出这些 class，因此对前台完全无效。

   本层只做两件安全的事：
     1. 只改内联样式「没有覆盖」的性质 —— box-shadow / transition / hover /
        伪元素 / position，无需 !important 即可生效；
     2. 在媒体查询里对内联的 padding 和 grid-template-columns 使用 !important，
        修复 48px 侧边距在窄屏挤出内容、多列网格在手机上不换行的问题。

   --ap-* 变量是「主题原始配色快照」：BaseLayout 注入的 token :root 无法覆盖
   它们，从而保证主题自身的配色/圆角/阴影不被 token 冲掉。
   ═══════════════════════════════════════════════════════════════════════ */`);
  lines.push("");
  lines.push(":root {");
  lines.push(`  --ap-primary: ${f.primary};`);
  lines.push(`  --ap-primary-hover: ${f.primaryHover};`);
  lines.push(`  --ap-accent: ${ref(f.accentVar, f.accent)};`);
  lines.push(`  --ap-bg: ${f.bg};`);
  lines.push(`  --ap-surface: ${f.surface};`);
  lines.push(`  --ap-border: ${f.border};`);
  lines.push(`  --ap-text: ${f.text};`);
  lines.push(`  --ap-muted: ${f.muted};`);
  lines.push(`  --ap-radius: ${ref(f.radiusVar, f.radius)};`);
  lines.push(`  --ap-shadow: ${ref(f.shadowVar, f.shadow)};`);
  lines.push(`  --ap-shadow-hover: 0 12px 28px rgba(0, 0, 0, 0.12);`);
  lines.push(`  --ap-transition: 0.25s ease;`);
  lines.push("}");
  lines.push("");
  lines.push("/* ── 排版 ─────────────────────────────────────────────────────────── */");
  lines.push(`.ap-blocks { font-family: ${ref(f.fontBodyVar, f.fontBody)}; color: var(--ap-text); }`);
  lines.push(".ap-block h1, .ap-block h2, .ap-block h3, .ap-block h4 {");
  lines.push(`  font-family: ${ref(f.fontHeadingVar, f.fontHeading)};`);
  lines.push("  letter-spacing: -0.01em;");
  lines.push("}");
  lines.push(".ap-block img { border-radius: var(--ap-radius); }");
  lines.push(".ap-block a:hover { color: var(--ap-accent); }");
  lines.push("");
  lines.push("/* ── 导航吸顶 ────────────────────────────────────────────────────────");
  lines.push("   BaseLayout 中 header 的 .ap-blocks 是 <body> 的直接子元素，且高度与 nav 相等，");
  lines.push("   所以直接给 .ap-block-nav 设 position:sticky 不会生效（可粘范围等于自身高度）。");
  lines.push("   必须让包装层吸顶；不支持 :has() 的浏览器自动降级为不吸顶，无副作用。 */");
  lines.push("body > .ap-blocks:has(> .ap-block-nav) {");
  lines.push("  position: sticky;");
  lines.push("  top: 0;");
  lines.push("  z-index: 90;");
  lines.push("  background: var(--ap-bg);");
  lines.push("}");
  lines.push(".ap-block-nav { box-shadow: 0 1px 0 var(--ap-border); }");
  lines.push(".ap-block-nav nav ul li a {");
  lines.push("  border-radius: var(--ap-radius);");
  lines.push("  transition: color var(--ap-transition), background-color var(--ap-transition);");
  lines.push("}");
  lines.push(".ap-block-nav nav ul li a:hover { color: var(--ap-primary-hover); background: var(--ap-surface); }");
  lines.push("");
  lines.push("/* ── query-loop 卡片：阴影 + 悬浮抬升（内联样式未涉及） ───────────── */");
  lines.push(".ap-block-query-loop article {");
  lines.push("  box-shadow: var(--ap-shadow);");
  lines.push("  transition: transform var(--ap-transition), box-shadow var(--ap-transition);");
  lines.push("}");
  lines.push(".ap-block-query-loop article:hover {");
  lines.push("  transform: translateY(-4px);");
  lines.push("  box-shadow: var(--ap-shadow-hover);");
  lines.push("}");
  lines.push(".ap-block-query-loop article a { text-decoration: none; }");
  lines.push(".ap-block-query-loop article a:hover { color: var(--ap-primary-hover); }");
  lines.push("");
  lines.push("/* ── features 卡片 ────────────────────────────────────────────────── */");
  lines.push(".ap-block-features > div > div > div {");
  lines.push("  box-shadow: var(--ap-shadow);");
  lines.push("  transition: transform var(--ap-transition), box-shadow var(--ap-transition);");
  lines.push("}");
  lines.push(".ap-block-features > div > div > div:hover {");
  lines.push("  transform: translateY(-4px);");
  lines.push("  box-shadow: var(--ap-shadow-hover);");
  lines.push("}");
  lines.push("");
  lines.push("/* ── 富文本（text / columns / html 块内的原生标签） ───────────────── */");
  lines.push(".ap-block-text h2, .ap-block-columns h2 { font-size: 1.5rem; margin: 1.75rem 0 0.75rem; }");
  lines.push(".ap-block-text h3, .ap-block-columns h3 { font-size: 1.25rem; margin: 1.5rem 0 0.6rem; }");
  lines.push(".ap-block-text ul, .ap-block-text ol,");
  lines.push(".ap-block-columns ul, .ap-block-columns ol { margin: 0 0 1.25rem; padding-left: 1.4rem; }");
  lines.push(".ap-block-text blockquote, .ap-block-columns blockquote, .ap-block-html blockquote {");
  lines.push("  margin: 0 0 1.25rem;");
  lines.push("  padding: 1rem 1.25rem;");
  lines.push("  border-left: 4px solid var(--ap-primary);");
  lines.push("  background: var(--ap-surface);");
  lines.push("  border-radius: 0 var(--ap-radius) var(--ap-radius) 0;");
  lines.push("  color: var(--ap-muted);");
  lines.push("}");
  lines.push(".ap-block-text pre, .ap-block-columns pre, .ap-block-html pre {");
  lines.push("  background: var(--ap-surface);");
  lines.push("  padding: 1rem;");
  lines.push("  border-radius: var(--ap-radius);");
  lines.push("  overflow-x: auto;");
  lines.push("}");
  lines.push(".ap-block-text code, .ap-block-columns code, .ap-block-html code {");
  lines.push("  background: var(--ap-surface);");
  lines.push("  padding: 2px 6px;");
  lines.push("  border-radius: 4px;");
  lines.push("  font-size: 0.9em;");
  lines.push("}");
  lines.push(".ap-block-text a, .ap-block-columns a, .ap-block-html a { color: var(--ap-primary); }");
  lines.push(".ap-block-html { font-size: 0.92rem; line-height: 1.75; color: var(--ap-muted); }");
  lines.push("");
  lines.push("/* ── 文章列表 / 正文（BaseLayout 结构类） ─────────────────────────── */");
  lines.push(".post-list-item h2 a:hover { color: var(--ap-primary-hover); }");
  lines.push(".read-more, .post-content a { color: var(--ap-primary); }");
  lines.push(".post-meta { color: var(--ap-muted); }");
  lines.push(".post-content blockquote { border-left-color: var(--ap-primary); background: var(--ap-surface); }");
  lines.push("");
  lines.push("/* ── 品牌色细节 ───────────────────────────────────────────────────── */");
  lines.push("::selection { background: var(--ap-primary); color: #fff; }");
  lines.push("");
  lines.push("/* ── 响应式（此处必须 !important：内联 padding / grid-template-columns） ── */");
  lines.push("@media (max-width: 900px) {");
  lines.push("  .ap-block-hero, .ap-block-text, .ap-block-cta, .ap-block-features,");
  lines.push("  .ap-block-columns, .ap-block-image, .ap-block-form, .ap-block-divider {");
  lines.push("    padding-left: 24px !important;");
  lines.push("    padding-right: 24px !important;");
  lines.push("  }");
  lines.push("  .ap-block-nav { padding-left: 20px !important; padding-right: 20px !important; }");
  lines.push("  .ap-block-query-loop { padding-left: 20px !important; padding-right: 20px !important; }");
  lines.push("  .ap-block-query-loop > div > div { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }");
  lines.push("  .ap-block-features > div > div { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }");
  lines.push("  .ap-block-columns > div { grid-template-columns: minmax(0, 1fr) !important; }");
  lines.push("}");
  lines.push("@media (max-width: 640px) {");
  lines.push("  .ap-block-query-loop > div > div,");
  lines.push("  .ap-block-features > div > div { grid-template-columns: minmax(0, 1fr) !important; }");
  lines.push("  .ap-block-nav {");
  lines.push("    height: auto !important;");
  lines.push("    min-height: 56px;");
  lines.push("    flex-wrap: wrap;");
  lines.push("    row-gap: 2px;");
  lines.push("    padding-top: 8px !important;");
  lines.push("    padding-bottom: 8px !important;");
  lines.push("  }");
  lines.push("  .ap-block-nav nav { width: 100%; }");
  lines.push("  .ap-block-nav nav ul { flex-wrap: wrap; }");
  lines.push("}");
  lines.push("@media (prefers-reduced-motion: reduce) {");
  lines.push("  .ap-block-query-loop article,");
  lines.push("  .ap-block-features > div > div > div { transition: none; }");
  lines.push("  [data-ap-animation] { animation: none !important; }");
  lines.push("}");

  if (f.darkValues.length > 0) {
    lines.push("");
    lines.push("/* ── 暗色模式（默认注释掉：AstroPress 不会给 <html> 加 .dark，block 的");
    lines.push("      背景色也是内联的 rgb 字面量，直接启用会与内联色冲突导致对比度异常。");
    lines.push("      如需启用，请同时改为用变量驱动 block 颜色） ────────────────────");
    lines.push(".dark {");
    lines.push(...f.darkValues);
    lines.push("}");
    lines.push("*/");
  }

  lines.push("/* <<< ap-adapter <<< */");
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// 修复流程
// ────────────────────────────────────────────────────────────────────────────

const report = [];

function fixThemeManifest(dir, log) {
  const p = path.join(dir, "manifest.json");
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));

  const dropped = [];
  for (const key of ["templates", "pages"]) {
    if (Array.isArray(raw[key])) dropped.push(`${key}[${raw[key].length}]`);
  }
  if (dropped.length === 0) return { changed: false };

  // 只保留 upload.ts / import.ts 真正消费的元数据 + tokens
  const next = {
    name: raw.name,
    version: raw.version,
    description: raw.description,
    author: raw.author,
    tokens: raw.tokens,
  };
  // 保留任何我们没预期的自定义字段（避免静默丢数据）
  for (const [k, v] of Object.entries(raw)) {
    if (!(k in next) && !["templates", "pages"].includes(k)) next[k] = v;
  }

  log.push(`manifest.json: 移除 dead ${dropped.join(" + ")}（templates/ 与 pages/ 目录才是导入时的唯一数据源）`);
  if (!DRY) fs.writeFileSync(p, JSON.stringify(next, null, 2) + "\n");
  return { changed: true };
}

function fixThemeJson(dir, sub, log) {
  const dirPath = path.join(dir, sub);
  if (!fs.existsSync(dirPath)) return;
  for (const file of fs.readdirSync(dirPath).filter((f) => f.endsWith(".json"))) {
    const p = path.join(dirPath, file);
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    let touched = false;

    const walk = (blocks) => {
      for (const b of blocks ?? []) {
        if (b?.type !== "query-loop") continue;
        const lid = b.props?.loopTemplateId;
        if (lid === undefined || BUILTIN_LOOP_TEMPLATES.has(String(lid))) continue;
        // 自定义 id 在导入包中没有对应 schema（ThemePackage 不支持携带循环模板）→ 必然回退
        const useImage = b.props?.showImage !== false;
        const next = useImage ? "default-with-image" : "default-no-image";
        log.push(`${sub}/${file}: loopTemplateId "${lid}" → "${next}"（"${lid}" 无对应 schema，原本会静默回退）`);
        b.props.loopTemplateId = next;
        touched = true;
      }
    };

    walk(raw.blocks);
    if (touched && !DRY) fs.writeFileSync(p, JSON.stringify(raw) + "\n");
  }
}

function fixThemeCss(dir, tokens, log) {
  const p = path.join(dir, "theme.css");
  if (!fs.existsSync(p)) return;
  const original = fs.readFileSync(p, "utf8");

  // 幂等：先剥离上一次生成的区块
  let base = stripRegion(stripRegion(original, "ap-fonts"), "ap-adapter").trim();

  // 收集主题声明的非通用字体
  const families = new Set();
  for (const fam of parseFamilies(tokens?.fonts?.heading)) families.add(fam);
  for (const fam of parseFamilies(tokens?.fonts?.body)) families.add(fam);
  const rootVarsForScan = extractRootVars(base);
  for (const n of ["--font-body", "--font-family", "--font-heading", "--font-sans", "--font-title"]) {
    for (const fam of parseFamilies(rootVarsForScan.get(n))) families.add(fam);
  }
  for (const m of base.matchAll(/font-family\s*:\s*([^;}]+)/g)) {
    for (const fam of parseFamilies(m[1])) families.add(fam);
  }

  const { block: fontsBlock, injected } = buildFontImportBlock([...families]);
  const adapterBlock = buildAdapterBlock(collectFacts(base, tokens));

  const out = [fontsBlock, base, adapterBlock].filter(Boolean).join("\n\n") + "\n";

  if (out === original) return;
  if (injected.length > 0) log.push(`theme.css: 注入字体 @import → ${injected.join(", ")}`);
  log.push("theme.css: 追加 AstroPress 适配层（.ap-block-* / 响应式 / 卡片阴影悬停）");
  if (!DRY) fs.writeFileSync(p, out);
}

function main() {
  if (!fs.existsSync(THEMES_DIR)) {
    console.error(`找不到目录: ${THEMES_DIR}`);
    process.exit(1);
  }
  const dirs = fs.readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(THEMES_DIR, e.name))
    .filter((d) => !ONLY || path.basename(d).includes(ONLY))
    .sort();

  let changedThemes = 0;
  let failures = 0;
  for (const dir of dirs) {
    const name = path.basename(dir);
    const log = [];
    let tokens = null;
    try {
      tokens = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")).tokens;
    } catch {}

    const step = (label, fn) => {
      try { fn(); } catch (e) {
        failures++;
        // 不要静默吞掉异常：脚本自身的 bug 必须暴露，否则会出现"报告成功但文件没改"
        console.error(`   ✗ ${label} 失败: ${e.message}`);
        if (e.stack) console.error(e.stack.split("\n").slice(1, 3).join("\n"));
      }
    };

    step("manifest.json", () => fixThemeManifest(dir, log));
    step("templates/", () => fixThemeJson(dir, "templates", log));
    step("pages/", () => fixThemeJson(dir, "pages", log));
    step("theme.css", () => fixThemeCss(dir, tokens, log));

    if (log.length) {
      changedThemes++;
      console.log(`\n▸ ${name}`);
      for (const l of log) console.log(`   · ${l}`);
    }
  }

  console.log("\n" + "═".repeat(72));
  console.log(`${DRY ? "[dry-run] " : ""}处理主题 ${dirs.length} 个，其中有改动 ${changedThemes} 个，失败步骤 ${failures} 个`);
  if (failures > 0) process.exitCode = 1;
  if (DRY) console.log("未写入任何文件。去掉 --dry-run 以实际应用。");
}

main();
