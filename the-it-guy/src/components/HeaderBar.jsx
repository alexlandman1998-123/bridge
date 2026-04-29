import { Bell, ChevronDown, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { fetchMyNotifications, markAllNotificationsRead, markNotificationRead } from '../lib/api'
import { APP_ROLE_LABELS } from '../lib/roles'
import Button from './ui/Button'

function getPageTitle(pathname, stateTitle, role) {
  if (role === 'client') {
    if (pathname === '/dashboard' || pathname === '/') return 'Overview'
    if (pathname === '/buyer-information') return 'Buyer Information'
    if (pathname === '/transactions') return 'Transaction Progress'
    if (pathname === '/documents') return 'Documents'
    if (pathname === '/handover') return 'Handover'
    if (pathname === '/snags') return 'Snags'
    if (pathname === '/settings' || pathname.startsWith('/settings')) return 'Settings'
  }

  if (pathname.startsWith('/units/')) {
    if (role === 'developer') return 'Units'
    if (role === 'bond_originator') return 'Applications'
    if (role === 'attorney') return 'Transactions'
    return 'Transactions'
  }
  if (pathname.startsWith('/transactions/')) return 'Transactions'
  if (pathname.startsWith('/developments/')) return 'Developments'
  if (role === 'bond_originator' && pathname === '/documents') return ''

  if (stateTitle) {
    return stateTitle
  }

  if (pathname === '/dashboard' || pathname === '/') return 'Dashboard'
  if (pathname === '/developments') return 'Developments'
  if (pathname === '/units') return role === 'developer' ? 'Units' : role === 'bond_originator' ? 'Applications' : 'Transactions'
  if (pathname === '/deals') return 'Deals'
  if (pathname === '/listings') return 'Listings'
  if (pathname === '/agents' || pathname.startsWith('/agents/') || pathname.startsWith('/agent/agents/')) return 'Agents'
  if (pathname === '/transactions') return role === 'agent' ? 'Deals' : 'Transactions'
  if (pathname === '/new-transaction') return 'New Transaction'
  if (pathname === '/applications') return 'Applications'
  if (pathname === '/transfers') return role === 'attorney' ? 'Transactions' : 'Transfers'
  if (pathname === '/clients' || pathname.startsWith('/clients/')) return 'Clients'
  if (pathname === '/financials') return 'Financials'
  if (pathname === '/pipeline') return 'Pipeline'
  if (pathname === '/documents') return 'Documents'
  if (pathname === '/reports') return 'Reports'
  if (pathname === '/team') return 'Team'
  if (pathname === '/users') return 'Users'
  if (pathname === '/settings' || pathname.startsWith('/settings')) return 'Settings'

  return 'Workspace'
}

function getUserInitials(user) {
  const fullName = String(user?.user_metadata?.full_name || user?.user_metadata?.name || '').trim()
  if (fullName) {
    const parts = fullName.split(/\s+/).slice(0, 2)
    return parts.map((part) => part[0]?.toUpperCase() || '').join('')
  }

  const email = String(user?.email || '').trim()
  if (email) {
    return email.slice(0, 2).toUpperCase()
  }

  return 'IT'
}

function formatNotificationTimestamp(value) {
  if (!value) {
    return 'Just now'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Just now'
  }

  const deltaMs = Date.now() - date.getTime()
  const deltaMinutes = Math.max(Math.floor(deltaMs / 60000), 0)

  if (deltaMinutes < 1) return 'Just now'
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`
  if (deltaMinutes < 1440) return `${Math.floor(deltaMinutes / 60)}h ago`
  if (deltaMinutes < 10080) return `${Math.floor(deltaMinutes / 1440)}d ago`

  return date.toLocaleDateString()
}

function HeaderBar({ onNewTransaction, onNewDevelopment, onLogout, user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { role, baseRole, rolePreviewActive, setActivePersona, personaOptions } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationState, setNotificationState] = useState({
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: '',
  })
  const dropdownRef = useRef(null)
  const notificationsRef = useRef(null)

  const loadNotifications = useCallback(async ({ unreadOnly = false } = {}) => {
    setNotificationState((previous) => ({
      ...previous,
      loading: true,
      error: '',
    }))

    try {
      const payload = await fetchMyNotifications({ limit: 25, unreadOnly })
      setNotificationState({
        notifications: payload.notifications || [],
        unreadCount: Number(payload.unreadCount || 0),
        loading: false,
        error: '',
      })
    } catch (error) {
      setNotificationState((previous) => ({
        ...previous,
        loading: false,
        error: error?.message || 'Unable to load notifications.',
      }))
    }
  }, [])

  useEffect(() => {
    function onClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false)
      }

      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setNotificationsOpen(false)
      }
    }

    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    let active = true

    async function refreshNotifications() {
      if (!active) {
        return
      }
      await loadNotifications()
    }

    void refreshNotifications()
    const intervalId = window.setInterval(() => {
      void refreshNotifications()
    }, 45000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [role, loadNotifications])

  const title = getPageTitle(location.pathname, location.state?.headerTitle, role)
  const developerHideTitle =
    role === 'developer' &&
    (
      location.pathname === '/dashboard' ||
      location.pathname === '/' ||
      location.pathname === '/clients' ||
      location.pathname === '/documents' ||
      location.pathname === '/snags' ||
      location.pathname === '/pipeline' ||
      location.pathname === '/reports' ||
      location.pathname === '/team' ||
      location.pathname.startsWith('/settings') ||
      location.pathname.startsWith('/units') ||
      location.pathname.startsWith('/developments')
    )
  const attorneyHideTitle =
    role === 'attorney' &&
    (
      location.pathname === '/dashboard' ||
      location.pathname === '/' ||
      location.pathname === '/transactions' ||
      location.pathname === '/developments' ||
      location.pathname === '/financials' ||
      location.pathname.startsWith('/transactions/') ||
      location.pathname.startsWith('/developments/') ||
      location.pathname.startsWith('/units/')
    )
  const bondHideTitle =
    role === 'bond_originator' &&
    (
      location.pathname === '/dashboard' ||
      location.pathname === '/' ||
      location.pathname === '/applications' ||
      location.pathname === '/developments' ||
      location.pathname === '/clients' ||
      location.pathname === '/documents' ||
      location.pathname === '/reports'
    )
  const clientHideTitle =
    role === 'client' &&
    (
      location.pathname === '/dashboard' ||
      location.pathname === '/' ||
      location.pathname === '/buyer-information' ||
      location.pathname === '/transactions'
    )
  const agentHideTitle =
    role === 'agent' &&
    (
      location.pathname === '/dashboard' ||
      location.pathname === '/'
    )
  const hideTitle = developerHideTitle || attorneyHideTitle || bondHideTitle || clientHideTitle || agentHideTitle
  const isClientRole = role === 'client'
  const hideSearchInHeader = role === 'attorney' && (location.pathname === '/dashboard' || location.pathname === '/')
  const developerDashboardHeaderOnly = role === 'developer' && (location.pathname === '/dashboard' || location.pathname === '/')
  const userInitials = getUserInitials(user)
  const canCreateDevelopment = role === 'developer'
  const canCreateTransaction = role === 'developer' || role === 'agent' || role === 'attorney'
  const canCreateListing = role === 'agent'
  const unreadDisplay = notificationState.unreadCount > 99 ? '99+' : String(notificationState.unreadCount || 0)

  function handleNewDevelopment() {
    if (typeof onNewDevelopment === 'function') {
      onNewDevelopment()
      return
    }

    window.dispatchEvent(new Event('itg:open-new-development'))
  }

  function handleNewTransaction() {
    if (role === 'agent' || role === 'attorney') {
      navigate('/new-transaction')
      return
    }

    if (typeof onNewTransaction === 'function') {
      onNewTransaction()
      return
    }

    window.dispatchEvent(new Event('itg:open-new-transaction'))
  }

  function handleNewListing() {
    navigate('/listings', { state: { openNewListing: true } })
  }

  const notificationsControl = (
    <div className="relative flex-none" ref={notificationsRef}>
      <button
        type="button"
        className="ui-icon-button relative h-[42px] w-[42px]"
        aria-label="Notifications"
        onClick={() => {
          const nextOpen = !notificationsOpen
          setNotificationsOpen(nextOpen)
          if (nextOpen) {
            void loadNotifications()
          }
        }}
      >
        <Bell size={16} />
        {notificationState.unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full bg-primary px-1.5 text-helper font-semibold text-textInverse">
            {unreadDisplay}
          </span>
        ) : null}
      </button>

      {notificationsOpen ? (
        <div className="ui-surface-floating absolute right-0 top-[calc(100%+12px)] z-40 w-[360px] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <strong>Notifications</strong>
            {notificationState.unreadCount > 0 ? (
              <button
                type="button"
                className="text-sm font-semibold text-primary"
                onClick={async () => {
                  await markAllNotificationsRead()
                  await loadNotifications()
                }}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {notificationState.loading ? <p className="rounded-control bg-surfaceAlt px-4 py-3 text-sm text-textMuted">Loading notifications…</p> : null}
          {notificationState.error ? <p className="rounded-control bg-dangerSoft px-4 py-3 text-sm text-danger">{notificationState.error}</p> : null}
          {!notificationState.loading &&
          !notificationState.error &&
          (!notificationState.notifications || !notificationState.notifications.length) ? (
            <p className="rounded-control bg-surfaceAlt px-4 py-3 text-sm text-textMuted">No notifications yet.</p>
          ) : null}

          {!notificationState.loading && !notificationState.error ? (
            <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto">
              {notificationState.notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={`rounded-control border px-4 py-3 text-left transition duration-150 ease-out ${
                    notification.isRead
                      ? 'border-borderSoft bg-surface hover:border-borderDefault hover:bg-surfaceAlt'
                      : 'border-info bg-infoSoft hover:border-primary'
                  }`}
                  onClick={async () => {
                    if (!notification.isRead) {
                      await markNotificationRead(notification.id)
                    }
                    await loadNotifications()

                    const targetUnitId = notification.unitId || notification.eventData?.unitId || null
                    if (targetUnitId) {
                      navigate(`/units/${targetUnitId}`)
                      setNotificationsOpen(false)
                    }
                  }}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <span>{notification.title}</span>
                    <time className="shrink-0 text-helper text-textMuted">{formatNotificationTimestamp(notification.createdAt)}</time>
                  </div>
                  <p className="text-secondary text-textBody">{notification.message}</p>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  const avatarControl = (
    <div className="relative flex-none" ref={dropdownRef}>
      <button
        type="button"
        className="ui-shell-avatar-trigger h-[42px]"
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="inline-grid h-7 w-7 place-items-center rounded-full bg-textStrong text-secondary font-semibold text-textInverse">{userInitials}</span>
        <ChevronDown size={14} />
      </button>

      {open ? (
        <div className="ui-surface-floating absolute right-0 top-[calc(100%+12px)] z-40 flex min-w-[200px] flex-col p-2">
          <Link className="rounded-control px-3 py-2 text-sm font-medium text-textStrong hover:bg-surfaceAlt" to="/settings" onClick={() => setOpen(false)}>
            Profile
          </Link>
          <Link className="rounded-control px-3 py-2 text-sm font-medium text-textStrong hover:bg-surfaceAlt" to="/settings" onClick={() => setOpen(false)}>
            Settings
          </Link>
          <button
            type="button"
            className="rounded-control px-3 py-2 text-left text-sm font-medium text-textStrong hover:bg-surfaceAlt"
            onClick={() => {
              setOpen(false)
              onLogout?.()
            }}
          >
            Logout
          </button>
        </div>
      ) : null}
    </div>
  )

  if (developerDashboardHeaderOnly) {
    return (
      <header className="no-print ui-shell-header ui-shell-header-no-title">
        {notificationsControl}
        {avatarControl}
      </header>
    )
  }

  return (
      <header className="no-print ui-shell-header">
      {!hideTitle ? (
        <div className="min-w-0 shrink-0">
          <h2 className="text-page-title font-semibold text-textStrong">{title}</h2>
        </div>
      ) : null}

      <div className="ui-shell-actions">
        {canCreateDevelopment ? (
          <Button variant="secondary" className="shrink-0" onClick={handleNewDevelopment}>
            + New Development
          </Button>
        ) : null}

        {canCreateListing ? (
          <Button variant="secondary" className="shrink-0" onClick={handleNewListing}>
            + New Listing
          </Button>
        ) : null}

        {canCreateTransaction ? (
          <Button
            variant="primary"
            className="shrink-0"
            onClick={handleNewTransaction}
          >
            {role === 'agent' ? '+ New Deal' : '+ New Transaction'}
          </Button>
        ) : null}

        <div
          className="ui-shell-role-switch min-h-[42px] min-w-[212px] shrink-0"
          aria-label="Active persona"
        >
          <span>View</span>
          <select
            className="flex-1"
            value={role}
            onChange={(event) => {
              setActivePersona(event.target.value)
              navigate('/dashboard')
            }}
          >
            {personaOptions.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {rolePreviewActive ? <em>Preview</em> : null}
        </div>

        {!isClientRole && !hideSearchInHeader ? (
          <div
            className="ui-shell-search min-h-[42px] min-w-[280px]"
            aria-label="Search"
          >
            <Search size={16} className="shrink-0 text-textSoft" />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-secondary text-textStrong outline-none"
              type="search"
              placeholder="Search unit, buyer, stage..."
            />
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {notificationsControl}
        {avatarControl}
      </div>
    </header>
  )
}

export default HeaderBar
