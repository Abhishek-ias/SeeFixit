-- 012: Create AI assessments, feedback, and resolution verification tables

-- 1. AI Assessments table: stores auditable, versioned AI classification and scoring
CREATE TABLE IF NOT EXISTS ai_assessments (
    id SERIAL PRIMARY KEY,
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    civic_issue_id INTEGER REFERENCES civic_issues(id) ON DELETE CASCADE,
    model_provider VARCHAR(50) NOT NULL DEFAULT 'rule-engine',
    model_version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    predicted_category VARCHAR(50),
    category_confidence NUMERIC(5,4),
    predicted_severity VARCHAR(20) CHECK (predicted_severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    severity_score INTEGER CHECK (severity_score BETWEEN 1 AND 100),
    safety_hazard_detected BOOLEAN DEFAULT FALSE,
    hazard_type VARCHAR(100),
    recommended_department VARCHAR(100),
    summary TEXT,
    suggested_action TEXT,
    confidence_breakdown JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_assessments_report ON ai_assessments(report_id);
CREATE INDEX IF NOT EXISTS idx_ai_assessments_issue ON ai_assessments(civic_issue_id);

-- 2. AI Feedback table: tracks human officer overrides and accuracy scoring
CREATE TABLE IF NOT EXISTS ai_feedback (
    id SERIAL PRIMARY KEY,
    assessment_id INTEGER NOT NULL REFERENCES ai_assessments(id) ON DELETE CASCADE,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_accurate BOOLEAN NOT NULL,
    corrected_category VARCHAR(50),
    corrected_severity VARCHAR(20),
    feedback_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_assessment ON ai_feedback(assessment_id);

-- 3. Resolution Verifications: compares original report against resolution evidence
CREATE TABLE IF NOT EXISTS resolution_verifications (
    id SERIAL PRIMARY KEY,
    civic_issue_id INTEGER NOT NULL REFERENCES civic_issues(id) ON DELETE CASCADE,
    evidence_id INTEGER REFERENCES issue_evidence(id) ON DELETE CASCADE,
    verification_score NUMERIC(5,4),
    is_likely_resolved BOOLEAN NOT NULL,
    confidence NUMERIC(5,4),
    verification_notes TEXT,
    model_version VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    verified_by_officer BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_res_verif_issue ON resolution_verifications(civic_issue_id);
