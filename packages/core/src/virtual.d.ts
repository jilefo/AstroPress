/**
 * Type declarations for the virtual:astropress/config module.
 * This module is injected at build time by the astropress() integration.
 */
declare module "virtual:astropress/config" {
  import type { DatabaseConfig, StorageConfig } from "./integration";

  export const database: DatabaseConfig;
  export const storage: StorageConfig;
  export const siteUrl: string;
  export const config: {
    database: DatabaseConfig;
    storage: StorageConfig;
    siteUrl: string;
  };
}
