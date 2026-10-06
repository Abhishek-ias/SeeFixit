CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_civic_issues_title_trgm
ON civic_issues
USING gin (title gin_trgm_ops);
