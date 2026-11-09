const { test } = require("node:test");
const assert = require("node:assert/strict");

const request = require("supertest");
const app = require("../server");
const config = require("../config/config");

const allowedOrigin = config.server.frontendOrigin;


// 1. Helmet security headers

test("API responses include Helmet security headers", async () => {

    const response = await request(app)
        .get("/api/health/live");

    assert.equal(response.status, 200);

    assert.equal(
        response.headers["x-content-type-options"],
        "nosniff"
    );

    assert.equal(
        response.headers["x-frame-options"],
        "SAMEORIGIN"
    );

    assert.ok(
        response.headers["content-security-policy"]
    );

    assert.equal(
        response.headers["x-powered-by"],
        undefined
    );
});


// 2. Allowed frontend origin

test("CORS allows the configured frontend origin", async () => {

    const response = await request(app)
        .get("/api/health/live")
        .set("Origin", allowedOrigin);

    assert.equal(response.status, 200);

    assert.equal(
        response.headers["access-control-allow-origin"],
        allowedOrigin
    );
});


// 3. Disallowed frontend origin

test("CORS does not allow an unknown origin", async () => {

    const response = await request(app)
        .get("/api/health/live")
        .set("Origin", "https://unknown-example.com");

    // The API still processes the request.
    // Browsers block frontend JavaScript from reading this response.
    assert.equal(response.status, 200);

    assert.equal(
        response.headers["access-control-allow-origin"],
        undefined
    );
});


// 4. CORS preflight request

test("CORS handles allowed preflight requests", async () => {

    const response = await request(app)
        .options("/api/health/live")
        .set("Origin", allowedOrigin)
        .set("Access-Control-Request-Method", "GET")
        .set(
            "Access-Control-Request-Headers",
            "Authorization,Content-Type"
        );

    assert.equal(response.status, 204);

    assert.equal(
        response.headers["access-control-allow-origin"],
        allowedOrigin
    );

    assert.match(
        response.headers["access-control-allow-methods"],
        /GET/
    );

    assert.match(
        response.headers["access-control-allow-headers"],
        /Authorization/i
    );
});


// 5. JSON payload size limit

test("API rejects JSON requests larger than 10 KB", async () => {

    const response = await request(app)
        .post("/api/auth/login")
        .send({
            payload: "x".repeat(11 * 1024)
        });

    assert.equal(response.status, 413);

    assert.equal(
        response.body.message,
        "Request body too large"
    );
});


// 6. Health checks bypass the global API rate limiter.

test("health checks bypass the global API rate limiter", async () => {

    // Send more requests than the global limit of 100.
    // Liveness does not require a database connection.
    for (let attempt = 1; attempt <= 105; attempt++) {

        const response = await request(app)
            .get("/api/health/live");

        assert.equal(
            response.status,
            200,
            `Health check failed on attempt ${attempt}`
        );
    }
});



// 7. Non-API requests bypass the global API rate limiter.

test("non-API requests bypass the global API rate limiter", async () => {

    const response = await request(app)
        .head("/");

    assert.equal(response.status, 404);

    assert.equal(
        response.headers["x-ratelimit-limit"],
        undefined
    );

    assert.equal(
        response.headers["ratelimit-limit"],
        undefined
    );
});


// 8. API requests remain protected by the global rate limiter.

test("global API rate limiter blocks the 101st request", async () => {

    for (let attempt = 1; attempt <= 100; attempt++) {

        const response = await request(app)
            .get("/api/__rate_limit_probe__");

        assert.equal(
            response.status,
            404,
            `API request ${attempt} should reach the endpoint`
        );

        assert.equal(
            response.headers["x-ratelimit-limit"],
            "100"
        );
    }

    const blockedResponse = await request(app)
        .get("/api/__rate_limit_probe__");

    assert.equal(blockedResponse.status, 429);
});