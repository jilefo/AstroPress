#!/usr/bin/env node
/**
 * import-wp-themes.mjs — 批量导入 wp-themes/ 主题包到数据库
 *
 * 不修改 AstroPress 任何核心源文件。
 * 读取 wp-themes/ 下的主题包（manifest.json + theme.css + templates/ + pages/），
 * 按照 import.ts 的数据契约写入 wp_options / wp_posts，使主题可通过管理后台激活。
 *
 * 仅依赖 @libsql/client（从 workspace 包解析），不依赖 drizzle-orm。
 *
 * 用法:
 *   node scripts/import-wp-themes.mjs                    # 导入所有主题
 *   node scripts/import-wp-themes.mjs --only=argon       # 只导入名字含 argon 的主题
 *   node scripts/import-wp-themes.mjs --activate=argon   # 导入并激活指定主题
 *   node scripts/import-wp-themes.mjs --dry-run          # 预览模式，不写盘
 *   node scripts/import-wp-themes.mjs --reset            # 清除旧主题数据后重新导入
 *
 * 幂等：可重复运行。已存在的主题（按 name 检测）会跳过，不会覆盖。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const THEMES_DIR = path.join(ROOT, "wp-themes");

// ── 从 workspace 包解析 @libsql/client（ESM 动态 import） ───────────────────────

const resolvePaths = [
  path.join(ROOT, "packages/core/node_modules/@libsql/client"),
  path.join(ROOT, "apps/admin/node_modules/@libsql/client"),
];

let createClient;
for (const p of resolvePaths) {
  if (fs.existsSync(p)) {
    try {
      const mod = await import(pathToFileURL(p).href);
      createClient = mod.createClient;
      break;
    } catch {}
  }
}
if (!createClient) {
  // 回退：尝试默认解析
  try {
    const mod = await import("@libsql/client");
    createClient = mod.createClient;
  } catch {}
}
if (!createClient) {
  console.error("无法找到 @libsql/client。请确认已运行 pnpm install。");
  process.exit(1);
}

// ── CLI 参数解析 ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RESET = args.includes("--reset");
const ONLY = args.find((a) => a.startsWith("--only="))?.slice("--only=".length) ?? null;
const ACTIVATE = args.find((a) => a.startsWith("--activate="))?.slice("--activate=".length) ?? null;

// ── 工具函数 ────────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

/** 按模板 type 返回合理的显示条件 */
function conditionsForType(type) {
  const map = {
    "header":      "entire_site",
    "footer":      "entire_site",
    "single-post": "all_posts",
    "single-page": "all_pages",
    "archive":     "entire_site",
    "search":      "entire_site",
    "404":         "entire_site",
  };
  return [{ rule: map[type] || "entire_site" }];
}

// ── 数据库辅助函数（纯 SQL，不依赖 drizzle-orm） ────────────────────────────────

async function getOption(client, name) {
  const result = await client.execute({
    sql: "SELECT option_value FROM wp_options WHERE option_name = ? LIMIT 1",
    args: [name],
  });
  return result.rows[0]?.option_value ?? null;
}

async function setOption(client, name, value, autoload = "yes") {
  await client.execute({
    sql: `INSERT INTO wp_options (option_name, option_value, autoload)
          VALUES (?, ?, ?)
          ON CONFLICT(option_name) DO UPDATE SET option_value = excluded.option_value`,
    args: [name, value, autoload],
  });
}

async function insertPost(client, fields) {
  const keys = Object.keys(fields);
  const placeholders = keys.map(() => "?").join(", ");
  const result = await client.execute({
    sql: `INSERT INTO wp_posts (${keys.map(k => {
      // Map JS field names to DB column names
      const colMap = {
        postAuthor: "post_author", postDate: "post_date", postDateGmt: "post_date_gmt",
        postContent: "post_content", postTitle: "post_title", postExcerpt: "post_excerpt",
        postStatus: "post_status", commentStatus: "comment_status", pingStatus: "ping_status",
        postPassword: "post_password", postName: "post_name", toPing: "to_ping",
        pinged: "pinged", postModified: "post_modified", postModifiedGmt: "post_modified_gmt",
        postContentFiltered: "post_content_filtered", postParent: "post_parent",
        guid: "guid", menuOrder: "menu_order", postType: "post_type",
        postMimeType: "post_mime_type", commentCount: "comment_count",
      };
      return colMap[k] || k;
    }).join(", ")}) VALUES (${placeholders})`,
    args: keys.map(k => fields[k]),
  });
  return result.lastInsertRowid;
}

