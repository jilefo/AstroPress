import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../schema/sqlite/index";

export function createD1Db(binding: D1Database) {
  return drizzle(binding, { schema });
}

export type D1Db = ReturnType<typeof createD1Db>;
