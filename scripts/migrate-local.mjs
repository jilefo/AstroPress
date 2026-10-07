import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbUrl = process.env.DATABASE_URL ?? "file:./local.db";

// Resolve @libsql/client from apps/admin (which has it as a direct dep)
const require = createRequire(
  pathToFileURL(join(__dirname, "../apps/admin/package.json"))
);
const { createClient } = require("@libsql/client");

const client = createClient({ url: dbUrl });

const migrationFile = join(__dirname, "../packages/core/migrations/0000_pale_luminals.sql");
const sql = await readFile(migrationFile, "utf-8");

// Make CREATE TABLE idempotent — safe to run multiple times
const idempotentSql = sql.replace(
  /CREATE TABLE (`[^`]+`|\w+)/g,
  "CREATE TABLE IF NOT EXISTS $1"
);

// Split on drizzle-kit statement breakpoints
const statements = idempotentSql
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Applying ${statements.length} migration statements to ${dbUrl}...`);

let applied = 0;
let skipped = 0;
for (const stmt of statements) {
  try {
    await client.execute(stmt);
    applied++;
  } catch (err) {
    // Skip "already exists" errors for indexes — indexes don't support IF NOT EXISTS in older SQLite
    if (err.message?.includes("already exists")) {
      skipped++;
    } else {
      console.error("Migration error:", err.message);
      console.error("Statement:", stmt.slice(0, 120));
      process.exit(1);
    }
  }
}

// Also apply FTS migration if available
const ftsMigration = join(__dirname, "../migrations/sqlite/0002_fts.sql");
try {
  const ftsSql = await readFile(ftsMigration, "utf-8");
  const ftsStatements = ftsSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));
  for (const stmt of ftsStatements) {
    try {
      await client.execute(stmt);
    } catch {
      // FTS table/trigger already exists — ignore
    }
  }
  console.log("✅ FTS migration applied!");
} catch {
  // FTS migration file not found — skip silently
}

console.log(`✅ Migrations applied! (${applied} run, ${skipped} already existed)`);
client.close();
