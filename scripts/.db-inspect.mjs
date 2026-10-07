// 临时诊断：读取主题相关 wp_options
import { createClient } from "@libsql/client";

const db = createClient({ url: "file:D:/Projects/Blogs/AstroPress/local.db" });
const keys = [
  "astropress_active_theme",
  "astropress_slots_synced_theme",
  "astropress_template_slots",
  "page_cache_settings",
];
for (const k of keys) {
  const r = await db.execute({ sql: "SELECT option_value FROM wp_options WHERE option_name = ?", args: [k] });
  console.log(k, "=", r.rows[0]?.option_value ?? "(none)");
}
// 页面缓存键
const r2 = await db.execute({ sql: "SELECT option_name FROM wp_options WHERE option_name LIKE 'astropress_page_cache%' LIMIT 5" });
console.log("cache keys:", r2.rows.map((x) => x.option_name).join(", "));
