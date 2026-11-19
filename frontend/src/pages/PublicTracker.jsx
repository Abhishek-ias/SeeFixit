import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { publicApi, issueApi, wardApi } from '../services/api'
import './PublicTracker.css'

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#f59e0b', bg: '#fffbeb', icon: '🟡' },
  IN_PROGRESS: { label: 'In Progress', color: '#3b82f6', bg: '#eff6ff', icon: '🔵' },
  ON_HOLD:     { label: 'On Hold',     color: '#8b5cf6', bg: '#f5f3ff', icon: '🟣' },
  RESOLVED:    { label: 'Resolved',    color: '#10b981', bg: '#ecfdf5', icon: '🟢' },
  REJECTED:    { label: 'Rejected',    color: '#ef4444', bg: '#fef2f2', icon: '🔴' },
  REOPENED:    { label: 'Reopened',    color: '#f97316', bg: '#fff7ed', icon: '🟠' },
}

function PublicTracker({ token, onAuthRequired }) {
  const { id: paramId } = useParams()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('track') // 'track' | 'ward'
  const [searchId, setSearchId] = useState(paramId || '')
  const [issue, setIssue] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Community upvote state
  const [hasUpvoted, setHasUpvoted] = useState(false)
  const [upvoteCount, setUpvoteCount] = useState(0)
  const [upvoteLoading, setUpvoteLoading] = useState(false)

  // Ward Explorer state
  const [wards, setWards] = useState([])
  const [selectedWardId, setSelectedWardId] = useState('')
  const [wardAnalytics, setWardAnalytics] = useState(null)
  const [wardIssues, setWardIssues] = useState([])
  const [wardStatusFilter, setWardStatusFilter] = useState('')
  const [wardLoading, setWardLoading] = useState(false)

  // Load Issue when paramId changes
  useEffect(() => {
    if (!paramId) return
    let active = true

    async function fetchIssue() {
      setLoading(true)
      setError('')
      setIssue(null)
      try {
        const res = await publicApi.getIssueTracking(paramId)
        if (!active) return
        if (res?.data) {
          setIssue(res.data)
          setUpvoteCount(res.data.upvote_count || 0)

          // Check if current user has upvoted
          if (token) {
            try {
              const statusRes = await issueApi.getUpvoteStatus(paramId, token)
              if (active && statusRes?.data) {
                setHasUpvoted(statusRes.data.upvoted)
                setUpvoteCount(statusRes.data.upvote_count)
              }
            } catch {
              // Non-blocking
            }
          }
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
  }, [paramId, token])

  // Load wards list for the Ward Feed tab
  useEffect(() => {
    let active = true
    async function fetchWards() {
      try {
        const res = await wardApi.getAll()
        if (active && res?.data && res.data.length > 0) {
          setWards(res.data)
          if (!selectedWardId) {
            // Select first non-fallback ward or fallback
            const first = res.data.find(w => w.ward_number !== 'WARD-100') || res.data[0]
            setSelectedWardId(first.id)
          }
        }
      } catch {
        // Silently handled
      }
    }
    fetchWards()
    return () => { active = false }
  }, [selectedWardId])

  // Load ward analytics and issues when ward or filter changes
  useEffect(() => {
    if (!selectedWardId || activeTab !== 'ward') return
    let active = true

    async function fetchWardData() {
      setWardLoading(true)
      try {
        const [analyticsRes, issuesRes] = await Promise.all([
          wardApi.getAnalytics(selectedWardId),
          wardApi.getIssues(selectedWardId, { status: wardStatusFilter })
        ])
        if (!active) return
        setWardAnalytics(analyticsRes?.data || null)
        setWardIssues(issuesRes?.data?.issues || [])
      } catch (err) {
        if (!active) return
        console.error('Failed to load ward data:', err.message)
      } finally {
        if (active) setWardLoading(false)
      }
    }

    fetchWardData()
    return () => { active = false }
  }, [selectedWardId, wardStatusFilter, activeTab])

  const handleSearch = (e) => {
    e.preventDefault()
    const cleanId = searchId.trim().replace('#', '')
    if (!cleanId) return
    setActiveTab('track')
    navigate(`/track/${cleanId}`)
  }

  const handleToggleUpvote = async () => {
    if (!token) {
      if (onAuthRequired) onAuthRequired()
      return
    }
    if (!issue || upvoteLoading) return

    setUpvoteLoading(true)
    try {
      const res = await issueApi.toggleUpvote(issue.id, token)
      if (res?.data) {
        setHasUpvoted(res.data.upvoted)
        setUpvoteCount(res.data.upvote_count)
      }
    } catch (err) {
      alert(err.message || 'Failed to update community endorsement.')
    } finally {
      setUpvoteLoading(false)
    }
  }

  const statusCfg = issue ? (STATUS_CONFIG[issue.status] ?? { label: issue.status, color: '#64748b', bg: '#f1f5f9', icon: '⚪' }) : null

  return (
    <div className="tracker-container">
      {/* Search Header */}
      <div className="tracker-hero">
        <span className="tracker-eyebrow">MUNICIPAL CIVIC TRANSPARENCY</span>
        <h1>Public Complaint Tracker & Ward Feed</h1>
        <p>
          Verify the real-time investigation and resolution progress of any civic problem across the city.
        </p>

        {/* Navigation Tabs */}
        <div className="tracker-tabs">
          <button
            type="button"
            className={`tracker-tab-btn ${activeTab === 'track' ? 'active' : ''}`}
            onClick={() => setActiveTab('track')}
          >
            🔍 Track by Complaint ID
          </button>
          <button
            type="button"
            className={`tracker-tab-btn ${activeTab === 'ward' ? 'active' : ''}`}
            onClick={() => setActiveTab('ward')}
          >
            🏛️ Municipal Ward Neighborhood Feed
          </button>
        </div>

        {activeTab === 'track' && (
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
        )}
      </div>

      {/* ── TAB 1: TRACK BY ID ── */}
      {activeTab === 'track' && (
        <>
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
                      {issue.ward_number && (
                        <>
                          <span>·</span>
                          <span>📍 {issue.ward_number} ({issue.ward_name})</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="tracker-badges">
                  {/* Community Corroboration Upvote Button */}
                  <button
                    type="button"
                    className={`tracker-upvote-btn ${hasUpvoted ? 'upvoted' : ''}`}
                    onClick={handleToggleUpvote}
                    disabled={upvoteLoading}
                    title={token ? (hasUpvoted ? "You have corroborated this problem" : "I am also affected by this issue") : "Log in to endorse this issue"}
                  >
                    <span className="upvote-thumb">👍</span>
                    <span className="upvote-label">
                      {hasUpvoted ? 'Corroborated' : 'I am affected'}
                    </span>
                    <span className="upvote-badge">{upvoteCount}</span>
                  </button>

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
        </>
      )}

      {/* ── TAB 2: MUNICIPAL WARD NEIGHBORHOOD FEED ── */}
      {activeTab === 'ward' && (
        <div className="ward-feed-wrapper">
          {/* Ward Selector Bar */}
          <div className="ward-selector-bar">
            <label htmlFor="ward-select"><strong>🏛️ Select Municipal Ward:</strong></label>
            <select
              id="ward-select"
              value={selectedWardId}
              onChange={(e) => setSelectedWardId(e.target.value)}
              className="ward-select-dropdown"
            >
              {wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.ward_number}: {w.name} ({w.zone_name})
                </option>
              ))}
            </select>
          </div>

          {/* Ward Analytics Header Cards */}
          {wardAnalytics && (
            <div className="ward-metrics-grid">
              <div className="ward-metric-card">
                <span className="ward-metric-val">{wardAnalytics.total_issues}</span>
                <span className="ward-metric-lbl">Total Grievances</span>
              </div>
              <div className="ward-metric-card active-card">
                <span className="ward-metric-val">{wardAnalytics.active_issues}</span>
                <span className="ward-metric-lbl">Active Investigation</span>
              </div>
              <div className="ward-metric-card resolved-card">
                <span className="ward-metric-val">{wardAnalytics.resolved_issues}</span>
                <span className="ward-metric-lbl">Resolved</span>
              </div>
              <div className="ward-metric-card upvotes-card">
                <span className="ward-metric-val">👍 {wardAnalytics.total_upvotes || 0}</span>
                <span className="ward-metric-lbl">Community Endorsements</span>
              </div>
            </div>
          )}

          {/* Ward Status Filter Tabs */}
          <div className="ward-filter-row">
            <span className="filter-title">Filter Ward Issues:</span>
            <div className="ward-filter-buttons">
              <button
                type="button"
                className={`ward-filter-btn ${wardStatusFilter === '' ? 'active' : ''}`}
                onClick={() => setWardStatusFilter('')}
              >
                All Issues
              </button>
              <button
                type="button"
                className={`ward-filter-btn ${wardStatusFilter === 'OPEN' ? 'active' : ''}`}
                onClick={() => setWardStatusFilter('OPEN')}
              >
                🟡 Open
              </button>
              <button
                type="button"
                className={`ward-filter-btn ${wardStatusFilter === 'IN_PROGRESS' ? 'active' : ''}`}
                onClick={() => setWardStatusFilter('IN_PROGRESS')}
              >
                🔵 In Progress
              </button>
              <button
                type="button"
                className={`ward-filter-btn ${wardStatusFilter === 'RESOLVED' ? 'active' : ''}`}
                onClick={() => setWardStatusFilter('RESOLVED')}
              >
                🟢 Resolved
              </button>
            </div>
          </div>

          {/* Ward Issues List */}
          {wardLoading ? (
            <div className="tracker-loading">
              <div className="spinner" />
              <p>Loading neighborhood issues…</p>
            </div>
          ) : wardIssues.length === 0 ? (
            <div className="ward-empty-state">
              <p>No civic issues reported in this ward matching the selected filter.</p>
            </div>
          ) : (
            <div className="ward-issues-feed">
              {wardIssues.map((item) => {
                const itemCfg = STATUS_CONFIG[item.status] ?? { label: item.status, color: '#64748b', bg: '#f1f5f9', icon: '⚪' }
                return (
                  <article
                    key={item.id}
                    className="ward-issue-card"
                    onClick={() => {
                      setActiveTab('track')
                      navigate(`/track/${item.id}`)
                    }}
                  >
                    <div className="ward-issue-main">
                      <div className="ward-issue-header">
                        <span className="ward-issue-id">#{item.id}</span>
                        <span
                          className="tracker-status-pill compact"
                          style={{ color: itemCfg.color, background: itemCfg.bg, borderColor: itemCfg.color }}
                        >
                          {itemCfg.icon} {itemCfg.label}
                        </span>
                        {item.is_escalated && (
                          <span className="escalated-pill">⚡ SLA Breached</span>
                        )}
                      </div>
                      <h4 className="ward-issue-title">{item.title}</h4>
                      <div className="ward-issue-sub">
                        <span>🏛️ {item.department_name}</span>
                        <span>·</span>
                        <span>👥 {item.report_count} report{item.report_count !== 1 ? 's' : ''}</span>
                        {item.upvote_count > 0 && (
                          <>
                            <span>·</span>
                            <span>👍 {item.upvote_count} affected</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="ward-issue-action">
                      <span className="track-link-pill">Track Progress ↗</span>
                    </div>
                  </article>
                )
              })}
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
