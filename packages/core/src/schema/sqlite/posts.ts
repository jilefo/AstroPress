import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const wpPosts = sqliteTable(
  "wp_posts",
  {
    id: integer("ID").primaryKey({ autoIncrement: true }),
    postAuthor: integer("post_author").notNull().default(0),
    postDate: text("post_date").notNull().default("0000-00-00 00:00:00"),
    postDateGmt: text("post_date_gmt").notNull().default("0000-00-00 00:00:00"),
    postContent: text("post_content").notNull().default(""),
    postTitle: text("post_title").notNull().default(""),
    postExcerpt: text("post_excerpt").notNull().default(""),
    postStatus: text("post_status").notNull().default("publish"),
    commentStatus: text("comment_status").notNull().default("open"),
    pingStatus: text("ping_status").notNull().default("open"),
    postPassword: text("post_password").notNull().default(""),
    postName: text("post_name").notNull().default(""),
    toPing: text("to_ping").notNull().default(""),
    pinged: text("pinged").notNull().default(""),
    postModified: text("post_modified").notNull().default("0000-00-00 00:00:00"),
    postModifiedGmt: text("post_modified_gmt")
      .notNull()
      .default("0000-00-00 00:00:00"),
    postContentFiltered: text("post_content_filtered").notNull().default(""),
    postParent: integer("post_parent").notNull().default(0),
    guid: text("guid").notNull().default(""),
    menuOrder: integer("menu_order").notNull().default(0),
    postType: text("post_type").notNull().default("post"),
    postMimeType: text("post_mime_type").notNull().default(""),
    commentCount: integer("comment_count").notNull().default(0),
  },
  (table) => ({
    postNameIdx: index("post_name_idx").on(table.postName),
    postTypeStatusDateIdx: index("post_type_status_date_idx").on(
      table.postType,
      table.postStatus,
      table.postDate,
      table.id
    ),
    postParentIdx: index("post_parent_idx").on(table.postParent),
    postAuthorIdx: index("post_author_idx").on(table.postAuthor),
  })
);

export const wpPostmeta = sqliteTable(
  "wp_postmeta",
  {
    metaId: integer("meta_id").primaryKey({ autoIncrement: true }),
    postId: integer("post_id").notNull().default(0),
    metaKey: text("meta_key"),
    metaValue: text("meta_value"),
  },
  (table) => ({
    postIdIdx: index("postmeta_post_id_idx").on(table.postId),
    metaKeyIdx: index("postmeta_meta_key_idx").on(table.metaKey),
  })
);
