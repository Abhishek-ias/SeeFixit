const { test } = require("node:test");
const assert = require("node:assert/strict");
const { analyzeText } = require("../services/aiService");

test("AI classifies deep road pothole as ROAD category with high severity", () => {
    const analysis = analyzeText(
        "Huge crater and pothole on 80ft road",
        "Two wheelers are skidding and deep pothole is causing severe accident risk near the curve."
    );

    assert.equal(analysis.predictedCategory, "ROAD");
    assert.equal(analysis.recommendedDepartment, "Road Department");
    assert.ok(analysis.confidence >= 0.70);
    assert.equal(analysis.safetyHazardDetected, true);
    assert.equal(analysis.severity, "HIGH");
    assert.ok(analysis.severityScore >= 80);
});

test("AI classifies overflowing garbage bin as SANITATION category", () => {
    const analysis = analyzeText(
        "Garbage pile dumped on sidewalk",
        "Municipal trash bin has been overflowing for days with foul smell and stray animals."
    );

    assert.equal(analysis.predictedCategory, "SANITATION");
    assert.equal(analysis.recommendedDepartment, "Sanitation Department");
    assert.ok(analysis.confidence >= 0.70);
});

test("AI detects CRITICAL electrical hazard for dangling live wire", () => {
    const analysis = analyzeText(
        "Dangling live wire sparking on footpath",
        "Street light wire snapped and electric shock hazard is present."
    );

    assert.equal(analysis.safetyHazardDetected, true);
    assert.equal(analysis.hazardType, "ELECTRICAL_HAZARD");
    assert.equal(analysis.severity, "CRITICAL");
    assert.ok(analysis.severityScore >= 90);
    assert.match(analysis.suggestedAction, /IMMEDIATE DANGER/i);
});

test("AI classifies drinking water pipe burst as WATER category", () => {
    const analysis = analyzeText(
        "Underground pipeline burst",
        "Fresh drinking water leaking onto the main avenue causing low pressure in homes."
    );

    assert.equal(analysis.predictedCategory, "WATER");
    assert.equal(analysis.recommendedDepartment, "Water Department");
    assert.ok(analysis.confidence >= 0.70);
});

test("AI produces explainable structured summary and action recommendation", () => {
    const analysis = analyzeText(
        "Broken street lamp pole",
        "Lamp bulb is shattered and stretch is completely dark at night."
    );

    assert.equal(analysis.predictedCategory, "LIGHTING");
    assert.ok(analysis.summary.length > 20);
    assert.ok(analysis.suggestedAction.length > 10);
    assert.equal(analysis.modelProvider, "heuristic-civic-ontology");
});
