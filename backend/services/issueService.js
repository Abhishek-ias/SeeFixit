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


module.exports = {
    updateIssueStatus
};