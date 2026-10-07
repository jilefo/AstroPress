import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as sqliteSchema from "../schema/sqlite/index";

export type { LibsqlDb } from "./drivers/libsql";
export type { D1Db } from "./drivers/d1";
export type { PostgresDb } from "./drivers/postgres";
export { sqlAll, sqlOne, sqlRun, deriveColumns, likeNeedle, LIKE_NEEDLE_MAX, safeJsonParse } from "./raw";
export type { WriteMeta } from "./raw";

/** Supported database driver identifiers. */
export type DatabaseDriver = "libsql" | "postgres" | "d1";

/**
 * Universal database handle.
 * All Drizzle instances share the same query API at runtime.
 * Use this type for function parameters that accept any backend.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDatabase = any;

/** Legacy alias — prefer AnyDatabase for new code. */
export type Database = AnyDatabase;

/**
 * Infer the database driver from a DATABASE_URL string.
 * postgres:// / postgresql:// → postgres
 * Everything else → libsql (file:// Turso, libsql://, etc.)
 */
export function inferDriver(url: string): "postgres" | "libsql" {
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return "postgres";
  }
  return "libsql";
}

/**
 * Create a database connection from a DATABASE_URL string.
 * Drivers are loaded dynamically to avoid bundling unused adapters.
 *
 * @example
 * // LibSQL / local SQLite
 * const db = await createDatabase("file:./local.db");
 *
 * // Turso
 * const db = await createDatabase("libsql://your-db.turso.io", { authToken: "..." });
 *
 * // PostgreSQL (Neon, Supabase, Railway, self-hosted)
 * const db = await createDatabase("postgresql://user:pass@host/dbname");
 */
export async function createDatabase(
  url: string,
  opts?: { authToken?: string }
): Promise<AnyDatabase> {
  const driver = inferDriver(url);

  if (driver === "postgres") {
    const { createPostgresDb } = await import("./drivers/postgres");
    return createPostgresDb(url);
  }

  const { createLibsqlDb } = await import("./drivers/libsql");
  return createLibsqlDb(url, opts?.authToken);
}

/**
 * Create a database connection from a Cloudflare D1 binding.
 * This is synchronous and does not need dynamic import.
 */
export function createD1Database(binding: D1Database): AnyDatabase {
  return drizzleD1(binding, { schema: sqliteSchema });
}

// ─── Legacy exports for backwards compatibility ────────────────────────────────

/** @deprecated Use createDatabase() instead */
export async function createLocalDb(url: string, opts?: { authToken?: string }) {
  return createDatabase(url, opts);
}

/** @deprecated Use createD1Database() instead */
export function createDb(d1: D1Database) {
  return createD1Database(d1);
}
