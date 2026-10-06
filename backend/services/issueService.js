const pool = require("../db/database");
const AppError = require("../utils/AppError");

async function updateIssueStatus(issueId, status, userId) {

    const client = await pool.connect();

    try {

        // ------------------------------------------
        // Validate requested status
        // ------------------------------------------

        const validStatuses = [
            "OPEN",
            "IN_PROGRESS",
            "RESOLVED"
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

            if (status !== "IN_PROGRESS") {
                throw new AppError(
                    "OPEN issue can only move to IN_PROGRESS",
                    400
                );
            }

        }

        else if (issue.status === "IN_PROGRESS") {

            if (status !== "RESOLVED") {
                throw new AppError(
                    "IN_PROGRESS issue can only move to RESOLVED",
                    400
                );
            }

        }

        else if (issue.status === "RESOLVED") {

            throw new AppError(
                "Resolved issue cannot change status",
                400
            );

        }


        // ------------------------------------------
        // Evidence required before resolution
        // ------------------------------------------

        if (
            issue.status === "IN_PROGRESS" &&
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
                changed_by
            )
            VALUES ($1, $2, $3)
            RETURNING *;
        `;

        const historyResult = await client.query(
            historyQuery,
            [
                issueId,
                status,
                userId
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
            issue_status_history.evidence
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
    image
) {

    // ------------------------------------------
    // Decide department
    // ------------------------------------------

    const departmentNames = {
    ROAD: "Road Department",
    SANITATION: "Sanitation Department",
    WATER: "Water Department"
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

        const findIssueQuery = `
            SELECT id
            FROM civic_issues
            WHERE category = $1
            AND latitude BETWEEN $2 AND $3
            AND longitude BETWEEN $4 AND $5
            LIMIT 1;
        `;


        const findIssueValues = [
            category,
            latitude - 0.001,
            latitude + 0.001,
            longitude - 0.001,
            longitude + 0.001
        ];


        const issueResult = await client.query(
            findIssueQuery,
            findIssueValues
        );


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


            const createIssueValues = [
                title,
                category,
                latitude,
                longitude,
                departmentId
            ];


            const newIssueResult = await client.query(
                createIssueQuery,
                createIssueValues
            );


            civicIssueId =
                newIssueResult.rows[0].id;

        }


        // ------------------------------------------
        // Create report
        // ------------------------------------------

        const insertReportQuery = `
            INSERT INTO reports (
                user_id,
                civic_issue_id,
                title,
                description,
                category,
                image
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;


        const insertReportValues = [
            userId,
            civicIssueId,
            title,
            description,
            category,
            image
        ];


        const reportResult = await client.query(
            insertReportQuery,
            insertReportValues
        );


        // ------------------------------------------
        // Commit transaction
        // ------------------------------------------

        await client.query("COMMIT");


        return reportResult.rows[0];

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


    return {
        issue: issueResult.rows[0],
        reports: reportsResult.rows,
        history: historyResult.rows,
        evidence: evidenceResult.rows
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
    order
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
            departments.name AS department_name,
            COUNT(reports.id) AS report_count
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

    return {
        issues: result.rows,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
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
    getAllIssues
};
