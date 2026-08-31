const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const router = express.Router();

const pool = require("../db/database");

const validate = require("../middleware/validate");

const {
    registerSchema,
    loginSchema
} = require("../validation/authValidation");

const {
    sendSuccess,
    sendError
} = require("../utils/response");


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


            // ------------------------------------------
            // Check whether email already exists
            // ------------------------------------------

            const existingUserQuery = `
                SELECT id
                FROM users
                WHERE email = $1;
            `;


            const existingUser = await pool.query(
                existingUserQuery,
                [email]
            );


            if (existingUser.rows.length > 0) {

                return sendError(
                    res,
                    409,
                    "Email already registered"
                );

            }


            // ------------------------------------------
            // Hash password
            // ------------------------------------------

            const passwordHash = await bcrypt.hash(
                password,
                10
            );


            // ------------------------------------------
            // Create user
            // ------------------------------------------

            const insertQuery = `
                INSERT INTO users (
                    name,
                    email,
                    password_hash,
                    role
                )
                VALUES ($1, $2, $3, 'CITIZEN')
                RETURNING id, name, email, role;
            `;


            const values = [
                name,
                email,
                passwordHash
            ];


            const result = await pool.query(
                insertQuery,
                values
            );


            // ------------------------------------------
            // Success response
            // ------------------------------------------

            return sendSuccess(
                res,
                201,
                "User registered successfully",
                result.rows[0]
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


            // ------------------------------------------
            // Find user
            // ------------------------------------------

            const query = `
                SELECT *
                FROM users
                WHERE email = $1;
            `;


            const result = await pool.query(
                query,
                [email]
            );


            // ------------------------------------------
            // User not found
            // ------------------------------------------

            if (result.rows.length === 0) {

                return sendError(
                    res,
                    401,
                    "Invalid email or password"
                );

            }


            const user = result.rows[0];


            // ------------------------------------------
            // Compare password
            // ------------------------------------------

            const passwordMatch = await bcrypt.compare(
                password,
                user.password_hash
            );


            if (!passwordMatch) {

                return sendError(
                    res,
                    401,
                    "Invalid email or password"
                );

            }


            // ------------------------------------------
            // Create JWT
            // ------------------------------------------

            const token = jwt.sign(
                {
                    userId: user.id,
                    role: user.role
                },
                process.env.JWT_SECRET,
                {
                    expiresIn: "1h"
                }
            );


            // ------------------------------------------
            // Success response
            // ------------------------------------------

            return sendSuccess(
                res,
                200,
                "Login successful",
                {
                    token: token,

                    user: {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        role: user.role
                    }
                }
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