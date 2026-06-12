import {
  Archive,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Trash2,
  UserPlus,
  UserRound,
  WalletCards,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import { useWorkspace } from '../context/WorkspaceContext'
import { createAgencyCrmLeadActivity, createAgencyCrmLeadRecord } from '../lib/agencyCrmRepository'
import { leadCategoryLabel, normalizeLeadCategory } from '../lib/leadCategory'
import { readAgentPrivateListings } from '../lib/agentListingStorage'
import { canAccessPrincipalExperience, normalizeOrganisationMembershipRole } from '../lib/organisationAccess'
import {
  createCanvassingActivity,
  createCanvassingProspect,
  deleteCanvassingProspect,
  listCanvassingWorkspace,
  updateCanvassingProspect,
} from '../lib/canvassingRepository'
import { fetchOrganisationSettings, listOrganisationUsers } from '../lib/settingsApi'
import { getAgentPrivateListings } from '../services/privateListingService'

const CANVASSING_CONTEXT_TIMEOUT_MS = 20000

function withCanvassingTimeout(task, message, timeoutMs = CANVASSING_CONTEXT_TIMEOUT_MS) {
  let timeoutId = null
  return Promise.race([
    task,
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

const PROSPECT_TYPES = [
  'Seller Prospect',
  'Buyer Prospect',
  'Landlord Prospect',
  'Tenant Prospect',
  'Investor Prospect',
  'Other',
]

const CANVASSING_METHODS = [
  'Cold Call',
  'Door Knock',
  'Area Farming',
  'Expired Listing',
  'Database Reactivation',
  'WhatsApp Outreach',
  'Email Outreach',
  'Referral Follow-Up',
  'Valuation Campaign',
  'Other',
]

const PROSPECT_PROPERTY_TYPES = [
  'House',
  'Apartment',
  'Townhouse',
  'Duplex',
  'Vacant Land',
  'Farm',
  'Commercial',
  'Industrial',
  'Development',
  'Other',
]

const PROSPECT_STATUSES = [
  'New',
  'Contacted',
  'Interested',
  'Follow-Up Later',
  'Not Interested',
  'Converted to Lead',
  'Lost',
  'Archived',
]

const PROSPECT_LOST_REASONS = [
  'No response',
  'Not interested',
  'Duplicate',
  'Wrong details',
  'Already listed elsewhere',
  'Bought/sold elsewhere',
  'Other',
]

const ACTIVITY_TYPES = ['Call', 'WhatsApp', 'Email', 'Door Knock', 'Note', 'Follow-Up']
const CANVASSING_ACTION_MENU_WIDTH = 192

const CANVASSING_SOURCE_PILL_STYLES = {
  property24: { tone: 'blue', label: 'Property24' },
  privateProperty: { tone: 'green', label: 'Private Property' },
  website: { tone: 'violet', label: 'Website' },
  whatsapp: { tone: 'emerald', label: 'WhatsApp' },
  call: { tone: 'red', label: 'Call' },
  referral: { tone: 'amber', label: 'Referral' },
  walkIn: { tone: 'slate', label: 'Walk-in' },
  unknown: { tone: 'slate', label: 'Unknown' },
}

const CANVASSING_SOURCE_PILL_FALLBACK = CANVASSING_SOURCE_PILL_STYLES.unknown
const CANVASSING_SOURCE_PILL_ORDER = ['property24', 'privateProperty', 'whatsapp', 'call', 'website', 'referral', 'walkIn', 'unknown']
const CANVASSING_PROSPECT_VIEW_STORAGE_KEY = 'itg:canvassing:prospectView'

const CANVASSING_SOURCE_TONE_STYLES = {
  slate: 'border-slate-200 bg-slate-50 text-slate-600',
  blue: 'border-sky-200 bg-sky-50 text-sky-700',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  emerald: 'border-emerald-300 bg-emerald-100 text-emerald-800',
  red: 'border-rose-200 bg-rose-50 text-rose-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
}

function StatusTonePill({ children, tone = 'slate', className = '' }) {
  const style = CANVASSING_SOURCE_TONE_STYLES[tone] || CANVASSING_SOURCE_TONE_STYLES.slate
  return (
    <span className={`inline-flex min-h-6 items-center rounded-full border px-2.5 text-xs font-semibold ${style} ${className}`.trim()}>
      {children}
    </span>
  )
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function isAuthSessionMissingError(error) {
  const message = normalizeText(error?.message || error).toLowerCase()
  return message.includes('auth session missing') || message.includes('missing auth session')
}

function resolveCanvassingSourceText(value = '') {
  const fallback = 'Unknown'
  const raw = normalizeText(value)
  if (!raw) return fallback
  const normalized = raw.toLowerCase()
  if (normalized.includes('property24')) return 'Property24'
  if (normalized.includes('private') && normalized.includes('property')) return 'Private Property'
  if (normalized.includes('whatsapp')) return 'WhatsApp'
  if (normalized.includes('email') || normalized.includes('website')) return normalized.includes('website') ? 'Website' : 'Email'
  if (normalized.includes('call') || normalized.includes('phone') || normalized.includes('cold call')) return 'Call'
  if (normalized.includes('referral')) return 'Referral'
  if (normalized.includes('walk in') || normalized.includes('walk-in')) return 'Walk-in'
  if (normalized.includes('facebook') || normalized.includes('google') || normalized.includes('signboard')) return 'Referral'
  return fallback
}

function normalizeCanvassingSourceKey(value = '') {
  const source = resolveCanvassingSourceText(value).toLowerCase()
  if (source.includes('property24')) return 'property24'
  if (source.includes('private property')) return 'privateProperty'
  if (source.includes('whatsapp')) return 'whatsapp'
  if (source.includes('call')) return 'call'
  if (source.includes('website')) return 'website'
  if (source.includes('referral')) return 'referral'
  if (source.includes('walk-in')) return 'walkIn'
  if (source.includes('email')) return 'unknown'
  return 'unknown'
}

function CanvassingSourcePill({ source = '' }) {
  const key = normalizeCanvassingSourceKey(source)
  const style = CANVASSING_SOURCE_PILL_STYLES[key] || CANVASSING_SOURCE_PILL_FALLBACK
  const label = style?.label || resolveCanvassingSourceText(source)
  return <StatusTonePill tone={style?.tone || 'slate'}>{label}</StatusTonePill>
}

function getAgentAvatarUrl(agent = {}) {
  return String(
    agent?.avatarUrl ||
      agent?.avatar_url ||
      agent?.profilePhotoUrl ||
      agent?.profile_photo_url ||
      agent?.photoUrl ||
      agent?.photo_url ||
      '',
  ).trim()
}

function getAgentInitials(agent = {}) {
  const source = String(agent?.name || agent?.fullName || agent?.firstName || agent?.lastName || agent?.email || 'User')
    .trim()
  const parts = source.includes('@') ? source.split('@')[0].split(/[._\s-]+/) : source.split(/\s+/)
  return parts
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U'
}

function getAssignedAgentProfile(prospect = {}, agents = []) {
  const assignedAgentId = normalizeKey(prospect?.assignedAgentId || prospect?.assignedUserId)
  const assignedUserId = normalizeKey(prospect?.assignedUserId)
  const assignedEmail = normalizeKey(prospect?.assignedAgentEmail)

  const assigned = agents.find((agent) => {
    const agentId = normalizeKey(agent?.id || agent?.userId)
    const email = normalizeKey(agent?.email)
    return (
      Boolean(agentId) && (agentId === assignedAgentId || (agentId && (agentId === assignedUserId || assignedUserId === normalizeKey(agent?.userId)))) ||
      Boolean(email) && email === assignedEmail
    )
  })

  if (assigned) {
    const resolvedName = normalizeText(prospect?.assignedAgentName) || normalizeText(assigned?.name) || normalizeText(assigned?.fullName)
    return {
      id: assigned.id || assigned.userId || assignedAgentId || assignedUserId,
      name: resolvedName || normalizeText(assignedEmail || prospect?.assignedAgentEmail) || 'Unassigned',
      email: normalizeText(assigned.email),
      avatarUrl: getAgentAvatarUrl(assigned),
      initials: getAgentInitials(assigned),
      isUnassigned: false,
    }
  }

  const fallbackName = normalizeText(prospect?.assignedAgentName || prospect?.assignedAgentEmail)
  const isUnassigned = !assignedAgentId && !assignedUserId && !assignedEmail
  return {
    id: assignedAgentId || assignedUserId || '',
    name: isUnassigned ? 'Unassigned' : fallbackName || 'Unassigned',
    email: normalizeText(prospect?.assignedAgentEmail),
    avatarUrl: '',
    initials: getAgentInitials({ name: fallbackName }),
    isUnassigned,
  }
}

function ProspectOwnerCell({ agent }) {
  const resolved = agent || { name: 'Unassigned', avatarUrl: '', initials: 'U' }
  const avatarUrl = getAgentAvatarUrl(resolved)
  const initials = resolved.initials || getAgentInitials(resolved)

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e7edf6] text-xs font-semibold text-[#2b4f71]">
        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full rounded-full object-cover" /> : initials}
      </span>
      <span className="truncate text-sm font-semibold text-[#142132]">{resolved.name || 'Unassigned'}</span>
    </span>
  )
}

function getProspectPropertyTypeOptions(value = '') {
  const current = normalizeText(value)
  if (!current || PROSPECT_PROPERTY_TYPES.includes(current)) {
    return PROSPECT_PROPERTY_TYPES
  }
  return [current, ...PROSPECT_PROPERTY_TYPES]
}

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleString('en-ZA')
}

function formatShortDate(value) {
  if (!value) return 'No date set'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'No date set'
  return parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatRelativeActivityTime(value) {
  if (!value) return 'No activity yet'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'No activity yet'
  const diffMs = Date.now() - parsed.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return 'Just now'
  if (diffMs < hour) {
    const minutes = Math.max(1, Math.round(diffMs / minute))
    return `${minutes} min ago`
  }
  if (diffMs < day) {
    const hours = Math.max(1, Math.round(diffMs / hour))
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  const days = Math.max(1, Math.round(diffMs / day))
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return formatShortDate(value)
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatOptionalCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return '—'
  return formatCurrency(amount)
}

function normalizeListingOption(listing = {}) {
  const id = normalizeText(listing?.id || listing?.listingId || listing?.listing_id)
  if (!id) return null
  const title = normalizeText(
    listing?.title ||
      listing?.label ||
      listing?.listingTitle ||
      listing?.listing_title ||
      listing?.propertyTitle ||
      listing?.property_title ||
      listing?.propertyAddress ||
      listing?.property_address ||
      listing?.address,
  )
  const suburb = normalizeText(listing?.suburb || listing?.area || listing?.city)
  const price = Number(listing?.askingPrice || listing?.asking_price || listing?.price || 0) || 0
  const labelParts = [
    title || `Listing ${id.slice(0, 8)}`,
    suburb,
    price ? formatCurrency(price) : '',
  ].filter(Boolean)
  return {
    id,
    branchId: normalizeText(listing?.branchId || listing?.branch_id),
    assignedAgentId: normalizeText(listing?.assignedAgentId || listing?.assigned_agent_id || listing?.agentId || listing?.agent_id),
    assignedAgentEmail: normalizeText(listing?.assignedAgentEmail || listing?.assigned_agent_email).toLowerCase(),
    label: labelParts.join(' - '),
    title: title || labelParts[0] || `Listing ${id.slice(0, 8)}`,
    suburb,
    propertyType: normalizeText(listing?.propertyType || listing?.property_type),
    askingPrice: price,
  }
}

function dedupeListingOptions(rows = []) {
  const map = new Map()
  for (const row of rows) {
    const option = normalizeListingOption(row)
    if (option && !map.has(option.id)) map.set(option.id, option)
  }
  return Array.from(map.values()).sort((left, right) => left.label.localeCompare(right.label))
}

function resolveListingIdFromProspect(prospect = {}) {
  const direct = normalizeText(prospect?.listingId || prospect?.linkedListingId)
  if (direct) return direct
  const notes = normalizeText(prospect?.notes)
  const match = notes.match(/Linked Listing ID:\s*([^|]+)/i)
  return normalizeText(match?.[1])
}

function resolveListingLabelFromProspect(prospect = {}) {
  const direct = normalizeText(prospect?.listingLabel || prospect?.linkedListingLabel)
  if (direct) return direct
  const notes = normalizeText(prospect?.notes)
  const match = notes.match(/Linked Listing:\s*([^|]+)/i)
  return normalizeText(match?.[1])
}

function appendLinkedListingNote(notes = '', listing = null) {
  const base = normalizeText(notes)
  if (!listing?.id) return base
  const filtered = base
    .split('|')
    .map((part) => normalizeText(part))
    .filter((part) => part && !/^Linked Listing/i.test(part))
  return [
    ...filtered,
    `Linked Listing: ${listing.label || listing.title || listing.id}`,
    `Linked Listing ID: ${listing.id}`,
  ].join(' | ')
}

function getProspectDisplayName(prospect = {}) {
  return [prospect?.firstName, prospect?.lastName].map(normalizeText).filter(Boolean).join(' ') || 'Unnamed prospect'
}

function getProspectInitials(prospect = {}) {
  const source = getProspectDisplayName(prospect)
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'P'
}

function getStatusPillClass(status = '') {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized.includes('converted')) return 'border-[#bfe3ca] bg-[#effaf2] text-[#23643c]'
  if (normalized.includes('interested')) return 'border-[#c9ddff] bg-[#f0f6ff] text-[#245b9f]'
  if (normalized.includes('follow')) return 'border-[#f1d49a] bg-[#fff7e8] text-[#8a5a12]'
  if (normalized.includes('not interested') || normalized.includes('lost') || normalized.includes('archived')) {
    return 'border-[#efc8c2] bg-[#fff4f2] text-[#96392e]'
  }
  return 'border-[#dce6f2] bg-[#f7fafd] text-[#39546d]'
}

function splitProspectName(prospect = {}) {
  const firstName = normalizeText(prospect?.firstName)
  const lastName = normalizeText(prospect?.lastName)
  return {
    firstName: firstName || 'Prospect',
    lastName,
  }
}

function resolveLeadCategoryFromProspect(prospectType, fallback = 'buyer') {
  return normalizeLeadCategory(prospectType, normalizeLeadCategory(fallback, 'buyer'))
}

function resolveDefaultLeadCategory(prospect) {
  const type = normalizeText(prospect?.prospectType).toLowerCase()
  if (type.includes('seller')) return 'seller'
  return 'buyer'
}

function resolveProspectAudience(prospect = {}) {
  const type = normalizeText(prospect?.prospectType).toLowerCase()
  if (type.includes('seller') || type.includes('landlord')) return 'seller'
  if (type.includes('buyer') || type.includes('tenant') || type.includes('investor')) return 'buyer'
  return 'buyer'
}

function buildLeadPayloadFromProspect(prospect = {}, leadCategory = 'buyer', currentAgent = {}, leadId = '') {
  const { firstName, lastName } = splitProspectName(prospect)
  const normalizedCategory = resolveLeadCategoryFromProspect(leadCategory, resolveDefaultLeadCategory(prospect))
  const linkedListingId = resolveListingIdFromProspect(prospect)
  const linkedListingLabel = resolveListingLabelFromProspect(prospect)
  const notes = [
    normalizeText(prospect.notes),
    `Canvassing Method: ${normalizeText(prospect.canvassingMethod) || 'Other'}`,
    `Canvassing Prospect ID: ${prospect.id}`,
  ]
    .filter(Boolean)
    .join(' | ')

  return {
    contact: {
      firstName,
      lastName,
      phone: normalizeText(prospect.phone),
      email: normalizeText(prospect.email),
      notes: normalizeText(prospect.notes),
      contactType: normalizedCategory,
    },
    assignedAgent: {
      id: prospect.assignedAgentId || currentAgent.userId || currentAgent.id,
      userId: prospect.assignedUserId || prospect.assignedAgentId || currentAgent.userId || currentAgent.id,
      branchId: prospect.branchId || currentAgent.branchId || '',
      fullName: prospect.assignedAgentName || currentAgent.fullName,
      name: prospect.assignedAgentName || currentAgent.fullName,
      email: prospect.assignedAgentEmail || currentAgent.email,
    },
    branchId: normalizeText(prospect.branchId || currentAgent.branchId),
    assignedUserId: normalizeText(prospect.assignedUserId || prospect.assignedAgentId || currentAgent.userId || currentAgent.id),
    createdBy: normalizeText(prospect.createdBy || currentAgent.userId || currentAgent.id),
    lead: {
      leadId: normalizeText(leadId) || undefined,
    },
    leadCategory: normalizedCategory,
    leadDirection: 'Outbound',
    leadSource: 'Canvassing',
    stage: 'Lead',
    status: 'Lead',
    priority: normalizeText(prospect.followUpPriority) || 'Medium',
    budget: Number(prospect.estimatedValue || 0) || 0,
    estimatedValue: Number(prospect.estimatedValue || 0) || 0,
    areaInterest: normalizeText(prospect.area || linkedListingLabel),
    propertyInterest: normalizeText(linkedListingLabel || prospect.propertyType),
    listingId: linkedListingId,
    sellerPropertyAddress: normalizedCategory === 'seller' ? normalizeText(prospect.area || linkedListingLabel) : '',
    canvassingProspectId: prospect.id,
    sellerName: firstName,
    sellerSurname: lastName,
    sellerEmail: normalizeText(prospect.email).toLowerCase(),
    sellerPhone: normalizeText(prospect.phone),
    notes,
  }
}

function PipelineCanvassingPage() {
  const navigate = useNavigate()
  const { profile, currentWorkspace, role, currentMembership, workspaceRole } = useWorkspace()
  const [organisationId, setOrganisationId] = useState('')
  const [organisationName, setOrganisationName] = useState('Organisation')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [prospects, setProspects] = useState([])
  const [activities, setActivities] = useState([])
  const [agentUsers, setAgentUsers] = useState([])
  const [listingOptions, setListingOptions] = useState([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedProspectId, setSelectedProspectId] = useState('')
  const [detailOpen, setDetailOpen] = useState(false)
  const [prospectView, setProspectView] = useState(() => {
    if (typeof window === 'undefined') return 'seller'
    const stored = normalizeKey(window.sessionStorage.getItem(CANVASSING_PROSPECT_VIEW_STORAGE_KEY))
    return stored === 'buyer' || stored === 'seller' ? stored : 'seller'
  })
  const [filters, setFilters] = useState({
    search: '',
    method: 'all',
    status: 'all',
    assigned: 'all',
    sort: 'newest',
  })
  const [openActionMenuId, setOpenActionMenuId] = useState('')
  const [openActionMenuPosition, setOpenActionMenuPosition] = useState(null)
  const [archiveModal, setArchiveModal] = useState({
    open: false,
    prospectId: '',
    reason: PROSPECT_LOST_REASONS[0],
    notes: '',
  })
  const [deleteModal, setDeleteModal] = useState({
    open: false,
    prospectId: '',
    confirmText: '',
  })
  const [prospectForm, setProspectForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    prospectType: 'Seller Prospect',
    area: '',
    propertyType: '',
    canvassingMethod: 'Cold Call',
    assignedAgentId: '',
    linkedListingId: '',
    status: 'New',
    nextFollowUpDate: '',
    followUpPriority: 'Medium',
    followUpNote: '',
    estimatedValue: '',
    notes: '',
  })
  const [activityForm, setActivityForm] = useState({ activityType: 'Call', activityNote: '', outcome: '' })
  const [convertLeadType, setConvertLeadType] = useState('buyer')

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(CANVASSING_PROSPECT_VIEW_STORAGE_KEY, prospectView)
  }, [prospectView])

  const currentAgent = useMemo(
    () => ({
      id: normalizeText(profile?.id || profile?.userId || profile?.user_id || profile?.email),
      userId: normalizeText(
        profile?.userId ||
          profile?.user_id ||
          currentMembership?.userId ||
          currentMembership?.user_id ||
          currentMembership?.assignedUserId ||
          currentMembership?.assigned_user_id ||
          profile?.id,
      ),
      email: normalizeText(profile?.email).toLowerCase(),
      fullName:
        normalizeText(profile?.fullName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ')) || 'Current Agent',
      branchId: normalizeText(
        profile?.branchId ||
          currentMembership?.branchId ||
          currentMembership?.branch_id ||
          currentMembership?.assignedBranchId ||
          currentMembership?.workspaceUnitId ||
          currentMembership?.workspace_unit_id,
      ),
    }),
    [
      currentMembership?.assignedBranchId,
      currentMembership?.assignedUserId,
      currentMembership?.assigned_user_id,
      currentMembership?.branchId,
      currentMembership?.branch_id,
      currentMembership?.userId,
      currentMembership?.user_id,
      currentMembership?.workspaceUnitId,
      currentMembership?.workspace_unit_id,
      profile?.branchId,
      profile?.email,
      profile?.firstName,
      profile?.fullName,
      profile?.id,
      profile?.lastName,
      profile?.userId,
      profile?.user_id,
    ],
  )

  const currentAgentIdentity = useMemo(
    () => normalizeText(currentAgent.userId || currentAgent.id || currentAgent.email),
    [currentAgent.email, currentAgent.id, currentAgent.userId],
  )

  const currentAgentIdentitySet = useMemo(() => {
    const values = [
      currentAgent.userId,
      currentAgent.id,
      currentAgent.email,
    ]
    return new Set(values.map((value) => normalizeKey(value)).filter(Boolean))
  }, [currentAgent.email, currentAgent.id, currentAgent.userId])

  const currentAgentForWrites = useMemo(
    () => ({
      id: currentAgent.userId || currentAgent.id || null,
      label: currentAgent.userId || currentAgent.id || currentAgent.email || null,
    }),
    [currentAgent.email, currentAgent.id, currentAgent.userId],
  )

  const currentMembershipRole = useMemo(
    () => normalizeOrganisationMembershipRole(
      workspaceRole ||
      currentMembership?.workspaceRole ||
      currentMembership?.role ||
      profile?.workspaceRole ||
      profile?.workspace_role,
    ),
    [currentMembership?.role, currentMembership?.workspaceRole, profile?.workspaceRole, profile?.workspace_role, workspaceRole],
  )

  const isPrincipalAgentView = useMemo(
    () => canAccessPrincipalExperience({
      appRole: role,
      membershipRole: currentMembershipRole,
    }),
    [currentMembershipRole, role],
  )

  const agentOptions = useMemo(() => {
    const normalized = (Array.isArray(agentUsers) ? agentUsers : [])
      .map((row) => {
        const email = normalizeText(row?.email).toLowerCase()
        const id = normalizeText(row?.userId || row?.id || email)
        return {
          id,
          userId: normalizeText(row?.userId || row?.id || id),
          name:
            normalizeText(row?.fullName || [row?.firstName, row?.lastName].filter(Boolean).join(' ')) ||
            email ||
            'Agent',
          email,
          branchId: normalizeText(row?.branchId),
          avatarUrl: normalizeText(row?.avatarUrl),
        }
      })
      .filter((row) => row.id || row.email)

    const hasCurrent = normalized.some(
      (row) => normalizeKey(row.id) === normalizeKey(currentAgent.id) || normalizeKey(row.email) === normalizeKey(currentAgent.email),
    )
    if (!hasCurrent) {
      normalized.push({
        id: currentAgent.id,
        userId: currentAgent.userId,
        name: currentAgent.fullName,
        email: currentAgent.email,
        branchId: currentAgent.branchId,
        avatarUrl: '',
      })
    }

    return normalized
  }, [agentUsers, currentAgent.branchId, currentAgent.email, currentAgent.fullName, currentAgent.id, currentAgent.userId])

  const resolveAgentById = useCallback(
    (id) => {
      const key = normalizeKey(id)
      const found = agentOptions.find(
        (agent) => normalizeKey(agent.id) === key || (key && normalizeKey(agent.email) === key),
      )
      if (found) return found
      return {
        id: currentAgent.id,
        userId: currentAgent.userId,
        name: currentAgent.fullName,
        email: currentAgent.email,
        branchId: currentAgent.branchId,
      }
    },
    [agentOptions, currentAgent.branchId, currentAgent.email, currentAgent.fullName, currentAgent.id, currentAgent.userId],
  )

  const loadData = useCallback(
    async (orgIdParam = '') => {
      const targetOrgId = normalizeText(orgIdParam || organisationId)
      if (!targetOrgId) return
      const store = await listCanvassingWorkspace(targetOrgId)
      setProspects(Array.isArray(store.prospects) ? store.prospects : [])
      setActivities(Array.isArray(store.activities) ? store.activities : [])
    },
    [organisationId],
  )

  useEffect(() => {
    let active = true

    async function loadContext() {
      try {
        setLoading(true)
        setError('')
        let context = null
        try {
          context = await withCanvassingTimeout(
            fetchOrganisationSettings(),
            'Organisation context is taking too long to load.',
          )
        } catch (contextError) {
          if (!isAuthSessionMissingError(contextError) || !normalizeText(currentWorkspace?.id)) {
            console.warn('[CANVASSING] organisation context load failed.', contextError)
          }
        }
        if (!active) return
        const orgId = normalizeText(context?.organisation?.id || currentWorkspace?.id)
        if (!orgId) throw new Error('A resolved workspace is required before loading canvassing data.')
        setOrganisationId(orgId)
        setOrganisationName(
          normalizeText(
            context?.organisation?.displayName ||
              context?.organisation?.name ||
              currentWorkspace?.name ||
              'Organisation',
          ),
        )
        const store = await listCanvassingWorkspace(orgId)
        setProspects(Array.isArray(store.prospects) ? store.prospects : [])
        setActivities(Array.isArray(store.activities) ? store.activities : [])
        try {
          const users = await listOrganisationUsers()
          if (active) setAgentUsers(Array.isArray(users) ? users : [])
        } catch (usersError) {
          console.warn('[CANVASSING] organisation users load failed.', usersError)
          if (active) setAgentUsers([])
        }
        try {
          const localListings = readAgentPrivateListings()
          const branchScopedLocalListings = isPrincipalAgentView
            ? localListings
            : localListings.filter((listing) => {
                const listingAgentId = normalizeText(listing?.assignedAgentId || listing?.assigned_agent_id)
                const listingAgentEmail = normalizeText(listing?.assignedAgentEmail || listing?.assigned_agent_email).toLowerCase()
                return (
                  currentAgentIdentitySet.has(normalizeKey(listingAgentId)) ||
                  (listingAgentEmail && currentAgentIdentitySet.has(normalizeKey(listingAgentEmail)))
                )
              })
          const remoteListings = await getAgentPrivateListings(currentAgentForWrites.id, {
            organisationId: orgId,
            assignedAgentEmail: currentAgent.email,
            includeAllOrganisationListings: isPrincipalAgentView,
          }).catch((listingError) => {
            console.warn('[CANVASSING] organisation listings load failed.', listingError)
            return []
          })
          if (active) {
            setListingOptions(dedupeListingOptions([
              ...(Array.isArray(branchScopedLocalListings) ? branchScopedLocalListings : []),
              ...(Array.isArray(remoteListings) ? remoteListings : []),
            ]))
          }
        } catch (listingError) {
          console.warn('[CANVASSING] listing options unavailable.', listingError)
          if (active) setListingOptions([])
        }
      } catch (contextError) {
        if (!active) return
        setError(contextError?.message || 'Unable to load canvassing workspace.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadContext()
    return () => {
      active = false
    }
  }, [
    currentAgent.email,
    currentAgent.id,
    currentAgent.userId,
    currentAgentForWrites.id,
    currentAgentIdentitySet,
    currentWorkspace?.id,
    currentWorkspace?.name,
    isPrincipalAgentView,
  ])

  const selectedAgentForProspect = useMemo(() => resolveAgentById(prospectForm.assignedAgentId || currentAgentIdentity), [currentAgentIdentity, prospectForm.assignedAgentId, resolveAgentById])

  const scopedListingOptions = useMemo(() => {
    const options = Array.isArray(listingOptions) ? listingOptions : []
    if (isPrincipalAgentView) {
      const branchId = normalizeText(selectedAgentForProspect?.branchId)
      if (!branchId) return options
      return options.filter((listing) => {
        const listingBranchId = normalizeText(listing?.branchId)
        if (!listingBranchId) return true
        return listingBranchId === branchId
      })
    }
    return options
  }, [isPrincipalAgentView, listingOptions, selectedAgentForProspect?.branchId])

  useEffect(() => {
    setProspectForm((previous) => {
      if (normalizeText(previous.assignedAgentId)) return previous
      return {
        ...previous,
        assignedAgentId: currentAgentIdentity,
      }
    })
  }, [currentAgentIdentity])

  const closeActionMenu = useCallback(() => {
    setOpenActionMenuId('')
    setOpenActionMenuPosition(null)
  }, [])

  const toggleActionMenu = useCallback((prospectId, event) => {
    const nextId = normalizeText(prospectId)
    if (!nextId) {
      closeActionMenu()
      return
    }

    const nextButton = event?.currentTarget
    const nextRect = nextButton?.getBoundingClientRect?.()
    const nextPosition = nextRect
      ? {
        top: Math.min(nextRect.bottom + 8, window.innerHeight - 12),
        left: Math.max(12, nextRect.right - CANVASSING_ACTION_MENU_WIDTH),
      }
      : null

    setOpenActionMenuId((previous) => {
      if (previous === nextId) {
        setOpenActionMenuPosition(null)
        return ''
      }
      setOpenActionMenuPosition(nextPosition)
      return nextId
    })
  }, [closeActionMenu])

  useEffect(() => {
    if (!openActionMenuId) return undefined
    function handleWindowClick() {
      closeActionMenu()
    }
    function handleViewportChange() {
      closeActionMenu()
    }
    window.addEventListener('click', handleWindowClick)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    return () => {
      window.removeEventListener('click', handleWindowClick)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [closeActionMenu, openActionMenuId])

  const scopedProspects = useMemo(() => {
    if (isPrincipalAgentView) return Array.isArray(prospects) ? prospects : []
    return prospects.filter((prospect) => {
      const assignedAgentId = normalizeKey(prospect?.assignedAgentId)
      const assignedUserId = normalizeKey(prospect?.assignedUserId)
      const assignedAgentEmail = normalizeKey(prospect?.assignedAgentEmail)
      const createdBy = normalizeKey(prospect?.createdBy)
      return (
        currentAgentIdentitySet.has(assignedAgentId) ||
        currentAgentIdentitySet.has(assignedUserId) ||
        currentAgentIdentitySet.has(assignedAgentEmail) ||
        currentAgentIdentitySet.has(createdBy)
      )
    })
  }, [currentAgentIdentitySet, isPrincipalAgentView, prospects])

  const scopedActivities = useMemo(() => {
    const scopedIds = new Set(scopedProspects.map((prospect) => normalizeText(prospect?.id)))
    return activities.filter((activity) => scopedIds.has(normalizeText(activity?.prospectId)))
  }, [activities, scopedProspects])

  const latestActivityByProspectId = useMemo(() => {
    const map = new Map()
    for (const activity of scopedActivities) {
      const prospectId = normalizeText(activity?.prospectId)
      if (!prospectId) continue
      const current = map.get(prospectId)
      const activityTime = new Date(activity?.activityDate || activity?.createdAt || 0).getTime()
      const currentTime = new Date(current?.activityDate || current?.createdAt || 0).getTime()
      if (!current || activityTime > currentTime) map.set(prospectId, activity)
    }
    return map
  }, [scopedActivities])

  const prospectRows = useMemo(() => scopedProspects.map((prospect) => {
    const assignedProfile = getAssignedAgentProfile(prospect, agentOptions)
    const source = resolveCanvassingSourceText(prospect?.source || prospect?.canvassingMethod || prospect?.leadSource)
    const sourceKey = normalizeCanvassingSourceKey(source)
    const propertyInterest = normalizeText(prospect?.propertyInterest || prospect?.property_interest || prospect?.propertyType || prospect?.listingType)
    const propertyAddress = normalizeText(
      prospect?.propertyAddress || prospect?.sellerPropertyAddress || prospect?.area || prospect?.address || '',
    )
    const nextStep = normalizeText(prospect?.followUpNote || prospect?.nextStep || prospect?.next_step)
    const nextStepDueDate = normalizeText(prospect?.nextFollowUpDate || prospect?.next_step_due_date)

    return {
      ...prospect,
      assignedProfile,
      resolvedSource: source,
      resolvedSourceKey: sourceKey,
      resolvedPropertyInterest: propertyInterest,
      resolvedPropertyAddress: propertyAddress,
      resolvedEstimatedValue: Number(prospect?.estimatedValue || prospect?.estimated_value || 0) || 0,
      resolvedNextStep: nextStep || 'Follow up with prospect',
      resolvedNextStepDueDate: nextStepDueDate,
      assignedLabel: assignedProfile?.name || 'Unassigned',
    }
  }), [agentOptions, scopedProspects])

  const filteredProspects = useMemo(() => {
    const rows = prospectRows.filter((prospect) => {
      const audienceMatch = resolveProspectAudience(prospect) === prospectView
      const searchMatch = filters.search
        ? [
            prospect?.firstName,
            prospect?.lastName,
            prospect?.phone,
            prospect?.email,
            prospect?.area,
            prospect?.resolvedPropertyInterest,
            prospect?.resolvedPropertyAddress,
            prospect?.resolvedSource,
            prospect?.status,
          ]
            .join(' ')
            .toLowerCase()
            .includes(filters.search.toLowerCase())
        : true
      const methodMatch = filters.method === 'all'
        ? true
        : normalizeCanvassingSourceKey(prospect?.resolvedSource) === filters.method
      const prospectStatus = normalizeText(prospect?.status)
      const prospectStatusKey = normalizeKey(prospectStatus)
      const convertedWithoutLead = prospectStatusKey === 'converted to lead' && !normalizeText(prospect?.convertedLeadId)
      const statusMatch = filters.status === 'all'
        ? prospectStatusKey !== 'archived' || convertedWithoutLead
        : prospectStatusKey === normalizeKey(filters.status)
      const assignedMatch = filters.assigned === 'all'
        ? true
        : filters.assigned === 'unassigned'
          ? prospect.assignedProfile?.isUnassigned
          : normalizeText(prospect.assignedProfile?.id) === filters.assigned ||
            normalizeText(prospect.assignedProfile?.email) === filters.assigned
      return audienceMatch && searchMatch && methodMatch && statusMatch && assignedMatch
    })

    return rows.sort((left, right) => {
      if (filters.sort === 'next_follow_up') {
        const leftDate = new Date(left?.nextFollowUpDate || 8640000000000000).getTime()
        const rightDate = new Date(right?.nextFollowUpDate || 8640000000000000).getTime()
        return leftDate - rightDate
      }
      if (filters.sort === 'status') {
        return normalizeText(left?.status).localeCompare(normalizeText(right?.status))
      }
      const leftTime = new Date(left?.createdAt || 0).getTime()
      const rightTime = new Date(right?.createdAt || 0).getTime()
      return rightTime - leftTime
    })
    }, [filters.assigned, filters.method, filters.search, filters.sort, filters.status, prospectView, prospectRows])

  const availableSourceOptions = useMemo(() => {
    const list = Array.from(new Set(prospectRows.map((prospect) => prospect?.resolvedSourceKey || 'unknown')))
    const ordered = CANVASSING_SOURCE_PILL_ORDER.filter((key) => list.includes(key))
    const extras = list.filter((key) => !ordered.includes(key))
    const orderedKeys = [...ordered, ...extras]
    return orderedKeys.map((key) => ({ key, label: CANVASSING_SOURCE_PILL_STYLES[key]?.label || resolveCanvassingSourceText(key) }))
  }, [prospectRows])

  const assignedOptions = useMemo(() => {
    const byKey = new Map()
    for (const prospect of prospectRows) {
      if (prospect.assignedProfile?.isUnassigned) continue
      const id = normalizeKey(prospect.assignedProfile?.id)
      const email = normalizeKey(prospect.assignedProfile?.email)
      const label = normalizeText(prospect.assignedProfile?.name) || 'Agent'
      if (id && !byKey.has(id)) {
        byKey.set(id, { id, email, label })
      }
      if (!id && email && ![...byKey.values()].some((row) => row.email === email)) {
        byKey.set(`email-${email}`, { id: '', email, label })
      }
    }
    const ordered = [...byKey.values()].sort((left, right) => normalizeText(left.label).localeCompare(normalizeText(right.label)))
    return ordered
  }, [prospectRows])

  const prospectById = useMemo(() => {
    const map = new Map()
    for (const prospect of scopedProspects) {
      map.set(normalizeText(prospect?.id), prospect)
    }
    return map
  }, [scopedProspects])

  const selectedProspect = useMemo(() => {
    if (!selectedProspectId) return null
    return prospectById.get(normalizeText(selectedProspectId)) || null
  }, [prospectById, selectedProspectId])

  const selectedProspectActivities = useMemo(() => {
    if (!selectedProspect) return []
    return scopedActivities
      .filter((activity) => normalizeText(activity?.prospectId) === normalizeText(selectedProspect?.id))
      .sort((a, b) => new Date(b?.activityDate || b?.createdAt || 0) - new Date(a?.activityDate || a?.createdAt || 0))
  }, [scopedActivities, selectedProspect])

  const openActionProspect = useMemo(() => {
    if (!openActionMenuId) return null
    return prospectRows.find((prospect) => normalizeText(prospect?.id) === openActionMenuId) || null
  }, [openActionMenuId, prospectRows])

  const openActionProspectMenuItems = openActionProspect
    ? [
      ['Open Prospect', () => handleOpenProspectDetail(openActionProspect)],
      ['Call Prospect', () => handleQuickLogActivity(openActionProspect, 'Call')],
      ['WhatsApp Prospect', () => handleQuickLogActivity(openActionProspect, 'WhatsApp')],
      ['Email Prospect', () => handleQuickLogActivity(openActionProspect, 'Email')],
      ['Convert To Lead', () => handleConvertProspectToLead(openActionProspect)],
      ['Archive', () => openArchiveProspectModal(openActionProspect.id)],
      ['Delete', () => openDeleteProspectModal(openActionProspect.id)],
    ]
    : []

  const metrics = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const followUpsDue = scopedProspects.filter((prospect) => {
      const due = new Date(prospect?.nextFollowUpDate || '')
      if (Number.isNaN(due.getTime())) return false
      due.setHours(0, 0, 0, 0)
      const status = normalizeText(prospect?.status)
      return due.getTime() <= today.getTime() && status !== 'Converted to Lead'
    }).length
    const convertedToLeads = scopedProspects.filter(
      (prospect) => normalizeText(prospect?.status) === 'Converted to Lead' || normalizeText(prospect?.convertedLeadId),
    ).length

    return {
      prospectsAdded: scopedProspects.length,
      activities: scopedActivities.length,
      followUpsDue,
      convertedToLeads,
    }
  }, [scopedActivities, scopedProspects])

  function resetProspectForm() {
    setProspectForm({
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      prospectType: 'Seller Prospect',
      area: '',
      propertyType: '',
      canvassingMethod: 'Cold Call',
      assignedAgentId: currentAgentIdentity,
      linkedListingId: '',
      status: 'New',
      nextFollowUpDate: '',
      followUpPriority: 'Medium',
      followUpNote: '',
      estimatedValue: '',
      notes: '',
    })
  }

  function handleOpenProspectDetail(prospect) {
    const next = prospectById.get(normalizeText(prospect?.id))
    if (!next) return
    setOpenActionMenuId('')
    setSelectedProspectId(next.id)
    setConvertLeadType(resolveDefaultLeadCategory(next))
    setDetailOpen(true)
    setError('')
  }

  async function handleCreateProspect(event) {
    event.preventDefault()
    if (!organisationId) return
    if (!normalizeText(prospectForm.firstName) || (!normalizeText(prospectForm.phone) && !normalizeText(prospectForm.email))) {
      setError('Prospect name and one contact method are required.')
      return
    }
    const assignedAgent = resolveAgentById(prospectForm.assignedAgentId || currentAgentIdentity)
    const selectedListing = scopedListingOptions.find((listing) => normalizeText(listing.id) === normalizeText(prospectForm.linkedListingId)) || null

    const createdPayload = {
      organisationId,
      assignedAgentId: assignedAgent.id || null,
      assignedUserId: assignedAgent.userId || assignedAgent.id || null,
      assignedAgentName: assignedAgent.name || null,
      assignedAgentEmail: assignedAgent.email || null,
      branchId: assignedAgent.branchId || null,
      firstName: normalizeText(prospectForm.firstName),
      lastName: normalizeText(prospectForm.lastName),
      phone: normalizeText(prospectForm.phone),
      email: normalizeText(prospectForm.email).toLowerCase(),
      prospectType: normalizeText(prospectForm.prospectType) || 'Other',
      area: normalizeText(prospectForm.area),
      propertyType: normalizeText(prospectForm.propertyType || selectedListing?.propertyType),
      canvassingMethod: normalizeText(prospectForm.canvassingMethod) || 'Other',
      status: normalizeText(prospectForm.status) || 'New',
      nextFollowUpDate: normalizeText(prospectForm.nextFollowUpDate),
      followUpPriority: normalizeText(prospectForm.followUpPriority) || 'Medium',
      followUpNote: normalizeText(prospectForm.followUpNote),
      estimatedValue: Number(prospectForm.estimatedValue || selectedListing?.askingPrice || 0) || 0,
      notes: appendLinkedListingNote(prospectForm.notes, selectedListing),
      listingId: normalizeText(selectedListing?.id),
      listingLabel: normalizeText(selectedListing?.label),
      convertedLeadId: null,
      createdBy: currentAgentForWrites.id || currentAgentForWrites.label,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    try {
      const created = await createCanvassingProspect(organisationId, createdPayload)
      setProspects((previous) => [created, ...previous.filter((row) => normalizeText(row?.id) !== normalizeText(created?.id))])
      setMessage('Prospect added.')
      setError('')
      setShowCreateModal(false)
      resetProspectForm()
    } catch (createError) {
      setError(createError?.message || 'Unable to add prospect.')
    }
  }

  async function handleSaveProspectDetail(event) {
    event.preventDefault()
    if (!organisationId || !selectedProspect) return

    const payload = {
      ...selectedProspect,
      firstName: normalizeText(selectedProspect.firstName),
      lastName: normalizeText(selectedProspect.lastName),
      phone: normalizeText(selectedProspect.phone),
      email: normalizeText(selectedProspect.email).toLowerCase(),
      prospectType: normalizeText(selectedProspect.prospectType) || 'Other',
      area: normalizeText(selectedProspect.area),
      propertyType: normalizeText(selectedProspect.propertyType),
      canvassingMethod: normalizeText(selectedProspect.canvassingMethod) || 'Other',
      status: normalizeText(selectedProspect.status) || 'New',
      nextFollowUpDate: normalizeText(selectedProspect.nextFollowUpDate),
      followUpPriority: normalizeText(selectedProspect.followUpPriority) || 'Medium',
      followUpNote: normalizeText(selectedProspect.followUpNote),
      estimatedValue: Number(selectedProspect.estimatedValue || 0) || 0,
      notes: normalizeText(selectedProspect.notes),
    }

    try {
      const updated = await updateCanvassingProspect(organisationId, selectedProspect.id, payload)
      setProspects((previous) => previous.map((row) => normalizeText(row?.id) === normalizeText(selectedProspect.id) ? (updated || payload) : row))
      setMessage('Prospect updated.')
      setError('')
    } catch (saveError) {
      setError(saveError?.message || 'Unable to update prospect.')
    }
  }

  function handleUpdateSelectedProspect(field, value) {
    if (field === 'prospectType') {
      setConvertLeadType(resolveDefaultLeadCategory({ ...selectedProspect, prospectType: value }))
    }
    setProspects((previous) =>
      previous.map((row) => {
        if (normalizeText(row?.id) !== normalizeText(selectedProspectId)) return row
        return {
          ...row,
          [field]: value,
        }
      }),
    )
  }

  async function handleLogActivity(event) {
    event.preventDefault()
    if (!organisationId || !selectedProspect) return
    if (!normalizeText(activityForm.activityNote)) {
      setError('Add an activity note before logging.')
      return
    }

    const nextActivityPayload = {
      organisationId,
      prospectId: selectedProspect.id,
      agentId: currentAgentForWrites.id || null,
      agentName: currentAgent.fullName || null,
      activityType: normalizeText(activityForm.activityType) || 'Note',
      activityNote: normalizeText(activityForm.activityNote),
      outcome: normalizeText(activityForm.outcome),
      activityDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: currentAgentForWrites.id || currentAgentForWrites.label,
    }

    try {
      const nextActivity = await createCanvassingActivity(organisationId, nextActivityPayload)
      setActivities((previous) => [nextActivity, ...previous])
      setActivityForm({ activityType: 'Call', activityNote: '', outcome: '' })
      setError('')
      setMessage('Activity logged.')
    } catch (activityError) {
      setError(activityError?.message || 'Unable to log activity.')
    }
  }

  async function handleQuickLogActivity(prospect, type) {
    if (!organisationId || !prospect) return
    const nextActivityPayload = {
      organisationId,
      prospectId: prospect.id,
      agentId: currentAgentForWrites.id || null,
      agentName: currentAgent.fullName || null,
      activityType: type,
      activityNote: `${type} action logged`,
      outcome: '',
      activityDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: currentAgentForWrites.id || currentAgentForWrites.label,
    }

    try {
      const nextActivity = await createCanvassingActivity(organisationId, nextActivityPayload)
      setActivities((previous) => [nextActivity, ...previous])
      setMessage(`${type} logged.`)
      setError('')
    } catch (activityError) {
      setError(activityError?.message || `Unable to log ${type.toLowerCase()}.`)
    }
  }

  function openArchiveProspectModal(prospectId) {
    setArchiveModal({
      open: true,
      prospectId: normalizeText(prospectId),
      reason: PROSPECT_LOST_REASONS[0],
      notes: '',
    })
  }

  function openDeleteProspectModal(prospectId) {
    setDeleteModal({
      open: true,
      prospectId: normalizeText(prospectId),
      confirmText: '',
    })
  }

  async function handleArchiveProspect() {
    if (!organisationId) return
    const prospectId = normalizeText(archiveModal.prospectId)
    if (!prospectId) return
    const reason = normalizeText(archiveModal.reason) || PROSPECT_LOST_REASONS[0]
    const notes = normalizeText(archiveModal.notes)
    const existing = prospectById.get(prospectId) || null

    const updatedProspect = {
      ...existing,
      status: 'Lost',
      lostReason: reason,
      archivedAt: new Date().toISOString(),
      notes: [normalizeText(existing?.notes), `Archive reason: ${reason}`, notes].filter(Boolean).join(' | '),
    }
    const archiveActivity = {
        organisationId,
        prospectId,
        agentId: currentAgentForWrites.id || null,
        agentName: currentAgent.fullName || null,
        activityType: 'Follow-Up',
        activityNote: `prospect_archived:${reason}`,
        outcome: notes || reason,
        activityDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: currentAgentForWrites.id || currentAgentForWrites.label,
      }
    try {
      const saved = await updateCanvassingProspect(organisationId, prospectId, updatedProspect)
      const activity = await createCanvassingActivity(organisationId, archiveActivity)
      setProspects((previous) => previous.map((row) => normalizeText(row?.id) === prospectId ? (saved || updatedProspect) : row))
      setActivities((previous) => [activity, ...previous])
      setArchiveModal((previous) => ({ ...previous, open: false }))
      setDetailOpen(false)
      setError('')
      setMessage(`${[existing?.firstName, existing?.lastName].filter(Boolean).join(' ') || 'Prospect'} archived with history preserved.`)
    } catch (archiveError) {
      setError(archiveError?.message || 'Unable to archive prospect.')
    }
  }

  async function handleDeleteProspect() {
    if (!organisationId) return
    const prospectId = normalizeText(deleteModal.prospectId)
    if (!prospectId) return
    if (normalizeText(deleteModal.confirmText).toUpperCase() !== 'DELETE') {
      setError('Type DELETE to permanently delete this canvassing prospect.')
      return
    }

    try {
      await deleteCanvassingProspect(organisationId, prospectId)
      setProspects((previous) => previous.filter((row) => normalizeText(row?.id) !== prospectId))
      setActivities((previous) => previous.filter((row) => normalizeText(row?.prospectId) !== prospectId))
      if (normalizeText(selectedProspectId) === prospectId) {
        setSelectedProspectId('')
        setDetailOpen(false)
      }
      setDeleteModal({ open: false, prospectId: '', confirmText: '' })
      setError('')
      setMessage('Canvassing prospect deleted permanently.')
    } catch (deleteError) {
      setError(deleteError?.message || 'Unable to delete prospect.')
    }
  }

  async function handleConvertProspectToLead(prospectOverride = null) {
    const overrideLooksLikeProspect = Boolean(
      prospectOverride &&
        typeof prospectOverride === 'object' &&
        !('preventDefault' in prospectOverride) &&
        (normalizeText(prospectOverride?.id) || normalizeText(prospectOverride?.firstName) || normalizeText(prospectOverride?.email)),
    )
    const targetProspect = overrideLooksLikeProspect ? prospectOverride : selectedProspect
    const targetProspectId = normalizeText(targetProspect?.id)
    if (!organisationId || !targetProspect) return
    if (!targetProspectId) {
      setError('Unable to convert this prospect because its record id is missing. Reopen the prospect and try again.')
      return
    }
    setOpenActionMenuId('')
    const existingConvertedLeadId = normalizeText(targetProspect?.convertedLeadId)
    try {
      const leadCategory = resolveLeadCategoryFromProspect(
        overrideLooksLikeProspect ? resolveDefaultLeadCategory(targetProspect) : convertLeadType,
        resolveDefaultLeadCategory(targetProspect),
      )
      const createdLead = await createAgencyCrmLeadRecord(
        organisationId,
        buildLeadPayloadFromProspect(targetProspect, leadCategory, currentAgent, existingConvertedLeadId),
        {
          actor: {
            id: currentAgentForWrites.id,
            name: currentAgent.fullName,
            email: currentAgent.email,
          },
        },
      )
      const targetLeadId = normalizeText(createdLead?.leadId || existingConvertedLeadId)
      if (!targetLeadId) {
        throw new Error('The lead could not be created. The prospect has not been moved.')
      }
      await createAgencyCrmLeadActivity(organisationId, targetLeadId, {
          agent: { id: currentAgentForWrites.id || currentAgent.id, name: currentAgent.fullName, email: currentAgent.email },
          activityType: 'Lead Created',
          activityNote: existingConvertedLeadId ? 'canvassing_lead_relinked' : 'canvassing_prospect_converted',
          outcome: existingConvertedLeadId ? 'Converted prospect lead repaired' : 'Converted from canvassing prospect',
          activityDate: new Date().toISOString(),
      }, { actor: { id: currentAgentForWrites.id, name: currentAgent.fullName, email: currentAgent.email } })

      const convertedProspect = {
        ...targetProspect,
        status: 'Converted to Lead',
        convertedLeadId: targetLeadId,
        convertedAt: new Date().toISOString(),
      }
      const savedProspect = await updateCanvassingProspect(organisationId, targetProspectId, convertedProspect)
      const conversionActivity = await createCanvassingActivity(organisationId, {
        organisationId,
        prospectId: targetProspectId,
        agentId: currentAgentForWrites.id || null,
        agentName: currentAgent.fullName || null,
        activityType: 'Note',
        activityNote: existingConvertedLeadId
          ? `${leadCategoryLabel(leadCategory)} lead link repaired from converted prospect`
          : `Prospect converted to ${leadCategoryLabel(leadCategory)} lead`,
        outcome: targetLeadId,
        activityDate: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: currentAgentForWrites.id || currentAgentForWrites.label,
      })
      setProspects((previous) => previous.map((row) => normalizeText(row?.id) === targetProspectId ? (savedProspect || convertedProspect) : row))
      setActivities((previous) => [conversionActivity, ...previous])
      setMessage(existingConvertedLeadId ? 'Converted prospect lead restored.' : 'Prospect converted to lead.')
      setError('')
      await loadData(organisationId)
      navigate(`/pipeline/leads/${targetLeadId}`)
    } catch (convertError) {
      setError(convertError?.message || 'Unable to convert prospect to lead.')
    }
  }

  if (loading) {
    return (
      <section className="rounded-[20px] border border-[#dde4ee] bg-white p-6">
        <p className="text-sm text-[#61758f]">Loading canvassing workspace...</p>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.72rem] uppercase tracking-[0.11em] text-slate-500">{organisationName}</p>
            <h2 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.02em] text-slate-900">Canvassing</h2>
            <p className="mt-1 text-sm text-slate-600">Track prospecting activity and convert interested prospects into leads.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setProspectView('buyer')}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  prospectView === 'buyer'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-white hover:text-blue-700'
                }`}
              >
                Buyer Prospects
              </button>
              <button
                type="button"
                onClick={() => setProspectView('seller')}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  prospectView === 'seller'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-white hover:text-blue-700'
                }`}
              >
                Seller Prospects
              </button>
            </div>
          </div>
        </div>
      </header>

      {error ? <div className="rounded-[18px] border border-[#f6d4d4] bg-[#fff4f4] px-4 py-3 text-sm text-[#9f1d1d]">{error}</div> : null}
      {message ? <div className="rounded-[18px] border border-[#d4e8dc] bg-[#eef9f1] px-4 py-3 text-sm text-[#1a6e3a]">{message}</div> : null}

      <section className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Prospects', value: metrics.prospectsAdded },
          { label: 'Activities', value: metrics.activities },
          { label: 'Follow Ups', value: metrics.followUpsDue },
          { label: 'Converted', value: metrics.convertedToLeads },
        ].map((metric) => (
          <article key={metric.label} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <span className="text-xs font-semibold uppercase tracking-[0.09em] text-slate-500">{metric.label}</span>
            <strong className="mt-1 block text-3xl font-semibold text-slate-900">{metric.value}</strong>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-2">
            <Field
              className="h-11 flex-1"
              placeholder="Search prospects..."
              value={filters.search}
              onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))}
            />
            <div className="grid min-h-11 w-full grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-1 lg:flex lg:items-end lg:justify-end lg:gap-2">
              <Field
                as="select"
                className="h-11 lg:w-44"
                value={filters.method}
                onChange={(event) => setFilters((previous) => ({ ...previous, method: event.target.value }))}
              >
                <option value="all">Method / Source</option>
                {availableSourceOptions.map((method) => (
                  <option key={method.key} value={method.key}>
                    {method.label}
                  </option>
                ))}
              </Field>
              <Field
                as="select"
                className="h-11 lg:w-44"
                value={filters.status}
                onChange={(event) => setFilters((previous) => ({ ...previous, status: event.target.value }))}
              >
                <option value="all">Status / Stage</option>
                {PROSPECT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </Field>
              <Field
                as="select"
                className="h-11 lg:w-44"
                value={filters.assigned}
                onChange={(event) => setFilters((previous) => ({ ...previous, assigned: event.target.value }))}
              >
                <option value="all">Assigned</option>
                <option value="unassigned">Unassigned</option>
                {assignedOptions.map((agent) => (
                  <option key={`${agent.id || agent.email}`} value={agent.id || agent.email}>
                    {agent.label}
                  </option>
                ))}
              </Field>
              <Field
                as="select"
                className="h-11 lg:w-44"
                value={filters.sort}
                onChange={(event) => setFilters((previous) => ({ ...previous, sort: event.target.value }))}
              >
                <option value="newest">Sort: Newest</option>
                <option value="next_follow_up">Sort: Follow Up</option>
                <option value="status">Sort: Status</option>
              </Field>
              <div className="lg:ml-auto">
                <Button
                  type="button"
                  className="h-11 min-h-11 w-full justify-center whitespace-nowrap rounded-xl lg:w-auto"
                  onClick={() => setShowCreateModal(true)}
                >
                  <Plus size={14} />
                  + Prospect
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="w-[22%] px-4 py-3">Prospect</th>
                <th className="w-[14%] px-4 py-3">Source</th>
                <th className="w-[22%] px-4 py-3">{prospectView === 'seller' ? 'Property Address' : 'Property Interest'}</th>
                <th className="w-[22%] px-4 py-3">Stage / Next Step</th>
                <th className="w-[16%] px-4 py-3">Assigned</th>
                <th className="w-[12%] px-4 py-3">Last Activity</th>
                <th className="w-[7%] px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredProspects.length ? (
                filteredProspects.map((prospect) => {
                  const lastActivity = latestActivityByProspectId.get(normalizeText(prospect?.id))
                  const displayName = getProspectDisplayName(prospect)
                  const prospectTypeLabel =
                    resolveProspectAudience(prospect) === 'seller' ? 'Seller Prospect' : 'Buyer Prospect'
                  const addressLine = prospect?.resolvedPropertyAddress || '—'
                  const addressLine2 = normalizeText(prospect.area) && normalizeText(prospect.area) !== normalizeText(addressLine)
                    ? normalizeText(prospect.area)
                    : ''
                  const interestLine = normalizeText(prospect?.resolvedPropertyInterest) || 'No property interest'
                  const stage = normalizeText(prospect?.status) || 'New'
                  const nextStepLabel = prospect?.resolvedNextStep || 'Follow up with prospect'
                  const nextStepDueLabel = prospect?.resolvedNextStepDueDate
                    ? `Due: ${formatShortDate(prospect.resolvedNextStepDueDate)}`
                    : 'Due date not set'
                  const estimatedValueLabel = formatOptionalCurrency(
                    prospect.resolvedEstimatedValue,
                  )
                  const actionMenuOpen = openActionMenuId === normalizeText(prospect.id)

                  return (
                    <tr
                      key={prospect.id}
                      className="h-[104px] cursor-pointer text-slate-700 transition hover:bg-slate-50"
                      onClick={() => handleOpenProspectDetail(prospect)}
                    >
                      <td className="px-4 py-3 align-top">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                            {getProspectInitials(prospect)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[0.95rem] font-semibold text-slate-900">{displayName}</p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">{prospectTypeLabel}</p>
                            <p className="mt-0.5 truncate text-xs text-slate-500">{addressLine}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <CanvassingSourcePill source={prospect?.resolvedSource || prospect?.source || prospect?.canvassingMethod} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="truncate font-medium text-slate-700">
                          {prospectView === 'seller'
                            ? (addressLine || 'Address Pending')
                            : interestLine}
                        </p>
                        {prospectView === 'seller' ? null : <p className="mt-0.5 text-xs text-slate-500">{addressLine}</p>}
                        {addressLine2 ? <p className="mt-0.5 text-xs text-slate-500">{addressLine2}</p> : null}
                        <p className="mt-1 text-sm font-semibold text-slate-900">{estimatedValueLabel}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusPillClass(stage)}`}>
                          {stage}
                        </span>
                        <p className="mt-2 line-clamp-1 font-medium text-slate-700">{nextStepLabel}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{nextStepDueLabel}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <ProspectOwnerCell agent={prospect.assignedProfile} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="truncate font-medium text-slate-700">
                          {formatRelativeActivityTime(lastActivity?.activityDate || lastActivity?.createdAt)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{lastActivity?.activityType || '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        <div className="relative inline-flex" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleActionMenu(prospect.id, event)
                            }}
                          >
                            Open
                            <ChevronDown size={13} />
                          </button>
                          {actionMenuOpen ? <span className="sr-only">Action menu open</span> : null}
                        </div>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td className="px-4 py-8 text-sm text-slate-500" colSpan={7}>
                    {prospectView === 'seller'
                      ? 'No seller prospects yet. Add seller canvassing prospects to track valuation and mandate potential.'
                      : 'No buyer prospects yet. Add buyer canvassing prospects to track criteria and conversion readiness.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-slate-100 p-3 md:hidden">
          {filteredProspects.length ? (
            filteredProspects.map((prospect) => {
              const lastActivity = latestActivityByProspectId.get(normalizeText(prospect?.id))
              const displayName = getProspectDisplayName(prospect)
              const prospectTypeLabel =
                resolveProspectAudience(prospect) === 'seller' ? 'Seller Prospect' : 'Buyer Prospect'
              const addressLine = prospect?.resolvedPropertyAddress || 'Address Pending'
              const addressLine2 = normalizeText(prospect.area) && normalizeText(prospect.area) !== normalizeText(addressLine)
                ? normalizeText(prospect.area)
                : ''
              const interestLine = normalizeText(prospect?.resolvedPropertyInterest) || 'No property interest'
              const stage = normalizeText(prospect?.status) || 'New'
              const nextStepLabel = prospect?.resolvedNextStep || 'Follow up with prospect'
              const nextStepDueLabel = prospect?.resolvedNextStepDueDate
                ? `Due: ${formatShortDate(prospect.resolvedNextStepDueDate)}`
                : 'Due date not set'
              const estimatedValueLabel = formatOptionalCurrency(prospect.resolvedEstimatedValue)
              const actionMenuOpen = openActionMenuId === normalizeText(prospect.id)

              return (
                <div
                  key={prospect.id}
                  className="cursor-pointer px-4 py-3 transition hover:bg-slate-50"
                  onClick={() => handleOpenProspectDetail(prospect)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{displayName}</p>
                      <p className="mt-1 text-xs text-slate-500">{prospectTypeLabel}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{addressLine}</p>
                      {addressLine2 ? <p className="text-xs text-slate-500">{addressLine2}</p> : null}
                      {prospectView === 'buyer' ? <p className="text-xs text-slate-500">{interestLine}</p> : null}
                      <p className="mt-1 text-sm font-semibold text-slate-900">{estimatedValueLabel}</p>
                    </div>
                    <div className="relative shrink-0" onClick={(event) => event.stopPropagation()}>
                      <button
                        type="button"
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleActionMenu(prospect.id, event)
                        }}
                      >
                        Open
                        <ChevronDown size={13} />
                      </button>
                      {actionMenuOpen ? <span className="sr-only">Action menu open</span> : null}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-slate-500">
                    <CanvassingSourcePill source={prospect?.resolvedSource || prospect?.source || prospect?.canvassingMethod} />
                    <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusPillClass(stage)}`}>{stage}</span>
                    <p>{nextStepLabel}</p>
                    <p>{nextStepDueLabel}</p>
                    <p>
                      <span className="font-semibold text-slate-700">Assigned: </span>
                      <ProspectOwnerCell agent={prospect.assignedProfile} />
                    </p>
                    <p>
                      {formatRelativeActivityTime(lastActivity?.activityDate || lastActivity?.createdAt)}
                      <span className="text-slate-500">{lastActivity?.activityType ? ` • ${lastActivity.activityType}` : ' • —'}</span>
                    </p>
                  </div>
                </div>
              )
            })
          ) : (
            <p className="px-4 py-8 text-sm text-slate-500">
              {prospectView === 'seller'
                ? 'No seller prospects yet. Add seller canvassing prospects to track valuation and mandate potential.'
                : 'No buyer prospects yet. Add buyer canvassing prospects to track criteria and conversion readiness.'}
            </p>
          )}
        </div>
      </section>

      {openActionProspect && openActionMenuPosition && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="fixed inset-0 z-40"
            onClick={closeActionMenu}
          >
            <div
              className="absolute w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-left shadow-[0_18px_38px_rgba(15,23,42,0.14)]"
              style={{
                top: `${openActionMenuPosition.top}px`,
                left: `${openActionMenuPosition.left}px`,
                width: `${CANVASSING_ACTION_MENU_WIDTH}px`,
              }}
              onClick={(event) => event.stopPropagation()}
              role="menu"
              aria-label="Prospect actions"
            >
              {openActionProspectMenuItems.map(([label, action]) => (
                <button
                  key={label}
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-xs font-semibold transition hover:bg-slate-50 ${
                    label === 'Delete' ? 'text-rose-700' : 'text-slate-700'
                  }`}
                  onClick={() => {
                    closeActionMenu()
                    action()
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )
        : null}

      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          resetProspectForm()
        }}
        title="Add Canvassing Prospect"
        subtitle="Capture outbound prospecting contacts and set follow-up actions."
        className="max-w-3xl"
      >
        <form className="grid gap-4" onSubmit={handleCreateProspect}>
          <div className="rounded-[14px] border border-[#dbe4ee] bg-[#f8fbff] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Prospect Type</p>
            <div className="mt-2 inline-flex items-center rounded-full border border-[#dbe4ee] bg-white p-1">
              <button
                type="button"
                onClick={() => setProspectForm((previous) => ({ ...previous, prospectType: 'Buyer Prospect' }))}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  resolveProspectAudience({ prospectType: prospectForm.prospectType }) === 'buyer'
                    ? 'bg-[#1f4f78] text-white'
                    : 'text-[#51667f] hover:text-[#1f4f78]'
                }`}
              >
                Buyer Prospect
              </button>
              <button
                type="button"
                onClick={() => setProspectForm((previous) => ({ ...previous, prospectType: 'Seller Prospect', linkedListingId: '' }))}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  resolveProspectAudience({ prospectType: prospectForm.prospectType }) === 'seller'
                    ? 'bg-[#1f4f78] text-white'
                    : 'text-[#51667f] hover:text-[#1f4f78]'
                }`}
              >
                Seller Prospect
              </button>
            </div>
          </div>

          <div className="rounded-[14px] border border-[#dbe4ee] bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Contact Details</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Field
                placeholder="First name"
                value={prospectForm.firstName}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, firstName: event.target.value }))}
              />
              <Field
                placeholder="Last name"
                value={prospectForm.lastName}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, lastName: event.target.value }))}
              />
              <Field
                placeholder="Phone"
                value={prospectForm.phone}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, phone: event.target.value }))}
              />
              <Field
                placeholder="Email"
                value={prospectForm.email}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, email: event.target.value }))}
              />
            </div>
          </div>

          <div className="rounded-[14px] border border-[#dbe4ee] bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Prospecting Context</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">
                Agent
                <Field
                  as="select"
                  value={prospectForm.assignedAgentId}
                  onChange={(event) => setProspectForm((previous) => ({ ...previous, assignedAgentId: event.target.value }))}
                >
                  {agentOptions.map((agent) => (
                    <option key={agent.id || agent.email} value={agent.id || agent.email}>
                      {agent.name}{agent.email ? ` (${agent.email})` : ''}
                    </option>
                  ))}
                </Field>
              </label>
              {resolveProspectAudience({ prospectType: prospectForm.prospectType }) === 'buyer' ? (
                <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">
                  Listing / Property
                    <Field
                      as="select"
                      value={prospectForm.linkedListingId}
                      onChange={(event) => {
                        const selectedListing = scopedListingOptions.find((listing) => normalizeText(listing.id) === normalizeText(event.target.value))
                        setProspectForm((previous) => ({
                          ...previous,
                          linkedListingId: event.target.value,
                        area: normalizeText(previous.area) || normalizeText(selectedListing?.suburb),
                        propertyType: normalizeText(previous.propertyType) || normalizeText(selectedListing?.propertyType),
                        estimatedValue: normalizeText(previous.estimatedValue) || (selectedListing?.askingPrice ? String(selectedListing.askingPrice) : ''),
                      }))
                    }}
                  >
                    <option value="">Select listing/property</option>
                    {scopedListingOptions.map((listing) => (
                      <option key={listing.id} value={listing.id}>
                        {listing.label}
                      </option>
                    ))}
                  </Field>
                </label>
              ) : null}
              <Field
                as="select"
                value={prospectForm.canvassingMethod}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, canvassingMethod: event.target.value }))}
              >
                {CANVASSING_METHODS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Field>
              <Field
                as="select"
                value={prospectForm.propertyType}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, propertyType: event.target.value }))}
              >
                <option value="">
                  {resolveProspectAudience({ prospectType: prospectForm.prospectType }) === 'seller'
                    ? 'Select property type (optional)'
                    : 'Select preferred property type (optional)'}
                </option>
                {getProspectPropertyTypeOptions(prospectForm.propertyType).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Field>
              <Field
                placeholder={resolveProspectAudience({ prospectType: prospectForm.prospectType }) === 'seller' ? 'Property area / suburb' : 'Area of interest'}
                value={prospectForm.area}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, area: event.target.value }))}
              />
              <Field
                placeholder={resolveProspectAudience({ prospectType: prospectForm.prospectType }) === 'seller' ? 'Estimated property value' : 'Budget'}
                value={prospectForm.estimatedValue}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, estimatedValue: event.target.value }))}
              />
            </div>
          </div>

          <div className="rounded-[14px] border border-[#dbe4ee] bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">Follow-Up Plan</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Field
                type="date"
                value={prospectForm.nextFollowUpDate}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, nextFollowUpDate: event.target.value }))}
              />
              <Field
                as="select"
                value={prospectForm.followUpPriority}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, followUpPriority: event.target.value }))}
              >
                {['Low', 'Medium', 'High', 'Urgent'].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Field>
              <Field
                as="select"
                value={prospectForm.status}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, status: event.target.value }))}
              >
                {PROSPECT_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Field>
              <Field
                as="textarea"
                rows={2}
                placeholder="Follow-up note"
                value={prospectForm.followUpNote}
                onChange={(event) => setProspectForm((previous) => ({ ...previous, followUpNote: event.target.value }))}
              />
            </div>
            <Field
              as="textarea"
              className="mt-4"
              rows={3}
              placeholder="Notes"
              value={prospectForm.notes}
              onChange={(event) => setProspectForm((previous) => ({ ...previous, notes: event.target.value }))}
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Prospect</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={archiveModal.open}
        onClose={() => setArchiveModal((previous) => ({ ...previous, open: false }))}
        title="Archive Prospect"
        subtitle="Move this prospect to Lost while preserving canvassing history."
        className="max-w-lg"
      >
        <div className="grid gap-3">
          <Field
            as="select"
            value={archiveModal.reason}
            onChange={(event) => setArchiveModal((previous) => ({ ...previous, reason: event.target.value }))}
          >
            {PROSPECT_LOST_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </Field>
          <Field
            as="textarea"
            rows={3}
            placeholder="Optional notes"
            value={archiveModal.notes}
            onChange={(event) => setArchiveModal((previous) => ({ ...previous, notes: event.target.value }))}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setArchiveModal((previous) => ({ ...previous, open: false }))}>
              Cancel
            </Button>
            <Button type="button" onClick={handleArchiveProspect}>
              Archive Prospect
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteModal.open}
        onClose={() => setDeleteModal({ open: false, prospectId: '', confirmText: '' })}
        title="Delete Prospect"
        subtitle="Permanently remove this canvassing prospect. Archive instead if you want to preserve the history."
        className="max-w-lg"
      >
        <div className="grid gap-3">
          <div className="rounded-[14px] border border-[#f1d0ca] bg-[#fff7f5] px-4 py-3 text-sm text-[#8d3529]">
            This cannot be undone. Canvassing activity for this prospect will be removed. Any lead already created from this prospect is not deleted.
          </div>
          <Field
            placeholder="Type DELETE to confirm"
            value={deleteModal.confirmText}
            onChange={(event) => setDeleteModal((previous) => ({ ...previous, confirmText: event.target.value }))}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDeleteModal({ open: false, prospectId: '', confirmText: '' })}>
              Cancel
            </Button>
            <Button type="button" onClick={handleDeleteProspect} disabled={normalizeText(deleteModal.confirmText).toUpperCase() !== 'DELETE'}>
              Delete Prospect
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title="Prospect Detail"
        subtitle="Review outbound activity and convert this prospect to a lead when qualified."
        className="max-w-6xl overflow-hidden"
      >
        {selectedProspect ? (
          <div className="-m-5 bg-[#f5f8fb] p-4 sm:-m-6 sm:p-6">
            <div className="overflow-hidden rounded-[24px] border border-[#dce6f2] bg-white shadow-[0_24px_60px_rgba(15,35,55,0.12)]">
              <div className="bg-[#122236] px-4 py-5 text-white sm:px-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-white/[0.15] bg-white/10 text-lg font-semibold shadow-inner">
                      {getProspectInitials(selectedProspect)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-2xl font-semibold tracking-[-0.02em] text-white">
                          {getProspectDisplayName(selectedProspect)}
                        </h3>
                        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusPillClass(selectedProspect.status)}`}>
                          {selectedProspect.status || 'New'}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-sm text-[#c9d5e3]">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1">
                          <UserRound size={14} />
                          {selectedProspect.prospectType || 'Prospect'}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1">
                          <MapPin size={14} />
                          {selectedProspect.area || 'Area pending'}
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1">
                          <WalletCards size={14} />
                          {formatCurrency(selectedProspect.estimatedValue)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:min-w-[420px]">
                    <div className="rounded-[16px] border border-white/10 bg-white/[0.08] px-3 py-2">
                      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-[#9fb0c4]">Method</p>
                      <p className="mt-1 font-semibold text-white">{selectedProspect.canvassingMethod || 'Other'}</p>
                    </div>
                    <div className="rounded-[16px] border border-white/10 bg-white/[0.08] px-3 py-2">
                      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-[#9fb0c4]">Priority</p>
                      <p className="mt-1 font-semibold text-white">{selectedProspect.followUpPriority || 'Medium'}</p>
                    </div>
                    <div className="col-span-2 rounded-[16px] border border-white/10 bg-white/[0.08] px-3 py-2 sm:col-span-1">
                      <p className="text-[0.68rem] uppercase tracking-[0.12em] text-[#9fb0c4]">Next follow-up</p>
                      <p className="mt-1 font-semibold text-white">
                        {selectedProspect.nextFollowUpDate || 'Not scheduled'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_390px]">
                <form className="space-y-5 p-4 sm:p-6" onSubmit={handleSaveProspectDetail}>
                  <section className="rounded-[18px] border border-[#dfe8f3] bg-white p-4 shadow-[0_12px_30px_rgba(15,35,55,0.04)]">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#8293aa]">Prospect profile</p>
                        <h4 className="mt-1 text-base font-semibold text-[#17263a]">Contact and qualification details</h4>
                      </div>
                      <span className="rounded-full border border-[#dce6f2] bg-[#f7fafd] px-3 py-1 text-xs font-semibold text-[#456176]">
                        {selectedProspect.convertedLeadId ? 'Lead linked' : 'Not converted'}
                      </span>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        First name
                        <Field value={selectedProspect.firstName || ''} onChange={(event) => handleUpdateSelectedProspect('firstName', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Last name
                        <Field value={selectedProspect.lastName || ''} onChange={(event) => handleUpdateSelectedProspect('lastName', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Phone
                        <Field value={selectedProspect.phone || ''} onChange={(event) => handleUpdateSelectedProspect('phone', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Email
                        <Field value={selectedProspect.email || ''} onChange={(event) => handleUpdateSelectedProspect('email', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Prospect type
                        <Field
                          as="select"
                          value={selectedProspect.prospectType || 'Other'}
                          onChange={(event) => handleUpdateSelectedProspect('prospectType', event.target.value)}
                        >
                          {PROSPECT_TYPES.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Field>
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Canvassing method
                        <Field
                          as="select"
                          value={selectedProspect.canvassingMethod || 'Other'}
                          onChange={(event) => handleUpdateSelectedProspect('canvassingMethod', event.target.value)}
                        >
                          {CANVASSING_METHODS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Field>
                      </label>
                    </div>
                  </section>

                  <section className="rounded-[18px] border border-[#dfe8f3] bg-white p-4 shadow-[0_12px_30px_rgba(15,35,55,0.04)]">
                    <div className="mb-4">
                      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#8293aa]">Property opportunity</p>
                      <h4 className="mt-1 text-base font-semibold text-[#17263a]">Area, value and follow-up context</h4>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Area or address
                        <Field value={selectedProspect.area || ''} onChange={(event) => handleUpdateSelectedProspect('area', event.target.value)} />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Property type
                        <Field
                          as="select"
                          value={selectedProspect.propertyType || ''}
                          onChange={(event) => handleUpdateSelectedProspect('propertyType', event.target.value)}
                        >
                          <option value="">Select property type (optional)</option>
                          {getProspectPropertyTypeOptions(selectedProspect.propertyType).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Field>
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Next follow-up date
                        <Field
                          type="date"
                          value={selectedProspect.nextFollowUpDate || ''}
                          onChange={(event) => handleUpdateSelectedProspect('nextFollowUpDate', event.target.value)}
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Follow-up priority
                        <Field
                          as="select"
                          value={selectedProspect.followUpPriority || 'Medium'}
                          onChange={(event) => handleUpdateSelectedProspect('followUpPriority', event.target.value)}
                        >
                          {['Low', 'Medium', 'High', 'Urgent'].map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Field>
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Prospect status
                        <Field
                          as="select"
                          value={selectedProspect.status || 'New'}
                          onChange={(event) => handleUpdateSelectedProspect('status', event.target.value)}
                        >
                          {PROSPECT_STATUSES.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Field>
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Estimated value
                        <Field
                          value={selectedProspect.estimatedValue || ''}
                          onChange={(event) => handleUpdateSelectedProspect('estimatedValue', event.target.value)}
                        />
                      </label>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Follow-up note
                        <Field
                          as="textarea"
                          rows={3}
                          className="min-h-[96px]"
                          value={selectedProspect.followUpNote || ''}
                          onChange={(event) => handleUpdateSelectedProspect('followUpNote', event.target.value)}
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold text-[#29435d]">
                        Internal notes
                        <Field
                          as="textarea"
                          rows={3}
                          className="min-h-[96px]"
                          value={selectedProspect.notes || ''}
                          onChange={(event) => handleUpdateSelectedProspect('notes', event.target.value)}
                        />
                      </label>
                    </div>
                  </section>

                  <section className="rounded-[18px] border border-[#dfe8f3] bg-[#f8fbff] p-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-[14px] border border-[#dfe8f3] bg-white px-3 py-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#8293aa]">Estimated value</p>
                        <p className="mt-1 text-lg font-semibold text-[#17263a]">{formatCurrency(selectedProspect.estimatedValue)}</p>
                      </div>
                      <div className="rounded-[14px] border border-[#dfe8f3] bg-white px-3 py-3">
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#8293aa]">Lead status</p>
                        <p className="mt-1 truncate text-sm font-semibold text-[#17263a]">
                          {selectedProspect.convertedLeadId || 'Not converted yet'}
                        </p>
                      </div>
                      <Button type="submit" className="h-full min-h-[56px] w-full">
                        Save Prospect
                      </Button>
                    </div>
                  </section>
                </form>

                <aside className="border-t border-[#dfe8f3] bg-[#f8fbff] p-4 sm:p-6 xl:border-l xl:border-t-0">
                  <div className="space-y-4 xl:sticky xl:top-0">
                    <section className="rounded-[18px] border border-[#dfe8f3] bg-white p-4 shadow-[0_12px_30px_rgba(15,35,55,0.04)]">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#eaf2fb] text-[#214c6e]">
                          <CheckCircle2 size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#17263a]">Qualification</p>
                          <p className="text-xs text-[#6d839b]">Move this prospect into the lead pipeline.</p>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2">
                        <Field as="select" value={convertLeadType} onChange={(event) => setConvertLeadType(event.target.value)}>
                          {['buyer', 'seller'].map((option) => (
                            <option key={option} value={option}>
                              {leadCategoryLabel(option)} Lead
                            </option>
                          ))}
                        </Field>
                        <Button type="button" onClick={() => handleConvertProspectToLead()} className="w-full">
                          <UserPlus size={16} />
                          Convert to Lead
                        </Button>
                      </div>
                    </section>

                    <section className="rounded-[18px] border border-[#dfe8f3] bg-white p-4 shadow-[0_12px_30px_rgba(15,35,55,0.04)]">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#eef5ff] text-[#245b9f]">
                          <ClipboardList size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-[#17263a]">Log activity</p>
                          <p className="text-xs text-[#6d839b]">Capture the latest call, note or follow-up.</p>
                        </div>
                      </div>
                      <form className="mt-4 grid gap-2.5" onSubmit={handleLogActivity}>
                        <Field
                          as="select"
                          value={activityForm.activityType}
                          onChange={(event) => setActivityForm((previous) => ({ ...previous, activityType: event.target.value }))}
                        >
                          {ACTIVITY_TYPES.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Field>
                        <Field
                          placeholder="Activity note"
                          value={activityForm.activityNote}
                          onChange={(event) => setActivityForm((previous) => ({ ...previous, activityNote: event.target.value }))}
                        />
                        <Field
                          placeholder="Outcome"
                          value={activityForm.outcome}
                          onChange={(event) => setActivityForm((previous) => ({ ...previous, outcome: event.target.value }))}
                        />
                        <Button type="submit" className="w-full">Log Activity</Button>
                      </form>
                    </section>

                    <section className="rounded-[18px] border border-[#dfe8f3] bg-white p-4 shadow-[0_12px_30px_rgba(15,35,55,0.04)]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[#17263a]">Activity timeline</p>
                          <p className="text-xs text-[#6d839b]">{selectedProspectActivities.length} logged touchpoints</p>
                        </div>
                        <Clock3 size={18} className="text-[#7c91aa]" />
                      </div>
                      <div className="mt-4 max-h-72 space-y-3 overflow-auto pr-1">
                        {selectedProspectActivities.length ? (
                          selectedProspectActivities.map((activity) => (
                            <article key={activity.id} className="relative rounded-[14px] border border-[#e2eaf4] bg-[#fbfdff] px-3 py-3 text-xs">
                              <div className="flex items-start justify-between gap-3">
                                <p className="font-semibold text-[#29435d]">{activity.activityType}</p>
                                <span className="rounded-full bg-white px-2 py-0.5 text-[0.68rem] font-semibold text-[#7a8ea5]">
                                  {formatDate(activity.activityDate || activity.createdAt)}
                                </span>
                              </div>
                              <p className="mt-2 text-[#587089]">{activity.activityNote || 'No note'}</p>
                              {activity.outcome ? <p className="mt-1 text-[#7a8ea5]">Outcome: {activity.outcome}</p> : null}
                            </article>
                          ))
                        ) : (
                          <div className="rounded-[14px] border border-dashed border-[#d8e3f0] bg-[#fbfdff] px-3 py-5 text-center">
                            <CalendarDays size={22} className="mx-auto text-[#8fa2b7]" />
                            <p className="mt-2 text-sm font-semibold text-[#344b63]">No activity yet</p>
                            <p className="mt-1 text-xs text-[#6d839b]">Log the first touchpoint to build a clear canvassing history.</p>
                          </div>
                        )}
                      </div>
                    </section>

                    <section className="rounded-[18px] border border-[#dfe8f3] bg-white p-4 shadow-[0_12px_30px_rgba(15,35,55,0.04)]">
                      <p className="text-sm font-semibold text-[#17263a]">Quick actions</p>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1">
                        <button
                          type="button"
                          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2 text-sm font-semibold text-[#35546c] transition hover:-translate-y-0.5 hover:border-[#b8c9dc] hover:bg-[#f8fbff]"
                          onClick={() => handleQuickLogActivity(selectedProspect, 'Call')}
                        >
                          <Phone size={15} />
                          Call
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2 text-sm font-semibold text-[#35546c] transition hover:-translate-y-0.5 hover:border-[#b8c9dc] hover:bg-[#f8fbff]"
                          onClick={() => handleQuickLogActivity(selectedProspect, 'WhatsApp')}
                        >
                          <MessageCircle size={15} />
                          WhatsApp
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[12px] border border-[#dce6f2] bg-white px-3 py-2 text-sm font-semibold text-[#35546c] transition hover:-translate-y-0.5 hover:border-[#b8c9dc] hover:bg-[#f8fbff]"
                          onClick={() => handleQuickLogActivity(selectedProspect, 'Email')}
                        >
                          <Mail size={15} />
                          Email
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                        <button
                          type="button"
                          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[12px] border border-[#ead5d2] bg-[#fffaf8] px-3 py-2 text-sm font-semibold text-[#8a3a33] transition hover:-translate-y-0.5"
                          onClick={() => openArchiveProspectModal(selectedProspect.id)}
                        >
                          <Archive size={15} />
                          Archive Prospect
                        </button>
                        <button
                          type="button"
                          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[12px] border border-[#efc7c0] bg-[#fff3f1] px-3 py-2 text-sm font-semibold text-[#a13225] transition hover:-translate-y-0.5"
                          onClick={() => openDeleteProspectModal(selectedProspect.id)}
                        >
                          <Trash2 size={15} />
                          Delete Prospect
                        </button>
                      </div>
                    </section>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#6d839b]">Select a prospect row to open details.</p>
        )}
      </Modal>
    </section>
  )
}

export default PipelineCanvassingPage
