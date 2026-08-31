function sendSuccess(res, statusCode, message, data = null) {

    return res.status(statusCode).json({
        success: true,
        message: message,
        data: data
    });

}


function sendError(res, statusCode, message, error = null) {

    return res.status(statusCode).json({
        success: false,
        message: message,
        error: error
    });

}


module.exports = {
    sendSuccess,
    sendError
};