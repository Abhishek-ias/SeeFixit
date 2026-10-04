const express = require("express");

const router = express.Router();

const pool = require("../db/database");

const authenticateToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const validateId = require("../middleware/validateId");

const {
    updateIssueStatusSchema,
    uploadEvidenceSchema
} = require("../validation/issueValidation");

const {
    updateIssueStatus,
    getIssueHistory,
    uploadEvidence,
    getIssueEvidence,
    getMyReports,
    getMyReportById,
    createReport,
    getIssueDetails,
    getAllIssues
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


            const report = await createReport(
                req.user.userId,
                title,
                description,
                category,
                latitude,
                longitude,
                image
            );


            return sendSuccess(
                res,
                201,
                "Report created successfully",
                report
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

            const issues = await getAllIssues();


            return sendSuccess(
                res,
                200,
                "Issues fetched successfully",
                issues
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


            const issueDetails = await getIssueDetails(
                issueId
            );


            return sendSuccess(
                res,
                200,
                "Issue details fetched successfully",
                issueDetails
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
    validate(updateIssueStatusSchema),
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
    validate(uploadEvidenceSchema),
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