/**
 * @astropress/core/integration
 *
 * Astro integration for AstroPress — configure everything in astro.config.ts,
 * no .env file required.
 *
 * @example
 * // astro.config.ts
 * import { defineConfig } from "astro/config";
 * import { astropress } from "@astropress/core/integration";
 *
 * export default defineConfig({
 *   integrations: [
 *     astropress({
 *       database: { url: "file:./local.db" },
 *     }),
 *   ],
 * });
 */

import type { AstroIntegration } from "astro";

// ─── Config types ─────────────────────────────────────────────────────────────

export interface DatabaseConfig {
  /** Connection URL.
   * - `file:./local.db`            → SQLite via LibSQL
   * - `libsql://...`               → Turso
   * - `postgresql://user:pass@.../db` → PostgreSQL
   * Omit on Cloudflare Pages — the D1 binding is detected automatically.
   */
  url?: string;
  /** Turso auth token — only needed for `libsql://` URLs. */
  authToken?: string;
}

export interface StorageConfig {
  /** Storage driver.
   * - `"local"` — writes to the local filesystem (default in dev)
   * - `"r2"`    — Cloudflare R2 (auto-detected from runtime binding)
   * - `"s3"`    — S3-compatible (requires S3_BUCKET, S3_ENDPOINT env vars)
   */
  driver?: "local" | "r2" | "s3";
  /** Local storage: directory for uploads (default: `"./public/media"`) */
  directory?: string;
  /** Public base URL for media files (default: `"/media"`) */
  baseUrl?: string;
}

export interface AstroPressConfig {
  /** Database connection. Defaults to `file:./local.db` (local SQLite). */
  database?: DatabaseConfig;
  /** Media storage. Defaults to local filesystem. */
  storage?: StorageConfig;
  /**
   * Public URL of the site (e.g. `"https://example.com"`).
   * Detected from request context if omitted.
   */
  siteUrl?: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

function resolveConfig(config: AstroPressConfig): Required<AstroPressConfig> {
  return {
    database: {
      url: "file:./local.db",
      authToken: undefined,
      ...config.database,
    },
    storage: {
      driver: "local",
      directory: "./public/media",
      baseUrl: "/media",
      ...config.storage,
    },
    siteUrl: config.siteUrl ?? "",
  };
}

// ─── Virtual module ID ────────────────────────────────────────────────────────

const VIRTUAL_ID = "virtual:astropress/config";
const RESOLVED_ID = "\0" + VIRTUAL_ID;

// ─── Integration ──────────────────────────────────────────────────────────────

/**
 * AstroPress Astro integration.
 * Add to `integrations` in astro.config.ts to configure the CMS without .env.
 */
export function astropress(config: AstroPressConfig = {}): AstroIntegration {
  const resolved = resolveConfig(config);

  return {
    name: "@astropress/core",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [
              {
                name: "astropress-config",
                resolveId(id: string) {
                  if (id === VIRTUAL_ID) return RESOLVED_ID;
                },
                load(id: string) {
                  if (id !== RESOLVED_ID) return;
                  // Serialize config to virtual module.
                  // Functions are not serializable — only static values here.
                  return [
                    `export const database = ${JSON.stringify(resolved.database)};`,
                    `export const storage = ${JSON.stringify(resolved.storage)};`,
                    `export const siteUrl = ${JSON.stringify(resolved.siteUrl)};`,
                    // Re-export as a single object too
                    `export const config = { database, storage, siteUrl };`,
                  ].join("\n");
                },
              },
            ],
          },
        });
      },
    },
  };
}
