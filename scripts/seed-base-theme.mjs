/**
 * Seeds Base Theme + default header/footer templates into local.db
 * Run: node scripts/seed-base-theme.mjs
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
    sectionY:      "5rem",
    containerMax:  "1200px",
    borderRadius:  "0.5rem",
  },
};

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./local.db";
  const client = createClient({ url });
  const db = drizzle(client);

  console.log("🎨 Seeding Base Theme...");

  const nowIso = new Date().toISOString();
  const hId = uid();
  const fId = uid();
  const headerSlug = `__header_${hId}__`;
  const footerSlug  = `__footer_${fId}__`;

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

  const seedTemplates = [
    {
      id: hId,
      name: "Header 1",
      type: "header",
      conditions: [{ rule: "entire_site" }],
      schemaSlug: headerSlug,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: fId,
      name: "Footer 1",
      type: "footer",
      conditions: [{ rule: "entire_site" }],
      schemaSlug: footerSlug,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  const headerSchema = {
    version: 1,
    blocks: [
      {
        id: uid(),
        type: "nav",
        props: {
          logo: "AstroPress",
          logoSize: 22,
          sticky: false,
          links: [
            { label: "Home",    url: "/" },
            { label: "Blog",    url: "/blog" },
            { label: "About",   url: "/about" },
            { label: "Contact", url: "/contact" },
          ],
          align: "right",
          background: "#ffffff",
          textColor: "#1d2327",
          borderBottom: true,
        },
      },
    ],
  };

  const year = new Date().getFullYear();
  const footerSchema = {
    version: 1,
    blocks: [
      {
        id: uid(),
        type: "html",
        props: {
          html: `<footer style="background:#1d2327;color:#a7aaad;padding:48px 24px;text-align:center"><div style="max-width:1200px;margin:0 auto"><div style="display:flex;justify-content:center;gap:24px;flex-wrap:wrap;margin-bottom:24px"><a href="/" style="color:#a7aaad;text-decoration:none">Home</a><a href="/blog" style="color:#a7aaad;text-decoration:none">Blog</a><a href="/about" style="color:#a7aaad;text-decoration:none">About</a><a href="/contact" style="color:#a7aaad;text-decoration:none">Contact</a></div><p style="margin:0;font-size:13px">© ${year} Your Site. Built with AstroPress.</p></div></footer>`,
        },
      },
    ],
  };

  const rows = [
    { optionName: "astropress_themes",          optionValue: JSON.stringify([baseTheme]),    autoload: "yes" },
    { optionName: "astropress_active_theme",     optionValue: "base-theme",                  autoload: "yes" },
    { optionName: "astropress_theme_config",     optionValue: JSON.stringify(DEFAULT_THEME_TOKENS), autoload: "yes" },
    { optionName: "astropress_theme_templates",  optionValue: JSON.stringify(seedTemplates), autoload: "yes" },
    { optionName: `astropress_page_schema_${headerSlug}`, optionValue: JSON.stringify(headerSchema), autoload: "no" },
    { optionName: `astropress_page_schema_${footerSlug}`, optionValue: JSON.stringify(footerSchema), autoload: "no" },
  ];

  let inserted = 0;
  let skipped  = 0;
  for (const row of rows) {
    try {
      await db.insert(wpOptions).values(row).onConflictDoNothing();
      inserted++;
      console.log(`  ✓ ${row.optionName}`);
    } catch (e) {
      skipped++;
      console.log(`  – ${row.optionName} (skipped, already exists)`);
    }
  }

  console.log(`\n✅ Done — ${inserted} rows inserted, ${skipped} skipped`);
  console.log(`   Header slug: ${headerSlug}`);
  console.log(`   Footer slug: ${footerSlug}`);

  client.close();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
