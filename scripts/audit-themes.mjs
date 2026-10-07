#!/usr/bin/env node
/**
 * AstroPress theme package auditor
 *
 * Validates every theme package under wp-themes/ against the *actual* runtime
 * contract implemented by:
 *   - apps/admin/src/pages/api/themes/upload.ts   (package format)
 *   - apps/admin/src/pages/api/themes/import.ts   (install semantics)
 *   - apps/web/src/components/BlockRenderer.astro (front-end block rendering)
 *   - apps/admin/src/islands/ThemeEditor.tsx      (editor prop contract)
 *   - packages/core/src/types/theme.ts            (BLOCK_DEFAULTS = canonical props)
 *
 * Usage:
 *   node scripts/audit-themes.mjs            # human report
 *   node scripts/audit-themes.mjs --json     # machine readable
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const THEMES_DIR = process.env.AP_THEMES_DIR
  ? path.resolve(ROOT, process.env.AP_THEMES_DIR)
  : path.join(ROOT, "wp-themes");

// ────────────────────────────────────────────────────────────────────────────
// Runtime contract
// ────────────────────────────────────────────────────────────────────────────

const BLOCK_TYPES = new Set([
  "hero", "text", "image", "columns", "cta", "features", "form", "nav",
  "site-title", "spacer", "divider", "html", "ai", "query-loop",
  "loop-image", "loop-title", "loop-excerpt", "loop-date", "loop-author",
  "loop-category", "loop-read-more", "loop-custom-field",
]);

const TEMPLATE_TYPES = new Set([
  "header", "footer", "single-post", "single-page", "archive", "404", "search",
]);

/** Template types the front-end actually consumes (BaseLayout 消费 header/footer，页面级槽位由 templateSlot 属性消费). */
const LIVE_TEMPLATE_TYPES = new Set(["header", "footer", "404"]);

const SHARED_PROPS = ["_cssClass", "_animation", "_customCss", "_element"];

const PROPS = {
  hero: ["heading", "subtext", "buttonText", "buttonUrl", "bgColor", "textColor", "align", "height"],
  text: ["content", "align", "bgColor", "textColor"],
  image: ["src", "alt", "caption", "align", "width"],
  columns: ["cols", "gap", "leftContent", "rightContent", "ratio", "bgColor", "textColor", "align"],
  cta: ["heading", "text", "buttonText", "buttonUrl", "bgColor", "textColor"],
  features: ["heading", "subtext", "cols", "items", "bgColor", "textColor", "cardBg", "mutedColor"],
  form: ["formId", "formTitle"],
  nav: ["align", "style", "logoText"],
  "site-title": ["showTagline", "size", "align"],
  spacer: ["height"],
  divider: ["style", "color", "thickness"],
  html: ["content"],
  ai: ["prompt"],
  "query-loop": [
    "postType", "perPage", "columns", "orderBy", "order", "showImage", "showDate",
    "showExcerpt", "showAuthor", "showCategory", "imageHeight", "gap", "cardBg",
    "cardBorder", "cardRadius", "padding", "loopTemplateId", "pagination",
    "pageLimit", "loadMoreText",
  ],
  "loop-image": ["height", "objectFit", "borderRadius", "showPlaceholder", "layout", "width"],
  "loop-title": ["tag", "size", "weight", "linked", "color"],
  "loop-excerpt": ["length", "size", "color"],
  "loop-date": ["format", "size", "color"],
  "loop-author": ["prefix", "size", "color"],
  "loop-category": ["size", "badge", "color"],
  "loop-read-more": ["text", "buttonStyle", "size", "color"],
  "loop-custom-field": ["fieldKey", "label", "showLabel", "size", "color", "labelColor", "fallback"],
};

/** Props that MUST be present & non-empty or the block renders nothing useful. */
const REQUIRED_PROPS = {
  hero: ["heading"],
  text: ["content"],
  html: ["content"],
  image: ["src"],
  cta: ["heading"],
  features: ["items"],
  "query-loop": ["postType", "loopTemplateId"],
  form: ["formId"],
  "loop-custom-field": ["fieldKey"],
};

