const jwt = require("jsonwebtoken");

const {
    sendError
} = require("../utils/response");


// ======================================================
// Authentication Middleware
// ======================================================

function authenticateToken(req, res, next) {

    try {

        // ------------------------------------------
        // Get Authorization header
        // ------------------------------------------

        const authHeader = req.headers.authorization;


        if (!authHeader) {

            return sendError(
                res,
                401,
                "Access token required"
            );

        }


        // ------------------------------------------
        // Expected format:
        //
        // Authorization: Bearer TOKEN
        // ------------------------------------------

        const parts = authHeader.split(" ");


        if (
            parts.length !== 2 ||
            parts[0] !== "Bearer"
        ) {

            return sendError(
                res,
                401,
                "Invalid authorization format"
            );

        }


        const token = parts[1];


        // ------------------------------------------
        // Verify JWT
        // ------------------------------------------

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );


        // ------------------------------------------
        // Store authenticated user
        // ------------------------------------------

        req.user = decoded;


        // Continue to route

        next();

    }

    catch (error) {

        console.error("JWT ERROR:", error);


        return sendError(
            res,
            403,
            "Invalid or expired token"
        );

    }

}


module.exports = authenticateToken;