
import { useState } from 'react'
import AuthPanel from './components/AuthPanel'
import './App.css'

const categories = [
  { icon: '🛣️', name: 'Roads & Potholes', description: 'Damaged roads, potholes and broken footpaths' },
  { icon: '🗑️', name: 'Sanitation', description: 'Garbage accumulation and waste management' },
  { icon: '💧', name: 'Water Supply', description: 'Water leakage and drainage problems' },
  { icon: '💡', name: 'Street Lighting', description: 'Damaged or non-working streetlights' },
]

const steps = [
  { number: '01', title: 'Report the problem', description: 'Share a photo, location and description of the civic issue.' },
  { number: '02', title: 'Authorities take action', description: 'The responsible department reviews and works on the issue.' },
  { number: '03', title: 'Track the resolution', description: 'Follow progress and check the resolution evidence.' },
]

function App() {
  const [authOpen, setAuthOpen] = useState(false)
  const [session, setSession] = useState(null)
  const [notice, setNotice] = useState('')

  function openAuth() {
    setNotice('')
    setAuthOpen(true)
  }

  function handleLogin(newSession) {
    setSession(newSession)
    setAuthOpen(false)
    setNotice(`Welcome, ${newSession.user.name}!`)
  }

  function handleLogout() {
    setSession(null)
    setNotice('You have been logged out.')
  }

  function handleReportClick() {
    if (!session) {
      openAuth()
      return
    }

    setNotice('You are logged in. Report submission is coming next.')
  }

  return (
    <div className="app">
      <header className="navbar">
        <a className="brand" href="#">
          <span className="brand-mark">SF</span>
          <span>See<span className="brand-highlight">Fixit</span></span>
        </a>

        <nav className="nav-links">
          <a href="#categories">Categories</a>
          <a href="#how-it-works">How it works</a>
          <a href="#about">About</a>
        </nav>

        {session ? (
  <button className="nav-login" onClick={handleLogout}>
    Logout
  </button>
) : (
  <button className="nav-login" onClick={openAuth}>
    Get started
  </button>
)}
      </header>

      <main>
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
              <button className="button-primary" onClick={handleReportClick}>
                Report a civic issue <span>→</span>
                </button>
              <a className="button-secondary" href="#categories">
                Explore issues
              </a>
            </div>

            <div className="hero-note">
              <span className="status-dot"></span>
              Building cleaner, safer and better communities.
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-card">
              <div className="visual-card-header">
                <span>SEE IT. REPORT IT. FIX IT.</span>
                <span className="live-dot">● COMMUNITY</span>
              </div>

              <div className="visual-map">
                <div className="map-road road-one"></div>
                <div className="map-road road-two"></div>
                <div className="map-road road-three"></div>
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
            <div className="floating-badge">🏙️ Community powered</div>
          </div>
        </section>

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

        <section className="closing-banner" id="about">
          <span className="eyebrow">CHANGE STARTS WITH YOU</span>
          <h2>Better neighbourhoods begin with better reporting.</h2>
          <p>Together, we can make civic problems visible and encourage action.</p>
          <a href="#categories" className="button-light">Explore civic issues →</a>
        </section>
      </main>

      <footer className="footer">
        <a className="brand" href="#">
          <span className="brand-mark">SF</span>
          <span>See<span className="brand-highlight">Fixit</span></span>
        </a>
        <p>Making communities better, one report at a time.</p>
        <span>© {new Date().getFullYear()} SeeFixit</span>
            </footer>

      {notice && (
        <p className="app-notice" role="status">
          {notice}
        </p>
      )}

      {authOpen && (
        <AuthPanel
          onLogin={handleLogin}
          onClose={() => setAuthOpen(false)}
        />
      )}
    </div>
  )
}

export default App
