const pool = require("../db/database");
const AppError = require("../utils/AppError");
const { isPostgisAvailable, haversineDistance } = require("../utils/gis");
const { assessReport, getIssueAiAssessment, verifyResolutionEvidence } = require("./aiService");
const { notifyIssueCitizens, notifyAssignedOfficer } = require("./notificationService");
const { sendReportConfirmationEmail } = require("./mailService");
const { findWardByCoordinates, getAllWards, getWardAnalytics } = require("./wardService");

async function updateIssueStatus(issueId, status, userId, note = null) {

    const client = await pool.connect();

    try {

        // ------------------------------------------
        // Validate requested status
        // ------------------------------------------

        const validStatuses = [
            "OPEN",
            "IN_PROGRESS",
            "ON_HOLD",
            "RESOLVED",
            "REJECTED",
            "REOPENED"
        ];

        if (!validStatuses.includes(status)) {
            throw new AppError(
                "Invalid status",
                400
            );
        }


        // ------------------------------------------
        // Get current issue
        // ------------------------------------------

        const issueQuery = `
            SELECT *
            FROM civic_issues
            WHERE id = $1;
        `;

        const issueResult = await client.query(
            issueQuery,
            [issueId]
        );

        if (issueResult.rows.length === 0) {
            throw new AppError(
                "CivicIssue not found",
                404
            );
        }

        const issue = issueResult.rows[0];


        // ------------------------------------------
        // Validate status transition
        // ------------------------------------------

        if (issue.status === "OPEN") {

            if (status === "RESOLVED") {
                throw new AppError(
                    "OPEN issue can only move to IN_PROGRESS",
                    400
                );
            }

            if (!["IN_PROGRESS", "REJECTED"].includes(status)) {
                throw new AppError(
                    "OPEN issue can only move to IN_PROGRESS",
                    400
                );
            }

        }

        else if (issue.status === "IN_PROGRESS") {

            if (status === "OPEN") {
                throw new AppError(
                    "IN_PROGRESS issue can only move to RESOLVED",
                    400
                );
            }

            if (!["RESOLVED", "ON_HOLD", "REJECTED"].includes(status)) {
                throw new AppError(
                    "IN_PROGRESS issue can only move to RESOLVED",
                    400
                );
            }

        }

        else if (issue.status === "ON_HOLD") {

            if (!["IN_PROGRESS", "REJECTED"].includes(status)) {
                throw new AppError(
                    "ON_HOLD issue can only move to IN_PROGRESS or REJECTED",
                    400
                );
            }

        }

        else if (issue.status === "RESOLVED") {

            if (status === "IN_PROGRESS") {
                throw new AppError(
                    "Resolved issue cannot change status",
                    400
                );
            }

            if (status !== "REOPENED") {
                throw new AppError(
                    "Resolved issue cannot change status",
                    400
                );
            }

        }

        else if (issue.status === "REJECTED") {

            if (status !== "REOPENED") {
                throw new AppError(
                    "Rejected issue can only move to REOPENED",
                    400
                );
            }

        }

        else if (issue.status === "REOPENED") {

            if (!["IN_PROGRESS", "REJECTED"].includes(status)) {
                throw new AppError(
                    "Reopened issue can only move to IN_PROGRESS or REJECTED",
                    400
                );
            }

        }


        // ------------------------------------------
        // Evidence required before resolution
        // ------------------------------------------

        if (
            (issue.status === "IN_PROGRESS" || issue.status === "REOPENED") &&
            status === "RESOLVED"
        ) {

            const evidenceQuery = `
                SELECT id
                FROM issue_evidence
                WHERE civic_issue_id = $1
                LIMIT 1;
            `;

            const evidenceResult = await client.query(
                evidenceQuery,
                [issueId]
            );

            if (evidenceResult.rows.length === 0) {
                throw new AppError(
                    "Evidence is required before resolving the issue",
                    400
                );
            }
        }


        // ------------------------------------------
        // Start transaction
        // ------------------------------------------

        await client.query("BEGIN");


        // ------------------------------------------
        // Update issue and maintain resolved_at timestamp
        // ------------------------------------------

        const updateQuery = `
            UPDATE civic_issues
            SET
                status = $1,
                resolved_at = ${status === 'RESOLVED' ? 'CURRENT_TIMESTAMP' : (status === 'REOPENED' ? 'NULL' : 'resolved_at')},
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *;
        `;

        const updateResult = await client.query(
            updateQuery,
            [status, issueId]
        );

        const updatedIssue =
            updateResult.rows[0];


        // ------------------------------------------
        // Insert status history
        // ------------------------------------------

        const historyQuery = `
            INSERT INTO issue_status_history (
                civic_issue_id,
                status,
                changed_by,
                note
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;

        const historyResult = await client.query(
            historyQuery,
            [
                issueId,
                status,
                userId,
                note || null
            ]
        );

        // Record in audit_logs
        await client.query(
            `INSERT INTO audit_logs (
                entity_type,
                entity_id,
                action,
                performed_by,
                details
            ) VALUES ($1, $2, $3, $4, $5)`,
            [
                "CIVIC_ISSUE",
                issueId,
                "STATUS_CHANGE",
                userId,
                JSON.stringify({
                    old_status: issue.status,
                    new_status: status,
                    note: note || null
                })
            ]
        );


        // ------------------------------------------
        // Commit transaction
        // ------------------------------------------

        await client.query("COMMIT");

        // Notify citizens asynchronously (in-app & email)
        notifyIssueCitizens({
            civicIssueId: issueId,
            title: `Issue #${issueId} Status: ${status}`,
            message: `Civic issue status updated to ${status}.${note ? " Officer note: " + note : ""}`,
            type: "STATUS_CHANGE",
            status,
            note
        }).catch(() => {});

        // ------------------------------------------
        // Return result
        // ------------------------------------------

        return {
            issue: updatedIssue,
            history: historyResult.rows[0]
        };

    }

    catch (error) {

        // Rollback only if a transaction was started.
        // PostgreSQL will report an error if ROLLBACK
        // is attempted without an active transaction,
        // so handle that safely.

        try {
            await client.query("ROLLBACK");
        }
        catch (rollbackError) {
            // No active transaction or rollback failure.
        }

        throw error;

    }

    finally {

        client.release();

    }
}


