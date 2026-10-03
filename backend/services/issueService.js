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

    let departmentId;

    if (category === "ROAD") {

        departmentId = 1;

    } else if (category === "SANITATION") {

        departmentId = 2;

    } else if (category === "WATER") {

        departmentId = 3;

    } else {

        throw new AppError(
            "Invalid category",
            400
        );

    }


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


    const issueResult = await pool.query(
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


        const newIssueResult = await pool.query(
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


    const reportResult = await pool.query(
        insertReportQuery,
        insertReportValues
    );


    return reportResult.rows[0];
}


module.exports = {
    updateIssueStatus,
    getIssueHistory,
    uploadEvidence,
    getIssueEvidence,
    getMyReports,
    getMyReportById,
    createReport
};