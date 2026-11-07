
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");

const jwt = require("jsonwebtoken");

const pool = require("../db/database");
const config = require("../config/config");

const {
    loginWithGoogle,
    loginUser,
    registerUser
} = require("../services/authService");

const testEmails = [];

after(async () => {
    try {
        if (testEmails.length > 0) {
            await pool.query(
                "DELETE FROM users WHERE email = ANY($1::text[])",
                [testEmails]
            );
        }
    } finally {
        await pool.end();
    }
});

function createGoogleClient(payload) {
    return {
        verifyIdToken: async ({ idToken, audience }) => {
            assert.ok(idToken);
            assert.equal(audience, config.auth.googleClientId);

            return {
                getPayload: () => payload
            };
        }
    };
}

// Test 1: Google client is not configured.
test("Google login rejects an unconfigured client", async () => {
    await assert.rejects(
        loginWithGoogle("fake-token", null),
        (error) => {
            assert.equal(error.statusCode, 503);
            return true;
        }
    );
});

// Test 2: Invalid Google token.
test("Google login rejects an invalid token", async () => {
    const fakeClient = {
        verifyIdToken: async () => {
            throw new Error("Invalid token");
        }
    };

    await assert.rejects(
        loginWithGoogle("invalid-token", fakeClient),
        (error) => {
            assert.equal(error.statusCode, 401);
            assert.equal(error.message, "Invalid Google token");
            return true;
        }
    );
});

// Test 3: Unverified Google email.
test("Google login rejects an unverified email", async () => {
    const payload = {
        sub: `google-${randomUUID()}`,
        email: `day77-google-unverified-${randomUUID()}@example.com`,
        email_verified: false,
        name: "Unverified User"
    };

    const fakeClient = createGoogleClient(payload);

    await assert.rejects(
        loginWithGoogle("fake-token", fakeClient),
        (error) => {
            assert.equal(error.statusCode, 401);
            return true;
        }
    );
});

// Test 4: Create a new Google account and log in again.
test("Google login creates an account and supports returning users", async () => {
    const uniqueId = randomUUID();

    const payload = {
        sub: `google-${uniqueId}`,
        email: `day77-google-new-${uniqueId}@example.com`,
        email_verified: true,
        name: "Day 77 Google User"
    };

    testEmails.push(payload.email);

    const fakeClient = createGoogleClient(payload);

    const firstLogin = await loginWithGoogle(
        "fake-token",
        fakeClient
    );

    assert.ok(firstLogin.token);
    assert.equal(firstLogin.user.email, payload.email);
    assert.equal(firstLogin.user.role, "CITIZEN");

    const decodedToken = jwt.verify(
        firstLogin.token,
        config.auth.jwtSecret
    );

    assert.equal(decodedToken.userId, firstLogin.user.id);
    assert.equal(decodedToken.role, "CITIZEN");

    const databaseResult = await pool.query(
        `SELECT id, name, email, role, password_hash, google_sub
         FROM users
         WHERE google_sub = $1`,
        [payload.sub]
    );

    assert.equal(databaseResult.rows.length, 1);
    assert.equal(databaseResult.rows[0].password_hash, null);
    assert.equal(databaseResult.rows[0].email, payload.email);

    const secondLogin = await loginWithGoogle(
        "fake-token",
        fakeClient
    );

    assert.equal(secondLogin.user.id, firstLogin.user.id);
});

// Test 5: Do not automatically link an existing password account.
test("Google login rejects an existing password account with matching email", async () => {
    const uniqueId = randomUUID();
    const email = `day77-google-conflict-${uniqueId}@example.com`;

    testEmails.push(email);

    await registerUser(
        "Existing Password User",
        email,
        "TestPassword@123"
    );

    const payload = {
        sub: `google-${uniqueId}`,
        email,
        email_verified: true,
        name: "Google User"
    };

    const fakeClient = createGoogleClient(payload);

    await assert.rejects(
        loginWithGoogle("fake-token", fakeClient),
        (error) => {
            assert.equal(error.statusCode, 409);
            return true;
        }
    );
});

test("Google-only users cannot log in with a password", async () => {
    const uniqueId = randomUUID();

    const payload = {
        sub: `google-${uniqueId}`,
        email: `day77-password-check-${uniqueId}@example.com`,
        email_verified: true,
        name: "Google Password Check"
    };

    testEmails.push(payload.email);

    const fakeClient = createGoogleClient(payload);

    await loginWithGoogle("fake-token", fakeClient);

    await assert.rejects(
        loginUser(payload.email, "TestPassword@123"),
        (error) => {
            assert.equal(error.statusCode, 401);
            assert.equal(
                error.message,
                "Invalid email or password"
            );
            return true;
        }
    );
});