async function getIssueHistory(issueId) {

    const query = `
        SELECT
            issue_status_history.id,
            issue_status_history.civic_issue_id,
            issue_status_history.status,
            issue_status_history.changed_by,
            users.name AS changed_by_name,
            issue_status_history.changed_at,
            issue_status_history.evidence,
            issue_status_history.note
        FROM issue_status_history
        JOIN users
            ON issue_status_history.changed_by = users.id
        WHERE issue_status_history.civic_issue_id = $1
        ORDER BY issue_status_history.changed_at ASC;
    `;

    const result = await pool.query(
        query,
        [issueId]
    );

    return result.rows;
}


async function uploadEvidence(
    civicIssueId,
    userId,
    image,
    description
) {

    const issueQuery = `
        SELECT id
        FROM civic_issues
        WHERE id = $1;
    `;

    const issueResult = await pool.query(
        issueQuery,
        [civicIssueId]
    );

    if (issueResult.rows.length === 0) {
        throw new AppError(
            "CivicIssue not found",
            404
        );
    }

    const query = `
        INSERT INTO issue_evidence (
            civic_issue_id,
            uploaded_by,
            image,
            description
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *;
    `;

    const values = [
        civicIssueId,
        userId,
        image,
        description
    ];

    const result = await pool.query(
        query,
        values
    );

    const evidence = result.rows[0];

    // Trigger AI resolution verification asynchronously
    verifyResolutionEvidence(civicIssueId, evidence.id, description).catch((err) => {
        console.error("AI resolution verification error:", err.message);
    });

    return evidence;
}


async function getIssueEvidence(issueId) {

    const query = `
        SELECT
            issue_evidence.id,
            issue_evidence.civic_issue_id,
            issue_evidence.uploaded_by,
            users.name AS uploaded_by_name,
            issue_evidence.image,
            issue_evidence.description,
            issue_evidence.created_at
        FROM issue_evidence
        JOIN users
            ON issue_evidence.uploaded_by = users.id
        WHERE issue_evidence.civic_issue_id = $1
        ORDER BY issue_evidence.created_at ASC;
    `;

    const result = await pool.query(
        query,
        [issueId]
    );

    return result.rows;
}





async function getMyReports(userId) {

    const query = `
        SELECT
            reports.id AS report_id,
            reports.civic_issue_id,
            reports.title,
            reports.description,
            reports.category,
            reports.image,
            civic_issues.status AS issue_status,
            civic_issues.priority_score
        FROM reports
        JOIN civic_issues
            ON reports.civic_issue_id = civic_issues.id
        WHERE reports.user_id = $1
        ORDER BY reports.id DESC;
    `;

    const result = await pool.query(
        query,
        [userId]
    );

    return result.rows;
}





async function getMyReportById(reportId, userId) {

    const query = `
        SELECT
            reports.id AS report_id,
            reports.user_id,
            reports.civic_issue_id,
            reports.title,
            reports.description,
            reports.category,
            reports.image,
            civic_issues.status AS issue_status,
            civic_issues.priority_score
        FROM reports
        JOIN civic_issues
            ON reports.civic_issue_id = civic_issues.id
        WHERE reports.id = $1
        AND reports.user_id = $2;
    `;

    const result = await pool.query(
        query,
        [
            reportId,
            userId
        ]
    );

    if (result.rows.length === 0) {

        throw new AppError(
            "Report not found",
            404
        );

    }

    return result.rows[0];
}

