const { test } = require("node:test");
const assert = require("node:assert/strict");

const request = require("supertest");
const app = require("../server");

test("GET /api/issues rejects an invalid limit", async () => {
    const response = await request(app)
        .get("/api/issues?limit=999");

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Validation failed");

    assert.ok(Array.isArray(response.body.details));
    assert.ok(response.headers["x-request-id"]);
});

test("unknown API endpoint returns 404", async () => {
    const response = await request(app)
        .get("/api/does-not-exist");

    assert.equal(response.status, 404);
    assert.ok(response.headers["x-request-id"]);
});