
import { useState, useRef, useEffect } from 'react'
import { reportApi, aiApi, categoryApi, wardApi } from '../services/api'
import './ReportForm.css'

const DEFAULT_CATEGORIES = [
  { value: 'ROAD',       label: 'Roads & Potholes' },
  { value: 'SANITATION', label: 'Sanitation' },
  { value: 'WATER',      label: 'Water Supply' },
  { value: 'LIGHTING',   label: 'Street Lighting' },
]

const MAX_IMAGE_BYTES = 5 * 1024 * 1024  // 5 MB

function validateField(field, value) {
  const trimmedValue = typeof value === 'string' ? value.trim() : value

  if (field === 'title') {
    if (!trimmedValue) return 'Issue title is required.'
    if (trimmedValue.length < 5) return 'Title must contain at least 5 characters.'
    if (trimmedValue.length > 200) return 'Title cannot exceed 200 characters.'
  }

  if (field === 'description') {
    if (!trimmedValue) return 'Description is required.'
    if (trimmedValue.length < 10) return 'Description must contain at least 10 characters.'
    if (trimmedValue.length > 1000) return 'Description cannot exceed 1000 characters.'
  }

  if (field === 'category' && !trimmedValue) {
    return 'Please select a valid issue category.'
  }

  return ''
}