async function createReport(
    userId,
    title,
    description,
    category,
    latitude,
    longitude,
    image,
    attachment   // optional: { originalFilename, originalMimeType, mimeType, originalFileSizeBytes, fileSizeBytes, width, height, sha256, secureUrl, publicId }
) {

    const client = await pool.connect();

    try {

        // ------------------------------------------
        // Start transaction
        // ------------------------------------------

        await client.query("BEGIN");

        // ------------------------------------------
        // Decide department and validate category dynamically
        // ------------------------------------------

        const catQuery = `
            SELECT c.code, c.department_id, c.sla_hours, d.id AS dept_id, d.name AS department_name
            FROM categories c
            JOIN departments d ON c.department_id = d.id
            WHERE c.code = $1 AND c.is_active = TRUE;
        `;
        const catRes = await client.query(catQuery, [category.toUpperCase()]);

        let departmentId;
        if (catRes.rows.length > 0) {
            departmentId = catRes.rows[0].department_id;
        } else {
            const fallbackNames = {
                ROAD: "Road Department",
                SANITATION: "Sanitation Department",
                WATER: "Water Department",
                LIGHTING: "Street Lighting Department"
            };
            const fallbackName = fallbackNames[category.toUpperCase()];
            if (!fallbackName) {
                throw new AppError("Invalid category", 400);
            }
            const departmentResult = await client.query(
                "SELECT id FROM departments WHERE name = $1;",
                [fallbackName]
            );
            if (departmentResult.rows.length === 0) {
                throw new AppError("Department not found", 500);
            }
            departmentId = departmentResult.rows[0].id;
        }


        // ------------------------------------------
        // Find nearby CivicIssue
        // ------------------------------------------

        const hasPostgis = await isPostgisAvailable();

        let issueResult;

        if (hasPostgis) {
            // High-precision PostGIS ST_DWithin search (100 meters) using spatial GIST index
            const findIssueQuery = `
                SELECT id
                FROM civic_issues
                WHERE category = $1
                  AND status != 'RESOLVED'
                  AND location IS NOT NULL
                  AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, 100)
                ORDER BY ST_Distance(location, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography) ASC
                LIMIT 1;
            `;
            issueResult = await client.query(findIssueQuery, [category, latitude, longitude]);
        } else {
            // Degree-based bounding box fallback
            const findIssueQuery = `
                SELECT id
                FROM civic_issues
                WHERE category = $1
                  AND status != 'RESOLVED'
                  AND latitude BETWEEN $2 AND $3
                  AND longitude BETWEEN $4 AND $5
                LIMIT 1;
            `;
            issueResult = await client.query(findIssueQuery, [
                category,
                latitude - 0.001,
                latitude + 0.001,
                longitude - 0.001,
                longitude + 0.001
            ]);
        }

        let civicIssueId;


        // ------------------------------------------
        // Use existing issue
        // ------------------------------------------

        if (issueResult.rows.length > 0) {

            civicIssueId =
                issueResult.rows[0].id;

        }


        // ------------------------------------------
        // Create new issue
        // ------------------------------------------

        else {

            const ward = await findWardByCoordinates(latitude, longitude);
            const wardId = ward?.id || null;

            if (hasPostgis) {
                const createIssueQuery = `
                    INSERT INTO civic_issues (
                        title,
                        category,
                        status,
                        priority_score,
                        latitude,
                        longitude,
                        location,
                        department_id,
                        ward_id
                    )
                    VALUES (
                        $1,
                        $2,
                        'OPEN',
                        50,
                        $3,
                        $4,
                        ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
                        $5,
                        $6
                    )
                    RETURNING id;
                `;
                const newIssueResult = await client.query(createIssueQuery, [
                    title,
                    category,
                    latitude,
                    longitude,
                    departmentId,
                    wardId
                ]);
                civicIssueId = newIssueResult.rows[0].id;
            } else {
                const createIssueQuery = `
                    INSERT INTO civic_issues (
                        title,
                        category,
                        status,
                        priority_score,
                        latitude,
                        longitude,
                        department_id,
                        ward_id
                    )
                    VALUES (
                        $1,
                        $2,
                        'OPEN',
                        50,
                        $3,
                        $4,
                        $5,
                        $6
                    )
                    RETURNING id;
                `;
                const newIssueResult = await client.query(createIssueQuery, [
                    title,
                    category,
                    latitude,
                    longitude,
                    departmentId,
                    wardId
                ]);
                civicIssueId = newIssueResult.rows[0].id;
            }

        }


        // ------------------------------------------
        // Create report
        // ------------------------------------------

        const reportWard = await findWardByCoordinates(latitude, longitude);
        const reportWardId = reportWard?.id || null;

        let insertReportQuery;
        let insertReportValues;

        if (hasPostgis) {
            insertReportQuery = `
                INSERT INTO reports (
                    user_id,
                    civic_issue_id,
                    title,
                    description,
                    category,
                    image,
                    latitude,
                    longitude,
                    location,
                    ward_id
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8,
                    ST_SetSRID(ST_MakePoint($8, $7), 4326)::geography,
                    $9
                )
                RETURNING *;
            `;
            insertReportValues = [
                userId,
                civicIssueId,
                title,
                description,
                category,
                image,
                latitude,
                longitude,
                reportWardId
            ];
        } else {
            insertReportQuery = `
                INSERT INTO reports (
                    user_id,
                    civic_issue_id,
                    title,
                    description,
                    category,
                    image,
                    latitude,
                    longitude,
                    ward_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *;
            `;
            insertReportValues = [
                userId,
                civicIssueId,
                title,
                description,
                category,
                image,
                latitude,
                longitude,
                reportWardId
            ];
        }

        const reportResult = await client.query(
            insertReportQuery,
            insertReportValues
        );


        // ------------------------------------------
        // Save attachment record (if image was uploaded)
        // ------------------------------------------

        let attachmentRow = null;

        if (attachment) {

            const insertAttachmentQuery = `
                INSERT INTO report_attachments (
                    report_id,
                    uploaded_by,
                    storage_provider,
                    object_key,
                    original_filename,
                    original_mime_type,
                    mime_type,
                    original_file_size_bytes,
                    file_size_bytes,
                    width,
                    height,
                    sha256,
                    status
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'READY')
                RETURNING id;
            `;

            const insertAttachmentValues = [
                reportResult.rows[0].id,
                userId,
                "cloudinary",
                attachment.publicId,
                attachment.originalFilename,
                attachment.originalMimeType,
                attachment.mimeType,
                attachment.originalFileSizeBytes,
                attachment.fileSizeBytes,
                attachment.width,
                attachment.height,
                attachment.sha256
            ];

            const attachmentResult = await client.query(
                insertAttachmentQuery,
                insertAttachmentValues
            );

            attachmentRow = {
                id: attachmentResult.rows[0].id,
                url: attachment.secureUrl
            };

        }


        // ------------------------------------------
        // Commit transaction
        // ------------------------------------------

        await client.query("COMMIT");

        // Trigger Context-Aware AI Assessment in background
        assessReport(reportResult.rows[0].id, civicIssueId, title, description, latitude, longitude).catch((err) => {
            console.error("AI assessment background job error:", err.message);
        });

        // Dispatch Citizen Grievance Confirmation Email asynchronously
        pool.query("SELECT email, name FROM users WHERE id = $1", [userId])
            .then((uRes) => {
                if (uRes.rows.length > 0 && uRes.rows[0].email) {
                    sendReportConfirmationEmail({
                        email: uRes.rows[0].email,
                        name: uRes.rows[0].name,
                        reportId: reportResult.rows[0].id,
                        issueId: civicIssueId,
                        title,
                        category
                    }).catch(() => {});
                }
            })
            .catch(() => {});


        return {
            ...reportResult.rows[0],
            attachment: attachmentRow
        };

    }

    catch (error) {

        // ------------------------------------------
        // Rollback transaction
        // ------------------------------------------

        await client.query("ROLLBACK");

        throw error;

    }

    finally {

        // ------------------------------------------
        // Release database connection
        // ------------------------------------------

        client.release();

    }
}


// ======================================================
// GET ISSUE DETAILS
// ======================================================

