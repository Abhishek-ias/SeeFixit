-- 011: Enable Spatial extensions (PostGIS if available, earthdistance + cube) and create spatial columns & indexes

-- 1. Safely attempt PostGIS Extension (if available in PG environment)
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS postgis;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PostGIS extension not available in this PostgreSQL environment; using earthdistance and bounding box indexing.';
END $$;

-- 2. Enable earthdistance and cube for spherical distance calculations
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- 3. Conditionally add spatial location geography column to civic_issues if PostGIS is installed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        ALTER TABLE civic_issues ADD COLUMN IF NOT EXISTS location GEOGRAPHY(Point, 4326);
        UPDATE civic_issues
        SET location = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
        WHERE location IS NULL AND latitude IS NOT NULL AND longitude IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_civic_issues_location_gist ON civic_issues USING GIST(location);
    END IF;
END $$;

-- 4. Add latitude and longitude columns to reports
ALTER TABLE reports
    ADD COLUMN IF NOT EXISTS latitude NUMERIC(9,6),
    ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);

-- 5. Populate existing reports coordinates from parent civic_issues
UPDATE reports r
SET
    latitude = ci.latitude,
    longitude = ci.longitude
FROM civic_issues ci
WHERE r.civic_issue_id = ci.id AND r.latitude IS NULL;

-- 6. Conditionally add spatial location geography column to reports if PostGIS is installed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        ALTER TABLE reports ADD COLUMN IF NOT EXISTS location GEOGRAPHY(Point, 4326);
        UPDATE reports r
        SET location = ST_SetSRID(ST_MakePoint(ci.longitude, ci.latitude), 4326)::geography
        FROM civic_issues ci
        WHERE r.civic_issue_id = ci.id AND r.location IS NULL;
        CREATE INDEX IF NOT EXISTS idx_reports_location_gist ON reports USING GIST(location);
    END IF;
END $$;

-- 7. Create composite B-Tree indexes on (latitude, longitude) for fast bounding box lookups
CREATE INDEX IF NOT EXISTS idx_civic_issues_lat_lng ON civic_issues(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_reports_lat_lng ON reports(latitude, longitude);
