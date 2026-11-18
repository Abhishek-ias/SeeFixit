const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db/database");
const {
    getCategories,
    createCategory,
    getMunicipalAnalytics
} = require("../services/issueService");

test("getCategories returns active categories with SLA hours and icons", async () => {
    const categories = await getCategories();
    assert.ok(Array.isArray(categories));
    assert.ok(categories.length >= 4);

    const codes = categories.map(c => c.code);
    assert.ok(codes.includes("ROAD"));
    assert.ok(codes.includes("SANITATION"));
    assert.ok(codes.includes("WATER"));
    assert.ok(codes.includes("LIGHTING"));

    const road = categories.find(c => c.code === "ROAD");
    assert.equal(road.sla_hours, 48);
    assert.equal(road.icon, "🚧");
    assert.ok(road.department_name);
});

test("createCategory rejects missing department", async () => {
    await assert.rejects(
        async () => {
            await createCategory({
                code: "PARK_MAINT",
                name: "Parks & Greenery",
                departmentId: 999999
            });
        },
        /Department not found/
    );
});

test("getMunicipalAnalytics computes SLA compliance and satisfaction metrics", async () => {
    const analytics = await getMunicipalAnalytics();
    assert.ok(analytics);
    assert.ok(Array.isArray(analytics.departments));
    assert.ok(analytics.overallSla);
    assert.ok(analytics.satisfaction);
    assert.ok(analytics.hazards);
});
