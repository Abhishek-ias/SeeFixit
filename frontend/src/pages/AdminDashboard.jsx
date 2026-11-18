import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { issueApi, adminApi, aiApi } from '../services/api'
import './AdminDashboard.css'

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#f59e0b', bg: '#fffbeb', icon: '🟡' },
  IN_PROGRESS: { label: 'In Progress', color: '#3b82f6', bg: '#eff6ff', icon: '🔵' },
  ON_HOLD:     { label: 'On Hold',     color: '#8b5cf6', bg: '#f5f3ff', icon: '🟣' },
  RESOLVED:    { label: 'Resolved',    color: '#10b981', bg: '#ecfdf5', icon: '🟢' },
  REJECTED:    { label: 'Rejected',    color: '#ef4444', bg: '#fef2f2', icon: '🔴' },
  REOPENED:    { label: 'Reopened',    color: '#f97316', bg: '#fff7ed', icon: '🟠' },
}

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'ROAD', label: 'Roads & Potholes' },
  { value: 'SANITATION', label: 'Sanitation' },
  { value: 'WATER', label: 'Water Supply' },
  { value: 'LIGHTING', label: 'Street Lighting' },
]

function getValidNextStatuses(currentStatus) {
  switch (currentStatus) {
    case 'OPEN':
      return [
        { value: 'IN_PROGRESS', label: 'Move to In Progress' },
        { value: 'REJECTED', label: 'Reject Issue' },
      ]
    case 'IN_PROGRESS':
      return [
        { value: 'RESOLVED', label: 'Mark as Resolved' },
        { value: 'ON_HOLD', label: 'Put On Hold' },
        { value: 'REJECTED', label: 'Reject Issue' },
      ]
    case 'ON_HOLD':
      return [
        { value: 'IN_PROGRESS', label: 'Resume to In Progress' },
        { value: 'REJECTED', label: 'Reject Issue' },
      ]
    case 'RESOLVED':
    case 'REJECTED':
      return [
        { value: 'REOPENED', label: 'Reopen Issue' },
      ]
    case 'REOPENED':
      return [
        { value: 'IN_PROGRESS', label: 'Move to In Progress' },
        { value: 'REJECTED', label: 'Reject Issue' },
      ]
    default:
      return []
  }
}

