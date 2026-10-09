const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");
const jwt = require("jsonwebtoken");

const request = require("supertest");
const app = require("../server");
const pool = require("../db/database");

const uniqueId = randomUUID();

const testEmail = `day63-${uniqueId}@example.com`;
const testPassword = "TestPassword@123";
const testTitle = `Day 63 Report ${uniqueId}`;

let testUserId;
let latitude;
let longitude;
let createdReportId;
let createdIssueId;

const category = "ROAD";

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

function validReportPayload() {
    return {
        title: testTitle,
        description: "Automated integration test for a civic road issue.",
        category,
        latitude,
        longitude,
        image: ""
    };
}

let citizenToken;

before(async () => {
    const response = await request(app)
        .post("/api/auth/register")
        .send({
            name: "Day 63 Test User",
            email: testEmail,
            password: testPassword
        });

    assert.equal(response.status, 201);

    testUserId = response.body.data.id;

    citizenToken = jwt.sign(
        {
            userId: testUserId,
            role: "CITIZEN"
        },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
    );

    await findUnusedCoordinates();
});

after(async () => {
    try {
        if (testUserId) {
            const deletedReports = await pool.query(
                `DELETE FROM reports
                 WHERE user_id = $1 AND title = $2
                 RETURNING civic_issue_id`,
                [testUserId, testTitle]
            );

            const issueId =
                deletedReports.rows[0]?.civic_issue_id ??
                createdIssueId;

            if (issueId != null) {
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
                        issueId,
                        testTitle,
                        category,
                        latitude,
                        longitude
                    ]
                );
            }

            await pool.query(
                "DELETE FROM users WHERE id = $1",
                [testUserId]
            );
        }
    } finally {
        await pool.end();
    }
});

test("report creation rejects invalid details", async () => {
    const response = await request(app)
        .post("/api/reports")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send({
            title: "Bad",
            description: "Short",
            category: "INVALID",
            latitude: 91,
            longitude: 181
        });

    assert.equal(response.status, 400);
    assert.equal(response.body.error, "Validation failed");
    assert.ok(Array.isArray(response.body.details));
});

test("report creation requires authentication", async () => {
    const response = await request(app)
        .post("/api/reports")
        .send(validReportPayload());

    assert.equal(response.status, 401);
    assert.equal(response.body.message, "Access token required");
    assert.ok(response.headers["x-request-id"]);
});

test("citizen can create a report", async () => {
    const response = await request(app)
        .post("/api/reports")
        .set("Authorization", `Bearer ${citizenToken}`)
        .send(validReportPayload());

    if (response.body?.data?.id != null) {
        createdReportId = response.body.data.id;
        createdIssueId = response.body.data.civic_issue_id;
    }

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.equal(response.body.message, "Report created successfully");
    assert.equal(response.body.data.title, testTitle);
    assert.equal(response.body.data.category, category);
    assert.equal(Number(response.body.data.user_id), testUserId);
    assert.ok(response.body.data.civic_issue_id);
    assert.ok(response.headers["x-request-id"]);
});

test("citizen can retrieve their own report", async () => {
    assert.ok(createdReportId, "The report creation test must succeed first");

    const response = await request(app)
        .get("/api/my-reports")
        .set("Authorization", `Bearer ${citizenToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.ok(Array.isArray(response.body.data));

    const createdReport = response.body.data.find(
        report => Number(report.report_id) === Number(createdReportId)
    );

    assert.ok(createdReport, "The newly created report should be listed");
    assert.equal(createdReport.title, testTitle);
    assert.ok(response.headers["x-request-id"]);
});