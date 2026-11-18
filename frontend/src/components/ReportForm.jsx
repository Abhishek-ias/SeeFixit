
import { useState } from 'react'
import { reportApi } from '../services/api'
import './ReportForm.css'

const categories = [
  { value: 'ROAD', label: 'Roads & Potholes' },
  { value: 'SANITATION', label: 'Sanitation' },
  { value: 'WATER', label: 'Water Supply' },
  { value: 'LIGHTING', label: 'Street Lighting' },
]

function validateField(field, value) {
  const trimmedValue = value.trim()

  if (field === 'title') {
    if (!trimmedValue) return 'Issue title is required.'
    if (trimmedValue.length < 5) {
      return 'Title must contain at least 5 characters.'
    }
    if (trimmedValue.length > 200) {
      return 'Title cannot exceed 200 characters.'
    }
  }

  if (field === 'description') {
    if (!trimmedValue) return 'Description is required.'
    if (trimmedValue.length < 10) {
      return 'Description must contain at least 10 characters.'
    }
    if (trimmedValue.length > 1000) {
      return 'Description cannot exceed 1000 characters.'
    }
  }

  if (
    field === 'category' &&
    !categories.some((category) => category.value === value)
  ) {
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

  const [location, setLocation] = useState({
    latitude: '',
    longitude: '',
  })

  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  function updateField(field, value) {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }))

    if (touched[field]) {
      setErrors((current) => ({
        ...current,
        [field]: validateField(field, value),
      }))
    }
  }

  function updateLocation(field, value) {
    setLocation((current) => ({
      ...current,
      [field]: value,
    }))

    setLocationError('')
  }

  function handleBlur(field) {
    setTouched((current) => ({
      ...current,
      [field]: true,
    }))

    setErrors((current) => ({
      ...current,
      [field]: validateField(field, formData[field]),
    }))
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError(
        'Location is not supported by this browser. Enter coordinates manually.'
      )
      return
    }

    setLocating(true)
    setLocationError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        })

        setLocating(false)
      },
      (error) => {
        let message = 'Unable to get your location. Enter coordinates manually.'

        if (error.code === error.PERMISSION_DENIED) {
          message = 'Location permission denied. Enter coordinates manually.'
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = 'Your location is unavailable. Try again or enter coordinates manually.'
        } else if (error.code === error.TIMEOUT) {
          message = 'Location request timed out. Please try again.'
        }

        setLocationError(message)
        setLocating(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitError('')

    const fields = ['title', 'description', 'category']

    const validationErrors = Object.fromEntries(
      fields.map((field) => [
        field,
        validateField(field, formData[field]),
      ])
    )

    setTouched({
      title: true,
      description: true,
      category: true,
    })

    setErrors(validationErrors)

    if (Object.values(validationErrors).some(Boolean)) {
      return
    }

    const latitudeText = location.latitude.trim()
    const longitudeText = location.longitude.trim()

    if (!latitudeText || !longitudeText) {
      setLocationError(
        'Please use your current location or enter both coordinates.'
      )
      return
    }

    const latitude = Number(latitudeText)
    const longitude = Number(longitudeText)

    if (
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    ) {
      setLocationError('Enter a valid latitude between -90 and 90.')
      return
    }

    if (
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      setLocationError('Enter a valid longitude between -180 and 180.')
      return
    }

    if (!token) {
      setSubmitError('Your session has expired. Please log in again.')
      return
    }

    setSubmitting(true)

    try {
      const response = await reportApi.create(
        {
          title: formData.title.trim(),
          description: formData.description.trim(),
          category: formData.category,
          latitude,
          longitude,
        },
        token
      )

      const report = response?.data

      if (!response?.success || report?.id == null) {
        throw new Error(
          'The server did not return a valid report reference.'
        )
      }

      onReportCreated(report)
    } catch (error) {
      setSubmitError(
        error.message || 'Unable to submit your report. Please try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="report-overlay">
      <section
        className="report-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-heading"
      >
        <button
          type="button"
          className="report-close"
          onClick={onClose}
          aria-label="Close report form"
        >
          &times;
        </button>

        <div className="report-heading">
          <span className="report-logo">SF</span>
          <h2 id="report-heading">Report a civic issue</h2>
          <p>
            Help improve your neighbourhood by reporting
            a problem you have noticed.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="report-field">
            <label htmlFor="report-title">Issue title</label>
            <input
              id="report-title"
              type="text"
              placeholder="Example: Large pothole near main road"
              value={formData.title}
              onChange={(event) =>
                updateField('title', event.target.value)
              }
              onBlur={() => handleBlur('title')}
              minLength={5}
              maxLength={200}
              required
              aria-invalid={Boolean(errors.title)}
              aria-describedby={
                errors.title ? 'report-title-error' : undefined
              }
            />

            {errors.title && (
              <p
                id="report-title-error"
                className="report-error"
                role="alert"
              >
                {errors.title}
              </p>
            )}
          </div>

          <div className="report-field">
            <label htmlFor="report-description">Description</label>
            <textarea
              id="report-description"
              rows={5}
              placeholder="Describe the civic problem and explain where you noticed it."
              value={formData.description}
              onChange={(event) =>
                updateField('description', event.target.value)
              }
              onBlur={() => handleBlur('description')}
              minLength={10}
              maxLength={1000}
              required
              aria-invalid={Boolean(errors.description)}
              aria-describedby={
                errors.description
                  ? 'report-description-error'
                  : undefined
              }
            />

            {errors.description && (
              <p
                id="report-description-error"
                className="report-error"
                role="alert"
              >
                {errors.description}
              </p>
            )}
          </div>

          <div className="report-field">
            <label htmlFor="report-category">Issue category</label>
            <select
              id="report-category"
              value={formData.category}
              onChange={(event) =>
                updateField('category', event.target.value)
              }
              onBlur={() => handleBlur('category')}
              required
              aria-invalid={Boolean(errors.category)}
            >
              {categories.map((category) => (
                <option
                  key={category.value}
                  value={category.value}
                >
                  {category.label}
                </option>
              ))}
            </select>

            {errors.category && (
              <p className="report-error" role="alert">
                {errors.category}
              </p>
            )}
          </div>

          <div className="report-placeholder">
            <strong>Issue location</strong>
            <p>
              Use your current location or enter coordinates manually.
              Location permission is requested only when you press the button.
            </p>

            <button
              type="button"
              className="report-cancel report-location-button"
              onClick={handleUseCurrentLocation}
              disabled={locating || submitting}
            >
              {locating ? 'Getting location...' : 'Use my current location'}
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
                onChange={(event) =>
                  updateLocation('latitude', event.target.value)
                }
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
                onChange={(event) =>
                  updateLocation('longitude', event.target.value)
                }
                required
              />
            </div>

            {locationError && (
              <p className="report-error" role="alert">
                {locationError}
              </p>
            )}
          </div>

          <div className="report-placeholder">
            <strong>Issue photograph</strong>
            <p>
              Photo upload will be enabled after secure image storage
              is implemented.
            </p>
          </div>

          {submitError && (
            <p className="report-error" role="alert">
              {submitError}
            </p>
          )}

          <div className="report-actions">
            <button
              type="button"
              className="report-cancel"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="report-submit"
              disabled={submitting || locating}
            >
              {submitting ? 'Submitting...' : 'Submit report'}
            </button>
          </div>

          <p className="report-helper">
            Your report is submitted only after the server confirms it.
          </p>
        </form>
      </section>
    </div>
  )
}

export default ReportForm
