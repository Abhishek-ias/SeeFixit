const pool = require("../db/database");
const logger = require("../utils/logger");
const {
    sendStatusUpdateEmail,
    sendResolutionEmail,
    sendOfficerAssignmentEmail
} = require("./mailService");

/**
 * Creates an in-app notification for a user.
 */
async function createNotification({ userId, civicIssueId = null, title, message, type = "STATUS_CHANGE" }) {
    try {
        const query = `
            INSERT INTO notifications (user_id, civic_issue_id, title, message, type)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;
        const res = await pool.query(query, [userId, civicIssueId, title, message, type]);
        return res.rows[0];
    } catch (err) {
        logger.error("Failed to create notification", { error: err.message, userId, civicIssueId });
        return null;
    }
}

/**
 * Notifies all citizens who reported a given civic issue when its status changes.
 * Dispatches both in-app notification and transactional outbound email.
 */
async function notifyIssueCitizens({ civicIssueId, title, message, type = "STATUS_CHANGE", excludeUserId = null, status = null, note = null }) {
    try {
        const query = `
            SELECT DISTINCT u.id, u.email, u.name
            FROM reports r
            JOIN users u ON r.user_id = u.id
            WHERE r.civic_issue_id = $1
        `;
        const res = await pool.query(query, [civicIssueId]);
        const promises = [];

        for (const user of res.rows) {
            if (excludeUserId && user.id === excludeUserId) {
                continue;
            }
            // In-app notification
            promises.push(
                createNotification({
                    userId: user.id,
                    civicIssueId,
                    title,
                    message,
                    type
                })
            );

            // Outbound Email dispatch (non-blocking)
            if (user.email && user.email.includes("@")) {
                if (status === "RESOLVED") {
                    sendResolutionEmail({
                        email: user.email,
                        name: user.name,
                        issueId: civicIssueId,
                        title,
                        note
                    }).catch(err => logger.error("Failed to send resolution email", { error: err.message }));
                } else {
                    sendStatusUpdateEmail({
                        email: user.email,
                        name: user.name,
                        issueId: civicIssueId,
                        title,
                        status: status || message,
                        note
                    }).catch(err => logger.error("Failed to send status update email", { error: err.message }));
                }
            }
        }

        await Promise.all(promises);
    } catch (err) {
        logger.error("Failed to notify issue citizens", { error: err.message, civicIssueId });
    }
}

/**
 * Notifies an officer when assigned to an issue.
 * Dispatches both in-app notification and email alert.
 */
async function notifyAssignedOfficer({ officerId, civicIssueId, issueTitle, priorityScore = 50, department = null }) {
    try {
        await createNotification({
            userId: officerId,
            civicIssueId,
            title: "New Issue Assignment",
            message: `You have been assigned to Issue #${civicIssueId}: "${issueTitle || 'Civic Problem'}".`,
            type: "ASSIGNMENT"
        });

        const officerRes = await pool.query("SELECT email, name FROM users WHERE id = $1", [officerId]);
        if (officerRes.rows.length > 0 && officerRes.rows[0].email) {
            sendOfficerAssignmentEmail({
                email: officerRes.rows[0].email,
                officerName: officerRes.rows[0].name,
                issueId: civicIssueId,
                title: issueTitle,
                priorityScore,
                department
            }).catch(err => logger.error("Failed to send officer assignment email", { error: err.message }));
        }
    } catch (err) {
        logger.error("Failed to notify assigned officer", { error: err.message, officerId, civicIssueId });
    }
}

/**
 * Retrieves paginated notifications for a user.
 */
async function getUserNotifications(userId, limit = 20, offset = 0) {
    const query = `
        SELECT id, civic_issue_id, title, message, type, is_read, created_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3;
    `;
    const res = await pool.query(query, [userId, limit, offset]);

    const countRes = await pool.query(
        "SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND is_read = FALSE",
        [userId]
    );

    return {
        notifications: res.rows,
        unreadCount: countRes.rows[0]?.unread || 0
    };
}

/**
 * Marks a notification as read.
 */
async function markNotificationAsRead(notificationId, userId) {
    const query = `
        UPDATE notifications
        SET is_read = TRUE
        WHERE id = $1 AND user_id = $2
        RETURNING *;
    `;
    const res = await pool.query(query, [notificationId, userId]);
    return res.rows[0] || null;
}

/**
 * Marks all notifications for a user as read.
 */
async function markAllNotificationsAsRead(userId) {
    const query = `
        UPDATE notifications
        SET is_read = TRUE
        WHERE user_id = $1 AND is_read = FALSE;
    `;
    await pool.query(query, [userId]);
    return { success: true };
}

module.exports = {
    createNotification,
    notifyIssueCitizens,
    notifyAssignedOfficer,
    getUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead
};
