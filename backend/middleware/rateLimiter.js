const rateLimit = require("express-rate-limit");
const config = require("../config/config");

const createClientIpKeyGenerator =
    require("./clientIpKeyGenerator");

const clientIpKeyGenerator =
    createClientIpKeyGenerator({
        isProduction: config.server.isProduction
    });

const apiLimiter = rateLimit({

    windowMs: 15 * 60 * 1000,

    max: 100,

    // Identify each client using a validated IP.
    keyGenerator: clientIpKeyGenerator,

    // Only API requests should consume the global API rate limit.
    skip: (req) => {
        const requestPath = req.path;

        // Ignore requests outside the API.
        if (
            requestPath !== "/api" &&
            !requestPath.startsWith("/api/")
        ) {
            return true;
        }

        // Health checks must not consume the API quota.
        return [
            "/api/health",
            "/api/health/ready",
            "/api/health/live"
        ].includes(requestPath);
    },

    message: {
        success: false,
        message: "Too many requests. Please try again later.",
        error: null
    }

});

module.exports = apiLimiter;