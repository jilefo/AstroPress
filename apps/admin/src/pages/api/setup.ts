import type { APIRoute } from "astro";
import { wpUsers, wpOptions } from "@astropress/core/schema";
import { hashPassword } from "@astropress/auth";
import { eq } from "drizzle-orm";

export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const db = locals.db;
  if (!db) return redirect("/setup?error=unknown");

  // Guard: don't allow re-setup
  try {
    const [done] = await db
      .select()
      .from(wpOptions)
      .where(eq(wpOptions.optionName, "astropress_setup_complete"))
      .limit(1);
    if (done?.optionValue === "1") return redirect("/admin/dashboard");
  } catch {
    // table may not exist yet — continue with setup
  }

  const body = await request.text();
  const form = new URLSearchParams(body);
  const siteTitle = form.get("site_title")?.trim() ?? "";
  const siteUrl = form.get("site_url")?.trim() ?? "";
  const tagline = form.get("tagline")?.trim() ?? "";
  const adminEmail = form.get("admin_email")?.trim() ?? "";
  const password = form.get("admin_password") ?? "";
  const password2 = form.get("admin_password2") ?? "";

  if (!siteTitle || !siteUrl || !adminEmail || !password) {
    return redirect("/setup?error=fields");
  }
  if (password !== password2) {
    return redirect("/setup?error=password");
  }

  try {
    const now = new Date().toISOString().replace("T", " ").slice(0, 19);
    const hashedPass = await hashPassword(password);

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

    const options = [
      { optionName: "siteurl", optionValue: siteUrl },
      { optionName: "blogname", optionValue: siteTitle },
      { optionName: "blogdescription", optionValue: tagline || "又一个 AstroPress 站点" },
      { optionName: "admin_email", optionValue: adminEmail },
      { optionName: "posts_per_page", optionValue: "10" },
      { optionName: "active_plugins", optionValue: "a:0:{}" },
      { optionName: "template", optionValue: "default" },
      { optionName: "stylesheet", optionValue: "default" },
      { optionName: "permalink_structure", optionValue: "/%year%/%monthnum%/%day%/%postname%/" },
      { optionName: "astropress_version", optionValue: "0.0.1" },
      { optionName: "astropress_db_version", optionValue: "1" },
      { optionName: "astropress_setup_complete", optionValue: "1" },
    ];

    for (const opt of options) {
      await db
        .insert(wpOptions)
        .values(opt)
        .onConflictDoUpdate({
          target: wpOptions.optionName,
          set: { optionValue: opt.optionValue },
        });
    }

    return redirect("/setup/complete");
  } catch (err) {
    console.error("Setup error:", err);
    return redirect("/setup?error=unknown");
  }
};
