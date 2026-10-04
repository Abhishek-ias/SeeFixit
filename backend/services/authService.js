const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const pool = require("../db/database");

const AppError = require("../utils/AppError");


// ======================================================
// REGISTER USER
// ======================================================

async function registerUser(name, email, password) {

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

        throw new AppError(
            "Email already registered",
            409
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


    return result.rows[0];
}


// ======================================================
// LOGIN USER
// ======================================================

async function loginUser(email, password) {

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

        throw new AppError(
            "Invalid email or password",
            401
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

        throw new AppError(
            "Invalid email or password",
            401
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


    return {
        token: token,

        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
        }
    };
}


// ======================================================
// EXPORT
// ======================================================

module.exports = {
    registerUser,
    loginUser
};