const ENUMS = {
  align: new Set(["left", "center", "right"]),
  width: new Set(["normal", "wide", "full"]),
  "site-title.size": new Set(["small", "medium", "large"]),
  "divider.style": new Set(["solid", "dashed", "dotted"]),
  orderBy: new Set(["date", "title", "menuOrder", "id", "modified", "rand"]),
  pagination: new Set(["none", "numbers", "prev-next", "load-more", "infinite-scroll"]),
  "loop-title.tag": new Set(["h1", "h2", "h3", "h4", "h5", "h6", "div", "span"]),
  "loop-read-more.buttonStyle": new Set(["link", "button", "outline"]),
  "loop-image.objectFit": new Set(["cover", "contain", "fill"]),
};

const ORDER_BY_OK = new Set(["asc", "desc"]); // compared case-insensitively

/** Known-good loop template ids (BlockRenderer DEFAULT_LOOP_TEMPLATE_BLOCKS). */
const BUILTIN_LOOP_TEMPLATES = new Set([
  "default-with-image", "default-no-image", "default-horizontal", "default-magazine",
]);

/** Prop-key aliases produced by naive WP→AstroPress porting. */
const PROP_ALIASES = {
  html: { html: "content", body: "content", code: "content" },
  text: { html: "content", body: "content", text: "content" },
  nav: { logo: "logoText", brand: "logoText", siteName: "logoText", sticky: null, logoSize: null, links: null, background: null, textColor: null, borderBottom: null },
  hero: { title: "heading", subtitle: "subtext", description: "subtext", buttonLabel: "buttonText", href: "buttonUrl", backgroundColor: "bgColor", color: "textColor" },
  cta: { title: "heading", description: "text", subtitle: "text", buttonLabel: "buttonText", href: "buttonUrl", backgroundColor: "bgColor", color: "textColor" },
  image: { url: "src", image: "src", imageUrl: "src", alternativeText: "alt", title: "caption" },
  features: { title: "heading", subtitle: "subtext", description: "subtext", backgroundColor: "bgColor" },
  "query-loop": { count: "perPage", limit: "perPage", type: "postType", itemsPerPage: "perPage", showTitle: null, orderby: "orderBy", layout: null },
  divider: { height: "thickness", backgroundColor: "color" },
  spacer: { size: "height", gap: "height" },
};

// ────────────────────────────────────────────────────────────────────────────
// AstroPress real DOM (what theme.css must target to have any effect)
// ────────────────────────────────────────────────────────────────────────────

/** Emitted by BaseLayout.astro + BlockRenderer.astro. */
const REAL_CLASSES = new Set([
  // BaseLayout structure
  "site-wrapper", "site-header", "site-branding", "site-description", "site-nav",
  "site-main", "site-footer", "not-found", "post-list", "post-list-item",
  "post-meta", "post-excerpt", "read-more", "pagination", "current",
  "post-header", "post-content", "wp-block-image", "ap-blocks",
  // BlockRenderer wrappers
  "ap-block", "ap-block-hero", "ap-block-text", "ap-block-image", "ap-block-cta",
  "ap-block-features", "ap-block-columns", "ap-block-form", "ap-block-nav",
  "ap-block-site-title", "ap-block-spacer", "ap-block-divider", "ap-block-html",
  "ap-block-query-loop",
]);

/**
 * CSS custom properties AstroPress actually injects into :root.
 * Anything else used without being defined locally is a broken reference.
 */
const INJECTED_VARS = new Set([
  "--color-primary", "--color-primary-hover", "--color-bg", "--color-surface",
  "--color-border", "--color-text", "--color-muted",
  "--font-sans", "--font-heading",
  "--max-width", "--radius-md", "--radius-sm", "--section-y",
  // defined by the bundled default theme
  "--font-serif", "--font-mono", "--header-height", "--shadow-sm", "--shadow-md",
]);

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const read = (p) => fs.readFileSync(p, "utf8");

