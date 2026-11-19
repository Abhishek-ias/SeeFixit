-- ======================================================
-- Migration 019: Community Corroboration & Upvoting Engine
-- Allows citizens to endorse/corroborate active civic issues
-- and tracks upvote counts to inform municipal prioritization
-- ======================================================

ALTER TABLE civic_issues
ADD COLUMN IF NOT EXISTS upvote_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS civic_issue_upvotes (
    id SERIAL PRIMARY KEY,
    civic_issue_id INT NOT NULL REFERENCES civic_issues(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT uq_civic_issue_user_upvote UNIQUE(civic_issue_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_civic_issue_upvotes_issue_id ON civic_issue_upvotes(civic_issue_id);
CREATE INDEX IF NOT EXISTS idx_civic_issue_upvotes_user_id ON civic_issue_upvotes(user_id);
CREATE INDEX IF NOT EXISTS idx_civic_issues_upvote_count ON civic_issues(upvote_count);
