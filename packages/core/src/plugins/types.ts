export interface PluginConfig {
  name: string;
  version: string;
  description?: string;
  /** Called once at startup to register post types, taxonomies, sidebar panels, etc. */
  register(): void;
}

export interface SidebarPanelConfig {
  /** Unique panel ID */
  id: string;
  /** Panel heading shown in the editor sidebar */
  title: string;
  /** Which post types this panel appears on. Empty array = all. */
  postTypes: string[];
}

export interface RegisteredPlugin {
  config: PluginConfig;
  loaded: boolean;
}
