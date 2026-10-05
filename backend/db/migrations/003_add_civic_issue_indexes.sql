CREATE INDEX IF NOT EXISTS idx_civic_issues_category
ON civic_issues(category);

CREATE INDEX IF NOT EXISTS idx_civic_issues_status
ON civic_issues(status);

CREATE INDEX IF NOT EXISTS idx_civic_issues_priority_score
ON civic_issues(priority_score);
