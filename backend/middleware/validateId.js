const { sendError } = require("../utils/response");

function validateId(req, res, next) {

    const id = Number(req.params.id);

    console.log("VALIDATE ID:", req.params.id);

    if (Number.isInteger(id) && id > 0) {
        return next();
    } else {
        return sendError(
            res,
            400,
            "Invalid ID"
        );
    }
}

module.exports = validateId;