async function getIssueDetails(issueId) {

    const issueQuery = `
        SELECT
            civic_issues.id AS issue_id,
            civic_issues.title AS issue_title,
            civic_issues.category,
            civic_issues.status,
            civic_issues.priority_score,
            civic_issues.latitude,
            civic_issues.longitude,
            civic_issues.ward_id,
            mw.ward_number,
            mw.name AS ward_name,
            mw.zone_name,
            departments.name AS department_name
        FROM civic_issues
        JOIN departments
            ON civic_issues.department_id = departments.id
        LEFT JOIN municipal_wards mw
            ON civic_issues.ward_id = mw.id
        WHERE civic_issues.id = $1;
    `;


    const issueResult = await pool.query(
        issueQuery,
        [issueId]
    );


    if (issueResult.rows.length === 0) {

        throw new AppError(
            "CivicIssue not found",
            404
        );

    }


    const reportsQuery = `
        SELECT *
        FROM reports
        WHERE civic_issue_id = $1
        ORDER BY id ASC;
    `;


    const reportsResult = await pool.query(
        reportsQuery,
        [issueId]
    );


    const historyQuery = `
        SELECT
            issue_status_history.id,
            issue_status_history.status,
            issue_status_history.changed_by,
            users.name AS changed_by_name,
            issue_status_history.changed_at,
            issue_status_history.evidence
        FROM issue_status_history
        JOIN users
            ON issue_status_history.changed_by = users.id
        WHERE issue_status_history.civic_issue_id = $1
        ORDER BY issue_status_history.changed_at ASC;
    `;


    const historyResult = await pool.query(
        historyQuery,
        [issueId]
    );


    const evidenceQuery = `
        SELECT
            issue_evidence.id,
            issue_evidence.uploaded_by,
            users.name AS uploaded_by_name,
            issue_evidence.image,
            issue_evidence.description,
            issue_evidence.created_at
        FROM issue_evidence
        JOIN users
            ON issue_evidence.uploaded_by = users.id
        WHERE issue_evidence.civic_issue_id = $1
        ORDER BY issue_evidence.created_at ASC;
    `;


    const evidenceResult = await pool.query(
        evidenceQuery,
        [issueId]
    );

    const assignmentsQuery = `
        SELECT
            ia.id,
            ia.civic_issue_id,
            ia.assigned_to,
            u_to.name AS assigned_to_name,
            u_to.email AS assigned_to_email,
            ia.assigned_by,
            u_by.name AS assigned_by_name,
            ia.notes,
            ia.assigned_at
        FROM issue_assignments ia
        JOIN users u_to ON ia.assigned_to = u_to.id
        JOIN users u_by ON ia.assigned_by = u_by.id
        WHERE ia.civic_issue_id = $1
        ORDER BY ia.assigned_at DESC;
    `;

    const assignmentsResult = await pool.query(
        assignmentsQuery,
        [issueId]
    );

    const auditQuery = `
        SELECT
            al.id,
            al.action,
            al.performed_by,
            u.name AS performed_by_name,
            al.details,
            al.created_at
        FROM audit_logs al
        JOIN users u ON al.performed_by = u.id
        WHERE al.entity_type = 'CIVIC_ISSUE' AND al.entity_id = $1
        ORDER BY al.created_at DESC;
    `;

    const auditResult = await pool.query(
        auditQuery,
        [issueId]
    );

    const aiAssessment = await getIssueAiAssessment(issueId).catch(() => null);

    return {
        issue: issueResult.rows[0],
        reports: reportsResult.rows,
        history: historyResult.rows,
        evidence: evidenceResult.rows,
        assignments: assignmentsResult.rows,
        auditLogs: auditResult.rows,
        aiAssessment
    };

}


// ======================================================
// GET ALL ISSUES
// ======================================================

async function getAllIssues(
    page = 1,
    limit = 10,
    search,
    category,
    status,
    sortBy,
    order,
    departmentId,
    wardId,
    assignedTo
) {

    page = Number(page);
    limit = Number(limit);

    if (
        !Number.isInteger(page) ||
        page < 1
    ) {
        throw new AppError(
            "Invalid page number",
            400
        );
    }

    if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 50
    ) {
        throw new AppError(
            "Limit must be between 1 and 50",
            400
        );
    }

    const offset = (page - 1) * limit;

    const sortColumns = {
        id: "civic_issues.id",
        priority_score: "civic_issues.priority_score",
        report_count: "COUNT(reports.id)"
    };

    const sortColumn =
        sortColumns[sortBy] || "civic_issues.id";

    const sortOrder =
        order === "desc" ? "DESC" : "ASC";

    const conditions = [];
    const filterValues = [];

    if (search) {
        filterValues.push(`%${search}%`);
        conditions.push(
            `civic_issues.title ILIKE $${filterValues.length}`
        );
    }

    if (category) {
        filterValues.push(category);
        conditions.push(
            `civic_issues.category = $${filterValues.length}`
        );
    }

    if (status) {
        filterValues.push(status);
        conditions.push(
            `civic_issues.status = $${filterValues.length}`
        );
    }

    if (departmentId) {
        filterValues.push(Number(departmentId));
        conditions.push(
            `civic_issues.department_id = $${filterValues.length}`
        );
    }

    if (wardId) {
        filterValues.push(Number(wardId));
        conditions.push(
            `civic_issues.ward_id = $${filterValues.length}`
        );
    }

    if (assignedTo) {
        filterValues.push(Number(assignedTo));
        conditions.push(
            `EXISTS (
                SELECT 1 FROM issue_assignments ia
                WHERE ia.civic_issue_id = civic_issues.id
                  AND ia.assigned_to = $${filterValues.length}
            )`
        );
    }

    const whereClause =
        conditions.length > 0
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

    const limitParameter = filterValues.length + 1;
    const offsetParameter = filterValues.length + 2;

    const queryValues = [
        ...filterValues,
        limit,
        offset
    ];

    const query = `
        SELECT
            civic_issues.id AS issue_id,
            civic_issues.title AS issue_title,
            civic_issues.category,
            civic_issues.status,
            civic_issues.priority_score,
            civic_issues.latitude,
            civic_issues.longitude,
            civic_issues.department_id,
            civic_issues.ward_id,
            mw.ward_number,
            mw.name AS ward_name,
            mw.zone_name,
            civic_issues.created_at,
            civic_issues.resolved_at,
            COALESCE(c.sla_hours, 72) AS sla_hours,
            c.icon AS category_icon,
            CASE
                WHEN civic_issues.status = 'RESOLVED' THEN
                    CASE
                        WHEN (civic_issues.resolved_at - civic_issues.created_at) <= (COALESCE(c.sla_hours, 72) || ' hours')::interval
                        THEN 'SLA_MET'
                        ELSE 'SLA_BREACHED'
                    END
                WHEN (NOW() - civic_issues.created_at) > (COALESCE(c.sla_hours, 72) || ' hours')::interval
                THEN 'OVERDUE'
                ELSE 'WITHIN_SLA'
            END AS sla_status,
            ROUND(EXTRACT(EPOCH FROM (civic_issues.created_at + (COALESCE(c.sla_hours, 72) || ' hours')::interval - NOW())) / 3600) AS sla_hours_remaining,
            departments.name AS department_name,
            COUNT(reports.id) AS report_count,
            (
                SELECT u.name FROM issue_assignments ia
                JOIN users u ON ia.assigned_to = u.id
                WHERE ia.civic_issue_id = civic_issues.id
                ORDER BY ia.assigned_at DESC LIMIT 1
            ) AS assigned_to_name
        FROM civic_issues
        JOIN departments
            ON civic_issues.department_id = departments.id
        LEFT JOIN municipal_wards mw
            ON civic_issues.ward_id = mw.id
        LEFT JOIN categories c
            ON civic_issues.category = c.code
        LEFT JOIN reports
            ON civic_issues.id = reports.civic_issue_id
        ${whereClause}
        GROUP BY
            civic_issues.id,
            civic_issues.title,
            civic_issues.category,
            civic_issues.status,
            civic_issues.priority_score,
            civic_issues.latitude,
            civic_issues.longitude,
            civic_issues.department_id,
            civic_issues.ward_id,
            mw.ward_number,
            mw.name,
            mw.zone_name,
            civic_issues.created_at,
            civic_issues.resolved_at,
            c.sla_hours,
            c.icon,
            departments.name
        ORDER BY ${sortColumn} ${sortOrder}, civic_issues.id ASC
        LIMIT $${limitParameter}
        OFFSET $${offsetParameter};
    `;

    const countQuery = `
        SELECT COUNT(*) AS total
        FROM civic_issues
        ${whereClause};
    `;

    const result = await pool.query(
        query,
        queryValues
    );

    const countResult = await pool.query(
        countQuery,
        filterValues
    );

    const total = Number(
        countResult.rows[0].total
    );

    const issues = result.rows.map(issue => ({
        ...issue,
        report_count: Number(issue.report_count)
    }));

    return {
        issues,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };

}