async function updatePost(client, id, fields) {
  const sets = Object.keys(fields).map(k => {
    const colMap = {
      postTitle: "post_title", postStatus: "post_status",
      postModified: "post_modified", postModifiedGmt: "post_modified_gmt",
    };
    return `${colMap[k] || k} = ?`;
  }).join(", ");
  await client.execute({
    sql: `UPDATE wp_posts SET ${sets} WHERE ID = ?`,
    args: [...Object.values(fields), id],
  });
}

// ── 读取主题包 ──────────────────────────────────────────────────────────────────

function readThemePackage(themeDir) {
  const manifestPath = path.join(themeDir, "manifest.json");
  const cssPath = path.join(themeDir, "theme.css");
  const templatesDir = path.join(themeDir, "templates");
  const pagesDir = path.join(themeDir, "pages");

  if (!fs.existsSync(manifestPath)) {
    return { error: "manifest.json not found" };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  // 校验 tokens 必需字段
  if (!manifest.tokens) {
    return { error: "manifest.json missing tokens field" };
  }
  const requiredColors = ["primary", "secondary", "background", "surface", "text", "textMuted", "border"];
  for (const key of requiredColors) {
    if (!manifest.tokens.colors?.[key]) {
      return { error: `manifest.json tokens.colors missing "${key}"` };
    }
  }

  let css = "";
  if (fs.existsSync(cssPath)) {
    css = fs.readFileSync(cssPath, "utf-8");
  }

  // 读取模板文件
  const templates = [];
  if (fs.existsSync(templatesDir)) {
    for (const file of fs.readdirSync(templatesDir).filter((f) => f.endsWith(".json"))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(templatesDir, file), "utf-8"));
        templates.push(data);
      } catch (e) {
        console.warn(`  ⚠ 模板文件解析失败: ${file} — ${e.message}`);
      }
    }
  }

  // 读取页面文件
  const pages = [];
  if (fs.existsSync(pagesDir)) {
    for (const file of fs.readdirSync(pagesDir).filter((f) => f.endsWith(".json"))) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(pagesDir, file), "utf-8"));
        pages.push(data);
      } catch (e) {
        console.warn(`  ⚠ 页面文件解析失败: ${file} — ${e.message}`);
      }
    }
  }

  return { manifest, css, templates, pages };
}

// ── 主流程 ──────────────────────────────────────────────────────────────────────

