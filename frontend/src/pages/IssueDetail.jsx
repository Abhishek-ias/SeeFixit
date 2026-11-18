
import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { reportApi, feedbackApi } from '../services/api'
import './IssueDetail.css'

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#f59e0b', bg: '#fffbeb', icon: '🟡' },
  IN_PROGRESS: { label: 'In Progress', color: '#3b82f6', bg: '#eff6ff', icon: '🔵' },
  RESOLVED:    { label: 'Resolved',    color: '#10b981', bg: '#ecfdf5', icon: '🟢' },
  REJECTED:    { label: 'Rejected',    color: '#ef4444', bg: '#fef2f2', icon: '🔴' },
  ON_HOLD:     { label: 'On Hold',     color: '#8b5cf6', bg: '#f5f3ff', icon: '🟣' },
  REOPENED:    { label: 'Reopened',    color: '#f97316', bg: '#fff7ed', icon: '🟠' },
}

const CATEGORY_ICONS = {
  ROAD: '🚧', SANITATION: '🗑️', WATER: '💧', LIGHTING: '💡',
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6', icon: '⚪' }
  return (
    <span className="detail-status-badge" style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.color }}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function IssueDetail({ token, onAuthRequired }) {
  const { id } = useParams()
  const navigate = useNavigate()

  const [report, setReport]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  // Resolution feedback & reopening state
  const [feedbackList, setFeedbackList] = useState([])
  const [userRating, setUserRating] = useState(5)
  const [userComment, setUserComment] = useState('')
  const [isSatisfied, setIsSatisfied] = useState(true)
  const [submittingFeedback, setSubmittingFeedback] = useState(false)
  const [feedbackSuccess, setFeedbackSuccess] = useState('')
  const [feedbackError, setFeedbackError] = useState('')
  const [showReopenForm, setShowReopenForm] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [submittingReopen, setSubmittingReopen] = useState(false)
  const [reopenSuccess, setReopenSuccess] = useState('')
  const [reopenError, setReopenError] = useState('')

  useEffect(() => {
    if (!token) {
      onAuthRequired?.()
      return
    }

    let active = true

    async function load() {
      setLoading(true)
      setError('')

      try {
        // Load citizen's own report (which includes civic issue status)
        const response = await reportApi.getMyReport(id, token)
        if (!active) return

        const reportData = response?.data
        if (!reportData) throw new Error('Report not found.')
        setReport(reportData)

        // If issue is resolved or has feedback, load feedback list
        if (reportData.civic_issue_id) {
          try {
            const fbRes = await feedbackApi.getByIssue(reportData.civic_issue_id, token)
            if (active && fbRes?.data) {
              setFeedbackList(fbRes.data)
            }
          } catch {
            // Feedback load failure is non-blocking
          }
        }
      } catch (err) {
        if (!active) return
        if (err.status === 401) onAuthRequired?.()
        else if (err.status === 404) setError('This report does not exist or you do not have access to it.')
        else setError(err.message || 'Failed to load report details.')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [id, token, onAuthRequired])

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault()
    if (!report?.civic_issue_id) return
    setSubmittingFeedback(true)
    setFeedbackError('')
    setFeedbackSuccess('')

    try {
      await feedbackApi.submit(
        report.civic_issue_id,
        {
          rating: Number(userRating),
          comment: userComment.trim() || undefined,
          is_satisfied: isSatisfied
        },
        token
      )
      setFeedbackSuccess('Thank you! Your resolution rating has been recorded.')
      // Refresh feedback list
      const fbRes = await feedbackApi.getByIssue(report.civic_issue_id, token)
      if (fbRes?.data) setFeedbackList(fbRes.data)
    } catch (err) {
      setFeedbackError(err.message || 'Failed to submit feedback.')
    } finally {
      setSubmittingFeedback(false)
    }
  }

  const handleReopenSubmit = async (e) => {
    e.preventDefault()
    if (!report?.civic_issue_id || !reopenReason.trim()) return
    setSubmittingReopen(true)
    setReopenError('')
    setReopenSuccess('')

    try {
      await feedbackApi.reopen(
        report.civic_issue_id,
        { reason: reopenReason.trim() },
        token
      )
      setReopenSuccess('Dispute submitted. Issue has been reopened for investigation.')
      setReport(prev => ({ ...prev, civic_issue_status: 'REOPENED' }))
      setShowReopenForm(false)
    } catch (err) {
      setReopenError(err.message || 'Failed to request reopening.')
    } finally {
      setSubmittingReopen(false)
    }
  }

  if (loading) {
    return (
      <div className="issue-detail-container">
        <div className="issue-detail-loading">
          <div className="spinner" />
          <p>Loading report…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="issue-detail-container">
        <div className="issue-detail-error" role="alert">
          <p>{error}</p>
          <div className="issue-detail-error-actions">
            <button onClick={() => navigate(-1)} className="report-cancel">← Go back</button>
            <Link to="/my-reports" className="report-cancel">My Reports</Link>
          </div>
        </div>
      </div>
    )
  }

  if (!report) return null

  const categoryIcon = CATEGORY_ICONS[report.category] ?? '📌'
  const statusCfg    = STATUS_CONFIG[report.civic_issue_status] ?? { label: report.civic_issue_status, color: '#6b7280', bg: '#f3f4f6', icon: '⚪' }

  // Build a simple timeline from the report data we have
  const timeline = [
    {
      icon: '📋',
      label: 'Report submitted',
      date: report.created_at,
      note: `Your report was received by ${report.department_name ?? 'the relevant department'}.`,
    },
  ]

  if (report.civic_issue_status === 'IN_PROGRESS') {
    timeline.push({
      icon: '🔧',
      label: 'Under investigation',
      date: null,
      note: 'Authorities are working on this issue.',
    })
  }

  if (report.civic_issue_status === 'RESOLVED') {
    timeline.push(
      {
        icon: '🔧',
        label: 'Work completed',
        date: null,
        note: 'Authorities resolved this issue.',
      },
      {
        icon: '✅',
        label: 'Resolved',
        date: null,
        note: 'This issue has been marked as resolved.',
      }
    )
  }

  return (
    <div className="issue-detail-container">
      {/* Back link */}
      <Link to="/my-reports" className="issue-detail-back">
        ← Back to My Reports
      </Link>

      {/* Header */}
      <div className="issue-detail-header">
        <span className="issue-detail-category-icon" aria-hidden="true">{categoryIcon}</span>
        <div className="issue-detail-header-text">
          <h1>{report.title}</h1>
          <div className="issue-detail-meta">
            <span>{report.category.charAt(0) + report.category.slice(1).toLowerCase()}</span>
            <span>·</span>
            <span>Report #{report.id}</span>
            <span>·</span>
            <span>{new Date(report.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>
        <StatusBadge status={report.civic_issue_status} />
      </div>

      {/* Current status banner */}
      <div className="issue-detail-status-banner" style={{ background: statusCfg.bg, borderColor: statusCfg.color }}>
        <span style={{ color: statusCfg.color }}>
          <strong>{statusCfg.icon} {statusCfg.label}</strong>
          {report.civic_issue_status === 'OPEN' && ' — Your report is in queue and will be reviewed soon.'}
          {report.civic_issue_status === 'IN_PROGRESS' && ' — Authorities are actively working on this issue.'}
          {report.civic_issue_status === 'RESOLVED' && ' — This civic issue has been resolved. Thank you for reporting!'}
        </span>
      </div>

      {/* Description */}
      <section className="issue-detail-section">
        <h2>Your description</h2>
        <p className="issue-detail-description">{report.description}</p>
      </section>

      {/* Location */}
      {(report.latitude || report.longitude) && (
        <section className="issue-detail-section">
          <h2>Location</h2>
          <div className="issue-detail-location">
            <span>📍</span>
            <span>
              {Number(report.latitude).toFixed(6)}, {Number(report.longitude).toFixed(6)}
            </span>
            <a
              href={`https://www.openstreetmap.org/?mlat=${report.latitude}&mlon=${report.longitude}&zoom=17`}
              target="_blank"
              rel="noopener noreferrer"
              className="location-map-link"
            >
              View on map ↗
            </a>
          </div>
        </section>
      )}

      {/* Department */}
      {report.department_name && (
        <section className="issue-detail-section">
          <h2>Assigned department</h2>
          <p className="issue-detail-dept">🏛️ {report.department_name}</p>
        </section>
      )}

      {/* Photo */}
      {report.image && (
        <section className="issue-detail-section">
          <h2>Attached photo</h2>
          <img
            src={report.image}
            alt="Report evidence"
            className="issue-detail-image"
            loading="lazy"
          />
        </section>
      )}

      {/* Status timeline */}
      <section className="issue-detail-section">
        <h2>Status timeline</h2>
        <ol className="timeline">
          {timeline.map((step, i) => (
            <li key={i} className={`timeline-item ${i === timeline.length - 1 ? 'active' : ''}`}>
              <span className="timeline-icon" aria-hidden="true">{step.icon}</span>
              <div className="timeline-content">
                <strong>{step.label}</strong>
                {step.date && (
                  <time className="timeline-date">
                    {new Date(step.date).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </time>
                )}
                <p>{step.note}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Citizen Resolution Verification & Feedback */}
      {report.civic_issue_status === 'RESOLVED' && (
        <section className="issue-detail-section feedback-section">
          <h2>⭐ Resolution Verification & Citizen Feedback</h2>
          <p className="feedback-subtext">
            Authorities marked this issue as resolved. How satisfied are you with the resolution work?
          </p>

          {feedbackSuccess && <div className="feedback-alert-success">{feedbackSuccess}</div>}
          {feedbackError && <div className="feedback-alert-error">{feedbackError}</div>}

          <form onSubmit={handleFeedbackSubmit} className="feedback-form">
            <div className="rating-selector">
              <label>Rate resolution quality:</label>
              <div className="stars-row">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    type="button"
                    key={star}
                    className={`star-btn ${userRating >= star ? 'active' : ''}`}
                    onClick={() => setUserRating(star)}
                    aria-label={`${star} star`}
                  >
                    ★
                  </button>
                ))}
                <span className="rating-label">{userRating} / 5 Stars</span>
              </div>
            </div>

            <div className="satisfaction-toggle-row">
              <label>
                <input
                  type="checkbox"
                  checked={isSatisfied}
                  onChange={(e) => setIsSatisfied(e.target.checked)}
                />
                <span>I am satisfied with the resolution</span>
              </label>
            </div>

            <div className="feedback-input-group">
              <label htmlFor="fb-comment">Comments or observations (optional):</label>
              <textarea
                id="fb-comment"
                value={userComment}
                onChange={(e) => setUserComment(e.target.value)}
                placeholder="e.g. Pothole filled and road smoothed properly, clean finish."
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="feedback-action-row">
              <button
                type="submit"
                disabled={submittingFeedback}
                className="btn-feedback-submit"
              >
                {submittingFeedback ? 'Submitting…' : 'Submit Review'}
              </button>

              <button
                type="button"
                className="btn-reopen-toggle"
                onClick={() => setShowReopenForm(!showReopenForm)}
              >
                {showReopenForm ? 'Cancel Dispute' : 'Dispute Fix / Request Reopen'}
              </button>
            </div>
          </form>

          {/* Dispute / Reopen Form */}
          {showReopenForm && (
            <div className="reopen-dispute-card">
              <h3>⚠️ Dispute Resolution / Request Reopening</h3>
              <p>
                If the problem was not adequately solved or has recurred immediately, request a municipal reinvestigation.
              </p>
              {reopenError && <div className="feedback-alert-error">{reopenError}</div>}
              <form onSubmit={handleReopenSubmit}>
                <label htmlFor="reopen-reason">Reason for reopening:</label>
                <textarea
                  id="reopen-reason"
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Describe why the resolution is inadequate..."
                  required
                  rows={3}
                />
                <button
                  type="submit"
                  disabled={submittingReopen || !reopenReason.trim()}
                  className="btn-reopen-submit"
                >
                  {submittingReopen ? 'Submitting…' : 'Submit Reopening Request'}
                </button>
              </form>
            </div>
          )}

          {/* Community Feedback List */}
          {feedbackList.length > 0 && (
            <div className="community-feedback-list">
              <h3>Community Ratings ({feedbackList.length})</h3>
              <div className="feedback-cards-grid">
                {feedbackList.map((fb) => (
                  <div key={fb.id} className="feedback-item-card">
                    <div className="feedback-item-header">
                      <span className="feedback-user">👤 {fb.user_name}</span>
                      <span className="feedback-stars">
                        {'★'.repeat(fb.rating)}{'☆'.repeat(5 - fb.rating)}
                      </span>
                    </div>
                    {fb.comment && <p className="feedback-comment">"{fb.comment}"</p>}
                    <span className="feedback-date">
                      {new Date(fb.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {reopenSuccess && (
        <div className="feedback-alert-success" style={{ margin: '1rem 0' }}>
          {reopenSuccess}
        </div>
      )}

      {/* Issue ID cross-reference */}
      {report.civic_issue_id && (
        <section className="issue-detail-section">
          <p className="issue-detail-crossref">
            This report is linked to Civic Issue #{report.civic_issue_id}.
            {report.report_count > 1 && ` ${report.report_count} citizens have reported this problem.`}
          </p>
        </section>
      )}
    </div>
  )
}

export default IssueDetail
