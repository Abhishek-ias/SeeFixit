import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { issueApi } from '../services/api'
import './MapView.css'

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'ROAD', label: '🚧 Roads & Potholes' },
  { value: 'SANITATION', label: '🗑️ Sanitation' },
  { value: 'WATER', label: '💧 Water Supply' },
  { value: 'LIGHTING', label: '💡 Street Lighting' },
]

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#f59e0b', bg: '#fffbeb', icon: '🟡' },
  IN_PROGRESS: { label: 'In Progress', color: '#3b82f6', bg: '#eff6ff', icon: '🔵' },
  ON_HOLD:     { label: 'On Hold',     color: '#8b5cf6', bg: '#f5f3ff', icon: '🟣' },
  RESOLVED:    { label: 'Resolved',    color: '#10b981', bg: '#ecfdf5', icon: '🟢' },
  REJECTED:    { label: 'Rejected',    color: '#ef4444', bg: '#fef2f2', icon: '🔴' },
  REOPENED:    { label: 'Reopened',    color: '#f97316', bg: '#fff7ed', icon: '🟠' },
}

const CATEGORY_ICONS = {
  ROAD: '🚧',
  SANITATION: '🗑️',
  WATER: '💧',
  LIGHTING: '💡',
}

function createMarkerIcon(category, status) {
  const icon = CATEGORY_ICONS[category] ?? '📌'
  const cfg = STATUS_CONFIG[status] ?? { color: '#6366f1' }

  return L.divIcon({
    className: 'custom-map-pin-container',
    html: `
      <div class="custom-map-pin" style="border-color: ${cfg.color};">
        <span class="pin-icon">${icon}</span>
        <span class="pin-status-dot" style="background-color: ${cfg.color};"></span>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -32],
  })
}

function createHotspotIcon(hotspot) {
  const riskColor = hotspot.chronicRisk === 'CRITICAL'
    ? '#dc2626'
    : hotspot.chronicRisk === 'HIGH'
      ? '#ea580c'
      : '#d97706'

  return L.divIcon({
    className: 'hotspot-marker-container',
    html: `
      <div class="hotspot-pulse-badge" style="background-color: ${riskColor}; box-shadow: 0 0 0 6px ${riskColor}33;">
        <span class="hotspot-badge-icon">🔥</span>
        <span class="hotspot-badge-count">${hotspot.totalIssues}</span>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  })
}

