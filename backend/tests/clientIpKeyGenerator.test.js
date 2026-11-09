const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    ipKeyGenerator
} = require("express-rate-limit");

const createClientIpKeyGenerator =
    require("../middleware/clientIpKeyGenerator");


// Mock request helper
function makeRequest({
    ip,
    headers = {},
    socketRemoteAddress = ip
} = {}) {

    const normalizedHeaders = Object.fromEntries(
        Object.entries(headers).map(([key, value]) => [
            key.toLowerCase(),
            value
        ])
    );

    return {
        ip,
        headers: normalizedHeaders,
        socket: {
            remoteAddress: socketRemoteAddress
        },
        get(name) {
            return this.headers[name.toLowerCase()];
        }
    };
}


// 1. Development uses Express req.ip.
test("development uses Express client IP", () => {

    const keyGenerator =
        createClientIpKeyGenerator({
            isProduction: false
        });

    const req = makeRequest({
        ip: "192.0.2.10",
        headers: {
            "CF-Connecting-IP": "203.0.113.10"
        }
    });

    assert.equal(
        keyGenerator(req),
        ipKeyGenerator("192.0.2.10")
    );
});


// 2. Production uses Cloudflare client IP.
test("production uses Cloudflare client IP", () => {

    const keyGenerator =
        createClientIpKeyGenerator({
            isProduction: true
        });

    const req = makeRequest({
        ip: "10.0.0.5",
        headers: {
            "CF-Connecting-IP": "203.0.113.10",
            "X-Forwarded-For": "198.51.100.50"
        }
    });

    assert.equal(
        keyGenerator(req),
        ipKeyGenerator("203.0.113.10")
    );
});


// 3. Production rejects a missing Cloudflare client IP.
test("production rejects a missing Cloudflare client IP", () => {

    const keyGenerator =
        createClientIpKeyGenerator({
            isProduction: true
        });

    const req = makeRequest({
        ip: "10.0.0.5"
    });

    assert.throws(
        () => keyGenerator(req),
        /Missing or invalid trusted CF-Connecting-IP header/
    );
});


// 4. Production rejects an invalid Cloudflare client IP.
test("production rejects an invalid Cloudflare client IP", () => {

    const keyGenerator =
        createClientIpKeyGenerator({
            isProduction: true
        });

    const req = makeRequest({
        ip: "10.0.0.5",
        headers: {
            "CF-Connecting-IP": "invalid-ip"
        }
    });

    assert.throws(
        () => keyGenerator(req),
        /Missing or invalid trusted CF-Connecting-IP header/
    );
});


// 5. IPv6 addresses in the same subnet share a key.
test("IPv6 addresses are normalized for rate limiting", () => {

    const keyGenerator =
        createClientIpKeyGenerator({
            isProduction: false
        });

    const first = keyGenerator(
        makeRequest({
            ip: "2001:db8:abcd:1200::1"
        })
    );

    const second = keyGenerator(
        makeRequest({
            ip: "2001:db8:abcd:12ff::2"
        })
    );

    assert.equal(first, second);
});


// 6. Invalid development IP must not silently pass.
test("invalid client IP throws an error", () => {

    const keyGenerator =
        createClientIpKeyGenerator({
            isProduction: false
        });

    const req = makeRequest({
        ip: "invalid-ip",
        socketRemoteAddress: "invalid-ip"
    });

    assert.throws(
        () => keyGenerator(req),
        /Unable to determine a valid client IP for rate limiting/
    );
});