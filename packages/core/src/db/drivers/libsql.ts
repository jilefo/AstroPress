import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../../schema/sqlite/index";

export function createLibsqlDb(url: string, authToken?: string) {
  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

export type LibsqlDb = ReturnType<typeof createLibsqlDb>;
