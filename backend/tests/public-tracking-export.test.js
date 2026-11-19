const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db/database");
const {
    getPublicIssueTracking,
    exportIssuesGeoJson,
    exportIssuesCsv
} = require("../services/issueService");

test("exportIssuesGeoJson returns valid GeoJSON FeatureCollection", async () => {
    const geojson = await exportIssuesGeoJson();
    assert.equal(geojson.type, "FeatureCollection");
    assert.ok(Array.isArray(geojson.features));

    if (geojson.features.length > 0) {
        const f = geojson.features[0];
        assert.equal(f.type, "Feature");
        assert.equal(f.geometry.type, "Point");
        assert.ok(Array.isArray(f.geometry.coordinates));
        assert.equal(f.geometry.coordinates.length, 2);
        assert.ok(f.properties.id);
        assert.ok(f.properties.title);
        assert.ok(f.properties.status);
    }
});

test("exportIssuesCsv produces CSV with standard header row", async () => {
    const csv = await exportIssuesCsv();
    assert.equal(typeof csv, "string");
    const lines = csv.split("\r\n");
    assert.ok(lines.length >= 1);
    assert.ok(lines[0].includes("ID"));
    assert.ok(lines[0].includes("Title"));
    assert.ok(lines[0].includes("Category"));
    assert.ok(lines[0].includes("Status"));
});

test("getPublicIssueTracking rejects non-existent issue", async () => {
    await assert.rejects(
        async () => {
            await getPublicIssueTracking(999999);
        },
        /Civic issue not found/
    );
});
