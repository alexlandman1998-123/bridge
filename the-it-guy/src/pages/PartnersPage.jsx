import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ChevronRight,
  Globe2,
  Landmark,
  LockKeyhole,
  Network,
  ShieldCheck,
  Search,
  Sparkles,
  X,
  UserPlus as InviteIcon,
  Users,
} from 'lucide-react'
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useOrganisation } from '../context/OrganisationContext'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  acceptPartnerInvitation,
  canConnectPartnerTypes,
  createPartnerInvitation,
  declinePartnerInvitation,
  filterPartnerRelationshipsByScope,
  filterDiscoverablePartners,
  getAllowedPartnerScopes,
  getPartnerScopeBadge,
  getPartnerTypeLabel,
  PARTNER_PROVINCES,
  PARTNER_SCOPE_LABELS,
  PARTNER_SCOPE_TYPES,
  PARTNER_TYPES,
  fetchPartnersSnapshot,
  fetchDiscoverablePartnerDirectory,
} from '../lib/partnersRepository'
import {
  getPartnerRoutingRulesForUser,
  upsertPartnerRoutingRule,
} from '../lib/settingsApi'
import { recordWorkspaceAuditEvent } from '../services/auditLogService'
import { fetchPartnerOperationalPeople, getBondPartnerListings } from '../services/bondPartnerProfileService'
import { PARTNER_ROUTING_MODES, PARTNER_ROUTING_ROLE_TYPES, PARTNER_ROUTING_TARGET_TYPES } from '../constants/bondRoutingContract'
import OrganisationAvatar from '../components/organisation/OrganisationAvatar'

const TABS = [
  { key: 'connected', label: 'Organisation Connections' },
  { key: 'preferred', label: 'Operational Partners' },
  { key: 'invitations', label: 'Invitations' },
  { key: 'discover', label: 'Discover Organisations' },
]

const INVITATION_DIRECTION_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
]

const INVITATION_STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
]

function formatNumber(value) {
  return new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 }).format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function isBridgeInternalToken(value = '') {
  const normalized = normalizeLower(value)
  return normalized.includes('@bridge.internal') || normalized.startsWith('organisation-')
}

function normalizeInvitationName(value, fallback) {
  const candidate = normalizeText(value)
  if (candidate && !isBridgeInternalToken(candidate)) return candidate
  const fallbackCandidate = normalizeText(fallback)
  return fallbackCandidate && !isBridgeInternalToken(fallbackCandidate) ? fallbackCandidate : 'Unknown organisation'
}

function statusBadgeClass(status) {
  const normalized = normalizeLower(status)
  if (normalized === 'accepted') return 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]'
  if (normalized === 'declined' || normalized === 'rejected') return 'border-[#f8d7da] bg-[#fff5f6] text-[#8d2831]'
  if (normalized === 'cancelled') return 'border-[#f0dfb8] bg-[#fff9ec] text-[#8a5a12]'
  return 'border-[#f0dfb8] bg-[#fff9ec] text-[#8a5a12]'
}

function relationshipBadgeClass(type) {
  if (type === 'preferred') return 'border-[#d9e7ff] bg-[#f3f7ff] text-[#1e4d82]'
  if (type === 'internal') return 'border-[#eadffc] bg-[#f8f4ff] text-[#5b3c8f]'
  return 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]'
}

function scopeBadgeClass(scopeType = '') {
  if (scopeType === 'user') return 'border-[#eadffc] bg-[#f8f4ff] text-[#5b3c8f]'
  if (scopeType === 'team') return 'border-[#dbeafe] bg-[#f3f7ff] text-[#1e4d82]'
  if (scopeType === 'branch') return 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]'
  if (scopeType === 'region') return 'border-[#f0dfb8] bg-[#fff9ec] text-[#8a5a12]'
  return 'border-[#e4ebf4] bg-[#f8fafc] text-[#52677f]'
}

function StatusBadge({ children, className = '' }) {
  return (
    <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${className}`}>
      {children}
    </span>
  )
}

function PartnerScopeBadge({ relationship }) {
  if (!relationship) return null
  const badge = getPartnerScopeBadge(relationship)
  return <StatusBadge className={scopeBadgeClass(badge.scopeType)}>Scope: {badge.label}</StatusBadge>
}

function MetricCard({ label, value, subtext }) {
  return (
    <div className="rounded-[8px] border border-[#dde7f2] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">{label}</p>
      <strong className="mt-2 block text-2xl font-semibold tracking-[-0.02em] text-[#10243a]">{value}</strong>
      {subtext ? <p className="mt-1 text-sm leading-5 text-[#60758d]">{subtext}</p> : null}
    </div>
  )
}

function PartnerLogo({ partner, size = 'md' }) {
  return <OrganisationAvatar organisation={partner} size={size} />
}

function isUuidLike(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim())
}

function getPartnerProfileKind(value = '') {
  const normalized = normalizeLower(value)
  if (normalized === 'bond_originator') return 'bond_originator'
  if (normalized === 'attorney_firm') return 'attorney'
  if (normalized === 'agency' || normalized === 'agency_network') return 'agency'
  return 'general'
}

function getPartnerProfileContent(partner = {}) {
  const settings = partner?.settingsJson && typeof partner.settingsJson === 'object'
    ? partner.settingsJson
    : partner?.settings_json && typeof partner.settings_json === 'object'
      ? partner.settings_json
      : {}
  const profileContent = settings.partnerProfileContent && typeof settings.partnerProfileContent === 'object'
    ? settings.partnerProfileContent
    : settings.partner_profile_content && typeof settings.partner_profile_content === 'object'
      ? settings.partner_profile_content
      : {}
  const kind = getPartnerProfileKind(partner?.type)
  const roleContent =
    profileContent[kind] ||
    profileContent[partner?.type] ||
    profileContent.agency ||
    profileContent.general ||
    {}

  return {
    aboutCompany: normalizeText(roleContent.aboutCompany || roleContent.about_company),
    serviceDelivery: normalizeText(roleContent.serviceDelivery || roleContent.service_delivery),
  }
}

function collectPartnerActiveAreas(partner = {}) {
  const items = [
    ...(Array.isArray(partner?.activeAreas) ? partner.activeAreas : []),
    ...(Array.isArray(partner?.specialties) ? partner.specialties : []),
  ]
  return [...new Set(items.map((item) => normalizeText(item)).filter(Boolean))]
}

function collectVisibleBranchNames(people = []) {
  return [...new Set((Array.isArray(people) ? people : []).map((person) => normalizeText(person.branchName)).filter(Boolean))]
}

function inferOperationalRoleLabel(person = {}) {
  const candidates = [person.title, person.role, person.organisationRole, person.department]
  return candidates.map(normalizeText).find(Boolean) || 'Operational user'
}

function getOperationalPeopleSectionTitle(partnerType = '') {
  const kind = getPartnerProfileKind(partnerType)
  if (kind === 'bond_originator') return 'Visible consultants'
  if (kind === 'attorney') return 'Visible legal staff'
  if (kind === 'agency') return 'Visible agents'
  return 'Operational people'
}

function getRoutingRoleLabel(roleType = '') {
  const normalized = normalizeText(roleType)
  if (normalized === PARTNER_ROUTING_ROLE_TYPES.bondOriginator) return 'Preferred bond consultant'
  if (normalized === PARTNER_ROUTING_ROLE_TYPES.transferAttorney) return 'Preferred transfer attorney'
  if (normalized === PARTNER_ROUTING_ROLE_TYPES.bondAttorney) return 'Preferred bond attorney'
  if (normalized === PARTNER_ROUTING_ROLE_TYPES.cancellationAttorney) return 'Preferred cancellation attorney'
  if (normalized === PARTNER_ROUTING_ROLE_TYPES.agent) return 'Preferred agent'
  return 'Preferred partner'
}

function getRoutingRolePlaceholder(roleType = '') {
  const normalized = normalizeText(roleType)
  if (normalized === PARTNER_ROUTING_ROLE_TYPES.bondOriginator) return 'Select consultant'
  if (
    normalized === PARTNER_ROUTING_ROLE_TYPES.transferAttorney ||
    normalized === PARTNER_ROUTING_ROLE_TYPES.bondAttorney ||
    normalized === PARTNER_ROUTING_ROLE_TYPES.cancellationAttorney
  ) {
    return 'Select attorney/paralegal'
  }
  if (normalized === PARTNER_ROUTING_ROLE_TYPES.agent) return 'Select agent'
  return 'Select person'
}

function getRoutingAssignmentModeForRole(roleType = '') {
  const normalized = normalizeText(roleType)
  if (
    normalized === PARTNER_ROUTING_ROLE_TYPES.transferAttorney ||
    normalized === PARTNER_ROUTING_ROLE_TYPES.bondAttorney ||
    normalized === PARTNER_ROUTING_ROLE_TYPES.cancellationAttorney
  ) {
    return PARTNER_ROUTING_MODES.directAttorney
  }
  if (normalized === PARTNER_ROUTING_ROLE_TYPES.agent) {
    return PARTNER_ROUTING_MODES.directAgent
  }
  return PARTNER_ROUTING_MODES.directConsultant
}

function getOperationalRoutingControlsForPartnerType(partnerType = '') {
  const kind = getPartnerProfileKind(partnerType)
  if (kind === 'bond_originator') {
    return [{ roleType: PARTNER_ROUTING_ROLE_TYPES.bondOriginator }]
  }
  if (kind === 'attorney') {
    return [
      { roleType: PARTNER_ROUTING_ROLE_TYPES.transferAttorney },
      { roleType: PARTNER_ROUTING_ROLE_TYPES.bondAttorney },
      { roleType: PARTNER_ROUTING_ROLE_TYPES.cancellationAttorney },
    ]
  }
  return []
}

function createPartnerRoleKey(partnerOrganisationId = '', roleType = '') {
  return `${normalizeText(partnerOrganisationId)}::${normalizeText(roleType)}`
}

function getAttorneyCapabilityBadges(partner = {}) {
  const tokens = collectPartnerActiveAreas(partner).map(normalizeLower)
  const capabilities = []
  if (tokens.some((item) => item.includes('transfer'))) capabilities.push('Transfer')
  if (tokens.some((item) => item.includes('bond'))) capabilities.push('Bond')
  if (tokens.some((item) => item.includes('cancel'))) capabilities.push('Cancellation')
  return capabilities
}

function buildPartnerOverviewCopy(partner = {}) {
  const customCopy = getPartnerProfileContent(partner)
  if (customCopy.aboutCompany) return customCopy.aboutCompany

  const kind = getPartnerProfileKind(partner?.type)
  const location = [partner?.city, partner?.province].filter(Boolean).join(', ') || 'selected markets'
  if (kind === 'bond_originator') {
    return `Bond origination organisation operating in ${location}, available through this partner relationship for finance collaboration.`
  }
  if (kind === 'attorney') {
    return `Attorney firm operating in ${location}, visible through this relationship for transfer, bond, and registration work where permissions allow.`
  }
  if (kind === 'agency') {
    return `Agency organisation operating in ${location}, available for transaction collaboration and agent-level coordination through this relationship.`
  }
  return `Verified Arch9 organisation operating in ${location}, available through this partner connection for operational collaboration.`
}

function buildPartnerServiceDeliveryCopy(partner = {}) {
  const customCopy = getPartnerProfileContent(partner)
  if (customCopy.serviceDelivery) return customCopy.serviceDelivery

  const tags = [...new Set([...(Array.isArray(partner?.specialties) ? partner.specialties : []), ...(Array.isArray(partner?.activeAreas) ? partner.activeAreas : [])])]
    .map((item) => normalizeText(item))
    .filter(Boolean)
  if (tags.length) {
    return `Service delivery currently spans ${tags.join(' · ')}.`
  }
  return 'Service delivery has not been published yet.'
}

function formatDaysOrHours(value = '') {
  const hours = Number(value || 0)
  if (!Number.isFinite(hours) || hours <= 0) return 'Not published'
  if (hours < 24) return `${Math.max(1, Math.round(hours))}h`
  return `${(hours / 24).toFixed(hours % 24 === 0 ? 0 : 1)}d`
}

function getProfileMetricValue(metric = {}) {
  if (metric.value === null || metric.value === undefined || metric.value === '') return '—'
  return metric.value
}

const ProfileBand = forwardRef(function ProfileBand({ children, className = '' }, ref) {
  return (
    <section
      ref={ref}
      className={`rounded-[18px] border border-[#dbe6f1] bg-white shadow-[0_18px_44px_rgba(15,23,42,0.06)] sm:rounded-[24px] lg:rounded-[28px] xl:rounded-[30px] ${className}`}
    >
      {children}
    </section>
  )
})

function ProfileSectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-col gap-3 border-b border-[#e8eff6] px-5 py-5 sm:px-6 lg:px-8 lg:py-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[0.74rem] font-semibold uppercase tracking-[0.18em] text-[#7a8ba3]">{eyebrow}</p>
        {action ? <span className="text-xs text-[#8b9bb0]">{action}</span> : null}
      </div>
      <div className="max-w-3xl">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#10243a] sm:text-2xl">{title}</h2>
        {description ? <p className="mt-2 text-sm leading-6 text-[#60758d]">{description}</p> : null}
      </div>
    </div>
  )
}

