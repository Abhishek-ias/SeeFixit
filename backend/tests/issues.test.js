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

test("GET /api/issues returns issues and pagination metadata", async () => {
    const response = await request(app)
        .get("/api/issues");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.ok(Array.isArray(response.body.data.issues));
    assert.ok(response.body.data.pagination);

    assert.equal(response.body.data.pagination.page, 1);
    assert.equal(response.body.data.pagination.limit, 10);
});

test("GET /api/issues filters by category and status", async () => {
    const response = await request(app)
        .get("/api/issues?category=ROAD&status=OPEN");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.ok(Array.isArray(response.body.data.issues));

    for (const issue of response.body.data.issues) {
        assert.equal(issue.category, "ROAD");
        assert.equal(issue.status, "OPEN");
    }
});

test("GET /api/issues respects pagination limit", async () => {
    const response = await request(app)
        .get("/api/issues?page=1&limit=2");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.ok(response.body.data.issues.length <= 2);

    assert.equal(response.body.data.pagination.page, 1);
    assert.equal(response.body.data.pagination.limit, 2);
    assert.equal(typeof response.body.data.pagination.total, "number");
});

test("GET /api/issues rejects an invalid category", async () => {
    const response = await request(app)
        .get("/api/issues?category=INVALID");

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Validation failed");
    assert.ok(Array.isArray(response.body.details));
});

test("GET /api/issues/:id rejects an invalid ID", async () => {
    const response = await request(app)
        .get("/api/issues/not-a-number")
        .set("Authorization", `Bearer ${citizenToken}`);

    assert.equal(response.status, 400);
    assert.ok(response.headers["x-request-id"]);
});