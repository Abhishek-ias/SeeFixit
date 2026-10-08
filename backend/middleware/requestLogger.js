const { randomUUID } = require("crypto");
const logger = require("../utils/logger");

function requestLogger(req, res, next) {
    const requestId = randomUUID();

    req.requestId = requestId;

    res.setHeader("X-Request-Id", requestId);

    const startTime = Date.now();

    res.on("finish", () => {
        const responseTimeMs = Date.now() - startTime;

        logger.info("HTTP request completed", {
            requestId,
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            responseTimeMs
        });
    });

    next();
}

module.exports = requestLogger;