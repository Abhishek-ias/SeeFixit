const {
    sendError
} = require("../utils/response");

const logger = require("../utils/logger");

function errorHandler(err, req, res, next) {

    logger.error("Application error", {
        requestId: req.requestId,
        statusCode: err.statusCode || 500,
        message: err.message,
        stack: err.stack
    });

    const statusCode = err.statusCode || 500;

    const message =
        statusCode === 500
            ? "Internal server error"
            : err.message || "Something went wrong";

    return sendError(
        res,
        statusCode,
        message
    );
}

module.exports = errorHandler;