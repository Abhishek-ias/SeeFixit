const { test, after } = require("node:test");
const assert = require("node:assert/strict");

const request = require("supertest");
const app = require("../server");
const pool = require("../db/database");

after(async () => {
    await pool.end();
});

test("GET /api/health/live returns 200 and alive status", async () => {
    const response = await request(app)
        .get("/api/health/live");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.status, "alive");

    assert.ok(response.headers["x-request-id"]);
});

test("GET /api/health returns 200 when database is connected", async () => {
    const response = await request(app)
        .get("/api/health");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.database, "connected");

    assert.ok(response.headers["x-request-id"]);
});

test("GET /api/health/ready returns 200 when database is connected", async () => {
    const response = await request(app)
        .get("/api/health/ready");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.database, "connected");

    assert.ok(response.headers["x-request-id"]);
});

test("each request receives a different request ID", async () => {
    const firstResponse = await request(app)
        .get("/api/health/live");

    const secondResponse = await request(app)
        .get("/api/health/live");

    const firstId = firstResponse.headers["x-request-id"];
    const secondId = secondResponse.headers["x-request-id"];

    assert.ok(firstId);
    assert.ok(secondId);
    assert.notEqual(firstId, secondId);
});