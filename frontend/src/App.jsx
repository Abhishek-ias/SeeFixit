
import { useEffect, useState } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useNavigate,
} from 'react-router-dom'

import AuthPanel  from './components/AuthPanel'
import ReportForm from './components/ReportForm'
import MyReports  from './pages/MyReports'
import IssueDetail from './pages/IssueDetail'
import AdminDashboard from './pages/AdminDashboard'
import MapView from './pages/MapView'
import PublicTracker from './pages/PublicTracker'
import NotificationBell from './components/NotificationBell'

import { authApi } from './services/api'
import './App.css'

const categories = [
  { icon: '🚧', name: 'Roads & Potholes',  description: 'Damaged roads, potholes and broken footpaths' },
  { icon: '🗑️', name: 'Sanitation',        description: 'Garbage accumulation and waste management' },
  { icon: '💧', name: 'Water Supply',      description: 'Water leakage and drainage problems' },
  { icon: '💡', name: 'Street Lighting',   description: 'Damaged or non-working streetlights' },
]

const steps = [
  { number: '01', title: 'Report the problem',      description: 'Share a photo, location and description of the civic issue.' },
  { number: '02', title: 'Authorities take action', description: 'The responsible department reviews and works on the issue.' },
  { number: '03', title: 'Track the resolution',    description: 'Follow progress and check the resolution evidence.' },
]

const currentYear = new Date().getFullYear()

