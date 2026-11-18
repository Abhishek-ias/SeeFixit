const express = require("express");

const router = express.Router();

const pool = require("../db/database");

const authenticateToken = require("../middleware/authMiddleware");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const validateId = require("../middleware/validateId");
const uploadReportImage = require("../middleware/reportImageUpload");
const reportUploadLimiter = require("../middleware/reportUploadLimiter");

const {
    updateIssueStatusSchema,
    uploadEvidenceSchema,
     issueFilterSchema
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

const { processReportImage } = require("../services/reportImageProcessor");
const { uploadToCloudinary } = require("../utils/cloudinaryUpload");
const { isConfigured: cloudinaryConfigured } = require("../config/cloudinary");

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
 *                   - LIGHTING
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
    authenticateToken,
    requireRole("CITIZEN", "ADMIN"),
    reportUploadLimiter,
    uploadReportImage,
    async (req, res, next) => {

        try {

            // Parse text fields from multipart form
            const title       = req.body.title;
            const description = req.body.description;
            const category    = req.body.category;
            const latitude    = Number(req.body.latitude);
            const longitude   = Number(req.body.longitude);

            // Manual validation (Joi validate middleware can't run before multer on multipart)
            const { error } = createReportSchema.validate({
                title,
                description,
                category,
                latitude,
                longitude
            });

            if (error) {
                return next(
                    new AppError(error.details[0].message, 400)
                );
            }

            // Process and upload image if provided
            let attachment = null;

            if (req.file) {
                const processed = await processReportImage(req.file);

                const uploaded = await uploadToCloudinary(processed.buffer);

                attachment = {
                    originalFilename:    processed.originalFilename,
                    originalMimeType:    processed.originalMimeType,
                    mimeType:            processed.mimeType,
                    originalFileSizeBytes: processed.originalFileSizeBytes,
                    fileSizeBytes:       processed.fileSizeBytes,
                    width:               uploaded.width,
                    height:              uploaded.height,
                    sha256:              processed.sha256,
                    secureUrl:           uploaded.secureUrl,
                    publicId:            uploaded.publicId
                };
            }

            const report = await createReport(
                req.user.userId,
                title,
                description,
                category,
                latitude,
                longitude,
                null,       // legacy image field — unused
                attachment
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
// GET /api/issues/nearby
// Find nearby open civic issues for duplicate warning
// PUBLIC
// lat, lng, category required; radius optional (metres, default 200)
// ======================================================

router.get(
    "/issues/nearby",
    async (req, res, next) => {

        try {

            const lat      = Number(req.query.lat);
            const lng      = Number(req.query.lng);
            const category = req.query.category;
            const radius   = Math.min(Number(req.query.radius) || 200, 1000); // max 1 km

            if (
                !Number.isFinite(lat) || lat < -90 || lat > 90 ||
                !Number.isFinite(lng) || lng < -180 || lng > 180
            ) {
                return next(new AppError("Valid lat and lng are required", 400));
            }

            const validCategories = ["ROAD", "SANITATION", "WATER", "LIGHTING"];

            if (category && !validCategories.includes(category)) {
                return next(new AppError("Invalid category", 400));
            }

            // Approximate degree-based radius (~111 km per degree latitude)
            const degreeRadius = radius / 111000;

            const conditions = [
                `latitude  BETWEEN $1 AND $2`,
                `longitude BETWEEN $3 AND $4`,
                `status != 'RESOLVED'`
            ];
            const values = [
                lat - degreeRadius,
                lat + degreeRadius,
                lng - degreeRadius,
                lng + degreeRadius
            ];

            if (category) {
                values.push(category);
                conditions.push(`category = $${values.length}`);
            }

            const query = `
                SELECT
                    id         AS issue_id,
                    title      AS issue_title,
                    category,
                    status,
                    latitude,
                    longitude,
                    report_count,
                    priority_score
                FROM civic_issues
                WHERE ${conditions.join(" AND ")}
                ORDER BY
                    (latitude - $1)*(latitude - $1) + (longitude - $3)*(longitude - $3) ASC
                LIMIT 5;
            `;

            const result = await pool.query(query, values);

            return sendSuccess(
                res,
                200,
                "Nearby issues fetched successfully",
                result.rows
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// GET /api/issues
// Get all CivicIssues
// PUBLIC
// ======================================================

/**
 * @swagger
 * /api/issues:
 *   get:
 *     summary: Get civic issues
 *     description: Returns civic issues with optional search, filtering, sorting, and pagination.
 *     tags:
 *       - Issues
 *
 *     parameters:
 *       - in: query
 *         name: search
 *         required: false
 *         description: Search issues by title.
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         example: street
 *
 *       - in: query
 *         name: category
 *         required: false
 *         description: Filter issues by category.
 *         schema:
 *           type: string
 *           enum:
 *             - ROAD
 *             - SANITATION
 *             - WATER
 *             - LIGHTING
 *         example: ROAD
 *
 *       - in: query
 *         name: status
 *         required: false
 *         description: Filter issues by status.
 *         schema:
 *           type: string
 *           enum:
 *             - OPEN
 *             - IN_PROGRESS
 *             - RESOLVED
 *         example: IN_PROGRESS
 *
 *       - in: query
 *         name: page
 *         required: false
 *         description: Page number.
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         example: 1
 *
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Number of issues per page. Maximum 50.
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         example: 10
 *
 *       - in: query
 *         name: sortBy
 *         required: false
 *         description: Field used to sort the issues.
 *         schema:
 *           type: string
 *           enum:
 *             - id
 *             - priority_score
 *             - report_count
 *         example: report_count
 *
 *       - in: query
 *         name: order
 *         required: false
 *         description: Sort direction.
 *         schema:
 *           type: string
 *           enum:
 *             - asc
 *             - desc
 *         example: desc
 *
 *     responses:
 *       200:
 *         description: Issues fetched successfully
 *       400:
 *         description: Invalid query parameters
 */

router.get(
    "/issues",
    validate(issueFilterSchema, "query"),
    async (req, res, next) => {

        try {

           const page = req.query.page;
const limit = req.query.limit;
const search = req.query.search;

const category = req.query.category;
const status = req.query.status;

const sortBy = req.query.sortBy;
const order = req.query.order;



const issues = await getAllIssues(
    page,
    limit,
    search,
    category,
    status,
    sortBy,
    order
);

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