-- Full-text search for SQLite using FTS5
-- Run after the base schema migrations
CREATE VIRTUAL TABLE IF NOT EXISTS wp_fts USING fts5(
  post_id UNINDEXED,
  title,
  content,
  excerpt,
  type UNINDEXED,
  status UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 1'
);

-- Backfill existing published posts
INSERT INTO wp_fts(post_id, title, content, excerpt, type, status)
SELECT ID, post_title, post_content, post_excerpt, post_type, post_status
FROM wp_posts
WHERE post_status = 'publish';

-- Keep FTS in sync with wp_posts
CREATE TRIGGER IF NOT EXISTS wp_posts_fts_insert
  AFTER INSERT ON wp_posts
  WHEN NEW.post_status = 'publish'
BEGIN
  INSERT INTO wp_fts(post_id, title, content, excerpt, type, status)
  VALUES (NEW.ID, NEW.post_title, NEW.post_content, NEW.post_excerpt, NEW.post_type, NEW.post_status);
END;

CREATE TRIGGER IF NOT EXISTS wp_posts_fts_update
  AFTER UPDATE ON wp_posts
BEGIN
  DELETE FROM wp_fts WHERE post_id = OLD.ID;
  INSERT INTO wp_fts(post_id, title, content, excerpt, type, status)
  SELECT NEW.ID, NEW.post_title, NEW.post_content, NEW.post_excerpt, NEW.post_type, NEW.post_status
  WHERE NEW.post_status = 'publish';
END;

CREATE TRIGGER IF NOT EXISTS wp_posts_fts_delete
  AFTER DELETE ON wp_posts
BEGIN
  DELETE FROM wp_fts WHERE post_id = OLD.ID;
END;
