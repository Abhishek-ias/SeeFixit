const { test } = require("node:test");
const assert = require("node:assert/strict");
const { haversineDistance } = require("../utils/gis");

test("haversineDistance calculates accurate distance in meters", () => {
    // Bangalore MG Road to Majestic (~5 km)
    const mgRoad = { lat: 12.9753, lon: 77.6066 };
    const majestic = { lat: 12.9767, lon: 77.5713 };

    const distance = haversineDistance(
        mgRoad.lat,
        mgRoad.lon,
        majestic.lat,
        majestic.lon
    );

    // Distance is ~3800m
    assert.ok(distance > 3500 && distance < 4200, `Expected ~3800m, got ${distance}`);
});

test("haversineDistance returns 0 for identical coordinates", () => {
    const dist = haversineDistance(13.0, 77.0, 13.0, 77.0);
    assert.equal(dist, 0);
});
