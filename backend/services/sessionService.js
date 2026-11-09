
const {
    createHash,
    randomBytes,
    randomUUID
} = require("node:crypto");

const jwt = require("jsonwebtoken");

const pool = require("../db/database");
const config = require("../config/config");
const AppError = require("../utils/AppError");

// ======================================================
// SESSION CONFIGURATION
// ======================================================

// Access token lifetime.
const ACCESS_TOKEN_TTL = "15m";

// Refresh token lifetime: 30 days.
const REFRESH_TOKEN_TTL_MS =
    30 * 24 * 60 * 60 * 1000;


// ======================================================
// TOKEN HELPERS
// ======================================================

function generateRefreshToken() {
    return randomBytes(64).toString("base64url");
}


function hashRefreshToken(token) {
    return createHash("sha256")
        .update(token)
        .digest("hex");
}


function isValidRefreshToken(token) {
    return (
        typeof token === "string" &&
        /^[A-Za-z0-9_-]{80,128}$/.test(token)
    );
}


// ======================================================
// USER HELPER
// ======================================================

function getPublicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
    };
}


// ======================================================
// GENERATE ACCESS TOKEN
// ======================================================

function generateAccessToken(user) {

    return jwt.sign(
        {
            userId: user.id,
            role: user.role
        },
        config.auth.jwtSecret,
        {
            expiresIn: ACCESS_TOKEN_TTL
        }
    );

}


// ======================================================
// CREATE SESSION
// ======================================================

async function createSession(user) {

    const sessionId = randomUUID();

    const familyId = randomUUID();

    const refreshToken = generateRefreshToken();

    const tokenHash = hashRefreshToken(refreshToken);

    const expiresAt = new Date(
        Date.now() + REFRESH_TOKEN_TTL_MS
    );

    const query = `
        INSERT INTO auth_refresh_tokens (
            id,
            family_id,
            user_id,
            token_hash,
            expires_at
        )
        VALUES ($1, $2, $3, $4, $5);
    `;

    await pool.query(
        query,
        [
            sessionId,
            familyId,
            user.id,
            tokenHash,
            expiresAt
        ]
    );

    return {
        token: generateAccessToken(user),
        refreshToken,
        refreshTokenExpiresAt: expiresAt,
        user: getPublicUser(user)
    };

}


// ======================================================
// REVOKE SESSION FAMILY
// ======================================================

async function revokeSessionFamily(client, familyId) {

    await client.query(
        `
            UPDATE auth_refresh_tokens
            SET revoked_at = COALESCE(revoked_at, NOW())
            WHERE family_id = $1;
        `,
        [familyId]
    );

}


// ======================================================
// ROTATE REFRESH TOKEN
// ======================================================

async function rotateRefreshToken(refreshToken) {

    if (!isValidRefreshToken(refreshToken)) {

        throw new AppError(
            "Invalid or expired refresh token",
            401
        );

    }

    const tokenHash = hashRefreshToken(refreshToken);

    const client = await pool.connect();

    let transactionOpen = false;

    try {

        await client.query("BEGIN");

        transactionOpen = true;

        // Lock the presented token.
        // Concurrent requests using the same token
        // will wait for this transaction.

        const tokenResult = await client.query(
            `
                SELECT
                    id,
                    family_id,
                    user_id,
                    expires_at,
                    consumed_at,
                    revoked_at
                FROM auth_refresh_tokens
                WHERE token_hash = $1
                FOR UPDATE;
            `,
            [tokenHash]
        );

        if (tokenResult.rows.length === 0) {

            throw new AppError(
                "Invalid or expired refresh token",
                401
            );

        }

        const storedToken = tokenResult.rows[0];

        // Detect token reuse, revocation or expiration.
        // Revoke the entire family to invalidate
        // all tokens belonging to that login session.

        const tokenIsExpired =
            new Date(storedToken.expires_at).getTime()
            <= Date.now();

        if (
            storedToken.consumed_at ||
            storedToken.revoked_at ||
            tokenIsExpired
        ) {

            await revokeSessionFamily(
                client,
                storedToken.family_id
            );

            await client.query("COMMIT");

            transactionOpen = false;

            throw new AppError(
                "Invalid or expired refresh token",
                401
            );

        }

        // Retrieve the associated user.
        const userResult = await client.query(
            `
                SELECT id, name, email, role
                FROM users
                WHERE id = $1;
            `,
            [storedToken.user_id]
        );

        if (userResult.rows.length === 0) {

            await revokeSessionFamily(
                client,
                storedToken.family_id
            );

            await client.query("COMMIT");

            transactionOpen = false;

            throw new AppError(
                "Invalid or expired refresh token",
                401
            );

        }

        const user = userResult.rows[0];

        // Generate the next refresh token.
        const newRefreshToken = generateRefreshToken();

        const newTokenHash = hashRefreshToken(
            newRefreshToken
        );

        // Mark the existing token as consumed.
        const consumedResult = await client.query(
            `
                UPDATE auth_refresh_tokens
                SET consumed_at = NOW()
                WHERE id = $1
                  AND consumed_at IS NULL
                  AND revoked_at IS NULL
                RETURNING id;
            `,
            [storedToken.id]
        );

        if (consumedResult.rowCount !== 1) {

            await revokeSessionFamily(
                client,
                storedToken.family_id
            );

            await client.query("COMMIT");

            transactionOpen = false;

            throw new AppError(
                "Invalid or expired refresh token",
                401
            );

        }

        // Create the replacement token.
        // Preserve the original session expiry.
        await client.query(
            `
                INSERT INTO auth_refresh_tokens (
                    id,
                    family_id,
                    user_id,
                    token_hash,
                    expires_at
                )
                VALUES ($1, $2, $3, $4, $5);
            `,
            [
                randomUUID(),
                storedToken.family_id,
                storedToken.user_id,
                newTokenHash,
                storedToken.expires_at
            ]
        );

        await client.query("COMMIT");

        transactionOpen = false;

        return {
            token: generateAccessToken(user),
            refreshToken: newRefreshToken,
            refreshTokenExpiresAt: storedToken.expires_at,
            user: getPublicUser(user)
        };

    } catch (error) {

        if (transactionOpen) {

            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                // Preserve the original error.
            }

        }

        throw error;

    } finally {

        client.release();

    }

}


// ======================================================
// REVOKE REFRESH TOKEN
// ======================================================

async function revokeRefreshToken(refreshToken) {

    // Logout should be safe to call even if
    // the cookie is missing or malformed.

    if (!isValidRefreshToken(refreshToken)) {
        return false;
    }

    const tokenHash = hashRefreshToken(refreshToken);

    const client = await pool.connect();

    let transactionOpen = false;

    try {

        await client.query("BEGIN");

        transactionOpen = true;

        const result = await client.query(
            `
                SELECT id, family_id
                FROM auth_refresh_tokens
                WHERE token_hash = $1
                FOR UPDATE;
            `,
            [tokenHash]
        );

        if (result.rows.length === 0) {

            await client.query("COMMIT");

            transactionOpen = false;

            return false;

        }

        const { family_id: familyId } = result.rows[0];

        await revokeSessionFamily(
            client,
            familyId
        );

        await client.query("COMMIT");

        transactionOpen = false;

        return true;

    } catch (error) {

        if (transactionOpen) {

            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                // Preserve the original error.
            }

        }

        throw error;

    } finally {

        client.release();

    }

}


// ======================================================
// EXPORT
// ======================================================

module.exports = {
    createSession,
    rotateRefreshToken,
    revokeRefreshToken,
    generateAccessToken,
    ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL_MS
};
