-- =====================================================
-- SeeFixit Initial Database Schema
-- =====================================================

-- 1. Departments
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100)
);

-- 2. Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(150),
    role VARCHAR(20) DEFAULT 'CITIZEN',
    password_hash VARCHAR(255) NOT NULL,
    CONSTRAINT users_role_check
        CHECK (role IN ('CITIZEN', 'ADMIN'))
);

-- 3. Civic Issues
CREATE TABLE IF NOT EXISTS civic_issues (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL,
    priority_score INTEGER NOT NULL,
    latitude NUMERIC(9,6) NOT NULL,
    longitude NUMERIC(9,6) NOT NULL,
    department_id INTEGER NOT NULL,
    CONSTRAINT civic_issues_department_id_fkey
        FOREIGN KEY (department_id) REFERENCES departments(id),
    CONSTRAINT civic_issues_status_check
        CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED'))
);

-- 4. Reports
CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    civic_issue_id INTEGER NOT NULL REFERENCES civic_issues(id),
    title VARCHAR(200),
    description TEXT,
    category VARCHAR(50),
    image VARCHAR(500)
);

-- 5. Issue Status History
CREATE TABLE IF NOT EXISTS issue_status_history (
    id SERIAL PRIMARY KEY,
    civic_issue_id INTEGER NOT NULL REFERENCES civic_issues(id),
    status VARCHAR(30) NOT NULL,
    changed_by INTEGER NOT NULL REFERENCES users(id),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    evidence VARCHAR(500),
    CONSTRAINT issue_status_history_status_check
        CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED'))
);

-- 6. Issue Evidence
CREATE TABLE IF NOT EXISTS issue_evidence (
    id SERIAL PRIMARY KEY,
    civic_issue_id INTEGER NOT NULL REFERENCES civic_issues(id),
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    image VARCHAR(500),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
