const {
    sendError
} = require("../utils/response");

const logger = require("../utils/logger");

function errorHandler(err, req, res, next) {

    const statusCode = err.statusCode || err.status || 500;

    logger.error("Application error", {
        requestId: req.requestId,
        statusCode,
        message: err.message,
        stack: err.stack
    });

    let message;

    if (statusCode === 500) {
        message = "Internal server error";
    } else if (statusCode === 413) {
        message = "Request body too large";
    } else {
        message = err.message || "Something went wrong";
    }

    return sendError(
        res,
        statusCode,
        message
    );
}

module.exports = errorHandler;