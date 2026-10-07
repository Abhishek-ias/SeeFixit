const logger = require("../utils/logger");

function requestLogger(req, res, next) {
    const startTime = Date.now();

    res.on("finish", () => {
        const responseTimeMs = Date.now() - startTime;

        logger.info("HTTP request completed", {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            responseTimeMs
        });
    });

    next();
}

module.exports = requestLogger;