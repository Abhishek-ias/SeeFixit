
import { useCallback, useEffect, useRef, useState } from 'react'
import { authApi } from '../services/api'
import './AuthPanel.css'

function AuthPanel({ onLogin, onClose }) {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const googleButtonRef = useRef(null)
  const googleInitializedRef = useRef(false)

  const onLoginRef = useRef(onLogin)
  onLoginRef.current = onLogin

  const isRegister = mode === 'register'

  const handleGoogleCredential = useCallback(async (credentialResponse) => {
  const idToken = credentialResponse?.credential

  if (!idToken) {
    setError('Google did not return a valid credential.')
    return
  }

  setError('')
  setMessage('')
  setLoading(true)

  try {
    const response = await authApi.googleLogin(idToken)

    const { token, user } = response.data ?? {}

    if (!token || !user) {
      throw new Error('Invalid Google login response from server.')
    }

    onLoginRef.current({ token, user })

  } catch (err) {
    setError(err.message || 'Google login failed. Please try again.')
  } finally {
    setLoading(false)
  }
}, [])


useEffect(() => {
  if (isRegister) return

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()

  if (!clientId) {
    setError('Google Sign-In is not configured.')
    return
  }

  let cancelled = false

  const googleScript = document.querySelector(
    'script[src="https://accounts.google.com/gsi/client"]'
  )

  function renderGoogleButton() {
    if (
      cancelled ||
      !window.google?.accounts?.id ||
      !googleButtonRef.current
    ) {
      return
    }

    const googleIdentity = window.google.accounts.id

    if (!googleInitializedRef.current) {
      googleIdentity.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
        auto_select: false,
      })

      googleInitializedRef.current = true
    }

    googleButtonRef.current.replaceChildren()

    googleIdentity.renderButton(
      googleButtonRef.current,
      {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: 320,
      }
    )
  }

  function handleScriptError() {
    if (!cancelled) {
      setError('Unable to load Google Sign-In. Check your internet connection.')
    }
  }

  if (window.google?.accounts?.id) {
    renderGoogleButton()
  } else if (googleScript) {
    googleScript.addEventListener('load', renderGoogleButton)
    googleScript.addEventListener('error', handleScriptError)
  } else {
    setError('Google Sign-In script was not found.')
  }

  return () => {
    cancelled = true

    googleScript?.removeEventListener('load', renderGoogleButton)
    googleScript?.removeEventListener('error', handleScriptError)
  }
}, [isRegister, handleGoogleCredential])

  async function handleSubmit(event) {
    event.preventDefault()

    setError('')
    setMessage('')

    setLoading(true)

    try {
      if (isRegister) {
        await authApi.register({
          name: name.trim(),
          email: email.trim(),
          password,
        })

        setMode('login')
        setName('')
        setPassword('')
        setMessage('Registration successful! Please log in.')
      } else {
        const response = await authApi.login({
          email: email.trim(),
          password,
        })

        const { token, user } = response.data

        if (!token || !user) {
          throw new Error('Invalid login response from server.')
        }

        setPassword('')
        onLogin({ token, user })
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function switchMode() {
    setMode(isRegister ? 'login' : 'register')
    setError('')
    setMessage('')
    setPassword('')
  }

  return (
    <div className="auth-overlay">
      <section className="auth-panel">
        {onClose && (
          <button
            type="button"
            className="auth-close"
            onClick={onClose}
            aria-label="Close authentication"
          >
            ×
          </button>
        )}

        <div className="auth-heading">
          <span className="auth-logo">SF</span>

          <h2>{isRegister ? 'Create your account' : 'Welcome back'}</h2>

          <p>
            {isRegister
              ? 'Join your community and help improve your neighbourhood.'
              : 'Log in to continue with SeeFixit.'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="auth-field">
              <label htmlFor="auth-name">Full name</label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={100}
                autoComplete="name"
                required
              />
            </div>
          )}

          <div className="auth-field">
            <label htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={150}
              autoComplete="email"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              maxLength={100}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
            />
          </div>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          {message && (
            <p className="auth-success" role="status">
              {message}
            </p>
          )}

          <button
            className="auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'Please wait...'
              : isRegister
                ? 'Create account'
                : 'Log in'}
          </button>
        </form>

        {!isRegister && (
          <div className="google-auth">
            <div className="auth-divider">
              <span>or continue with</span>
            </div>

            <div
              ref={googleButtonRef}
              className="google-button-container"
            />
          </div>
        )}

        <p className="auth-switch">
          {isRegister
            ? 'Already have an account?'
            : "Don't have an account?"}

          <button type="button" onClick={switchMode}>
            {isRegister ? 'Log in' : 'Register'}
          </button>
        </p>
      </section>
    </div>
  )
}

export default AuthPanel
