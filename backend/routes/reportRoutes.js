const express = require("express");

const router = express.Router();

const pool = require("../db/database");

const authenticateToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const validateId = require("../middleware/validateId");

const {
    updateIssueStatus,
    getIssueHistory,
    uploadEvidence,
    getIssueEvidence,
    getMyReports,
    getMyReportById
} = require("../services/issueService");

const {
    sendSuccess,
    sendError
} = require("../utils/response");

const {
    createReportSchema
} = require("../validation/reportValidation");

const AppError = require("../utils/AppError");


// ======================================================
// REPORTS
// ======================================================


// ======================================================
// POST /api/reports
// Create a new report
// CITIZEN or ADMIN
// ======================================================

/**
 * @swagger
 * /api/reports:
 *   post:
 *     summary: Create a civic issue report
 *     description: Creates a report and associates it with an existing nearby CivicIssue or creates a new CivicIssue.
 *     tags:
 *       - Reports
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - category
 *               - latitude
 *               - longitude
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Broken street light near bus stand"
 *               description:
 *                 type: string
 *                 example: "Street light is not working near the bus stand."
 *               category:
 *                 type: string
 *                 enum:
 *                   - ROAD
 *                   - SANITATION
 *                   - WATER
 *                 example: ROAD
 *               latitude:
 *                 type: number
 *                 example: 16.85
 *               longitude:
 *                 type: number
 *                 example: 77.72
 *               image:
 *                 type: string
 *                 example: "uploads/reports/streetlight.jpg"
 *     responses:
 *       201:
 *         description: Report created successfully
 *       400:
 *         description: Validation failed or invalid category
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Access denied
 */

router.post(
    "/reports",
    validate(createReportSchema),
    authenticateToken,
    requireRole("CITIZEN", "ADMIN"),
    async (req, res, next) => {

        try {

            const {
                title,
                description,
                category,
                latitude,
                longitude,
                image
            } = req.body;


            // ------------------------------------------
            // Decide department
            // ------------------------------------------

            let departmentId;

            if (category === "ROAD") {

                departmentId = 1;

            } else if (category === "SANITATION") {

                departmentId = 2;

            } else if (category === "WATER") {

                departmentId = 3;

            } else {

                return sendError(
                    res,
                    400,
                    "Invalid category"
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
            // user_id comes from JWT
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
                req.user.userId,
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


            return sendSuccess(
                res,
                201,
                "Report created successfully",
                reportResult.rows[0]
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// CIVIC ISSUES
// ======================================================


// ======================================================
// GET /api/issues
// Get all CivicIssues
// PUBLIC
// ======================================================

/**
 * @swagger
 * /api/issues:
 *   get:
 *     summary: Get all civic issues
 *     description: Returns a list of all CivicIssues.
 *     tags:
 *       - Issues
 *     responses:
 *       200:
 *         description: Issues fetched successfully
 */

router.get(
    "/issues",
    async (req, res, next) => {

        try {

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
                GROUP BY
                    civic_issues.id,
                    civic_issues.title,
                    civic_issues.category,
                    civic_issues.status,
                    civic_issues.priority_score,
                    departments.name;
            `;


            const result = await pool.query(query);


            return sendSuccess(
                res,
                200,
                "Issues fetched successfully",
                result.rows
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// GET /api/issues/:id
// Get complete CivicIssue details
// AUTHENTICATED USERS
// ======================================================

router.get(
    "/issues/:id",
    authenticateToken,
    validateId,
    async (req, res, next) => {

        try {

            const issueId = req.params.id;


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


            return sendSuccess(
                res,
                200,
                "Issue details fetched successfully",
                {
                    issue: issueResult.rows[0],
                    reports: reportsResult.rows,
                    history: historyResult.rows,
                    evidence: evidenceResult.rows
                }
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// PATCH /api/issues/:id/status
// Change CivicIssue status
// ADMIN ONLY
// ======================================================



router.patch(
    "/issues/:id/status",
    authenticateToken,
    requireRole("ADMIN"),
    validateId,
    async (req, res, next) => {

        try {

            const issueId = req.params.id;

            const {
                status
            } = req.body;


            const result = await updateIssueStatus(
                issueId,
                status,
                req.user.userId
            );


            return sendSuccess(
                res,
                200,
                "Issue status updated successfully",
                result
            );

        }

        catch (error) {

            next(error);

        }

    }
);

// ======================================================
// STATUS HISTORY
// ======================================================


// ======================================================
// GET /api/issues/:id/history
// Get status history
// AUTHENTICATED USERS
// ======================================================

router.get(
    "/issues/:id/history",
    authenticateToken,
    validateId,
    async (req, res, next) => {

        try {

            const issueId = req.params.id;


           const history = await getIssueHistory(issueId);


            return sendSuccess(
                res,
                200,
                "Status history fetched successfully",
                history
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// EVIDENCE
// ======================================================


// ======================================================
// POST /api/issues/:id/evidence
// Upload evidence
// ADMIN ONLY
// ======================================================

router.post(
    "/issues/:id/evidence",
    authenticateToken,
    requireRole("ADMIN"),
    validateId,
    async (req, res, next) => {

        try {

            const civicIssueId =
                req.params.id;

            const {
                image,
                description
            } = req.body;


            const evidence = await uploadEvidence(
                civicIssueId,
                req.user.userId,
                image,
                description
            );


            return sendSuccess(
                res,
                201,
                "Evidence uploaded successfully",
                evidence
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// GET /api/issues/:id/evidence
// Get evidence
// AUTHENTICATED USERS
// ======================================================

router.get(
    "/issues/:id/evidence",
    authenticateToken,
    validateId,
    async (req, res, next) => {

        try {

            const issueId = req.params.id;


            const evidence = await getIssueEvidence(issueId);


            return sendSuccess(
                res,
                200,
                "Evidence fetched successfully",
                evidence
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// MY REPORTS
// ======================================================


// ======================================================
// GET /api/my-reports
// Get reports created by logged-in citizen
// CITIZEN ONLY
// ======================================================

router.get(
    "/my-reports",
    authenticateToken,
    requireRole("CITIZEN"),
    async (req, res, next) => {

        try {

            const reports = await getMyReports(
                req.user.userId
            );


            return sendSuccess(
                res,
                200,
                "Your reports fetched successfully",
                reports
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// GET /api/my-reports/:id
// Get one report belonging to logged-in citizen
// CITIZEN ONLY
// ======================================================

router.get(
    "/my-reports/:id",
    authenticateToken,
    requireRole("CITIZEN"),
    validateId,
    async (req, res, next) => {

        try {

           const reportId = req.params.id;

const report = await getMyReportById(
    reportId,
    req.user.userId
);

return sendSuccess(
    res,
    200,
    "Report fetched successfully",
    report
);


            if (result.rows.length === 0) {

                throw new AppError(
                    "Report not found",
                    404
                );

            }


            return sendSuccess(
                res,
                200,
                "Report fetched successfully",
                result.rows[0]
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// EXPORT
// ======================================================

module.exports = router;