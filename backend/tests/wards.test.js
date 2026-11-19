const test = require("node:test");
const assert = require("node:assert/strict");
const { findWardByCoordinates } = require("../services/wardService");

test("findWardByCoordinates returns null for invalid or missing coordinates", async () => {
    const res1 = await findWardByCoordinates(null, null);
    assert.equal(res1, null);

    const res2 = await findWardByCoordinates("invalid", "coords");
    assert.equal(res2, null);

    const res3 = await findWardByCoordinates(0, 0);
    // 0, 0 has 0 as falsy in check, returns null
    assert.equal(res3, null);
});
