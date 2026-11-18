const pool = require("../db/database");

let _hasPostgis = null;

/**
 * Checks whether the PostGIS extension is installed and available in the current database.
 */
async function isPostgisAvailable() {
    if (_hasPostgis !== null) return _hasPostgis;
    try {
        const res = await pool.query(
            "SELECT 1 FROM pg_extension WHERE extname = 'postgis' LIMIT 1;"
        );
        _hasPostgis = res.rows.length > 0;
    } catch {
        _hasPostgis = false;
    }
    return _hasPostgis;
}

/**
 * Calculates haversine distance in meters between two lat/lng pairs.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Radius of the Earth in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

module.exports = {
    isPostgisAvailable,
    haversineDistance
};
