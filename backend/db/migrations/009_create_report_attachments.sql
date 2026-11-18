-- 009: Create secure citizen report attachments

CREATE TABLE IF NOT EXISTS report_attachments (
    id SERIAL PRIMARY KEY,

    report_id INTEGER NOT NULL
        REFERENCES reports(id) ON DELETE RESTRICT,

    uploaded_by INTEGER NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    storage_provider VARCHAR(30) NOT NULL DEFAULT 'r2',

    object_key VARCHAR(512) NOT NULL UNIQUE,

    original_filename VARCHAR(255) NOT NULL,

    original_mime_type VARCHAR(100) NOT NULL,

    mime_type VARCHAR(100) NOT NULL,

    original_file_size_bytes BIGINT NOT NULL
        CHECK (original_file_size_bytes > 0),

    file_size_bytes BIGINT NOT NULL
        CHECK (file_size_bytes > 0),

    width INTEGER NOT NULL
        CHECK (width > 0),

    height INTEGER NOT NULL
        CHECK (height > 0),

    sha256 CHAR(64) NOT NULL
        CHECK (sha256 ~ '^[0-9a-f]{64}$'),

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'READY', 'FAILED')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_report_attachments_report_status
    ON report_attachments(report_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_report_attachments_uploaded_by
    ON report_attachments(uploaded_by);
