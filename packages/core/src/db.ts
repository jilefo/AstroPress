/**
 * @deprecated Import from "@astropress/core" or "@astropress/core/db" instead.
 * This file is kept for backwards compatibility only.
 */
export {
  createDatabase,
  createD1Database,
  createDb,
  createLocalDb,
  inferDriver,
} from "./db/index";
export type { AnyDatabase, Database, DatabaseDriver } from "./db/index";
