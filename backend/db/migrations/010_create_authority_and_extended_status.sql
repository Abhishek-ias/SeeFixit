-- 010: Create authority workflow tables and extend status domain

-- 1. Extend civic_issues status constraint
ALTER TABLE civic_issues DROP CONSTRAINT IF EXISTS civic_issues_status_check;
ALTER TABLE civic_issues ADD CONSTRAINT civic_issues_status_check
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'REJECTED', 'REOPENED'));

-- 2. Extend issue_status_history status constraint & add note column
ALTER TABLE issue_status_history DROP CONSTRAINT IF EXISTS issue_status_history_status_check;
ALTER TABLE issue_status_history ADD CONSTRAINT issue_status_history_status_check
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'REJECTED', 'REOPENED'));

ALTER TABLE issue_status_history ADD COLUMN IF NOT EXISTS note TEXT;

-- 3. Department Members table
CREATE TABLE IF NOT EXISTS department_members (
    id SERIAL PRIMARY KEY,
    department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(30) NOT NULL DEFAULT 'OFFICER' CHECK (role IN ('OFFICER', 'HEAD')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dept_user UNIQUE (department_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dept_members_dept ON department_members(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_members_user ON department_members(user_id);

-- 4. Issue Assignments table
CREATE TABLE IF NOT EXISTS issue_assignments (
    id SERIAL PRIMARY KEY,
    civic_issue_id INTEGER NOT NULL REFERENCES civic_issues(id) ON DELETE CASCADE,
    assigned_to INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes TEXT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_issue_assignments_issue ON issue_assignments(civic_issue_id);
CREATE INDEX IF NOT EXISTS idx_issue_assignments_user ON issue_assignments(assigned_to);

-- 5. Audit Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,
    performed_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(performed_by);
