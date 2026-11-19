-- ======================================================
-- 017: Create Municipal Administrative Wards & Zones
-- ======================================================

CREATE TABLE IF NOT EXISTS municipal_wards (
    id SERIAL PRIMARY KEY,
    ward_number VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    zone_name VARCHAR(100) NOT NULL,
    min_lat NUMERIC(10, 6) NOT NULL,
    max_lat NUMERIC(10, 6) NOT NULL,
    min_lng NUMERIC(10, 6) NOT NULL,
    max_lng NUMERIC(10, 6) NOT NULL,
    center_lat NUMERIC(10, 6) NOT NULL,
    center_lng NUMERIC(10, 6) NOT NULL,
    population INT DEFAULT 45000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for spatial bounding box lookups
CREATE INDEX IF NOT EXISTS idx_wards_lat_bounds ON municipal_wards(min_lat, max_lat);
CREATE INDEX IF NOT EXISTS idx_wards_lng_bounds ON municipal_wards(min_lng, max_lng);

-- Add ward reference to civic_issues and reports
ALTER TABLE civic_issues
    ADD COLUMN IF NOT EXISTS ward_id INT REFERENCES municipal_wards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_civic_issues_ward_id ON civic_issues(ward_id);

ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS ward_id INT REFERENCES municipal_wards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reports_ward_id ON reports(ward_id);

-- Seed representative municipal wards
INSERT INTO municipal_wards (ward_number, name, zone_name, min_lat, max_lat, min_lng, max_lng, center_lat, center_lng, population)
VALUES
    ('WARD-101', 'Central Business District', 'Central Zone', 12.965000, 12.985000, 77.585000, 77.615000, 12.975000, 77.600000, 52000),
    ('WARD-102', 'Koramangala', 'South Zone', 12.920000, 12.945000, 77.610000, 77.640000, 12.932500, 77.625000, 68000),
    ('WARD-103', 'Indiranagar', 'East Zone', 12.965000, 12.985000, 77.630000, 77.655000, 12.975000, 77.642500, 49000),
    ('WARD-104', 'Jayanagar', 'South Zone', 12.915000, 12.940000, 77.570000, 77.600000, 12.927500, 77.585000, 61000),
    ('WARD-105', 'Whitefield Tech Corridor', 'Mahadevapura Zone', 12.960000, 13.000000, 77.700000, 77.760000, 12.980000, 77.730000, 78000),
    ('WARD-106', 'Malleshwaram', 'West Zone', 12.990000, 13.020000, 77.560000, 77.585000, 13.005000, 77.572500, 54000),
    ('WARD-107', 'Hebbal & Gateway', 'Yelahanka Zone', 13.020000, 13.060000, 77.580000, 77.620000, 13.040000, 77.600000, 59000),
    ('WARD-100', 'General Municipal Jurisdiction', 'Metropolitan Zone', -90.000000, 90.000000, -180.000000, 180.000000, 12.971600, 77.594600, 120000)
ON CONFLICT (ward_number) DO NOTHING;

-- Backfill existing civic_issues with matching wards
UPDATE civic_issues ci
SET ward_id = (
    SELECT mw.id
    FROM municipal_wards mw
    WHERE ci.latitude BETWEEN mw.min_lat AND mw.max_lat
      AND ci.longitude BETWEEN mw.min_lng AND mw.max_lng
      AND mw.ward_number != 'WARD-100'
    ORDER BY (mw.max_lat - mw.min_lat) ASC
    LIMIT 1
)
WHERE ci.latitude IS NOT NULL AND ci.ward_id IS NULL;

-- Fallback for issues outside primary bounding boxes
UPDATE civic_issues ci
SET ward_id = (SELECT id FROM municipal_wards WHERE ward_number = 'WARD-100')
WHERE ci.ward_id IS NULL;

-- Backfill reports from civic_issues
UPDATE reports r
SET ward_id = ci.ward_id
FROM civic_issues ci
WHERE r.civic_issue_id = ci.id AND r.ward_id IS NULL;