function MapView() {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markersLayerRef = useRef(null)
  const hotspotsLayerRef = useRef(null)
  const markerMapRef = useRef(new Map())

  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [showHotspots, setShowHotspots] = useState(false)
  const [hotspots, setHotspots] = useState([])
  const [selectedHotspot, setSelectedHotspot] = useState(null)
  const [, setUserLocation] = useState(null)
  const [locating, setLocating] = useState(false)

  // 1. Initialize Leaflet Map Instance
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    // Default center (Bangalore coordinates)
    const map = L.map(mapContainerRef.current, {
      center: [12.9716, 77.5946],
      zoom: 13,
      zoomControl: true,
    })

    // OpenStreetMap standard tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map)

    const markersGroup = L.featureGroup().addTo(map)
    markersLayerRef.current = markersGroup

    const hotspotsGroup = L.featureGroup().addTo(map)
    hotspotsLayerRef.current = hotspotsGroup

    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // 2. Fetch issues based on category and status
  useEffect(() => {
    let active = true

    issueApi.getMapIssues({
      category: selectedCategory || undefined,
      status: selectedStatus || undefined,
    })
      .then((res) => {
        if (!active) return
        setIssues(res?.data ?? [])
        setError('')
      })
      .catch((err) => {
        if (!active) return
        setError(err.message || 'Failed to load map data.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [selectedCategory, selectedStatus])

  // 2b. Fetch chronic hotspots
  useEffect(() => {
    let active = true

    issueApi.getHotspots({
      category: selectedCategory || undefined,
      days: 60,
    })
      .then((res) => {
        if (!active) return
        setHotspots(res?.data?.hotspots ?? [])
      })
      .catch(() => {
        if (!active) return
        setHotspots([])
      })

    return () => { active = false }
  }, [selectedCategory])

  // 3. Render and synchronize markers whenever issues change
  useEffect(() => {
    const map = mapInstanceRef.current
    const layer = markersLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    markerMapRef.current.clear()

    if (issues.length === 0) return

    const bounds = []

    issues.forEach((issue) => {
      if (!Number.isFinite(issue.latitude) || !Number.isFinite(issue.longitude)) return

      const latLng = [issue.latitude, issue.longitude]
      bounds.push(latLng)

      const statusCfg = STATUS_CONFIG[issue.status] ?? { label: issue.status, color: '#6366f1', bg: '#eff6ff' }
      const marker = L.marker(latLng, {
        icon: createMarkerIcon(issue.category, issue.status),
      })

      const popupContent = `
        <div class="map-popup-card">
          <div class="map-popup-header">
            <span class="popup-category">${issue.category}</span>
            <span class="popup-status" style="color: ${statusCfg.color}; background: ${statusCfg.bg};">
              ${statusCfg.label}
            </span>
          </div>
          <h4 class="popup-title">${issue.title}</h4>
          <div class="popup-meta">
            <span>🏛️ ${issue.department_name || 'Department'}</span>
            <span>👥 ${issue.report_count} report${issue.report_count !== 1 ? 's' : ''}</span>
            ${issue.upvote_count > 0 ? `<span>· 👍 ${issue.upvote_count}</span>` : ''}
          </div>
          <div class="popup-coords">
            📍 ${issue.latitude.toFixed(5)}, ${issue.longitude.toFixed(5)}
          </div>
          <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #f1f5f9; text-align: right;">
            <a href="/track/${issue.id}" style="color: #4f46e5; font-size: 11px; font-weight: 600; text-decoration: none;">Track & Corroborate ↗</a>
          </div>
        </div>
      `

      marker.bindPopup(popupContent, { maxWidth: 280, className: 'custom-leaflet-popup' })
      marker.on('click', () => setSelectedIssue(issue))

      marker.addTo(layer)
      markerMapRef.current.set(issue.id, marker)
    })

    // Auto-fit viewport bounds if issues are loaded
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
    }
  }, [issues])

  // 3b. Render Chronic Hotspot Clusters Layer
  useEffect(() => {
    const layer = hotspotsLayerRef.current
    if (!layer) return

    layer.clearLayers()
    if (!showHotspots || hotspots.length === 0) return

    hotspots.forEach((h) => {
      const riskColor = h.chronicRisk === 'CRITICAL'
        ? '#dc2626'
        : h.chronicRisk === 'HIGH'
          ? '#ea580c'
          : '#d97706'

      const circle = L.circle([h.center.latitude, h.center.longitude], {
        radius: h.radiusMeters,
        color: riskColor,
        fillColor: riskColor,
        fillOpacity: 0.18,
        weight: 2,
        dashArray: '5, 5',
      })

      const marker = L.marker([h.center.latitude, h.center.longitude], {
        icon: createHotspotIcon(h),
      })

      const popupContent = `
        <div class="hotspot-popup-card">
          <div class="hotspot-popup-tag" style="background: ${riskColor}; color: #ffffff;">
            🔥 ${h.chronicRisk} CHRONIC ZONE
          </div>
          <h4 class="hotspot-popup-title">${h.primaryCategory} Problem Cluster</h4>
          <p class="hotspot-popup-stats">
            <strong>${h.totalIssues}</strong> complaints (${h.openIssues} active) in ~${h.radiusMeters}m radius
          </p>
          <div class="hotspot-rec-box">
            <div class="hotspot-rec-heading">Municipal Recommendation:</div>
            <p class="hotspot-rec-text">${h.recommendation}</p>
          </div>
        </div>
      `

      marker.bindPopup(popupContent, { maxWidth: 300, className: 'custom-leaflet-popup' })
      circle.bindPopup(popupContent, { maxWidth: 300, className: 'custom-leaflet-popup' })

      marker.on('click', () => setSelectedHotspot(h))
      circle.on('click', () => setSelectedHotspot(h))

      circle.addTo(layer)
      marker.addTo(layer)
    })
  }, [showHotspots, hotspots])

  // Zoom into specific issue
  const handleSelectIssue = useCallback((issue) => {
    setSelectedIssue(issue)
    const map = mapInstanceRef.current
    const marker = markerMapRef.current.get(issue.id)
    if (map && marker) {
      map.setView([issue.latitude, issue.longitude], 16, { animate: true })
      marker.openPopup()
    }
  }, [])

  // User "Locate Me" GPS button
  function handleLocateMe() {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.')
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setUserLocation({ lat, lng })
        setLocating(false)

        const map = mapInstanceRef.current
        if (map) {
          map.setView([lat, lng], 15, { animate: true })
          // Add pulse circle
          L.circleMarker([lat, lng], {
            radius: 9,
            fillColor: '#3b82f6',
            color: '#ffffff',
            weight: 3,
            opacity: 1,
            fillOpacity: 0.9,
          }).addTo(map).bindPopup('<strong>📍 Your current location</strong>').openPopup()
        }
      },
      (err) => {
        alert(err.message || 'Unable to retrieve your location.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const displayedIssues = selectedHotspot
    ? issues.filter((i) => selectedHotspot.issues.some((hi) => hi.id === i.id))
    : issues

  return (
    <div className="map-view-page">
      {/* ── Top Floating Filter Bar ── */}
      <div className="map-controls-header">
        <div className="map-title-badge">
          <span className="live-pulse"></span>
          <strong>CIVIC ISSUES MAP</strong>
          <span className="issue-counter">({issues.length} active)</span>
        </div>

        <div className="map-filter-group">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="map-filter-select"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="map-filter-select"
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([k, cfg]) => (
              <option key={k} value={k}>{cfg.icon} {cfg.label}</option>
            ))}
          </select>

          <button
            onClick={() => setShowHotspots((prev) => !prev)}
            className={`map-hotspots-toggle ${showHotspots ? 'active' : ''}`}
            title="Toggle chronic hotspot clusters"
          >
            🔥 Hotspots ({hotspots.length})
          </button>

          <button
            onClick={handleLocateMe}
            className="map-locate-btn"
            disabled={locating}
            title="Locate my position"
          >
            {locating ? 'Locating…' : '🎯 Locate Me'}
          </button>
        </div>
      </div>

      {error && (
        <div className="map-error-bar" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* ── Main Map Canvas & Side Drawer ── */}
      <div className="map-canvas-wrapper">
        <div ref={mapContainerRef} className="leaflet-map-canvas" />

        {/* ── Collapsible Side Drawer ── */}
        <aside className="map-side-drawer">
          <div className="drawer-header">
            <h3>Nearby Civic Issues</h3>
            <span>{displayedIssues.length} pins</span>
          </div>

          {selectedHotspot && (
            <div className="hotspot-filter-banner">
              <div className="hotspot-filter-info">
                <strong>🔥 Hotspot: {selectedHotspot.primaryCategory}</strong>
                <span>({selectedHotspot.totalIssues} recurring issues)</span>
              </div>
              <button
                onClick={() => setSelectedHotspot(null)}
                className="clear-hotspot-filter-btn"
                title="Reset cluster filter"
              >
                ✕ Clear
              </button>
            </div>
          )}

          {loading ? (
            <div className="drawer-loading">
              <div className="spinner" />
              <p>Loading spatial points…</p>
            </div>
          ) : displayedIssues.length === 0 ? (
            <div className="drawer-empty">
              <p>No civic issues match your current filters.</p>
            </div>
          ) : (
            <div className="drawer-list">
              {displayedIssues.map((issue) => {
                const statusCfg = STATUS_CONFIG[issue.status] ?? { label: issue.status, color: '#6366f1', bg: '#eff6ff' }
                const isSelected = selectedIssue?.id === issue.id

                return (
                  <article
                    key={issue.id}
                    className={`drawer-card ${isSelected ? 'active-card' : ''}`}
                    onClick={() => handleSelectIssue(issue)}
                  >
                    <div className="drawer-card-top">
                      <span className="drawer-card-icon">{CATEGORY_ICONS[issue.category] ?? '📌'}</span>
                      <div className="drawer-card-headings">
                        <h4>{issue.title}</h4>
                        <span className="drawer-card-dept">{issue.department_name}</span>
                      </div>
                      <span
                        className="status-pill"
                        style={{ color: statusCfg.color, background: statusCfg.bg, borderColor: statusCfg.color }}
                      >
                        {statusCfg.label}
                      </span>
                    </div>

                    <div className="drawer-card-footer">
                      <span>👥 {issue.report_count} report{issue.report_count !== 1 ? 's' : ''}{issue.upvote_count > 0 ? ` · 👍 ${issue.upvote_count}` : ''}</span>
                      <Link to={`/track/${issue.id}`} className="drawer-card-link" onClick={(e) => e.stopPropagation()}>Track ↗</Link>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

export default MapView
