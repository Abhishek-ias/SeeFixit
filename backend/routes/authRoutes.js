
const express = require("express");

const router = express.Router();

const authLimiter = require("../middleware/authRateLimiter");

const validate = require("../middleware/validate");

const {
    registerSchema,
    loginSchema,
    googleLoginSchema
} = require("../validation/authValidation");

const {
    sendSuccess
} = require("../utils/response");

const AppError = require("../utils/AppError");
const config = require("../config/config");

const {
    registerUser,
    loginUser,
    loginWithGoogle
} = require("../services/authService");

const {
    rotateRefreshToken,
    revokeRefreshToken
} = require("../services/sessionService");


// ======================================================
// SESSION COOKIE CONFIGURATION
// ======================================================

const REFRESH_COOKIE_NAME = "seefixit_refresh";

const refreshCookieBaseOptions = {
    httpOnly: true,

    secure: config.server.isProduction,

    // Separate Render frontend and backend origins
    // require cross-site cookie support in production.
    sameSite: config.server.isProduction
        ? "none"
        : "lax",

    // Refresh cookie is only sent to authentication routes.
    path: "/api/auth"
};


// ======================================================
// COOKIE HELPERS
// ======================================================

function setRefreshTokenCookie(
    res,
    refreshToken,
    expiresAt
) {

    const maxAge = Math.max(
        0,
        new Date(expiresAt).getTime() - Date.now()
    );

    res.cookie(
        REFRESH_COOKIE_NAME,
        refreshToken,
        {
            ...refreshCookieBaseOptions,
            maxAge
        }
    );
}


function clearRefreshTokenCookie(res) {

    res.clearCookie(
        REFRESH_COOKIE_NAME,
        refreshCookieBaseOptions
    );
}


// ======================================================
// ORIGIN PROTECTION
// ======================================================

function verifyRequestOrigin(req, res, next) {

    const origin = req.get("Origin");

    // Non-browser clients may not provide an Origin.
    // Browser requests from an unexpected origin are rejected.
    if (
        origin &&
        origin !== config.server.frontendOrigin
    ) {
        return next(
            new AppError(
                "Request origin is not allowed",
                403
            )
        );
    }

    return next();
}


// ======================================================
// AUTHENTICATED RESPONSE HELPER
// ======================================================

function sendAuthenticatedResponse(
    res,
    statusCode,
    message,
    result
) {

    const {
        refreshToken,
        refreshTokenExpiresAt,
        ...publicData
    } = result;

    setRefreshTokenCookie(
        res,
        refreshToken,
        refreshTokenExpiresAt
    );

    // The raw refresh token is deliberately excluded
    // from the JSON response.
    return sendSuccess(
        res,
        statusCode,
        message,
        publicData
    );
}


// ======================================================
// RATE LIMITER
// ======================================================

router.use(authLimiter);


// ======================================================
// POST /api/auth/register
// ======================================================

router.post(
    "/register",
    validate(registerSchema),
    async (req, res, next) => {

        try {

            const {
                name,
                email,
                password
            } = req.body;

            const user = await registerUser(
                name,
                email,
                password
            );

            return sendSuccess(
                res,
                201,
                "User registered successfully",
                user
            );

        } catch (error) {

            next(error);
        }
    }
);


// ======================================================
// POST /api/auth/login
// ======================================================

router.post(
    "/login",
    verifyRequestOrigin,
    validate(loginSchema),
    async (req, res, next) => {

        try {

            const {
                email,
                password
            } = req.body;

            const result = await loginUser(
                email,
                password
            );

            return sendAuthenticatedResponse(
                res,
                200,
                "Login successful",
                result
            );

        } catch (error) {

            next(error);
        }
    }
);


// ======================================================
// POST /api/auth/google
// ======================================================

router.post(
    "/google",
    verifyRequestOrigin,
    validate(googleLoginSchema),
    async (req, res, next) => {

        try {

            const { idToken } = req.body;

            const result = await loginWithGoogle(idToken);

            return sendAuthenticatedResponse(
                res,
                200,
                "Google login successful",
                result
            );

        } catch (error) {

            next(error);
        }
    }
);


// ======================================================
// POST /api/auth/refresh
// Rotate refresh token and issue new access token.
// ======================================================

router.post(
    "/refresh",
    verifyRequestOrigin,
    async (req, res, next) => {

        const refreshToken =
            req.cookies?.[REFRESH_COOKIE_NAME];

        try {

            const result = await rotateRefreshToken(
                refreshToken
            );

            return sendAuthenticatedResponse(
                res,
                200,
                "Session refreshed successfully",
                result
            );

        } catch (error) {

            if (error.statusCode === 401) {
                clearRefreshTokenCookie(res);
            }

            next(error);
        }
    }
);


// ======================================================
// POST /api/auth/logout
// Revoke refresh-token session family.
// ======================================================

router.post(
    "/logout",
    verifyRequestOrigin,
    async (req, res, next) => {

        try {

            const refreshToken =
                req.cookies?.[REFRESH_COOKIE_NAME];

            await revokeRefreshToken(refreshToken);

            clearRefreshTokenCookie(res);

            return sendSuccess(
                res,
                200,
                "Logout successful",
                null
            );

        } catch (error) {

            next(error);
        }
    }
);


// ======================================================
// EXPORT
// ======================================================

module.exports = router;
