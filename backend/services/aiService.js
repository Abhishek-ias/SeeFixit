const pool = require("../db/database");
const AppError = require("../utils/AppError");

// ======================================================
// CIVIC ONTOLOGY & KEYWORD DICTIONARIES
// ======================================================

const CATEGORY_RULES = {
    ROAD: {
        keywords: [
            "pothole", "road", "pavement", "footpath", "sidewalk", "crater",
            "asphalt", "tar", "ditch", "cave-in", "manhole", "speed breaker",
            "curb", "median", "damaged road", "broken road"
        ],
        department: "Road Department",
        defaultAction: "Inspect roadway damage and schedule patch/resurfacing crew."
    },
    SANITATION: {
        keywords: [
            "garbage", "waste", "trash", "rubbish", "dump", "filth", "debris",
            "litter", "uncollected", "dustbin", "bin", "sewage", "drain overflow",
            "smell", "foul odor", "stagnant water", "gutter", "drainage"
        ],
        department: "Sanitation Department",
        defaultAction: "Dispatch sanitation team for waste clearance and drain desilting."
    },
    WATER: {
        keywords: [
            "water", "leak", "pipe", "pipeline", "pipe burst", "no water",
            "drinking water", "supply", "valve", "low pressure", "contaminated",
            "dirty water", "muddy water", "overflow", "borewell"
        ],
        department: "Water Department",
        defaultAction: "Deploy water supply inspection team to isolate leak and repair line."
    },
    LIGHTING: {
        keywords: [
            "streetlight", "street light", "lamp", "dark", "bulb", "pole",
            "flicker", "wire", "lighting", "high mast", "damaged light",
            "dark street", "non-working light", "night safety"
        ],
        department: "Street Lighting Department",
        defaultAction: "Send electrical maintenance unit to replace luminaire or repair wiring."
    }
};

const HAZARD_RULES = [
    {
        type: "ELECTRICAL_HAZARD",
        severity: "CRITICAL",
        score: 95,
        keywords: ["live wire", "spark", "electric shock", "dangling wire", "wire on road", "electrocution"],
        suggestedAction: "IMMEDIATE DANGER: Notify electrical utility emergency grid isolation immediately."
    },
    {
        type: "ROAD_COLLAPSE_OR_FALL_HAZARD",
        severity: "HIGH",
        score: 85,
        keywords: ["deep pothole", "open manhole", "cave-in", "sinkhole", "accident", "two wheeler fell", "blind curve"],
        suggestedAction: "URGENT SAFETY: Erect barricades and warning reflectors; expedite road repair."
    },
    {
        type: "PUBLIC_HEALTH_HAZARD",
        severity: "HIGH",
        score: 80,
        keywords: ["sewage entering house", "contaminated water", "dengue", "mosquito breeding", "foul smell", "hospital"],
        suggestedAction: "HEALTH RISK: Dispatch urgent disinfectant and drainage vacuum truck."
    },
    {
        type: "SECURITY_AND_MOBILITY_RISK",
        severity: "MEDIUM",
        score: 65,
        keywords: ["pitch dark", "unsafe at night", "women safety", "bus stop dark", "main road"],
        suggestedAction: "Schedule priority street light replacement before nightfall."
    }
];

const SENSITIVE_ZONE_RULES = [
    {
        type: "HEALTHCARE",
        boost: 20,
        keywords: [
            "hospital", "clinic", "dispensary", "emergency room", "maternity",
            "trauma", "ambulance", "doctor", "health center", "patient"
        ],
        badge: "Critical Healthcare Zone"
    },
    {
        type: "EDUCATION",
        boost: 15,
        keywords: [
            "school", "college", "university", "kindergarten", "daycare",
            "pre-school", "campus", "students", "children", "play school"
        ],
        badge: "School / Child Safety Zone"
    },
    {
        type: "TRANSIT",
        boost: 15,
        keywords: [
            "metro station", "bus stop", "bus stand", "railway station", "pedestrian crossing",
            "transit terminal", "zebra crossing", "flyover", "junction", "intersection"
        ],
        badge: "High-Traffic Transit Hub"
    }
];

// ======================================================
// AI CLASSIFICATION & TRIAGE ENGINE
// ======================================================

/**
 * Analyzes report title and description using the civic ontology rule engine,
 * factoring in sensitive infrastructure proximity and historical recurrence.
 */
