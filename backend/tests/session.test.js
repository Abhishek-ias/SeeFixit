
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("crypto");
const jwt = require("jsonwebtoken");

const pool = require("../db/database");
const config = require("../config/config");

const { registerUser } = require("../services/authService");

const {
    createSession,
    rotateRefreshToken,
    revokeRefreshToken
} = require("../services/sessionService");

const testEmail = `session-${randomUUID()}@example.com`;
const testPassword = "TestPassword@123";

let testUser;

function hashToken(token) {
    return createHash("sha256")
        .update(token)
        .digest("hex");
}

function isUnauthorized(error) {
    return error.statusCode === 401;
}

// ======================================================
// TEST SETUP
// ======================================================

before(async () => {
    testUser = await registerUser(
        "Session Test User",
        testEmail,
        testPassword
    );
});

// ======================================================
// TEST CLEANUP
// ======================================================

after(async () => {
    try {
        if (testUser) {
            await pool.query(
                "DELETE FROM users WHERE id = $1",
                [testUser.id]
            );
        }
    } finally {
        await pool.end();
    }
});

// ======================================================
// SESSION CREATION
// ======================================================

test("session creation stores only the refresh token hash", async () => {
    const session = await createSession(testUser);

    assert.ok(session.token);
    assert.ok(session.refreshToken);
    assert.ok(session.refreshTokenExpiresAt);

    assert.equal(session.user.id, testUser.id);
    assert.equal(session.user.email, testEmail);

    const accessPayload = jwt.verify(
        session.token,
        config.auth.jwtSecret
    );

    assert.equal(
        accessPayload.exp - accessPayload.iat,
        15 * 60
    );

    const result = await pool.query(
        `
            SELECT token_hash, expires_at
            FROM auth_refresh_tokens
            WHERE user_id = $1
              AND token_hash = $2;
        `,
        [
            testUser.id,
            hashToken(session.refreshToken)
        ]
    );

    assert.equal(result.rows.length, 1);

    assert.equal(
        result.rows[0].token_hash,
        hashToken(session.refreshToken)
    );

    assert.notEqual(
        result.rows[0].token_hash,
        session.refreshToken
    );
});

// ======================================================
// REFRESH TOKEN ROTATION
// ======================================================

test("refresh token rotation consumes old token and creates a new token", async () => {
    const originalSession = await createSession(testUser);

    const originalResult = await pool.query(
        `
            SELECT family_id, expires_at
            FROM auth_refresh_tokens
            WHERE token_hash = $1;
        `,
        [hashToken(originalSession.refreshToken)]
    );

    assert.equal(originalResult.rows.length, 1);

    const originalFamilyId =
        originalResult.rows[0].family_id;

    const originalExpiry =
        new Date(originalResult.rows[0].expires_at).getTime();

    const rotatedSession = await rotateRefreshToken(
        originalSession.refreshToken
    );

    assert.ok(rotatedSession.token);
    assert.ok(rotatedSession.refreshToken);

    assert.notEqual(
        rotatedSession.refreshToken,
        originalSession.refreshToken
    );

    const oldTokenResult = await pool.query(
        `
            SELECT consumed_at, revoked_at
            FROM auth_refresh_tokens
            WHERE token_hash = $1;
        `,
        [hashToken(originalSession.refreshToken)]
    );

    assert.ok(oldTokenResult.rows[0].consumed_at);
    assert.equal(oldTokenResult.rows[0].revoked_at, null);

    const newTokenResult = await pool.query(
        `
            SELECT family_id, expires_at, consumed_at, revoked_at
            FROM auth_refresh_tokens
            WHERE token_hash = $1;
        `,
        [hashToken(rotatedSession.refreshToken)]
    );

    assert.equal(newTokenResult.rows.length, 1);

    assert.equal(
        newTokenResult.rows[0].family_id,
        originalFamilyId
    );

    assert.equal(newTokenResult.rows[0].consumed_at, null);
    assert.equal(newTokenResult.rows[0].revoked_at, null);

    assert.equal(
        new Date(newTokenResult.rows[0].expires_at).getTime(),
        originalExpiry
    );
});

