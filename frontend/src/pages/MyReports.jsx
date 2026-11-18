
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { reportApi } from '../services/api'
import './MyReports.css'

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#f59e0b', bg: '#fffbeb' },
  IN_PROGRESS: { label: 'In Progress', color: '#3b82f6', bg: '#eff6ff' },
  RESOLVED:    { label: 'Resolved',    color: '#10b981', bg: '#ecfdf5' },
  REJECTED:    { label: 'Rejected',    color: '#ef4444', bg: '#fef2f2' },
  ON_HOLD:     { label: 'On Hold',     color: '#8b5cf6', bg: '#f5f3ff' },
  REOPENED:    { label: 'Reopened',    color: '#f97316', bg: '#fff7ed' },
}

const CATEGORY_ICONS = {
  ROAD:       '🚧',
  SANITATION: '🗑️',
  WATER:      '💧',
  LIGHTING:   '💡',
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' }
  return (
    <span
      className="status-badge"
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.color }}
    >
      {cfg.label}
    </span>
  )
}

function MyReports({ token, onAuthRequired }) {
  const [reports, setReports]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [filter, setFilter]     = useState('ALL')

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
        const response = await reportApi.getMyReports(token)
        if (!active) return
        setReports(response?.data ?? [])
      } catch (err) {
        if (!active) return
        if (err.status === 401) {
          onAuthRequired?.()
        } else {
          setError(err.message || 'Failed to load your reports.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    load()

    return () => { active = false }
  }, [token])

  const filtered = filter === 'ALL'
    ? reports
    : reports.filter((r) => r.civic_issue_status === filter)

  const counts = {
    ALL:        reports.length,
    OPEN:       reports.filter((r) => r.civic_issue_status === 'OPEN').length,
    IN_PROGRESS:reports.filter((r) => r.civic_issue_status === 'IN_PROGRESS').length,
    RESOLVED:   reports.filter((r) => r.civic_issue_status === 'RESOLVED').length,
  }

  if (loading) {
    return (
      <div className="my-reports-container">
        <div className="my-reports-loading" aria-live="polite">
          <div className="spinner" />
          <p>Loading your reports…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="my-reports-container">
      <div className="my-reports-header">
        <div>
          <h1>My Reports</h1>
          <p>Track all the civic issues you have submitted.</p>
        </div>
        <Link to="/report" className="button-primary my-reports-cta">
          + Report a new issue
        </Link>
      </div>

      {error && (
        <div className="my-reports-error" role="alert">
          <p>{error}</p>
          <button onClick={() => window.location.reload()} className="report-cancel">
            Retry
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="my-reports-tabs" role="tablist">
        {[
          { key: 'ALL',         label: 'All' },
          { key: 'OPEN',        label: 'Open' },
          { key: 'IN_PROGRESS', label: 'In Progress' },
          { key: 'RESOLVED',    label: 'Resolved' },
        ].map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={filter === tab.key}
            className={`my-reports-tab ${filter === tab.key ? 'active' : ''}`}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label}
            <span className="tab-count">{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      {/* Reports list */}
      {filtered.length === 0 ? (
        <div className="my-reports-empty">
          <p>
            {filter === 'ALL'
              ? "You haven't submitted any reports yet."
              : `No ${STATUS_CONFIG[filter]?.label ?? filter} reports.`}
          </p>
        </div>
      ) : (
        <ul className="my-reports-list" aria-label="Your submitted reports">
          {filtered.map((report) => (
            <li key={report.id} className="my-report-card">
              <Link to={`/my-reports/${report.id}`} className="my-report-card-inner">
                <div className="my-report-card-top">
                  <span className="my-report-category-icon" aria-hidden="true">
                    {CATEGORY_ICONS[report.category] ?? '📌'}
                  </span>
                  <div className="my-report-card-titles">
                    <h3 className="my-report-title">{report.title}</h3>
                    <p className="my-report-category">{report.category.charAt(0) + report.category.slice(1).toLowerCase()}</p>
                  </div>
                  <StatusBadge status={report.civic_issue_status} />
                </div>

                <p className="my-report-description">
                  {report.description.length > 120
                    ? report.description.slice(0, 120) + '…'
                    : report.description}
                </p>

                <div className="my-report-card-footer">
                  <span className="my-report-id">Report #{report.id}</span>
                  <span className="my-report-date">
                    {new Date(report.created_at).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default MyReports
