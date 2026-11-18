-- 011: Enable PostGIS and create spatial columns & GIST indexes

-- 1. Enable PostGIS Extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Add spatial location geography column to civic_issues
ALTER TABLE civic_issues
    ADD COLUMN IF NOT EXISTS location GEOGRAPHY(Point, 4326);

-- 3. Populate existing civic_issues with spatial geography point (SRID 4326 WGS84)
UPDATE civic_issues
SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
WHERE location IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- 4. Spatial GIST index on civic_issues location for high-performance radius queries
CREATE INDEX IF NOT EXISTS idx_civic_issues_location_gist
    ON civic_issues USING GIST(location);

-- 5. Add latitude, longitude and spatial location geography column to reports
ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6),
    ADD COLUMN IF NOT EXISTS location GEOGRAPHY(Point, 4326);

-- 6. Populate existing reports from parent civic_issues
UPDATE reports r
SET
    latitude = ci.latitude,
    longitude = ci.longitude,
    location = ST_SetSRID(ST_MakePoint(ci.longitude, ci.latitude), 4326)::geography
FROM civic_issues ci
WHERE r.civic_issue_id = ci.id AND r.location IS NULL;

-- 7. Spatial GIST index on reports location
CREATE INDEX IF NOT EXISTS idx_reports_location_gist
    ON reports USING GIST(location);