function AdminDashboard({ token, user, onAuthRequired }) {
  const [stats, setStats] = useState(null)
  const [officers, setOfficers] = useState([])
  const [departments, setDepartments] = useState([])

  const [issues, setIssues] = useState([])
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [departmentId, setDepartmentId] = useState('')

  // Selected issue for triage / detail modal
  const [selectedIssueId, setSelectedIssueId] = useState(null)
  const [issueDetails, setIssueDetails] = useState(null)
  const [detailsLoading, setDetailsLoading] = useState(false)

  // Status transition form in modal
  const [targetStatus, setTargetStatus] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [statusSubmitting, setStatusSubmitting] = useState(false)

  // Assignment form in modal
  const [targetOfficerId, setTargetOfficerId] = useState('')
  const [assignmentNotes, setAssignmentNotes] = useState('')
  const [assignmentSubmitting, setAssignmentSubmitting] = useState(false)

  // Evidence upload form in modal
  const [evidenceImage, setEvidenceImage] = useState('')
  const [evidenceDesc, setEvidenceDesc] = useState('')
  const [evidenceSubmitting, setEvidenceSubmitting] = useState(false)

  // Verify authentication
  useEffect(() => {
    if (!token) {
      onAuthRequired?.()
    }
  }, [token, onAuthRequired])

  // Load static lists (stats, officers, departments)
  useEffect(() => {
    if (!token || user?.role !== 'ADMIN') return

    adminApi.getStats(token)
      .then((res) => setStats(res?.data))
      .catch((err) => console.error('Failed to load stats:', err))

    adminApi.getOfficers(token)
      .then((res) => setOfficers(res?.data ?? []))
      .catch((err) => console.error('Failed to load officers:', err))

    adminApi.getDepartments()
      .then((res) => setDepartments(res?.data ?? []))
      .catch((err) => console.error('Failed to load departments:', err))
  }, [token, user])

  // Helper to re-fetch issues (e.g. for pagination or after status change)
  const fetchIssues = useCallback(async (page = 1) => {
    if (!token || user?.role !== 'ADMIN') return

    setLoading(true)
    setError('')

    try {
      const res = await issueApi.getAll({
        page,
        limit: 15,
        search: search.trim() || undefined,
        category: category || undefined,
        status: status || undefined,
        department_id: departmentId || undefined,
        sortBy: 'id',
        order: 'desc',
      })

      const data = res?.data ?? {}
      setIssues(data.issues ?? [])
      setPagination(data.pagination ?? { page: 1, limit: 15, total: 0, totalPages: 1 })
    } catch (err) {
      setError(err.message || 'Failed to fetch issues.')
    } finally {
      setLoading(false)
    }
  }, [token, user, search, category, status, departmentId])

  // Load issues when filter parameters change
  useEffect(() => {
    let active = true
    if (!token || user?.role !== 'ADMIN') return

    issueApi.getAll({
      page: 1,
      limit: 15,
      search: search.trim() || undefined,
      category: category || undefined,
      status: status || undefined,
      department_id: departmentId || undefined,
      sortBy: 'id',
      order: 'desc',
    })
      .then((res) => {
        if (!active) return
        const data = res?.data ?? {}
        setIssues(data.issues ?? [])
        setPagination(data.pagination ?? { page: 1, limit: 15, total: 0, totalPages: 1 })
        setError('')
      })
      .catch((err) => {
        if (!active) return
        setError(err.message || 'Failed to fetch issues.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [token, user, search, category, status, departmentId])

  // Load selected issue detail for modal
  const loadIssueDetails = useCallback(async (id) => {
    if (!id || !token) return
    setDetailsLoading(true)
    try {
      const res = await issueApi.getById(id, token)
      setIssueDetails(res?.data)
      const valid = getValidNextStatuses(res?.data?.issue?.status)
      setTargetStatus(valid[0]?.value || '')
      setStatusNote('')
      setTargetOfficerId(officers[0]?.id || '')
      setAssignmentNotes('')
      setEvidenceImage('')
      setEvidenceDesc('')
    } catch (err) {
      setError(err.message || 'Failed to load issue details.')
      setSelectedIssueId(null)
    } finally {
      setDetailsLoading(false)
    }
  }, [token, officers])

  function handleOpenTriage(issueId) {
    setSelectedIssueId(issueId)
    loadIssueDetails(issueId)
  }

  function handleCloseTriage() {
    setSelectedIssueId(null)
    setIssueDetails(null)
  }

  // Handle Status Update
  async function handleStatusSubmit(e) {
    e.preventDefault()
    if (!targetStatus || !selectedIssueId) return

    setStatusSubmitting(true)
    setNotice('')

    try {
      await adminApi.updateStatus(selectedIssueId, {
        status: targetStatus,
        note: statusNote.trim() || undefined,
      }, token)

      setNotice(`Issue #${selectedIssueId} status updated to ${targetStatus}.`)
      await loadIssueDetails(selectedIssueId)
      fetchIssues(pagination.page)
      // refresh stats
      adminApi.getStats(token).then((res) => setStats(res?.data))
    } catch (err) {
      alert(err.message || 'Failed to update status.')
    } finally {
      setStatusSubmitting(false)
    }
  }

  // Handle Officer Assignment
  async function handleAssignmentSubmit(e) {
    e.preventDefault()
    if (!targetOfficerId || !selectedIssueId) return

    setAssignmentSubmitting(true)

    try {
      await adminApi.assignIssue(selectedIssueId, {
        assigned_to: Number(targetOfficerId),
        notes: assignmentNotes.trim() || undefined,
      }, token)

      setNotice(`Issue #${selectedIssueId} assigned successfully.`)
      await loadIssueDetails(selectedIssueId)
      fetchIssues(pagination.page)
    } catch (err) {
      alert(err.message || 'Failed to assign issue.')
    } finally {
      setAssignmentSubmitting(false)
    }
  }

  // Handle Evidence Upload
  async function handleEvidenceSubmit(e) {
    e.preventDefault()
    if (!evidenceImage.trim() || !selectedIssueId) return

    setEvidenceSubmitting(true)

    try {
      await adminApi.uploadEvidence(selectedIssueId, {
        image: evidenceImage.trim(),
        description: evidenceDesc.trim() || undefined,
      }, token)

      setNotice(`Resolution evidence added to Issue #${selectedIssueId}.`)
      setEvidenceImage('')
      setEvidenceDesc('')
      await loadIssueDetails(selectedIssueId)
    } catch (err) {
      alert(err.message || 'Failed to upload evidence.')
    } finally {
      setEvidenceSubmitting(false)
    }
  }

  // Handle AI Feedback submission
  async function handleAiFeedback(isAccurate) {
    if (!issueDetails?.aiAssessment?.id) return

    try {
      await aiApi.submitFeedback(selectedIssueId, {
        assessment_id: issueDetails.aiAssessment.id,
        is_accurate: isAccurate,
        feedback_notes: isAccurate ? 'Officer verified AI prediction as accurate.' : 'Officer flagged AI classification as inaccurate.'
      }, token)

      setNotice('AI evaluation feedback recorded.')
      loadIssueDetails(selectedIssueId)
    } catch (err) {
      alert(err.message || 'Failed to submit feedback.')
    }
  }

  if (user && user.role !== 'ADMIN') {
    return (
      <div className="admin-container">
        <div className="admin-error-banner">
          <h2>🔒 Access Restricted</h2>
          <p>You must be an administrator or municipal officer to access this management dashboard.</p>
          <Link to="/" className="button-primary">Return to Home</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-container">
      {/* ── Title & Refresh ── */}
      <div className="admin-header">
        <div>
          <span className="admin-badge">MUNICIPAL OPERATIONS</span>
          <h1>Authority Management Portal</h1>
          <p>Triage, assign, track SLA, and verify civic issue resolution.</p>
        </div>
        <button
          onClick={() => { fetchIssues(pagination.page); adminApi.getStats(token).then(r => setStats(r?.data)) }}
          className="admin-refresh-btn"
        >
          🔄 Refresh Data
        </button>
      </div>

      {notice && (
        <div className="admin-notice-bar" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')}>&times;</button>
        </div>
      )}

      {error && (
        <div className="admin-error-bar" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* ── Operations Stats Cards ── */}
      {stats?.totals && (
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">Total Civic Issues</span>
            <span className="stat-number">{stats.totals.total_issues ?? 0}</span>
            <span className="stat-sub">{stats.totals.total_reports ?? 0} citizen reports</span>
          </div>
          <div className="stat-card stat-card-active">
            <span className="stat-label">Active / Pending</span>
            <span className="stat-number">{stats.totals.active_issues ?? 0}</span>
            <span className="stat-sub">Requires department action</span>
          </div>
          <div className="stat-card stat-card-resolved">
            <span className="stat-label">Resolved Issues</span>
            <span className="stat-number">{stats.totals.resolved_issues ?? 0}</span>
            <span className="stat-sub">Verified resolutions</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Active Officers</span>
            <span className="stat-number">{stats.totals.total_officers ?? 0}</span>
            <span className="stat-sub">Across {departments.length} departments</span>
          </div>
        </div>
      )}

      {/* ── SLA & Municipal Insights Bar ── */}
      {stats?.slaMetrics && (
        <div className="sla-insights-bar">
          <div className="sla-metric-pill">
            <span className="sla-pill-label">⚡ Active On-Schedule:</span>
            <strong className="sla-pill-value">{stats.slaMetrics.on_schedule ?? 0}</strong>
          </div>
          <div className="sla-metric-pill overdue-pill">
            <span className="sla-pill-label">🚨 Overdue Issues:</span>
            <strong className="sla-pill-value">{stats.slaMetrics.currently_overdue ?? 0} breached</strong>
          </div>
          <div className="sla-metric-pill">
            <span className="sla-pill-label">⏱️ Avg Resolution:</span>
            <strong className="sla-pill-value">
              {stats.slaMetrics.avg_resolution_hours ? `${stats.slaMetrics.avg_resolution_hours}h` : 'N/A'}
            </strong>
          </div>
          <div className="sla-metric-pill rating-pill">
            <span className="sla-pill-label">⭐ Citizen Rating:</span>
            <strong className="sla-pill-value">
              {stats.citizenSatisfaction?.average_rating ? `${stats.citizenSatisfaction.average_rating} / 5` : 'No reviews yet'}
            </strong>
          </div>
        </div>
      )}

      {/* ── Filter Bar ── */}
      <div className="admin-filter-bar">
        <div className="filter-item filter-search">
          <label htmlFor="search-input">Search Title</label>
          <input
            id="search-input"
            type="text"
            placeholder="Search keywords…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="filter-item">
          <label htmlFor="category-select">Category</label>
          <select
            id="category-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="filter-item">
          <label htmlFor="status-select">Status</label>
          <select
            id="status-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([k, cfg]) => (
              <option key={k} value={k}>{cfg.icon} {cfg.label}</option>
            ))}
          </select>
        </div>

        <div className="filter-item">
          <label htmlFor="dept-select">Department</label>
          <select
            id="dept-select"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Issues Table ── */}
      <div className="issues-table-container">
        {loading ? (
          <div className="admin-loading">
            <div className="spinner" />
            <p>Loading civic issues…</p>
          </div>
        ) : issues.length === 0 ? (
          <div className="admin-empty">
            <p>No civic issues match your current filters.</p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Issue Details</th>
                <th>Category</th>
                <th>Department</th>
                <th>Assigned Officer</th>
                <th>Status</th>
                <th>SLA Timer</th>
                <th>Reports</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => {
                const statusCfg = STATUS_CONFIG[issue.status] ?? { label: issue.status, color: '#666', bg: '#f4f4f4', icon: '⚪' }
                return (
                  <tr key={issue.issue_id}>
                    <td className="cell-id">#{issue.issue_id}</td>
                    <td className="cell-title">
                      <strong>{issue.issue_title}</strong>
                      <span className="cell-coords">📍 {Number(issue.latitude).toFixed(4)}, {Number(issue.longitude).toFixed(4)}</span>
                    </td>
                    <td><span className="category-pill">{issue.category_icon ? `${issue.category_icon} ` : ''}{issue.category}</span></td>
                    <td>{issue.department_name || '—'}</td>
                    <td>
                      {issue.assigned_to_name ? (
                        <span className="officer-pill">👤 {issue.assigned_to_name}</span>
                      ) : (
                        <span className="unassigned-pill">Unassigned</span>
                      )}
                    </td>
                    <td>
                      <span
                        className="status-pill"
                        style={{ color: statusCfg.color, background: statusCfg.bg, borderColor: statusCfg.color }}
                      >
                        {statusCfg.icon} {statusCfg.label}
                      </span>
                    </td>
                    <td>
                      {issue.sla_status === 'WITHIN_SLA' && (
                        <span className="sla-badge-pill within-sla" title={`${issue.sla_hours_remaining} hours remaining`}>
                          🟢 {issue.sla_hours_remaining}h left
                        </span>
                      )}
                      {issue.sla_status === 'OVERDUE' && (
                        <span className="sla-badge-pill overdue" title={`Overdue by ${Math.abs(issue.sla_hours_remaining)} hours`}>
                          🔴 Overdue {Math.abs(issue.sla_hours_remaining)}h
                        </span>
                      )}
                      {issue.sla_status === 'SLA_MET' && (
                        <span className="sla-badge-pill sla-met" title="Resolved within target SLA">
                          ✅ Met SLA
                        </span>
                      )}
                      {issue.sla_status === 'SLA_BREACHED' && (
                        <span className="sla-badge-pill sla-breached" title="Resolution exceeded target SLA">
                          ⚠️ Breached
                        </span>
                      )}
                      {!issue.sla_status && <span className="sla-badge-pill">72h SLA</span>}
                    </td>
                    <td>
                      <span className="reports-counter">{issue.report_count}</span>
                    </td>
                    <td>
                      <button
                        className="triage-btn"
                        onClick={() => handleOpenTriage(issue.issue_id)}
                      >
                        Manage ⚙️
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="admin-pagination">
            <button
              disabled={pagination.page <= 1}
              onClick={() => fetchIssues(pagination.page - 1)}
            >
              Previous
            </button>
            <span>Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)</span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchIssues(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* ── Triage / Issue Management Modal ── */}
      {selectedIssueId && (
        <div className="admin-modal-backdrop" onClick={handleCloseTriage}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Issue #{selectedIssueId} — Operations & Workflow</h2>
              <button className="modal-close" onClick={handleCloseTriage}>&times;</button>
            </div>

            {detailsLoading ? (
              <div className="modal-loading">
                <div className="spinner" />
                <p>Loading issue details…</p>
              </div>
            ) : issueDetails ? (
              <div className="modal-body">
                {/* Issue Header Info */}
                <div className="modal-summary-card">
                  <h3>{issueDetails.issue.issue_title}</h3>
                  <div className="modal-summary-grid">
                    <div><strong>Category:</strong> {issueDetails.issue.category}</div>
                    <div><strong>Department:</strong> {issueDetails.issue.department_name}</div>
                    <div>
                      <strong>Status:</strong>{' '}
                      <span style={{ color: STATUS_CONFIG[issueDetails.issue.status]?.color }}>
                        {STATUS_CONFIG[issueDetails.issue.status]?.icon} {STATUS_CONFIG[issueDetails.issue.status]?.label}
                      </span>
                    </div>
                    <div>
                      <strong>Coordinates:</strong>{' '}
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${issueDetails.issue.latitude}&mlon=${issueDetails.issue.longitude}&zoom=17`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {Number(issueDetails.issue.latitude).toFixed(5)}, {Number(issueDetails.issue.longitude).toFixed(5)} ↗
                      </a>
                    </div>
                  </div>
                </div>

                {/* AI Assessment Triage Card */}
                {issueDetails.aiAssessment && (
                  <div className="modal-ai-card">
                    <div className="ai-card-top">
                      <div className="ai-card-title">
                        <span>🤖</span>
                        <h4>AI Triage & Hazard Assessment</h4>
                        <span className="ai-badge-model">{issueDetails.aiAssessment.model_provider}</span>
                      </div>
                      <div className="ai-card-scores">
                        <span className="ai-confidence-pill">
                          {(issueDetails.aiAssessment.category_confidence * 100).toFixed(0)}% Confidence
                        </span>
                        <span className={`ai-severity-pill severity-${issueDetails.aiAssessment.predicted_severity.toLowerCase()}`}>
                          Severity: {issueDetails.aiAssessment.predicted_severity} ({issueDetails.aiAssessment.severity_score}/100)
                        </span>
                      </div>
                    </div>

                    <div className="ai-card-body">
                      <p className="ai-summary-text"><strong>Summary:</strong> {issueDetails.aiAssessment.summary}</p>
                      <p className="ai-action-text"><strong>Suggested Action:</strong> {issueDetails.aiAssessment.suggested_action}</p>
                      {issueDetails.aiAssessment.safety_hazard_detected && (
                        <div className="ai-hazard-alert">
                          ⚠️ <strong>Safety Hazard Flagged:</strong> {issueDetails.aiAssessment.hazard_type ? issueDetails.aiAssessment.hazard_type.replace(/_/g, ' ') : 'General Hazard'}
                        </div>
                      )}
                    </div>

                    <div className="ai-feedback-bar">
                      <span className="ai-feedback-label">Officer Audit Verification:</span>
                      {issueDetails.aiAssessment.is_accurate !== null && issueDetails.aiAssessment.is_accurate !== undefined ? (
                        <span className="ai-verified-tag">
                          {issueDetails.aiAssessment.is_accurate ? '✅ Verified Accurate by Officer' : '⚠️ Flagged Inaccurate by Officer'}
                        </span>
                      ) : (
                        <div className="ai-feedback-actions">
                          <button
                            type="button"
                            className="feedback-btn feedback-accurate"
                            onClick={() => handleAiFeedback(true)}
                          >
                            👍 Accurate
                          </button>
                          <button
                            type="button"
                            className="feedback-btn feedback-inaccurate"
                            onClick={() => handleAiFeedback(false)}
                          >
                            👎 Inaccurate
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Grid of Workflows: Status Transition + Assignment */}
                <div className="modal-workflow-grid">
                  {/* Status Transition Panel */}
                  <div className="workflow-panel">
                    <h4>🔄 Change Status</h4>
                    {getValidNextStatuses(issueDetails.issue.status).length === 0 ? (
                      <p className="no-actions-note">No valid status transitions available from current state.</p>
                    ) : (
                      <form onSubmit={handleStatusSubmit}>
                        <div className="form-group">
                          <label>New Status</label>
                          <select
                            value={targetStatus}
                            onChange={(e) => setTargetStatus(e.target.value)}
                            required
                          >
                            {getValidNextStatuses(issueDetails.issue.status).map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="form-group">
                          <label>Action Note / Reason</label>
                          <textarea
                            rows={2}
                            placeholder="Reason for change, field findings, or resolution notes…"
                            value={statusNote}
                            onChange={(e) => setStatusNote(e.target.value)}
                          />
                        </div>

                        <button
                          type="submit"
                          className="button-primary workflow-btn"
                          disabled={statusSubmitting}
                        >
                          {statusSubmitting ? 'Updating…' : 'Apply Status Update'}
                        </button>
                      </form>
                    )}
                  </div>

                  {/* Assignment Panel */}
                  <div className="workflow-panel">
                    <h4>👤 Assign Responsible Officer</h4>
                    <form onSubmit={handleAssignmentSubmit}>
                      <div className="form-group">
                        <label>Select Officer</label>
                        <select
                          value={targetOfficerId}
                          onChange={(e) => setTargetOfficerId(e.target.value)}
                          required
                        >
                          <option value="">Select an officer…</option>
                          {officers.map((o) => (
                            <option key={o.id} value={o.id}>{o.name} ({o.email})</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Assignment Instructions</label>
                        <textarea
                          rows={2}
                          placeholder="Specific instructions or SLA deadline for the officer…"
                          value={assignmentNotes}
                          onChange={(e) => setAssignmentNotes(e.target.value)}
                        />
                      </div>

                      <button
                        type="submit"
                        className="button-secondary workflow-btn"
                        disabled={assignmentSubmitting}
                      >
                        {assignmentSubmitting ? 'Assigning…' : 'Assign Issue'}
                      </button>
                    </form>
                  </div>
                </div>

                {/* Evidence Upload Panel (Mandatory before RESOLVED) */}
                <div className="workflow-panel evidence-panel">
                  <h4>📸 Upload Resolution Evidence (Required to Resolve)</h4>
                  <p className="panel-helper">
                    Department officers must record photographic or document evidence before marking an issue RESOLVED.
                  </p>
                  <form onSubmit={handleEvidenceSubmit} className="evidence-form">
                    <div className="form-row">
                      <div className="form-group flex-2">
                        <label>Evidence Image URL</label>
                        <input
                          type="url"
                          placeholder="https://…/resolution-photo.jpg"
                          value={evidenceImage}
                          onChange={(e) => setEvidenceImage(e.target.value)}
                          required
                        />
                      </div>
                      <div className="form-group flex-3">
                        <label>Work Description</label>
                        <input
                          type="text"
                          placeholder="e.g. Pothole filled and road leveled on Nov 19."
                          value={evidenceDesc}
                          onChange={(e) => setEvidenceDesc(e.target.value)}
                        />
                      </div>
                      <button
                        type="submit"
                        className="button-primary evidence-submit-btn"
                        disabled={evidenceSubmitting}
                      >
                        {evidenceSubmitting ? 'Uploading…' : 'Upload Evidence'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Recorded Evidence Gallery */}
                {issueDetails.evidence?.length > 0 && (
                  <div className="modal-section">
                    <h4>Verified Evidence Records ({issueDetails.evidence.length})</h4>
                    <div className="evidence-gallery">
                      {issueDetails.evidence.map((ev) => (
                        <div key={ev.id} className="evidence-card">
                          <img src={ev.image} alt="Resolution Evidence" />
                          <div className="evidence-card-info">
                            <strong>{ev.description || 'No description provided'}</strong>
                            <span>By {ev.uploaded_by_name} · {new Date(ev.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Status Timeline & Audit Trail */}
                <div className="modal-section">
                  <h4>Audit History & Status Log</h4>
                  <ul className="audit-timeline">
                    {issueDetails.history?.map((h) => (
                      <li key={h.id} className="audit-item">
                        <span className="audit-dot" />
                        <div>
                          <strong>
                            Status: <span style={{ color: STATUS_CONFIG[h.status]?.color }}>{h.status}</span>
                          </strong>
                          <span className="audit-meta">
                            By {h.changed_by_name} on {new Date(h.changed_at).toLocaleString()}
                          </span>
                          {h.note && <p className="audit-note">"{h.note}"</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

export default AdminDashboard