// ── Inner app (has access to useNavigate) ───────────
function AppInner() {
  const navigate  = useNavigate()

  const [authOpen,     setAuthOpen]     = useState(false)
  const [session,      setSession]      = useState(null)
  const [authLoading,  setAuthLoading]  = useState(true)
  const [notice,       setNotice]       = useState('')
  const [reportOpen,   setReportOpen]   = useState(false)

  // Auto-dismiss notice
  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(''), 4000)
    return () => clearTimeout(id)
  }, [notice])

  // Restore session on mount
  useEffect(() => {
    let active = true

    async function restoreSession() {
      try {
        const response = await authApi.refresh()
        if (!active) return
        const { token, user } = response?.data ?? {}
        if (token && user) setSession({ token, user })
        else setSession(null)
      } catch (error) {
        if (!active) return
        if (error.status !== 401) {
          console.error('Session restoration failed:', error)
          setNotice('Unable to verify your saved session. Please check your connection.')
        }
        setSession(null)
      } finally {
        if (active) setAuthLoading(false)
      }
    }

    restoreSession()
    return () => { active = false }
  }, [])

  function openAuth() {
    setNotice('')
    setAuthOpen(true)
  }

  function handleLogin(newSession) {
    setSession(newSession)
    setAuthOpen(false)
    setNotice(`Welcome, ${newSession.user.name}!`)
  }

  async function handleLogout() {
    try {
      await authApi.logout()
      setSession(null)
      setNotice('You have been logged out.')
      navigate('/')
    } catch (error) {
      setNotice(error.message || 'Unable to log out. Please try again.')
    }
  }

  function handleReportClick() {
    if (authLoading) return
    if (!session) { openAuth(); return }
    setNotice('')
    setReportOpen(true)
  }

  function handleAuthRequired() {
    setNotice('Please log in to continue.')
    openAuth()
  }

  return (
    <div className="app">
      {/* ── Navbar ── */}
      <header className="navbar">
        <Link className="brand" to="/">
          <span className="brand-mark">SF</span>
          <span>See<span className="brand-highlight">Fixit</span></span>
        </Link>

        <nav className="nav-links">
          <Link to="/map" className="nav-dashboard-link">
            Civic Map 🗺️
          </Link>
          <Link to="/track" className="nav-dashboard-link">
            Track Issue 🔍
          </Link>
          <a href="/#categories">Categories</a>
          <a href="/#how-it-works">How it works</a>
          <a href="/#about">About</a>
          {session && (
            <Link to="/my-reports" className="nav-dashboard-link">
              My Reports
            </Link>
          )}
          {session?.user?.role === 'ADMIN' && (
            <Link to="/admin" className="nav-admin-link">
              Authority Portal 🏛️
            </Link>
          )}
        </nav>

        {authLoading ? (
          <button className="nav-login" disabled>Checking session…</button>
        ) : session ? (
          <div className="nav-user">
            <NotificationBell token={session.token} />
            <span className="nav-username">{session.user.name}</span>
            <button className="nav-login" onClick={handleLogout}>Logout</button>
          </div>
        ) : (
          <button className="nav-login" onClick={openAuth}>Get started</button>
        )}
      </header>

      {/* ── Routes ── */}
      <main>
        <Routes>
          {/* Home page */}
          <Route
            path="/"
            element={
              <>
                {/* Hero */}
                <section className="hero">
                  <div className="hero-content">
                    <span className="eyebrow">YOUR CITY. YOUR VOICE. YOUR IMPACT.</span>

                    <h1>
                      See a problem?
                      <br />
                      <span>Let's fix it together.</span>
                    </h1>

                    <p>
                      Report civic issues in your neighbourhood, help authorities
                      take action and make your community a better place to live.
                    </p>

                    <div className="hero-actions">
                      <button
                        className="button-primary"
                        onClick={handleReportClick}
                        disabled={authLoading}
                      >
                        Report a civic issue <span>{'→'}</span>
                      </button>

                      <Link to="/map" className="button-secondary">
                        Explore live map 🗺️
                      </Link>
                    </div>

                    {session && (
                      <div className="hero-dashboard-link">
                        <Link to="/my-reports" className="button-secondary">
                          📋 View my reports
                        </Link>
                      </div>
                    )}

                    <div className="hero-note">
                      <span className="status-dot" />
                      Building cleaner, safer and better communities.
                    </div>
                  </div>

                  <div className="hero-visual">
                    <div className="visual-card">
                      <div className="visual-card-header">
                        <span>SEE IT. REPORT IT. FIX IT.</span>
                        <span className="live-dot">{'•'} COMMUNITY</span>
                      </div>

                      <div className="visual-map">
                        <div className="map-road road-one" />
                        <div className="map-road road-two" />
                        <div className="map-road road-three" />
                        <div className="map-pin pin-one">📍</div>
                        <div className="map-pin pin-two">📍</div>
                        <div className="map-pin pin-three">📍</div>
                        <div className="map-label">YOUR NEIGHBOURHOOD</div>
                      </div>

                      <div className="visual-card-footer">
                        <div>
                          <strong>Local problems</strong>
                          <span>Deserve visible solutions.</span>
                        </div>
                        <span className="visual-arrow">↗</span>
                      </div>
                    </div>

                    <div className="floating-badge">🙌 Community powered</div>
                  </div>
                </section>

                {/* Categories */}
                <section className="categories section" id="categories">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">WHAT NEEDS ATTENTION?</span>
                      <h2>Report issues around you</h2>
                    </div>
                    <p>Choose a category to understand the types of civic problems SeeFixit supports.</p>
                  </div>

                  <div className="category-grid">
                    {categories.map((category) => (
                      <article className="category-card" key={category.name}>
                        <span className="category-icon">{category.icon}</span>
                        <h3>{category.name}</h3>
                        <p>{category.description}</p>
                        <span className="card-arrow">↗</span>
                      </article>
                    ))}
                  </div>
                </section>

                {/* How it works */}
                <section className="how-it-works section" id="how-it-works">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">SIMPLE. TRANSPARENT. ACCOUNTABLE.</span>
                      <h2>How SeeFixit works</h2>
                    </div>
                  </div>

                  <div className="steps-grid">
                    {steps.map((step) => (
                      <article className="step-card" key={step.number}>
                        <span className="step-number">{step.number}</span>
                        <h3>{step.title}</h3>
                        <p>{step.description}</p>
                      </article>
                    ))}
                  </div>
                </section>

                {/* Closing */}
                <section className="closing-banner" id="about">
                  <span className="eyebrow">CHANGE STARTS WITH YOU</span>
                  <h2>Better neighbourhoods begin with better reporting.</h2>
                  <p>Together, we can make civic problems visible and encourage action.</p>
                  <a href="#categories" className="button-light">Explore civic issues →</a>
                </section>
              </>
            }
          />

          {/* Interactive GIS Civic Map */}
          <Route
            path="/map"
            element={<MapView />}
          />

          {/* Citizen dashboard */}
          <Route
            path="/my-reports"
            element={
              <MyReports
                token={session?.token}
                onAuthRequired={handleAuthRequired}
              />
            }
          />

          {/* Authority / Admin portal */}
          <Route
            path="/admin"
            element={
              <AdminDashboard
                token={session?.token}
                user={session?.user}
                onAuthRequired={handleAuthRequired}
              />
            }
          />

          {/* Report detail */}
          <Route
            path="/my-reports/:id"
            element={
              <IssueDetail
                token={session?.token}
                onAuthRequired={handleAuthRequired}
              />
            }
          />

          {/* Public Complaint Tracker */}
          <Route path="/track" element={<PublicTracker />} />
          <Route path="/track/:id" element={<PublicTracker />} />

          {/* 404 */}
          <Route
            path="*"
            element={
              <div className="not-found">
                <h2>404 — Page not found</h2>
                <Link to="/" className="button-primary">Go home</Link>
              </div>
            }
          />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="footer">
        <Link className="brand" to="/">
          <span className="brand-mark">SF</span>
          <span>See<span className="brand-highlight">Fixit</span></span>
        </Link>
        <p>Making communities better, one report at a time.</p>
        <span>© {currentYear} SeeFixit</span>
      </footer>

      {/* Notice banner */}
      {notice && (
        <div className="app-notice" role="status" aria-live="polite">
          <span>{notice}</span>
          <button
            type="button"
            className="app-notice-dismiss"
            onClick={() => setNotice('')}
            aria-label="Dismiss notification"
          >
            &times;
          </button>
        </div>
      )}

      {/* Auth modal */}
      {authOpen && (
        <AuthPanel
          onLogin={handleLogin}
          onClose={() => setAuthOpen(false)}
        />
      )}

      {/* Report form modal */}
      {reportOpen && (
        <ReportForm
          token={session?.token}
          onClose={() => setReportOpen(false)}
          onReportCreated={(report) => {
            setReportOpen(false)
            setNotice(`Report #${report.id} submitted successfully.`)
            navigate('/my-reports')
          }}
        />
      )}
    </div>
  )
}

// ── Root with BrowserRouter ──────────────────────────
function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  )
}

export default App
