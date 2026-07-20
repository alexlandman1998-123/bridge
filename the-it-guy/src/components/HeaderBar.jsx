import { AlertTriangle, Bell, CalendarDays, CheckCircle2, ChevronDown, FileText, LayoutGrid, Plus, RefreshCw, Search, UserRoundCheck, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { canAccessHQ } from '../auth/hqAccess'
import { fetchMyNotifications, markAllNotificationsRead, markNotificationRead } from '../lib/api'
import QuickCreateDropdown from './QuickCreateDropdown'

function getPageTitle(pathname, stateTitle, role) {
  const isAgentWorkspaceRole = role === 'agent' || role === 'principal' || role === 'headquarters'

  if (role === 'client') {
    if (pathname === '/dashboard' || pathname === '/') return 'Overview'
    if (pathname === '/buyer-information') return 'Buyer Information'
    if (pathname === '/transactions') return 'Transaction Progress'
    if (pathname === '/documents') return 'Documents'
    if (pathname === '/handover') return 'Handover'
    if (pathname === '/snags') return 'Snags'
    if (pathname === '/settings' || pathname.startsWith('/settings')) return ''
  }

  if (pathname.startsWith('/units/')) {
    if (role === 'developer') return 'Units'
    if (role === 'bond_originator') return 'Applications'
    if (role === 'attorney') return 'Matters'
    return 'Transactions'
  }
  if (pathname.startsWith('/transactions/')) return role === 'attorney' ? 'Matters' : isAgentWorkspaceRole ? '' : 'Transactions'
  if (pathname.startsWith('/developments/')) return 'Developments'
  if (pathname === '/bond/files' || pathname.startsWith('/bond/files/')) return ''
  if (role === 'bond_originator' && pathname === '/documents') return ''

  if (stateTitle) {
    return stateTitle
  }

  if (pathname === '/setup' || pathname.startsWith('/setup/')) return ''
  if (pathname === '/dashboard' || pathname === '/') return 'Dashboard'
  if (pathname === '/developments') return 'Developments'
  if (pathname === '/units') return role === 'developer' ? 'Units' : role === 'bond_originator' ? 'Applications' : 'Transactions'
  if (pathname === '/deals') return 'Transactions'
  if (pathname === '/listings') return ''
  if (pathname.startsWith('/agent/listings/')) return ''
  if (
    pathname === '/agents' ||
    pathname.startsWith('/agents/') ||
    pathname.startsWith('/agent/agents/') ||
    pathname.startsWith('/agency/')
  ) return ''
  if (pathname === '/transactions') return ''
  if (pathname === '/new-transaction') return ''
  if (pathname === '/applications') return 'Applications'
  if (pathname === '/bond/pipeline') return ''
  if (pathname === '/bond/applications' || pathname === '/bond/transactions') return ''
  if (pathname === '/bond/developments' || pathname.startsWith('/bond/developments/')) return ''
  if (pathname === '/bond/clients' || pathname.startsWith('/bond/clients/')) return ''
  if (pathname === '/bond/organisation' || pathname.startsWith('/bond/organisation/')) return ''
  if (pathname === '/bond/partners' || pathname === '/bond/reports') return ''
  if (pathname === '/developer/partners' || pathname.startsWith('/developer/partners/')) return ''
  if (pathname === '/partners' || pathname.startsWith('/partners/')) return ''
  if (pathname === '/teams') return 'Teams'
  if (pathname === '/banks') return 'Banks'
  if (pathname === '/performance') return 'Performance'
  if (pathname === '/transfers') return role === 'attorney' ? 'Matters' : 'Transfers'
  if (pathname === '/clients' || pathname.startsWith('/clients/')) return isAgentWorkspaceRole ? '' : role === 'attorney' ? 'Clients & Parties' : 'Clients'
  if (pathname === '/financials') return 'Financials'
  if (pathname.startsWith('/attorney/transactions') || pathname.startsWith('/attorney/matters')) return 'Matters'
  if (pathname === '/pipeline' || pathname.startsWith('/pipeline/')) return isAgentWorkspaceRole ? '' : 'Pipeline'
  if (pathname === '/calendar') return isAgentWorkspaceRole ? '' : 'Calendar'
  if (pathname === '/documents') return isAgentWorkspaceRole ? '' : 'Documents'
  if (pathname === '/reports') return isAgentWorkspaceRole ? '' : 'Reports'
  if (pathname === '/team') return 'Team'
  if (pathname === '/users') return ''
  if (pathname === '/settings' || pathname.startsWith('/settings')) return ''

  return 'Workspace'
}

function HeaderFilterSelect({ icon: Icon, value, options = [], label, onChange }) {
  return (
    <label className="ui-shell-header-filter">
      {Icon ? <Icon size={16} className="shrink-0 text-[#1769d1]" /> : null}
      <select
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none shrink-0 text-[#8a9aac]" />
    </label>
  )
}

function getUserInitials(user) {
  const fullName = String(
    user?.fullName ||
      user?.full_name ||
      [user?.firstName || user?.first_name, user?.lastName || user?.last_name].filter(Boolean).join(' ') ||
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      '',
  ).trim()
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

function getUserAvatarUrl(user) {
  return String(
    user?.avatarUrl ||
      user?.avatar_url ||
      user?.profilePhotoUrl ||
      user?.profile_photo_url ||
      user?.photoUrl ||
      user?.photo_url ||
      user?.user_metadata?.avatar_url ||
      user?.user_metadata?.picture ||
      '',
  ).trim()
}

const NOTIFICATION_TONE_STYLES = {
  blue: {
    badge: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-100',
    icon: RefreshCw,
  },
  green: {
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100',
    icon: CheckCircle2,
  },
  amber: {
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100',
    icon: AlertTriangle,
  },
  rose: {
    badge: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-100',
    icon: XCircle,
  },
  slate: {
    badge: 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-100',
    icon: FileText,
  },
  indigo: {
    badge: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100',
    icon: UserRoundCheck,
  },
}

const NOTIFICATION_TYPE_STYLES = {
  participant_assigned: { tone: 'indigo', icon: UserRoundCheck },
  document_uploaded: { tone: 'slate', icon: FileText },
  readiness_updated: { tone: 'blue', icon: RefreshCw },
  workflow_updated: { tone: 'blue', icon: RefreshCw },
  lane_handoff: { tone: 'indigo', icon: UserRoundCheck },
  registration_completed: { tone: 'green', icon: CheckCircle2 },
  overdue_missing_docs: { tone: 'amber', icon: AlertTriangle },
  additional_document_requested: { tone: 'amber', icon: AlertTriangle },
  commercial_access_request: { tone: 'amber', icon: AlertTriangle },
  commercial_access_decision: { tone: 'green', icon: CheckCircle2 },
}

function getNotificationTone(notification = {}) {
  const type = String(notification.type || notification.notificationType || '').trim().toLowerCase()
  if (type && NOTIFICATION_TYPE_STYLES[type]) {
    return NOTIFICATION_TYPE_STYLES[type].tone
  }

  const haystack = `${notification.title || ''} ${notification.message || ''}`.toLowerCase()
  if (haystack.includes('failed') || haystack.includes('error') || haystack.includes('rejected') || haystack.includes('declin')) {
    return 'rose'
  }
  if (haystack.includes('attention') || haystack.includes('warning') || haystack.includes('overdue') || haystack.includes('missing') || haystack.includes('pending')) {
    return 'amber'
  }
  if (haystack.includes('assigned') || haystack.includes('handoff')) {
    return 'indigo'
  }
  if (haystack.includes('complete') || haystack.includes('approved') || haystack.includes('confirm') || haystack.includes('signed') || haystack.includes('uploaded')) {
    return 'green'
  }
  if (haystack.includes('document') || haystack.includes('draft') || haystack.includes('generated')) {
    return 'slate'
  }

  return 'blue'
}

function getNotificationPresentation(notification = {}) {
  const type = String(notification.type || notification.notificationType || '').trim().toLowerCase()
  const typeConfig = type && NOTIFICATION_TYPE_STYLES[type] ? NOTIFICATION_TYPE_STYLES[type] : null
  const tone = typeConfig?.tone || getNotificationTone(notification)
  const base = NOTIFICATION_TONE_STYLES[tone] || NOTIFICATION_TONE_STYLES.blue
  return {
    ...base,
    icon: typeConfig?.icon || base.icon,
  }
}

function formatNotificationDate(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function formatNotificationSectionDate(value) {
  if (!value) {
    return 'Earlier'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Earlier'
  }

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (day.getTime() === startOfToday.getTime()) {
    return 'Today'
  }

  if (day.getTime() === startOfYesterday.getTime()) {
    return 'Yesterday'
  }

  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function getNotificationDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'unknown'
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function groupNotificationsByDate(notifications = []) {
  const sortedNotifications = [...(Array.isArray(notifications) ? notifications : [])].sort((left, right) => {
    const leftTime = new Date(left?.createdAt || left?.created_at || 0).getTime()
    const rightTime = new Date(right?.createdAt || right?.created_at || 0).getTime()
    return rightTime - leftTime
  })

  const sections = []
  const sectionIndex = new Map()

  for (const notification of sortedNotifications) {
    const createdAt = notification?.createdAt || notification?.created_at || null
    const key = getNotificationDateKey(createdAt)
    const label = formatNotificationSectionDate(createdAt)
    let section = sectionIndex.get(key)

    if (!section) {
      section = { key, label, items: [] }
      sectionIndex.set(key, section)
      sections.push(section)
    }

    section.items.push(notification)
  }

  return sections
}

function getNotificationEntityLabel(notification = {}) {
  const eventData = notification?.eventData || {}
  const candidates = [
    notification.entityLabel,
    notification.relatedEntityLabel,
    eventData.entityLabel,
    eventData.relatedEntityLabel,
    eventData.transactionReference,
    eventData.transaction_reference,
    eventData.applicationReference,
    eventData.application_reference,
    eventData.unitLabel,
    eventData.unit_label,
    eventData.unitName,
    eventData.unit_name,
    eventData.propertyAddress,
    eventData.property_address,
    eventData.propertyName,
    eventData.property_name,
    eventData.listingTitle,
    eventData.listing_title,
    eventData.developmentName,
    eventData.development_name,
  ]

  return candidates.find((candidate) => String(candidate || '').trim()) || ''
}

function NotificationItem({ notification, onSelect }) {
  const presentation = getNotificationPresentation(notification)
  const Icon = presentation.icon || RefreshCw
  const entityLabel = getNotificationEntityLabel(notification)
  const isUnread = !notification.isRead

  return (
    <button
      type="button"
      className={`group relative w-full rounded-[20px] px-4 py-4 text-left ring-1 transition duration-200 ease-out ${
        isUnread
          ? 'bg-[#f7fbff] ring-blue-100 hover:bg-white hover:ring-blue-200'
          : 'bg-white ring-slate-200/80 hover:bg-slate-50 hover:ring-slate-300/80'
      }`}
      onClick={() => onSelect(notification)}
    >
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${presentation.badge}`}>
          <Icon size={16} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`truncate text-sm ${isUnread ? 'font-semibold text-[#101828]' : 'font-medium text-[#344054]'}`}>
                {notification.title || 'Notification'}
              </p>
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-[#667085]">
                {notification.message || 'Workflow activity update.'}
              </p>
              {entityLabel ? (
                <p className="mt-2 truncate text-xs font-medium text-[#52657a]">
                  {entityLabel}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              {isUnread ? <span className="h-2 w-2 rounded-full bg-[#1769d1]" aria-hidden="true" /> : null}
              <time className="text-xs font-medium text-[#8a9aac]">
                {formatNotificationDate(notification.createdAt || notification.created_at)}
              </time>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

function NotificationSection({ label, items, onSelect }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#8a9aac]">
          {label}
        </p>
        <span className="text-[0.72rem] font-semibold text-[#c0ccd9]">
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}

function HeaderBar({ onLogout, user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const workspaceContext = useWorkspace()
  const { role, agencyWorkflowMode } = workspaceContext
  const [open, setOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationState, setNotificationState] = useState({
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: '',
  })
  const [dashboardHeaderControls, setDashboardHeaderControls] = useState(null)
  const dropdownRef = useRef(null)
  const notificationsRef = useRef(null)

  useEffect(() => {
    function handleDashboardHeaderControls(event) {
      setDashboardHeaderControls(event.detail || null)
    }
    window.addEventListener('itg:principal-dashboard-header-controls', handleDashboardHeaderControls)
    return () => {
      window.removeEventListener('itg:principal-dashboard-header-controls', handleDashboardHeaderControls)
    }
  }, [])

  useEffect(() => {
    if (location.pathname !== '/dashboard' && location.pathname !== '/') {
      setDashboardHeaderControls(null)
    }
  }, [location.pathname])

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
  const isPremiumAgentWorkspace =
    (role === 'agent' || role === 'principal' || role === 'headquarters') &&
    (
      location.pathname === '/dashboard' ||
      location.pathname === '/' ||
      location.pathname === '/pipeline/leads' ||
      location.pathname.startsWith('/pipeline/leads/') ||
      location.pathname.startsWith('/agency/branches')
    )
  const isPremiumAttorneyOperations = role === 'attorney' && location.pathname === '/attorney/operations'
  const isPremiumWorkspace = isPremiumAgentWorkspace || isPremiumAttorneyOperations
  const showPrincipalDashboardHeaderControls =
    (role === 'principal' || role === 'headquarters') &&
    (location.pathname === '/dashboard' || location.pathname === '/') &&
    dashboardHeaderControls?.visible !== false
  const premiumHeaderTitle = isPremiumAttorneyOperations
    ? ''
    : location.pathname.startsWith('/pipeline/leads')
    ? 'Leads'
    : location.pathname.startsWith('/agency/branches')
      ? 'Branch Workspace'
      : 'Principal Overview'
  const premiumHeaderEyebrow = isPremiumAttorneyOperations
    ? ''
    : location.pathname.startsWith('/pipeline/leads')
    ? 'Pipeline'
    : location.pathname.startsWith('/agency/branches')
      ? 'Agency'
      : 'Dashboard'
  const premiumHeaderContext = isPremiumAttorneyOperations
    ? ''
    : location.pathname.startsWith('/pipeline/leads')
    ? 'Pipeline workspace'
    : location.pathname.startsWith('/agency/branches')
      ? 'Executive branch cockpit'
      : agencyWorkflowMode === 'principal'
        ? 'Agency command centre'
        : 'Agent workspace'
  const hidePremiumHeaderTitle =
    location.pathname.startsWith('/pipeline/leads') ||
    location.pathname.startsWith('/agency/branches') ||
    (role === 'agent' && (location.pathname === '/dashboard' || location.pathname === '/')) ||
    isPremiumAttorneyOperations
  const developerHideTitle =
    role === 'developer' &&
    (
      location.pathname === '/dashboard' ||
      location.pathname === '/' ||
      location.pathname === '/clients' ||
      location.pathname === '/documents' ||
      location.pathname === '/snags' ||
      location.pathname === '/pipeline' ||
      location.pathname.startsWith('/pipeline/') ||
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
      location.pathname.startsWith('/attorney/') ||
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
      location.pathname === '/transactions' ||
      location.pathname === '/bond/pipeline' ||
      location.pathname === '/bond/applications' ||
      location.pathname === '/bond/transactions' ||
      location.pathname === '/bond/files' ||
      location.pathname.startsWith('/bond/files/') ||
      location.pathname === '/bond/partner-intelligence' ||
      location.pathname === '/bond/consultant-performance' ||
      location.pathname === '/bond/branch-operations' ||
      location.pathname === '/bond/regional-operations' ||
      location.pathname === '/bond/hq-command-centre' ||
      location.pathname === '/bond/banks' ||
      location.pathname.startsWith('/bond/banks/') ||
      location.pathname === '/bond/revenue' ||
      location.pathname === '/bond/automation' ||
      location.pathname === '/bond/predictive-intelligence' ||
      location.pathname === '/bond/organisation' ||
      location.pathname.startsWith('/bond/organisation/') ||
      location.pathname === '/bond/tasks' ||
      location.pathname === '/bond/calendar' ||
      location.pathname === '/developments' ||
      location.pathname === '/clients' ||
      location.pathname === '/teams' ||
      location.pathname === '/banks' ||
      location.pathname === '/documents' ||
      location.pathname === '/partners' ||
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
      location.pathname === '/' ||
      location.pathname === '/listings' ||
      location.pathname.startsWith('/agent/listings/') ||
      location.pathname.startsWith('/agency/') ||
      location.pathname === '/calendar' ||
      location.pathname === '/reports' ||
      location.pathname.startsWith('/pipeline/')
    )
  const settingsHideTitle = location.pathname === '/settings' || location.pathname.startsWith('/settings/')
  const hideTitle = !title || developerHideTitle || attorneyHideTitle || bondHideTitle || clientHideTitle || agentHideTitle || settingsHideTitle
  const isClientRole = role === 'client'
  const hideSearchInHeader = role === 'attorney' && (location.pathname === '/dashboard' || location.pathname === '/')
  const developerDashboardHeaderOnly = role === 'developer' && (location.pathname === '/dashboard' || location.pathname === '/')
  const userInitials = getUserInitials(user)
  const userAvatarUrl = getUserAvatarUrl(user)
  const isAgentsDirectoryRoute = location.pathname === '/agency/agents'
  const isAttorneyMatterWorkspaceRoute =
    role === 'attorney' &&
    (location.pathname.startsWith('/attorney/matters') || location.pathname.startsWith('/attorney/transactions'))
  const hideQuickCreateInHeader =
    location.pathname === '/settings/legal-templates' ||
    location.pathname === '/settings/signing-templates' ||
    isAttorneyMatterWorkspaceRoute
  const unreadDisplay = notificationState.unreadCount > 99 ? '99+' : String(notificationState.unreadCount || 0)
  const isClientsWorkspaceRoute = location.pathname === '/clients' || location.pathname === '/bond/clients'
  const showClientsWorkspaceTitle = role === 'attorney'
  const clientsWorkspaceCopy = showClientsWorkspaceTitle
    ? {
        title: 'Clients & Parties',
        subtitle: 'Manage clients, counterparties, representatives and matter-linked contacts.',
        addLabel: 'Add Party',
      }
    : {
        addLabel: 'Add Client',
      }
  const isAttorneyDashboardRoute = role === 'attorney' && location.pathname === '/attorney/dashboard'
  const canOpenMissionControl = canAccessHQ(workspaceContext)
  const notificationSections = groupNotificationsByDate(notificationState.notifications)
  const notificationsControl = (
    <div className="relative flex-none" ref={notificationsRef}>
      <button
        type="button"
        className="ui-icon-button relative h-[44px] w-[44px]"
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
        <div
          className="ui-surface-floating absolute right-0 top-[calc(100%+12px)] z-40 flex flex-col overflow-hidden p-3"
          style={{ width: 'calc(100vw - 32px)', maxWidth: '360px', maxHeight: 'min(520px, calc(100vh - 120px))' }}
        >
          <div className="flex items-center justify-between gap-3 px-1 pt-0.5">
            <strong className="text-[0.92rem] font-semibold text-[#101828]">Notifications</strong>
            {notificationState.unreadCount > 0 ? (
              <button
                type="button"
                className="text-sm font-semibold text-primary"
                onClick={async () => {
                  await markAllNotificationsRead()
                  await loadNotifications()
                }}
              >
                Mark all as read
              </button>
            ) : null}
          </div>

          {notificationState.loading && !notificationSections.length ? <p className="mt-3 rounded-2xl bg-[#f8fafc] px-4 py-3 text-sm text-[#667085]">Loading notifications…</p> : null}
          {notificationState.error ? <p className="mt-3 rounded-2xl bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">{notificationState.error}</p> : null}
          {!notificationState.error &&
          !notificationSections.length &&
          !notificationState.loading ? (
            <div className="mt-3 rounded-[20px] border border-dashed border-[#d8e0ea] bg-[#fbfdff] px-4 py-6 text-center">
              <p className="text-sm font-semibold text-[#101828]">No notifications yet</p>
              <p className="mt-1 text-sm text-[#667085]">Important workflow updates, document activity, and transaction alerts will appear here.</p>
            </div>
          ) : null}

          {notificationSections.length ? (
            <div
              className="mt-3 flex-1 space-y-4 overflow-y-auto pr-1"
              style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(132, 146, 166, 0.34) transparent' }}
            >
              {notificationSections.map((section) => (
                <NotificationSection
                  key={section.key}
                  label={section.label}
                  items={section.items}
                  onSelect={async (notification) => {
                    if (!notification.isRead) {
                      await markNotificationRead(notification.id)
                    }
                    await loadNotifications()

                    const actionPath = String(
                      notification.eventData?.applicationPath ||
                        notification.eventData?.actionRoute ||
                        notification.eventData?.path ||
                        '',
                    ).trim()
                    const targetUnitId = notification.unitId || notification.eventData?.unitId || null
                    if (actionPath && actionPath.startsWith('/')) {
                      navigate(actionPath)
                      setNotificationsOpen(false)
                    } else if (targetUnitId) {
                      navigate(`/units/${targetUnitId}`)
                      setNotificationsOpen(false)
                    }
                  }}
                />
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
        className="ui-shell-avatar-trigger h-[44px]"
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="inline-grid h-7 w-7 place-items-center overflow-hidden rounded-full bg-textStrong text-secondary font-semibold text-textInverse">
          {userAvatarUrl ? <img src={userAvatarUrl} alt="" className="h-full w-full object-cover" /> : userInitials}
        </span>
        <ChevronDown size={14} />
      </button>

      {open ? (
        <div className="ui-surface-floating absolute right-0 top-[calc(100%+12px)] z-40 flex min-w-[200px] flex-col p-2">
          <Link className="rounded-control px-3 py-2 text-sm font-medium text-textStrong hover:bg-surfaceAlt" to="/settings/account" onClick={() => setOpen(false)}>
            Profile
          </Link>
          {canOpenMissionControl ? (
            <Link className="rounded-control px-3 py-2 text-sm font-medium text-textStrong hover:bg-surfaceAlt" to="/command-center" onClick={() => setOpen(false)}>
              ⌘ Mission Control
            </Link>
          ) : null}
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
            Log out
          </button>
        </div>
      ) : null}
    </div>
  )

  if (isAttorneyDashboardRoute) {
    return (
      <header className="no-print ui-shell-header ui-shell-header-attorney-dashboard">
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
          {!hideQuickCreateInHeader ? <QuickCreateDropdown /> : null}
          <div className="ui-shell-search min-h-[40px] min-w-[240px] max-w-[520px]" aria-label="Search">
            <Search size={16} className="shrink-0 text-textSoft" />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-secondary text-textStrong outline-none"
              type="search"
              placeholder="Search matters, clients, documents..."
            />
          </div>
          {notificationsControl}
          {avatarControl}
        </div>
      </header>
    )
  }

  if (isClientsWorkspaceRoute) {
    return (
      <header className={`no-print ui-shell-header ui-shell-header-premium${showClientsWorkspaceTitle ? '' : ' ui-shell-header-premium-actions-only'}`}>
        {showClientsWorkspaceTitle ? (
          <div className="ui-shell-dashboard-title">
            <h2>{clientsWorkspaceCopy.title}</h2>
            <span>{clientsWorkspaceCopy.subtitle}</span>
          </div>
        ) : null}

        <div className="ui-shell-actions ui-shell-actions-premium">
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-[#0f2742] px-5 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(15,39,66,0.18)] transition hover:bg-[#173a5e]"
            onClick={() => window.dispatchEvent(new Event('itg:open-add-client'))}
          >
            <Plus size={16} />
            {clientsWorkspaceCopy.addLabel}
          </button>
          {notificationsControl}
          {avatarControl}
        </div>
      </header>
    )
  }

  if (developerDashboardHeaderOnly) {
    return (
      <header className="no-print ui-shell-header ui-shell-header-no-title ui-shell-header-developer-dashboard">
        <div className="ui-shell-actions ui-shell-actions-developer-dashboard">
          {!hideQuickCreateInHeader ? <QuickCreateDropdown /> : null}
          <div className="ui-shell-search ui-shell-search-developer-dashboard min-h-[44px]" aria-label="Search">
            <Search size={17} className="shrink-0 text-textSoft" />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-secondary text-textStrong outline-none"
              type="search"
              placeholder="Search unit, buyer, stage..."
            />
          </div>
          {notificationsControl}
          {avatarControl}
        </div>
      </header>
    )
  }

  if (isPremiumWorkspace) {
    return (
      <header className={`no-print ui-shell-header ui-shell-header-premium${hidePremiumHeaderTitle ? ' ui-shell-header-premium-actions-only' : ''}`}>
        {!hidePremiumHeaderTitle ? (
          <div className="ui-shell-dashboard-title">
            <p>{premiumHeaderEyebrow}</p>
            <h2>{premiumHeaderTitle}</h2>
            <span>{premiumHeaderContext} · Last updated just now</span>
          </div>
        ) : null}

        <div className="ui-shell-actions ui-shell-actions-premium">
          {showPrincipalDashboardHeaderControls ? (
            <div className="ui-shell-dashboard-filters" aria-label="Dashboard filters">
              <HeaderFilterSelect
                icon={LayoutGrid}
                label="Filter dashboard by branch"
                value={dashboardHeaderControls?.selectedWorkspaceId || 'all'}
                options={dashboardHeaderControls?.workspaceOptions || [{ value: 'all', label: 'All Branches' }]}
                onChange={(value) => {
                  window.dispatchEvent(new CustomEvent('itg:principal-dashboard-header-filter-change', {
                    detail: { key: 'selectedWorkspaceId', value },
                  }))
                }}
              />
              <HeaderFilterSelect
                icon={CalendarDays}
                label="Filter dashboard by date range"
                value={dashboardHeaderControls?.dateRange || 'last_30_days'}
                options={dashboardHeaderControls?.dateOptions || [{ value: 'last_30_days', label: 'Last 30 Days' }]}
                onChange={(value) => {
                  window.dispatchEvent(new CustomEvent('itg:principal-dashboard-header-filter-change', {
                    detail: { key: 'dateRange', value },
                  }))
                }}
              />
            </div>
          ) : null}

          <div className="ui-shell-search ui-shell-search-premium min-h-[44px]" aria-label="Search">
            <Search size={17} className="shrink-0 text-textSoft" />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-secondary text-textStrong outline-none"
              type="search"
              placeholder={
                role === 'bond_originator'
                  ? 'Search applications, clients, partners...'
                  : role === 'attorney'
                    ? 'Search matters, clients, documents...'
                    : 'Search transactions, clients, listings...'
              }
            />
            <kbd>⌘K</kbd>
          </div>

          {!hideQuickCreateInHeader ? <QuickCreateDropdown /> : null}

          {notificationsControl}
          {avatarControl}
        </div>
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
        {!hideQuickCreateInHeader ? <QuickCreateDropdown /> : null}

        {!isClientRole && !hideSearchInHeader ? (
          <div
            className={`ui-shell-search min-h-[42px] ${
              isAgentsDirectoryRoute || isAttorneyMatterWorkspaceRoute
                ? 'min-w-[320px] xl:min-w-[520px]'
                : 'min-w-[280px]'
            }`}
            aria-label="Search"
          >
            <Search size={16} className="shrink-0 text-textSoft" />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-secondary text-textStrong outline-none"
              type="search"
              placeholder={
                isAttorneyMatterWorkspaceRoute
                  ? 'Search matter, buyer, seller, erf, unit, attorney...'
                  : isAgentsDirectoryRoute
                    ? 'Search agents by name, email, branch...'
                    : 'Search unit, buyer, stage...'
              }
              onChange={(event) => {
                if (isAgentsDirectoryRoute) {
                  window.dispatchEvent(new CustomEvent('itg:agents-search', { detail: { value: event.target.value } }))
                }
                if (isAttorneyMatterWorkspaceRoute) {
                  window.dispatchEvent(new CustomEvent('itg:attorney-matters-search', { detail: { value: event.target.value } }))
                }
              }}
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
