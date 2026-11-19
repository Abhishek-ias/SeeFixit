const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db/database");
const { toggleIssueUpvote, getIssueUpvoteStatus } = require("../services/issueService");

test("Community Corroboration Engine: upvotes and priority adjustment", async () => {
    // 1. Setup a test user and test issue
    const userRes = await pool.query(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES ('Corroboration Tester', 'corrob_test_${Date.now()}@example.com', 'hashedpass123', 'CITIZEN')
        RETURNING id;
    `);
    const userId = userRes.rows[0].id;

    const deptRes = await pool.query("SELECT id FROM departments LIMIT 1;");
    const deptId = deptRes.rows[0].id;

    const issueRes = await pool.query(`
        INSERT INTO civic_issues (title, category, status, priority_score, upvote_count, latitude, longitude, department_id)
        VALUES ('Community Pothole Test', 'ROAD', 'OPEN', 50, 0, 12.9352, 77.6245, $1)
        RETURNING id;
    `, [deptId]);
    const issueId = issueRes.rows[0].id;

    try {
        // Initial status: upvote count 0, upvoted false
        const initialStatus = await getIssueUpvoteStatus(userId, issueId);
        assert.equal(initialStatus.upvoted, false);
        assert.equal(initialStatus.upvote_count, 0);

        // 2. Upvote (+1)
        const upvoteRes = await toggleIssueUpvote(userId, issueId);
        assert.equal(upvoteRes.upvoted, true);
        assert.equal(upvoteRes.upvote_count, 1);
        assert.equal(upvoteRes.priority_score, 52); // +2 boost

        // Check status query
        const statusAfterUpvote = await getIssueUpvoteStatus(userId, issueId);
        assert.equal(statusAfterUpvote.upvoted, true);
        assert.equal(statusAfterUpvote.upvote_count, 1);

        // 3. Toggle again to remove upvote (-1)
        const removeRes = await toggleIssueUpvote(userId, issueId);
        assert.equal(removeRes.upvoted, false);
        assert.equal(removeRes.upvote_count, 0);
        assert.equal(removeRes.priority_score, 50); // -2 restored

        const statusAfterRemoval = await getIssueUpvoteStatus(userId, issueId);
        assert.equal(statusAfterRemoval.upvoted, false);
        assert.equal(statusAfterRemoval.upvote_count, 0);
    } finally {
        // Clean up
        await pool.query("DELETE FROM civic_issues WHERE id = $1;", [issueId]);
        await pool.query("DELETE FROM users WHERE id = $1;", [userId]);
    }
});
