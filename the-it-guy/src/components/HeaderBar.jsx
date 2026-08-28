import { AlertTriangle, AtSign, Bell, Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, CreditCard, FileText, LayoutGrid, Mail, Plus, RefreshCw, Search, ShieldCheck, UserRoundCheck, XCircle } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { canAccessHQ } from '../auth/hqAccess'
import { fetchMyNotifications, markAllNotificationsRead, markNotificationRead } from '../lib/api'
import { canAccessPrincipalExperience } from '../lib/organisationAccess'
import useDismissableMenu from '../hooks/useDismissableMenu'
import { BACKGROUND_REFRESH_INTERVALS } from '../hooks/backgroundRefreshPolicy.js'
import useVisibilityAwarePolling from '../hooks/useVisibilityAwarePolling.js'
import QuickCreateDropdown from './QuickCreateDropdown'

const NOTIFICATION_POLL_INTERVAL_MS = BACKGROUND_REFRESH_INTERVALS.notifications

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
  if (pathname.startsWith('/developments/')) return ''
  if (pathname === '/bond/files' || pathname.startsWith('/bond/files/')) return ''
  if (role === 'bond_originator' && pathname === '/documents') return ''

  if (stateTitle) {
    return stateTitle
  }

  if (pathname === '/setup' || pathname.startsWith('/setup/')) return ''
  if (pathname === '/agent/rentals' || pathname.startsWith('/agent/rentals/')) return ''
  if (pathname === '/dashboard' || pathname === '/') return 'Dashboard'
  if (pathname === '/developments') return 'Developments'
  if (pathname === '/units') return role === 'developer' ? 'Units' : role === 'bond_originator' ? 'Applications' : 'Transactions'
  if (pathname === '/deals') return 'Transactions'
  if (pathname === '/listings' || pathname.startsWith('/listings/')) return ''
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

  return ''
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

