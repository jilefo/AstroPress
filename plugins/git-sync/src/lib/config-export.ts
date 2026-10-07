/**
 * 站点配置导出（仿 plugins/config-io 导出逻辑，仅 settings / plugins / themes 三段；
 * 内容数据由 db-dump 覆盖，这里不重复导出）。
 *
 * 敏感项剥离：
 *   - plugins 段沿用 config-io 的敏感键过滤（secret|key|password|salt），并额外排除 token；
 *   - 显式排除本插件自身设置（含 Access Token）与同步历史键，避免 token 泄漏到远端仓库；
 *   - astropress_setup_complete 永不导出。
 */
import { wpOptions } from "@astropress/core/schema";
import { inArray, sql } from "drizzle-orm";

/** 站点设置白名单键（同 config-io） */
export const SETTINGS_KEYS = [
  "blogname",
  "blogdescription",
  "siteurl",
  "admin_email",
  "posts_per_page",
  "default_role",
  "show_on_front",
  "page_on_front",
  "page_for_posts",
  "posts_per_rss",
  "blog_public",
  "timezone_string",
  "template",
  "stylesheet",
] as const;

/** 主题配置四个固定键（同 config-io） */
export const THEME_KEYS = [
  "astropress_themes",
  "astropress_active_theme",
  "astropress_theme_config",
  "astropress_theme_templates",
] as const;

const SETUP_COMPLETE_KEY = "astropress_setup_complete";
/** 本插件自身的 wp_options 键：settings 内含 token，history 无导出价值，一律排除 */
const SELF_KEYS = ["astropress_git_sync_settings", "astropress_git_sync_history"];

/** 敏感键名（小写匹配）：比 config-io 多一个 token，绝不导出 */
const SENSITIVE_RE = /(secret|key|password|salt|token)/i;

/** 插件设置范围：astropress_ 前缀，排除 setup 标记、敏感键与本插件自身键 */
function isExportablePluginOption(name: string): boolean {
  return (
    typeof name === "string" &&
    name.startsWith("astropress_") &&
    name !== SETUP_COMPLETE_KEY &&
    !SELF_KEYS.includes(name) &&
    !SENSITIVE_RE.test(name)
  );
}

export interface ConfigExportEnvelope {
  app: "astropress";
  kind: "config-export";
  version: 1;
  exportedAt: string;
  sections: Record<string, unknown>;
}

async function exportOptionRows(
  db: any,
  section: "settings" | "plugins" | "themes"
): Promise<{ name: string; value: string }[]> {
  let rows: { optionName: string; optionValue: string }[];
  if (section === "settings") {
    rows = await db
      .select({ optionName: wpOptions.optionName, optionValue: wpOptions.optionValue })
      .from(wpOptions)
      .where(inArray(wpOptions.optionName, SETTINGS_KEYS as unknown as string[]));
  } else if (section === "themes") {
    rows = await db
      .select({ optionName: wpOptions.optionName, optionValue: wpOptions.optionValue })
      .from(wpOptions)
      .where(inArray(wpOptions.optionName, THEME_KEYS as unknown as string[]));
  } else {
    // astropress\_% ESCAPE '\'：前缀与转义字符均参数化绑定
    const prefix = "astropress\\_%";
    const escape = "\\";
    rows = await db
      .select({ optionName: wpOptions.optionName, optionValue: wpOptions.optionValue })
      .from(wpOptions)
      .where(sql`${wpOptions.optionName} LIKE ${prefix} ESCAPE ${escape}`);
    // JS 侧二次过滤，确保敏感键与本插件 token 绝不导出
    rows = rows.filter((r) => isExportablePluginOption(r.optionName));
  }
  return rows.map((r) => ({ name: r.optionName, value: r.optionValue }));
}

/** 构造配置导出信封（settings / plugins / themes 三段） */
export async function buildConfigExport(db: any): Promise<ConfigExportEnvelope> {
  const sections: Record<string, unknown> = {};
  for (const s of ["settings", "plugins", "themes"] as const) {
    sections[s] = await exportOptionRows(db, s);
  }
  return {
    app: "astropress",
    kind: "config-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    sections,
  };
}
