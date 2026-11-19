const test = require("node:test");
const assert = require("node:assert/strict");
const {
    sendEmail,
    getSentEmails,
    clearSentEmails,
    sendReportConfirmationEmail,
    sendStatusUpdateEmail,
    sendResolutionEmail,
    sendOfficerAssignmentEmail
} = require("../services/mailService");

test.beforeEach(() => {
    clearSentEmails();
});

test("sendEmail rejects invalid or missing recipient email", async () => {
    const res = await sendEmail({ to: "not-an-email", subject: "Test", text: "Hello" });
    assert.equal(res.success, false);
    assert.equal(getSentEmails().length, 0);
});

test("sendReportConfirmationEmail buffers formatted grievance email with tracking link", async () => {
    const res = await sendReportConfirmationEmail({
        email: "citizen@example.com",
        name: "Aarav Sharma",
        reportId: 101,
        issueId: 42,
        title: "Deep pothole outside school",
        category: "ROAD"
    });

    assert.equal(res.success, true);
    const sent = getSentEmails();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "citizen@example.com");
    assert.ok(sent[0].subject.includes("#42"));
    assert.ok(sent[0].html.includes("Aarav Sharma"));
    assert.ok(sent[0].html.includes("/track/42"));
});

test("sendStatusUpdateEmail sends status transition notification", async () => {
    const res = await sendStatusUpdateEmail({
        email: "citizen@example.com",
        name: "Priya",
        issueId: 42,
        title: "Leaking pipe",
        status: "IN_PROGRESS",
        note: "Crew deployed on site"
    });

    assert.equal(res.success, true);
    const sent = getSentEmails();
    assert.equal(sent.length, 1);
    assert.ok(sent[0].subject.includes("IN_PROGRESS"));
    assert.ok(sent[0].html.includes("Crew deployed on site"));
});

test("sendResolutionEmail prompts citizen for rating and confirmation", async () => {
    const res = await sendResolutionEmail({
        email: "citizen@example.com",
        name: "Rohan",
        issueId: 42,
        title: "Overflowing garbage bin",
        note: "Dumpster cleared and disinfected."
    });

    assert.equal(res.success, true);
    const sent = getSentEmails();
    assert.equal(sent.length, 1);
    assert.ok(sent[0].subject.includes("Please Rate Your Resolution"));
    assert.ok(sent[0].html.includes("Rate Resolution & Confirm"));
});

test("sendOfficerAssignmentEmail alerts field officer with priority score", async () => {
    const res = await sendOfficerAssignmentEmail({
        email: "officer@municipality.gov",
        officerName: "Inspector Verma",
        issueId: 88,
        title: "Dangling high-voltage wire",
        priorityScore: 95,
        department: "Street Lighting"
    });

    assert.equal(res.success, true);
    const sent = getSentEmails();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "officer@municipality.gov");
    assert.ok(sent[0].subject.includes("Priority: 95"));
    assert.ok(sent[0].html.includes("Inspector Verma"));
});
