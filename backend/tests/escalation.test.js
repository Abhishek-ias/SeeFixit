const test = require("node:test");
const assert = require("node:assert/strict");
const {
    runSlaEscalationScan,
    getEscalationStats,
    getEscalatedIssues
} = require("../services/escalationService");

test("runSlaEscalationScan executes cleanly and returns scan audit structure", async () => {
    const result = await runSlaEscalationScan();
    assert.equal(typeof result.totalScanned, "number");
    assert.equal(typeof result.newlyEscalatedCount, "number");
    assert.ok(Array.isArray(result.escalatedIssues));
});

test("getEscalationStats returns integer counts for escalation levels", async () => {
    const stats = await getEscalationStats();
    assert.equal(typeof stats.total_escalated, "number");
    assert.equal(typeof stats.critical_escalated, "number");
    assert.equal(typeof stats.level1_escalated, "number");
    assert.ok(stats.total_escalated >= 0);
});

test("getEscalatedIssues returns array of escalated items", async () => {
    const list = await getEscalatedIssues({ limit: 10, offset: 0 });
    assert.ok(Array.isArray(list));
    if (list.length > 0) {
        const item = list[0];
        assert.ok(item.id);
        assert.equal(item.is_escalated, true);
        assert.ok(item.escalation_level >= 1);
    }
});
