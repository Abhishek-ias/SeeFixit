-- ======================================================
-- 018: Add SLA Escalation & Supervisory Alert Columns
-- ======================================================

ALTER TABLE civic_issues
    ADD COLUMN IF NOT EXISTS is_escalated BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS escalation_level INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_civic_issues_is_escalated ON civic_issues(is_escalated);
CREATE INDEX IF NOT EXISTS idx_civic_issues_escalation_level ON civic_issues(escalation_level);

-- Initial backfill for currently breached issues
UPDATE civic_issues ci
SET is_escalated = TRUE,
    escalated_at = CURRENT_TIMESTAMP,
    escalation_level = CASE
        WHEN (CURRENT_TIMESTAMP - ci.created_at) > ((COALESCE(c.sla_hours, 72) * 2) || ' hours')::interval THEN 2
        ELSE 1
    END
FROM categories c
WHERE ci.category = c.code
  AND ci.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'REOPENED')
  AND (CURRENT_TIMESTAMP - ci.created_at) > (COALESCE(c.sla_hours, 72) || ' hours')::interval
  AND ci.is_escalated = FALSE;
