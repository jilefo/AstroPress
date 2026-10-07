/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />
/// <reference types="@astropress/core/virtual" />

type CloudflareEnv = {
  DB: D1Database;
  SITE_URL?: string;
};

declare namespace App {
  interface Locals extends import("@astrojs/cloudflare").Runtime<CloudflareEnv> {
    db?: import("@astropress/core").Database | Awaited<ReturnType<typeof import("@astropress/core").createLocalDb>>;
  }
}
