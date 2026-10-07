/**
 * Seeds Base Theme + default header/footer templates into local.db
 * Run from apps/admin: node seed-base-theme.mjs
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

const wpOptions = sqliteTable("wp_options", {
  optionId:    integer("option_id").primaryKey({ autoIncrement: true }),
  optionName:  text("option_name").notNull().unique(),
  optionValue: text("option_value").notNull().default(""),
  autoload:    text("autoload").notNull().default("yes"),
});

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

const DEFAULT_THEME_TOKENS = {
  colors: {
    primary:    "#2271b1",
    secondary:  "#7c3aed",
    background: "#ffffff",
    surface:    "#f8f9fa",
    text:       "#212529",
    textMuted:  "#6c757d",
    border:     "#e9ecef",
  },
  fonts: {
    heading: "system-ui, -apple-system, sans-serif",
    body:    "system-ui, -apple-system, sans-serif",
  },
  spacing: {
    sectionY:     "5rem",
    containerMax: "1200px",
    borderRadius: "0.5rem",
  },
};

async function main() {
  const dbPath = process.env.DATABASE_URL ?? "file:./local.db";
  const client = createClient({ url: dbPath });
  const db = drizzle(client);

  // Read existing themes and merge
  const [existingRow] = await db
    .select({ value: wpOptions.optionValue })
    .from(wpOptions)
    .where({ optionName: "astropress_themes" });

  // Use raw SQL for simpler where clause
  const existingResult = await client.execute(
    "SELECT option_value FROM wp_options WHERE option_name = 'astropress_themes' LIMIT 1"
  );
  const existingThemes = existingResult.rows[0]?.option_value
    ? JSON.parse(existingResult.rows[0].option_value)
    : [];

  if (existingThemes.find((t) => t.id === "base-theme")) {
    console.log("ℹ️  Base Theme already exists — skipping themes insert");
  } else {
    const nowIso = new Date().toISOString();
    const baseTheme = {
      id: "base-theme",
      name: "Base Theme",
      description: "A clean, minimal starter theme — edit to make it yours",
      version: "1.0.0",
      author: "AstroPress",
      tokens: DEFAULT_THEME_TOKENS,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    const updatedThemes = [baseTheme, ...existingThemes];
    await client.execute({
      sql: "INSERT INTO wp_options (option_name, option_value, autoload) VALUES (?, ?, ?) ON CONFLICT(option_name) DO UPDATE SET option_value = excluded.option_value",
      args: ["astropress_themes", JSON.stringify(updatedThemes), "yes"],
    });
    console.log("✓ astropress_themes — Base Theme added");
  }

  // Theme config & active theme (only if not set)
  await client.execute({
    sql: "INSERT OR IGNORE INTO wp_options (option_name, option_value, autoload) VALUES (?, ?, ?)",
    args: ["astropress_theme_config", JSON.stringify(DEFAULT_THEME_TOKENS), "yes"],
  });
  console.log("✓ astropress_theme_config");

  await client.execute({
    sql: "INSERT OR IGNORE INTO wp_options (option_name, option_value, autoload) VALUES (?, ?, ?)",
    args: ["astropress_active_theme", "base-theme", "yes"],
  });
  console.log("✓ astropress_active_theme");

  // Templates
  const templatesResult = await client.execute(
    "SELECT option_value FROM wp_options WHERE option_name = 'astropress_theme_templates' LIMIT 1"
  );
  const existingTemplates = templatesResult.rows[0]?.option_value
    ? JSON.parse(templatesResult.rows[0].option_value)
    : [];

  const nowIso = new Date().toISOString();
  const hId = uid();
  const fId = uid();
  const headerSlug = `__header_${hId}__`;
  const footerSlug  = `__footer_${fId}__`;

  const newTemplates = [
    {
      id: hId, name: "Header 1", type: "header",
      conditions: [{ rule: "entire_site" }],
      schemaSlug: headerSlug, createdAt: nowIso, updatedAt: nowIso,
    },
    {
      id: fId, name: "Footer 1", type: "footer",
      conditions: [{ rule: "entire_site" }],
      schemaSlug: footerSlug, createdAt: nowIso, updatedAt: nowIso,
    },
  ];

  const mergedTemplates = [...existingTemplates, ...newTemplates];
  await client.execute({
    sql: "INSERT INTO wp_options (option_name, option_value, autoload) VALUES (?, ?, ?) ON CONFLICT(option_name) DO UPDATE SET option_value = excluded.option_value",
    args: ["astropress_theme_templates", JSON.stringify(mergedTemplates), "yes"],
  });
  console.log(`✓ astropress_theme_templates (+2 templates)`);

  // Header schema
  const headerSchema = {
    version: 1,
    blocks: [{
      id: uid(), type: "nav",
      props: {
        logo: "AstroPress", logoSize: 22, sticky: false,
        links: [
          { label: "Home",    url: "/" },
          { label: "Blog",    url: "/blog" },
          { label: "About",   url: "/about" },
          { label: "Contact", url: "/contact" },
        ],
        align: "right", background: "#ffffff", textColor: "#1d2327", borderBottom: true,
      },
    }],
  };
  await client.execute({
    sql: "INSERT OR IGNORE INTO wp_options (option_name, option_value, autoload) VALUES (?, ?, ?)",
    args: [`astropress_page_schema_${headerSlug}`, JSON.stringify(headerSchema), "no"],
  });
  console.log(`✓ astropress_page_schema_${headerSlug}`);

  // Footer schema
  const year = new Date().getFullYear();
  const footerSchema = {
    version: 1,
    blocks: [{
      id: uid(), type: "html",
      props: {
        html: `<footer style="background:#1d2327;color:#a7aaad;padding:48px 24px;text-align:center"><div style="max-width:1200px;margin:0 auto"><div style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap;margin-bottom:24px"><a href="/" style="color:#a7aaad;text-decoration:none">Home</a><a href="/blog" style="color:#a7aaad;text-decoration:none">Blog</a><a href="/about" style="color:#a7aaad;text-decoration:none">About</a><a href="/contact" style="color:#a7aaad;text-decoration:none">Contact</a></div><p style="margin:0;font-size:13px">© ${year} Your Site. Built with AstroPress.</p></div></footer>`,
      },
    }],
  };
  await client.execute({
    sql: "INSERT OR IGNORE INTO wp_options (option_name, option_value, autoload) VALUES (?, ?, ?)",
    args: [`astropress_page_schema_${footerSlug}`, JSON.stringify(footerSchema), "no"],
  });
  console.log(`✓ astropress_page_schema_${footerSlug}`);

  console.log("\n✅ Base Theme seed complete!");
  console.log(`   Header slug: ${headerSlug}`);
  console.log(`   Footer slug: ${footerSlug}`);
  console.log(`\n   Open: http://localhost:4321/admin/themes`);

  client.close();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
