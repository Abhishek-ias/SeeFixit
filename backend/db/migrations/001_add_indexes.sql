CREATE INDEX IF NOT EXISTS idx_reports_user_id
ON reports(user_id);

CREATE INDEX IF NOT EXISTS idx_issue_status_history_issue_id
ON issue_status_history(civic_issue_id);

CREATE INDEX IF NOT EXISTS idx_issue_evidence_issue_id
ON issue_evidence(civic_issue_id);