const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");

const request = require("supertest");
const app = require("../server");
const pool = require("../db/database");

const testEmail = `day61-${randomUUID()}@example.com`;
const testPassword = "TestPassword@123";

const userData = {
    name: "Day 61 Test User",
    email: testEmail,
    password: testPassword
};

// Create a test account before running the tests.
before(async () => {
    const response = await request(app)
        .post("/api/auth/register")
        .send(userData);

    assert.equal(response.status, 201);
    assert.equal(response.body.data.email, testEmail);
    assert.equal("password" in response.body.data, false);
});

// Remove the test account and close the database pool.
after(async () => {
    try {
        await pool.query(
            "DELETE FROM users WHERE email = $1",
            [testEmail]
        );
    } finally {
        await pool.end();
    }
});

test("registration rejects invalid details", async () => {
    const response = await request(app)
        .post("/api/auth/register")
        .send({
            name: "X",
            email: "invalid-email",
            password: "123"
        });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Validation failed");
    assert.ok(Array.isArray(response.body.details));
    assert.ok(response.headers["x-request-id"]);
});

test("registration rejects duplicate emails", async () => {
    const response = await request(app)
        .post("/api/auth/register")
        .send(userData);

    assert.equal(response.status, 409);
    assert.equal(response.body.message, "Email already registered");
    assert.ok(response.headers["x-request-id"]);
});

test("login returns a token for valid credentials", async () => {
    const response = await request(app)
        .post("/api/auth/login")
        .send({
            email: testEmail,
            password: testPassword
        });

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.ok(response.body.data.token);
    assert.equal(response.body.data.user.email, testEmail);
    assert.equal("password" in response.body.data.user, false);
    assert.ok(response.headers["x-request-id"]);
});

test("login rejects an incorrect password", async () => {
    const response = await request(app)
        .post("/api/auth/login")
        .send({
            email: testEmail,
            password: "WrongPassword@123"
        });

    assert.equal(response.status, 401);
    assert.equal(
        response.body.message,
        "Invalid email or password"
    );
    assert.ok(response.headers["x-request-id"]);
});