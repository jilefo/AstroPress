import { Hono } from "hono";
import type { Database } from "@astropress/core";

export type Env = {
  DB: D1Database;
  R2: R2Bucket;
};

export type Variables = {
  db: Database;
};

export function createApi() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.get("/health", (c) => c.json({ status: "ok", version: "0.0.1" }));

  return app;
}

export type ApiApp = ReturnType<typeof createApi>;
