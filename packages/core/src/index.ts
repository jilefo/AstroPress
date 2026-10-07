export * from "./registry/index";
export * from "./schema/index";

// Database
export {
  createDatabase,
  createD1Database,
  createDb,
  createLocalDb,
  inferDriver,
  sqlAll,
  sqlOne,
  sqlRun,
  deriveColumns,
  likeNeedle,
  LIKE_NEEDLE_MAX,
} from "./db/index";
export type { AnyDatabase, Database, DatabaseDriver, WriteMeta } from "./db/index";

// Plugins
export {
  definePlugin,
  loadPlugin,
  getLoadedPlugins,
  isPluginLoaded,
} from "./plugins/loader";
export type { PluginConfig, RegisteredPlugin } from "./plugins/types";

// Runtime environment detection (Cloudflare Workers vs Node.js)
export { isCloudflareRuntime, hasFileSystem, hasChildProcess, envNotSupported } from "./runtime/index";
