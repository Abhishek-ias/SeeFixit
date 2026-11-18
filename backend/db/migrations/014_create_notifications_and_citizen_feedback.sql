-- 014: Create notifications and citizen resolution feedback tables

-- 1. Notifications table: in-app alerts for citizens and authorities
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    civic_issue_id INTEGER REFERENCES civic_issues(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'STATUS_CHANGE',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- 2. Citizen Resolution Feedback table
CREATE TABLE IF NOT EXISTS resolution_feedback (
    id SERIAL PRIMARY KEY,
    civic_issue_id INTEGER NOT NULL REFERENCES civic_issues(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    is_satisfied BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_civic_issue_user_feedback UNIQUE (civic_issue_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_resolution_feedback_issue ON resolution_feedback(civic_issue_id);
