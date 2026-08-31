const {
    sendError
} = require("../utils/response");


// ======================================================
// Role Authorization Middleware
// ======================================================

function requireRole(...allowedRoles) {

    return (req, res, next) => {

        // ------------------------------------------
        // Check whether authenticated user exists
        // ------------------------------------------

        if (!req.user) {

            return sendError(
                res,
                401,
                "Authentication required"
            );

        }


        // ------------------------------------------
        // Check user's role
        // ------------------------------------------

        if (!allowedRoles.includes(req.user.role)) {

            return sendError(
                res,
                403,
                "Access denied"
            );

        }


        // ------------------------------------------
        // User has required role
        // ------------------------------------------

        next();

    };

}


module.exports = requireRole;