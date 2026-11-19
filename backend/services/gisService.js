const pool = require("../db/database");
const { haversineDistance } = require("../utils/gis");

/**
 * Generates an automated municipal engineering recommendation
 * based on the dominant civic category and recurrence level.
 */
function getHotspotRecommendation(category, totalIssues, openIssues) {
    if (category === "ROAD") {
        if (totalIssues >= 4) {
            return "Severe chronic roadway degradation: Soil sub-base testing and continuous corridor resurfacing recommended instead of localized patch-fills.";
        }
        return "Recurring road damage cluster: Expedite asphalt compaction and evaluate drainage slope to prevent recurring cratering.";
    }

    if (category === "WATER") {
        if (totalIssues >= 4) {
            return "Critical water infrastructure failure: Systematic pipeline pressure audit and trunk main replacement recommended.";
        }
        return "Repeated water leakage zone: Inspect pipeline joints, valve seals, and soil moisture to locate upstream root-cause leaks.";
    }

    if (category === "SANITATION") {
        if (totalIssues >= 4) {
            return "Chronic waste dumping hotspot: Deploy permanent high-capacity dumper bins, increase collection frequency to twice daily, and install deterrence signage.";
        }
        return "Frequent sanitation grievance zone: Intensive desilting of drainage channels and scheduled community waste clearance required.";
    }

    if (category === "LIGHTING") {
        return "High-frequency illumination failure: Inspect transformer feeder lines, earthing, and replace luminaire units with surge-protected LED fittings.";
    }

    return "High grievance concentration: Multi-departmental municipal inspection recommended to address root infrastructural issues.";
}

/**
 * Clusters a set of issues into geographic hotspots based on a distance radius.
 * Uses connected-component radius clustering.
 */
function clusterIssues(issues, radiusMeters = 300, minIssues = 2) {
    if (!issues || issues.length === 0) return [];

    const n = issues.length;
    const visited = new Array(n).fill(false);
    const clusters = [];

    for (let i = 0; i < n; i++) {
        if (visited[i]) continue;

        const currentCluster = [issues[i]];
        visited[i] = true;

        // BFS / expansion queue to find all points connected within radius
        const queue = [issues[i]];

        while (queue.length > 0) {
            const current = queue.shift();

            for (let j = 0; j < n; j++) {
                if (visited[j]) continue;

                const dist = haversineDistance(
                    Number(current.latitude),
                    Number(current.longitude),
                    Number(issues[j].latitude),
                    Number(issues[j].longitude)
                );

                if (dist <= radiusMeters) {
                    visited[j] = true;
                    currentCluster.push(issues[j]);
                    queue.push(issues[j]);
                }
            }
        }

        if (currentCluster.length >= minIssues) {
            clusters.push(currentCluster);
        }
    }

    // Format each cluster into a structured Hotspot object
    return clusters.map((group, idx) => {
        let sumLat = 0;
        let sumLng = 0;
        let sumPriority = 0;
        const categoryCounts = {};
        const statusCounts = {};

        for (const item of group) {
            const lat = Number(item.latitude);
            const lng = Number(item.longitude);
            sumLat += lat;
            sumLng += lng;
            sumPriority += (Number(item.priority_score) || 50);

            categoryCounts[item.category] = (categoryCounts[item.category] || 0) + 1;
            statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
        }

        const centerLat = Number((sumLat / group.length).toFixed(6));
        const centerLng = Number((sumLng / group.length).toFixed(6));

        // Calculate maximum distance from centroid to define cluster radius
        let maxDist = 0;
        for (const item of group) {
            const d = haversineDistance(centerLat, centerLng, Number(item.latitude), Number(item.longitude));
            if (d > maxDist) maxDist = d;
        }
        const effectiveRadius = Math.max(maxDist + 30, 80); // Minimum 80m display circle

        // Identify dominant category
        let dominantCategory = "GENERAL";
        let maxCatCount = 0;
        for (const [cat, count] of Object.entries(categoryCounts)) {
            if (count > maxCatCount) {
                maxCatCount = count;
                dominantCategory = cat;
            }
        }

        const totalIssues = group.length;
        const openIssues = (statusCounts["OPEN"] || 0) + (statusCounts["IN_PROGRESS"] || 0);

        // Determine chronic risk tier
        let chronicRisk = "MODERATE";
        if (totalIssues >= 5 || openIssues >= 3) {
            chronicRisk = "CRITICAL";
        } else if (totalIssues >= 3) {
            chronicRisk = "HIGH";
        }

        const avgPriority = Math.round(sumPriority / group.length);

        return {
            id: `hotspot-${idx + 1}`,
            center: {
                latitude: centerLat,
                longitude: centerLng
            },
            radiusMeters: Math.round(effectiveRadius),
            totalIssues,
            openIssues,
            chronicRisk,
            avgPriority,
            primaryCategory: dominantCategory,
            categoryBreakdown: categoryCounts,
            statusBreakdown: statusCounts,
            recommendation: getHotspotRecommendation(dominantCategory, totalIssues, openIssues),
            issues: group.map(g => ({
                id: g.id,
                title: g.title,
                category: g.category,
                status: g.status,
                priorityScore: g.priority_score,
                department: g.department_name,
                latitude: Number(g.latitude),
                longitude: Number(g.longitude),
                createdAt: g.created_at
            }))
        };
    }).sort((a, b) => b.totalIssues - a.totalIssues || b.avgPriority - a.avgPriority);
}

