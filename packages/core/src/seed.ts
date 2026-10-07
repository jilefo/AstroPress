/**
 * Seed script — creates initial admin user and default options.
 * Run via: pnpm db:seed
 *
 * Requires environment variables:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, SITE_TITLE, SITE_URL
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { wpUsers, wpOptions } from "./schema/index";
import { DEFAULT_THEME_TOKENS } from "./types/theme";
// Use the same hashing function as the runtime auth package
import { hashPassword } from "@astropress/auth";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./local.db";
  const client = createClient({ url });
  const db = drizzle(client);

  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "changeme";
  const siteTitle = process.env.SITE_TITLE ?? "My AstroPress Site";
  const siteUrl = process.env.SITE_URL ?? "http://localhost:4321";

  console.log("🌱 Seeding database...");

  // Create admin user
  const hashedPass = await hashPassword(adminPassword);
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  await db.insert(wpUsers).values({
    userLogin: "admin",
    userPass: hashedPass,
    userNicename: "admin",
    userEmail: adminEmail,
    userUrl: siteUrl,
    userRegistered: now,
    userStatus: 0,
    displayName: "Admin",
  });

  // Default options (mirrors WordPress defaults)
  const options = [
    { optionName: "siteurl", optionValue: siteUrl },
    { optionName: "blogname", optionValue: siteTitle },
    { optionName: "blogdescription", optionValue: "Just another AstroPress site" },
    { optionName: "admin_email", optionValue: adminEmail },
    { optionName: "posts_per_page", optionValue: "10" },
    { optionName: "active_plugins", optionValue: "a:0:{}" },
    { optionName: "template", optionValue: "default" },
    { optionName: "stylesheet", optionValue: "default" },
    { optionName: "permalink_structure", optionValue: "/%year%/%monthnum%/%day%/%postname%/" },
    { optionName: "upload_path", optionValue: "" },
    { optionName: "astropress_version", optionValue: "0.0.1" },
    { optionName: "astropress_db_version", optionValue: "1" },
  ];

  for (const option of options) {
    await db.insert(wpOptions).values(option).onConflictDoNothing();
  }

  // ── Base Theme ────────────────────────────────────────────────────────────
  console.log("🎨 Seeding Base Theme...");

  const hId = uid();
  const fId = uid();
  const headerSlug = `__header_${hId}__`;
  const footerSlug  = `__footer_${fId}__`;
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

  const themeOptions = [
    {
      optionName: "astropress_themes",
      optionValue: JSON.stringify([baseTheme]),
      autoload: "yes" as const,
    },
    {
      optionName: "astropress_active_theme",
      optionValue: "base-theme",
      autoload: "yes" as const,
    },
    {
      optionName: "astropress_theme_config",
      optionValue: JSON.stringify(DEFAULT_THEME_TOKENS),
      autoload: "yes" as const,
    },
    {
      optionName: "astropress_theme_templates",
      optionValue: JSON.stringify(seedTemplates),
      autoload: "yes" as const,
    },
    {
      optionName: `astropress_page_schema_${headerSlug}`,
      optionValue: JSON.stringify(headerSchema),
      autoload: "no" as const,
    },
    {
      optionName: `astropress_page_schema_${footerSlug}`,
      optionValue: JSON.stringify(footerSchema),
      autoload: "no" as const,
    },
  ];

  for (const opt of themeOptions) {
    await db.insert(wpOptions).values(opt).onConflictDoNothing();
  }

  console.log("✅ Seed complete!");
  console.log(`   Admin user: admin / ${adminPassword}`);
  console.log(`   Site URL: ${siteUrl}`);
  console.log(`   Base Theme seeded (header slug: ${headerSlug})`);

  client.close();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
