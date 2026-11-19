const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db/database");
const { findWardByCoordinates, getAllWards, getWardIssues } = require("../services/wardService");

test("findWardByCoordinates returns null for invalid or missing coordinates", async () => {
    const res1 = await findWardByCoordinates(null, null);
    assert.equal(res1, null);

    const res2 = await findWardByCoordinates("invalid", "coords");
    assert.equal(res2, null);

    const res3 = await findWardByCoordinates(0, 0);
    assert.equal(res3, null);
});

test("getAllWards returns registered municipal wards with geographic boundaries", async () => {
    const wards = await getAllWards();
    assert.ok(Array.isArray(wards));
    assert.ok(wards.length >= 7, "Should include seeded Bangalore pilot wards");

    const koramangala = wards.find((w) => w.ward_number === "WARD-102");
    assert.ok(koramangala, "Ward 102 (Koramangala) should exist");
    assert.equal(koramangala.name, "Koramangala");
    assert.ok(koramangala.min_lat !== undefined && koramangala.max_lat !== undefined);
});

test("getWardIssues retrieves paginated issues within a municipal ward", async () => {
    const wards = await getAllWards();
    const ward = wards[0];
    assert.ok(ward?.id);

    const feed = await getWardIssues(ward.id, { page: 1, limit: 10 });
    assert.ok(Array.isArray(feed.issues));
    assert.ok(feed.pagination);
    assert.equal(feed.pagination.page, 1);
    assert.equal(feed.pagination.limit, 10);
    assert.ok(typeof feed.pagination.total === "number");
});
