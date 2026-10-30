const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const request = require("supertest");
const app = require("../server");

const expiredToken = jwt.sign(
    { userId: 1, role: "CITIZEN" },
    process.env.JWT_SECRET,
    { expiresIn: "-1s" }
);

test("authentication rejects Basic authorization scheme", async () => {
    const response = await request(app)
        .get("/api/issues/1")
        .set("Authorization", "Basic sometoken");

    assert.equal(response.status, 401);
    assert.equal(
        response.body.message,
        "Invalid authorization format"
    );
    assert.ok(response.headers["x-request-id"]);
});

test("authentication rejects Bearer header without token", async () => {
    const response = await request(app)
        .get("/api/issues/1")
        .set("Authorization", "Bearer");

    assert.equal(response.status, 401);
    assert.equal(
        response.body.message,
        "Invalid authorization format"
    );
});

test("authentication rejects invalid JWT", async () => {
    const response = await request(app)
        .get("/api/issues/1")
        .set("Authorization", "Bearer invalid-token");

    assert.equal(response.status, 401);
    assert.equal(
        response.body.message,
        "Invalid or expired token"
    );
});

test("authentication rejects expired JWT", async () => {
    const response = await request(app)
        .get("/api/issues/1")
        .set("Authorization", `Bearer ${expiredToken}`);

    assert.equal(response.status, 401);
    assert.equal(
        response.body.message,
        "Invalid or expired token"
    );
});

test("authentication rate limiter blocks the 11th attempt", async () => {
    for (let attempt = 1; attempt <= 10; attempt++) {
        const response = await request(app)
            .post("/api/auth/login")
            .send({});

        assert.equal(
            response.status,
            400,
            `Attempt ${attempt} should reach validation`
        );
    }

    const blockedResponse = await request(app)
        .post("/api/auth/login")
        .send({});

    assert.equal(blockedResponse.status, 429);
    assert.equal(
        blockedResponse.body.message,
        "Too many authentication attempts. Please try again later."
    );
});