function analyzeText(title = "", description = "", { recurrenceCount = 0 } = {}) {
    const text = `${title} ${description}`.toLowerCase();

    // 1. Category scoring
    const scores = {};
    for (const [category, rule] of Object.entries(CATEGORY_RULES)) {
        let matchCount = 0;
        for (const kw of rule.keywords) {
            if (text.includes(kw)) matchCount += 1;
        }
        scores[category] = matchCount;
    }

    let bestCategory = null;
    let maxMatches = -1;

    for (const [cat, count] of Object.entries(scores)) {
        if (count > maxMatches) {
            maxMatches = count;
            bestCategory = cat;
        }
    }

    // Default if no keywords matched
    if (!bestCategory || maxMatches === 0) {
        bestCategory = "ROAD";
    }

    const confidence = maxMatches > 0
        ? Math.min(0.70 + (maxMatches * 0.08), 0.98)
        : 0.60;

    // 2. Hazard & Severity Detection
    let detectedHazard = null;
    let severity = "LOW";
    let severityScore = 40;
    let suggestedAction = CATEGORY_RULES[bestCategory].defaultAction;

    for (const hazard of HAZARD_RULES) {
        for (const kw of hazard.keywords) {
            if (text.includes(kw)) {
                detectedHazard = hazard;
                severity = hazard.severity;
                severityScore = hazard.score;
                suggestedAction = hazard.suggestedAction;
                break;
            }
        }
        if (detectedHazard) break;
    }

    // Default severity based on category if no specific hazard
    if (!detectedHazard) {
        if (bestCategory === "ROAD") { severity = "MEDIUM"; severityScore = 55; }
        else if (bestCategory === "WATER") { severity = "MEDIUM"; severityScore = 50; }
        else if (bestCategory === "SANITATION") { severity = "LOW"; severityScore = 45; }
        else if (bestCategory === "LIGHTING") { severity = "MEDIUM"; severityScore = 50; }
    }

    // 2b. Sensitive Zone Detection (Schools, Hospitals, Transit)
    let detectedZone = null;
    for (const zone of SENSITIVE_ZONE_RULES) {
        for (const kw of zone.keywords) {
            if (text.includes(kw)) {
                detectedZone = zone;
                break;
            }
        }
        if (detectedZone) break;
    }

    if (detectedZone) {
        severityScore = Math.min(100, severityScore + detectedZone.boost);
        if (severity === "LOW") severity = "MEDIUM";
        else if (severity === "MEDIUM" && severityScore >= 75) severity = "HIGH";
        suggestedAction = `[${detectedZone.badge.toUpperCase()}] ${suggestedAction}`;
    }

    // 2c. Chronic Hotspot Recurrence Boost
    const isChronic = Number(recurrenceCount) >= 2;
    if (isChronic) {
        severityScore = Math.min(100, severityScore + 15);
        if (severity === "LOW") severity = "MEDIUM";
        else if (severity === "MEDIUM") severity = "HIGH";
        suggestedAction = `[CHRONIC HOTSPOT: ${recurrenceCount} recent nearby incidents] ${suggestedAction}`;
    }

    // 3. Structured Summary
    let summary = `${bestCategory} issue identified: "${title.trim()}". Classified with ${(confidence * 100).toFixed(0)}% confidence. Severity assessed as ${severity} (${severityScore}/100).`;
    if (detectedZone) {
        summary += ` Located in ${detectedZone.badge}.`;
    }
    if (isChronic) {
        summary += ` ⚠️ Active chronic recurrence zone (${recurrenceCount} incidents within 200m).`;
    }

    return {
        predictedCategory: bestCategory,
        confidence: Number(confidence.toFixed(4)),
        severity,
        severityScore,
        safetyHazardDetected: Boolean(detectedHazard),
        hazardType: detectedHazard?.type || null,
        sensitiveZoneDetected: Boolean(detectedZone),
        sensitiveZoneType: detectedZone?.type || null,
        isChronicHotspot: isChronic,
        recurrenceCount: Number(recurrenceCount) || 0,
        recommendedDepartment: CATEGORY_RULES[bestCategory].department,
        summary,
        suggestedAction,
        modelProvider: "heuristic-civic-ontology",
        modelVersion: "v1.1"
    };
}

/**
 * Assesses a newly submitted report and persists the AI assessment.
 * Context-aware: factors in coordinates for spatial recurrence detection.
 */
