const pool = require("../db/database");
const AppError = require("../utils/AppError");
const { isPostgisAvailable, haversineDistance } = require("../utils/gis");

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
        // Update issue
        // ------------------------------------------

        const updateQuery = `
            UPDATE civic_issues
            SET status = $1
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

    return result.rows[0];
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

    // ------------------------------------------
    // Decide department
    // ------------------------------------------

    const departmentNames = {
    ROAD: "Road Department",
    SANITATION: "Sanitation Department",
    WATER: "Water Department",
    LIGHTING: "Street Lighting Department"
};

const departmentName = departmentNames[category];

if (!departmentName) {

    throw new AppError(
        "Invalid category",
        400
    );

}

    const client = await pool.connect();


    try {

        // ------------------------------------------
        // Start transaction
        // ------------------------------------------

        await client.query("BEGIN");

        // ------------------------------------------
// Find department dynamically
// ------------------------------------------

const departmentQuery = `
    SELECT id
    FROM departments
    WHERE name = $1;
`;

const departmentResult = await client.query(
    departmentQuery,
    [departmentName]
);

if (departmentResult.rows.length === 0) {

    throw new AppError(
        "Department not found",
        500
    );

}

const departmentId =
    departmentResult.rows[0].id;


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
                        department_id
                    )
                    VALUES (
                        $1,
                        $2,
                        'OPEN',
                        50,
                        $3,
                        $4,
                        ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
                        $5
                    )
                    RETURNING id;
                `;
                const newIssueResult = await client.query(createIssueQuery, [
                    title,
                    category,
                    latitude,
                    longitude,
                    departmentId
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
                        department_id
                    )
                    VALUES (
                        $1,
                        $2,
                        'OPEN',
                        50,
                        $3,
                        $4,
                        $5
                    )
                    RETURNING id;
                `;
                const newIssueResult = await client.query(createIssueQuery, [
                    title,
                    category,
                    latitude,
                    longitude,
                    departmentId
                ]);
                civicIssueId = newIssueResult.rows[0].id;
            }

        }


        // ------------------------------------------
        // Create report
        // ------------------------------------------

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
                    location
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8,
                    ST_SetSRID(ST_MakePoint($8, $7), 4326)::geography
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
                longitude
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
                    longitude
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
                longitude
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
            departments.name AS department_name
        FROM civic_issues
        JOIN departments
            ON civic_issues.department_id = departments.id
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


    return {
        issue: issueResult.rows[0],
        reports: reportsResult.rows,
        history: historyResult.rows,
        evidence: evidenceResult.rows,
        assignments: assignmentsResult.rows,
        auditLogs: auditResult.rows
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
    departmentId
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
        "SELECT id, title FROM civic_issues WHERE id = $1",
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

    return {
        totals: totalsResult.rows[0],
        byStatus: statusResult.rows,
        byCategory: categoryResult.rows,
        byDepartment: deptResult.rows
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
    getMapIssues
};
