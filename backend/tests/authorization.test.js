const { test } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const request = require("supertest");
const app = require("../server");

const citizenToken = jwt.sign(
    { userId: 1, role: "CITIZEN" },
    process.env.JWT_SECRET,
    { expiresIn: "5m" }
);

const adminToken = jwt.sign(
    { userId: 3, role: "ADMIN" },
    process.env.JWT_SECRET,
    { expiresIn: "5m" }
);

test("protected issue route rejects requests without a token", async () => {
    const response = await request(app)
        .get("/api/issues/1");

    assert.equal(response.status, 401);
    assert.equal(response.body.message, "Access token required");
    assert.ok(response.headers["x-request-id"]);
});

test("citizen cannot update issue status", async () => {
    const response = await request(app)
        .patch("/api/issues/1/status")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({ status: "IN_PROGRESS" });

    assert.equal(response.status, 403);
    assert.equal(response.body.message, "Access denied");
    assert.ok(response.headers["x-request-id"]);
});

test("citizen cannot upload issue evidence", async () => {
    const response = await request(app)
        .post("/api/issues/1/evidence")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
            image: "test-image.jpg",
            description: "Test evidence"
        });

    assert.equal(response.status, 403);
    assert.equal(response.body.message, "Access denied");
});

test("admin passes role authorization before ID validation", async () => {
    const response = await request(app)
        .patch("/api/issues/not-a-number/status")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "IN_PROGRESS" });

    // The invalid ID should be rejected after authentication
    // and the ADMIN role check have succeeded.
    assert.equal(response.status, 400);
});