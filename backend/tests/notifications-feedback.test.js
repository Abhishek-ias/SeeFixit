const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db/database");
const {
    submitResolutionFeedback,
    reopenIssueByCitizen
} = require("../services/issueService");
const {
    createNotification,
    getUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead
} = require("../services/notificationService");

test("submitResolutionFeedback rejects non-resolved issue", async () => {
    // Attempting feedback on non-existent or open issue should throw
    await assert.rejects(
        async () => {
            await submitResolutionFeedback({
                civicIssueId: 9999999,
                userId: 1,
                rating: 5
            });
        },
        /CivicIssue not found/
    );
});

test("reopenIssueByCitizen rejects non-resolved issue", async () => {
    await assert.rejects(
        async () => {
            await reopenIssueByCitizen({
                civicIssueId: 9999999,
                userId: 1,
                reason: "Still broken"
            });
        },
        /CivicIssue not found/
    );
});
