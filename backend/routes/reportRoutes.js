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
    assignIssueSchema,
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
    getAllWards,
    getWardAnalytics,
    toggleIssueUpvote,
    getIssueUpvoteStatus
} = require("../services/issueService");

const {
    getWardIssues
} = require("../services/wardService");

const {
    getUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead
} = require("../services/notificationService");

const { haversineDistance } = require("../utils/gis");
const { detectHotspots } = require("../services/gisService");
const { runSlaEscalationScan, getEscalationStats, getEscalatedIssues } = require("../services/escalationService");
const { analyzeText, recordAiFeedback } = require("../services/aiService");

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

            const issuesWithDistance = result.rows.map((row) => ({
                ...row,
                distance_meters: haversineDistance(lat, lng, Number(row.latitude), Number(row.longitude))
            })).sort((a, b) => a.distance_meters - b.distance_meters);

            return sendSuccess(
                res,
                200,
                "Nearby issues fetched successfully",
                issuesWithDistance
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// GET /api/issues/map
// Geographic endpoint for interactive map & cluster view
// PUBLIC
// ======================================================

router.get(
    "/issues/map",
    async (req, res, next) => {

        try {

            const {
                category,
                status,
                min_lat,
                max_lat,
                min_lng,
                max_lng
            } = req.query;

            const issues = await getMapIssues({
                category,
                status,
                min_lat,
                max_lat,
                min_lng,
                max_lng
            });

            return sendSuccess(
                res,
                200,
                "Map issues fetched successfully",
                issues
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// GET /api/issues/hotspots
// Spatial Hotspot & Chronic Recurrence Detection API
// Returns clustered issue zones with municipal engineering recommendations
// PUBLIC / AUTHORITIES
// ======================================================

router.get(
    "/issues/hotspots",
    async (req, res, next) => {
        try {
            const { category, radius, minCount, days, status } = req.query;

            const result = await detectHotspots({
                category: category || null,
                radiusMeters: radius ? Number(radius) : 300,
                minIssues: minCount ? Number(minCount) : 2,
                days: days !== undefined ? Number(days) : 60,
                status: status || null
            });

            return sendSuccess(
                res,
                200,
                "Hotspot clusters fetched successfully",
                result
            );
        } catch (error) {
            next(error);
        }
    }
);


// ======================================================
// POST /api/ai/analyze
// Real-time AI classification & hazard detection
// PUBLIC / AUTHENTICATED
// ======================================================

router.post(
    "/ai/analyze",
    async (req, res, next) => {

        try {

            const { title, description } = req.body;
            const analysis = analyzeText(title, description);

            return sendSuccess(
                res,
                200,
                "AI analysis generated successfully",
                analysis
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// POST /api/issues/:id/ai-feedback
// Record human officer override / feedback on AI
// ADMIN ONLY
// ======================================================

router.post(
    "/issues/:id/ai-feedback",
    authenticateToken,
    requireRole("ADMIN"),
    validateId,
    async (req, res, next) => {

        try {

            const {
                assessment_id,
                is_accurate,
                corrected_category,
                corrected_severity,
                feedback_notes
            } = req.body;

            const feedback = await recordAiFeedback(
                assessment_id,
                req.user.userId,
                {
                    is_accurate,
                    corrected_category,
                    corrected_severity,
                    feedback_notes
                }
            );

            return sendSuccess(
                res,
                201,
                "AI feedback recorded successfully",
                feedback
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
            const department_id = req.query.department_id;
            const ward_id = req.query.ward_id;
            const assigned_to = req.query.assigned_to;
            const is_escalated = req.query.is_escalated;

            const sortBy = req.query.sortBy;
            const order = req.query.order;

            const issues = await getAllIssues(
                page,
                limit,
                search,
                category,
                status,
                sortBy,
                order,
                department_id,
                ward_id,
                assigned_to,
                is_escalated
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
                status,
                note
            } = req.body;


            const result = await updateIssueStatus(
                issueId,
                status,
                req.user.userId,
                note
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
// POST /api/issues/:id/assign
// Assign CivicIssue to an officer
// ADMIN ONLY
// ======================================================

router.post(
    "/issues/:id/assign",
    authenticateToken,
    requireRole("ADMIN"),
    validateId,
    validate(assignIssueSchema),
    async (req, res, next) => {

        try {

            const issueId = req.params.id;
            const { assigned_to, notes } = req.body;

            const result = await assignIssue(
                issueId,
                assigned_to,
                req.user.userId,
                notes
            );

            return sendSuccess(
                res,
                200,
                "Issue assigned successfully",
                result
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// GET /api/admin/stats
// Get aggregate statistics for authority dashboard
// ADMIN ONLY
// ======================================================

router.get(
    "/admin/stats",
    authenticateToken,
    requireRole("ADMIN"),
    async (req, res, next) => {

        try {

            const stats = await getAdminStats();

            return sendSuccess(
                res,
                200,
                "Admin statistics fetched successfully",
                stats
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// GET /api/admin/officers
// Get all officers available for assignment
// ADMIN ONLY
// ======================================================

router.get(
    "/admin/officers",
    authenticateToken,
    requireRole("ADMIN"),
    async (req, res, next) => {

        try {

            const officers = await getAllOfficers();

            return sendSuccess(
                res,
                200,
                "Officers fetched successfully",
                officers
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// GET /api/departments
// Get all departments
// PUBLIC
// ======================================================

router.get(
    "/departments",
    async (req, res, next) => {

        try {

            const depts = await getDepartments();

            return sendSuccess(
                res,
                200,
                "Departments fetched successfully",
                depts
            );

        }

        catch (error) {

            next(error);

        }

    }
);


// ======================================================
// GET /api/wards
// List all registered municipal wards and zones
// PUBLIC
// ======================================================

router.get(
    "/wards",
    async (req, res, next) => {
        try {
            const wards = await getAllWards();
            return sendSuccess(
                res,
                200,
                "Municipal wards fetched successfully",
                wards
            );
        } catch (error) {
            next(error);
        }
    }
);

// ======================================================
// GET /api/wards/:id/analytics
// Get performance and grievance health analytics for a ward
// PUBLIC / AUTHORITIES
// ======================================================

router.get(
    "/wards/:id/analytics",
    async (req, res, next) => {
        try {
            const ward = await getWardAnalytics(req.params.id);
            if (!ward) {
                return sendError(res, 404, "Municipal ward not found");
            }
            return sendSuccess(
                res,
                200,
                "Ward analytics fetched successfully",
                ward
            );
        } catch (error) {
            next(error);
        }
    }
);

// ======================================================
// GET /api/wards/:id/issues
// Public neighborhood feed of issues in a specific ward
// PUBLIC
// ======================================================

router.get(
    "/wards/:id/issues",
    validateId,
    async (req, res, next) => {
        try {
            const { page = 1, limit = 20, status } = req.query;
            const data = await getWardIssues(req.params.id, { page, limit, status });
            return sendSuccess(
                res,
                200,
                "Ward issues fetched successfully",
                data
            );
        } catch (error) {
            next(error);
        }
    }
);

// ======================================================
// POST /api/issues/:id/upvote
// Toggle citizen corroboration upvote (+1)
// AUTHENTICATED
// ======================================================

router.post(
    "/issues/:id/upvote",
    authenticateToken,
    validateId,
    async (req, res, next) => {
        try {
            const result = await toggleIssueUpvote(req.user.id, req.params.id);
            return sendSuccess(
                res,
                200,
                result.upvoted ? "Issue upvoted successfully" : "Upvote removed",
                result
            );
        } catch (error) {
            next(error);
        }
    }
);

// ======================================================
// GET /api/issues/:id/upvote-status
// Check upvote status for current user
// PUBLIC / AUTHENTICATED
// ======================================================

router.get(
    "/issues/:id/upvote-status",
    validateId,
    async (req, res, next) => {
        try {
            let userId = null;
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith("Bearer ")) {
                try {
                    const jwt = require("jsonwebtoken");
                    const config = require("../config/config");
                    const token = authHeader.split(" ")[1];
                    const decoded = jwt.verify(token, config.jwt.secret);
                    userId = decoded.id;
                } catch {}
            }
            const result = await getIssueUpvoteStatus(userId, req.params.id);
            return sendSuccess(
                res,
                200,
                "Upvote status retrieved",
                result
            );
        } catch (error) {
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
// CITIZEN RESOLUTION FEEDBACK & REOPEN ROUTES
// ======================================================

router.post(
    "/issues/:id/feedback",
    authenticateToken,
    validateId,
    async (req, res, next) => {
        try {
            const { rating, comment, is_satisfied } = req.body;
            if (!rating || rating < 1 || rating > 5) {
                return sendError(res, 400, "Rating between 1 and 5 is required");
            }
            const feedback = await submitResolutionFeedback({
                civicIssueId: req.params.id,
                userId: req.user.userId,
                rating: parseInt(rating, 10),
                comment,
                isSatisfied: is_satisfied
            });
            return sendSuccess(res, 201, "Feedback submitted successfully", feedback);
        } catch (err) {
            next(err);
        }
    }
);

router.get(
    "/issues/:id/feedback",
    authenticateToken,
    validateId,
    async (req, res, next) => {
        try {
            const list = await getResolutionFeedback(req.params.id);
            return sendSuccess(res, 200, "Feedback retrieved", list);
        } catch (err) {
            next(err);
        }
    }
);

router.post(
    "/issues/:id/reopen",
    authenticateToken,
    validateId,
    async (req, res, next) => {
        try {
            const { reason } = req.body;
            const result = await reopenIssueByCitizen({
                civicIssueId: req.params.id,
                userId: req.user.userId,
                reason
            });
            return sendSuccess(res, 200, "Issue reopened successfully", result);
        } catch (err) {
            next(err);
        }
    }
);

// ======================================================
// NOTIFICATIONS ROUTES
// ======================================================

router.get(
    "/notifications",
    authenticateToken,
    async (req, res, next) => {
        try {
            const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
            const offset = parseInt(req.query.offset, 10) || 0;
            const result = await getUserNotifications(req.user.userId, limit, offset);
            return sendSuccess(res, 200, "Notifications fetched", result);
        } catch (err) {
            next(err);
        }
    }
);

router.patch(
    "/notifications/:id/read",
    authenticateToken,
    async (req, res, next) => {
        try {
            const updated = await markNotificationAsRead(req.params.id, req.user.userId);
            return sendSuccess(res, 200, "Notification marked as read", updated);
        } catch (err) {
            next(err);
        }
    }
);

router.patch(
    "/notifications/read-all",
    authenticateToken,
    async (req, res, next) => {
        try {
            await markAllNotificationsAsRead(req.user.userId);
            return sendSuccess(res, 200, "All notifications marked as read");
        } catch (err) {
            next(err);
        }
    }
);

// ======================================================
// CATEGORIES & SLA CONFIGURATION
// ======================================================

router.get("/categories", async (req, res, next) => {
    try {
        const includeInactive = req.query.all === "true";
        const categories = await getCategories(includeInactive);
        return sendSuccess(res, 200, "Categories fetched successfully", categories);
    } catch (err) {
        next(err);
    }
});

router.post(
    "/admin/categories",
    authenticateToken,
    requireRole("ADMIN"),
    async (req, res, next) => {
        try {
            const { code, name, description, icon, department_id, sla_hours } = req.body;
            if (!code || !name || !department_id) {
                return sendError(res, 400, "code, name, and department_id are required");
            }
            const created = await createCategory({
                code,
                name,
                description,
                icon,
                departmentId: department_id,
                slaHours: sla_hours
            });
            return sendSuccess(res, 201, "Category created successfully", created);
        } catch (err) {
            next(err);
        }
    }
);

router.patch(
    "/admin/categories/:code",
    authenticateToken,
    requireRole("ADMIN"),
    async (req, res, next) => {
        try {
            const { name, description, icon, department_id, sla_hours, is_active } = req.body;
            const updated = await updateCategory(req.params.code, {
                name,
                description,
                icon,
                departmentId: department_id,
                slaHours: sla_hours,
                isActive: is_active
            });
            return sendSuccess(res, 200, "Category updated successfully", updated);
        } catch (err) {
            next(err);
        }
    }
);

// ======================================================
// MUNICIPAL ANALYTICS & SLA PERFORMANCE
// ======================================================

router.get(
    "/admin/analytics",
    authenticateToken,
    requireRole("ADMIN"),
    async (req, res, next) => {
        try {
            const analytics = await getMunicipalAnalytics();
            return sendSuccess(res, 200, "Municipal analytics fetched successfully", analytics);
        } catch (err) {
            next(err);
        }
    }
);

// ======================================================
// POST /api/admin/sla/scan
// Triggers an SLA escalation scan across all active complaints
// ADMIN ONLY
// ======================================================

router.post(
    "/admin/sla/scan",
    authenticateToken,
    requireRole("ADMIN"),
    async (req, res, next) => {
        try {
            const result = await runSlaEscalationScan();
            return sendSuccess(res, 200, "SLA escalation scan completed successfully", result);
        } catch (error) {
            next(error);
        }
    }
);

// ======================================================
// GET /api/admin/sla/escalations
// Retrieves aggregate stats and list of escalated issues
// ADMIN ONLY
// ======================================================

router.get(
    "/admin/sla/escalations",
    authenticateToken,
    requireRole("ADMIN"),
    async (req, res, next) => {
        try {
            const stats = await getEscalationStats();
            const issues = await getEscalatedIssues({
                limit: req.query.limit || 50,
                offset: req.query.offset || 0
            });
            return sendSuccess(res, 200, "Escalations fetched successfully", { stats, issues });
        } catch (error) {
            next(error);
        }
    }
);

// ======================================================
// PUBLIC TRANSPARENCY TRACKER
// ======================================================

router.get(
    "/public/issues/:id",
    validateId,
    async (req, res, next) => {
        try {
            const data = await getPublicIssueTracking(req.params.id);
            return sendSuccess(res, 200, "Public issue tracking fetched", data);
        } catch (err) {
            next(err);
        }
    }
);

// ======================================================
// MUNICIPAL GIS & CSV DATA EXPORT
// ======================================================

router.get(
    "/admin/export/geojson",
    authenticateToken,
    requireRole("ADMIN"),
    async (req, res, next) => {
        try {
            const geojson = await exportIssuesGeoJson(req.query);
            res.setHeader("Content-Type", "application/geo+json");
            res.setHeader("Content-Disposition", 'attachment; filename="seefixit_issues.geojson"');
            return res.status(200).json(geojson);
        } catch (err) {
            next(err);
        }
    }
);

router.get(
    "/admin/export/csv",
    authenticateToken,
    requireRole("ADMIN"),
    async (req, res, next) => {
        try {
            const csvData = await exportIssuesCsv(req.query);
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", 'attachment; filename="seefixit_issues_export.csv"');
            return res.status(200).send(csvData);
        } catch (err) {
            next(err);
        }
    }
);

// ======================================================
// EXPORT
// ======================================================

module.exports = router;