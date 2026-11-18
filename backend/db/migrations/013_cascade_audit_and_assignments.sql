-- 013: Set ON DELETE CASCADE for audit_logs and issue_assignments foreign keys to users

ALTER TABLE audit_logs
    DROP CONSTRAINT IF EXISTS audit_logs_performed_by_fkey;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_performed_by_fkey
    FOREIGN KEY (performed_by) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE issue_assignments
    DROP CONSTRAINT IF EXISTS issue_assignments_assigned_to_fkey,
    DROP CONSTRAINT IF EXISTS issue_assignments_assigned_by_fkey;

ALTER TABLE issue_assignments
    ADD CONSTRAINT issue_assignments_assigned_to_fkey
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE CASCADE,
    ADD CONSTRAINT issue_assignments_assigned_by_fkey
    FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE;
