import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const wpOptions = sqliteTable(
  "wp_options",
  {
    optionId: integer("option_id").primaryKey({ autoIncrement: true }),
    optionName: text("option_name").notNull().unique(),
    optionValue: text("option_value").notNull().default(""),
    autoload: text("autoload").notNull().default("yes"),
  },
  (table) => ({
    optionNameIdx: index("option_name_idx").on(table.optionName),
    autoloadIdx: index("autoload_idx").on(table.autoload),
  })
);
