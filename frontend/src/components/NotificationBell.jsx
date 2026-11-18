import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { notificationApi } from '../services/api'
import './NotificationBell.css'

function NotificationBell({ token }) {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (!token) return

    let active = true

    async function fetchNotifications() {
      try {
        const res = await notificationApi.getAll({ limit: 10 }, token)
        if (!active) return
        if (res?.data) {
          setNotifications(res.data.notifications || [])
          setUnreadCount(res.data.unreadCount || 0)
        }
      } catch {
        // Non-blocking background fetch
      }
    }

    fetchNotifications()
    const timer = setInterval(fetchNotifications, 30000)

    return () => {
      active = false
      clearInterval(timer)
    }
  }, [token])

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleToggle = () => {
    setIsOpen(!isOpen)
  }

  const handleItemClick = async (notif) => {
    if (!notif.is_read) {
      try {
        await notificationApi.markRead(notif.id, token)
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      } catch {
        // Ignore mark-read error
      }
    }
    setIsOpen(false)
    if (notif.civic_issue_id) {
      navigate(`/issues/${notif.civic_issue_id}`)
    }
  }

  const handleMarkAllRead = async () => {
    setLoading(true)
    try {
      await notificationApi.markAllRead(token)
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {
      // Ignore
    } finally {
      setLoading(false)
    }
  }

  if (!token) return null

  return (
    <div className="notif-wrapper" ref={dropdownRef}>
      <button
        type="button"
        className="notif-bell-btn"
        onClick={handleToggle}
        aria-label={`Notifications, ${unreadCount} unread`}
      >
        <span className="notif-bell-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                className="notif-mark-read-btn"
                onClick={handleMarkAllRead}
                disabled={loading}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">No notifications yet.</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${!n.is_read ? 'unread' : ''}`}
                  onClick={() => handleItemClick(n)}
                >
                  <div className="notif-item-top">
                    <strong className="notif-item-title">{n.title}</strong>
                    <span className="notif-item-time">
                      {new Date(n.created_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                  <p className="notif-item-message">{n.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
