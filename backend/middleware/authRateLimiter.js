
const rateLimit = require("express-rate-limit");
const config = require("../config/config");

const createClientIpKeyGenerator =
    require("./clientIpKeyGenerator");

const clientIpKeyGenerator =
    createClientIpKeyGenerator({
        isProduction: config.server.isProduction
    });

const authLimiter = rateLimit({

    windowMs: 15 * 60 * 1000,

    max: 10,

    // Use the same trusted client IP strategy.
    keyGenerator: clientIpKeyGenerator,

    message: {
        success: false,
        message: "Too many authentication attempts. Please try again later.",
        error: null
    }

});

module.exports = authLimiter;
