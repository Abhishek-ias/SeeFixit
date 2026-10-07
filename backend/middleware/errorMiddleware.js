const {
    sendError
} = require("../utils/response");

const logger = require("../utils/logger");


function errorHandler(err, req, res, next) {

    console.error("ERROR:", err);


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