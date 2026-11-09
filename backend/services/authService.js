
const bcrypt = require("bcrypt");

const pool = require("../db/database");
const AppError = require("../utils/AppError");

const { OAuth2Client } = require("google-auth-library");

const config = require("../config/config");

const { createSession } = require("./sessionService");

const googleClient = config.auth.googleClientId
    ? new OAuth2Client(config.auth.googleClientId)
    : null;


// ======================================================
// REGISTER USER
// ======================================================

async function registerUser(name, email, password) {

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

    const passwordHash = await bcrypt.hash(
        password,
        10
    );

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

    try {

        const result = await pool.query(
            insertQuery,
            values
        );

        return result.rows[0];

    } catch (error) {

        if (
            error.code === "23505" &&
            error.constraint === "users_email_unique"
        ) {
            throw new AppError(
                "Email already registered",
                409
            );
        }

        throw error;
    }
}


// ======================================================
// LOGIN USER
// ======================================================

async function loginUser(email, password) {

    const query = `
        SELECT *
        FROM users
        WHERE email = $1;
    `;

    const result = await pool.query(
        query,
        [email]
    );

    if (result.rows.length === 0) {
        throw new AppError(
            "Invalid email or password",
            401
        );
    }

    const user = result.rows[0];

    // Google-only accounts cannot use password login.
    if (!user.password_hash) {
        throw new AppError(
            "Invalid email or password",
            401
        );
    }

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

    // Create access and refresh tokens.
    // The route will send the refresh token
    // through an HttpOnly cookie.
    return createSession(user);
}


// ======================================================
// GOOGLE LOGIN
// ======================================================

async function loginWithGoogle(idToken, client = googleClient) {

    if (!client) {
        throw new AppError(
            "Google authentication is not configured",
            503
        );
    }

    // --------------------------------------------------
    // Verify Google ID token
    // --------------------------------------------------

    let payload;

    try {

        const ticket = await client.verifyIdToken({
            idToken,
            audience: config.auth.googleClientId
        });

        payload = ticket.getPayload();

    } catch (error) {

        throw new AppError(
            "Invalid Google token",
            401
        );
    }

    // --------------------------------------------------
    // Validate Google account information
    // --------------------------------------------------

    if (
        !payload ||
        !payload.sub ||
        !payload.email ||
        payload.email_verified !== true ||
        !payload.name
    ) {
        throw new AppError(
            "Google account information is invalid or email is not verified",
            401
        );
    }

    const googleSub = payload.sub;
    const email = payload.email.trim().toLowerCase();
    const name = payload.name.trim();

    // --------------------------------------------------
    // Find existing Google account
    // --------------------------------------------------

    const googleUserQuery = `
        SELECT id, name, email, role
        FROM users
        WHERE google_sub = $1;
    `;

    const googleUserResult = await pool.query(
        googleUserQuery,
        [googleSub]
    );

    let user;

    if (googleUserResult.rows.length > 0) {

        user = googleUserResult.rows[0];

    } else {

        // --------------------------------------------------
        // Prevent automatic account linking
        // --------------------------------------------------

        const emailUserQuery = `
            SELECT id
            FROM users
            WHERE email = $1;
        `;

        const emailUserResult = await pool.query(
            emailUserQuery,
            [email]
        );

        if (emailUserResult.rows.length > 0) {
            throw new AppError(
                "An account with this email already exists. Please sign in using your existing method.",
                409
            );
        }

        // --------------------------------------------------
        // Create new Google-only account
        // --------------------------------------------------

        const insertQuery = `
            INSERT INTO users (
                name,
                email,
                password_hash,
                google_sub,
                role
            )
            VALUES ($1, $2, NULL, $3, 'CITIZEN')
            RETURNING id, name, email, role;
        `;

        try {

            const result = await pool.query(
                insertQuery,
                [name, email, googleSub]
            );

            user = result.rows[0];

        } catch (error) {

            // Handle concurrent Google login attempts.
            if (error.code === "23505") {

                const existingGoogleUser = await pool.query(
                    `SELECT id, name, email, role
                     FROM users
                     WHERE google_sub = $1;`,
                    [googleSub]
                );

                if (existingGoogleUser.rows.length > 0) {

                    user = existingGoogleUser.rows[0];

                } else if (
                    error.constraint === "users_email_unique"
                ) {

                    throw new AppError(
                        "An account with this email already exists. Please sign in using your existing method.",
                        409
                    );

                } else {

                    throw error;
                }

            } else {

                throw error;
            }
        }
    }

    // --------------------------------------------------
    // Create session for Google user
    // --------------------------------------------------

    return createSession(user);
}


// ======================================================
// EXPORT
// ======================================================

module.exports = {
    registerUser,
    loginUser,
    loginWithGoogle
};