/**
 * Detects geographic hotspots and recurring civic issue clusters across the city.
 */
async function detectHotspots({
    category = null,
    radiusMeters = 300,
    minIssues = 2,
    days = 60,
    status = null
} = {}) {
    const conditions = [
        "ci.latitude IS NOT NULL",
        "ci.longitude IS NOT NULL",
        "ci.latitude != 0",
        "ci.longitude != 0"
    ];
    const values = [];

    if (days && Number(days) > 0) {
        values.push(Number(days));
        conditions.push(`ci.created_at >= NOW() - ($${values.length} || ' days')::INTERVAL`);
    }

    if (category) {
        values.push(category.toUpperCase());
        conditions.push(`ci.category = $${values.length}`);
    }

    if (status) {
        values.push(status.toUpperCase());
        conditions.push(`ci.status = $${values.length}`);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    const query = `
        SELECT
            ci.id,
            ci.title,
            ci.category,
            ci.status,
            ci.priority_score,
            ci.latitude,
            ci.longitude,
            ci.created_at,
            d.name AS department_name
        FROM civic_issues ci
        LEFT JOIN departments d ON ci.department_id = d.id
        ${whereClause}
        ORDER BY ci.created_at DESC
        LIMIT 1000;
    `;

    const res = await pool.query(query, values);
    const hotspots = clusterIssues(res.rows, Number(radiusMeters), Number(minIssues));

    return {
        totalHotspots: hotspots.length,
        radiusMeters: Number(radiusMeters),
        timeWindowDays: Number(days),
        hotspots
    };
}

/**
 * Checks if a specific coordinate is in an active recurrence zone (within radiusMeters).
 */
async function checkLocationRecurrence({
    latitude,
    longitude,
    radiusMeters = 200,
    days = 60,
    excludeIssueId = null
}) {
    if (!latitude || !longitude) {
        return { recurrenceCount: 0, nearbyIssueIds: [], isChronicHotspot: false };
    }

    const conditions = [
        "ci.latitude IS NOT NULL",
        "ci.longitude IS NOT NULL",
        "ci.created_at >= NOW() - ($1 || ' days')::INTERVAL"
    ];
    const values = [Number(days)];

    if (excludeIssueId) {
        values.push(excludeIssueId);
        conditions.push(`ci.id != $${values.length}`);
    }

    const query = `
        SELECT ci.id, ci.latitude, ci.longitude, ci.category, ci.status
        FROM civic_issues ci
        WHERE ${conditions.join(" AND ")}
        LIMIT 500;
    `;

    try {
        const res = await pool.query(query, values);
        const nearbyIssues = [];

        for (const row of res.rows) {
            const dist = haversineDistance(
                Number(latitude),
                Number(longitude),
                Number(row.latitude),
                Number(row.longitude)
            );
            if (dist <= radiusMeters) {
                nearbyIssues.push(row);
            }
        }

        return {
            recurrenceCount: nearbyIssues.length,
            nearbyIssueIds: nearbyIssues.map(i => i.id),
            isChronicHotspot: nearbyIssues.length >= 2
        };
    } catch {
        return { recurrenceCount: 0, nearbyIssueIds: [], isChronicHotspot: false };
    }
}

module.exports = {
    clusterIssues,
    detectHotspots,
    checkLocationRecurrence,
    getHotspotRecommendation
};
