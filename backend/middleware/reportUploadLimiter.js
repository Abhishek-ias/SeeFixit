const rateLimit = require("express-rate-limit");

const reportUploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,

    limit: 10,

    keyGenerator: (req) => {
        const userId = req.user?.userId;

        if (
            userId === undefined ||
            userId === null ||
            String(userId).trim() === ""
        ) {
            throw new Error(
                "Authenticated user ID required for upload rate limiting"
            );
        }

        return `report-upload:user:${String(userId)}`;
    },

    standardHeaders: "draft-8",

    legacyHeaders: false,

    message: {
        success: false,
        message: "Too many image uploads. Please try again later.",
        error: null
    }
});

module.exports = reportUploadLimiter;
