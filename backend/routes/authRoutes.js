const express = require("express");

const router = express.Router();

const authLimiter = require("../middleware/authRateLimiter");

router.use(authLimiter);

const validate = require("../middleware/validate");



const {
    registerSchema,
    loginSchema
} = require("../validation/authValidation");

const {
    sendSuccess
} = require("../utils/response");

const {
    registerUser,
    loginUser
} = require("../services/authService");


// ======================================================
// POST /api/auth/register
// Register a new user
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

        }

        catch (error) {

            next(error);

        }

    }
);



// ======================================================
// POST /api/auth/login
// Login user
// ======================================================

router.post(
    "/login",
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


            return sendSuccess(
                res,
                200,
                "Login successful",
                result
            );

        }

        catch (error) {

            next(error);

        }

    }
);



// ======================================================
// EXPORT
// ======================================================

module.exports = router;