const test = require("node:test");
const assert = require("node:assert/strict");
const { detectHotspots } = require("../services/gisService");

test("detectHotspots returns structured hotspot results", async () => {
    const result = await detectHotspots({ radiusMeters: 500, minIssues: 1 });
    assert.ok(typeof result.totalHotspots === "number");
    assert.ok(Array.isArray(result.hotspots));
    assert.equal(result.radiusMeters, 500);
    assert.equal(result.totalHotspots, result.hotspots.length);

    if (result.hotspots.length > 0) {
        const h = result.hotspots[0];
        assert.ok(h.id);
        assert.ok(h.center.latitude);
        assert.ok(h.center.longitude);
        assert.ok(h.totalIssues >= 1);
        assert.ok(h.primaryCategory);
        assert.ok(h.recommendation);
        assert.ok(Array.isArray(h.issues));
    }
});
