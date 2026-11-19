import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { publicApi } from '../services/api'
import './PublicTracker.css'

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#f59e0b', bg: '#fffbeb', icon: '🟡' },
  IN_PROGRESS: { label: 'In Progress', color: '#3b82f6', bg: '#eff6ff', icon: '🔵' },
  ON_HOLD:     { label: 'On Hold',     color: '#8b5cf6', bg: '#f5f3ff', icon: '🟣' },
  RESOLVED:    { label: 'Resolved',    color: '#10b981', bg: '#ecfdf5', icon: '🟢' },
  REJECTED:    { label: 'Rejected',    color: '#ef4444', bg: '#fef2f2', icon: '🔴' },
  REOPENED:    { label: 'Reopened',    color: '#f97316', bg: '#fff7ed', icon: '🟠' },
}

function PublicTracker() {
  const { id: paramId } = useParams()
  const navigate = useNavigate()

  const [searchId, setSearchId] = useState(paramId || '')
  const [issue, setIssue] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!paramId) return
    let active = true

    async function fetchIssue() {
      setLoading(true)
      setError('')
      try {
        const res = await publicApi.getIssueTracking(paramId)
        if (!active) return
        if (res?.data) {
          setIssue(res.data)
        } else {
          setError('Issue not found.')
        }
      } catch (err) {
        if (!active) return
        setError(err.message || 'Issue not found. Please verify the Issue ID.')
        setIssue(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    fetchIssue()
    return () => { active = false }
  }, [paramId])

  const handleSearch = (e) => {
    e.preventDefault()
    const cleanId = searchId.trim().replace('#', '')
    if (!cleanId) return
    navigate(`/track/${cleanId}`)
  }

  const statusCfg = issue ? (STATUS_CONFIG[issue.status] ?? { label: issue.status, color: '#64748b', bg: '#f1f5f9', icon: '⚪' }) : null

  return (
    <div className="tracker-container">
      {/* Search Header */}
      <div className="tracker-hero">
        <span className="tracker-eyebrow">MUNICIPAL CIVIC TRANSPARENCY</span>
        <h1>Public Complaint Tracker</h1>
        <p>
          Verify the real-time investigation and resolution progress of any civic problem across the city.
        </p>

        <form onSubmit={handleSearch} className="tracker-search-form">
          <input
            type="text"
            placeholder="Enter Complaint / Issue ID (e.g. 198)"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Searching…' : 'Track Issue 🔍'}
          </button>
        </form>
      </div>

      {/* Error state */}
      {error && (
        <div className="tracker-error-card">
          <p>⚠️ {error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="tracker-loading">
          <div className="spinner" />
          <p>Fetching public civic record…</p>
        </div>
      )}

      {/* Issue Details View */}
      {issue && !loading && (
        <div className="tracker-card">
          <div className="tracker-card-header">
            <div className="tracker-title-group">
              <span className="tracker-cat-icon">{issue.category_icon || '📌'}</span>
              <div>
                <h2>{issue.title}</h2>
                <div className="tracker-meta">
                  <span>Issue #{issue.id}</span>
                  <span>·</span>
                  <span>{issue.category_name || issue.category}</span>
                  <span>·</span>
                  <span>🏛️ {issue.department_name}</span>
                </div>
              </div>
            </div>

            <div className="tracker-badges">
              <span
                className="tracker-status-pill"
                style={{ color: statusCfg.color, background: statusCfg.bg, borderColor: statusCfg.color }}
              >
                {statusCfg.icon} {statusCfg.label}
              </span>

              {issue.sla_status === 'WITHIN_SLA' && (
                <span className="tracker-sla-pill within-sla">
                  🟢 {issue.sla_hours_remaining}h SLA left
                </span>
              )}
              {issue.sla_status === 'OVERDUE' && (
                <span className="tracker-sla-pill overdue">
                  🔴 Overdue by {Math.abs(issue.sla_hours_remaining)}h
                </span>
              )}
              {issue.sla_status === 'SLA_MET' && (
                <span className="tracker-sla-pill sla-met">
                  ✅ Resolved in SLA
                </span>
              )}
              {issue.sla_status === 'SLA_BREACHED' && (
                <span className="tracker-sla-pill sla-breached">
                  ⚠️ SLA Breached
                </span>
              )}
            </div>
          </div>

          {/* Before & After Photo Evidence Verification */}
          {(issue.initial_image || issue.resolution_image) && (
            <div className="tracker-evidence-grid">
              {issue.initial_image && (
                <div className="tracker-photo-card">
                  <div className="photo-label citizen-label">📸 Reported by Citizen</div>
                  <img src={issue.initial_image} alt="Reported problem" loading="lazy" />
                </div>
              )}

              {issue.resolution_image ? (
                <div className="tracker-photo-card">
                  <div className="photo-label officer-label">✅ Resolution Evidence by Authority</div>
                  <img src={issue.resolution_image} alt="Resolved problem" loading="lazy" />
                  {issue.resolution_notes && (
                    <p className="resolution-caption">"{issue.resolution_notes}"</p>
                  )}
                </div>
              ) : (
                <div className="tracker-photo-card awaiting-evidence">
                  <div className="awaiting-icon">⏳</div>
                  <p>Authority resolution evidence pending investigation.</p>
                </div>
              )}
            </div>
          )}

          {/* Location details */}
          {(issue.latitude || issue.longitude) && (
            <div className="tracker-section">
              <h3>📍 Geographic Location</h3>
              <p className="tracker-coords">
                Coordinates: {Number(issue.latitude).toFixed(6)}, {Number(issue.longitude).toFixed(6)}
                {' · '}
                <a
                  href={`https://www.openstreetmap.org/?mlat=${issue.latitude}&mlon=${issue.longitude}&zoom=17`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tracker-map-link"
                >
                  View on OpenStreetMap ↗
                </a>
              </p>
            </div>
          )}

          {/* Timeline */}
          {issue.timeline && issue.timeline.length > 0 && (
            <div className="tracker-section">
              <h3>Status History Timeline</h3>
              <div className="tracker-timeline">
                {issue.timeline.map((step, idx) => (
                  <div key={idx} className="tracker-timeline-step">
                    <div className="timeline-marker" />
                    <div className="timeline-details">
                      <strong>Status updated to {step.status}</strong>
                      <span className="timeline-time">
                        {new Date(step.changed_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                      {step.note && <p className="timeline-note">"{step.note}"</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Citizen satisfaction feedback */}
          {issue.feedback && (
            <div className="tracker-section tracker-feedback-box">
              <h3>Citizen Satisfaction Rating</h3>
              <div className="feedback-stars-row">
                <span className="stars-val">{'★'.repeat(Math.round(issue.feedback.avg_rating || 5))}</span>
                <strong>{issue.feedback.avg_rating || '5.0'} / 5.0</strong>
                <span className="feedback-count">({issue.feedback.total_feedback} community ratings)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer navigation */}
      <div className="tracker-footer-links">
        <Link to="/">← Back to Home</Link>
        <Link to="/map">Explore Civic Map 🗺️</Link>
      </div>
    </div>
  )
}

export default PublicTracker