// ======================================================
// AUTHORITY & ASSIGNMENT SERVICES
// ======================================================

async function assignIssue(issueId, assignedToUserId, assignedByUserId, notes = null) {

    const issueCheck = await pool.query(
        `SELECT ci.id, ci.title, ci.priority_score, d.name AS department_name
         FROM civic_issues ci
         LEFT JOIN departments d ON ci.department_id = d.id
         WHERE ci.id = $1`,
        [issueId]
    );

    if (issueCheck.rows.length === 0) {
        throw new AppError("CivicIssue not found", 404);
    }

    const userCheck = await pool.query(
        "SELECT id, name, role FROM users WHERE id = $1",
        [assignedToUserId]
    );

    if (userCheck.rows.length === 0) {
        throw new AppError("Assigned user not found", 404);
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const insertQuery = `
            INSERT INTO issue_assignments (
                civic_issue_id,
                assigned_to,
                assigned_by,
                notes
            )
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;

        const result = await client.query(
            insertQuery,
            [issueId, assignedToUserId, assignedByUserId, notes]
        );

        // Record in audit_logs
        await client.query(
            `INSERT INTO audit_logs (
                entity_type,
                entity_id,
                action,
                performed_by,
                details
            ) VALUES ($1, $2, $3, $4, $5)`,
            [
                "CIVIC_ISSUE",
                issueId,
                "ASSIGNED",
                assignedByUserId,
                JSON.stringify({
                    assigned_to: assignedToUserId,
                    assigned_to_name: userCheck.rows[0].name,
                    notes: notes || null
                })
            ]
        );

        await client.query("COMMIT");

        // Notify assigned officer and citizens asynchronously
        notifyAssignedOfficer({
            officerId: assignedToUserId,
            civicIssueId: issueId,
            issueTitle: issueCheck.rows[0].title,
            priorityScore: issueCheck.rows[0].priority_score,
            department: issueCheck.rows[0].department_name
        }).catch(() => {});

        notifyIssueCitizens({
            civicIssueId: issueId,
            title: `Issue #${issueId} Assigned`,
            message: `A municipal officer has been assigned to investigate and resolve this issue.`,
            type: "ASSIGNMENT"
        }).catch(() => {});

        return {
            ...result.rows[0],
            assigned_to_name: userCheck.rows[0].name
        };
    }
    catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (e) {}
        throw error;
    }
    finally {
        client.release();
    }
}

async function getAdminStats() {

    const statusResult = await pool.query(`
        SELECT status, COUNT(*)::int AS count
        FROM civic_issues
        GROUP BY status;
    `);

    const categoryResult = await pool.query(`
        SELECT category, COUNT(*)::int AS count
        FROM civic_issues
        GROUP BY category;
    `);

    const deptResult = await pool.query(`
        SELECT d.id, d.name, COUNT(ci.id)::int AS count
        FROM departments d
        LEFT JOIN civic_issues ci ON ci.department_id = d.id
        GROUP BY d.id, d.name
        ORDER BY d.id ASC;
    `);

    const totalsResult = await pool.query(`
        SELECT
            (SELECT COUNT(*)::int FROM civic_issues) AS total_issues,
            (SELECT COUNT(*)::int FROM reports) AS total_reports,
            (SELECT COUNT(*)::int FROM users WHERE role = 'CITIZEN') AS total_citizens,
            (SELECT COUNT(*)::int FROM users WHERE role = 'ADMIN') AS total_officers,
            (SELECT COUNT(*)::int FROM civic_issues WHERE status = 'RESOLVED') AS resolved_issues,
            (SELECT COUNT(*)::int FROM civic_issues WHERE status IN ('OPEN', 'IN_PROGRESS', 'REOPENED')) AS active_issues;
    `);

    const slaResult = await pool.query(`
        SELECT
            COUNT(CASE WHEN ci.status = 'RESOLVED' AND (ci.resolved_at - ci.created_at) <= (COALESCE(c.sla_hours, 72) || ' hours')::interval THEN 1 END)::int AS sla_met,
            COUNT(CASE WHEN ci.status = 'RESOLVED' AND (ci.resolved_at - ci.created_at) > (COALESCE(c.sla_hours, 72) || ' hours')::interval THEN 1 END)::int AS sla_breached,
            COUNT(CASE WHEN ci.status NOT IN ('RESOLVED', 'REJECTED') AND (NOW() - ci.created_at) > (COALESCE(c.sla_hours, 72) || ' hours')::interval THEN 1 END)::int AS currently_overdue,
            COUNT(CASE WHEN ci.status NOT IN ('RESOLVED', 'REJECTED') AND (NOW() - ci.created_at) <= (COALESCE(c.sla_hours, 72) || ' hours')::interval THEN 1 END)::int AS on_schedule,
            ROUND(AVG(CASE WHEN ci.status = 'RESOLVED' THEN EXTRACT(EPOCH FROM (ci.resolved_at - ci.created_at)) / 3600 END)::numeric, 1) AS avg_resolution_hours
        FROM civic_issues ci
        LEFT JOIN categories c ON ci.category = c.code;
    `);

    const satisfactionResult = await pool.query(`
        SELECT
            ROUND(AVG(rating), 2) AS average_rating,
            COUNT(*)::int AS total_reviews,
            ROUND((COUNT(CASE WHEN is_satisfied = TRUE THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100, 1) AS satisfaction_rate_percent
        FROM resolution_feedback;
    `);

    return {
        totals: totalsResult.rows[0],
        byStatus: statusResult.rows,
        byCategory: categoryResult.rows,
        byDepartment: deptResult.rows,
        slaMetrics: slaResult.rows[0],
        citizenSatisfaction: satisfactionResult.rows[0]
    };
}

async function getAllOfficers() {

    const result = await pool.query(`
        SELECT id, name, email, role
        FROM users
        WHERE role = 'ADMIN'
        ORDER BY name ASC;
    `);

    return result.rows;
}

