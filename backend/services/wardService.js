const pool = require("../db/database");

/**
 * Finds the municipal ward matching given GPS coordinates.
 * Falls back to WARD-100 (General Municipal Jurisdiction) if coordinates lie outside primary bounding boxes.
 */
async function findWardByCoordinates(latitude, longitude) {
    if (!latitude || !longitude || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
        return null;
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    const query = `
        SELECT id, ward_number, name, zone_name
        FROM municipal_wards
        WHERE $1 BETWEEN min_lat AND max_lat
          AND $2 BETWEEN min_lng AND max_lng
          AND ward_number != 'WARD-100'
        ORDER BY (max_lat - min_lat) ASC
        LIMIT 1;
    `;

    try {
        const res = await pool.query(query, [lat, lng]);
        if (res.rows.length > 0) {
            return res.rows[0];
        }

        // Fallback default ward
        const fallbackRes = await pool.query(
            "SELECT id, ward_number, name, zone_name FROM municipal_wards WHERE ward_number = 'WARD-100' LIMIT 1;"
        );
        return fallbackRes.rows[0] || null;
    } catch {
        return null;
    }
}

/**
 * Retrieves all registered municipal wards.
 */
async function getAllWards() {
    const query = `
        SELECT
            id,
            ward_number,
            name,
            zone_name,
            center_lat,
            center_lng,
            population,
            created_at
        FROM municipal_wards
        ORDER BY ward_number ASC;
    `;
    const res = await pool.query(query);
    return res.rows;
}

/**
 * Retrieves detailed grievance metrics and resolution health for a specific ward.
 */
async function getWardAnalytics(wardId) {
    const query = `
        SELECT
            mw.id,
            mw.ward_number,
            mw.name AS ward_name,
            mw.zone_name,
            COUNT(ci.id)::int AS total_issues,
            COUNT(CASE WHEN ci.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'REOPENED') THEN 1 END)::int AS active_issues,
            COUNT(CASE WHEN ci.status = 'RESOLVED' THEN 1 END)::int AS resolved_issues,
            ROUND(AVG(ci.priority_score), 1) AS avg_priority_score
        FROM municipal_wards mw
        LEFT JOIN civic_issues ci ON mw.id = ci.ward_id
        WHERE mw.id = $1
        GROUP BY mw.id, mw.ward_number, mw.name, mw.zone_name;
    `;
    const res = await pool.query(query, [wardId]);
    return res.rows[0] || null;
}

module.exports = {
    findWardByCoordinates,
    getAllWards,
    getWardAnalytics
};