function readJson(p) {
  try {
    return { ok: true, value: JSON.parse(read(p)) };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function walk(dir, filter, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, out);
    else if (!filter || filter(full)) out.push(full);
  }
  return out;
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/** Rough CSS colour sanity check. */
const CSS_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-zA-Z]+|transparent|currentColor|inherit|none)$/;

function looksLikeCssColor(v) {
  if (!isNonEmptyString(v)) return false;
  const s = v.trim();
  if (/^(undefined|null|nan|\{\{|\$\{)/i.test(s)) return false;
  return CSS_COLOR_RE.test(s);
}

const ADAPTER_MARKER = ">>> ap-adapter >>>";

/** Normalise a CSS colour so `#333` and `#333333` compare equal. */
function normalizeColor(value) {
  const v = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "");
  const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  const shortAlpha = v.match(/^#([0-9a-f]{3})([0-9a-f])$/);
  if (shortAlpha) {
    const [r, g, b] = shortAlpha[1];
    return `#${r}${r}${g}${g}${b}${b}${shortAlpha[2]}${shortAlpha[2]}`;
  }
  return v;
}

/** Extract `--var: value` declarations from a CSS string. */
function extractVarDefs(css) {
  const defs = new Map();
  for (const m of css.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)[;}]/g)) {
    const name = m[1];
    const value = m[2].trim();
    if (!defs.has(name)) defs.set(name, []);
    defs.get(name).push(value);
  }
  return defs;
}

function extractVarUses(css) {
  const uses = new Map();
  for (const m of css.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,[^)]*)?\)/g)) {
    uses.set(m[1], (uses.get(m[1]) || 0) + 1);
  }
  return uses;
}

function extractClassSelectors(css) {
  // Strip comments & at-rule preludes, then collect .class tokens from selectors.
  const stripped = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@[^{]+/g, " ");
  const classes = new Map();
  // Only look at the selector portion (before '{').
  for (const m of stripped.matchAll(/([^{}]+)\{/g)) {
    const selector = m[1];
    for (const c of selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      const name = c[1];
      classes.set(name, (classes.get(name) || 0) + 1);
    }
  }
  return classes;
}

function extractMediaQueries(css) {
  return [...css.matchAll(/@media\s*([^{]+)\{/g)].map((m) => m[1].trim());
}

/** Values declared specifically inside a top-level `:root { ... }` block. */
function extractRootVars(css) {
  const out = new Map();
  for (const m of css.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const d of m[1].matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;}]+)/g)) {
      if (!out.has(d[1])) out.set(d[1], d[2].trim());
    }
  }
  return out;
}

/** Vars that get a different value in a non-:root scope (i.e. dark-mode / theme-switch overrides). */
function extractScopedOverrides(css) {
  const out = new Set();
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = m[1].trim();
    if (/:root/.test(selector)) continue;
    for (const d of m[2].matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) out.add(d[1]);
  }
  return out;
}

const GENERIC_FAMILIES = new Set([
  "system-ui", "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto",
  "helvetica neue", "helvetica", "arial", "sans-serif", "serif", "monospace",
  "cursive", "fantasy", "georgia", "times new roman", "times", "courier new",
  "courier", "consolas", "monaco", "menlo", "fira code", "ui-sans-serif",
  "ui-serif", "ui-monospace", "pingfang sc", "hiragino sans gb",
  "microsoft yahei", "simsun", "noto sans", "noto serif", "inherit",
  "initial", "unset", "revert", "emoji", "apple color emoji", "segoe ui emoji",
  "segoe ui symbol", "noto color emoji", "liberation sans", "dejavu sans",
]);

function extractFontFamilies(str) {
  if (typeof str !== "string") return [];
  // 先整体剔除 var(--x, fallback)，否则 fallback 内的逗号会被误判为字体分隔符
  const cleaned = str.replace(/var\([^)]*\)/g, "");
  return cleaned
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, "").toLowerCase())
    .filter((s) => s && !s.includes("(") && !s.includes(")") && !s.startsWith("$"));
}

// ────────────────────────────────────────────────────────────────────────────
// Per-theme audit
// ────────────────────────────────────────────────────────────────────────────

