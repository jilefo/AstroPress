-- Full-text search for PostgreSQL using tsvector + GIN index

-- Add search_vector column
ALTER TABLE wp_posts ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Backfill existing published posts
UPDATE wp_posts SET search_vector =
  setweight(to_tsvector('english', coalesce(post_title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(post_excerpt, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(post_content, '')), 'C')
WHERE post_status = 'publish';

-- GIN index for fast FTS queries
CREATE INDEX IF NOT EXISTS wp_posts_fts_idx ON wp_posts USING GIN(search_vector);

-- Trigger to auto-update search_vector on insert/update
CREATE OR REPLACE FUNCTION wp_posts_fts_trigger_fn() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.post_title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.post_excerpt, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.post_content, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wp_posts_fts_trigger ON wp_posts;
CREATE TRIGGER wp_posts_fts_trigger
  BEFORE INSERT OR UPDATE ON wp_posts
  FOR EACH ROW EXECUTE FUNCTION wp_posts_fts_trigger_fn();
