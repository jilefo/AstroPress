import { defineMiddleware } from "astro:middleware";
import { createDatabase, createD1Database } from "@astropress/core";

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

let _localDb: Awaited<ReturnType<typeof createDatabase>> | null = null;
async function getLocalDb() {
  if (!_localDb) _localDb = await createDatabase(await getDbUrl());
  return _localDb;
}

export const onRequest = defineMiddleware(async (context, next) => {
  // In dev always use local DB; in production use D1 if available.
  const d1 = !import.meta.env.DEV
    ? (context.locals as any).runtime?.env?.DB as D1Database | undefined
    : undefined;
  context.locals.db = d1 ? createD1Database(d1) : await getLocalDb();
  return next();
});
