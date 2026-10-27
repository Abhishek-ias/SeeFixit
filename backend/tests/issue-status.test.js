const { test, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");
const jwt = require("jsonwebtoken");

const request = require("supertest");
const app = require("../server");
const pool = require("../db/database");

const uniqueId = randomUUID();
const testEmail = `day65-${uniqueId}@example.com`;
const testPassword = "TestPassword@123";
const testTitle = `Day 65 Issue ${uniqueId}`;
const category = "ROAD";

let testUserId;
let latitude;
let longitude;
let createdIssueId;
let citizenToken;
let adminToken;

async function findUnusedCoordinates() {
    for (let attempt = 0; attempt < 10; attempt++) {
        const candidateLatitude = Number(
            (-70 + Math.random() * 10).toFixed(6)
        );

        const candidateLongitude = Number(
            (100 + Math.random() * 10).toFixed(6)
        );

        const result = await pool.query(
            `SELECT id
             FROM civic_issues
             WHERE category = $1
               AND latitude BETWEEN $2 AND $3
               AND longitude BETWEEN $4 AND $5
             LIMIT 1`,
            [
                category,
                candidateLatitude - 0.001,
                candidateLatitude + 0.001,
                candidateLongitude - 0.001,
                candidateLongitude + 0.001
            ]
        );

        if (result.rows.length === 0) {
            latitude = candidateLatitude;
            longitude = candidateLongitude;
            return;
        }
    }

    throw new Error("Could not find unused test coordinates");
}

function reportPayload() {
    return {
        title: testTitle,
        description: "Day 65 automated issue status integration test.",
        category,
        latitude,
        longitude,
        image: ""
    };
}

function issueUrl() {
    return `/api/issues/${createdIssueId}`;
}

async function updateStatus(status) {
    return request(app)
        .patch(`${issueUrl()}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status });
}

before(async () => {
    await findUnusedCoordinates();

    const registration = await request(app)
        .post("/api/auth/register")
        .send({
            name: "Day 65 Test User",
            email: testEmail,
            password: testPassword
        });

    assert.equal(
        registration.status,
        201,
        `Registration failed: ${JSON.stringify(registration.body)}`
    );

    testUserId = registration.body.data.id;

    citizenToken = jwt.sign(
        { userId: testUserId, role: "CITIZEN" },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
    );

    const report = await request(app)
        .post("/api/reports")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send(reportPayload());

    assert.equal(
        report.status,
        201,
        `Report creation failed: ${JSON.stringify(report.body)}`
    );

    createdIssueId = report.body.data.civic_issue_id;
    assert.ok(createdIssueId, "A civic issue should be created");

    // Promote only this temporary test account to ADMIN.
    await pool.query(
        "UPDATE users SET role = $1 WHERE id = $2",
        ["ADMIN", testUserId]
    );

    adminToken = jwt.sign(
        { userId: testUserId, role: "ADMIN" },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
    );
});

beforeEach(async () => {
    assert.ok(createdIssueId, "Test issue must exist");

    // Isolate each test from previous status changes.
    await pool.query(
        "DELETE FROM issue_status_history WHERE civic_issue_id = $1",
        [createdIssueId]
    );

    await pool.query(
        "DELETE FROM issue_evidence WHERE civic_issue_id = $1",
        [createdIssueId]
    );

    await pool.query(
        "UPDATE civic_issues SET status = $1 WHERE id = $2",
        ["OPEN", createdIssueId]
    );
});

after(async () => {
    try {
        let issueIdForCleanup = createdIssueId;

        if (testUserId != null) {
            const reportLookup = await pool.query(
                `SELECT civic_issue_id
                 FROM reports
                 WHERE user_id = $1 AND title = $2
                 ORDER BY id DESC
                 LIMIT 1`,
                [testUserId, testTitle]
            );

            if (reportLookup.rows.length > 0) {
                issueIdForCleanup =
                    reportLookup.rows[0].civic_issue_id;
            }
        }

        if (issueIdForCleanup != null) {
            await pool.query(
                "DELETE FROM issue_status_history WHERE civic_issue_id = $1",
                [issueIdForCleanup]
            );

            await pool.query(
                "DELETE FROM issue_evidence WHERE civic_issue_id = $1",
                [issueIdForCleanup]
            );
        }

        if (testUserId != null) {
            await pool.query(
                "DELETE FROM reports WHERE user_id = $1 AND title = $2",
                [testUserId, testTitle]
            );
        }

        if (issueIdForCleanup != null) {
            // Delete only our own issue, and only if nothing else
            // references it.
            await pool.query(
                `DELETE FROM civic_issues AS ci
                 WHERE ci.id = $1
                   AND ci.title = $2
                   AND ci.category = $3
                   AND ci.latitude = $4
                   AND ci.longitude = $5
                   AND NOT EXISTS (
                       SELECT 1 FROM reports r
                       WHERE r.civic_issue_id = ci.id
                   )
                   AND NOT EXISTS (
                       SELECT 1 FROM issue_evidence e
                       WHERE e.civic_issue_id = ci.id
                   )
                   AND NOT EXISTS (
                       SELECT 1 FROM issue_status_history h
                       WHERE h.civic_issue_id = ci.id
                   )`,
                [
                    issueIdForCleanup,
                    testTitle,
                    category,
                    latitude,
                    longitude
                ]
            );
        }

        if (testUserId != null) {
            await pool.query(
                "DELETE FROM users WHERE id = $1",
                [testUserId]
            );
        }
    } finally {
        await pool.end();
    }
});

test("OPEN issue cannot move directly to RESOLVED", async () => {
    const response = await updateStatus("RESOLVED");

    assert.equal(response.status, 400);
    assert.equal(
        response.body.message,
        "OPEN issue can only move to IN_PROGRESS"
    );
});

test("admin can move OPEN issue to IN_PROGRESS and record history", async () => {
    const response = await updateStatus("IN_PROGRESS");

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(response.body.data.issue.status, "IN_PROGRESS");
    assert.equal(response.body.data.history.status, "IN_PROGRESS");
    assert.equal(
        Number(response.body.data.history.civic_issue_id),
        Number(createdIssueId)
    );
    assert.equal(
        Number(response.body.data.history.changed_by),
        Number(testUserId)
    );

    const historyResponse = await request(app)
        .get(`${issueUrl()}/history`)
        .set("Authorization", `Bearer ${citizenToken}`);

    assert.equal(historyResponse.status, 200);
    assert.ok(Array.isArray(historyResponse.body.data));
    assert.equal(historyResponse.body.data.length, 1);
    assert.equal(historyResponse.body.data[0].status, "IN_PROGRESS");
});

test("IN_PROGRESS issue cannot return to OPEN", async () => {
    const firstResponse = await updateStatus("IN_PROGRESS");
    assert.equal(firstResponse.status, 200);

    const response = await updateStatus("OPEN");

    assert.equal(response.status, 400);
    assert.equal(
        response.body.message,
        "IN_PROGRESS issue can only move to RESOLVED"
    );
});

test("resolved issue cannot change status", async () => {
    await pool.query(
        "UPDATE civic_issues SET status = $1 WHERE id = $2",
        ["RESOLVED", createdIssueId]
    );

    const response = await updateStatus("IN_PROGRESS");

    assert.equal(response.status, 400);
    assert.equal(
        response.body.message,
        "Resolved issue cannot change status"
    );
});

test("issue cannot be resolved without evidence", async () => {
    const progressResponse = await updateStatus("IN_PROGRESS");
    assert.equal(progressResponse.status, 200);

    const response = await updateStatus("RESOLVED");

    assert.equal(response.status, 400);
    assert.equal(
        response.body.message,
        "Evidence is required before resolving the issue"
    );
});

test("admin can upload and retrieve issue evidence", async () => {
    const image = "https://example.com/day65-evidence.jpg";
    const description = "Evidence uploaded by the Day 65 integration test.";

    const uploadResponse = await request(app)
        .post(`${issueUrl()}/evidence`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ image, description });

    assert.equal(uploadResponse.status, 201);
    assert.equal(uploadResponse.body.success, true);
    assert.equal(uploadResponse.body.data.image, image);
    assert.equal(uploadResponse.body.data.description, description);
    assert.equal(
        Number(uploadResponse.body.data.civic_issue_id),
        Number(createdIssueId)
    );

    const evidenceResponse = await request(app)
        .get(`${issueUrl()}/evidence`)
        .set("Authorization", `Bearer ${citizenToken}`);

    assert.equal(evidenceResponse.status, 200);
    assert.ok(Array.isArray(evidenceResponse.body.data));

    const savedEvidence = evidenceResponse.body.data.find(
        evidence => evidence.image === image
    );

    assert.ok(savedEvidence, "Uploaded evidence should be retrievable");
    assert.equal(savedEvidence.description, description);
    assert.equal(
        Number(savedEvidence.uploaded_by),
        Number(testUserId)
    );
});

test("issue can be resolved after evidence is uploaded", async () => {
    const progressResponse = await updateStatus("IN_PROGRESS");
    assert.equal(progressResponse.status, 200);

    const uploadResponse = await request(app)
        .post(`${issueUrl()}/evidence`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
            image: "https://example.com/day65-resolution.jpg",
            description: "Resolution evidence for the test issue."
        });

    assert.equal(uploadResponse.status, 201);

    const resolveResponse = await updateStatus("RESOLVED");

    assert.equal(resolveResponse.status, 200);
    assert.equal(resolveResponse.body.success, true);
    assert.equal(resolveResponse.body.data.issue.status, "RESOLVED");
    assert.equal(resolveResponse.body.data.history.status, "RESOLVED");

    const historyResponse = await request(app)
        .get(`${issueUrl()}/history`)
        .set("Authorization", `Bearer ${citizenToken}`);

    assert.equal(historyResponse.status, 200);

    const statuses = historyResponse.body.data.map(item => item.status);

    assert.equal(statuses.length, 2);
    assert.ok(statuses.includes("IN_PROGRESS"));
    assert.ok(statuses.includes("RESOLVED"));
});
