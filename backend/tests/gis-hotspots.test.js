const test = require("node:test");
const assert = require("node:assert/strict");
const { clusterIssues, getHotspotRecommendation } = require("../services/gisService");

test("clusterIssues returns empty list when given empty array", () => {
    const result = clusterIssues([]);
    assert.deepEqual(result, []);
});

test("clusterIssues discards single isolated points when minIssues is 2", () => {
    const issues = [
        { id: 1, title: "Pothole A", category: "ROAD", status: "OPEN", priority_score: 60, latitude: 28.6139, longitude: 77.2090 }
    ];
    const result = clusterIssues(issues, 300, 2);
    assert.equal(result.length, 0);
});

test("clusterIssues merges points within radius into a chronic hotspot", () => {
    // Two points roughly 80m apart in Connaught Place, New Delhi
    const issues = [
        { id: 1, title: "Large crater", category: "ROAD", status: "OPEN", priority_score: 75, latitude: 28.6315, longitude: 77.2167 },
        { id: 2, title: "Broken pavement", category: "ROAD", status: "IN_PROGRESS", priority_score: 65, latitude: 28.6320, longitude: 77.2172 },
        // A third point far away (5 km away)
        { id: 3, title: "Fallen wire", category: "LIGHTING", status: "OPEN", priority_score: 80, latitude: 28.5800, longitude: 77.2300 }
    ];

    const result = clusterIssues(issues, 200, 2);
    assert.equal(result.length, 1);

    const hotspot = result[0];
    assert.equal(hotspot.totalIssues, 2);
    assert.equal(hotspot.openIssues, 2);
    assert.equal(hotspot.primaryCategory, "ROAD");
    assert.equal(hotspot.chronicRisk, "MODERATE");
    assert.equal(hotspot.categoryBreakdown["ROAD"], 2);
    assert.equal(hotspot.statusBreakdown["OPEN"], 1);
    assert.equal(hotspot.statusBreakdown["IN_PROGRESS"], 1);
    assert.equal(hotspot.issues.length, 2);
    assert.ok(hotspot.radiusMeters >= 80);
    assert.ok(hotspot.center.latitude > 28.63 && hotspot.center.latitude < 28.64);
});

test("clusterIssues elevates chronic risk to CRITICAL for 5+ complaints", () => {
    const issues = [
        { id: 10, title: "Pipe leak 1", category: "WATER", status: "OPEN", priority_score: 50, latitude: 12.9716, longitude: 77.5946 },
        { id: 11, title: "Pipe leak 2", category: "WATER", status: "OPEN", priority_score: 55, latitude: 12.9718, longitude: 77.5948 },
        { id: 12, title: "Low pressure", category: "WATER", status: "OPEN", priority_score: 45, latitude: 12.9717, longitude: 77.5947 },
        { id: 13, title: "Muddy water", category: "WATER", status: "RESOLVED", priority_score: 70, latitude: 12.9719, longitude: 77.5945 },
        { id: 14, title: "Water overflow", category: "WATER", status: "OPEN", priority_score: 60, latitude: 12.9720, longitude: 77.5949 }
    ];

    const result = clusterIssues(issues, 250, 2);
    assert.equal(result.length, 1);

    const hotspot = result[0];
    assert.equal(hotspot.totalIssues, 5);
    assert.equal(hotspot.chronicRisk, "CRITICAL");
    assert.equal(hotspot.primaryCategory, "WATER");
    assert.ok(hotspot.recommendation.includes("pipeline pressure audit"));
});

test("getHotspotRecommendation provides category-tailored municipal actions", () => {
    const roadRec = getHotspotRecommendation("ROAD", 5, 3);
    assert.ok(roadRec.includes("continuous corridor resurfacing"));

    const waterRec = getHotspotRecommendation("WATER", 2, 1);
    assert.ok(waterRec.includes("Inspect pipeline joints"));

    const sanitationRec = getHotspotRecommendation("SANITATION", 4, 2);
    assert.ok(sanitationRec.includes("high-capacity dumper bins"));

    const lightingRec = getHotspotRecommendation("LIGHTING", 2, 2);
    assert.ok(lightingRec.includes("feeder lines"));
});
