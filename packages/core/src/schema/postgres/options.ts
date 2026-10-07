import { pgTable, text, integer, serial, index } from "drizzle-orm/pg-core";

export const wpOptions = pgTable(
  "wp_options",
  {
    optionId: serial("option_id").primaryKey(),
    optionName: text("option_name").notNull().unique(),
    optionValue: text("option_value").notNull().default(""),
    autoload: text("autoload").notNull().default("yes"),
  },
  (table) => ({
    optionNameIdx: index("option_name_idx").on(table.optionName),
    autoloadIdx: index("autoload_idx").on(table.autoload),
  })
);
