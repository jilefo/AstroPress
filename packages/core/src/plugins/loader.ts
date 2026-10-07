import type { PluginConfig, RegisteredPlugin } from "./types";

const plugins = new Map<string, RegisteredPlugin>();

/**
 * Define and validate a plugin manifest.
 * Usage: `export default definePlugin({ name, version, register() { … } })`
 */
export function definePlugin(config: PluginConfig): PluginConfig {
  return config;
}

/**
 * Load a plugin manifest. Calls register() and marks it as loaded.
 * Safe to call multiple times — won't re-register the same plugin.
 */
export function loadPlugin(config: PluginConfig): void {
  if (plugins.has(config.name)) return;
  plugins.set(config.name, { config, loaded: false });
  try {
    config.register();
    plugins.get(config.name)!.loaded = true;
  } catch (err) {
    console.error(`[astropress] Plugin "${config.name}" failed to register:`, err);
  }
}

export function getLoadedPlugins(): RegisteredPlugin[] {
  return Array.from(plugins.values()).filter((p) => p.loaded);
}

export function isPluginLoaded(name: string): boolean {
  return plugins.get(name)?.loaded ?? false;
}
