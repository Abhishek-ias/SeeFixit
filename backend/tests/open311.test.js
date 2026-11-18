const test = require("node:test");
const assert = require("node:assert/strict");
const open311Routes = require("../routes/open311Routes");

test("Open311 services list conforms to GeoReport v2 schema", () => {
    const services = open311Routes.SERVICES;
    assert.ok(Array.isArray(services));
    assert.equal(services.length, 4);

    const codes = services.map(s => s.service_code);
    assert.deepEqual(codes.sort(), ["LIGHTING", "ROAD", "SANITATION", "WATER"].sort());

    services.forEach(s => {
        assert.ok(s.service_code);
        assert.ok(s.service_name);
        assert.ok(s.description);
        assert.equal(typeof s.metadata, "boolean");
        assert.equal(s.type, "realtime");
    });
});
