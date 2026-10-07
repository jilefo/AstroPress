import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const wpUsers = sqliteTable(
  "wp_users",
  {
    id: integer("ID").primaryKey({ autoIncrement: true }),
    userLogin: text("user_login").notNull().default(""),
    userPass: text("user_pass").notNull().default(""),
    userNicename: text("user_nicename").notNull().default(""),
    userEmail: text("user_email").notNull().default(""),
    userUrl: text("user_url").notNull().default(""),
    userRegistered: text("user_registered")
      .notNull()
      .default("0000-00-00 00:00:00"),
    userActivationKey: text("user_activation_key").notNull().default(""),
    userStatus: integer("user_status").notNull().default(0),
    displayName: text("display_name").notNull().default(""),
  },
  (table) => ({
    userLoginKeyIdx: index("user_login_key_idx").on(table.userLogin),
    userNicenameIdx: index("user_nicename_idx").on(table.userNicename),
    userEmailIdx: index("user_email_idx").on(table.userEmail),
  })
);

export const wpUsermeta = sqliteTable(
  "wp_usermeta",
  {
    umetaId: integer("umeta_id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().default(0),
    metaKey: text("meta_key"),
    metaValue: text("meta_value"),
  },
  (table) => ({
    userIdIdx: index("usermeta_user_id_idx").on(table.userId),
    metaKeyIdx: index("usermeta_meta_key_idx").on(table.metaKey),
  })
);

export const wpSessions = sqliteTable(
  "wp_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => ({
    userIdIdx: index("sessions_user_id_idx").on(table.userId),
  })
);
