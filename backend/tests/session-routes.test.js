
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, createHash } = require("crypto");

const request = require("supertest");
const app = require("../server");
const pool = require("../db/database");
const config = require("../config/config");

const { registerUser } = require("../services/authService");

const TEST_COOKIE = "seefixit_refresh";
const testEmail = `session-routes-${randomUUID()}@example.com`;
const testPassword = "TestPassword@123";
const frontendOrigin = config.server.frontendOrigin;

let testUser;

function getRefreshCookie(response) {
    const cookies = response.headers["set-cookie"] || [];

    const cookie = cookies.find((value) =>
        value.startsWith(`${TEST_COOKIE}=`)
    );

    assert.ok(cookie, "Refresh token cookie should exist");

    return cookie.split(";")[0];
}

function getRawToken(cookiePair) {
    return cookiePair.slice(TEST_COOKIE.length + 1);
}

function hashToken(token) {
    return createHash("sha256")
        .update(token)
        .digest("hex");
}

// ======================================================
// TEST SETUP
// ======================================================

before(async () => {
    assert.ok(frontendOrigin, "Frontend origin must be configured");

    testUser = await registerUser(
        "Session Routes Test User",
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
// LOGIN, REFRESH AND REUSE DETECTION
// ======================================================

test("login sets HttpOnly cookie and refresh rotates it securely", async () => {

    // Step 1: Login.
    const loginResponse = await request(app)
        .post("/api/auth/login")
        .set("Origin", frontendOrigin)
        .send({
            email: testEmail,
            password: testPassword
        });

    assert.equal(loginResponse.status, 200);
    assert.equal(loginResponse.body.success, true);

    assert.ok(loginResponse.body.data.token);
    assert.equal(loginResponse.body.data.user.email, testEmail);

    const originalCookie = getRefreshCookie(loginResponse);
    const originalToken = getRawToken(originalCookie);

    const originalHash = hashToken(originalToken);

    assert.match(loginResponse.headers["set-cookie"].join(";"), /HttpOnly/i);
    assert.match(loginResponse.headers["set-cookie"].join(";"), /Path=\/api\/auth/i);
    assert.match(loginResponse.headers["set-cookie"].join(";"), /SameSite=Lax/i);

    assert.equal(
        JSON.stringify(loginResponse.body).includes(originalToken),
        false
    );

    // Step 2: Verify original refresh token is stored as a hash.
    const originalResult = await pool.query(
        `
            SELECT id, family_id, token_hash, consumed_at, revoked_at
            FROM auth_refresh_tokens
            WHERE token_hash = $1;
        `,
        [originalHash]
    );

    assert.equal(originalResult.rows.length, 1);

    const originalRecord = originalResult.rows[0];

    assert.equal(originalRecord.token_hash, originalHash);
    assert.equal(originalRecord.consumed_at, null);
    assert.equal(originalRecord.revoked_at, null);

    // Step 3: Refresh the session.
    const refreshResponse = await request(app)
        .post("/api/auth/refresh")
        .set("Origin", frontendOrigin)
        .set("Cookie", originalCookie)
        .send({});

    assert.equal(refreshResponse.status, 200);
    assert.equal(refreshResponse.body.success, true);

    assert.ok(refreshResponse.body.data.token);

    const newCookie = getRefreshCookie(refreshResponse);
    const newToken = getRawToken(newCookie);

    assert.notEqual(newToken, originalToken);

    assert.equal(
        JSON.stringify(refreshResponse.body).includes(newToken),
        false
    );

    // Step 4: Verify original token was consumed.
    const oldTokenResult = await pool.query(
        `
            SELECT consumed_at, revoked_at
            FROM auth_refresh_tokens
            WHERE token_hash = $1;
        `,
        [originalHash]
    );

    assert.ok(oldTokenResult.rows[0].consumed_at);
    assert.equal(oldTokenResult.rows[0].revoked_at, null);

    // Step 5: Verify replacement token belongs to same family.
    const newTokenResult = await pool.query(
        `
            SELECT family_id, token_hash, consumed_at, revoked_at
            FROM auth_refresh_tokens
            WHERE token_hash = $1;
        `,
        [hashToken(newToken)]
    );

    assert.equal(newTokenResult.rows.length, 1);

    assert.equal(
        newTokenResult.rows[0].family_id,
        originalRecord.family_id
    );

    assert.equal(newTokenResult.rows[0].consumed_at, null);
    assert.equal(newTokenResult.rows[0].revoked_at, null);

    // Step 6: Replay the original token.
    const replayResponse = await request(app)
        .post("/api/auth/refresh")
        .set("Origin", frontendOrigin)
        .set("Cookie", originalCookie)
        .send({});

    assert.equal(replayResponse.status, 401);

    // The replay should revoke the entire session family.
    const familyResult = await pool.query(
        `
            SELECT revoked_at
            FROM auth_refresh_tokens
            WHERE family_id = $1;
        `,
        [originalRecord.family_id]
    );

    assert.ok(familyResult.rows.length >= 2);

    for (const token of familyResult.rows) {
        assert.ok(token.revoked_at);
    }
});

// ======================================================
// LOGOUT
// ======================================================

test("logout revokes the refresh-token family and clears cookie", async () => {

    // Create a fresh login.
    const loginResponse = await request(app)
        .post("/api/auth/login")
        .set("Origin", frontendOrigin)
        .send({
            email: testEmail,
            password: testPassword
        });

    assert.equal(loginResponse.status, 200);

    const cookie = getRefreshCookie(loginResponse);
    const token = getRawToken(cookie);

    const tokenResult = await pool.query(
        `
            SELECT family_id
            FROM auth_refresh_tokens
            WHERE token_hash = $1;
        `,
        [hashToken(token)]
    );

    assert.equal(tokenResult.rows.length, 1);

    const familyId = tokenResult.rows[0].family_id;

    // Logout.
    const logoutResponse = await request(app)
        .post("/api/auth/logout")
        .set("Origin", frontendOrigin)
        .set("Cookie", cookie)
        .send({});

    assert.equal(logoutResponse.status, 200);
    assert.equal(logoutResponse.body.success, true);

    const clearedCookies = logoutResponse.headers["set-cookie"] || [];

    assert.ok(
        clearedCookies.some((value) =>
            value.startsWith(`${TEST_COOKIE}=;`)
        ),
        "Logout should clear the refresh cookie"
    );

    // Verify database revocation.
    const revokedResult = await pool.query(
        `
            SELECT revoked_at
            FROM auth_refresh_tokens
            WHERE family_id = $1;
        `,
        [familyId]
    );

    assert.ok(revokedResult.rows.length > 0);

    for (const tokenRecord of revokedResult.rows) {
        assert.ok(tokenRecord.revoked_at);
    }
});

// ======================================================
// ORIGIN VALIDATION
// ======================================================

test("authentication routes reject an untrusted origin", async () => {

    const response = await request(app)
        .post("/api/auth/login")
        .set("Origin", "https://attacker.example")
        .send({
            email: testEmail,
            password: testPassword
        });

    assert.equal(response.status, 403);
    assert.equal(response.body.message, "Request origin is not allowed");
});

// ======================================================
// MISSING REFRESH TOKEN
// ======================================================

test("refresh rejects a missing cookie and clears it", async () => {

    const response = await request(app)
        .post("/api/auth/refresh")
        .set("Origin", frontendOrigin)
        .send({});

    assert.equal(response.status, 401);

    const clearedCookies = response.headers["set-cookie"] || [];

    assert.ok(
        clearedCookies.some((value) =>
            value.startsWith(`${TEST_COOKIE}=;`)
        )
    );
});