async function main() {
  const dbPath = process.env.DATABASE_URL ?? "file:./local.db";
  const client = createClient({ url: dbPath });

  console.log(`🎨 AstroPress wp-themes 批量导入工具`);
  console.log(`   数据库: ${dbPath}`);
  console.log(`   主题目录: ${THEMES_DIR}`);
  if (DRY_RUN) console.log(`   模式: 预览（不写盘）`);
  if (RESET) console.log(`   模式: 清除旧数据后重新导入`);
  console.log();

  // 1. 扫描主题目录
  let themeDirs = fs.readdirSync(THEMES_DIR).filter((name) => {
    if (!name.endsWith("-theme")) return false;
    const full = path.join(THEMES_DIR, name);
    return fs.statSync(full).isDirectory();
  });

  if (ONLY) {
    themeDirs = themeDirs.filter((d) => d.includes(ONLY));
    console.log(`   过滤: --only=${ONLY} → ${themeDirs.length} 个主题`);
  }

  console.log(`   发现 ${themeDirs.length} 个主题包\n`);

  if (themeDirs.length === 0) {
    console.log("没有找到匹配的主题包。");
    client.close();
    return;
  }

  // 2. 可选：清除旧数据
  if (RESET && !DRY_RUN) {
    console.log("🗑  清除旧主题数据...");
    const allResult = await client.execute("SELECT option_name FROM wp_options WHERE option_name LIKE 'astropress_%'");
    const optionNames = allResult.rows.map((r) => r.option_name);

    const themeRelatedKeys = optionNames.filter((name) =>
      name === "astropress_themes" ||
      name === "astropress_active_theme" ||
      name === "astropress_theme_config" ||
      name === "astropress_theme_templates" ||
      name === "astropress_template_slots" ||
      name.startsWith("astropress_theme_css_") ||
      name.startsWith("astropress_page_schema___") // 模板 schema slugs
    );

    for (const key of themeRelatedKeys) {
      await client.execute({ sql: "DELETE FROM wp_options WHERE option_name = ?", args: [key] });
    }
    console.log(`   已清除 ${themeRelatedKeys.length} 个选项\n`);
  }

  // 3. 读取现有数据（非 RESET 模式下用于追加）
  let existingThemes = [];
  let existingTemplates = [];
  let existingSlots = {};

  if (!RESET) {
    const themesRaw = await getOption(client, "astropress_themes");
    if (themesRaw) {
      try { existingThemes = JSON.parse(themesRaw); } catch {}
    }
    const templatesRaw = await getOption(client, "astropress_theme_templates");
    if (templatesRaw) {
      try { existingTemplates = JSON.parse(templatesRaw); } catch {}
    }
    const slotsRaw = await getOption(client, "astropress_template_slots");
    if (slotsRaw) {
      try { existingSlots = JSON.parse(slotsRaw); } catch {}
    }
  }

  // 4. 逐个导入主题
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  let lastThemeSlots = {};

  for (const dirName of themeDirs) {
    const themeDir = path.join(THEMES_DIR, dirName);
    const pkg = readThemePackage(themeDir);

    if (pkg.error) {
      console.log(`  ✗ ${dirName}: ${pkg.error}`);
      errors++;
      continue;
    }

    const { manifest, css, templates: tmplDefs, pages: pageDefs } = pkg;
    const themeName = manifest.name || dirName;

    // 检查是否已存在（按 name 去重）
    if (existingThemes.some((t) => t.name === themeName)) {
      console.log(`  – ${dirName}: 已存在，跳过`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  ✓ ${dirName}: ${themeName} (${tmplDefs.length} 模板, ${pageDefs.length} 页面)`);
      imported++;
      continue;
    }

    const nowIso = new Date().toISOString();
    const themeId = dirName.replace(/-theme$/, ""); // e.g. "argon-theme" → "argon"

    // 4a. 创建主题记录
    const newTheme = {
      id: themeId,
      name: themeName,
      description: manifest.description || "",
      author: manifest.author || "",
      version: manifest.version || "1.0.0",
      tokens: manifest.tokens,
      source: "seed",
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    existingThemes.push(newTheme);

    // 4b. 存储自定义 CSS
    if (css) {
      await setOption(client, `astropress_theme_css_${themeId}`, css, "no");
    }

    // 4c. 创建模板
    const themeSlots = {};
    for (const tmplDef of tmplDefs) {
      const tmplId = uid();
      const schemaSlug = `__${tmplDef.type}_${tmplId}__`;

      existingTemplates.push({
        id: tmplId,
        name: tmplDef.name || `${themeName} ${tmplDef.type}`,
        type: tmplDef.type,
        conditions: conditionsForType(tmplDef.type),
        schemaSlug,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      // 写入 schema blocks
      const blocks = (tmplDef.blocks ?? []).map((b) => ({ ...b, id: uid() }));
      await setOption(
        client,
        `astropress_page_schema_${schemaSlug}`,
        JSON.stringify({ version: 1, blocks }),
        "no"
      );

      themeSlots[tmplDef.type] = schemaSlug;
    }

    // 记录最后一个主题的槽位（用于后续设置）
    lastThemeSlots = themeSlots;

    // 4d. 创建页面
    let frontPageId = null;
    for (const pageDef of pageDefs) {
      const rawSlug = String(pageDef.slug || "").trim();
      const isHomePage = rawSlug === "/" || rawSlug === "";
      const slug = isHomePage ? "home" : rawSlug.replace(/^\//, "");
      if (!slug) continue;

      // 检查页面是否已存在
      const existing = await client.execute({
        sql: "SELECT ID FROM wp_posts WHERE post_name = ? AND post_type = 'page' LIMIT 1",
        args: [slug],
      });

      let postId;
      if (existing.rows.length > 0) {
        postId = Number(existing.rows[0].ID);
        await updatePost(client, postId, {
          postTitle: pageDef.title,
          postStatus: "publish",
          postModified: nowIso,
          postModifiedGmt: nowIso,
        });
      } else {
        postId = Number(await insertPost(client, {
          postTitle: pageDef.title,
          postName: slug,
          postStatus: "publish",
          postType: "page",
          postContent: "",
          postExcerpt: "",
          postAuthor: 0,
          postDate: nowIso,
          postDateGmt: nowIso,
          postModified: nowIso,
          postModifiedGmt: nowIso,
          commentStatus: "closed",
          pingStatus: "closed",
          postParent: 0,
          menuOrder: 0,
          postMimeType: "",
          guid: `/${slug}`,
          commentCount: 0,
          toPing: "",
          pinged: "",
          postContentFiltered: "",
          postPassword: "",
        }));
      }

      if (postId) {
        const blocks = (pageDef.blocks ?? []).map((b) => ({ ...b, id: uid() }));
        await setOption(
          client,
          `astropress_page_schema_${slug}`,
          JSON.stringify({ version: 1, blocks }),
          "no"
        );
        if (isHomePage) frontPageId = postId;
      }
    }

    // 如果是首页，设置 show_on_front
    if (frontPageId) {
      await setOption(client, "show_on_front", "page");
      await setOption(client, "page_on_front", String(frontPageId));
    }

    console.log(`  ✓ ${dirName}: ${themeName} (${Object.keys(themeSlots).length} 模板, ${pageDefs.length} 页面)`);
    imported++;
  }

  // 5. 批量写入主题列表和模板列表
  if (!DRY_RUN && imported > 0) {
    await setOption(client, "astropress_themes", JSON.stringify(existingThemes), "yes");
    await setOption(client, "astropress_theme_templates", JSON.stringify(existingTemplates), "yes");

    // 合并槽位：保留已有槽位，用最后导入的主题覆盖
    const mergedSlots = { ...existingSlots, ...lastThemeSlots };
    await setOption(client, "astropress_template_slots", JSON.stringify(mergedSlots), "yes");

    // 如果指定了 --activate，激活对应主题
    if (ACTIVATE) {
      const activateTheme = existingThemes.find((t) => t.name.includes(ACTIVATE) || t.id.includes(ACTIVATE));
      if (activateTheme) {
        await setOption(client, "astropress_active_theme", activateTheme.id, "yes");
        await setOption(client, "astropress_theme_config", JSON.stringify(activateTheme.tokens), "yes");
        console.log(`\n🎯 已激活主题: ${activateTheme.name}`);
      } else {
        console.warn(`\n⚠ 未找到匹配 "${ACTIVATE}" 的主题，未设置激活状态`);
      }
    }
  }

  // 6. 汇总
  console.log(`\n${"─".repeat(50)}`);
  if (DRY_RUN) {
    console.log(`预览完成: ${imported} 个主题将被导入`);
  } else {
    console.log(`导入完成: ${imported} 个导入, ${skipped} 个跳过, ${errors} 个错误`);
    if (imported > 0) {
      console.log(`\n下一步:`);
      console.log(`  1. 启动管理后台: pnpm dev (或 turbo dev)`);
      console.log(`  2. 访问 http://localhost:4321/admin/themes`);
      console.log(`  3. 选择并激活一个主题`);
    }
  }

  client.close();
}

main().catch((err) => {
  console.error("\n❌ 导入失败:", err);
  process.exit(1);
});
