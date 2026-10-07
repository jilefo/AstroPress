// Default schema export (SQLite — covers LibSQL, D1, better-sqlite3).
// Import @astropress/core/schema/postgres for the PostgreSQL variant.
// Both schemas expose the same table and column names for runtime compatibility.
export * from "./sqlite/index";

// Named namespace re-exports for migrations tooling and adapter selection
export * as sqliteSchema from "./sqlite/index";
export * as pgSchema from "./postgres/index";