function HeaderScopeToggle({ value = 'company', options = [], onChange }) {
  const normalizedOptions = Array.isArray(options) && options.length
    ? options
    : [
        { value: 'company', label: 'Company' },
        { value: 'agent', label: 'Agent' },
      ]

  return (
    <div className="inline-flex min-h-[44px] shrink-0 items-center rounded-[14px] border border-[#d8e2ee] bg-[#f7f9fc] p-1 shadow-[0_8px_20px_rgba(15,23,42,0.05)]" aria-label="Dashboard data scope">
      {normalizedOptions.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            className={`inline-flex h-9 min-w-[82px] items-center justify-center rounded-[11px] px-3 text-[0.78rem] font-semibold transition ${
              active
                ? 'bg-white text-[#102236] shadow-[0_5px_14px_rgba(15,23,42,0.1)]'
                : 'text-[#66758b] hover:text-[#102236]'
            }`}
            aria-pressed={active}
            onClick={() => onChange?.(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
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
    surface: 'bg-blue-50/60',
    icon: RefreshCw,
  },
  green: {
    badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-100',
    surface: 'bg-emerald-50/70',
    icon: CheckCircle2,
  },
  amber: {
    badge: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-100',
    surface: 'bg-amber-50/75',
    icon: AlertTriangle,
  },
  rose: {
    badge: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-100',
    surface: 'bg-rose-50/75',
    icon: XCircle,
  },
  slate: {
    badge: 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-100',
    surface: 'bg-slate-50/70',
    icon: FileText,
  },
  indigo: {
    badge: 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-100',
    surface: 'bg-indigo-50/60',
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
  additional_document_requested: { tone: 'amber', icon: FileText },
  commercial_access_request: { tone: 'amber', icon: ShieldCheck },
  commercial_access_decision: { tone: 'green', icon: ShieldCheck },
  bond_originator_required: { tone: 'amber', icon: CreditCard },
  attorney_incoming_primary_assigned: { tone: 'indigo', icon: Building2 },
  attorney_incoming_matter_ready_for_acceptance: { tone: 'amber', icon: Building2 },
}

const NOTIFICATION_ACTION_TYPES = new Set([
  'additional_document_requested',
  'attorney_incoming_matter_ready_for_acceptance',
  'bond_originator_required',
  'commercial_access_request',
  'overdue_missing_docs',
])

const NOTIFICATION_DOCUMENT_TYPES = new Set([
  'additional_document_requested',
  'document_uploaded',
  'overdue_missing_docs',
])

const NOTIFICATION_SYSTEM_TYPES = new Set([
  'commercial_access_decision',
  'commercial_access_request',
])

const WORKFLOW_EVENT_TITLES = {
  additional_document_requested: 'Additional document requested',
  attorney_incoming_matter_ready_for_acceptance: 'Matter is ready for acceptance',
  attorney_incoming_primary_assigned: 'Attorney matter assigned',
  bond_originator_required: 'Bond originator assignment is required',
  document_uploaded: 'Document uploaded for review',
  lane_handoff: 'Transaction handoff is ready',
  overdue_missing_docs: 'Required documents are still outstanding',
  participant_assigned: 'You were assigned to this transaction',
  readiness_updated: 'Transaction readiness updated',
  registration_completed: 'Registration completed',
  workflow_updated: 'Workflow updated',
}

function toNotificationText(value) {
  return String(value || '').trim()
}

function titleCaseNotificationText(value) {
  return toNotificationText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getNotificationData(notification = {}) {
  return notification?.eventData && typeof notification.eventData === 'object' ? notification.eventData : {}
}

function findFirstNotificationText(...values) {
  return values.map((value) => toNotificationText(value)).find(Boolean) || ''
}

function getNotificationTone(notification = {}) {
  const type = toNotificationText(notification.type || notification.notificationType).toLowerCase()
  if (type && NOTIFICATION_TYPE_STYLES[type]) return NOTIFICATION_TYPE_STYLES[type].tone

  const haystack = `${notification.title || ''} ${notification.message || ''}`.toLowerCase()
  if (haystack.includes('failed') || haystack.includes('error') || haystack.includes('rejected') || haystack.includes('declin')) return 'rose'
  if (haystack.includes('attention') || haystack.includes('warning') || haystack.includes('overdue') || haystack.includes('missing') || haystack.includes('pending')) return 'amber'
  if (haystack.includes('assigned') || haystack.includes('handoff')) return 'indigo'
  if (haystack.includes('complete') || haystack.includes('approved') || haystack.includes('confirm') || haystack.includes('signed') || haystack.includes('uploaded')) return 'green'
  if (haystack.includes('document') || haystack.includes('draft') || haystack.includes('generated')) return 'slate'

  return 'blue'
}

function getNotificationPresentation(notification = {}) {
  const type = toNotificationText(notification.type || notification.notificationType).toLowerCase()
  const data = getNotificationData(notification)
  const source = toNotificationText(data.source || data.trigger || data.type).toLowerCase()
  const typeConfig = type && NOTIFICATION_TYPE_STYLES[type] ? NOTIFICATION_TYPE_STYLES[type] : null
  const tone = typeConfig?.tone || getNotificationTone(notification)
  const base = NOTIFICATION_TONE_STYLES[tone] || NOTIFICATION_TONE_STYLES.blue
  if (type.includes('mention') || source.includes('mention')) {
    return {
      ...NOTIFICATION_TONE_STYLES.indigo,
      icon: AtSign,
    }
  }
  if (source.includes('portal') || source.includes('email') || type.includes('message')) {
    return {
      ...base,
      icon: Mail,
    }
  }
  return {
    ...base,
    icon: typeConfig?.icon || base.icon,
  }
}

function getNotificationSubject(notification = {}) {
  const data = getNotificationData(notification)
  const propertySubject = findFirstNotificationText(
    data.propertyAddress,
    data.property_address,
    data.address,
    data.listingAddress,
    data.listing_address,
    data.unitAddress,
    data.unit_address,
  )
  if (propertySubject) return propertySubject

  const unitAndDevelopment = [data.unitLabel || data.unit_label || data.unitName || data.unit_name, data.developmentName || data.development_name]
    .map((item) => toNotificationText(item))
    .filter(Boolean)
    .join(', ')
  if (unitAndDevelopment) return unitAndDevelopment

  return findFirstNotificationText(
    notification.entityLabel,
    notification.relatedEntityLabel,
    data.leadName,
    data.lead_name,
    data.buyerName,
    data.buyer_name,
    data.sellerName,
    data.seller_name,
    data.clientName,
    data.client_name,
    data.personName,
    data.person_name,
    data.matterName,
    data.matter_name,
    data.agencyName,
    data.agency_name,
    data.organisationName,
    data.organisation_name,
    data.transactionReference,
    data.transaction_reference,
    data.applicationReference,
    data.application_reference,
    data.developmentName,
    data.development_name,
    notification.title,
    'Notification',
  )
}

function getNotificationMessage(notification = {}) {
  const data = getNotificationData(notification)
  const type = toNotificationText(notification.type || notification.notificationType).toLowerCase()
  const source = toNotificationText(data.source || data.trigger || data.type).toLowerCase()
  const message = toNotificationText(notification.message)

  if (source === 'client_onboarding_submitted') {
    const buyerName = toNotificationText(data.buyerName || data.buyer_name)
    return buyerName ? `${buyerName} completed onboarding` : 'Client onboarding has been completed'
  }

  if (source === 'additional_document_requested' || type === 'additional_document_requested') {
    const documentName = toNotificationText(data.documentName || data.document_name)
    return documentName ? `${documentName} was requested` : 'Additional document requested'
  }

  if (source === 'document_request_upload_linked' || type === 'document_uploaded') {
    return message || 'A document was uploaded and is waiting for review'
  }

  if (source === 'signed_otp_received' || type === 'lane_handoff') {
    const workflow = toNotificationText(data.workflow)
    if (workflow === 'finance') return 'Finance handoff is ready'
    if (workflow === 'attorney') return 'Transfer handoff is ready'
    return message || 'Transaction handoff is ready'
  }

  if (type === 'bond_originator_required') return 'No bond originator is assigned yet'
  if (type === 'overdue_missing_docs') return message || 'Required documents are still outstanding'
  if (type === 'participant_assigned') return message || 'You were assigned to this transaction'

  return message || WORKFLOW_EVENT_TITLES[type] || toNotificationText(notification.title) || 'Workflow activity update'
}

function getNotificationContextLabel(notification = {}) {
  const data = getNotificationData(notification)
  const type = toNotificationText(notification.type || notification.notificationType).toLowerCase()
  const source = toNotificationText(data.source || data.trigger || '').toLowerCase()
  const workflow = toNotificationText(data.workflow).toLowerCase()
  const roleLabel = titleCaseNotificationText(notification.roleType || data.recipientRole || data.assignedRole)

  if (NOTIFICATION_DOCUMENT_TYPES.has(type) || source.includes('document')) return 'Documents'
  if (type.includes('lead') || source.includes('lead')) return 'Lead'
  if (workflow === 'finance' || type.includes('bond')) return 'Finance'
  if (workflow === 'attorney' || type.includes('attorney')) return 'Matter'
  if (source.includes('seller') || source.includes('mandate')) return 'Listing'
  if (roleLabel) return roleLabel
  return notification.transactionId ? 'Transaction' : 'System'
}

function getNotificationDestination(notification = {}) {
  const data = getNotificationData(notification)
  const explicitPath = findFirstNotificationText(data.applicationPath, data.actionRoute, data.path, data.href, data.url)
  if (explicitPath.startsWith('/')) return explicitPath

  const targetUnitId = notification.unitId || data.unitId || data.unit_id || null
  if (targetUnitId) return `/units/${targetUnitId}`

  const transactionId = notification.transactionId || data.transactionId || data.transaction_id || null
  if (transactionId) return `/transactions/${transactionId}`

  return ''
}

function getNotificationPriority(notification = {}) {
  const data = getNotificationData(notification)
  const type = toNotificationText(notification.type || notification.notificationType).toLowerCase()
  const haystack = `${notification.title || ''} ${notification.message || ''} ${data.priority || ''}`.toLowerCase()
  if (haystack.includes('critical') || haystack.includes('failed') || haystack.includes('error') || haystack.includes('blocked')) return 'critical'
  if (NOTIFICATION_ACTION_TYPES.has(type) || haystack.includes('overdue') || haystack.includes('missing') || haystack.includes('required')) return 'warning'
  return 'normal'
}

function notificationRequiresAction(notification = {}) {
  const data = getNotificationData(notification)
  const type = toNotificationText(notification.type || notification.notificationType).toLowerCase()
  const actionRequired = data.actionRequired || data.action_required
  if (actionRequired) return true
  if (NOTIFICATION_ACTION_TYPES.has(type)) return true

  const haystack = `${notification.title || ''} ${notification.message || ''}`.toLowerCase()
  return haystack.includes('requires') || haystack.includes('required') || haystack.includes('overdue') || haystack.includes('missing') || haystack.includes('waiting for review')
}

function getNotificationActionLabel(notification = {}) {
  const data = getNotificationData(notification)
  const explicit = toNotificationText(data.actionLabel || data.action_label)
  if (explicit) return explicit

  const type = toNotificationText(notification.type || notification.notificationType).toLowerCase()
  if (type === 'additional_document_requested' || type === 'overdue_missing_docs') return 'Review'
  if (type === 'document_uploaded') return 'Review'
  if (type === 'bond_originator_required') return 'Assign'
  if (type === 'attorney_incoming_matter_ready_for_acceptance') return 'Open matter'
  if (type === 'commercial_access_request') return 'Review'
  if (notificationRequiresAction(notification)) return 'Open'
  return ''
}

function formatNotificationAbsoluteTime(value) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatNotificationRelativeTime(value) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const deltaSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  const deltaMinutes = Math.floor(deltaSeconds / 60)
  const deltaHours = Math.floor(deltaMinutes / 60)

  if (deltaSeconds < 45) return 'Just now'
  if (deltaMinutes < 60) return `${deltaMinutes} min ago`
  if (deltaHours < 24) return `${deltaHours} hr${deltaHours === 1 ? '' : 's'} ago`

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (day.getTime() === startOfYesterday.getTime()) {
    return `Yesterday, ${new Intl.DateTimeFormat('en-ZA', { hour: '2-digit', minute: '2-digit' }).format(date)}`
  }

  return new Intl.DateTimeFormat('en-ZA', {
    day: 'numeric',
    month: 'short',
  }).format(date)
}

function formatNotificationSectionDate(value) {
  if (!value) return 'Earlier'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Earlier'

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (day.getTime() === startOfToday.getTime()) return 'Today'
  if (day.getTime() === startOfYesterday.getTime()) return 'Yesterday'
  return 'Earlier'
}

function getNotificationDateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (day.getTime() === startOfToday.getTime()) return 'today'
  if (day.getTime() === startOfYesterday.getTime()) return 'yesterday'
  return 'earlier'
}

function groupItemsByDate(items = []) {
  const sortedItems = [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const leftTime = new Date(left?.createdAt || 0).getTime()
    const rightTime = new Date(right?.createdAt || 0).getTime()
    return rightTime - leftTime
  })

  const sections = []
  const sectionIndex = new Map()

  for (const item of sortedItems) {
    const key = getNotificationDateKey(item?.createdAt || null)
    const label = formatNotificationSectionDate(item?.createdAt || null)
    let section = sectionIndex.get(key)

    if (!section) {
      section = { key, label, items: [] }
      sectionIndex.set(key, section)
      sections.push(section)
    }

    section.items.push(item)
  }

  return sections
}

function getNotificationCategory(notification = {}) {
  const data = getNotificationData(notification)
  const type = toNotificationText(notification.type || notification.notificationType).toLowerCase()
  const source = toNotificationText(data.source || data.trigger || data.type).toLowerCase()

  if (type.includes('mention') || source.includes('mention')) return 'mentions'
  if (NOTIFICATION_DOCUMENT_TYPES.has(type) || source.includes('document')) return 'documents'
  if (type.includes('lead') || source.includes('lead')) return 'leads'
  if (NOTIFICATION_SYSTEM_TYPES.has(type) || type.includes('security') || source.includes('system')) return 'system'
  return 'transactions'
}

function getNotificationGroupKey(notification = {}) {
  if (notificationRequiresAction(notification)) return ''
  if (getNotificationPriority(notification) !== 'normal') return ''

  const data = getNotificationData(notification)
  const type = toNotificationText(notification.type || notification.notificationType).toLowerCase()
  const haystack = `${notification.title || ''} ${notification.message || ''}`.toLowerCase()
  if (haystack.includes('@') || type.includes('mention') || type.includes('security')) return ''

  const objectId = notification.transactionId || data.transactionId || data.transaction_id || data.listingId || data.listing_id || data.leadId || data.lead_id || ''
  if (!objectId) return ''

  const workflow = toNotificationText(data.workflow || data.source || data.trigger || type || 'workflow').toLowerCase()
  return `${objectId}:${workflow}`
}

function mapNotificationDisplayItem(notification = {}) {
  const presentation = getNotificationPresentation(notification)
  const createdAt = notification.createdAt || notification.created_at || null
  const destinationHref = getNotificationDestination(notification)
  const requiresAction = notificationRequiresAction(notification)
  const actionLabel = requiresAction && destinationHref ? getNotificationActionLabel(notification) : ''
  const priority = getNotificationPriority(notification)

  return {
    id: notification.id,
    notification,
    sourceNotifications: [notification],
    title: getNotificationSubject(notification),
    message: getNotificationMessage(notification),
    contextLabel: getNotificationContextLabel(notification),
    relativeTime: formatNotificationRelativeTime(createdAt),
    absoluteTime: formatNotificationAbsoluteTime(createdAt),
    createdAt,
    icon: presentation.icon || RefreshCw,
    badgeClassName: presentation.badge,
    surfaceClassName: presentation.surface || 'bg-slate-50',
    isUnread: !notification.isRead,
    requiresAction,
    priority,
    actionLabel,
    actionHref: actionLabel ? destinationHref : '',
    destinationHref,
    groupKey: getNotificationGroupKey(notification),
    category: getNotificationCategory(notification),
    updateCount: 1,
  }
}

function canGroupNotificationItems(items = []) {
  if (items.length < 2) return false
  const times = items.map((item) => new Date(item.createdAt || 0).getTime()).filter(Number.isFinite)
  if (times.length < 2) return false
  return Math.max(...times) - Math.min(...times) <= 1000 * 60 * 60 * 2
}

function getGroupedNotificationMessage(item, count) {
  const lowerMessage = toNotificationText(item.message).toLowerCase()
  if (lowerMessage.includes('mandate') && lowerMessage.includes('signed')) {
    return `Mandate completed${count > 1 ? ` with ${count} updates` : ''}`
  }
  return `${item.message}${count > 1 ? ` - ${count} updates` : ''}`
}

function groupDisplayNotifications(items = []) {
  const groups = new Map()
  const ungrouped = []

  for (const item of items) {
    if (!item.groupKey) {
      ungrouped.push(item)
      continue
    }
    const group = groups.get(item.groupKey) || []
    group.push(item)
    groups.set(item.groupKey, group)
  }

  const grouped = [...ungrouped]
  for (const groupItems of groups.values()) {
    const sorted = [...groupItems].sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
    if (!canGroupNotificationItems(sorted)) {
      grouped.push(...sorted)
      continue
    }

    const [latest] = sorted
    grouped.push({
      ...latest,
      id: `group:${latest.groupKey}`,
      sourceNotifications: sorted.flatMap((item) => item.sourceNotifications || [item.notification]).filter(Boolean),
      message: getGroupedNotificationMessage(latest, sorted.length),
      isUnread: sorted.some((item) => item.isUnread),
      updateCount: sorted.length,
    })
  }

  return grouped.sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
}

function getNotificationFilterOptions(items = []) {
  const counts = items.reduce((accumulator, item) => {
    accumulator.all += 1
    if (item.requiresAction) accumulator.action_required += 1
    accumulator[item.category] = (accumulator[item.category] || 0) + 1
    return accumulator
  }, { all: 0, action_required: 0 })

  const availableCategories = [
    { key: 'mentions', label: 'Mentions' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'leads', label: 'Leads' },
    { key: 'documents', label: 'Documents' },
    { key: 'system', label: 'System' },
  ].filter((option) => counts[option.key] > 0)

  return [
    { key: 'all', label: 'All', count: counts.all },
    ...(counts.action_required > 0 ? [{ key: 'action_required', label: 'Action required', count: counts.action_required }] : []),
    ...availableCategories.map((option) => ({ ...option, count: counts[option.key] || 0 })),
  ]
}

function filterNotificationItems(items = [], activeFilter = 'all') {
  if (activeFilter === 'all') return items
  if (activeFilter === 'action_required') return items.filter((item) => item.requiresAction)
  return items.filter((item) => item.category === activeFilter)
}

function groupDisplayItemsBySection(items = []) {
  const actionRequiredItems = items.filter((item) => item.requiresAction)
  const standardItems = items.filter((item) => !item.requiresAction)
  const sections = []

  if (actionRequiredItems.length) {
    sections.push({
      key: 'action_required',
      label: `Action Required - ${actionRequiredItems.length}`,
      items: actionRequiredItems,
      action: true,
    })
  }

  return [
    ...sections,
    ...groupItemsByDate(standardItems).map((section) => ({
      ...section,
      action: false,
    })),
  ]
}

function NotificationMeta({ contextLabel, relativeTime, absoluteTime, createdAt, updateCount }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-[#5d6f86]">
      {contextLabel ? <span>{contextLabel}</span> : null}
      {contextLabel && relativeTime ? <span aria-hidden="true">&middot;</span> : null}
      {relativeTime ? (
        <time dateTime={createdAt || undefined} title={absoluteTime || undefined}>
          {relativeTime}
        </time>
      ) : null}
      {updateCount > 1 ? (
        <>
          <span aria-hidden="true">&middot;</span>
          <span>{updateCount} updates</span>
        </>
      ) : null}
    </p>
  )
}

function NotificationItem({ item, onSelect }) {
  const Icon = item.icon || RefreshCw

  return (
    <button
      type="button"
      className={`group relative w-full px-4 py-4 text-left transition duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0f7a4f] ${
        item.isUnread ? 'bg-[#f6fbff] hover:bg-[#f2f8ff]' : 'bg-white hover:bg-[#f8fafc]'
      }`}
      onClick={() => onSelect(item)}
    >
      <div className="flex items-start gap-4">
        <span className={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px] ${item.badgeClassName}`}>
          <Icon size={18} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className={`min-w-0 text-sm leading-5 ${item.isUnread ? 'font-semibold text-[#101828]' : 'font-medium text-[#24364a]'}`} title={item.title}>
              {item.title}
            </p>
            <span className="mt-1 flex shrink-0 items-center gap-3">
              {item.isUnread ? <span className="h-2.5 w-2.5 rounded-full bg-[#1769d1]" aria-label="Unread notification" /> : null}
              <ChevronRight size={17} className="text-[#60738a] transition group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-[#40546b]" title={item.message}>
            {item.message}
          </p>
          <NotificationMeta
            contextLabel={item.contextLabel}
            relativeTime={item.relativeTime}
            absoluteTime={item.absoluteTime}
            createdAt={item.createdAt}
            updateCount={item.updateCount}
          />
        </div>
      </div>
    </button>
  )
}

function ActionNotificationItem({ item, onSelect }) {
  const Icon = item.icon || AlertTriangle

  return (
    <div className="rounded-[18px] border border-rose-100 bg-[#fff7f7] px-4 py-4 shadow-[0_10px_24px_rgba(190,18,60,0.05)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <button type="button" className="flex min-w-0 flex-1 items-start gap-4 text-left" onClick={() => onSelect(item)}>
          <span className={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px] ${item.priority === 'critical' ? 'bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200' : item.badgeClassName}`}>
            <Icon size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-3">
              <span className="text-sm font-semibold leading-5 text-[#101828]" title={item.title}>{item.title}</span>
              {item.isUnread ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#1769d1]" aria-label="Unread notification" /> : null}
            </span>
            <span className="mt-1 block text-sm leading-5 text-[#40546b]" title={item.message}>{item.message}</span>
            <NotificationMeta
              contextLabel={item.contextLabel}
              relativeTime={item.relativeTime}
              absoluteTime={item.absoluteTime}
              createdAt={item.createdAt}
              updateCount={item.updateCount}
            />
          </span>
        </button>
        {item.actionLabel ? (
          <button
            type="button"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-[12px] border border-rose-200 bg-white px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
            onClick={() => onSelect(item)}
          >
            {item.actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function NotificationSection({ section, onSelect }) {
  return (
    <section className="space-y-3">
      <p className="px-1 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#64748b]">
        {section.label}
      </p>
      <div className={section.action ? 'space-y-2' : 'overflow-hidden rounded-[18px] border border-[#dce5ef] bg-white'}>
        {section.items.map((item, index) => (
          section.action ? (
            <ActionNotificationItem key={item.id} item={item} onSelect={onSelect} />
          ) : (
            <div key={item.id} className={index > 0 ? 'border-t border-[#edf1f6]' : ''}>
              <NotificationItem item={item} onSelect={onSelect} />
            </div>
          )
        ))}
      </div>
    </section>
  )
}

function NotificationFilters({ options, activeFilter, onChange }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Notification filters">
      {options.map((option) => {
        const active = activeFilter === option.key
        return (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-[12px] border px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f7a4f] ${
              active
                ? 'border-[#0f7a4f] bg-[#effaf4] text-[#075f3f]'
                : 'border-[#dce5ef] bg-white text-[#40546b] hover:border-[#b9c8d8] hover:bg-[#f8fafc]'
            }`}
            onClick={() => onChange(option.key)}
          >
            <span>{option.label}</span>
            {option.count > 0 ? (
              <span className={`inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[0.72rem] ${
                active ? 'bg-[#147a52] text-white' : 'bg-[#eef3f8] text-[#40546b]'
              }`}>
                {option.count > 99 ? '99+' : option.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function NotificationToast({ message }) {
  if (!message) return null
  return (
    <div className="pointer-events-none absolute left-4 right-4 top-4 z-10 flex justify-center">
      <p className="rounded-full bg-[#101828] px-4 py-2 text-xs font-semibold text-white shadow-lg">
        {message}
      </p>
    </div>
  )
}

function HeaderBar({ onLogout, user }) {
  const navigate = useNavigate()
  const location = useLocation()
  const workspaceContext = useWorkspace()
  const { role, agencyWorkflowMode } = workspaceContext
  const [open, setOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [activeNotificationFilter, setActiveNotificationFilter] = useState('all')
  const [notificationToast, setNotificationToast] = useState('')
  const [notificationState, setNotificationState] = useState({
    notifications: [],
    unreadCount: 0,
    loading: false,
    error: '',
  })
  const [dashboardHeaderControls, setDashboardHeaderControls] = useState(null)
  const dropdownRef = useRef(null)
  const notificationsRef = useRef(null)
  const notificationBellRef = useRef(null)
  const avatarDismissRefs = useMemo(() => [dropdownRef], [])
  const notificationDismissRefs = useMemo(() => [notificationsRef], [])
  const closeAvatarMenu = useCallback(() => setOpen(false), [])
  const closeNotifications = useCallback(() => setNotificationsOpen(false), [])

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

  const loadNotifications = useCallback(async ({ unreadOnly = false, runReminderAutomation = false } = {}) => {
    setNotificationState((previous) => ({
      ...previous,
      loading: true,
      error: '',
    }))

    try {
      const payload = await fetchMyNotifications({ limit: 25, unreadOnly, runReminderAutomation })
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

  useDismissableMenu({
    open,
    refs: avatarDismissRefs,
    onDismiss: closeAvatarMenu,
  })

  useDismissableMenu({
    open: notificationsOpen,
    refs: notificationDismissRefs,
    onDismiss: closeNotifications,
  })

  useEffect(() => {
    closeAvatarMenu()
    closeNotifications()
  }, [closeAvatarMenu, closeNotifications, location.pathname, location.search])

  useEffect(() => {
    if (!notificationsOpen) return undefined

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setNotificationsOpen(false)
        notificationBellRef.current?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [notificationsOpen])

  useEffect(() => {
    if (!notificationToast) return undefined
    const timeoutId = window.setTimeout(() => setNotificationToast(''), 2200)
    return () => window.clearTimeout(timeoutId)
  }, [notificationToast])

  useEffect(() => {
    if (document.visibilityState === 'visible') void loadNotifications()
  }, [role, loadNotifications])

  useVisibilityAwarePolling(
    () => loadNotifications(),
    {
      enabled: Boolean(role),
      intervalMs: NOTIFICATION_POLL_INTERVAL_MS,
      minForegroundIntervalMs: 60_000,
      label: 'notifications',
    },
  )

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
  const canUsePrincipalDashboardControls =
    role === 'principal' ||
    role === 'headquarters' ||
    canAccessPrincipalExperience({
      appRole: role,
      membershipRole: workspaceContext.organisationMembershipRole || workspaceContext.workspaceRole,
    })
  const showPrincipalDashboardHeaderControls =
    canUsePrincipalDashboardControls &&
    (location.pathname === '/dashboard' || location.pathname === '/') &&
    dashboardHeaderControls?.visible !== false
  const premiumHeaderTitle = isPremiumAttorneyOperations
    ? ''
    : location.pathname.startsWith('/pipeline/leads')
    ? 'Leads'
    : location.pathname.startsWith('/agency/branches')
      ? 'Branch'
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
    ? 'Pipeline'
    : location.pathname.startsWith('/agency/branches')
      ? 'Executive branch cockpit'
      : agencyWorkflowMode === 'principal'
        ? 'Agency command centre'
        : 'Agent'
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
      location.pathname.startsWith('/listings/') ||
      location.pathname.startsWith('/agent/listings/') ||
      location.pathname.startsWith('/agency/') ||
      location.pathname === '/calendar' ||
      location.pathname === '/reports' ||
      location.pathname.startsWith('/pipeline/')
    )
  const settingsHideTitle = location.pathname === '/settings' || location.pathname.startsWith('/settings/')
  const isTransactionWorkspaceRoute =
    /^\/transactions\/[^/]+(?:\/transfer\/[^/]+)?$/.test(location.pathname) ||
    /^\/developments\/[^/]+\/transactions\/[^/]+$/.test(location.pathname)
  const hideTitle = !title || developerHideTitle || attorneyHideTitle || bondHideTitle || clientHideTitle || agentHideTitle || settingsHideTitle || isTransactionWorkspaceRoute
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
    location.pathname === '/settings/signing-templates'
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
  const notificationDisplayItems = useMemo(
    () => (notificationState.notifications || []).map((notification) => mapNotificationDisplayItem(notification)),
    [notificationState.notifications],
  )
  const notificationFilterOptions = useMemo(
    () => getNotificationFilterOptions(notificationDisplayItems),
    [notificationDisplayItems],
  )
  const filteredNotificationItems = useMemo(
    () => groupDisplayNotifications(filterNotificationItems(notificationDisplayItems, activeNotificationFilter)),
    [activeNotificationFilter, notificationDisplayItems],
  )
  const notificationSections = useMemo(
    () => groupDisplayItemsBySection(filteredNotificationItems),
    [filteredNotificationItems],
  )
  const filteredNotificationCount = filteredNotificationItems.length

  useEffect(() => {
    if (!notificationFilterOptions.some((option) => option.key === activeNotificationFilter)) {
      setActiveNotificationFilter('all')
    }
  }, [activeNotificationFilter, notificationFilterOptions])

  const handleNotificationSelect = useCallback(async (item) => {
    const sourceNotifications = Array.isArray(item?.sourceNotifications) && item.sourceNotifications.length
      ? item.sourceNotifications
      : item?.notification
        ? [item.notification]
        : []
    const unreadNotifications = sourceNotifications.filter((notification) => notification?.id && !notification.isRead)
    const unreadIds = [...new Set(unreadNotifications.map((notification) => notification.id))]

    if (unreadIds.length) {
      setNotificationState((previous) => ({
        ...previous,
        unreadCount: Math.max(0, Number(previous.unreadCount || 0) - unreadIds.length),
        notifications: previous.notifications.map((notification) =>
          unreadIds.includes(notification.id) ? { ...notification, isRead: true } : notification,
        ),
      }))
    }

    try {
      if (unreadIds.length) {
        await Promise.all(unreadIds.map((id) => markNotificationRead(id)))
      }
    } catch (error) {
      setNotificationToast(error?.message || 'Unable to update notification.')
    } finally {
      await loadNotifications()
    }

    const destination = toNotificationText(item?.destinationHref || item?.actionHref)
    if (destination && destination.startsWith('/')) {
      navigate(destination)
      setNotificationsOpen(false)
    }
  }, [loadNotifications, navigate])

  const notificationsControl = (
    <div className="relative flex-none" ref={notificationsRef}>
      <button
        ref={notificationBellRef}
        type="button"
        className="ui-icon-button relative h-[44px] w-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f7a4f]"
        aria-label={`Notifications${notificationState.unreadCount > 0 ? `, ${notificationState.unreadCount} unread` : ''}`}
        aria-expanded={notificationsOpen}
        aria-haspopup="dialog"
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
          <span className="absolute -right-1 -top-1 inline-flex min-h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#0f7a4f] px-1.5 text-[0.72rem] font-semibold leading-none text-white shadow-sm">
            {unreadDisplay}
          </span>
        ) : null}
      </button>

      {notificationsOpen ? (
        <div
          className="ui-surface-floating fixed inset-x-3 bottom-4 top-[72px] z-40 flex flex-col overflow-hidden rounded-t-[20px] border border-[#d9e3ef] bg-white p-0 shadow-[0_24px_80px_rgba(15,23,42,0.18)] sm:absolute sm:inset-auto sm:right-0 sm:top-[calc(100%+12px)] sm:rounded-[20px]"
          style={{ width: 'min(760px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 120px)' }}
          role="dialog"
          aria-label="Notifications"
        >
          <NotificationToast message={notificationToast} />
          <div className="shrink-0 border-b border-[#e6edf4] px-6 pb-4 pt-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <strong className="block text-[1.2rem] font-semibold leading-7 text-[#101828]">Notifications</strong>
                <p className="mt-0.5 text-sm font-semibold text-[#0f7a4f]">
                  {notificationState.unreadCount === 1 ? '1 unread' : `${notificationState.unreadCount} unread`}
                </p>
              </div>
              {notificationState.unreadCount > 0 ? (
                <button
                  type="button"
                  className="min-h-[44px] shrink-0 rounded-[12px] px-3 text-sm font-semibold text-[#0f7a4f] transition hover:bg-[#effaf4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f7a4f]"
                  onClick={async () => {
                    setNotificationState((previous) => ({
                      ...previous,
                      unreadCount: 0,
                      notifications: previous.notifications.map((notification) => ({ ...notification, isRead: true })),
                    }))
                    try {
                      await markAllNotificationsRead()
                      setNotificationToast('Notifications marked as read.')
                    } catch (error) {
                      setNotificationToast(error?.message || 'Unable to mark notifications read.')
                    } finally {
                      await loadNotifications()
                    }
                  }}
                >
                  Mark all as read
                </button>
              ) : null}
            </div>
            {notificationFilterOptions.length > 1 ? (
              <div className="mt-4">
                <NotificationFilters
                  options={notificationFilterOptions}
                  activeFilter={activeNotificationFilter}
                  onChange={setActiveNotificationFilter}
                />
              </div>
            ) : null}
          </div>

          <div
            className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[#fbfcfe] px-6 py-5"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(132, 146, 166, 0.34) transparent' }}
          >
            {notificationState.loading && !notificationSections.length ? <p className="rounded-[16px] bg-white px-4 py-3 text-sm text-[#667085] ring-1 ring-[#e6edf4]">Loading notifications...</p> : null}
            {notificationState.error ? <p className="rounded-[16px] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318] ring-1 ring-rose-100">{notificationState.error}</p> : null}
            {!notificationState.error &&
            !notificationSections.length &&
            !notificationState.loading ? (
              <div className="rounded-[18px] border border-dashed border-[#d8e0ea] bg-white px-4 py-8 text-center">
                <p className="text-sm font-semibold text-[#101828]">No notifications yet</p>
                <p className="mt-1 text-sm text-[#667085]">
                  {activeNotificationFilter === 'all' ? 'Important workflow updates, document activity, and transaction alerts will appear here.' : 'No notifications match this filter.'}
                </p>
              </div>
            ) : null}

            {notificationSections.length ? (
              <>
                {notificationSections.map((section) => (
                  <NotificationSection
                    key={section.key}
                    section={section}
                    onSelect={handleNotificationSelect}
                  />
                ))}
              </>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-[#e6edf4] bg-white px-6 py-4">
            <Link
              to="/mobile/notifications"
              className="mx-auto flex min-h-[44px] w-fit items-center gap-3 rounded-[12px] px-4 text-sm font-semibold text-[#101828] transition hover:bg-[#f3f6fa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f7a4f]"
              onClick={() => setNotificationsOpen(false)}
            >
              <FileText size={17} className="text-[#52657a]" />
              <span>View all notifications</span>
              <ChevronRight size={17} className="text-[#101828]" />
            </Link>
            <span className="sr-only">{filteredNotificationCount} notifications shown</span>
          </div>
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
          <div className="ui-shell-search min-h-[40px] min-w-[240px] max-w-[520px]" aria-label="Search">
            <Search size={16} className="shrink-0 text-textSoft" />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-secondary text-textStrong outline-none"
              type="search"
              placeholder="Search matters, clients, documents..."
            />
          </div>
          {!hideQuickCreateInHeader ? <QuickCreateDropdown /> : null}
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
          <div className="ui-shell-search ui-shell-search-developer-dashboard min-h-[44px]" aria-label="Search">
            <Search size={17} className="shrink-0 text-textSoft" />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-secondary text-textStrong outline-none"
              type="search"
              placeholder="Search unit, buyer, stage..."
            />
          </div>
          {!hideQuickCreateInHeader ? <QuickCreateDropdown /> : null}
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
              <HeaderScopeToggle
                value={dashboardHeaderControls?.dataScope || 'company'}
                options={dashboardHeaderControls?.dataScopeOptions || [
                  { value: 'company', label: 'Company' },
                  { value: 'agent', label: 'Agent' },
                ]}
                onChange={(value) => {
                  window.dispatchEvent(new CustomEvent('itg:principal-dashboard-header-filter-change', {
                    detail: { key: 'dataScope', value },
                  }))
                }}
              />
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

        {!hideQuickCreateInHeader ? <QuickCreateDropdown /> : null}

        {notificationsControl}
        {avatarControl}
      </div>
    </header>
  )
}

export default HeaderBar
