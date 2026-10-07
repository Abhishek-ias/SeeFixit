const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({

    windowMs: 15 * 60 * 1000,

    max: 10,

    message: {
        success: false,
        message: "Too many authentication attempts. Please try again later.",
        error: null
    }

});

module.exports = authLimiter;