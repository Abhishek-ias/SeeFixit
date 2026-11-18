const express = require("express");
const router = express.Router();
const pool = require("../db/database");

const SERVICES = [
    {
        service_code: "ROAD",
        service_name: "Roads & Potholes",
        description: "Damaged roads, potholes, broken sidewalks, and missing curbs",
        metadata: true,
        type: "realtime",
        group: "infrastructure"
    },
    {
        service_code: "SANITATION",
        service_name: "Sanitation & Waste Management",
        description: "Garbage accumulation, overflowing bins, open dumping, and public cleanliness",
        metadata: true,
        type: "realtime",
        group: "health"
    },
    {
        service_code: "WATER",
        service_name: "Water Supply & Leakage",
        description: "Water pipe bursts, leakages, contaminated supply, and drainage overflows",
        metadata: true,
        type: "realtime",
        group: "utilities"
    },
    {
        service_code: "LIGHTING",
        service_name: "Street Lighting",
        description: "Non-functional streetlights, damaged fixtures, and hazardous wiring",
        metadata: true,
        type: "realtime",
        group: "safety"
    }
];

/**
 * GET /api/open311/v2/services.json
 * List available civic issue categories in Open311 GeoReport v2 format.
 */
router.get("/services.json", (req, res) => {
    return res.status(200).json(SERVICES);
});

/**
 * GET /api/open311/v2/requests.json
 * List public civic issue service requests in Open311 GeoReport v2 format.
 */
router.get("/requests.json", async (req, res, next) => {
    try {
        const { service_code, status, limit = 50 } = req.query;
        let query = `
            SELECT
                ci.id AS service_request_id,
                CASE WHEN ci.status = 'RESOLVED' THEN 'closed' ELSE 'open' END AS status,
                ci.status AS extended_status,
                ci.category AS service_code,
                ci.title,
                ci.description,
                ci.latitude AS lat,
                ci.longitude AS long,
                d.name AS agency_responsible,
                ci.created_at AS requested_datetime,
                ci.updated_at AS updated_datetime,
                (SELECT image FROM reports WHERE civic_issue_id = ci.id AND image IS NOT NULL LIMIT 1) AS media_url
            FROM civic_issues ci
            JOIN departments d ON ci.department_id = d.id
        `;
        const params = [];
        const whereClauses = [];

        if (service_code) {
            params.push(service_code.toUpperCase());
            whereClauses.push(`ci.category = $${params.length}`);
        }

        if (status) {
            if (status.toLowerCase() === 'open') {
                whereClauses.push(`ci.status != 'RESOLVED'`);
            } else if (status.toLowerCase() === 'closed') {
                whereClauses.push(`ci.status = 'RESOLVED'`);
            }
        }

        if (whereClauses.length > 0) {
            query += ` WHERE ` + whereClauses.join(" AND ");
        }

        query += ` ORDER BY ci.created_at DESC LIMIT $${params.length + 1}`;
        params.push(Math.min(parseInt(limit, 10) || 50, 100));

        const result = await pool.query(query, params);
        return res.status(200).json(result.rows);
    } catch (err) {
        next(err);
    }
});

router.SERVICES = SERVICES;

module.exports = router;