function ReportForm({ token, onClose, onReportCreated }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'ROAD',
  })

  const [location, setLocation] = useState({ latitude: '', longitude: '' })
  const [errors, setErrors]     = useState({})
  const [touched, setTouched]   = useState({})
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Image state
  const [imageFile, setImageFile]       = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageError, setImageError]     = useState('')
  const fileInputRef = useRef(null)

  // Duplicate warning state
  const [nearbyIssues, setNearbyIssues]       = useState([])
  const [duplicateChecked, setDuplicateChecked] = useState(false)
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false)
  const [pendingSubmit, setPendingSubmit]       = useState(null)

  // AI assistant state
  const [aiSuggestion, setAiSuggestion] = useState(null)

  // Dynamic configurable categories state
  const [availableCategories, setAvailableCategories] = useState(DEFAULT_CATEGORIES)

  useEffect(() => {
    let active = true
    async function loadCategories() {
      try {
        const res = await categoryApi.getAll()
        if (active && res?.data && Array.isArray(res.data) && res.data.length > 0) {
          setAvailableCategories(
            res.data.map((c) => ({
              value: c.code,
              label: c.name,
              icon: c.icon
            }))
          )
        }
      } catch {
        // Fallback to DEFAULT_CATEGORIES
      }
    }
    loadCategories()
    return () => { active = false }
  }, [])

  // Municipal Wards Jurisdiction state
  const [wards, setWards] = useState([])

  useEffect(() => {
    let active = true
    async function loadWards() {
      try {
        const res = await wardApi.getAll()
        if (active && res?.data && Array.isArray(res.data)) {
          setWards(res.data)
        }
      } catch {
        // Non-blocking
      }
    }
    loadWards()
    return () => { active = false }
  }, [])

  // Derive detected ward during render
  const detectedWard = (() => {
    if (!location.latitude || !location.longitude || !wards.length) return null
    const lat = Number(location.latitude)
    const lng = Number(location.longitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

    return (
      wards.find((w) =>
        w.ward_number !== 'WARD-100' &&
        lat >= Number(w.min_lat) && lat <= Number(w.max_lat) &&
        lng >= Number(w.min_lng) && lng <= Number(w.max_lng)
      ) || wards.find((w) => w.ward_number === 'WARD-100') || null
    )
  })()

  // ── field helpers ───────────────────────────────────────
  function updateField(field, value) {
    setFormData((cur) => ({ ...cur, [field]: value }))
    if (touched[field]) {
      setErrors((cur) => ({ ...cur, [field]: validateField(field, value) }))
    }
  }

  function updateLocation(field, value) {
    setLocation((cur) => ({ ...cur, [field]: value }))
    setLocationError('')
    setDuplicateChecked(false)
  }

  function handleBlur(field) {
    setTouched((cur) => ({ ...cur, [field]: true }))
    setErrors((cur) => ({ ...cur, [field]: validateField(field, formData[field]) }))

    if ((field === 'title' || field === 'description') && formData.title.trim().length >= 4) {
      aiApi.analyze(formData.title, formData.description)
        .then((res) => {
          if (res?.data) setAiSuggestion(res.data)
        })
        .catch(() => {})
    }
  }

  // ── GPS ─────────────────────────────────────────────────
  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError('Location is not supported by this browser. Enter coordinates manually.')
      return
    }

    setLocating(true)
    setLocationError('')
    setDuplicateChecked(false)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          latitude:  pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        })
        setLocating(false)
      },
      (err) => {
        let message = 'Unable to get your location. Enter coordinates manually.'
        if (err.code === err.PERMISSION_DENIED)    message = 'Location permission denied. Enter coordinates manually.'
        if (err.code === err.POSITION_UNAVAILABLE) message = 'Your location is unavailable. Try again or enter coordinates manually.'
        if (err.code === err.TIMEOUT)              message = 'Location request timed out. Please try again.'
        setLocationError(message)
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  // ── Image selection ──────────────────────────────────────
  function handleImageChange(event) {
    const file = event.target.files[0]
    setImageError('')

    if (!file) {
      setImageFile(null)
      setImagePreview(null)
      return
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']

    if (!allowedTypes.includes(file.type)) {
      setImageError('Only JPEG, PNG, and WebP images are accepted.')
      event.target.value = ''
      return
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Image must not exceed 5 MB.')
      event.target.value = ''
      return
    }

    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function handleRemoveImage() {
    setImageFile(null)
    setImagePreview(null)
    setImageError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  // ── Duplicate check ──────────────────────────────────────
  async function checkDuplicates(lat, lng, category) {
    try {
      const response = await reportApi.getNearby({ lat, lng, category })
      return response?.data ?? []
    } catch {
      return []  // fail silently — do not block submission
    }
  }

  // ── Submit ───────────────────────────────────────────────
  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')

    // Validate text fields
    const fields = ['title', 'description', 'category']
    const validationErrors = Object.fromEntries(
      fields.map((f) => [f, validateField(f, formData[f])])
    )
    setTouched({ title: true, description: true, category: true })
    setErrors(validationErrors)

    if (Object.values(validationErrors).some(Boolean)) return

    // Validate location
    const latText = String(location.latitude).trim()
    const lngText = String(location.longitude).trim()

    if (!latText || !lngText) {
      setLocationError('Please use your current location or enter both coordinates.')
      return
    }

    const latitude  = Number(latText)
    const longitude = Number(lngText)

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      setLocationError('Enter a valid latitude between -90 and 90.')
      return
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setLocationError('Enter a valid longitude between -180 and 180.')
      return
    }

    if (!token) {
      setSubmitError('Your session has expired. Please log in again.')
      return
    }

    // Duplicate check (run once; skip if already shown warning)
    if (!duplicateChecked) {
      setDuplicateChecked(true)
      const nearby = await checkDuplicates(latitude, longitude, formData.category)
      setNearbyIssues(nearby)

      if (nearby.length > 0) {
        setPendingSubmit({ latitude, longitude })
        setShowDuplicateWarning(true)
        return
      }
    }

    await doSubmit(latitude, longitude)
  }

  async function doSubmit(latitude, longitude) {
    setSubmitting(true)
    setShowDuplicateWarning(false)
    setPendingSubmit(null)

    try {
      const response = await reportApi.create(
        {
          title:       formData.title.trim(),
          description: formData.description.trim(),
          category:    formData.category,
          latitude,
          longitude,
          image:       imageFile ?? undefined,
        },
        token
      )

      const report = response?.data

      if (!response?.success || report?.id == null) {
        throw new Error('The server did not return a valid report reference.')
      }

      onReportCreated(report)
    } catch (error) {
      setSubmitError(error.message || 'Unable to submit your report. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function handleDuplicateProceed() {
    if (pendingSubmit) {
      doSubmit(pendingSubmit.latitude, pendingSubmit.longitude)
    }
  }

  function handleDuplicateCancel() {
    setShowDuplicateWarning(false)
    setPendingSubmit(null)
    setDuplicateChecked(false)
  }

  const statusLabel = {
    OPEN:        '🟡 Open',
    IN_PROGRESS: '🔵 In Progress',
    RESOLVED:    '🟢 Resolved',
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="report-overlay">
      {/* ── Duplicate warning modal ── */}
      {showDuplicateWarning && (
        <div className="duplicate-modal" role="dialog" aria-modal="true" aria-labelledby="dup-heading">
          <div className="duplicate-modal-inner">
            <h3 id="dup-heading">⚠️ Similar issues nearby</h3>
            <p>
              We found {nearbyIssues.length} similar civic issue{nearbyIssues.length !== 1 ? 's' : ''} near
              your location. You can still submit — your report will be linked to the existing issue.
            </p>

            <ul className="duplicate-list">
              {nearbyIssues.map((issue) => (
                <li key={issue.issue_id} className="duplicate-item">
                  <strong>{issue.issue_title || `Issue #${issue.issue_id}`}</strong>
                  <span className="duplicate-meta">
                    {issue.category} · {statusLabel[issue.status] ?? issue.status}
                    {issue.report_count > 1 && ` · ${issue.report_count} reports`}
                  </span>
                </li>
              ))}
            </ul>

            <div className="duplicate-actions">
              <button className="report-cancel" onClick={handleDuplicateCancel}>
                Go back and check
              </button>
              <button className="report-submit" onClick={handleDuplicateProceed} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      <section
        className="report-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-heading"
      >
        <button type="button" className="report-close" onClick={onClose} aria-label="Close report form">
          &times;
        </button>

        <div className="report-heading">
          <span className="report-logo">SF</span>
          <h2 id="report-heading">Report a civic issue</h2>
          <p>Help improve your neighbourhood by reporting a problem you have noticed.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Title */}
          <div className="report-field">
            <label htmlFor="report-title">Issue title</label>
            <input
              id="report-title"
              type="text"
              placeholder="Example: Large pothole near main road"
              value={formData.title}
              onChange={(e) => updateField('title', e.target.value)}
              onBlur={() => handleBlur('title')}
              minLength={5}
              maxLength={200}
              required
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'report-title-error' : undefined}
            />
            {errors.title && (
              <p id="report-title-error" className="report-error" role="alert">{errors.title}</p>
            )}
          </div>

          {/* Description */}
          <div className="report-field">
            <label htmlFor="report-description">Description</label>
            <textarea
              id="report-description"
              rows={5}
              placeholder="Describe the civic problem and explain where you noticed it."
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              onBlur={() => handleBlur('description')}
              minLength={10}
              maxLength={1000}
              required
              aria-invalid={Boolean(errors.description)}
              aria-describedby={errors.description ? 'report-description-error' : undefined}
            />
            {errors.description && (
              <p id="report-description-error" className="report-error" role="alert">{errors.description}</p>
            )}
          </div>

          {/* Category */}
          <div className="report-field">
            <label htmlFor="report-category">Issue category</label>

            {aiSuggestion && (
              <div className="ai-suggestion-box">
                <div className="ai-suggestion-header">
                  <span>✨ AI Triage Suggestion</span>
                  <span className="ai-confidence">{(aiSuggestion.confidence * 100).toFixed(0)}% confidence</span>
                </div>
                <div className="ai-suggestion-body">
                  <span>
                    Detected: <strong>{categories.find(c => c.value === aiSuggestion.predictedCategory)?.label}</strong>
                  </span>
                  {aiSuggestion.safetyHazardDetected && (
                    <span className="ai-hazard-pill">
                      ⚠️ {aiSuggestion.hazardType ? aiSuggestion.hazardType.replace(/_/g, ' ') : 'Hazard'} ({aiSuggestion.severity})
                    </span>
                  )}
                </div>
                {formData.category !== aiSuggestion.predictedCategory && (
                  <button
                    type="button"
                    className="ai-apply-btn"
                    onClick={() => updateField('category', aiSuggestion.predictedCategory)}
                  >
                    Switch to {availableCategories.find(c => c.value === aiSuggestion.predictedCategory)?.label || aiSuggestion.predictedCategory} →
                  </button>
                )}
              </div>
            )}

            <select
              id="report-category"
              value={formData.category}
              onChange={(e) => updateField('category', e.target.value)}
              onBlur={() => handleBlur('category')}
              required
              aria-invalid={Boolean(errors.category)}
            >
              {availableCategories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.icon ? `${c.icon} ` : ''}{c.label}
                </option>
              ))}
            </select>
            {errors.category && <p className="report-error" role="alert">{errors.category}</p>}
          </div>

          {/* Location */}
          <div className="report-placeholder">
            <strong>Issue location</strong>
            <p>Use your current location or enter coordinates manually. Location permission is requested only when you press the button.</p>

            <button
              type="button"
              className="report-cancel report-location-button"
              onClick={handleUseCurrentLocation}
              disabled={locating || submitting}
            >
              {locating ? 'Getting location…' : '📍 Use my current location'}
            </button>

            <div className="report-field">
              <label htmlFor="report-latitude">Latitude</label>
              <input
                id="report-latitude"
                type="number"
                step="any"
                min="-90"
                max="90"
                placeholder="Example: 12.971599"
                value={location.latitude}
                onChange={(e) => updateLocation('latitude', e.target.value)}
                required
              />
            </div>

            <div className="report-field">
              <label htmlFor="report-longitude">Longitude</label>
              <input
                id="report-longitude"
                type="number"
                step="any"
                min="-180"
                max="180"
                placeholder="Example: 77.594566"
                value={location.longitude}
                onChange={(e) => updateLocation('longitude', e.target.value)}
                required
              />
            </div>

            {detectedWard && (
              <div className="report-detected-ward">
                🏛️ <strong>Jurisdiction:</strong> {detectedWard.ward_number} — {detectedWard.name} ({detectedWard.zone_name})
              </div>
            )}

            {locationError && (
              <p className="report-error" role="alert">{locationError}</p>
            )}
          </div>

          {/* Image upload */}
          <div className="report-placeholder">
            <strong>Issue photograph <span className="report-optional">(optional)</span></strong>
            <p>Attach a photo of the problem. JPEG, PNG or WebP, max 5 MB.</p>

            {imagePreview ? (
              <div className="image-preview-wrapper">
                <img src={imagePreview} alt="Selected report image" className="image-preview" />
                <button
                  type="button"
                  className="image-remove-btn"
                  onClick={handleRemoveImage}
                  aria-label="Remove selected image"
                >
                  ✕ Remove
                </button>
              </div>
            ) : (
              <label className="image-upload-label" htmlFor="report-image">
                <span>📷 Choose a photo</span>
                <input
                  id="report-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  disabled={submitting}
                  className="image-upload-input"
                />
              </label>
            )}

            {imageError && <p className="report-error" role="alert">{imageError}</p>}
          </div>

          {submitError && (
            <p className="report-error" role="alert">{submitError}</p>
          )}

          <div className="report-actions">
            <button type="button" className="report-cancel" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="report-submit" disabled={submitting || locating}>
              {submitting ? 'Submitting…' : 'Submit report'}
            </button>
          </div>

          <p className="report-helper">Your report is submitted only after the server confirms it.</p>
        </form>
      </section>
    </div>
  )
}

export default ReportForm
