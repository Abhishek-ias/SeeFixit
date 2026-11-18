-- 016: Add created_at and updated_at timestamps to civic_issues and reports

-- 1. Add timestamps to civic_issues
ALTER TABLE civic_issues
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill created_at from earliest issue_status_history
UPDATE civic_issues ci
SET created_at = sub.first_change
FROM (
    SELECT civic_issue_id, MIN(changed_at) AS first_change
    FROM issue_status_history
    GROUP BY civic_issue_id
) sub
WHERE ci.id = sub.civic_issue_id;

-- 2. Add created_at timestamp to reports
ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill reports created_at from parent civic_issue created_at
UPDATE reports r
SET created_at = ci.created_at
FROM civic_issues ci
WHERE r.civic_issue_id = ci.id;

CREATE INDEX IF NOT EXISTS idx_civic_issues_created_at ON civic_issues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