function ProfileTag({ children, muted = false, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
        muted ? 'border-[#e5edf6] bg-[#f8fafc] text-[#52677f]' : 'border-[#d8eefe] bg-[#f4f9ff] text-[#1e4d82]'
      } ${className}`}
    >
      {children}
    </span>
  )
}

function HeroStat({ label, value, subtext, icon }) {
  const Icon = icon || BadgeCheck
  return (
    <div className="rounded-[18px] border border-[#e4ebf4] bg-white/85 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.05)] backdrop-blur sm:rounded-[22px] sm:p-5 lg:rounded-[24px] lg:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">{label}</p>
          <strong className="mt-3 block text-2xl font-semibold tracking-[-0.02em] text-[#10243a]">{value}</strong>
          {subtext ? <p className="mt-2 text-sm leading-5 text-[#60758d]">{subtext}</p> : null}
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#f3f7fb] text-[#2f5573]">
          <Icon size={20} />
        </span>
      </div>
    </div>
  )
}

function PremiumEmptyState({ title, description, icon }) {
  const Icon = icon || Sparkles
  return (
    <div className="rounded-[18px] border border-dashed border-[#d7e2ee] bg-[#fbfdff] p-5 text-center sm:rounded-[22px] sm:p-7 lg:rounded-[24px] lg:p-8">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[18px] bg-white text-[#7a8ba3] shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
        <Icon size={24} />
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-[-0.02em] text-[#10243a]">{title}</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#60758d]">{description}</p>
    </div>
  )
}

function VisiblePersonCard({ person = {}, preferred = false, selected = false, onClick }) {
  const displayName = normalizeText(person.label || person.fullName || person.name || person.email) || 'Partner user'
  const roleLabel = normalizeText(person.title || person.role || person.organisationRole || person.department) || 'Operational user'
  const locationBits = [person.branchName, person.regionName, person.teamName].map(normalizeText).filter(Boolean)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full rounded-[18px] border p-4 text-left shadow-[0_12px_26px_rgba(15,23,42,0.05)] transition sm:rounded-[20px] lg:rounded-[22px] ${
        selected ? 'border-[#a9c6e4] bg-[#f7fbff] shadow-[0_16px_32px_rgba(31,79,120,0.12)]' : 'border-[#e4ebf4] bg-white hover:border-[#cddbeb] hover:bg-[#fbfdff]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[#f3f7fb] text-sm font-bold text-[#2f5573]">
          {displayName
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join('') || 'P'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold tracking-[-0.01em] text-[#10243a]">{displayName}</p>
              <p className="mt-1 text-sm text-[#60758d]">{roleLabel}</p>
            </div>
            {preferred ? <ProfileTag>Preferred</ProfileTag> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {locationBits.length ? <ProfileTag muted>{locationBits.join(' · ')}</ProfileTag> : null}
            {person.phone ? <ProfileTag muted>{person.phone}</ProfileTag> : null}
            {person.email ? <ProfileTag muted>{person.email}</ProfileTag> : null}
          </div>
        </div>
      </div>
    </button>
  )
}

function ListingCard({ listing = {} }) {
  const priceLabel = Number(listing.price || 0) > 0
    ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(listing.price || 0))
    : 'Price not published'
  const location = [listing.suburb, listing.city].map(normalizeText).filter(Boolean).join(', ') || 'Location not published'

  return (
    <article className="min-w-[260px] max-w-[260px] snap-start rounded-[22px] border border-[#e4ebf4] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-semibold tracking-[-0.01em] text-[#10243a]">{normalizeText(listing.title) || 'Shared listing'}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">{normalizeText(listing.propertyType) || 'Property'}</p>
        </div>
        <div className="space-y-1 text-sm text-[#60758d]">
          <p className="font-semibold text-[#10243a]">{priceLabel}</p>
          <p>{location}</p>
          {listing.branchName ? <p>{listing.branchName}</p> : null}
          {listing.agentName ? <p>{listing.agentName}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <ProfileTag muted>{normalizeText(listing.status) || 'Active'}</ProfileTag>
          {listing.bedrooms ? <ProfileTag muted>{`${listing.bedrooms} bed`}</ProfileTag> : null}
          {listing.bathrooms ? <ProfileTag muted>{`${listing.bathrooms} bath`}</ProfileTag> : null}
        </div>
      </div>
    </article>
  )
}

function RoutingPreferenceField({
  roleType,
  selectedPartnerId,
  partnerPeople = [],
  currentRule = null,
  selectionValue = '',
  saving = false,
  onChange,
}) {
  const currentValue = normalizeText(selectionValue || currentRule?.targetConsultantUserId || currentRule?.targetUserId || currentRule?.target_user_id)
  const visibleCurrent = partnerPeople.some((person) => normalizeText(person.userId || person.id) === currentValue)
  const hiddenCurrentLabel = normalizeText(currentRule?.targetScopeName || currentRule?.target_scope_name)

  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-[#10243a]">{getRoutingRoleLabel(roleType)}</span>
      <select
        value={currentValue}
        disabled={!selectedPartnerId || saving}
        onChange={(event) => onChange?.(roleType, event.target.value)}
        className="h-11 rounded-[14px] border border-[#d7e2ee] bg-white px-3 text-sm outline-none transition focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10 disabled:cursor-not-allowed disabled:bg-[#f4f7fa]"
      >
        <option value="">{getRoutingRolePlaceholder(roleType)}</option>
        {!visibleCurrent && currentValue && hiddenCurrentLabel ? <option value={currentValue}>{hiddenCurrentLabel} (currently saved)</option> : null}
        {partnerPeople.map((person) => (
          <option key={`${roleType}-${person.userId || person.id}`} value={normalizeText(person.userId || person.id)}>
            {[person.label || person.fullName || person.name || 'Partner user', inferOperationalRoleLabel(person), person.branchName].filter(Boolean).join(' · ')}
          </option>
        ))}
      </select>
      <p className="text-xs leading-5 text-[#60758d]">
        {saving ? 'Saving preference...' : currentValue ? 'Saved per user for this partner organisation.' : 'No user-level preference selected yet.'}
      </p>
    </label>
  )
}

function PartnerOrganisationProfilePage({
  organisation,
  workspace,
  selectedPartner,
  selectedRelationship,
  partnerAboutCompany = '',
  partnerServiceDelivery = '',
  partnerPeople = [],
  partnerPeopleMessage = '',
  partnerPeopleLoading = false,
  routingRulesByRole = {},
  routingSelectionValues = {},
  routingSavingRoleKeys = new Set(),
  onSelectRoutingPreference,
  selectedVisiblePerson = null,
  selectedVisiblePersonListings = [],
  selectedPartnerListingsMeta = null,
  shouldShowCurrentListings = false,
  onSelectVisiblePerson,
  snapshot = null,
  message = '',
  error = '',
  loading = false,
  onBack,
}) {
  const overviewRef = useRef(null)
  const prefsRef = useRef(null)
  const updatesRef = useRef(null)
  const connectedRef = useRef(null)

  const typeLabel = getPartnerTypeLabel(selectedPartner?.type)
  const partnerName = selectedPartner?.name || 'Partner organisation'
  const partnerProvince = normalizeText(selectedPartner?.province)
  const partnerCity = normalizeText(selectedPartner?.city)
  const scopeLabel = selectedRelationship ? getPartnerScopeBadge(selectedRelationship).label : 'No connection scope available'
  const connectedSince = formatDate(selectedRelationship?.acceptedAt || selectedRelationship?.createdAt)
  const activeAreas = collectPartnerActiveAreas(selectedPartner)
  const visibleBranches = collectVisibleBranchNames(partnerPeople)
  const visibleConsultants = Array.isArray(partnerPeople) ? partnerPeople : []
  const routingControls = getOperationalRoutingControlsForPartnerType(selectedPartner?.type)
  const partnerProfileContent = getPartnerProfileContent(selectedPartner)
  const selectedPartnerAboutCompany = partnerAboutCompany || partnerProfileContent.aboutCompany || buildPartnerOverviewCopy(selectedPartner)
  const selectedPartnerServiceDelivery = partnerServiceDelivery || partnerProfileContent.serviceDelivery || buildPartnerServiceDeliveryCopy(selectedPartner)
  const transactionStats = selectedPartner?.transactionStats || {}
  const bridgeMetrics = useMemo(
    () => [
      {
        label: 'Visible Consultants',
        value: visibleConsultants.length ? formatNumber(visibleConsultants.length) : '0',
        subtext: visibleConsultants.length ? 'Published through relationship visibility' : 'No consultants published yet',
        icon: Users,
      },
      {
        label: 'Active Branches',
        value: visibleBranches.length ? formatNumber(visibleBranches.length) : '0',
        subtext: visibleBranches.length ? 'Branches currently visible in Arch9' : 'No branch visibility published yet',
        icon: Building2,
      },
      {
        label: 'Collaborations',
        value: Number.isFinite(Number(transactionStats.activeTransactions)) ? formatNumber(transactionStats.activeTransactions) : '—',
        subtext: Number.isFinite(Number(transactionStats.activeTransactions))
          ? 'Shared work visible through the partner relationship'
          : 'No collaboration volume published',
        icon: Network,
      },
      {
        label: 'Average Response Time',
        value: Number.isFinite(Number(transactionStats.responseTimeHours)) ? formatDaysOrHours(transactionStats.responseTimeHours) : '—',
        subtext: Number.isFinite(Number(transactionStats.responseTimeHours))
          ? 'Typical responsiveness across visible work'
          : 'No response metric published',
        icon: ShieldCheck,
      },
    ],
    [transactionStats.activeTransactions, transactionStats.responseTimeHours, visibleBranches.length, visibleConsultants.length],
  )

  const serviceTags = activeAreas.length ? activeAreas : selectedPartner?.specialties || []
  const relatedOrganisations = useMemo(() => {
    const items = Array.isArray(snapshot?.relationships) ? snapshot.relationships : []
    return items
      .filter((relationship) => normalizeText(relationship.partner?.id || relationship.counterpartOrganisationId || relationship.partnerOrganisationId) !== normalizeText(selectedPartner?.id))
      .filter((relationship) => relationship.relationshipStatus === 'accepted')
      .slice(0, 5)
      .map((relationship) => ({
        id: relationship.id,
        partner: relationship.partner,
        label: relationship.partner?.name || 'Connected partner',
        type: getPartnerTypeLabel(relationship.partner?.type),
        scope: getPartnerScopeBadge(relationship).label,
      }))
  }, [selectedPartner?.id, snapshot?.relationships])

  const connectedHasData = relatedOrganisations.length > 0

  if (loading) {
    return (
      <div className="min-h-full bg-[#f5f8fc] px-4 py-6 text-[#10243a] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1440px]">
          <div className="rounded-[28px] border border-[#dbe6f1] bg-white p-8 text-sm font-semibold text-[#60758d] shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
            Loading partner profile...
          </div>
        </div>
      </div>
    )
  }

  if (!selectedPartner) {
    return (
      <div className="min-h-full bg-[#f5f8fc] px-4 py-6 text-[#10243a] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1440px]">
          <ProfileBand className="p-8">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#7a8ba3]">Partners</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#10243a]">Partner profile not available</h1>
              <p className="mt-3 text-sm leading-6 text-[#60758d]">This partner relationship could not be found or is not visible in the current workspace.</p>
              <div className="mt-6">
                <Link
                  to="/partners"
                  className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#d7e2ee] bg-white px-4 text-sm font-semibold text-[#27445f] shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition hover:bg-[#f8fafc]"
                >
                  <ArrowUpRight size={16} className="rotate-[-135deg]" />
                  Back to Partners
                </Link>
              </div>
            </div>
          </ProfileBand>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f6f8fb_0%,#f8fbfe_100%)] px-4 py-4 text-[#10243a] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => onBack?.()}
              className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#d7e2ee] bg-white px-4 text-sm font-semibold text-[#27445f] shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition hover:bg-[#f8fafc]"
            >
              <ArrowUpRight size={16} className="rotate-[-135deg]" />
              Back to Partners
            </button>
            <nav className="hidden min-w-0 items-center gap-2 text-sm text-[#7a8ba3] md:flex" aria-label="Breadcrumb">
              <Link to="/partners" className="font-semibold text-[#4f647a] hover:text-[#10243a]">Partners</Link>
              <ChevronRight size={14} />
              <span className="truncate font-semibold text-[#10243a]">{partnerName}</span>
            </nav>
          </div>
        </header>

        {error || message || snapshot?.source === 'demo' ? (
          <div className="space-y-3">
            {snapshot?.source === 'demo' ? (
              <p className="rounded-[18px] border border-[#f0dfb8] bg-[#fff9ec] px-4 py-3 text-sm font-semibold text-[#8a5a12]">
                Demo partner data is shown until the partners migration is available in this environment.
              </p>
            ) : null}
            {error ? <p className="rounded-[18px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-semibold text-[#b42318]">{error}</p> : null}
            {message ? <p className="rounded-[18px] border border-[#cfe8dc] bg-[#f1fbf6] px-4 py-3 text-sm font-semibold text-[#17613d]">{message}</p> : null}
          </div>
        ) : null}

        <ProfileBand className="overflow-hidden">
          <div className="relative overflow-hidden px-6 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
            <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#eef4fb] via-[#f8fbff] to-transparent" />
            <div className="relative flex flex-col gap-8">
              <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex min-w-0 gap-4 sm:gap-5">
                  <span className="pt-1">
                    <OrganisationAvatar organisation={selectedPartner} size="lg" className="h-16 w-16 rounded-[18px] text-base sm:h-20 sm:w-20 sm:rounded-[22px]" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7a8ba3]">
                      <Link to="/partners" className="hover:text-[#10243a]">Partners</Link>
                      <ChevronRight size={13} />
                      <span className="truncate">{partnerName}</span>
                    </div>
                    <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-[#10243a] sm:text-5xl">{partnerName}</h1>
                    <p className="mt-3 text-lg text-[#4f647a] sm:text-xl">{typeLabel}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <ProfileTag>
                        {selectedRelationship?.relationshipStatus === 'accepted'
                          ? 'Connected'
                          : selectedRelationship?.relationshipStatus
                            ? selectedRelationship.relationshipStatus
                            : 'Not connected'}
                      </ProfileTag>
                      <ProfileTag muted>{scopeLabel}</ProfileTag>
                      <ProfileTag muted>{partnerProvince || partnerCity || 'Location not published'}</ProfileTag>
                      <ProfileTag muted>Connected since {connectedSince}</ProfileTag>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => prefsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
                    className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-[#10243a] px-4 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(15,23,42,0.12)] transition hover:bg-[#173a5e]"
                  >
                    <Sparkles size={16} />
                    Set Preferences
                  </button>
                  <button
                    type="button"
                    onClick={() => overviewRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
                    className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#d7e2ee] bg-white px-4 text-sm font-semibold text-[#27445f] shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition hover:bg-[#f8fafc]"
                  >
                    <Landmark size={16} />
                    Manage Connection
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <HeroStat
                  label="Consultants"
                  value={visibleConsultants.length ? formatNumber(visibleConsultants.length) : '0'}
                  subtext={visibleConsultants.length ? 'Visible through relationship permissions' : 'No consultants published yet'}
                  icon={Users}
                />
                <HeroStat
                  label="Branches"
                  value={visibleBranches.length ? formatNumber(visibleBranches.length) : '0'}
                  subtext={visibleBranches.length ? visibleBranches.join(' · ') : 'No branch visibility published yet'}
                  icon={Building2}
                />
                <HeroStat
                  label="Transactions"
                  value={Number.isFinite(Number(transactionStats.activeTransactions)) ? formatNumber(transactionStats.activeTransactions) : '—'}
                  subtext={Number.isFinite(Number(transactionStats.activeTransactions)) ? 'Shared collaborations visible in Arch9' : 'No transaction volume published'}
                  icon={Network}
                />
                <HeroStat
                  label="Coverage"
                  value={partnerProvince || partnerCity || 'National'}
                  subtext={activeAreas.length ? activeAreas.join(' · ') : 'Coverage details not published'}
                  icon={Globe2}
                />
              </div>
            </div>
          </div>
        </ProfileBand>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
          <ProfileBand ref={overviewRef} className="overflow-hidden">
            <ProfileSectionHeader
              eyebrow="Company Overview"
              title={`About ${partnerName}`}
              description={selectedPartnerAboutCompany}
              action={`Relationship view for ${organisation?.name || workspace?.name || 'your organisation'}`}
            />
            <div className="space-y-6 px-5 py-5 sm:px-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
                <div className="rounded-[20px] border border-[#e4ebf4] bg-[#fbfdff] p-4 sm:rounded-[22px] sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">About {partnerName}</p>
                  <p className="mt-4 max-w-3xl text-sm leading-7 text-[#40556c]">
                    {selectedPartner?.legalName ? `${selectedPartner.legalName}. ` : ''}
                    {selectedPartnerAboutCompany}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {(selectedPartner?.specialties || []).slice(0, 6).map((item) => (
                      <ProfileTag key={item}>{item}</ProfileTag>
                    ))}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#e4ebf4] bg-white p-4 sm:rounded-[22px] sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Relationship Controls</p>
                  <div className="mt-4 grid gap-3 text-sm leading-6 text-[#40556c]">
                    <p className="inline-flex items-start gap-2"><LockKeyhole size={15} className="mt-0.5 text-[#52677f]" /> Organisation data stays permission-gated.</p>
                    <p className="inline-flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 text-[#52677f]" /> Transaction sharing is granted per transaction.</p>
                    <p className="inline-flex items-start gap-2"><Network size={15} className="mt-0.5 text-[#52677f]" /> Status: {selectedRelationship?.relationshipStatus || 'Not connected'}</p>
                    <p className="inline-flex items-start gap-2"><Network size={15} className="mt-0.5 text-[#52677f]" /> Scope: {scopeLabel}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[20px] border border-[#e4ebf4] bg-white p-4 sm:rounded-[22px] sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Service delivery</p>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-[#40556c]">{selectedPartnerServiceDelivery}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(serviceTags.length ? serviceTags : ['Service details not published']).map((item) => (
                    <ProfileTag key={item} muted={!serviceTags.length}>
                      {item}
                    </ProfileTag>
                  ))}
                </div>
                <p className="mt-4 text-sm leading-6 text-[#60758d]">
                  Service areas:
                  <span className="font-semibold text-[#40556c]">
                    {' '}
                    {activeAreas.length ? activeAreas.join(' · ') : 'No operating areas published yet'}
                  </span>
                </p>
              </div>
            </div>
          </ProfileBand>

          <ProfileBand className="overflow-hidden">
            <ProfileSectionHeader
              eyebrow="Arch9 Activity"
              title="Live relationship activity"
              description="A quick read on the visible work Arch9 can associate with this partner connection."
            />
            <div className="grid gap-4 px-5 py-5 sm:px-6">
              {bridgeMetrics.map((metric) => (
                <HeroStat
                  key={metric.label}
                  label={metric.label}
                  value={getProfileMetricValue(metric)}
                  subtext={metric.subtext}
                  icon={metric.icon}
                />
              ))}
            </div>
          </ProfileBand>
        </div>

        <ProfileBand>
          <ProfileSectionHeader
            eyebrow="Consultants"
            title={getOperationalPeopleSectionTitle(selectedPartner?.type)}
            description="Visible operational people inside this organisation connection. This is the list Arch9 can safely expose through current visibility rules."
          />
          <div className="space-y-5 px-5 py-5 sm:px-6">
            {partnerPeopleLoading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((index) => (
                  <div key={index} className="h-44 animate-pulse rounded-[24px] bg-[#f7fafc]" />
                ))}
              </div>
            ) : visibleConsultants.length ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {visibleConsultants.slice(0, 12).map((person) => {
                    const personId = normalizeText(person.userId || person.id)
                    const personName = normalizeText(person.label || person.fullName || person.name)
                    const isPreferred = routingControls.some((control) => {
                      const rule = routingRulesByRole?.[control.roleType] || null
                      return (
                        normalizeText(rule?.targetConsultantUserId || rule?.targetUserId || rule?.target_user_id) === personId ||
                        normalizeText(rule?.targetScopeName || rule?.target_scope_name) === personName
                      )
                    })
                    const personKey = normalizeText(person.userId || person.id || person.email || person.fullName)
                    const isSelectedPerson = normalizeText(selectedVisiblePerson?.userId || selectedVisiblePerson?.id) === personId
                    return (
                    <VisiblePersonCard
                      key={personKey}
                      person={person}
                      preferred={isPreferred}
                      selected={isSelectedPerson}
                      onClick={() => onSelectVisiblePerson?.(personId)}
                    />
                  )
                })}
              </div>
              {shouldShowCurrentListings ? (
                  <div className="rounded-[20px] border border-[#e4ebf4] bg-[#fbfdff] p-4 sm:rounded-[22px] sm:p-5">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Current listings</p>
                        <h3 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-[#10243a]">
                          {selectedVisiblePerson
                            ? `Listings for ${selectedVisiblePerson.label || selectedVisiblePerson.fullName || selectedVisiblePerson.name}`
                            : 'Select a visible person to see current listings'}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-[#60758d]">
                          {selectedVisiblePerson
                            ? 'Arch9 can surface the current work attached to this visible partner contact.'
                            : 'Choose a visible person to review current listings associated with this partner relationship.'}
                        </p>
                      </div>
                      <ProfileTag muted>
                        {selectedVisiblePersonListings.length ? `${selectedVisiblePersonListings.length} listings` : 'No listings visible'}
                      </ProfileTag>
                    </div>
                    {selectedPartnerListingsMeta?.loading ? (
                      <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
                        {[0, 1, 2].map((index) => (
                          <div key={index} className="h-44 min-w-[260px] animate-pulse rounded-[22px] bg-[#f7fafc]" />
                        ))}
                      </div>
                    ) : selectedVisiblePersonListings.length ? (
                      <div className="mt-4 flex gap-4 overflow-x-auto pb-2 pr-1">
                        {selectedVisiblePersonListings.slice(0, 12).map((listing) => (
                          <ListingCard key={listing.listingId || listing.listingReference || `${listing.title}-${listing.agentName}`} listing={listing} />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4">
                        <PremiumEmptyState
                          title="No listings visible yet."
                          description="This partner contact does not currently have visible listings attached to the partner relationship."
                        />
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : (
              <PremiumEmptyState
                title="No consultants have been published yet."
                description={
                  partnerPeopleMessage ||
                  'This organisation has not made any consultants visible through Arch9. It is not an error, just an empty relationship surface until visibility permissions are set.'
                }
              />
            )}
          </div>
        </ProfileBand>

        {routingControls.length ? (
          <ProfileBand ref={prefsRef}>
            <ProfileSectionHeader
              eyebrow="Operational Preferences"
              title="Choose who you actually work with inside this organisation"
              description="These preferences determine who is automatically recommended during transaction creation. Manual transaction overrides will always take priority."
            />
            <div className="space-y-5 px-5 py-5 sm:px-6">
              {!visibleConsultants.length ? (
                <PremiumEmptyState
                  title="No people are visible yet."
                  description="Ask this partner organisation to expose the correct staff members to this relationship."
                />
              ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                  {routingControls.map((control) => {
                    const currentRule = routingRulesByRole?.[control.roleType] || null
                    const roleKey = createPartnerRoleKey(selectedPartner?.id, control.roleType)
                    const saving = routingSavingRoleKeys?.has?.(roleKey)
                    return (
                      <div key={control.roleType} className="rounded-[20px] border border-[#e4ebf4] bg-[#fbfdff] p-4 sm:rounded-[22px] sm:p-5">
                        <RoutingPreferenceField
                          roleType={control.roleType}
                          selectedPartnerId={selectedPartner?.id}
                          partnerPeople={visibleConsultants}
                          currentRule={currentRule}
                          selectionValue={routingSelectionValues?.[roleKey] || ''}
                          saving={saving}
                          onChange={onSelectRoutingPreference}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="rounded-[20px] border border-[#d8e7f4] bg-[#f8fbff] px-4 py-4 text-sm leading-6 text-[#40556c] sm:rounded-[22px] sm:px-5">
                These preferences are saved against your user profile and used later during transaction creation. They do not change the underlying organisation connection.
              </div>
            </div>
          </ProfileBand>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <ProfileBand ref={updatesRef}>
            <ProfileSectionHeader
              eyebrow="Client Reviews"
              title="Coming soon"
              description="This section will later hold client reviews, testimonials, and partner feedback."
            />
            <div className="px-5 py-5 sm:px-6">
              <PremiumEmptyState
                title="Client reviews are coming soon."
                description="We’ll use this space later for testimonials, service feedback, and trusted relationship signals."
              />
            </div>
          </ProfileBand>

          {connectedHasData ? (
            <ProfileBand ref={connectedRef}>
              <ProfileSectionHeader
                eyebrow="Connected Organisations"
                title="Works with"
                description="Other connected organisations currently visible within your Arch9 network."
              />
              <div className="space-y-3 px-5 py-5 sm:px-6">
                {relatedOrganisations.map((item) => (
                  <div key={item.id} className="rounded-[20px] border border-[#e4ebf4] bg-white p-4 sm:rounded-[22px]">
                    <div className="flex items-start gap-3">
                      <OrganisationAvatar organisation={item.partner || { name: item.label }} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-base font-semibold tracking-[-0.01em] text-[#10243a]">{item.label}</p>
                        <p className="mt-1 text-sm text-[#60758d]">{item.type}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <ProfileTag muted>{item.scope}</ProfileTag>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ProfileBand>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function PartnerCard({
  partner,
  relationship,
  action,
  actionLabel,
  actionDisabled = false,
  onProfileClick,
  muted = false,
  selected = false,
}) {
  const isPreferred = Boolean(relationship?.preferred || relationship?.relationshipType === 'preferred')
  const statusLabel = relationship?.relationshipStatus || 'Pending'
  const typeLabel = getPartnerTypeLabel(partner?.type)
  const location = [partner?.city, partner?.province].filter(Boolean).join(', ') || 'Location pending'

  return (
    <article
      className={`rounded-[18px] border p-4 transition sm:rounded-[20px] sm:p-5 lg:rounded-[22px] ${
        selected
          ? 'border-[#9ebcda] bg-[#f7fbff] shadow-[0_14px_30px_rgba(31,79,120,0.12)]'
          : 'border-[#dbe5f0] bg-white'
      } ${muted ? 'opacity-75' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PartnerLogo partner={partner} />
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold tracking-[-0.01em] text-[#10243a]">{partner?.name || 'Partner organisation'}</h3>
              <p className="mt-1 text-sm text-[#60758d]">{typeLabel} · {location}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {relationship ? (
              <StatusBadge className={statusBadgeClass(statusLabel)}>{statusLabel === 'accepted' ? 'Connected' : statusLabel}</StatusBadge>
            ) : null}
            <PartnerScopeBadge relationship={relationship} />
            {isPreferred ? <StatusBadge className={relationshipBadgeClass('preferred')}>Preferred</StatusBadge> : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-3">
        <button
          type="button"
          onClick={onProfileClick}
          disabled={!onProfileClick || selected}
          aria-pressed={selected}
          className={`inline-flex h-9 items-center gap-2 rounded-[8px] border px-3 text-sm font-semibold transition ${
            selected
              ? 'border-[#c8daef] bg-[#10243a] text-white'
              : 'border-[#d9e4ef] bg-white text-[#264563] hover:bg-[#f8fafc]'
          } disabled:cursor-default`}
        >
          {selected ? 'Viewing' : 'View profile'} {!selected ? <ArrowUpRight size={14} /> : null}
        </button>
        {action ? (
          <button
            type="button"
            disabled={actionDisabled}
            className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-[#10243a] px-3 text-sm font-semibold text-white transition hover:bg-[#173a5e] disabled:cursor-not-allowed disabled:bg-[#dbe5ef] disabled:text-[#52677f]"
            onClick={action}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </article>
  )
}

function ProfilePanel({
  isOpen = false,
  partner,
  relationship,
  people = [],
  peopleLoading = false,
  peopleMessage = '',
  routingRulesByRole = {},
  routingSelectionValues = {},
  routingSavingRoleKeys = new Set(),
  onSelectRoutingPreference,
}) {
  if (!isOpen) {
    return (
      <aside className="rounded-[18px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:rounded-[20px] lg:rounded-[22px]">
        <p className="text-sm font-semibold text-[#10243a]">Select an organisation</p>
        <p className="mt-2 text-sm leading-6 text-[#60758d]">Choose a partner to open the profile panel. This view shows the relationship, visible operational people, and preferred partner placeholders without leaving the page.</p>
      </aside>
    )
  }

  if (!partner) {
    return (
      <aside className="rounded-[18px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:rounded-[20px] lg:rounded-[22px]">
        <p className="text-sm font-semibold text-[#10243a]">Partner unavailable</p>
        <p className="mt-2 text-sm leading-6 text-[#60758d]">This organisation is no longer available in the current partner snapshot.</p>
      </aside>
    )
  }

  const staff = Array.isArray(people) ? people : []
  const partnerKind = getPartnerProfileKind(partner.type)
  const activeAreas = collectPartnerActiveAreas(partner)
  const scopeLabel = relationship ? getPartnerScopeBadge(relationship).label : 'No connection scope available'
  const visibleBranches = collectVisibleBranchNames(staff)
  const attorneyCapabilities = getAttorneyCapabilityBadges(partner)
  const visibleAgentCount = staff.filter((person) => normalizeLower(person.role || person.organisationRole).includes('agent')).length
  const routingControls = getOperationalRoutingControlsForPartnerType(partner.type)
  const routingSummary = routingControls
    .map((control) => {
      const rule = routingRulesByRole[control.roleType]
      const label = normalizeText(rule?.targetScopeName || rule?.target_scope_name)
      return label ? `${getRoutingRoleLabel(control.roleType)}: ${label}` : ''
    })
    .filter(Boolean)

  return (
    <aside className="rounded-[18px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:rounded-[20px] lg:rounded-[22px] xl:sticky xl:top-4">
      <div className="flex items-start gap-3">
        <PartnerLogo partner={partner} />
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#10243a]">{partner.name}</h2>
          <p className="text-sm text-[#60758d]">{getPartnerTypeLabel(partner.type)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <div className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Connection snapshot</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge className={statusBadgeClass(relationship?.relationshipStatus || 'pending')}>
              {relationship?.relationshipStatus === 'accepted' ? 'Connected' : relationship?.relationshipStatus || 'Not connected'}
            </StatusBadge>
            {relationship ? <PartnerScopeBadge relationship={relationship} /> : null}
          </div>
          <p className="mt-3 text-sm leading-6 text-[#40556c]">{buildPartnerOverviewCopy(partner)}</p>
          <p className="mt-2 text-xs text-[#60758d]">
            {relationship ? `Connected since ${formatDate(relationship.acceptedAt || relationship.createdAt)}` : 'Open the organisation card from Connected Organisations to work with a live connection.'}
          </p>
        </div>
        <div className="rounded-[8px] border border-[#e4ebf4] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Active Areas</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(activeAreas.length ? activeAreas : ['Property transactions']).map((area) => (
              <span key={area} className="rounded-full border border-[#e4ebf4] bg-[#f8fafc] px-2.5 py-1 text-xs font-semibold text-[#52677f]">{area}</span>
            ))}
          </div>
        </div>
        <div className="rounded-[8px] border border-[#e4ebf4] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Organisation overview</p>
          {partnerKind === 'bond_originator' ? (
            <div className="mt-3 grid gap-2 text-sm text-[#40556c]">
              <p>Connected scope: {scopeLabel}</p>
              <p>Visible consultants: {staff.length}</p>
              <p>Branch coverage: {visibleBranches.length ? visibleBranches.join(', ') : 'No branch visibility published yet'}</p>
            </div>
          ) : null}
          {partnerKind === 'attorney' ? (
            <div className="mt-3 grid gap-2 text-sm text-[#40556c]">
              <p>Connected scope: {scopeLabel}</p>
              <p>Visible legal staff: {staff.length}</p>
              <div className="flex flex-wrap gap-2">
                {(attorneyCapabilities.length ? attorneyCapabilities : ['Capability not published']).map((capability) => (
                  <span key={capability} className="rounded-full border border-[#e4ebf4] bg-[#f8fafc] px-2.5 py-1 text-xs font-semibold text-[#52677f]">{capability}</span>
                ))}
              </div>
            </div>
          ) : null}
          {partnerKind === 'agency' ? (
            <div className="mt-3 grid gap-2 text-sm text-[#40556c]">
              <p>Connected scope: {scopeLabel}</p>
              <p>Visible branches: {visibleBranches.length ? visibleBranches.join(', ') : 'No branches are visible yet'}</p>
              <p>Visible agents: {visibleAgentCount || staff.length}</p>
            </div>
          ) : null}
          {partnerKind === 'general' ? (
            <div className="mt-3 grid gap-2 text-sm text-[#40556c]">
              <p>Connected scope: {scopeLabel}</p>
              <p>Visible operational people: {staff.length}</p>
            </div>
          ) : null}
        </div>
        <div className="rounded-[8px] border border-[#e4ebf4] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Preferred partner settings</p>
          <p className="mt-2 text-sm leading-6 text-[#40556c]">
            {routingSummary.length
              ? routingSummary.join(' ')
              : partnerKind === 'bond_originator'
                ? 'No preferred bond consultant has been selected for this partner yet.'
                : partnerKind === 'attorney'
                  ? 'No preferred attorney users have been selected for this partner yet.'
                  : partnerKind === 'agency'
                    ? 'No preferred agent has been selected for this partner yet.'
                    : 'No preferred people have been selected for this partner yet.'}
          </p>
          <p className="mt-2 text-xs leading-5 text-[#60758d]">
            Phase 1 keeps the existing routing model intact. This panel surfaces current preference state without changing organisation-level connection architecture.
          </p>
        </div>
        {routingControls.length ? (
          <div className="rounded-[8px] border border-[#e4ebf4] bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Operational Routing</p>
            {peopleLoading ? (
              <p className="mt-3 text-sm text-[#60758d]">Loading people available for routing...</p>
            ) : staff.length ? (
              <div className="mt-3 grid gap-3">
                {routingControls.map((control) => {
                  const roleKey = createPartnerRoleKey(partner.id, control.roleType)
                  const currentRule = routingRulesByRole[control.roleType] || null
                  const currentValue =
                    routingSelectionValues[roleKey] ??
                    normalizeText(
                      currentRule?.targetConsultantUserId ||
                        currentRule?.targetUserId ||
                        currentRule?.target_user_id,
                    )
                  const hiddenCurrentLabel = normalizeText(currentRule?.targetScopeName || currentRule?.target_scope_name)
                  const hasVisibleCurrentValue = staff.some((person) => normalizeText(person.userId || person.id) === currentValue)
                  const isSaving = routingSavingRoleKeys?.has?.(roleKey)

                  return (
                    <label key={control.roleType} className="grid gap-2">
                      <span className="text-sm font-semibold text-[#10243a]">{getRoutingRoleLabel(control.roleType)}</span>
                      <select
                        value={currentValue}
                        disabled={!relationship || isSaving}
                        onChange={(event) => onSelectRoutingPreference?.(control.roleType, event.target.value)}
                        className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10 disabled:cursor-not-allowed disabled:bg-[#f4f7fa]"
                      >
                        <option value="">{getRoutingRolePlaceholder(control.roleType)}</option>
                        {!hasVisibleCurrentValue && currentValue && hiddenCurrentLabel ? (
                          <option value={currentValue}>{hiddenCurrentLabel} (currently saved)</option>
                        ) : null}
                        {staff.map((person) => (
                          <option key={`${control.roleType}-${person.userId || person.id}`} value={normalizeText(person.userId || person.id)}>
                            {[person.label || person.fullName || person.name || 'Partner user', inferOperationalRoleLabel(person), person.branchName].filter(Boolean).join(' · ')}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-[#60758d]">
                        {isSaving
                          ? 'Saving preference...'
                          : currentValue
                            ? 'Saved per agent user for this partner organisation.'
                            : 'No user-level preference selected yet.'}
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <div className="mt-3 rounded-[8px] border border-dashed border-[#d7e2ee] bg-[#fbfcfd] p-3 text-sm text-[#60758d]">
                No people are visible yet. Ask this partner organisation to expose the correct staff members to this relationship.
              </div>
            )}
          </div>
        ) : null}
        <div className="rounded-[8px] border border-[#e4ebf4] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">{getOperationalPeopleSectionTitle(partner.type)}</p>
          <p className="mt-1 text-xs leading-5 text-[#60758d]">People visible through this organisation connection. Set one as the person you normally work with.</p>
          <div className="mt-3 space-y-2">
            {peopleLoading ? (
              <p className="text-sm text-[#60758d]">Loading visible people...</p>
            ) : staff.length ? (
              staff.slice(0, 6).map((person) => (
                <div key={person.userId || person.id || person.name} className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#10243a]">{person.label || person.fullName || person.name || 'Partner user'}</p>
                    <p className="mt-1 text-xs text-[#60758d]">
                      {[inferOperationalRoleLabel(person), person.branchName, person.regionName, person.teamName].filter(Boolean).join(' · ') || 'Visible through partner permissions'}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[8px] border border-dashed border-[#d7e2ee] bg-[#fbfcfd] p-3 text-sm text-[#60758d]">
                <p>{peopleMessage || 'No operational people are visible for this organisation connection yet.'}</p>
                {!peopleMessage ? (
                  <p className="mt-1">Set visibility permissions to expose specific people to this partner relationship.</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
        <div className="rounded-[8px] border border-[#e4ebf4] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Relationship Controls</p>
          <div className="mt-3 grid gap-2 text-sm text-[#40556c]">
            <p className="inline-flex items-center gap-2"><LockKeyhole size={15} className="text-[#52677f]" /> Organisation data stays permission-gated.</p>
            <p className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-[#52677f]" /> Transaction sharing is granted per transaction.</p>
            <p className="inline-flex items-center gap-2"><Network size={15} className="text-[#52677f]" /> Status: {relationship?.relationshipStatus || 'Not connected'}</p>
            {relationship ? <p className="inline-flex items-center gap-2"><Network size={15} className="text-[#52677f]" /> Scope: {scopeLabel}</p> : null}
          </div>
        </div>
      </div>
    </aside>
  )
}

function ToolbarFilterPills({ value, options, onChange, ariaLabel }) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex overflow-hidden rounded-[8px] border border-[#dbe5f0] bg-[#f8fafc] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={`h-8 rounded-[6px] px-3 text-xs font-semibold transition ${
            value === option.value ? 'bg-[#10243a] text-white' : 'text-[#52677f] hover:bg-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function invitationPartnerName(invitation, currentOrganisationId) {
  const currentId = normalizeText(currentOrganisationId)
  const raw =
    normalizeText(invitation?.toOrganisationId) === currentId
      ? invitation?.fromOrganisationName
      : invitation?.toOrganisationName || invitation?.fromOrganisationName

  return normalizeInvitationName(raw, invitation?.invitedEmail)
}

function invitationPartnerType(invitation, currentOrganisationId) {
  const currentId = normalizeText(currentOrganisationId)
  const direction = normalizeText(invitation?.toOrganisationId) === currentId ? invitation.fromWorkspaceType : invitation.toWorkspaceType
  return getPartnerTypeLabel(direction || 'agency')
}

function PartnerInviteModal({
  isOpen,
  onClose,
  onSubmit,
  inviteEmail,
  setInviteEmail,
  inviteOrganisationQuery,
  setInviteOrganisationQuery,
  selectedInviteOrganisation,
  inviteOrganisationResults,
  selectedInviteOrganisationId,
  setSelectedInviteOrganisationId,
  inviteType,
  setInviteType,
  inviteNote,
  setInviteNote,
  inviteScopeValue,
  setInviteScopeValue,
  inviteScopeTargetId,
  setInviteScopeTargetId,
  inviteScopeTargetName,
  setInviteScopeTargetName,
  invitePreferred,
  setInvitePreferred,
  inviteScopeNeedsTarget,
  selectedInviteScope,
  allowedScopes,
  selectInviteOrganisation,
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-[#10243a]/50 p-4 py-8 sm:items-center">
      <div className="w-full max-w-2xl rounded-[8px] border border-[#d9e4ef] bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.15)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#10243a]">Invite partner</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#d9e4ef] hover:bg-[#f8fafc]"
            aria-label="Close invite form"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 grid gap-2">
          <input
            type="email"
            value={inviteEmail}
            onChange={(event) => {
              setInviteEmail(event.target.value)
              if (selectedInviteOrganisationId) {
                setSelectedInviteOrganisationId('')
              }
            }}
            placeholder="Partner email"
            className="min-w-0 rounded-[8px] border border-[#d7e2ee] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10"
          />
          <input
            type="text"
            value={inviteOrganisationQuery}
            onChange={(event) => {
              setInviteOrganisationQuery(event.target.value)
              if (selectedInviteOrganisationId) {
                setSelectedInviteOrganisationId('')
              }
            }}
            placeholder="Search existing organisation by name"
            className="min-w-0 rounded-[8px] border border-[#d7e2ee] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10"
          />
          <textarea
            value={inviteNote}
            onChange={(event) => setInviteNote(event.target.value)}
            placeholder="Optional message"
            className="min-h-[72px] rounded-[8px] border border-[#d7e2ee] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10"
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <select value={inviteType} onChange={(event) => setInviteType(event.target.value)} className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm">
              {PARTNER_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <select
              value={inviteScopeValue}
              onChange={(event) => setInviteScopeValue(event.target.value)}
              className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
              aria-label="Partner relationship scope"
            >
              {allowedScopes.map((scope) => (
                <option key={scope.value} value={scope.value}>
                  {scope.label}
                </option>
              ))}
            </select>
          </div>

          {inviteScopeNeedsTarget ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={inviteScopeTargetId}
                onChange={(event) => setInviteScopeTargetId(event.target.value)}
                placeholder={`${selectedInviteScope.label} target id`}
                className="min-w-0 rounded-[8px] border border-[#d7e2ee] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10"
              />
              <input
                type="text"
                value={inviteScopeTargetName}
                onChange={(event) => setInviteScopeTargetName(event.target.value)}
                placeholder="Target display name"
                className="min-w-0 rounded-[8px] border border-[#d7e2ee] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10"
              />
            </div>
          ) : null}

          <label className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#d3deea] bg-white px-3 text-sm font-semibold text-[#35546c]">
            <input
              type="checkbox"
              checked={invitePreferred}
              onChange={(event) => setInvitePreferred(event.target.checked)}
              className="h-4 w-4 rounded border-[#c8d6e5] text-[#10243a]"
            />
            Preferred
          </label>

          {selectedInviteOrganisation ? (
            <p className="text-sm text-[#10243a]">
              Resolved to: <span className="font-semibold">{selectedInviteOrganisation.name}</span> · {getPartnerTypeLabel(selectedInviteOrganisation.type)}
            </p>
          ) : inviteEmail ? (
            <p className="text-sm text-[#10243a]">Resolved to: {normalizeInvitationName('', inviteEmail)}</p>
          ) : null}

          {!!inviteOrganisationResults.length && !selectedInviteOrganisationId ? (
            <div className="rounded-[8px] border border-[#e4ebf4] bg-white p-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7a8ba3]">Organisation suggestions</p>
              <div className="grid gap-2">
                {inviteOrganisationResults.map((organisation) => (
                  <button
                    type="button"
                    key={organisation.id}
                    onClick={() => selectInviteOrganisation(organisation.id)}
                    className="flex min-w-0 items-center gap-2 rounded-[8px] border border-[#dbe5f0] bg-white p-2 text-left text-sm text-[#10243a] hover:bg-[#f6f9ff]"
                  >
                    <OrganisationAvatar organisation={organisation} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{organisation.name}</span>
                      <span className="block truncate text-xs text-[#60758d]">{getPartnerTypeLabel(organisation.type)} · {organisation.city || 'Unspecified city'}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#10243a] px-4 text-sm font-semibold text-white"
            >
              <InviteIcon size={15} /> Send invite
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-[8px] border border-[#d9e4ef] bg-white px-4 text-sm font-semibold text-[#35546c] hover:bg-[#f8fafc]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function PartnersPage() {
  const { partnerId = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { workspace, workspaceType, role, profile, currentMembership } = useWorkspace()
  const { organisation } = useOrganisation()
  const organisationId = organisation?.partnerOrganisationId || organisation?.organisationId || workspace?.organisationId || organisation?.id || workspace?.id || ''
  const resolvedWorkspaceType = organisation?.type || workspaceType || role
  const profileQueryId = useMemo(() => normalizeText(new URLSearchParams(location.search).get('profile')), [location.search])

  const [activeTab, setActiveTab] = useState('connected')
  const [selectedPartnerId, setSelectedPartnerId] = useState(() => profileQueryId || partnerId)
  const [profilePanelOpen, setProfilePanelOpen] = useState(() => Boolean(profileQueryId || partnerId))
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [discoverDirectory, setDiscoverDirectory] = useState([])
  const [discoverDirectoryLoading, setDiscoverDirectoryLoading] = useState(false)
  const [connectingPartnerIds, setConnectingPartnerIds] = useState(() => new Set())
  const [sentConnectionPartnerIds, setSentConnectionPartnerIds] = useState(() => new Set())
  const [preferredRoutingRules, setPreferredRoutingRules] = useState([])
  const [routingSelectionValues, setRoutingSelectionValues] = useState({})
  const [savingRoutingRoleKeys, setSavingRoutingRoleKeys] = useState(() => new Set())
  const [partnerPeopleByRelationshipId, setPartnerPeopleByRelationshipId] = useState({})
  const [partnerPeopleMetaByRelationshipId, setPartnerPeopleMetaByRelationshipId] = useState({})
  const [partnerListingsByRelationshipId, setPartnerListingsByRelationshipId] = useState({})
  const [partnerListingsMetaByRelationshipId, setPartnerListingsMetaByRelationshipId] = useState({})
  const [selectedVisiblePersonId, setSelectedVisiblePersonId] = useState('')
  const connectingPartnerIdsRef = useRef(new Set())
  const profilePanelRef = useRef(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteOrganisationQuery, setInviteOrganisationQuery] = useState('')
  const [selectedInviteOrganisationId, setSelectedInviteOrganisationId] = useState('')
  const [inviteType, setInviteType] = useState('agency')
  const [inviteNote, setInviteNote] = useState('')
  const [inviteScopeValue, setInviteScopeValue] = useState('')
  const [inviteScopeTargetId, setInviteScopeTargetId] = useState('')
  const [inviteScopeTargetName, setInviteScopeTargetName] = useState('')
  const [invitePreferred, setInvitePreferred] = useState(false)

  const [directoryFilters, setDirectoryFilters] = useState({
    scope: 'all',
    type: '',
    preferredOnly: false,
    query: '',
  })
  const [discoverFilters, setDiscoverFilters] = useState({
    query: '',
    type: '',
    province: '',
    specialty: '',
    preferredOnly: false,
  })
  const [invitationFilters, setInvitationFilters] = useState({
    direction: 'all',
    status: 'all',
    query: '',
    type: '',
  })

  const accessContext = useMemo(
    () => ({
      organisationId,
      role,
      profile,
      currentMembership,
    }),
    [currentMembership, organisationId, profile, role],
  )
  const isBondPartnersRoute = location.pathname.startsWith('/bond/partners')

  const allowedScopes = useMemo(
    () =>
      getAllowedPartnerScopes({
        organisationId,
        organisationName: organisation?.name || workspace?.name || '',
        role,
        profile,
        currentMembership,
      }),
    [currentMembership, organisation?.name, organisationId, profile, role, workspace?.name],
  )

  const selectedInviteScope = useMemo(() => {
    const fallback = allowedScopes[0] || { value: `organisation:${organisationId}`, scopeType: 'organisation', scopeId: organisationId, label: 'Organisation-wide' }
    return allowedScopes.find((scope) => scope.value === inviteScopeValue) || fallback
  }, [allowedScopes, inviteScopeValue, organisationId])

  const inviteScopeNeedsTarget = Boolean(selectedInviteScope?.requiresTarget)
  const loadSnapshot = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      setDiscoverDirectory([])
      const [nextSnapshot, nextPreferredRoutingRules] = await Promise.all([
        fetchPartnersSnapshot({
          organisationId,
          workspaceType: resolvedWorkspaceType,
          accessContext,
          includeDirectory: false,
        }),
        getPartnerRoutingRulesForUser(organisationId, profile?.id || '').catch(() => []),
      ])
      setSnapshot(nextSnapshot)
      setPreferredRoutingRules(Array.isArray(nextPreferredRoutingRules) ? nextPreferredRoutingRules : [])
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load partner network.')
    } finally {
      setLoading(false)
    }
  }, [accessContext, organisationId, profile?.id, resolvedWorkspaceType])

  const loadDiscoverDirectory = useCallback(async () => {
    if (!organisationId || discoverDirectoryLoading || snapshot?.directoryHydrated) return
    try {
      setDiscoverDirectoryLoading(true)
      const organisations = await fetchDiscoverablePartnerDirectory({
        organisationId,
        workspaceType: resolvedWorkspaceType,
      })
      setDiscoverDirectory(organisations)
      setSnapshot((previous) => (previous ? { ...previous, directoryHydrated: true } : previous))
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load discoverable partners.')
    } finally {
      setDiscoverDirectoryLoading(false)
    }
  }, [discoverDirectoryLoading, organisationId, resolvedWorkspaceType, snapshot?.directoryHydrated])

  useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  useEffect(() => {
    const nextSelectedId = profileQueryId || partnerId
    if (!nextSelectedId) return
    setSelectedPartnerId(nextSelectedId)
    setProfilePanelOpen(true)
  }, [partnerId, profileQueryId])

  useEffect(() => {
    if (activeTab !== 'discover' && !isInviteModalOpen) return
    if (snapshot?.directoryHydrated) return
    void loadDiscoverDirectory()
  }, [activeTab, isInviteModalOpen, loadDiscoverDirectory, snapshot?.directoryHydrated])

  useEffect(() => {
    if (inviteScopeValue && allowedScopes.some((scope) => scope.value === inviteScopeValue)) return
    setInviteScopeValue(allowedScopes[0]?.value || '')
  }, [allowedScopes, inviteScopeValue])

  const relationships = useMemo(() => snapshot?.relationships || [], [snapshot?.relationships])
  const connectedRelationships = useMemo(
    () => filterPartnerRelationshipsByScope(relationships, accessContext).filter((item) => item.relationshipStatus === 'accepted'),
    [accessContext, relationships],
  )

  const preferredRoutingRuleByPartnerOrgId = useMemo(() => {
    const rulesByOrganisationId = new Map()
    ;(preferredRoutingRules || []).forEach((rule) => {
      if (rule?.isActive === false) return
      const targetOrganisationId = normalizeText(rule.targetOrganisationId || rule.target_organisation_id)
      if (!targetOrganisationId || rulesByOrganisationId.has(targetOrganisationId)) return
      rulesByOrganisationId.set(targetOrganisationId, rule)
    })
    return rulesByOrganisationId
  }, [preferredRoutingRules])

  const preferredRoutingRuleByPartnerOrgRoleKey = useMemo(() => {
    const rulesByKey = new Map()
    ;(preferredRoutingRules || []).forEach((rule) => {
      if (rule?.isActive === false) return
      const targetOrganisationId = normalizeText(rule.targetOrganisationId || rule.target_organisation_id)
      const targetRoleType = normalizeText(rule.targetRoleType || rule.target_role_type)
      const key = createPartnerRoleKey(targetOrganisationId, targetRoleType)
      if (!targetOrganisationId || !targetRoleType || rulesByKey.has(key)) return
      rulesByKey.set(key, rule)
    })
    return rulesByKey
  }, [preferredRoutingRules])

  const preferredPartnerRows = useMemo(() => {
    const connectedByOrgId = new Map(
      connectedRelationships.map((relationship) => [
        normalizeText(relationship.partner?.id || relationship.counterpartOrganisationId || relationship.partnerOrganisationId),
        relationship,
      ]),
    )

    const routedOrganisationIds = new Set()
    const routingRows = (preferredRoutingRules || [])
      .map((rule) => {
        const targetOrganisationId = normalizeText(rule?.targetOrganisationId || rule?.target_organisation_id)
        if (!targetOrganisationId) return null
        routedOrganisationIds.add(targetOrganisationId)
        const relationship = connectedByOrgId.get(targetOrganisationId) || null
        const partner = relationship?.partner || null
        const partnerType = partner?.type || 'unknown'
        const targetScopeType = normalizeText(rule?.targetScopeType || rule?.target_scope || rule?.target_scope_type)
        const targetUserId = normalizeText(rule?.targetConsultantUserId || rule?.targetUserId || rule?.target_user_id)
        const isPersonPreference = Boolean(targetUserId || targetScopeType === PARTNER_ROUTING_TARGET_TYPES.consultant)
        const targetName = normalizeText(rule?.targetScopeName || rule?.target_scope_name)
        return {
          id: rule.id,
          partner,
          relationship,
          partnerType,
          personName: isPersonPreference ? targetName || 'Preferred person' : targetName || partner?.name || 'Organisation default',
          organisationName: partner?.name || 'Connected partner',
          organisationId: targetOrganisationId,
          contactPerson: isPersonPreference ? targetName : '',
          email: partner?.contactEmails?.[0] || '',
          isPersonPreference,
          groupLabel:
            partnerType === 'bond_originator'
              ? 'Bond Originators'
              : partnerType === 'attorney_firm'
                ? 'Attorneys'
                : partnerType === 'developer_company'
                  ? 'Developers'
                  : partnerType === 'agency_network'
                    ? 'Agency Networks'
                    : partnerType === 'agency'
                      ? 'Agents'
                      : 'Other Partners',
          routingRule: rule,
        }
      })
      .filter(Boolean)

    const relationshipRows = connectedRelationships
      .filter((relationship) => {
        const organisationId = normalizeText(relationship.partner?.id || relationship.counterpartOrganisationId || relationship.partnerOrganisationId)
        if (!organisationId || routedOrganisationIds.has(organisationId)) return false
        return Boolean(relationship.preferred || relationship.relationshipType === 'preferred')
      })
      .map((relationship) => {
        const partner = relationship.partner || null
        const partnerType = partner?.type || 'unknown'
        return {
          id: `relationship-${relationship.id}`,
          partner,
          relationship,
          partnerType,
          personName: partner?.name || 'Preferred partner',
          organisationName: partner?.name || 'Connected partner',
          organisationId: normalizeText(partner?.id || relationship.counterpartOrganisationId || relationship.partnerOrganisationId),
          contactPerson: '',
          email: partner?.contactEmails?.[0] || '',
          isPersonPreference: false,
          groupLabel:
            partnerType === 'bond_originator'
              ? 'Bond Originators'
              : partnerType === 'attorney_firm'
                ? 'Attorneys'
                : partnerType === 'developer_company'
                  ? 'Developers'
                  : partnerType === 'agency_network'
                    ? 'Agency Networks'
                    : partnerType === 'agency'
                      ? 'Agents'
                      : 'Other Partners',
          routingRule: null,
        }
      })

    return [...routingRows, ...relationshipRows]
      .sort((left, right) => {
        const leftGroup = left.groupLabel || ''
        const rightGroup = right.groupLabel || ''
        if (leftGroup !== rightGroup) return leftGroup.localeCompare(rightGroup)
        return String(left.personName || '').localeCompare(String(right.personName || ''))
      })
  }, [connectedRelationships, preferredRoutingRules])

  const visibleConnectedRelationships = useMemo(
    () =>
      connectedRelationships.filter((relationship) => {
        const partnerOrganisationId = normalizeText(relationship.partner?.id || relationship.counterpartOrganisationId || relationship.partnerOrganisationId)
        const isPreferred = Boolean(
          relationship.preferred ||
            relationship.relationshipType === 'preferred' ||
            preferredRoutingRuleByPartnerOrgId.get(partnerOrganisationId),
        )
        if (directoryFilters.query && !normalizeLower(relationship.partner?.name).includes(normalizeLower(directoryFilters.query))) return false
        if (directoryFilters.scope !== 'all' && relationship.scopeType !== directoryFilters.scope) return false
        if (directoryFilters.type && relationship.partner?.type !== directoryFilters.type) return false
        if (directoryFilters.preferredOnly && !isPreferred) return false
        return true
      }),
    [connectedRelationships, directoryFilters, preferredRoutingRuleByPartnerOrgId],
  )

  const invitations = useMemo(() => snapshot?.invitations || [], [snapshot?.invitations])
  const pendingSentConnectionPartnerIds = useMemo(() => {
    const currentOrganisationId = normalizeLower(organisationId)
    return new Set(
      invitations
        .filter((invitation) => (
          normalizeLower(invitation.fromOrganisationId) === currentOrganisationId &&
          (normalizeLower(invitation.status) || 'pending') === 'pending' &&
          normalizeText(invitation.toOrganisationId)
        ))
        .map((invitation) => normalizeText(invitation.toOrganisationId))
        .filter(Boolean),
    )
  }, [invitations, organisationId])
  const filteredInvitations = useMemo(() => {
    const isReceived = (invitation) => normalizeLower(invitation.toOrganisationId) === normalizeLower(organisationId)
    const list = invitations.filter((invitation) => {
      if (invitationFilters.direction === 'all') return true
      return invitationFilters.direction === 'received' ? isReceived(invitation) : !isReceived(invitation)
    })

    const statusFilter = normalizeLower(invitationFilters.status)
    const listWithStatus = statusFilter === 'all' ? list : list.filter((invitation) => (normalizeLower(invitation.status) || 'pending') === statusFilter)
    const listWithType = invitationFilters.type
      ? listWithStatus.filter((invitation) => {
          const directionType = isReceived(invitation)
            ? normalizeLower(invitation.fromWorkspaceType)
            : normalizeLower(invitation.toWorkspaceType)
          return directionType === invitationFilters.type
        })
      : listWithStatus
    if (!invitationFilters.query) return listWithType

    return listWithType.filter((invitation) => invitationPartnerName(invitation, organisationId).toLowerCase().includes(normalizeLower(invitationFilters.query)))
  }, [invitationFilters.direction, invitationFilters.query, invitationFilters.status, invitationFilters.type, invitations, organisationId])

  const metrics = snapshot?.metrics || {}
  const currentType = resolvedWorkspaceType
  const relatedOrganisations = snapshot?.organisations || []
  const availableOrganisations = snapshot?.directoryHydrated
    ? discoverDirectory.length
      ? discoverDirectory
      : relatedOrganisations
    : relatedOrganisations
  const discoverablePartners = useMemo(() => {
    const connectedIds = new Set(relationships.map((item) => item.counterpartOrganisationId || item.partner?.id))
    return filterDiscoverablePartners(availableOrganisations, discoverFilters).filter((partner) => {
      if (!canConnectPartnerTypes(currentType, partner.type)) return false
      if (discoverFilters.preferredOnly && !(partner.preferred || partner.relationshipType === 'preferred')) return false
      return !connectedIds.has(partner.id)
    })
  }, [availableOrganisations, currentType, discoverFilters, relationships])

  const selectedInviteOrganisation = useMemo(() => {
    if (selectedInviteOrganisationId) {
      return availableOrganisations.find((item) => item.id === selectedInviteOrganisationId) || null
    }

    const email = normalizeLower(inviteEmail)
    if (!email) return null

    return (
      availableOrganisations.find((organisation) =>
        (organisation.contactEmails || []).some((candidate) => normalizeLower(candidate) === email),
      ) || null
    )
  }, [availableOrganisations, inviteEmail, selectedInviteOrganisationId])

  const inviteOrganisationResults = useMemo(() => {
    const query = normalizeLower(inviteOrganisationQuery)
    if (!query) return []
    return availableOrganisations
      .filter((item) => normalizeLower(item.name).includes(query))
      .slice(0, 5)
  }, [availableOrganisations, inviteOrganisationQuery])

  const selectedPartner = useMemo(() => {
    const selectedId = normalizeText(selectedPartnerId)
    if (!selectedId) return connectedRelationships[0]?.partner || discoverablePartners[0] || null
    return (
      availableOrganisations.find((item) => item.id === selectedId) ||
      connectedRelationships.find((item) => item.partner?.id === selectedId)?.partner ||
      null
    )
  }, [availableOrganisations, connectedRelationships, discoverablePartners, selectedPartnerId])

  const selectedRelationship = useMemo(
    () => connectedRelationships.find((item) => item.partner?.id === selectedPartner?.id) || null,
    [connectedRelationships, selectedPartner?.id],
  )
  const selectedPartnerRoutingRulesByRole = useMemo(() => {
    const selectedOrganisationId = normalizeText(selectedPartner?.id)
    if (!selectedOrganisationId) return {}
    return getOperationalRoutingControlsForPartnerType(selectedPartner?.type).reduce((accumulator, control) => {
      const rule = preferredRoutingRuleByPartnerOrgRoleKey.get(createPartnerRoleKey(selectedOrganisationId, control.roleType))
      if (rule) {
        accumulator[control.roleType] = rule
      }
      return accumulator
    }, {})
  }, [preferredRoutingRuleByPartnerOrgRoleKey, selectedPartner?.id, selectedPartner?.type])

  const selectedPartnerPeople = useMemo(
    () => partnerPeopleByRelationshipId[normalizeText(selectedRelationship?.id || selectedPartner?.id || '')] || [],
    [partnerPeopleByRelationshipId, selectedPartner?.id, selectedRelationship?.id],
  )
  const selectedPartnerPeopleMeta = useMemo(
    () => partnerPeopleMetaByRelationshipId[normalizeText(selectedRelationship?.id || selectedPartner?.id || '')] || null,
    [partnerPeopleMetaByRelationshipId, selectedPartner?.id, selectedRelationship?.id],
  )
  const selectedPartnerProfileContent = useMemo(() => getPartnerProfileContent(selectedPartner), [selectedPartner])
  const selectedPartnerAboutCompany = selectedPartnerProfileContent.aboutCompany || buildPartnerOverviewCopy(selectedPartner)
  const selectedPartnerServiceDelivery = selectedPartnerProfileContent.serviceDelivery || buildPartnerServiceDeliveryCopy(selectedPartner)
  const selectedVisiblePerson = useMemo(() => {
    if (!selectedVisiblePersonId) {
      return selectedPartnerPeople[0] || null
    }
    return selectedPartnerPeople.find((person) => normalizeText(person.userId || person.id) === normalizeText(selectedVisiblePersonId)) || selectedPartnerPeople[0] || null
  }, [selectedPartnerPeople, selectedVisiblePersonId])
  const relationshipListingsCacheKey = normalizeText(selectedRelationship?.id || selectedPartner?.id || '')
  const selectedPartnerListings = useMemo(
    () => partnerListingsByRelationshipId[relationshipListingsCacheKey] || [],
    [partnerListingsByRelationshipId, relationshipListingsCacheKey],
  )
  const selectedPartnerListingsMeta = useMemo(
    () => partnerListingsMetaByRelationshipId[relationshipListingsCacheKey] || null,
    [partnerListingsMetaByRelationshipId, relationshipListingsCacheKey],
  )
  const selectedVisiblePersonRole = normalizeLower(selectedVisiblePerson?.role || selectedVisiblePerson?.organisationRole || selectedVisiblePerson?.title)
  const selectedVisiblePersonListings = useMemo(() => {
    const activePersonName = normalizeLower(selectedVisiblePerson?.label || selectedVisiblePerson?.fullName || selectedVisiblePerson?.name)
    if (!activePersonName) return selectedPartnerListings
    const filtered = selectedPartnerListings.filter((listing) => {
      const listingAgentName = normalizeLower(listing.agentName)
      if (!listingAgentName) return false
      return listingAgentName.includes(activePersonName) || activePersonName.includes(listingAgentName)
    })
    return filtered.length ? filtered : selectedPartnerListings
  }, [selectedPartnerListings, selectedVisiblePerson?.fullName, selectedVisiblePerson?.label, selectedVisiblePerson?.name])
  const shouldShowCurrentListings = Boolean(selectedVisiblePerson) && (
    getPartnerProfileKind(selectedPartner?.type) === 'agency' ||
    selectedVisiblePersonRole.includes('agent') ||
    Boolean(selectedPartnerListingsMeta?.loading) ||
    selectedPartnerListings.length > 0
  )
  const isPartnerProfilePage = Boolean(normalizeText(partnerId)) && !isBondPartnersRoute

  async function handleInvite(event) {
    event.preventDefault()

    const email = normalizeText(inviteEmail).toLowerCase()
    const targetId = selectedInviteOrganisation?.id || ''

    if (!targetId && !email) {
      setError('Choose an organisation or enter a destination email.')
      return
    }

    try {
      setError('')
      setMessage('')
      const scope = selectedInviteScope
      const resolvedScopeId = inviteScopeNeedsTarget ? normalizeText(inviteScopeTargetId) : scope.scopeId
      if (inviteScopeNeedsTarget && !resolvedScopeId) {
        setError('Enter the region, branch, or team target id before sending this scoped invite.')
        return
      }
      await createPartnerInvitation({
        organisationId,
        organisationName: organisation?.name,
        recipientEmail: email,
        recipientOrganisationId: targetId,
        recipientOrganisationName: selectedInviteOrganisation?.name || '',
        toWorkspaceType: selectedInviteOrganisation?.type || inviteType,
        message: inviteNote,
        userId: profile?.id || '',
        workspaceType: resolvedWorkspaceType,
        scopeType: scope.scopeType,
        scopeId: resolvedScopeId,
        scopeName: inviteScopeNeedsTarget ? normalizeText(inviteScopeTargetName) || scope.label : scope.label,
        preferred: invitePreferred,
      })
      await recordWorkspaceAuditEvent('partner_invite_sent', {
        userId: profile?.id || '',
        workspaceId: organisationId,
        metadata: { recipientEmail: email, recipientOrganisationId: targetId },
      })
      setInviteEmail('')
      setInviteOrganisationQuery('')
      setSelectedInviteOrganisationId('')
      setInviteType('agency')
      setInviteNote('')
      setInviteScopeTargetId('')
      setInviteScopeTargetName('')
      setInvitePreferred(false)
      setMessage('Partner invitation sent.')
      setIsInviteModalOpen(false)
      await loadSnapshot()
    } catch (inviteError) {
      setError(inviteError?.message || 'Unable to send partner invitation.')
    }
  }

  async function handleConnect(partner) {
    const partnerKey = normalizeText(partner?.id)
    if (
      !partnerKey ||
      connectingPartnerIdsRef.current.has(partnerKey) ||
      sentConnectionPartnerIds.has(partnerKey) ||
      pendingSentConnectionPartnerIds.has(partnerKey)
    ) return
    connectingPartnerIdsRef.current.add(partnerKey)
    setConnectingPartnerIds((previous) => new Set(previous).add(partnerKey))
    try {
      setError('')
      setMessage('')
      const resolvedScopeId = selectedInviteScope.requiresTarget ? normalizeText(inviteScopeTargetId) : selectedInviteScope.scopeId
      if (selectedInviteScope.requiresTarget && !resolvedScopeId) {
        setError('Enter the region, branch, or team target id before requesting this scoped connection.')
        return
      }
      await createPartnerInvitation({
        organisationId,
        organisationName: organisation?.name,
        recipientEmail: '',
        recipientOrganisationId: partner.id,
        toWorkspaceType: partner.type,
        recipientOrganisationName: partner.name,
        userId: profile?.id || '',
        workspaceType: resolvedWorkspaceType,
        scopeType: selectedInviteScope.scopeType,
        scopeId: resolvedScopeId,
        scopeName: selectedInviteScope.requiresTarget ? normalizeText(inviteScopeTargetName) || selectedInviteScope.label : selectedInviteScope.label,
        preferred: invitePreferred,
      })
      await recordWorkspaceAuditEvent('partner_connection_requested', {
        userId: profile?.id || '',
        workspaceId: organisationId,
        targetType: 'organisation',
        targetId: partner.id,
        metadata: { partnerType: partner.type },
      })
      setMessage(`Partner invitation sent to ${partner.name}.`)
      setSentConnectionPartnerIds((previous) => new Set(previous).add(partnerKey))
      await loadSnapshot()
    } catch (connectError) {
      setError(connectError?.message || 'Unable to request partner connection.')
    } finally {
      setConnectingPartnerIds((previous) => {
        const next = new Set(previous)
        next.delete(partnerKey)
        return next
      })
      connectingPartnerIdsRef.current.delete(partnerKey)
    }
  }

  async function saveOperationalRoutingPreference(relationship, roleType, targetUserId) {
    const partnerOrganisationId = normalizeText(relationship?.partner?.id || relationship?.counterpartOrganisationId || relationship?.partnerOrganisationId)
    const normalizedRoleType = normalizeText(roleType)
    const normalizedTargetUserId = normalizeText(targetUserId)
    const roleKey = createPartnerRoleKey(partnerOrganisationId, normalizedRoleType)
    const existingRoutingRule = preferredRoutingRuleByPartnerOrgRoleKey.get(roleKey) || null
    const previousValue = normalizeText(
      existingRoutingRule?.targetConsultantUserId ||
        existingRoutingRule?.targetUserId ||
        existingRoutingRule?.target_user_id,
    )

    if (!relationship?.id || !partnerOrganisationId || !normalizedRoleType || !normalizedTargetUserId) {
      return
    }

    const person = selectedPartnerPeople.find((item) => normalizeText(item.userId || item.id) === normalizedTargetUserId) || null
    const personName = normalizeText(person?.label || person?.fullName || person?.name || person?.email)
    if (!personName) {
      setError('Unable to save this preference because the selected person is not available.')
      return
    }

    try {
      setError('')
      setRoutingSelectionValues((previous) => ({
        ...previous,
        [roleKey]: normalizedTargetUserId,
      }))
      setSavingRoutingRoleKeys((previous) => new Set(previous).add(roleKey))

      const saved = await upsertPartnerRoutingRule({
        id: existingRoutingRule?.id,
        sourceOrganisationId: organisationId,
        sourceUserId: profile?.id || '',
        scope: 'agent',
        ruleName: `${getRoutingRoleLabel(normalizedRoleType)} · ${relationship.partner?.name || 'Partner'}`,
        targetOrganisationId: partnerOrganisationId,
        targetScopeType: PARTNER_ROUTING_TARGET_TYPES.consultant,
        targetScopeId: normalizedTargetUserId,
        targetUserId: normalizedTargetUserId,
        targetConsultantUserId: normalizedTargetUserId,
        targetRoleType: normalizedRoleType,
        targetScopeName: personName,
        assignmentMode: getRoutingAssignmentModeForRole(normalizedRoleType),
        assignmentPriority: 1,
        isActive: true,
        isDefault: true,
        notes: `Operational partner preference saved from Agent Partner Profile for ${relationship.partner?.name || 'partner organisation'}.`,
      })

      if (saved?.id) {
        setPreferredRoutingRules((previous) => {
          const next = previous.filter((rule) => {
            const existingKey = createPartnerRoleKey(
              normalizeText(rule.targetOrganisationId || rule.target_organisation_id),
              normalizeText(rule.targetRoleType || rule.target_role_type),
            )
            return existingKey !== roleKey && String(rule.id) !== String(saved.id)
          })
          return [...next, saved]
        })
      }

      setMessage(`${personName} is now your ${getRoutingRoleLabel(normalizedRoleType).toLowerCase()} at ${relationship.partner?.name || 'this partner organisation'}.`)

      await recordWorkspaceAuditEvent('partner_preferred_status_changed', {
        userId: profile?.id || '',
        workspaceId: organisationId,
        targetType: 'partner_relationship',
        targetId: relationship.id,
        metadata: {
          roleType: normalizedRoleType,
          targetOrganisationId: partnerOrganisationId,
          targetUserId: normalizedTargetUserId,
          preferred: true,
          source: 'partner_routing_rules',
        },
      })
    } catch (updateError) {
      setRoutingSelectionValues((previous) => ({
        ...previous,
        [roleKey]: previousValue,
      }))
      setError(updateError?.message || 'Unable to save the operational routing preference.')
    } finally {
      setSavingRoutingRoleKeys((previous) => {
        const next = new Set(previous)
        next.delete(roleKey)
        return next
      })
    }
  }

  function handleOpenPartnerProfile(relationship = null, explicitPartner = null) {
    const partnerOrganisationId = normalizeText(
      explicitPartner?.id || relationship?.partner?.id || relationship?.counterpartOrganisationId || relationship?.partnerOrganisationId,
    )
    if (!partnerOrganisationId) {
      setError('Unable to open this partner profile.')
      return
    }

    if (isBondPartnersRoute && isUuidLike(relationship?.id)) {
      navigate(`/bond/partners/${relationship.id}`)
      return
    }

    navigate(`/partners/${partnerOrganisationId}`)
  }

  async function handleAcceptInvitation(invitation) {
    try {
      setError('')
      await acceptPartnerInvitation({
        invitationId: invitation.id,
        organisationId,
        userId: profile?.id || '',
        workspaceType: resolvedWorkspaceType,
      })
      setMessage('Partner connection accepted')
      await loadSnapshot()
    } catch (acceptError) {
      setError(acceptError?.message || 'Unable to accept partner invitation.')
    }
  }

  async function handleDeclineInvitation(invitation) {
    try {
      setError('')
      await declinePartnerInvitation({
        invitationId: invitation.id,
        organisationId,
        userId: profile?.id || '',
        workspaceType: resolvedWorkspaceType,
      })
      setMessage('Partner invitation declined')
      await loadSnapshot()
    } catch (declineError) {
      setError(declineError?.message || 'Unable to decline partner invitation.')
    }
  }

  function selectInviteOrganisation(nextId) {
    setSelectedInviteOrganisationId(nextId)
    const nextOrganisation = (snapshot?.organisations || []).find((item) => item.id === nextId)
    setInviteOrganisationQuery(nextOrganisation?.name || '')
  }

  const ensurePartnerPeople = useCallback(async (partnerOrganisationId = '', relationshipId = '') => {
    const safeRelationshipId = normalizeText(relationshipId)
    const safePartnerOrganisationId = normalizeText(partnerOrganisationId)
    const cacheKey = safeRelationshipId || safePartnerOrganisationId
    if (!cacheKey) return []
    const existing = partnerPeopleByRelationshipId[cacheKey]
    if (Array.isArray(existing)) return existing

    try {
      setPartnerPeopleMetaByRelationshipId((previous) => ({
        ...previous,
        [cacheKey]: {
          ...(previous[cacheKey] || {}),
          loading: true,
          message: '',
        },
      }))
      const payload = await fetchPartnerOperationalPeople(safePartnerOrganisationId, safeRelationshipId)
      const people = Array.isArray(payload?.people)
        ? payload.people.map((person) => ({
            ...person,
            id: normalizeText(person.userId || person.id),
            userId: normalizeText(person.userId || person.id),
            role: normalizeText(person.role),
            label:
              normalizeText(person.label || person.fullName || person.name) ||
              normalizeText(person.email) ||
              'Partner user',
            branchId: normalizeText(person.branchId || person.branch_id),
            branchName: normalizeText(person.branchName || person.branch_name),
            regionId: normalizeText(person.regionId || person.region_id),
            regionName: normalizeText(person.regionName || person.region_name),
            teamId: normalizeText(person.teamId || person.team_id),
            teamName: normalizeText(person.teamName || person.team_name),
            department: normalizeText(person.department),
            title: normalizeText(person.title || person.jobTitle || person.job_title),
          }))
        : []
      setPartnerPeopleByRelationshipId((previous) => ({
        ...previous,
        [cacheKey]: people,
      }))
      setPartnerPeopleMetaByRelationshipId((previous) => ({
        ...previous,
        [cacheKey]: {
          loading: false,
          message: normalizeText(payload?.message),
          source: normalizeText(payload?.source),
        },
      }))
      return people
    } catch {
      setPartnerPeopleByRelationshipId((previous) => ({
        ...previous,
        [cacheKey]: [],
      }))
      setPartnerPeopleMetaByRelationshipId((previous) => ({
        ...previous,
        [cacheKey]: {
          loading: false,
          message:
            'No operational people are visible for this organisation connection yet. Set visibility permissions to expose specific people to this partner relationship.',
          source: 'empty',
        },
      }))
      return []
    }
  }, [partnerPeopleByRelationshipId])

  const ensurePartnerListings = useCallback(async (relationshipId = '') => {
    const safeRelationshipId = normalizeText(relationshipId)
    if (!safeRelationshipId) return []
    const existing = partnerListingsByRelationshipId[safeRelationshipId]
    if (Array.isArray(existing)) return existing

    try {
      setPartnerListingsMetaByRelationshipId((previous) => ({
        ...previous,
        [safeRelationshipId]: {
          ...(previous[safeRelationshipId] || {}),
          loading: true,
          message: '',
        },
      }))
      const payload = await getBondPartnerListings(safeRelationshipId)
      const listings = Array.isArray(payload?.listings) ? payload.listings : []
      setPartnerListingsByRelationshipId((previous) => ({
        ...previous,
        [safeRelationshipId]: listings,
      }))
      setPartnerListingsMetaByRelationshipId((previous) => ({
        ...previous,
        [safeRelationshipId]: {
          loading: false,
          message: '',
          source: 'current_listings',
        },
      }))
      return listings
    } catch (listingsError) {
      setPartnerListingsByRelationshipId((previous) => ({
        ...previous,
        [safeRelationshipId]: [],
      }))
      setPartnerListingsMetaByRelationshipId((previous) => ({
        ...previous,
        [safeRelationshipId]: {
          loading: false,
          message: normalizeText(listingsError?.message) || 'No current listings are visible for this connection yet.',
          source: 'empty',
        },
      }))
      return []
    }
  }, [partnerListingsByRelationshipId])

  useEffect(() => {
    if (!profilePanelOpen) return
    const relationshipId = normalizeText(selectedRelationship?.id || '')
    const organisationTargetId = normalizeText(selectedPartner?.id)
    const cacheKey = relationshipId || organisationTargetId
    if (!cacheKey || partnerPeopleMetaByRelationshipId[cacheKey]?.loading || Array.isArray(partnerPeopleByRelationshipId[cacheKey])) return
    void ensurePartnerPeople(organisationTargetId, relationshipId)
  }, [ensurePartnerPeople, partnerPeopleByRelationshipId, partnerPeopleMetaByRelationshipId, profilePanelOpen, selectedPartner?.id, selectedRelationship?.id])

  useEffect(() => {
    if (!profilePanelOpen) return
    const relationshipId = normalizeText(selectedRelationship?.id || '')
    if (!relationshipId || partnerListingsMetaByRelationshipId[relationshipId]?.loading || Array.isArray(partnerListingsByRelationshipId[relationshipId])) return
    void ensurePartnerListings(relationshipId)
  }, [ensurePartnerListings, partnerListingsByRelationshipId, partnerListingsMetaByRelationshipId, profilePanelOpen, selectedRelationship?.id])

  useEffect(() => {
    if (!selectedPartnerPeople.length) {
      setSelectedVisiblePersonId('')
      return
    }
    const currentId = normalizeText(selectedVisiblePersonId)
    const currentExists = selectedPartnerPeople.some((person) => normalizeText(person.userId || person.id) === currentId)
    if (currentExists) return
    const defaultPerson = selectedPartnerPeople.find((person) => normalizeLower(person.role || person.organisationRole || person.title).includes('agent')) || selectedPartnerPeople[0]
    setSelectedVisiblePersonId(normalizeText(defaultPerson?.userId || defaultPerson?.id))
  }, [selectedPartnerPeople, selectedVisiblePersonId])

  if (isPartnerProfilePage) {
    return (
      <PartnerOrganisationProfilePage
        organisation={organisation}
        workspace={workspace}
        selectedPartner={selectedPartner}
        selectedRelationship={selectedRelationship}
        partnerAboutCompany={selectedPartnerAboutCompany}
        partnerServiceDelivery={selectedPartnerServiceDelivery}
        partnerPeople={selectedPartnerPeople}
        partnerPeopleMessage={selectedPartnerPeopleMeta?.message || ''}
        partnerPeopleLoading={Boolean(selectedPartnerPeopleMeta?.loading || (!selectedPartnerPeopleMeta && !selectedPartnerPeople.length && !loading && !error))}
        routingRulesByRole={selectedPartnerRoutingRulesByRole}
        routingSelectionValues={routingSelectionValues}
        routingSavingRoleKeys={savingRoutingRoleKeys}
        onSelectRoutingPreference={(roleType, targetUserId) => saveOperationalRoutingPreference(selectedRelationship, roleType, targetUserId)}
        selectedVisiblePerson={selectedVisiblePerson}
        selectedVisiblePersonListings={selectedVisiblePersonListings}
        selectedPartnerListingsMeta={selectedPartnerListingsMeta}
        shouldShowCurrentListings={shouldShowCurrentListings}
        onSelectVisiblePerson={setSelectedVisiblePersonId}
        snapshot={snapshot}
        message={message}
        error={error}
        loading={loading}
        onBack={() => navigate('/partners')}
      />
    )
  }

  return (
    <div className="min-h-full bg-[#f6f8fb] pb-10 text-[#10243a]">
      <PartnerInviteModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onSubmit={handleInvite}
        inviteEmail={inviteEmail}
        setInviteEmail={setInviteEmail}
        inviteOrganisationQuery={inviteOrganisationQuery}
        setInviteOrganisationQuery={setInviteOrganisationQuery}
        selectedInviteOrganisation={selectedInviteOrganisation}
        inviteOrganisationResults={inviteOrganisationResults}
        selectedInviteOrganisationId={selectedInviteOrganisationId}
        setSelectedInviteOrganisationId={setSelectedInviteOrganisationId}
        inviteType={inviteType}
        setInviteType={setInviteType}
        inviteNote={inviteNote}
        setInviteNote={setInviteNote}
        inviteScopeValue={inviteScopeValue}
        setInviteScopeValue={setInviteScopeValue}
        inviteScopeTargetId={inviteScopeTargetId}
        setInviteScopeTargetId={setInviteScopeTargetId}
        inviteScopeTargetName={inviteScopeTargetName}
        setInviteScopeTargetName={setInviteScopeTargetName}
        invitePreferred={invitePreferred}
        setInvitePreferred={setInvitePreferred}
        inviteScopeNeedsTarget={inviteScopeNeedsTarget}
        selectedInviteScope={selectedInviteScope}
        allowedScopes={allowedScopes}
        selectInviteOrganisation={selectInviteOrganisation}
      />

      {snapshot?.source === 'demo' || error || message ? (
        <div className="mb-5 space-y-3">
          {snapshot?.source === 'demo' ? (
            <p className="rounded-[8px] border border-[#f0dfb8] bg-[#fff9ec] px-4 py-3 text-sm font-semibold text-[#8a5a12]">
              Demo partner data is shown until the Partners migration is available in this environment.
            </p>
          ) : null}
          {error ? <p className="rounded-[8px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-semibold text-[#b42318]">{error}</p> : null}
          {message ? <p className="rounded-[8px] border border-[#cfe8dc] bg-[#f1fbf6] px-4 py-3 text-sm font-semibold text-[#17613d]">{message}</p> : null}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Organisation Connections" value={formatNumber(metrics.activePartners)} subtext={`${formatNumber(metrics.preferredPartners)} marked preferred`} />
        <MetricCard label="Operational Partners" value={formatNumber(preferredPartnerRows.length)} subtext="Reusable people and organisation defaults" />
        <MetricCard label="Invite Acceptance" value={`${formatNumber(metrics.inviteAcceptanceRate)}%`} subtext={`${formatNumber(metrics.newPartnerGrowth)} new in 30 days`} />
      </section>

      <section className="mt-5 rounded-[24px] border border-[#d9e3ee] bg-[rgba(248,251,254,0.94)] p-3 shadow-[0_14px_28px_rgba(15,23,42,0.1)] backdrop-blur-md md:p-4">
        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_220px]">
          <nav className="grid gap-2 md:grid-cols-2 xl:grid-cols-4" role="tablist" aria-label="Partner workspace sections">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex min-h-[54px] w-full items-center justify-center rounded-[16px] border px-4 py-2.5 text-center text-sm font-semibold transition duration-150 ease-out ${
                  activeTab === tab.key
                    ? 'border-[#c8daef] bg-[#274c69] text-white shadow-[0_10px_22px_rgba(15,23,42,0.14)]'
                    : 'border-[#e5edf6] bg-white text-[#4f647a] hover:border-[#d2deea] hover:bg-[#f9fbfd]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => setIsInviteModalOpen(true)}
            className="inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[16px] border border-[#c8daef] bg-[#10243a] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(15,23,42,0.14)] transition hover:bg-[#173a5e] xl:min-w-[220px]"
          >
            <InviteIcon size={16} /> Invite Partner
          </button>
        </div>
      </section>

      {loading ? (
        <section className="mt-5 rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm font-semibold text-[#60758d]">
          Loading partner network...
        </section>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="min-w-0">
            {activeTab === 'connected' ? (
              <section>
                <div className="mb-4 flex flex-wrap gap-2">
                  <label className="relative min-w-0 flex-1">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ba0b8]" />
                    <input
                      value={directoryFilters.query}
                      onChange={(event) => setDirectoryFilters((previous) => ({ ...previous, query: event.target.value }))}
                      placeholder="Search organisation connections"
                      className="h-10 w-full rounded-[8px] border border-[#d7e2ee] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10"
                    />
                  </label>
                  <select
                    className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
                    value={directoryFilters.scope}
                    onChange={(event) => setDirectoryFilters((previous) => ({ ...previous, scope: event.target.value }))}
                  >
                    <option value="all">All scopes</option>
                    {PARTNER_SCOPE_TYPES.map((scopeType) => (
                      <option key={scopeType} value={scopeType}>
                        {PARTNER_SCOPE_LABELS[scopeType]}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
                    value={directoryFilters.type}
                    onChange={(event) => setDirectoryFilters((previous) => ({ ...previous, type: event.target.value }))}
                  >
                    <option value="">All types</option>
                    {PARTNER_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <label className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm font-semibold text-[#35546c]">
                    <input
                      type="checkbox"
                      checked={directoryFilters.preferredOnly}
                      onChange={(event) => setDirectoryFilters((previous) => ({ ...previous, preferredOnly: event.target.checked }))}
                      className="h-4 w-4 rounded border-[#c8d6e5] text-[#10243a]"
                    />
                    Operational only
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {visibleConnectedRelationships.map((relationship) => {
                    const partnerOrganisationId = normalizeText(relationship.partner?.id || relationship.counterpartOrganisationId || relationship.partnerOrganisationId)
                    const existingPreferredRule = preferredRoutingRuleByPartnerOrgId.get(partnerOrganisationId)
                    const isPreferred = Boolean(relationship.preferred || relationship.relationshipType === 'preferred' || existingPreferredRule)
                    const isSelected = profilePanelOpen && normalizeText(selectedPartner?.id) === partnerOrganisationId
                    return (
                      <PartnerCard
                        key={relationship.id}
                        partner={relationship.partner}
                        relationship={{ ...relationship, preferred: isPreferred, relationshipType: isPreferred ? 'preferred' : relationship.relationshipType }}
                        onProfileClick={() => handleOpenPartnerProfile(relationship)}
                        selected={isSelected}
                      />
                    )
                  })}
                </div>
                {connectedRelationships.length === 0 ? (
                  <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">No organisation connections yet</div>
                ) : null}
                {connectedRelationships.length && !visibleConnectedRelationships.length ? (
                  <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">No partners match the selected filters</div>
                ) : null}
              </section>
            ) : null}

            {activeTab === 'preferred' ? (
              <section className="space-y-4">
                <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-4">
                  <p className="text-sm font-semibold text-[#10243a]">Operational Partners</p>
                  <p className="mt-1 text-sm leading-6 text-[#60758d]">
                    These are reusable preferences for the people or organisations you normally work with. Transaction collaborators can still be invited directly on a deal without an organisation connection.
                  </p>
                </div>

                {!preferredPartnerRows.length ? (
                  <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">
                    No operational partners have been set yet.
                  </div>
                ) : (
                  (() => {
                    const groups = preferredPartnerRows.reduce((accumulator, row) => {
                      const key = row.groupLabel || 'Other Partners'
                      if (!accumulator[key]) accumulator[key] = []
                      accumulator[key].push(row)
                      return accumulator
                    }, {})

                    return Object.entries(groups).map(([groupName, rows]) => (
                      <div key={groupName} className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8ba5]">{groupName}</h3>
                        <div className="grid gap-4 md:grid-cols-2">
                          {rows.map((row) => (
                            <article key={row.id} className="rounded-[8px] border border-[#dbe5f0] bg-white p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-[#10243a]">{row.personName}</p>
                                  <p className="mt-1 text-sm text-[#60758d]">{row.organisationName}</p>
                                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-[#8ba0b8]">{row.contactPerson ? 'Preferred contact' : 'Preferred partner'}</p>
                                </div>
                                <button
                                  type="button"
                                  disabled={!row.relationship}
                                  onClick={() => row.relationship && handleOpenPartnerProfile(row.relationship)}
                                  className={`inline-flex h-9 items-center gap-2 rounded-[8px] border px-3 text-sm font-semibold transition ${
                                    row.relationship && profilePanelOpen && normalizeText(selectedPartner?.id) === normalizeText(row.organisationId)
                                      ? 'border-[#c8daef] bg-[#10243a] text-white'
                                      : 'border-[#d9e4ef] bg-white text-[#264563] hover:bg-[#f8fafc]'
                                  }`}
                                >
                                  {row.relationship && profilePanelOpen && normalizeText(selectedPartner?.id) === normalizeText(row.organisationId) ? 'Viewing' : 'View profile'}
                                  {!(row.relationship && profilePanelOpen && normalizeText(selectedPartner?.id) === normalizeText(row.organisationId)) ? <ArrowUpRight size={14} /> : null}
                                </button>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {row.contactPerson ? (
                                  <span className="inline-flex rounded-full border border-[#d8eefe] bg-[#f4f9ff] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#1e4d82]">
                                    {row.contactPerson}
                                  </span>
                                ) : (
                                  <span className="inline-flex rounded-full border border-[#d8eefe] bg-[#f4f9ff] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#1e4d82]">
                                    Organisation default
                                  </span>
                                )}
                                {row.email ? (
                                  <span className="inline-flex rounded-full border border-[#e4ebf4] bg-[#f8fafc] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#52677f]">
                                    {row.email}
                                  </span>
                                ) : null}
                              </div>
                            </article>
                          ))}
                        </div>
                      </div>
                    ))
                  })()
                )}
              </section>
            ) : null}

            {activeTab === 'invitations' ? (
              <section className="space-y-3">
                <div className="mb-4 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <ToolbarFilterPills
                      ariaLabel="Invitation direction filter"
                      value={invitationFilters.direction}
                      options={INVITATION_DIRECTION_OPTIONS}
                      onChange={(value) => setInvitationFilters((previous) => ({ ...previous, direction: value }))}
                    />
                    <ToolbarFilterPills
                      ariaLabel="Invitation status filter"
                      value={invitationFilters.status}
                      options={INVITATION_STATUS_OPTIONS}
                      onChange={(value) => setInvitationFilters((previous) => ({ ...previous, status: value }))}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="relative min-w-0 flex-1">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ba0b8]" />
                      <input
                        value={invitationFilters.query}
                        onChange={(event) => setInvitationFilters((previous) => ({ ...previous, query: event.target.value }))}
                        placeholder="Search invitations"
                        className="h-10 w-full rounded-[8px] border border-[#d7e2ee] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10"
                      />
                    </label>
                    <select
                      className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
                      value={invitationFilters.type}
                      onChange={(event) => setInvitationFilters((previous) => ({ ...previous, type: event.target.value }))}
                    >
                      <option value="">All partner types</option>
                      {PARTNER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                  </div>
                </div>

                {filteredInvitations.map((invitation) => {
                  const isReceived = normalizeLower(invitation.toOrganisationId) === normalizeLower(organisationId)
                  const status = normalizeLower(invitation.status) || 'pending'
                  const organisationName = invitationPartnerName(invitation, organisationId)
                  const organisationType = invitationPartnerType(invitation, organisationId)
                  return (
                    <div
                      key={invitation.id}
                      className="rounded-[8px] border border-[#dbe5f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <PartnerLogo partner={{ name: organisationName }} />
                          <div>
                            <p className="font-semibold text-[#10243a]">{organisationName}</p>
                            <p className="text-sm text-[#60758d]">{organisationType}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <StatusBadge className={isReceived ? 'border-[#d9e7ff] bg-[#f3f7ff] text-[#1e4d82]' : 'border-[#e4ebf4] bg-[#f8fafc] text-[#52677f]'}>
                                {isReceived ? 'Received' : 'Sent'}
                              </StatusBadge>
                              <PartnerScopeBadge relationship={invitation} />
                              {invitation.preferred ? <StatusBadge className={relationshipBadgeClass('preferred')}>Preferred</StatusBadge> : null}
                            </div>
                            <p className="mt-2 text-sm text-[#40556c]">{invitation.message || 'Wants to connect with your organisation.'}</p>
                            <p className="mt-1 text-xs text-[#6f7f95]">Sent {formatDate(invitation.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <StatusBadge className={statusBadgeClass(status)}>{status}</StatusBadge>
                          {isReceived && status === 'pending' ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleAcceptInvitation(invitation)}
                                className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[#10243a] px-4 text-sm font-semibold text-white transition hover:bg-[#173a5e]"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeclineInvitation(invitation)}
                                className="inline-flex h-10 items-center justify-center rounded-[8px] border border-[#d7e2ee] bg-white px-4 text-sm font-semibold text-[#35546c] transition hover:bg-[#f8fafc]"
                              >
                                Decline
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {!filteredInvitations.length ? <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">No invitations found</div> : null}
              </section>
            ) : null}

            {activeTab === 'discover' ? (
              <section>
                <div className="mb-4 flex flex-wrap gap-2">
                  <label className="relative min-w-0 flex-1">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ba0b8]" />
                    <input
                      value={discoverFilters.query}
                      onChange={(event) => setDiscoverFilters((previous) => ({ ...previous, query: event.target.value }))}
                      placeholder="Search firms"
                      className="h-10 w-full rounded-[8px] border border-[#d7e2ee] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10"
                    />
                  </label>
                  <select
                    className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
                    value={discoverFilters.type}
                    onChange={(event) => setDiscoverFilters((previous) => ({ ...previous, type: event.target.value }))}
                  >
                    <option value="">All types</option>
                    {PARTNER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                  <select
                    className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
                    value={discoverFilters.province}
                    onChange={(event) => setDiscoverFilters((previous) => ({ ...previous, province: event.target.value }))}
                  >
                    <option value="">All areas</option>
                    {PARTNER_PROVINCES.map((province) => <option key={province} value={province}>{province}</option>)}
                  </select>
                  <label className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm font-semibold text-[#35546c]">
                    <input
                      type="checkbox"
                      checked={discoverFilters.preferredOnly}
                      onChange={(event) => setDiscoverFilters((previous) => ({ ...previous, preferredOnly: event.target.checked }))}
                      className="h-4 w-4 rounded border-[#c8d6e5] text-[#10243a]"
                    />
                    Preferred only
                  </label>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {discoverablePartners.map((partner) => (
                    <PartnerCard
                      key={partner.id}
                      partner={partner}
                      onProfileClick={() => handleOpenPartnerProfile(null, partner)}
                      selected={profilePanelOpen && normalizeText(selectedPartner?.id) === normalizeText(partner.id)}
                      action={() => handleConnect(partner)}
                      actionDisabled={connectingPartnerIds.has(partner.id) || sentConnectionPartnerIds.has(partner.id) || pendingSentConnectionPartnerIds.has(partner.id)}
                      actionLabel={
                        connectingPartnerIds.has(partner.id)
                          ? 'Sending...'
                          : sentConnectionPartnerIds.has(partner.id) || pendingSentConnectionPartnerIds.has(partner.id)
                            ? 'Invitation sent'
                            : 'Connect'
                      }
                    />
                  ))}
                </div>
                {discoverDirectoryLoading && !snapshot?.directoryHydrated ? (
                  <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">Loading discoverable partners...</div>
                ) : null}
                {!discoverDirectoryLoading && !discoverablePartners.length ? (
                  <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">No organisations found</div>
                ) : null}
              </section>
            ) : null}

          </main>

          <div ref={profilePanelRef} className="space-y-5 scroll-mt-4">
            <ProfilePanel
              isOpen={profilePanelOpen}
              partner={profilePanelOpen ? selectedPartner : null}
              relationship={profilePanelOpen ? selectedRelationship : null}
              people={profilePanelOpen ? selectedPartnerPeople : []}
              peopleLoading={Boolean(selectedPartnerPeopleMeta?.loading)}
              peopleMessage={selectedPartnerPeopleMeta?.message || ''}
              routingRulesByRole={selectedPartnerRoutingRulesByRole}
              routingSelectionValues={routingSelectionValues}
              routingSavingRoleKeys={savingRoutingRoleKeys}
              onSelectRoutingPreference={
                selectedRelationship
                  ? (roleType, targetUserId) => saveOperationalRoutingPreference(selectedRelationship, roleType, targetUserId)
                  : null
              }
            />
            <section className="rounded-[8px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#10243a]">
                <Network size={16} /> Collaboration model
              </div>
              <div className="mt-4 space-y-3 text-sm text-[#40556c]">
                <p className="flex items-center gap-2"><CheckCircle2 size={15} className="text-[#17613d]" /> Organisation connections are reusable company relationships</p>
                <p className="flex items-center gap-2"><CheckCircle2 size={15} className="text-[#17613d]" /> Operational partners are preferred people for repeat work</p>
                <p className="flex items-center gap-2"><LockKeyhole size={15} className="text-[#52677f]" /> Shared transactions can include invited collaborators without a formal connection</p>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