function auditTheme(dir) {
  const name = path.basename(dir);
  const issues = []; // { level: 'error'|'warn'|'info', code, msg, fix? }

  const add = (level, code, msg, fix) => issues.push({ level, code, msg, fix });

  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    add("error", "manifest/missing", "manifest.json 不存在");
    return finish(name, issues, null);
  }

  const mj = readJson(manifestPath);
  if (!mj.ok) {
    add("error", "manifest/parse", `manifest.json 不是合法 JSON: ${mj.error}`);
    return finish(name, issues, null);
  }
  const manifest = mj.value;

  // ── 1. core metadata ──────────────────────────────────────────────────────
  if (!isNonEmptyString(manifest.name)) add("error", "manifest/name", "manifest.name 缺失或为空");

  // ── 2. tokens ─────────────────────────────────────────────────────────────
  const t = manifest.tokens;
  if (!t) {
    add("error", "tokens/missing", "缺少 tokens —— upload API 会直接拒绝（'missing tokens'）");
  } else {
    const COLOR_KEYS = ["primary", "secondary", "background", "surface", "text", "textMuted", "border"];
    if (!t.colors) add("error", "tokens/colors", "tokens.colors 缺失");
    else {
      for (const k of COLOR_KEYS) {
        if (!looksLikeCssColor(t.colors[k])) {
          add("error", "tokens/color", `tokens.colors.${k} 不是合法 CSS 颜色: ${JSON.stringify(t.colors[k])}`);
        }
      }
      const extra = Object.keys(t.colors).filter((k) => !COLOR_KEYS.includes(k));
      if (extra.length) add("info", "tokens/color-extra", `tokens.colors 含未被平台映射的键: ${extra.join(", ")}（不会生成 CSS 变量）`);
    }
    if (!t.fonts) add("error", "tokens/fonts", "tokens.fonts 缺失");
    else {
      for (const k of ["heading", "body"]) {
        if (!isNonEmptyString(t.fonts[k])) add("error", "tokens/font", `tokens.fonts.${k} 缺失或为空`);
      }
    }
    if (!t.spacing) add("error", "tokens/spacing", "tokens.spacing 缺失");
    else {
      for (const k of ["sectionY", "containerMax", "borderRadius"]) {
        if (!isNonEmptyString(t.spacing[k])) add("error", "tokens/spacing-key", `tokens.spacing.${k} 缺失或为空`);
      }
    }
  }

  // ── 3. folder payload ─────────────────────────────────────────────────────
  const templatesDir = path.join(dir, "templates");
  const pagesDir = path.join(dir, "pages");
  const folderTemplates = fs.existsSync(templatesDir)
    ? fs.readdirSync(templatesDir).filter((f) => f.endsWith(".json"))
    : [];
  const folderPages = fs.existsSync(pagesDir)
    ? fs.readdirSync(pagesDir).filter((f) => f.endsWith(".json"))
    : [];

  if (folderTemplates.length === 0) add("error", "templates/none", "templates/ 目录下没有任何 .json");
  if (folderPages.length === 0) add("info", "pages/none", "pages/ 目录为空 —— 安装后不会创建任何页面");

  // inline arrays in manifest are OVERRIDDEN by the folder scan (upload.ts assembleMultiFilePackage)
  const inlineTemplates = Array.isArray(manifest.templates) ? manifest.templates : null;
  const inlinePages = Array.isArray(manifest.pages) ? manifest.pages : null;
  if (inlineTemplates) {
    add("warn", "manifest/dead-inline",
      `manifest.templates[${inlineTemplates.length}] 是死数据 —— upload.ts 会用 templates/*.json 覆盖它，两处不一致会造成误导`);
  }
  if (inlinePages) {
    add("warn", "manifest/dead-inline",
      `manifest.pages[${inlinePages.length}] 是死数据 —— upload.ts 会用 pages/*.json 覆盖它`);
  }

  // ── 4. templates ──────────────────────────────────────────────────────────
  const seenTemplateTypes = [];
  for (const file of folderTemplates) {
    const full = path.join(templatesDir, file);
    const j = readJson(full);
    if (!j.ok) {
      add("error", "template/parse", `templates/${file} 不是合法 JSON: ${j.error}`);
      continue;
    }
    const tpl = j.value;
    const key = `templates/${file}`;

    if (!TEMPLATE_TYPES.has(tpl.type)) {
      add("error", "template/type", `${key}: type="${tpl.type}" 不在合法枚举 ${[...TEMPLATE_TYPES].join("|")}`);
    } else {
      seenTemplateTypes.push(tpl.type);
      if (!LIVE_TEMPLATE_TYPES.has(tpl.type)) {
        add("info", "template/inert",
          `${key}: type="${tpl.type}" 会被导入数据库，但前台没有任何页面消费该模板槽位 —— 该模板不会生效`);
      }
    }
    if (!isNonEmptyString(tpl.name)) add("warn", "template/name", `${key}: name 缺失或为空`);

    auditBlocks(tpl.blocks, key, add);
  }

  if (!seenTemplateTypes.includes("header")) add("warn", "template/no-header", "没有 header 模板 —— 前台会回退到默认 header");
  if (!seenTemplateTypes.includes("footer")) add("warn", "template/no-footer", "没有 footer 模板 —— 前台会回退到默认 footer");

  // ── 5. pages ──────────────────────────────────────────────────────────────
  const RESERVED_SLUGS = new Set(["blog", "admin", "api", "forms", "media", "login", "setup", "wp-admin", "wp-login"]);
  for (const file of folderPages) {
    const full = path.join(pagesDir, file);
    const j = readJson(full);
    if (!j.ok) {
      add("error", "page/parse", `pages/${file} 不是合法 JSON: ${j.error}`);
      continue;
    }
    const page = j.value;
    const key = `pages/${file}`;

    if (!isNonEmptyString(page.title)) add("warn", "page/title", `${key}: title 缺失或为空`);
    if (!isNonEmptyString(page.slug)) {
      add("error", "page/slug", `${key}: slug 缺失`);
    } else {
      const slug = String(page.slug);
      const normalized = slug === "/" || slug === "" ? "home" : slug.replace(/^\//, "");
      if (RESERVED_SLUGS.has(normalized)) {
        add("error", "page/slug-reserved",
          `${key}: slug="${slug}" 与 AstroPress 路由冲突（${normalized} 已被文件路由占用），该页面不可达`);
      }
      if (/\s/.test(slug)) add("error", "page/slug-space", `${key}: slug 含空白字符 "${slug}"`);
      if (/[A-Z]/.test(slug)) add("warn", "page/slug-case", `${key}: slug 含大写字母 "${slug}"，建议小写`);
    }
    auditBlocks(page.blocks, key, add);
  }

  // ── 6. theme.css ──────────────────────────────────────────────────────────
  const cssPath = path.join(dir, "theme.css");
  let css = null;
  if (!fs.existsSync(cssPath)) {
    add("info", "css/missing", "没有 theme.css（可选）");
  } else {
    css = read(cssPath);
    if (!css.trim()) {
      add("warn", "css/empty", "theme.css 是空文件");
      css = null;
    }
  }

  let cssStats = null;
  if (css) {
    // 注释掉的规则（例如被注释的暗色模式区块）不参与变量统计
    const live = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const defs = extractVarDefs(live);
    const uses = extractVarUses(live);
    const classes = extractClassSelectors(live);
    const medias = extractMediaQueries(live);
    const rootVars = extractRootVars(live);
    const scopedOverrides = extractScopedOverrides(live);
    const hasAdapter = css.includes(ADAPTER_MARKER);

    for (const [v, count] of uses) {
      if (!defs.has(v) && !INJECTED_VARS.has(v)) {
        add("error", "css/var-undefined", `theme.css 使用了未定义变量 ${v}（出现 ${count} 次）—— 浏览器会忽略该声明`);
      }
    }
    for (const v of defs.keys()) {
      if (uses.has(v)) continue;
      if (v.startsWith("--ap-")) {
        add("warn", "adapter/var-unused", `适配层定义了 ${v} 但从未使用（生成器死代码，应使用或删除）`);
      } else {
        add("info", "css/var-unused", `theme.css 定义了 ${v} 但从未使用`);
      }
    }
    if (scopedOverrides.size > 0) {
      add("info", "css/scoped-vars", `存在作用域覆盖变量（暗色模式等）: ${[...scopedOverrides].join(", ")}`);
    }

    const deadClasses = [...classes.keys()].filter((c) => !REAL_CLASSES.has(c) && !c.startsWith("wp-") && !c.startsWith("ap-"));
    const apBlockClasses = [...classes.keys()].filter((c) => c.startsWith("ap-block") || c === "ap-blocks");
    const deadRatio = classes.size ? deadClasses.length / classes.size : 0;

    if (!hasAdapter) {
      if (classes.size > 0 && apBlockClasses.length === 0) {
        add("error", "css/inert",
          `theme.css 有 ${classes.size} 个 class 选择器，其中 ${deadClasses.length} 个（${Math.round(deadRatio * 100)}%）在 AstroPress 的 DOM 中不存在，且没有任何 .ap-block-* 规则 —— 该 CSS 对前台无效。示例: ${deadClasses.slice(0, 6).join(", ")}`);
      } else if (deadRatio > 0.5 && deadClasses.length > 3) {
        add("warn", "css/dead-selectors",
          `theme.css 中 ${deadClasses.length}/${classes.size} 个 class 选择器在 AstroPress DOM 中不存在（且无适配层标记）。示例: ${deadClasses.slice(0, 6).join(", ")}`);
      }
    }
    if (!hasAdapter) add("error", "css/no-adapter", "theme.css 缺少 AstroPress 适配层（未针对 .ap-block-* / .site-* 编写规则）");

    if (medias.length === 0) {
      add("warn", "css/no-responsive", "theme.css 没有任何 @media 规则 —— 移动端布局可能溢出（.ap-block-nav 为固定高度 flex 行）");
    }

    // token ↔ css 变量一致性：只比较 :root 作用域的值
    // （BaseLayout 注入的 inline :root 在 theme.css 之后，会覆盖同名变量）
    if (t?.colors) {
      for (const [varName, tokenKey] of [
        ["--color-primary", "primary"], ["--color-bg", "background"],
        ["--color-surface", "surface"], ["--color-border", "border"],
        ["--color-text", "text"], ["--color-muted", "textMuted"],
      ]) {
        const cssVal = rootVars.get(varName);
        if (cssVal === undefined) continue;
        const tokenVal = String(t.colors[tokenKey] ?? "").trim();
        if (normalizeColor(cssVal) !== normalizeColor(tokenVal)) {
          add("warn", "css/token-conflict",
            `theme.css :root 的 ${varName}=${cssVal} 与 tokens.colors.${tokenKey}=${tokenVal} 不一致；实际生效的是 token 值 ${tokenVal}`);
        }
      }
    }

    // 排版字体：AstroPress 不注入任何 <link>/@font-face，因此未加载的字体必然回退
    const declaredFonts = new Set();
    for (const fam of extractFontFamilies(t?.fonts?.heading)) declaredFonts.add(fam);
    for (const fam of extractFontFamilies(t?.fonts?.body)) declaredFonts.add(fam);
    for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/g)) {
      for (const fam of extractFontFamilies(m[1])) declaredFonts.add(fam);
    }
    const loadsFonts = /@import\s+url\(|@font-face/.test(css);
    const remoteFonts = [...declaredFonts].filter((f) => !GENERIC_FAMILIES.has(f));
    if (remoteFonts.length && !loadsFonts) {
      add("warn", "font/not-loaded",
        `引用了未加载的字体 ${remoteFonts.join(", ")} —— AstroPress 不会注入字体 <link> 或 @font-face，实际会回退到系统字体（可用 theme.css 顶部 @import 修复）`);
    }

    cssStats = {
      bytes: Buffer.byteLength(css, "utf8"),
      varDefs: defs.size,
      varUses: uses.size,
      classes: classes.size,
      deadClasses: deadClasses.length,
      apBlockRules: apBlockClasses.length,
      mediaQueries: medias.length,
      hasAdapter,
    };
  }

  // ── 7. 重复的模板定义（manifest inline vs folder） ────────────────────────
  if (inlineTemplates) {
    const inlineTypes = inlineTemplates.map((x) => x?.type).filter(Boolean).sort();
    const folderTypes = seenTemplateTypes.slice().sort();
    if (JSON.stringify(inlineTypes) !== JSON.stringify(folderTypes)) {
      add("warn", "manifest/divergence",
        `manifest.templates 的 type 列表 [${inlineTypes.join(",")}] 与 templates/ 目录 [${folderTypes.join(",")}] 不一致`);
    }
  }

  return finish(name, issues, { manifest, cssStats, templates: seenTemplateTypes, pages: folderPages.length });
}

