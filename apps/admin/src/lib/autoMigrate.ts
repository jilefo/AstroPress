/**
 * Auto-migration: creates all wp_* tables if they don't exist.
 * Runs on first boot against an empty D1 / SQLite database.
 * Safe to call on every request — guarded by a singleton flag.
 */

let _migrated = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function autoMigrate(db: any): Promise<void> {
  if (_migrated) return;

  try {
    // Quick probe — if wp_options exists, we're already migrated
    await db.run(`SELECT 1 FROM wp_options LIMIT 1`);
    _migrated = true;
    return;
  } catch {
    // Table doesn't exist — run full schema creation
  }

  const statements = [
    // ── Posts ──────────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS wp_posts (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      post_author INTEGER NOT NULL DEFAULT 0,
      post_date TEXT NOT NULL DEFAULT '0000-00-00 00:00:00',
      post_date_gmt TEXT NOT NULL DEFAULT '0000-00-00 00:00:00',
      post_content TEXT NOT NULL DEFAULT '',
      post_title TEXT NOT NULL DEFAULT '',
      post_excerpt TEXT NOT NULL DEFAULT '',
      post_status TEXT NOT NULL DEFAULT 'publish',
      comment_status TEXT NOT NULL DEFAULT 'open',
      ping_status TEXT NOT NULL DEFAULT 'open',
      post_password TEXT NOT NULL DEFAULT '',
      post_name TEXT NOT NULL DEFAULT '',
      to_ping TEXT NOT NULL DEFAULT '',
      pinged TEXT NOT NULL DEFAULT '',
      post_modified TEXT NOT NULL DEFAULT '0000-00-00 00:00:00',
      post_modified_gmt TEXT NOT NULL DEFAULT '0000-00-00 00:00:00',
      post_content_filtered TEXT NOT NULL DEFAULT '',
      post_parent INTEGER NOT NULL DEFAULT 0,
      guid TEXT NOT NULL DEFAULT '',
      menu_order INTEGER NOT NULL DEFAULT 0,
      post_type TEXT NOT NULL DEFAULT 'post',
      post_mime_type TEXT NOT NULL DEFAULT '',
      comment_count INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS post_name_idx ON wp_posts (post_name)`,
    `CREATE INDEX IF NOT EXISTS post_type_status_date_idx ON wp_posts (post_type, post_status, post_date, ID)`,
    `CREATE INDEX IF NOT EXISTS post_parent_idx ON wp_posts (post_parent)`,
    `CREATE INDEX IF NOT EXISTS post_author_idx ON wp_posts (post_author)`,

    // ── Postmeta ───────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS wp_postmeta (
      meta_id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL DEFAULT 0,
      meta_key TEXT,
      meta_value TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS postmeta_post_id_idx ON wp_postmeta (post_id)`,
    `CREATE INDEX IF NOT EXISTS postmeta_meta_key_idx ON wp_postmeta (meta_key)`,

    // ── Options ────────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS wp_options (
      option_id INTEGER PRIMARY KEY AUTOINCREMENT,
      option_name TEXT NOT NULL UNIQUE,
      option_value TEXT NOT NULL DEFAULT '',
      autoload TEXT NOT NULL DEFAULT 'yes'
    )`,
    `CREATE INDEX IF NOT EXISTS option_name_idx ON wp_options (option_name)`,
    `CREATE INDEX IF NOT EXISTS autoload_idx ON wp_options (autoload)`,

    // ── Users ──────────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS wp_users (
      ID INTEGER PRIMARY KEY AUTOINCREMENT,
      user_login TEXT NOT NULL DEFAULT '',
      user_pass TEXT NOT NULL DEFAULT '',
      user_nicename TEXT NOT NULL DEFAULT '',
      user_email TEXT NOT NULL DEFAULT '',
      user_url TEXT NOT NULL DEFAULT '',
      user_registered TEXT NOT NULL DEFAULT '0000-00-00 00:00:00',
      user_activation_key TEXT NOT NULL DEFAULT '',
      user_status INTEGER NOT NULL DEFAULT 0,
      display_name TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE INDEX IF NOT EXISTS user_login_key_idx ON wp_users (user_login)`,
    `CREATE INDEX IF NOT EXISTS user_nicename_idx ON wp_users (user_nicename)`,
    `CREATE INDEX IF NOT EXISTS user_email_idx ON wp_users (user_email)`,

    // ── Usermeta ───────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS wp_usermeta (
      umeta_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL DEFAULT 0,
      meta_key TEXT,
      meta_value TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS usermeta_user_id_idx ON wp_usermeta (user_id)`,
    `CREATE INDEX IF NOT EXISTS usermeta_meta_key_idx ON wp_usermeta (meta_key)`,

    // ── Sessions ───────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS wp_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON wp_sessions (user_id)`,

    // ── Terms ──────────────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS wp_terms (
      term_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT '',
      slug TEXT NOT NULL DEFAULT '',
      term_group INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS terms_slug_idx ON wp_terms (slug)`,
    `CREATE INDEX IF NOT EXISTS terms_name_idx ON wp_terms (name)`,

    // ── Term Taxonomy ──────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS wp_term_taxonomy (
      term_taxonomy_id INTEGER PRIMARY KEY AUTOINCREMENT,
      term_id INTEGER NOT NULL DEFAULT 0,
      taxonomy TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      parent INTEGER NOT NULL DEFAULT 0,
      count INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS term_taxonomy_taxonomy_idx ON wp_term_taxonomy (taxonomy)`,
    `CREATE INDEX IF NOT EXISTS term_id_taxonomy_idx ON wp_term_taxonomy (term_id, taxonomy)`,

    // ── Term Relationships ─────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS wp_term_relationships (
      object_id INTEGER NOT NULL,
      term_taxonomy_id INTEGER NOT NULL,
      term_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (object_id, term_taxonomy_id)
    )`,
    `CREATE INDEX IF NOT EXISTS term_relationships_taxonomy_id_idx ON wp_term_relationships (term_taxonomy_id)`,

    // ── FTS (full-text search for posts) ───────────────────────────────────
    `CREATE VIRTUAL TABLE IF NOT EXISTS wp_posts_fts USING fts5(
      post_title,
      post_content,
      post_excerpt,
      content='wp_posts',
      content_rowid='ID'
    )`,
  ];

  for (const sql of statements) {
    try {
      await db.run(sql);
    } catch {
      // Index/table already exists — safe to ignore
    }
  }

  _migrated = true;
}
