import { defineMiddleware } from "astro:middleware";
import { createDatabase, createD1Database } from "@astropress/core";
import { createAuth, type Auth } from "@astropress/auth";
import { wpOptions } from "@astropress/core/schema";
import { eq } from "drizzle-orm";
import { bootstrapPlugins } from "./plugins";
import { registerPostType, registerTaxonomy, getPostType, getTaxonomy, registerFieldGroup, getFieldGroup } from "@astropress/core/registry";
import { autoMigrate } from "./lib/autoMigrate";

// Ensure Lucia module augmentation is in scope
type _AuthRef = Auth;

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/setup", "/api/setup"];
const PUBLIC_PREFIXES = ["/forms/", "/api/forms/submit"];
// Public form API: GET /api/forms/<id> (single form, no entries)
function isPublicFormApi(pathname: string, method: string): boolean {
  if (method !== "GET") return false;
  const m = pathname.match(/^\/api\/forms\/([^/]+)$/);
  return !!m;
}

// Database URL: integration config → env var → sensible default (no .env needed)
let _dbUrl: string | null = null;
async function getDbUrl(): Promise<string> {
  if (_dbUrl) return _dbUrl;
  try {
    const { database } = await import("virtual:astropress/config");
    if (database?.url) { _dbUrl = database.url; return _dbUrl!; }
  } catch { /* virtual module not set up yet */ }
  _dbUrl = import.meta.env.DATABASE_URL ?? "file:./local.db";
  return _dbUrl!;
}

// Singleton local DB connection (re-used across requests in the same process)
let _localDb: Awaited<ReturnType<typeof createDatabase>> | null = null;
async function getLocalDb() {
  if (!_localDb) _localDb = await createDatabase(await getDbUrl());
  return _localDb;
}

// Load custom post types/taxonomies from DB into registry (once per process)
let _customTypesLoaded = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadCustomTypes(db: any) {
  if (_customTypesLoaded) return;
  _customTypesLoaded = true;
  try {
    const rows = await db
      .select({ name: wpOptions.optionName, value: wpOptions.optionValue })
      .from(wpOptions)
      .where(eq(wpOptions.optionName, "astropress_custom_post_types"));
    const ptRow = rows[0];
    if (ptRow?.value) {
      const types = JSON.parse(ptRow.value) as Array<{ key: string; config?: Record<string, unknown> } & Record<string, unknown>>;
      for (const t of types) {
        if (!getPostType(t.key)) {
          // Support both storage formats: nested { key, config:{} } and flat { key, label, ... }
          const cfg = t.config ?? t;
          const { key: _k, ...rest } = cfg as any;
          registerPostType(t.key, { ...rest, custom: true } as any);
        }
      }
    }
  } catch {}
  try {
    const rows = await db
      .select({ name: wpOptions.optionName, value: wpOptions.optionValue })
      .from(wpOptions)
      .where(eq(wpOptions.optionName, "astropress_custom_taxonomies"));
    const txRow = rows[0];
    if (txRow?.value) {
      const taxs = JSON.parse(txRow.value) as Array<{ key: string } & Record<string, unknown>>;
      for (const t of taxs) {
        if (!getTaxonomy(t.key)) registerTaxonomy(t.key, { ...t, custom: true } as any);
      }
    }
  } catch {}
  try {
    const rows = await db
      .select({ value: wpOptions.optionValue })
      .from(wpOptions)
      .where(eq(wpOptions.optionName, "astropress_field_groups"))
      .limit(1);
    if (rows[0]?.value) {
      const groups = JSON.parse(rows[0].value) as any[];
      for (const g of groups) {
        if (!getFieldGroup(g.id)) registerFieldGroup(g);
      }
    }
  } catch {}
}

export const onRequest = defineMiddleware(async (context, next) => {
  bootstrapPlugins();

  const { pathname } = new URL(context.request.url);

  // In dev mode always use local DB — never touch D1 (avoids empty local D1 simulation).
  // In production, prefer D1 binding if present (Cloudflare Pages).
  const d1 = !import.meta.env.DEV
    ? (context.locals as any).runtime?.env?.DB as D1Database | undefined
    : undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = d1 ? createD1Database(d1) : await getLocalDb();
  context.locals.db = db;
  await autoMigrate(db);
  await loadCustomTypes(db);

  // Check setup completion (skip on setup routes)
  // Any route outside /admin and /api is a public web route (no auth required)
  const isPublicWebRoute = !pathname.startsWith("/admin") && !pathname.startsWith("/api");
  const isPublic = isPublicWebRoute
    || PUBLIC_PATHS.some((p) => pathname.startsWith(p))
    || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
    || isPublicFormApi(pathname, context.request.method);

  if (!isPublic) {
    try {
      const [row] = await db
        .select({ value: wpOptions.optionValue })
        .from(wpOptions)
        .where(eq(wpOptions.optionName, "astropress_setup_complete"))
        .limit(1);

      if (!row || row.value !== "1") {
        return context.redirect("/setup");
      }
    } catch {
      return context.redirect("/setup");
    }
  }

  // Auth check for protected routes
  if (!isPublic) {
    const auth = createAuth(db as Parameters<typeof createAuth>[0]);
    const sessionId = context.cookies.get(auth.sessionCookieName)?.value ?? null;

    if (!sessionId) return context.redirect("/login");

    const { session, user } = await auth.validateSession(sessionId);

    if (!session) {
      const blank = auth.createBlankSessionCookie();
      context.cookies.set(blank.name, blank.value, blank.attributes);
      return context.redirect("/login");
    }

    if (session.fresh) {
      const cookie = auth.createSessionCookie(session.id);
      context.cookies.set(cookie.name, cookie.value, cookie.attributes);
    }

    const attrs = user as unknown as {
      userLogin: string;
      userEmail: string;
      displayName: string;
    };
    context.locals.user = {
      id: Number(user.id),
      userLogin: attrs.userLogin,
      userEmail: attrs.userEmail,
      displayName: attrs.displayName,
    };
  }

  return next();
});