function auditBlocks(blocks, where, add) {
  if (!Array.isArray(blocks)) {
    add("error", "blocks/not-array", `${where}: blocks 不是数组`);
    return;
  }
  if (blocks.length === 0) {
    add("warn", "blocks/empty", `${where}: blocks 为空数组 —— 该模板/页面渲染为空`);
    return;
  }

  const ids = new Set();
  blocks.forEach((b, i) => {
    const at = `${where} → blocks[${i}]`;
    if (!b || typeof b !== "object") {
      add("error", "block/not-object", `${at}: 不是对象`);
      return;
    }
    if (!isNonEmptyString(b.id)) add("error", "block/id", `${at}: 缺少 id（编辑器与 query-loop 依赖它做 DOM id）`);
    else if (ids.has(b.id)) add("warn", "block/id-dup", `${at}: id "${b.id}" 在同一文件内重复`);
    else ids.add(b.id);

    if (!BLOCK_TYPES.has(b.type)) {
      add("error", "block/type", `${at}: type="${b.type}" 不是合法 block 类型`);
      return;
    }
    if (!b.props || typeof b.props !== "object" || Array.isArray(b.props)) {
      add("error", "block/props", `${at}: props 缺失或不是对象`);
      return;
    }

    const allowed = new Set([...(PROPS[b.type] || []), ...SHARED_PROPS]);
    const aliases = PROP_ALIASES[b.type] || {};

    for (const key of Object.keys(b.props)) {
      if (allowed.has(key)) continue;
      if (Object.prototype.hasOwnProperty.call(aliases, key)) {
        const target = aliases[key];
        add("warn", "block/prop-alias",
          `${at} (${b.type}): props.${key} 会被渲染器忽略${target ? `，应改为 props.${target}` : "，建议删除"}`);
      } else {
        add("warn", "block/prop-unknown",
          `${at} (${b.type}): 未知 prop "${key}" —— 渲染器不会读取它`);
      }
    }

    // required props
    for (const key of REQUIRED_PROPS[b.type] || []) {
      const v = b.props[key];
      const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
      if (empty) add("error", "block/prop-required", `${at} (${b.type}): 必填 props.${key} 为空 —— 该块渲染不出内容`);
    }

    // enums
    const checkEnum = (enumKey, value, propName) => {
      if (value === undefined || value === null) return;
      const set = ENUMS[enumKey];
      if (!set) return;
      const s = String(value);
      if (!set.has(s)) {
        add("warn", "block/enum", `${at} (${b.type}): props.${propName}="${s}" 不在合法值 ${[...set].join("|")}`);
      }
    };
    checkEnum("align", b.props.align, "align");
    if (b.type === "image") checkEnum("width", b.props.width, "width");
    if (b.type === "site-title") checkEnum("site-title.size", b.props.size, "size");
    if (b.type === "divider") checkEnum("divider.style", b.props.style, "style");
    if (b.type === "loop-title") checkEnum("loop-title.tag", b.props.tag, "tag");
    if (b.type === "loop-read-more") checkEnum("loop-read-more.buttonStyle", b.props.buttonStyle, "buttonStyle");
    if (b.type === "query-loop") {
      checkEnum("orderBy", b.props.orderBy, "orderBy");
      checkEnum("pagination", b.props.pagination, "pagination");
      if (b.props.order !== undefined && !ORDER_BY_OK.has(String(b.props.order).toLowerCase())) {
        add("warn", "block/enum", `${at}: props.order="${b.props.order}" 应为 ASC/DESC`);
      }
      const lid = b.props.loopTemplateId;
      if (lid !== undefined && !BUILTIN_LOOP_TEMPLATES.has(String(lid))) {
        add("info", "block/loop-template",
          `${at}: loopTemplateId="${lid}" 是自定义循环模板，需存在 astropress_page_schema___loop-item_${lid}__ 才会生效，否则回退到默认`);
      }
      const perPage = Number(b.props.perPage);
      if (b.props.perPage !== undefined && (!Number.isFinite(perPage) || perPage <= 0)) {
        add("warn", "block/perPage", `${at}: perPage=${JSON.stringify(b.props.perPage)} 无效`);
      }
      const cols = Number(b.props.columns);
      if (b.props.columns !== undefined && (!Number.isFinite(cols) || cols < 1 || cols > 6)) {
        add("warn", "block/columns", `${at}: columns=${JSON.stringify(b.props.columns)} 超出 1-6 合理范围`);
      }
    }

    // nested html sanity
    const htmlContent = b.type === "html" ? b.props.content : null;
    if (typeof htmlContent === "string") {
      if (htmlContent.includes("<script")) add("warn", "block/html-script", `${at}: html 块含 <script>（会被内联执行，注意安全/可能被 CSP 拦）`);
      if (/href="#"/.test(htmlContent)) add("info", "block/html-dead-link", `${at}: html 块含 href="#" 占位链接`);
      if (/\{\{|undefined|NaN/.test(htmlContent)) add("error", "block/html-placeholder", `${at}: html 块含未替换的模板占位符`);
    }
  });
}

function finish(name, issues, meta) {
  const order = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => order[a.level] - order[b.level]);
  return {
    name,
    issues,
    counts: {
      error: issues.filter((i) => i.level === "error").length,
      warn: issues.filter((i) => i.level === "warn").length,
      info: issues.filter((i) => i.level === "info").length,
    },
    meta,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

function main() {
  const asJson = process.argv.includes("--json");

  if (!fs.existsSync(THEMES_DIR)) {
    console.error(`找不到目录: ${THEMES_DIR}`);
    process.exit(1);
  }

  const dirs = fs
    .readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(THEMES_DIR, e.name))
    .sort();

  const results = dirs.map(auditTheme);

  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const totals = { error: 0, warn: 0, info: 0 };
  for (const r of results) {
    totals.error += r.counts.error;
    totals.warn += r.counts.warn;
    totals.info += r.counts.info;
    const tag = r.counts.error ? "FAIL" : r.counts.warn ? "WARN" : " OK ";
    console.log(`\n[${tag}] ${r.name}  (E${r.counts.error} W${r.counts.warn} I${r.counts.info})`);
    const byCode = new Map();
    for (const i of r.issues) {
      if (!byCode.has(i.code)) byCode.set(i.code, []);
      byCode.get(i.code).push(i);
    }
    for (const [code, list] of byCode) {
      const level = list[0].level.toUpperCase();
      console.log(`   ${level.padEnd(5)} ${code} ×${list.length}`);
      for (const i of list.slice(0, 3)) console.log(`         — ${i.msg}`);
      if (list.length > 3) console.log(`         … 另有 ${list.length - 3} 条同类`);
    }
  }

  // ── global summary ───────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(72));
  console.log(`主题总数: ${results.length}   错误: ${totals.error}   警告: ${totals.warn}   提示: ${totals.info}`);

  const codeTotals = new Map();
  for (const r of results) for (const i of r.issues) codeTotals.set(i.code, (codeTotals.get(i.code) || 0) + 1);
  console.log("\n问题类型分布（按影响主题数）:");
  [...codeTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([code, n]) => console.log(`  ${String(n).padStart(3)} × ${code}`));

  const failing = results.filter((r) => r.counts.error > 0);
  console.log(`\n存在 error 的主题: ${failing.length}/${results.length}`);
}

main();
