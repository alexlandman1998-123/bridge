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
  if (pathname === '/transactions') return 'Transactions'
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
  const hideTitle = developerHideTitle || attorneyHideTitle || bondHideTitle || clientHideTitle
  const isClientRole = role === 'client'
  const developerDashboardHeaderOnly = role === 'developer' && (location.pathname === '/dashboard' || location.pathname === '/')
  const userInitials = getUserInitials(user)
  const canCreateDevelopment = role === 'developer'
  const canCreateTransaction = role === 'developer' || role === 'agent' || role === 'attorney'
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

  const notificationsControl = (
    <div className="relative flex-none" ref={notificationsRef}>
      <button
        type="button"
        className="relative inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] border border-[#dde4ee] bg-white text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]"
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
          <span className="absolute -right-1 -top-1 inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#35546c] px-1.5 text-[0.72rem] font-semibold text-white">
            {unreadDisplay}
          </span>
        ) : null}
      </button>

      {notificationsOpen ? (
        <div className="absolute right-0 top-[calc(100%+12px)] z-40 w-[360px] rounded-[18px] border border-[#dde4ee] bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <strong>Notifications</strong>
            {notificationState.unreadCount > 0 ? (
              <button
                type="button"
                className="text-sm font-semibold text-[#35546c]"
                onClick={async () => {
                  await markAllNotificationsRead()
                  await loadNotifications()
                }}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {notificationState.loading ? <p className="rounded-[14px] bg-[#f8fafc] px-4 py-3 text-sm text-[#6b7d93]">Loading notifications…</p> : null}
          {notificationState.error ? <p className="rounded-[14px] bg-[#fef3f2] px-4 py-3 text-sm text-[#b42318]">{notificationState.error}</p> : null}
          {!notificationState.loading &&
          !notificationState.error &&
          (!notificationState.notifications || !notificationState.notifications.length) ? (
            <p className="rounded-[14px] bg-[#f8fafc] px-4 py-3 text-sm text-[#6b7d93]">No notifications yet.</p>
          ) : null}

          {!notificationState.loading && !notificationState.error ? (
            <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto">
              {notificationState.notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  className={`rounded-[14px] border px-4 py-3 text-left transition duration-150 ease-out ${
                    notification.isRead
                      ? 'border-[#e6edf5] bg-white hover:border-[#d6e1ec] hover:bg-[#f8fafc]'
                      : 'border-[#cfe1f7] bg-[#f8fbff] hover:border-[#c0d6ee]'
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
                    <time className="shrink-0 text-[0.76rem] text-[#6b7d93]">{formatNotificationTimestamp(notification.createdAt)}</time>
                  </div>
                  <p className="text-sm leading-6 text-[#51657b]">{notification.message}</p>
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
        className="inline-flex h-[42px] shrink-0 items-center gap-2 rounded-[14px] border border-[#dde4ee] bg-white px-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:border-[#ccd6e3] hover:bg-[#f8fafc]"
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="inline-grid h-7 w-7 place-items-center rounded-full bg-slate-950 text-[0.84rem] font-semibold text-white">{userInitials}</span>
        <ChevronDown size={14} />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+12px)] z-40 flex min-w-[200px] flex-col rounded-[18px] border border-[#dde4ee] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
          <Link className="rounded-[12px] px-3 py-2 text-sm font-medium text-[#162334] hover:bg-[#f8fafc]" to="/settings" onClick={() => setOpen(false)}>
            Profile
          </Link>
          <Link className="rounded-[12px] px-3 py-2 text-sm font-medium text-[#162334] hover:bg-[#f8fafc]" to="/settings" onClick={() => setOpen(false)}>
            Settings
          </Link>
          <button
            type="button"
            className="rounded-[12px] px-3 py-2 text-left text-sm font-medium text-[#162334] hover:bg-[#f8fafc]"
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
      <header className="no-print sticky top-0 z-20 flex items-center justify-end gap-3 border-b border-[#dde4ee] bg-[rgba(255,255,255,0.88)] px-6 py-4 backdrop-blur-xl md:px-8 xl:px-10">
        {notificationsControl}
        {avatarControl}
      </header>
    )
  }

  return (
    <header className="no-print sticky top-0 z-20 flex items-center gap-4 border-b border-[#dde4ee] bg-[rgba(255,255,255,0.88)] px-6 py-4 backdrop-blur-xl md:px-8 xl:px-10">
      {!hideTitle ? (
        <div className="min-w-0 shrink-0">
          <h2 className="text-[1.6rem] font-semibold tracking-[-0.025em] text-[#142132]">{title}</h2>
        </div>
      ) : null}

      <div
        className={`${
          hideTitle ? 'justify-start' : 'ml-auto justify-end'
        } flex min-w-0 flex-1 flex-nowrap items-center gap-3`}
      >
        {canCreateDevelopment ? (
          <Button variant="secondary" className="shrink-0" onClick={handleNewDevelopment}>
            + New Development
          </Button>
        ) : null}

        {canCreateTransaction ? (
          <Button
            variant="primary"
            className="shrink-0"
            onClick={handleNewTransaction}
          >
            + New Transaction
          </Button>
        ) : null}

        {!isClientRole ? (
          <Button variant="secondary" className="shrink-0" onClick={() => window.dispatchEvent(new Event('itg:open-command-palette'))}>
            ⌘K
          </Button>
        ) : null}

        <div
          className="inline-flex h-[42px] min-w-[212px] shrink-0 items-center gap-2 rounded-[14px] border border-[#dde4ee] bg-white px-4 text-sm text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
          aria-label="Active persona"
        >
          <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#6b7d93]">View</span>
          <select
            className="min-w-[132px] flex-1 border-0 bg-transparent p-0 text-sm font-semibold text-[#162334] outline-none"
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
          {rolePreviewActive ? <em className="text-[0.74rem] font-semibold not-italic text-[#2563eb]">Preview</em> : null}
        </div>

        {!isClientRole ? (
          <div
            className="flex h-[42px] min-w-[280px] max-w-[440px] flex-1 items-center gap-3 rounded-[14px] border border-[#dde4ee] bg-white px-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
            aria-label="Search"
          >
            <Search size={16} className="shrink-0 text-slate-400" />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm text-[#162334] outline-none"
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
