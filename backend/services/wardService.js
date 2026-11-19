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
            min_lat,
            max_lat,
            min_lng,
            max_lng,
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
            mw.population,
            mw.center_lat,
            mw.center_lng,
            COUNT(ci.id)::int AS total_issues,
            COUNT(CASE WHEN ci.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'REOPENED') THEN 1 END)::int AS active_issues,
            COUNT(CASE WHEN ci.status = 'RESOLVED' THEN 1 END)::int AS resolved_issues,
            COALESCE(SUM(ci.upvote_count), 0)::int AS total_upvotes,
            ROUND(AVG(ci.priority_score), 1) AS avg_priority_score
        FROM municipal_wards mw
        LEFT JOIN civic_issues ci ON mw.id = ci.ward_id
        WHERE mw.id = $1
        GROUP BY mw.id, mw.ward_number, mw.name, mw.zone_name, mw.population, mw.center_lat, mw.center_lng;
    `;
    const res = await pool.query(query, [wardId]);
    return res.rows[0] || null;
}

/**
 * Retrieves paginated civic issues reported within a specific municipal ward.
 */
async function getWardIssues(wardId, { page = 1, limit = 20, status = null } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = ["ci.ward_id = $1"];
    const params = [wardId];

    if (status) {
        params.push(status.toUpperCase());
        conditions.push(`ci.status = $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const countQuery = `
        SELECT COUNT(*)::int AS total
        FROM civic_issues ci
        ${whereClause};
    `;

    const dataQuery = `
        SELECT
            ci.id,
            ci.title,
            ci.category,
            ci.status,
            ci.priority_score,
            ci.upvote_count,
            ci.is_escalated,
            ci.escalation_level,
            ci.latitude,
            ci.longitude,
            ci.created_at,
            ci.resolved_at,
            d.name AS department_name,
            COUNT(r.id)::int AS report_count
        FROM civic_issues ci
        LEFT JOIN departments d ON ci.department_id = d.id
        LEFT JOIN reports r ON ci.id = r.civic_issue_id
        ${whereClause}
        GROUP BY ci.id, d.name
        ORDER BY ci.priority_score DESC, ci.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2};
    `;

    const [countRes, dataRes] = await Promise.all([
        pool.query(countQuery, params),
        pool.query(dataQuery, [...params, limitNum, offset])
    ]);

    const total = countRes.rows[0]?.total || 0;
    const totalPages = Math.ceil(total / limitNum);

    return {
        issues: dataRes.rows,
        pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages
        }
    };
}

module.exports = {
    findWardByCoordinates,
    getAllWards,
    getWardAnalytics,
    getWardIssues
};