// ======================================================
// REFRESH TOKEN REUSE DETECTION
// ======================================================

test("reusing a consumed refresh token revokes its entire session family", async () => {
    const originalSession = await createSession(testUser);

    const rotatedSession = await rotateRefreshToken(
        originalSession.refreshToken
    );

    const familyResult = await pool.query(
        `
            SELECT family_id
            FROM auth_refresh_tokens
            WHERE token_hash = $1;
        `,
        [hashToken(originalSession.refreshToken)]
    );

    const familyId = familyResult.rows[0].family_id;

    await assert.rejects(
        rotateRefreshToken(originalSession.refreshToken),
        isUnauthorized
    );

    const familyTokens = await pool.query(
        `
            SELECT revoked_at
            FROM auth_refresh_tokens
            WHERE family_id = $1;
        `,
        [familyId]
    );

    assert.ok(familyTokens.rows.length >= 2);

    for (const token of familyTokens.rows) {
        assert.ok(token.revoked_at);
    }

    // The replacement token must also be unusable.
    await assert.rejects(
        rotateRefreshToken(rotatedSession.refreshToken),
        isUnauthorized
    );
});

// ======================================================
// EXPIRED REFRESH TOKEN
// ======================================================

test("expired refresh token is rejected and its family is revoked", async () => {
    const session = await createSession(testUser);

    const tokenResult = await pool.query(
        `
            SELECT id, family_id
            FROM auth_refresh_tokens
            WHERE token_hash = $1;
        `,
        [hashToken(session.refreshToken)]
    );

    const tokenId = tokenResult.rows[0].id;
    const familyId = tokenResult.rows[0].family_id;

    // Move the token's creation and expiry into the past.
    // Keep expires_at later than created_at to satisfy
    // the database constraint.

    await pool.query(
        `
            UPDATE auth_refresh_tokens
            SET
                created_at = NOW() - INTERVAL '31 days',
                expires_at = NOW() - INTERVAL '1 day'
            WHERE id = $1;
        `,
        [tokenId]
    );

    await assert.rejects(
        rotateRefreshToken(session.refreshToken),
        isUnauthorized
    );

    const result = await pool.query(
        `
            SELECT revoked_at
            FROM auth_refresh_tokens
            WHERE family_id = $1;
        `,
        [familyId]
    );

    assert.ok(result.rows[0].revoked_at);
});

// ======================================================
// LOGOUT / SESSION REVOCATION
// ======================================================

test("logout revokes the entire session family", async () => {
    const originalSession = await createSession(testUser);

    const rotatedSession = await rotateRefreshToken(
        originalSession.refreshToken
    );

    const familyResult = await pool.query(
        `
            SELECT family_id
            FROM auth_refresh_tokens
            WHERE token_hash = $1;
        `,
        [hashToken(rotatedSession.refreshToken)]
    );

    const familyId = familyResult.rows[0].family_id;

    const revoked = await revokeRefreshToken(
        rotatedSession.refreshToken
    );

    assert.equal(revoked, true);

    const result = await pool.query(
        `
            SELECT revoked_at
            FROM auth_refresh_tokens
            WHERE family_id = $1;
        `,
        [familyId]
    );

    assert.ok(result.rows.length >= 2);

    for (const token of result.rows) {
        assert.ok(token.revoked_at);
    }

    await assert.rejects(
        rotateRefreshToken(rotatedSession.refreshToken),
        isUnauthorized
    );
});

test("logout safely handles invalid or missing refresh tokens", async () => {
    assert.equal(
        await revokeRefreshToken(null),
        false
    );

    assert.equal(
        await revokeRefreshToken("invalid-token"),
        false
    );
});

// ======================================================
// INVALID TOKEN
// ======================================================

test("refresh rejects an invalid token", async () => {
    await assert.rejects(
        rotateRefreshToken("invalid-token"),
        isUnauthorized
    );
});
