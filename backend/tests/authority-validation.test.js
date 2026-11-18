const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
    updateIssueStatusSchema,
    assignIssueSchema,
    issueFilterSchema
} = require("../validation/issueValidation");

test("updateIssueStatusSchema accepts valid status transitions and note", () => {
    const validStatuses = ["OPEN", "IN_PROGRESS", "ON_HOLD", "RESOLVED", "REJECTED", "REOPENED"];

    for (const status of validStatuses) {
        const { error, value } = updateIssueStatusSchema.validate({
            status,
            note: "Testing status change explanation."
        });
        assert.equal(error, undefined);
        assert.equal(value.status, status);
    }
});

test("updateIssueStatusSchema rejects unknown statuses", () => {
    const { error } = updateIssueStatusSchema.validate({
        status: "INVALID_STATUS"
    });
    assert.ok(error);
});

test("assignIssueSchema validates assignment payload", () => {
    const valid = assignIssueSchema.validate({
        assigned_to: 42,
        notes: "Please inspect site within 24 hours."
    });
    assert.equal(valid.error, undefined);
    assert.equal(valid.value.assigned_to, 42);

    const invalid = assignIssueSchema.validate({
        assigned_to: -5
    });
    assert.ok(invalid.error);
});

test("issueFilterSchema accepts extended statuses and department_id", () => {
    const { error, value } = issueFilterSchema.validate({
        status: "ON_HOLD",
        department_id: 3,
        page: 2,
        limit: 20
    });
    assert.equal(error, undefined);
    assert.equal(value.status, "ON_HOLD");
    assert.equal(value.department_id, 3);
});
