-- 015: Configurable civic issue categories and SLA tracking

-- 1. Categories table
CREATE TABLE IF NOT EXISTS categories (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(10) DEFAULT '📌',
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    sla_hours INTEGER NOT NULL DEFAULT 72,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active);

-- 2. Seed initial 4 categories mapped dynamically to existing departments
INSERT INTO categories (code, name, description, icon, department_id, sla_hours)
SELECT 'ROAD', 'Roads & Potholes', 'Damaged roads, potholes and broken footpaths', '🚧', id, 48
FROM departments WHERE name = 'Road Department'
ON CONFLICT (code) DO NOTHING;

INSERT INTO categories (code, name, description, icon, department_id, sla_hours)
SELECT 'SANITATION', 'Sanitation & Waste', 'Garbage accumulation and waste management', '🗑️', id, 24
FROM departments WHERE name = 'Sanitation Department'
ON CONFLICT (code) DO NOTHING;

INSERT INTO categories (code, name, description, icon, department_id, sla_hours)
SELECT 'WATER', 'Water Supply & Leakage', 'Water pipe bursts, leakages and drainage issues', '💧', id, 36
FROM departments WHERE name = 'Water Department'
ON CONFLICT (code) DO NOTHING;

INSERT INTO categories (code, name, description, icon, department_id, sla_hours)
SELECT 'LIGHTING', 'Street Lighting', 'Damaged or non-functional streetlights', '💡', id, 48
FROM departments WHERE name = 'Street Lighting Department'
ON CONFLICT (code) DO NOTHING;

-- 3. Add resolved_at column to civic_issues for SLA metric computation
ALTER TABLE civic_issues
    ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

-- Backfill resolved_at for already resolved issues from issue_status_history
UPDATE civic_issues ci
SET resolved_at = sub.changed_at
FROM (
    SELECT civic_issue_id, MIN(changed_at) AS changed_at
    FROM issue_status_history
    WHERE status = 'RESOLVED'
    GROUP BY civic_issue_id
) sub
WHERE ci.id = sub.civic_issue_id AND ci.status = 'RESOLVED' AND ci.resolved_at IS NULL;
