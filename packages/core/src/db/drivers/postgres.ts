import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../schema/postgres/index";

export function createPostgresDb(url: string) {
  const client = postgres(url, { max: 10 });
  return drizzle(client, { schema });
}

export type PostgresDb = ReturnType<typeof createPostgresDb>;
