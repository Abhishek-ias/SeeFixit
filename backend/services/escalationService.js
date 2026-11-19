const pool = require("../db/database");
const logger = require("../utils/logger");
const { createNotification } = require("./notificationService");
const { sendEscalationAlertEmail } = require("./mailService");

/**
 * Defensive schema guard ensuring SLA escalation columns exist.
 */
async function ensureEscalationSchema(db = pool) {
    try {
        await db.query(`
            ALTER TABLE civic_issues
            ADD COLUMN IF NOT EXISTS is_escalated BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP WITH TIME ZONE NULL,
            ADD COLUMN IF NOT EXISTS escalation_level INT NOT NULL DEFAULT 0;
            CREATE INDEX IF NOT EXISTS idx_civic_issues_is_escalated ON civic_issues(is_escalated);
            CREATE INDEX IF NOT EXISTS idx_civic_issues_escalation_level ON civic_issues(escalation_level);
        `);
    } catch {
        // Non-blocking schema check
    }
}

/**
 * Runs an SLA escalation audit sweep across all active civic grievances.
 * Flags overdue complaints, logs audit entries, and dispatches supervisory alerts.
 */
async function runSlaEscalationScan() {
    await ensureEscalationSchema();
    const client = await pool.connect();

    try {
        const scanQuery = `
            SELECT
                ci.id,
                ci.title,
                ci.category,
                ci.status,
                ci.created_at,
                ci.department_id,
                ci.priority_score,
                d.name AS department_name,
                COALESCE(c.sla_hours, 72) AS sla_hours,
                ROUND(EXTRACT(EPOCH FROM (NOW() - ci.created_at)) / 3600) AS elapsed_hours,
                (
                    SELECT ia.assigned_to
                    FROM issue_assignments ia
                    WHERE ia.civic_issue_id = ci.id
                    ORDER BY ia.assigned_at DESC LIMIT 1
                ) AS assigned_to_user_id
            FROM civic_issues ci
            JOIN departments d ON ci.department_id = d.id
            LEFT JOIN categories c ON ci.category = c.code
            WHERE ci.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'REOPENED')
              AND (NOW() - ci.created_at) > (COALESCE(c.sla_hours, 72) || ' hours')::interval
              AND ci.is_escalated = FALSE;
        `;

        const res = await client.query(scanQuery);
        const breachedIssues = res.rows;
        const escalated = [];

        for (const item of breachedIssues) {
            const overdueHours = Math.max(1, Number(item.elapsed_hours) - Number(item.sla_hours));
            const escalationLevel = Number(item.elapsed_hours) >= (Number(item.sla_hours) * 2) ? 2 : 1;

            await client.query("BEGIN");

            // 1. Mark issue as escalated
            await client.query(`
                UPDATE civic_issues
                SET is_escalated = TRUE,
                    escalated_at = CURRENT_TIMESTAMP,
                    escalation_level = $1
                WHERE id = $2;
            `, [escalationLevel, item.id]);

            // 2. Record in audit_logs
            await client.query(`
                INSERT INTO audit_logs (
                    entity_type,
                    entity_id,
                    action,
                    performed_by,
                    details
                ) VALUES ($1, $2, $3, $4, $5);
            `, [
                "CIVIC_ISSUE",
                item.id,
                "SLA_ESCALATED",
                item.assigned_to_user_id || null,
                JSON.stringify({
                    sla_hours: item.sla_hours,
                    overdue_hours: overdueHours,
                    escalation_level: escalationLevel
                })
            ]);

            await client.query("COMMIT");

            escalated.push({
                id: item.id,
                title: item.title,
                department: item.department_name,
                slaHours: item.sla_hours,
                overdueHours,
                escalationLevel,
                assignedToUserId: item.assigned_to_user_id
            });

            // 3. Asynchronously dispatch in-app notifications and outbound alert emails
            (async () => {
                try {
                    // Alert assigned officer (if assigned)
                    if (item.assigned_to_user_id) {
                        await createNotification({
                            userId: item.assigned_to_user_id,
                            civicIssueId: item.id,
                            title: `🚨 URGENT: Issue #${item.id} SLA Breached`,
                            message: `Ticket "${item.title}" is overdue by ${overdueHours} hours. Immediate action required.`,
                            type: "STATUS_CHANGE"
                        });

                        const userRes = await pool.query(
                            "SELECT email, name FROM users WHERE id = $1",
                            [item.assigned_to_user_id]
                        );

                        if (userRes.rows.length > 0 && userRes.rows[0].email) {
                            sendEscalationAlertEmail({
                                email: userRes.rows[0].email,
                                officerName: userRes.rows[0].name,
                                issueId: item.id,
                                title: item.title,
                                department: item.department_name,
                                slaHours: item.sla_hours,
                                overdueHours,
                                escalationLevel
                            }).catch(() => {});
                        }
                    }

                    // Alert supervisory department admins
                    const adminRes = await pool.query(`
                        SELECT u.email, u.name
                        FROM users u
                        JOIN department_members dm ON u.id = dm.user_id
                        WHERE dm.department_id = $1 AND u.role = 'ADMIN'
                        LIMIT 3;
                    `, [item.department_id]);

                    for (const admin of adminRes.rows) {
                        if (admin.email && admin.email.includes("@")) {
                            sendEscalationAlertEmail({
                                email: admin.email,
                                officerName: admin.name,
                                issueId: item.id,
                                title: item.title,
                                department: item.department_name,
                                slaHours: item.sla_hours,
                                overdueHours,
                                escalationLevel
                            }).catch(() => {});
                        }
                    }
                } catch (dispatchErr) {
                    logger.error("Failed to dispatch escalation alerts", { error: dispatchErr.message, issueId: item.id });
                }
            })();
        }

        return {
            totalScanned: breachedIssues.length,
            newlyEscalatedCount: escalated.length,
            escalatedIssues: escalated
        };
    } catch (error) {
        try { await client.query("ROLLBACK"); } catch {}
        logger.error("Error running SLA escalation scan", { error: error.message });
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Retrieves aggregate metrics of currently escalated issues.
 */
async function getEscalationStats() {
    await ensureEscalationSchema();
    const query = `
        SELECT
            COUNT(*)::int AS total_escalated,
            COUNT(CASE WHEN escalation_level = 2 THEN 1 END)::int AS critical_escalated,
            COUNT(CASE WHEN escalation_level = 1 THEN 1 END)::int AS level1_escalated
        FROM civic_issues
        WHERE is_escalated = TRUE
          AND status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'REOPENED');
    `;
    const res = await pool.query(query);
    return res.rows[0];
}

/**
 * Retrieves a list of active escalated issues with full metadata.
 */
async function getEscalatedIssues({ limit = 50, offset = 0 } = {}) {
    await ensureEscalationSchema();
    const query = `
        SELECT
            ci.id,
            ci.title,
            ci.category,
            ci.status,
            ci.priority_score,
            ci.is_escalated,
            ci.escalation_level,
            ci.escalated_at,
            ci.created_at,
            d.name AS department_name,
            mw.ward_number,
            mw.name AS ward_name,
            COALESCE(c.sla_hours, 72) AS sla_hours,
            ROUND(EXTRACT(EPOCH FROM (NOW() - ci.created_at)) / 3600) AS elapsed_hours,
            (
                SELECT u.name
                FROM issue_assignments ia
                JOIN users u ON ia.assigned_to = u.id
                WHERE ia.civic_issue_id = ci.id
                ORDER BY ia.assigned_at DESC LIMIT 1
            ) AS assigned_to_name
        FROM civic_issues ci
        JOIN departments d ON ci.department_id = d.id
        LEFT JOIN categories c ON ci.category = c.code
        LEFT JOIN municipal_wards mw ON ci.ward_id = mw.id
        WHERE ci.is_escalated = TRUE
          AND ci.status IN ('OPEN', 'IN_PROGRESS', 'ON_HOLD', 'REOPENED')
        ORDER BY ci.escalation_level DESC, ci.priority_score DESC, ci.id DESC
        LIMIT $1 OFFSET $2;
    `;
    const res = await pool.query(query, [Number(limit), Number(offset)]);
    return res.rows;
}

module.exports = {
    runSlaEscalationScan,
    getEscalationStats,
    getEscalatedIssues
};
