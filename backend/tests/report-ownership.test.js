const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("crypto");
const jwt = require("jsonwebtoken");

const request = require("supertest");
const app = require("../server");
const pool = require("../db/database");

const uniqueId = randomUUID();
const category = "ROAD";
const password = "TestPassword@123";

const citizens = [
    {
        name: "Day 69 Citizen A",
        email: `day69-a-${uniqueId}@example.com`,
        title: `Day 69 Report A ${uniqueId}`
    },
    {
        name: "Day 69 Citizen B",
        email: `day69-b-${uniqueId}@example.com`,
        title: `Day 69 Report B ${uniqueId}`
    }
];

const adminToken = jwt.sign(
    { userId: 3, role: "ADMIN" },
    process.env.JWT_SECRET,
    { expiresIn: "5m" }
);

async function findUnusedCoordinates() {
    for (let attempt = 0; attempt < 10; attempt++) {
        const latitude = Number(
            (-70 + Math.random() * 10).toFixed(6)
        );

        const longitude = Number(
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
                latitude - 0.001,
                latitude + 0.001,
                longitude - 0.001,
                longitude + 0.001
            ]
        );

        if (result.rows.length === 0) {
            return { latitude, longitude };
        }
    }

    throw new Error("Could not find unused test coordinates");
}

async function setupCitizen(citizen) {
    const coordinates = await findUnusedCoordinates();

    citizen.latitude = coordinates.latitude;
    citizen.longitude = coordinates.longitude;

    const registration = await request(app)
        .post("/api/auth/register")
        .send({
            name: citizen.name,
            email: citizen.email,
            password
        });

    assert.equal(
        registration.status,
        201,
        `Registration failed: ${JSON.stringify(registration.body)}`
    );

    citizen.userId = registration.body.data.id;

    citizen.token = jwt.sign(
        {
            userId: citizen.userId,
            role: "CITIZEN"
        },
        process.env.JWT_SECRET,
        { expiresIn: "5m" }
    );

    const report = await request(app)
        .post("/api/reports")
        .set("Authorization", `Bearer ${citizen.token}`)
        .send({
            title: citizen.title,
            description: "Day 69 report ownership integration test.",
            category,
            latitude: citizen.latitude,
            longitude: citizen.longitude,
            image: ""
        });

    citizen.issueId = report.body?.data?.civic_issue_id;

    assert.equal(
        report.status,
        201,
        `Report creation failed: ${JSON.stringify(report.body)}`
    );

    citizen.reportId = report.body.data.id;

    assert.ok(citizen.reportId);
    assert.ok(citizen.issueId);
}

before(async () => {
    // Create two separate citizens and their reports.
    for (const citizen of citizens) {
        await setupCitizen(citizen);
    }
});

after(async () => {
    try {
        for (const citizen of citizens) {
            if (citizen.userId == null) {
                continue;
            }

            const deletedReports = await pool.query(
                `DELETE FROM reports
                 WHERE user_id = $1 AND title = $2
                 RETURNING civic_issue_id`,
                [citizen.userId, citizen.title]
            );

            const issueIds = new Set([
                ...deletedReports.rows.map(
                    row => String(row.civic_issue_id)
                ),
                ...(citizen.issueId != null
                    ? [String(citizen.issueId)]
                    : [])
            ]);

            for (const issueId of issueIds) {
                // Delete only the exact test issue if no other
                // reports, evidence or history reference it.
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
                        citizen.title,
                        category,
                        citizen.latitude,
                        citizen.longitude
                    ]
                );
            }

            await pool.query(
                "DELETE FROM users WHERE id = $1",
                [citizen.userId]
            );
        }
    } finally {
        await pool.end();
    }
});

test("citizen A can access their own report", async () => {
    const citizen = citizens[0];

    const response = await request(app)
        .get(`/api/my-reports/${citizen.reportId}`)
        .set("Authorization", `Bearer ${citizen.token}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);

    assert.equal(
        Number(response.body.data.report_id),
        Number(citizen.reportId)
    );

    assert.equal(
        Number(response.body.data.user_id),
        Number(citizen.userId)
    );
});

test("citizen B can access their own report", async () => {
    const citizen = citizens[1];

    const response = await request(app)
        .get(`/api/my-reports/${citizen.reportId}`)
        .set("Authorization", `Bearer ${citizen.token}`);

    assert.equal(response.status, 200);

    assert.equal(
        Number(response.body.data.user_id),
        Number(citizen.userId)
    );
});

test("citizen A cannot access citizen B's report", async () => {
    const citizenA = citizens[0];
    const citizenB = citizens[1];

    const response = await request(app)
        .get(`/api/my-reports/${citizenB.reportId}`)
        .set("Authorization", `Bearer ${citizenA.token}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.message, "Report not found");
});

test("citizen B cannot access citizen A's report", async () => {
    const citizenA = citizens[0];
    const citizenB = citizens[1];

    const response = await request(app)
        .get(`/api/my-reports/${citizenA.reportId}`)
        .set("Authorization", `Bearer ${citizenB.token}`);

    assert.equal(response.status, 404);
    assert.equal(response.body.message, "Report not found");
});

test("citizen report list does not expose another citizen's report", async () => {
    const citizenA = citizens[0];
    const citizenB = citizens[1];

    const response = await request(app)
        .get("/api/my-reports")
        .set("Authorization", `Bearer ${citizenA.token}`);

    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body.data));

    const ownReport = response.body.data.find(
        report =>
            Number(report.report_id) === Number(citizenA.reportId)
    );

    const otherReport = response.body.data.find(
        report =>
            Number(report.report_id) === Number(citizenB.reportId)
    );

    assert.ok(ownReport, "Citizen A should see their own report");
    assert.equal(otherReport, undefined);
});

test("admin cannot access citizen-only report details", async () => {
    const citizen = citizens[0];

    const response = await request(app)
        .get(`/api/my-reports/${citizen.reportId}`)
        .set("Authorization", `Bearer ${adminToken}`);

    assert.equal(response.status, 403);
    assert.equal(response.body.message, "Access denied");
});

test("unauthenticated user cannot access individual reports", async () => {
    const citizen = citizens[0];

    const response = await request(app)
        .get(`/api/my-reports/${citizen.reportId}`);

    assert.equal(response.status, 401);
    assert.equal(response.body.message, "Access token required");
});