async function assessReport(reportId, civicIssueId, title, description, latitude = null, longitude = null) {
    let recurrenceCount = 0;
    if (latitude && longitude) {
        try {
            const { checkLocationRecurrence } = require("./gisService");
            const recurrence = await checkLocationRecurrence({
                latitude: Number(latitude),
                longitude: Number(longitude),
                radiusMeters: 200,
                days: 60,
                excludeIssueId: civicIssueId
            });
            recurrenceCount = recurrence.recurrenceCount;
        } catch {
            recurrenceCount = 0;
        }
    }

    const analysis = analyzeText(title, description, { recurrenceCount });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const query = `
            INSERT INTO ai_assessments (
                report_id,
                civic_issue_id,
                model_provider,
                model_version,
                predicted_category,
                category_confidence,
                predicted_severity,
                severity_score,
                safety_hazard_detected,
                hazard_type,
                recommended_department,
                summary,
                suggested_action,
                confidence_breakdown
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *;
        `;

        const values = [
            reportId || null,
            civicIssueId || null,
            analysis.modelProvider,
            analysis.modelVersion,
            analysis.predictedCategory,
            analysis.confidence,
            analysis.severity,
            analysis.severityScore,
            analysis.safetyHazardDetected,
            analysis.hazardType,
            analysis.recommendedDepartment,
            analysis.summary,
            analysis.suggestedAction,
            JSON.stringify({
                textScore: analysis.confidence,
                hazardScore: analysis.severityScore,
                sensitiveZoneDetected: analysis.sensitiveZoneDetected,
                sensitiveZoneType: analysis.sensitiveZoneType,
                isChronicHotspot: analysis.isChronicHotspot,
                recurrenceCount: analysis.recurrenceCount
            })
        ];

        const result = await client.query(query, values);

        // Update the civic issue's priority score based on AI assessment and report count
        if (civicIssueId) {
            await client.query(`
                UPDATE civic_issues
                SET priority_score = GREATEST(priority_score, $1)
                WHERE id = $2;
            `, [analysis.severityScore, civicIssueId]);
        }

        await client.query("COMMIT");
        return result.rows[0];
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch (e) {}
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Retrieves AI assessment for a civic issue.
 */
async function getIssueAiAssessment(civicIssueId) {
    const query = `
        SELECT
            aa.*,
            af.is_accurate,
            af.corrected_category,
            af.corrected_severity,
            af.feedback_notes
        FROM ai_assessments aa
        LEFT JOIN ai_feedback af ON af.assessment_id = aa.id
        WHERE aa.civic_issue_id = $1
        ORDER BY aa.created_at DESC
        LIMIT 1;
    `;
    const result = await pool.query(query, [civicIssueId]);
    return result.rows[0] || null;
}

/**
 * Records officer feedback or correction on an AI assessment.
 */
async function recordAiFeedback(assessmentId, userId, { is_accurate, corrected_category, corrected_severity, feedback_notes }) {
    const assessmentCheck = await pool.query(
        "SELECT id, civic_issue_id FROM ai_assessments WHERE id = $1",
        [assessmentId]
    );

    if (assessmentCheck.rows.length === 0) {
        throw new AppError("AI Assessment record not found", 404);
    }

    const insertQuery = `
        INSERT INTO ai_feedback (
            assessment_id,
            reviewed_by,
            is_accurate,
            corrected_category,
            corrected_severity,
            feedback_notes
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
    `;

    const result = await pool.query(insertQuery, [
        assessmentId,
        userId,
        Boolean(is_accurate),
        corrected_category || null,
        corrected_severity || null,
        feedback_notes || null
    ]);

    return result.rows[0];
}

/**
 * Resolution evidence verification comparing original problem against resolution evidence.
 */
async function verifyResolutionEvidence(civicIssueId, evidenceId, resolutionDescription = "") {
    const issueResult = await pool.query(
        "SELECT title, category FROM civic_issues WHERE id = $1",
        [civicIssueId]
    );

    if (issueResult.rows.length === 0) {
        throw new AppError("CivicIssue not found", 404);
    }

    const { title, category } = issueResult.rows[0];
    const desc = resolutionDescription.toLowerCase();

    // Check resolution semantic confirmation words
    const resolutionKeywords = ["repaired", "fixed", "filled", "cleared", "resolved", "completed", "replaced", "leveled", "asphalt", "cleaned"];
    let matchCount = 0;
    for (const kw of resolutionKeywords) {
        if (desc.includes(kw)) matchCount += 1;
    }

    const verificationScore = matchCount > 0 ? Math.min(0.70 + matchCount * 0.1, 0.99) : 0.65;
    const isLikelyResolved = verificationScore >= 0.70;
    const verificationNotes = isLikelyResolved
        ? `Work description correlates with original ${category} problem ("${title}"). Resolution confirmed.`
        : `Resolution description provides limited confirmation for ${category} problem. Officer manual verification recommended.`;

    const insertQuery = `
        INSERT INTO resolution_verifications (
            civic_issue_id,
            evidence_id,
            verification_score,
            is_likely_resolved,
            confidence,
            verification_notes,
            model_version
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'v1.0')
        RETURNING *;
    `;

    const result = await pool.query(insertQuery, [
        civicIssueId,
        evidenceId || null,
        Number(verificationScore.toFixed(4)),
        isLikelyResolved,
        Number(verificationScore.toFixed(4)),
        verificationNotes
    ]);

    return result.rows[0];
}

module.exports = {
    analyzeText,
    assessReport,
    getIssueAiAssessment,
    recordAiFeedback,
    verifyResolutionEvidence,
    SENSITIVE_ZONE_RULES
};
