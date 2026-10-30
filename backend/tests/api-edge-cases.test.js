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

test("GET /api/issues accepts maximum page size of 50", async () => {
    const response = await request(app)
        .get("/api/issues?page=1&limit=50");

    assert.equal(response.status, 200);
    assert.equal(response.body.data.pagination.limit, 50);
});

test("GET /api/issues rejects page zero", async () => {
    const response = await request(app)
        .get("/api/issues?page=0");

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Validation failed");
    assert.ok(Array.isArray(response.body.details));
});

test("GET /api/issues rejects limit above 50", async () => {
    const response = await request(app)
        .get("/api/issues?limit=51");

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Validation failed");
});

test("GET /api/issues rejects whitespace-only search", async () => {
    const response = await request(app)
        .get("/api/issues?search=%20%20");

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Validation failed");
});

test("POST /api/reports rejects latitude above 90", async () => {
    const response = await request(app)
        .post("/api/reports")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
            title: "Invalid latitude test",
            description: "Testing latitude boundary validation.",
            category: "ROAD",
            latitude: 90.000001,
            longitude: 0
        });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Validation failed");
});

test("POST /api/reports rejects longitude below -180", async () => {
    const response = await request(app)
        .post("/api/reports")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
            title: "Invalid longitude test",
            description: "Testing longitude boundary validation.",
            category: "ROAD",
            latitude: 0,
            longitude: -180.000001
        });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Validation failed");
});

test("POST /api/issues/:id/evidence rejects description above 1000 characters", async () => {
    const response = await request(app)
        .post("/api/issues/1/evidence")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
            description: "A".repeat(1001)
        });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Validation failed");
});

test("PATCH /api/issues/:id/status rejects missing status", async () => {
    const response = await request(app)
        .patch("/api/issues/1/status")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({});

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Validation failed");
    assert.ok(Array.isArray(response.body.details));
});
