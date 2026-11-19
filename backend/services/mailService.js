const logger = require("../utils/logger");

// In-memory buffer for testing and audit logs
const sentMailLog = [];

/**
 * Returns the history of sent emails (used in unit/integration testing).
 */
function getSentEmails() {
    return [...sentMailLog];
}

/**
 * Clears the test email history.
 */
function clearSentEmails() {
    sentMailLog.length = 0;
}

/**
 * Base email dispatcher. Logs to test buffer and logger, with simulated or SMTP transport.
 */
async function sendEmail({ to, subject, text, html }) {
    if (!to || !to.includes("@")) {
        return { success: false, reason: "Invalid or missing recipient email" };
    }

    const emailRecord = {
        to,
        subject,
        text,
        html,
        sentAt: new Date().toISOString()
    };

    sentMailLog.push(emailRecord);
    if (sentMailLog.length > 50) {
        sentMailLog.shift(); // Keep last 50
    }

    logger.info(`[Email Dispatch] To: ${to} | Subject: ${subject}`);
    return { success: true, messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}` };
}

/**
 * Sends grievance registration confirmation to the citizen.
 */
async function sendReportConfirmationEmail({ email, name = "Citizen", reportId, issueId, title, category }) {
    const trackUrl = `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/track/${issueId}`;
    const subject = `[SeeFixit] Grievance Registered #${issueId}: ${title}`;
    const text = `Hello ${name},\n\nYour civic grievance has been successfully registered on SeeFixit.\nIssue ID: #${issueId}\nTitle: ${title}\nCategory: ${category}\n\nYou can track resolution progress live at: ${trackUrl}\n\nThank you for helping keep our city clean and safe.\n- SeeFixit Municipal Operations`;
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #2563eb; margin-top: 0;">SeeFixit Municipal Operations</h2>
            <p>Hello <strong>${name}</strong>,</p>
            <p>Your civic complaint has been registered and routed to the appropriate municipal department.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0;"><strong>Issue ID:</strong> #${issueId}</p>
                <p style="margin: 0 0 8px 0;"><strong>Title:</strong> ${title}</p>
                <p style="margin: 0;"><strong>Category:</strong> ${category}</p>
            </div>
            <p>You can track the real-time status and view assigned field officers here:</p>
            <p style="text-align: center; margin: 25px 0;">
                <a href="${trackUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Track Issue #${issueId}</a>
            </p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 12px; color: #64748b;">This is an automated notification from the SeeFixit Municipal Grievance Redressal System.</p>
        </div>
    `;

    return sendEmail({ to: email, subject, text, html });
}

/**
 * Sends status transition notification to citizens.
 */
async function sendStatusUpdateEmail({ email, name = "Citizen", issueId, title, status, note }) {
    const trackUrl = `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/track/${issueId}`;
    const subject = `[SeeFixit] Status Update #${issueId}: Now ${status}`;
    const text = `Hello ${name},\n\nYour reported issue #${issueId} ("${title}") status has been updated to: ${status}.\n${note ? `Officer Note: ${note}\n` : ''}\nTrack progress: ${trackUrl}\n\n- SeeFixit Municipal Operations`;
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #2563eb; margin-top: 0;">SeeFixit Status Update</h2>
            <p>Hello <strong>${name}</strong>,</p>
            <p>There is an update on your reported civic issue #${issueId}:</p>
            <div style="background-color: #f1f5f9; padding: 16px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0 0 8px 0;"><strong>Issue:</strong> ${title}</p>
                <p style="margin: 0 0 8px 0;"><strong>New Status:</strong> <span style="background-color: #2563eb; color: white; padding: 3px 8px; border-radius: 4px; font-weight: bold;">${status}</span></p>
                ${note ? `<p style="margin: 8px 0 0 0; color: #334155;"><strong>Department Note:</strong> ${note}</p>` : ''}
            </div>
            <p style="text-align: center; margin: 25px 0;">
                <a href="${trackUrl}" style="background-color: #0f172a; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Public Timeline</a>
            </p>
        </div>
    `;

    return sendEmail({ to: email, subject, text, html });
}

/**
 * Sends resolution notification with citizen satisfaction prompt.
 */
async function sendResolutionEmail({ email, name = "Citizen", issueId, title, note }) {
    const trackUrl = `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/track/${issueId}`;
    const subject = `[SeeFixit] Issue Resolved #${issueId} - Please Rate Your Resolution`;
    const text = `Hello ${name},\n\nGood news! Issue #${issueId} ("${title}") has been marked RESOLVED by the municipal department.\n${note ? `Resolution Note: ${note}\n` : ''}\nPlease take 30 seconds to rate your satisfaction and confirm the fix:\n${trackUrl}\n\nThank you,\nSeeFixit Team`;
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #16a34a; margin-top: 0;">Issue Resolved 🎉</h2>
            <p>Hello <strong>${name}</strong>,</p>
            <p>The municipal team has completed work on your reported issue <strong>#${issueId}</strong>: "${title}".</p>
            ${note ? `<blockquote style="border-left: 4px solid #16a34a; padding-left: 12px; margin: 15px 0; color: #475569;">${note}</blockquote>` : ''}
            <p>Was the problem resolved to your satisfaction? Please confirm the resolution and rate the service:</p>
            <p style="text-align: center; margin: 25px 0;">
                <a href="${trackUrl}" style="background-color: #16a34a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Rate Resolution & Confirm</a>
            </p>
        </div>
    `;

    return sendEmail({ to: email, subject, text, html });
}

/**
 * Sends assignment alert to municipal officer.
 */
async function sendOfficerAssignmentEmail({ email, officerName = "Officer", issueId, title, priorityScore, department }) {
    const adminUrl = `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/admin`;
    const subject = `[SeeFixit Officer Task] Assigned to Issue #${issueId} (Priority: ${priorityScore})`;
    const text = `Hello ${officerName},\n\nYou have been assigned to Issue #${issueId}: "${title}".\nDepartment: ${department || 'Municipal'}\nPriority Score: ${priorityScore}\n\nLogin to the Admin Dashboard to triage and inspect: ${adminUrl}\n\n- SeeFixit Dispatch`;
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #0f172a; margin-top: 0;">New Work Order Assignment</h2>
            <p>Hello <strong>${officerName}</strong>,</p>
            <p>You have been assigned to field resolution for issue <strong>#${issueId}</strong>:</p>
            <div style="background-color: #f8fafc; padding: 14px; border-radius: 6px; margin: 15px 0;">
                <p style="margin: 0 0 6px 0;"><strong>Title:</strong> ${title}</p>
                <p style="margin: 0 0 6px 0;"><strong>Priority Score:</strong> <span style="color: #dc2626; font-weight: bold;">${priorityScore}/100</span></p>
                <p style="margin: 0;"><strong>Department:</strong> ${department || 'General Works'}</p>
            </div>
            <p style="text-align: center; margin: 25px 0;">
                <a href="${adminUrl}" style="background-color: #0f172a; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Open Authority Console</a>
            </p>
        </div>
    `;

    return sendEmail({ to: email, subject, text, html });
}

/**
 * Sends urgent SLA escalation alert to supervisory authorities and assigned officer.
 */
async function sendEscalationAlertEmail({
    email,
    officerName = "Officer",
    issueId,
    title,
    department,
    slaHours = 72,
    overdueHours = 0,
    escalationLevel = 1
}) {
    const adminUrl = `${process.env.CLIENT_ORIGIN || "http://localhost:5173"}/admin`;
    const urgency = escalationLevel >= 2 ? "CRITICAL SLA BREACH (Level 2)" : "SLA BREACH ESCALATION (Level 1)";
    const subject = `[URGENT ESCALATION] Issue #${issueId} Breached SLA (+${overdueHours}h)`;
    const text = `ATTENTION: ${urgency}\n\nIssue #${issueId}: "${title}" has exceeded the municipal SLA target of ${slaHours} hours.\nDepartment: ${department}\nOverdue By: ${overdueHours} hours\nEscalation Level: ${escalationLevel}\n\nImmediate departmental intervention required: ${adminUrl}\n\n- SeeFixit SLA Oversight`;
    const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 2px solid #dc2626; border-radius: 8px;">
            <div style="background-color: #dc2626; color: #ffffff; padding: 10px 16px; border-radius: 4px; font-weight: bold; text-align: center; text-transform: uppercase;">
                🚨 ${urgency}
            </div>
            <p style="margin-top: 15px;">Hello <strong>${officerName}</strong>,</p>
            <p>The following municipal grievance has exceeded its permitted resolution timeframe and has been automatically escalated:</p>
            <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 14px; margin: 15px 0;">
                <p style="margin: 0 0 6px 0;"><strong>Issue ID:</strong> #${issueId}</p>
                <p style="margin: 0 0 6px 0;"><strong>Title:</strong> ${title}</p>
                <p style="margin: 0 0 6px 0;"><strong>Department:</strong> ${department}</p>
                <p style="margin: 0 0 6px 0;"><strong>SLA Target:</strong> ${slaHours} hours</p>
                <p style="margin: 0; color: #b91c1c;"><strong>Overdue By:</strong> <strong>${overdueHours} hours</strong></p>
            </div>
            <p>Please re-prioritize field resources or reassign this ticket immediately:</p>
            <p style="text-align: center; margin: 25px 0;">
                <a href="${adminUrl}" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Open Authority Console</a>
            </p>
        </div>
    `;

    return sendEmail({ to: email, subject, text, html });
}

module.exports = {
    sendEmail,
    getSentEmails,
    clearSentEmails,
    sendReportConfirmationEmail,
    sendStatusUpdateEmail,
    sendResolutionEmail,
    sendOfficerAssignmentEmail,
    sendEscalationAlertEmail
};
