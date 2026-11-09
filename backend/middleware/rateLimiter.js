
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

    // Health checks must not consume the API rate-limit quota.
    skip: (req) => [
        "/api/health",
        "/api/health/ready",
        "/api/health/live"
    ].includes(req.path),

    message: {
        success: false,
        message: "Too many requests. Please try again later.",
        error: null
    }

});

module.exports = apiLimiter;