async function getDepartments() {

    const result = await pool.query(`
        SELECT id, name
        FROM departments
        ORDER BY id ASC;
    `);

    return result.rows;
}

async function getMapIssues({ category, status, min_lat, max_lat, min_lng, max_lng } = {}) {

    const conditions = [];
    const values = [];

    if (category) {
        values.push(category);
        conditions.push(`ci.category = $${values.length}`);
    }

    if (status) {
        values.push(status);
        conditions.push(`ci.status = $${values.length}`);
    }

    if (min_lat && max_lat && min_lng && max_lng) {
        values.push(Number(min_lat), Number(max_lat), Number(min_lng), Number(max_lng));
        conditions.push(`ci.latitude BETWEEN $${values.length - 3} AND $${values.length - 2}`);
        conditions.push(`ci.longitude BETWEEN $${values.length - 1} AND $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
        SELECT
            ci.id,
            ci.title,
            ci.category,
            ci.status,
            ci.priority_score,
            ci.latitude,
            ci.longitude,
            d.name AS department_name,
            COUNT(r.id) AS report_count
        FROM civic_issues ci
        JOIN departments d ON ci.department_id = d.id
        LEFT JOIN reports r ON ci.id = r.civic_issue_id
        ${whereClause}
        GROUP BY ci.id, ci.title, ci.category, ci.status, ci.priority_score, ci.latitude, ci.longitude, d.name
        ORDER BY ci.priority_score DESC, ci.id DESC
        LIMIT 300;
    `;

    const result = await pool.query(query, values);
    return result.rows.map(row => ({
        ...row,
        report_count: Number(row.report_count),
        latitude: Number(row.latitude),
        longitude: Number(row.longitude)
    }));
}

// ======================================================
// CITIZEN RESOLUTION FEEDBACK & REOPEN WORKFLOW
// ======================================================

async function submitResolutionFeedback({ civicIssueId, userId, rating, comment, isSatisfied }) {
    const issueCheck = await pool.query(
        "SELECT id, status FROM civic_issues WHERE id = $1",
        [civicIssueId]
    );

    if (issueCheck.rows.length === 0) {
        throw new AppError("CivicIssue not found", 404);
    }

    if (issueCheck.rows[0].status !== "RESOLVED") {
        throw new AppError("Feedback can only be submitted for RESOLVED issues", 400);
    }

    const query = `
        INSERT INTO resolution_feedback (
            civic_issue_id,
            user_id,
            rating,
            comment,
            is_satisfied
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (civic_issue_id, user_id)
        DO UPDATE SET
            rating = EXCLUDED.rating,
            comment = EXCLUDED.comment,
            is_satisfied = EXCLUDED.is_satisfied,
            created_at = CURRENT_TIMESTAMP
        RETURNING *;
    `;

    const res = await pool.query(query, [
        civicIssueId,
        userId,
        rating,
        comment || null,
        isSatisfied !== undefined ? isSatisfied : (rating >= 3)
    ]);

    await pool.query(
        `INSERT INTO audit_logs (
            entity_type,
            entity_id,
            action,
            performed_by,
            details
        ) VALUES ($1, $2, $3, $4, $5)`,
        [
            "CIVIC_ISSUE",
            civicIssueId,
            "RESOLUTION_FEEDBACK",
            userId,
            JSON.stringify({
                rating,
                is_satisfied: isSatisfied,
                has_comment: !!comment
            })
        ]
    );

    return res.rows[0];
}

async function getResolutionFeedback(civicIssueId) {
    const query = `
        SELECT
            rf.id,
            rf.civic_issue_id,
            rf.user_id,
            rf.rating,
            rf.comment,
            rf.is_satisfied,
            rf.created_at,
            u.name AS user_name
        FROM resolution_feedback rf
        JOIN users u ON rf.user_id = u.id
        WHERE rf.civic_issue_id = $1
        ORDER BY rf.created_at DESC;
    `;
    const res = await pool.query(query, [civicIssueId]);
    return res.rows;
}

async function reopenIssueByCitizen({ civicIssueId, userId, reason }) {
    const issueCheck = await pool.query(
        "SELECT id, status FROM civic_issues WHERE id = $1",
        [civicIssueId]
    );

    if (issueCheck.rows.length === 0) {
        throw new AppError("CivicIssue not found", 404);
    }

    if (issueCheck.rows[0].status !== "RESOLVED") {
        throw new AppError("Only RESOLVED issues can be reopened", 400);
    }

    // Verify user is a reporter or authority
    const reporterCheck = await pool.query(
        "SELECT id FROM reports WHERE civic_issue_id = $1 AND user_id = $2",
        [civicIssueId, userId]
    );

    const userCheck = await pool.query(
        "SELECT role FROM users WHERE id = $1",
        [userId]
    );

    const isAuthority = userCheck.rows.length > 0 && ["ADMIN", "OFFICER"].includes(userCheck.rows[0].role);

    if (reporterCheck.rows.length === 0 && !isAuthority) {
        throw new AppError("You can only request reopening for issues you have reported", 403);
    }

    return await updateIssueStatus(
        civicIssueId,
        "REOPENED",
        userId,
        `Citizen Reopen Request: ${reason || "Resolution dispute"}`
    );
}

// ======================================================
// CONFIGURABLE CATEGORIES & SLA MANAGEMENT
// ======================================================

async function getCategories(includeInactive = false) {
    const query = `
        SELECT
            c.code,
            c.name,
            c.description,
            c.icon,
            c.department_id,
            d.name AS department_name,
            c.sla_hours,
            c.is_active,
            c.created_at,
            COUNT(ci.id)::int AS issue_count
        FROM categories c
        JOIN departments d ON c.department_id = d.id
        LEFT JOIN civic_issues ci ON c.code = ci.category
        ${includeInactive ? "" : "WHERE c.is_active = TRUE"}
        GROUP BY c.code, c.name, c.description, c.icon, c.department_id, d.name, c.sla_hours, c.is_active, c.created_at
        ORDER BY c.name ASC;
    `;
    const res = await pool.query(query);
    return res.rows;
}

async function createCategory({ code, name, description, icon = '📌', departmentId, slaHours = 72 }) {
    const formattedCode = code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');

    const deptCheck = await pool.query("SELECT id FROM departments WHERE id = $1", [departmentId]);
    if (deptCheck.rows.length === 0) {
        throw new AppError("Department not found", 404);
    }

    const query = `
        INSERT INTO categories (code, name, description, icon, department_id, sla_hours)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
    `;
    try {
        const res = await pool.query(query, [
            formattedCode,
            name.trim(),
            description?.trim() || null,
            icon?.trim() || '📌',
            departmentId,
            Number(slaHours) || 72
        ]);
        return res.rows[0];
    } catch (err) {
        if (err.code === '23505') {
            throw new AppError("A category with this code already exists", 400);
        }
        throw err;
    }
}

async function updateCategory(code, fields = {}) {
    const { name, description, icon, departmentId, slaHours, isActive } = fields;

    const setClauses = [];
    const values = [];

    if (name !== undefined) {
        values.push(name.trim());
        setClauses.push(`name = $${values.length}`);
    }
    if (description !== undefined) {
        values.push(description?.trim() || null);
        setClauses.push(`description = $${values.length}`);
    }
    if (icon !== undefined) {
        values.push(icon?.trim() || '📌');
        setClauses.push(`icon = $${values.length}`);
    }
    if (departmentId !== undefined) {
        values.push(departmentId);
        setClauses.push(`department_id = $${values.length}`);
    }
    if (slaHours !== undefined) {
        values.push(Number(slaHours));
        setClauses.push(`sla_hours = $${values.length}`);
    }
    if (isActive !== undefined) {
        values.push(Boolean(isActive));
        setClauses.push(`is_active = $${values.length}`);
    }

    if (setClauses.length === 0) {
        throw new AppError("No fields provided for update", 400);
    }

    values.push(code.toUpperCase());
    const query = `
        UPDATE categories
        SET ${setClauses.join(", ")}
        WHERE code = $${values.length}
        RETURNING *;
    `;
    const res = await pool.query(query, values);
    if (res.rows.length === 0) {
        throw new AppError("Category not found", 404);
    }
    return res.rows[0];
}

// ======================================================
// MUNICIPAL ANALYTICS & SLA PERFORMANCE
// ======================================================

async function getMunicipalAnalytics() {
    const deptSlaQuery = `
        SELECT
            d.id AS department_id,
            d.name AS department_name,
            COUNT(ci.id)::int AS total_issues,
            COUNT(CASE WHEN ci.status = 'RESOLVED' THEN 1 END)::int AS resolved_count,
            COUNT(CASE WHEN ci.status = 'RESOLVED' AND (ci.resolved_at - ci.created_at) <= (COALESCE(c.sla_hours, 72) || ' hours')::interval THEN 1 END)::int AS resolved_within_sla,
            COUNT(CASE WHEN ci.status = 'RESOLVED' AND (ci.resolved_at - ci.created_at) > (COALESCE(c.sla_hours, 72) || ' hours')::interval THEN 1 END)::int AS resolved_breached_sla,
            COUNT(CASE WHEN ci.status NOT IN ('RESOLVED', 'REJECTED') AND (NOW() - ci.created_at) > (COALESCE(c.sla_hours, 72) || ' hours')::interval THEN 1 END)::int AS overdue_active,
            ROUND(AVG(CASE WHEN ci.status = 'RESOLVED' THEN EXTRACT(EPOCH FROM (ci.resolved_at - ci.created_at)) / 3600 END)::numeric, 1) AS avg_resolution_hours
        FROM departments d
        LEFT JOIN civic_issues ci ON ci.department_id = d.id
        LEFT JOIN categories c ON ci.category = c.code
        GROUP BY d.id, d.name
        ORDER BY d.id ASC;
    `;
    const deptSlaRes = await pool.query(deptSlaQuery);

    const satisfactionQuery = `
        SELECT
            ROUND(AVG(rating), 2) AS average_rating,
            COUNT(*)::int AS total_reviews,
            COUNT(CASE WHEN rating = 5 THEN 1 END)::int AS five_star,
            COUNT(CASE WHEN rating = 4 THEN 1 END)::int AS four_star,
            COUNT(CASE WHEN rating = 3 THEN 1 END)::int AS three_star,
            COUNT(CASE WHEN rating <= 2 THEN 1 END)::int AS low_star,
            ROUND((COUNT(CASE WHEN is_satisfied = TRUE THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100, 1) AS satisfaction_rate_percent
        FROM resolution_feedback;
    `;
    const satRes = await pool.query(satisfactionQuery);

    const hazardsQuery = `
        SELECT
            COUNT(*)::int AS total_hazards,
            COUNT(CASE WHEN ci.status != 'RESOLVED' THEN 1 END)::int AS active_hazards,
            COUNT(CASE WHEN aa.hazard_type = 'ELECTRICAL' AND ci.status != 'RESOLVED' THEN 1 END)::int AS electrical_hazards,
            COUNT(CASE WHEN aa.hazard_type = 'STRUCTURAL' AND ci.status != 'RESOLVED' THEN 1 END)::int AS structural_hazards,
            COUNT(CASE WHEN aa.hazard_type = 'HEALTH' AND ci.status != 'RESOLVED' THEN 1 END)::int AS health_hazards
        FROM ai_assessments aa
        JOIN civic_issues ci ON aa.civic_issue_id = ci.id
        WHERE aa.safety_hazard_detected = TRUE;
    `;
    const hazardsRes = await pool.query(hazardsQuery);

    const overallSlaQuery = `
        SELECT
            COUNT(CASE WHEN ci.status = 'RESOLVED' AND (ci.resolved_at - ci.created_at) <= (COALESCE(c.sla_hours, 72) || ' hours')::interval THEN 1 END)::int AS sla_met,
            COUNT(CASE WHEN ci.status = 'RESOLVED' AND (ci.resolved_at - ci.created_at) > (COALESCE(c.sla_hours, 72) || ' hours')::interval THEN 1 END)::int AS sla_breached,
            COUNT(CASE WHEN ci.status NOT IN ('RESOLVED', 'REJECTED') AND (NOW() - ci.created_at) > (COALESCE(c.sla_hours, 72) || ' hours')::interval THEN 1 END)::int AS currently_overdue,
            COUNT(CASE WHEN ci.status NOT IN ('RESOLVED', 'REJECTED') AND (NOW() - ci.created_at) <= (COALESCE(c.sla_hours, 72) || ' hours')::interval THEN 1 END)::int AS on_schedule,
            ROUND(AVG(CASE WHEN ci.status = 'RESOLVED' THEN EXTRACT(EPOCH FROM (ci.resolved_at - ci.created_at)) / 3600 END)::numeric, 1) AS avg_resolution_hours
        FROM civic_issues ci
        LEFT JOIN categories c ON ci.category = c.code;
    `;
    const overallSlaRes = await pool.query(overallSlaQuery);

    return {
        departments: deptSlaRes.rows,
        satisfaction: satRes.rows[0],
        hazards: hazardsRes.rows[0],
        overallSla: overallSlaRes.rows[0]
    };
}

// ======================================================
// PUBLIC TRANSPARENCY & TRACKING
// ======================================================

async function getPublicIssueTracking(issueId) {
    const issueQuery = `
        SELECT
            ci.id,
            ci.title,
            ci.category,
            ci.status,
            ci.priority_score,
            ci.latitude,
            ci.longitude,
            ci.created_at,
            ci.resolved_at,
            ci.ward_id,
            mw.ward_number,
            mw.name AS ward_name,
            mw.zone_name,
            d.name AS department_name,
            c.name AS category_name,
            c.icon AS category_icon,
            c.sla_hours,
            COUNT(DISTINCT r.id)::int AS report_count,
            (SELECT image FROM reports WHERE civic_issue_id = ci.id AND image IS NOT NULL LIMIT 1) AS initial_image,
            (SELECT image FROM issue_evidence WHERE civic_issue_id = ci.id ORDER BY created_at DESC LIMIT 1) AS resolution_image,
            (SELECT description FROM issue_evidence WHERE civic_issue_id = ci.id ORDER BY created_at DESC LIMIT 1) AS resolution_notes
        FROM civic_issues ci
        JOIN departments d ON ci.department_id = d.id
        LEFT JOIN municipal_wards mw ON ci.ward_id = mw.id
        LEFT JOIN categories c ON ci.category = c.code
        LEFT JOIN reports r ON ci.id = r.civic_issue_id
        WHERE ci.id = $1
        GROUP BY ci.id, ci.title, ci.category, ci.status, ci.priority_score, ci.latitude, ci.longitude, ci.created_at, ci.resolved_at, ci.ward_id, mw.ward_number, mw.name, mw.zone_name, d.name, c.name, c.icon, c.sla_hours;
    `;
    const issueRes = await pool.query(issueQuery, [issueId]);
    if (issueRes.rows.length === 0) {
        throw new AppError("Civic issue not found", 404);
    }
    const issue = issueRes.rows[0];

    const historyQuery = `
        SELECT
            ish.id,
            ish.status,
            ish.changed_at,
            ish.note
        FROM issue_status_history ish
        WHERE ish.civic_issue_id = $1
        ORDER BY ish.changed_at ASC;
    `;
    const historyRes = await pool.query(historyQuery, [issueId]);

    const feedbackQuery = `
        SELECT
            ROUND(AVG(rating), 1) AS avg_rating,
            COUNT(*)::int AS total_feedback,
            ROUND((COUNT(CASE WHEN is_satisfied = TRUE THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100, 1) AS satisfaction_rate_percent
        FROM resolution_feedback
        WHERE civic_issue_id = $1;
    `;
    const feedbackRes = await pool.query(feedbackQuery, [issueId]);

    const slaHours = issue.sla_hours || 72;
    let slaStatus = 'WITHIN_SLA';
    let slaHoursRemaining = 0;
    if (issue.status === 'RESOLVED') {
        const elapsedHours = (new Date(issue.resolved_at) - new Date(issue.created_at)) / 3600000;
        slaStatus = elapsedHours <= slaHours ? 'SLA_MET' : 'SLA_BREACHED';
    } else {
        const elapsedHours = (Date.now() - new Date(issue.created_at)) / 3600000;
        slaHoursRemaining = Math.round(slaHours - elapsedHours);
        if (slaHoursRemaining < 0) slaStatus = 'OVERDUE';
    }

    return {
        ...issue,
        sla_status: slaStatus,
        sla_hours_remaining: slaHoursRemaining,
        timeline: historyRes.rows,
        feedback: feedbackRes.rows[0] || null
    };
}

// ======================================================
// MUNICIPAL GIS & CSV EXPORTS
// ======================================================

async function exportIssuesGeoJson(filters = {}) {
    const { category, status, department_id } = filters;
    const conditions = [];
    const values = [];

    if (category) {
        values.push(category);
        conditions.push(`ci.category = $${values.length}`);
    }
    if (status) {
        values.push(status);
        conditions.push(`ci.status = $${values.length}`);
    }
    if (department_id) {
        values.push(department_id);
        conditions.push(`ci.department_id = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
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
            ci.resolved_at,
            d.name AS department_name,
            c.sla_hours
        FROM civic_issues ci
        JOIN departments d ON ci.department_id = d.id
        LEFT JOIN categories c ON ci.category = c.code
        ${whereClause}
        ORDER BY ci.id DESC
        LIMIT 5000;
    `;
    const res = await pool.query(query, values);

    return {
        type: "FeatureCollection",
        features: res.rows.map(row => ({
            type: "Feature",
            geometry: {
                type: "Point",
                coordinates: [Number(row.longitude), Number(row.latitude)]
            },
            properties: {
                id: row.id,
                title: row.title,
                category: row.category,
                status: row.status,
                priorityScore: row.priority_score,
                department: row.department_name,
                createdAt: row.created_at,
                resolvedAt: row.resolved_at,
                slaHours: row.sla_hours || 72
            }
        }))
    };
}

async function exportIssuesCsv(filters = {}) {
    const geoData = await exportIssuesGeoJson(filters);
    const headers = ["ID", "Title", "Category", "Status", "Priority Score", "Department", "Latitude", "Longitude", "Created At", "Resolved At"];

    function escapeCsv(val) {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
    }

    const lines = [headers.join(",")];
    for (const f of geoData.features) {
        const p = f.properties;
        const coords = f.geometry.coordinates;
        lines.push([
            p.id,
            escapeCsv(p.title),
            escapeCsv(p.category),
            escapeCsv(p.status),
            p.priorityScore,
            escapeCsv(p.department),
            coords[1],
            coords[0],
            escapeCsv(p.createdAt),
            escapeCsv(p.resolvedAt)
        ].join(","));
    }

    return lines.join("\r\n");
}

module.exports = {
    updateIssueStatus,
    getIssueHistory,
    uploadEvidence,
    getIssueEvidence,
    getMyReports,
    getMyReportById,
    createReport,
    getIssueDetails,
    getAllIssues,
    assignIssue,
    getAdminStats,
    getAllOfficers,
    getDepartments,
    getMapIssues,
    submitResolutionFeedback,
    getResolutionFeedback,
    reopenIssueByCitizen,
    getCategories,
    createCategory,
    updateCategory,
    getMunicipalAnalytics,
    getPublicIssueTracking,
    exportIssuesGeoJson,
    exportIssuesCsv,
    findWardByCoordinates,
    getAllWards,
    getWardAnalytics
};
