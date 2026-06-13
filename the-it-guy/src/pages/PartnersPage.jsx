import {
  ArrowUpRight,
  CheckCircle2,
  LockKeyhole,
  Network,
  Route,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
  UserPlus as InviteIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useOrganisation } from '../context/OrganisationContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../lib/organisationAccess'
import {
  acceptPartnerInvitation,
  canConnectPartnerTypes,
  createPartnerInvitation,
  declinePartnerInvitation,
  filterPartnerRelationshipsByScope,
  filterDiscoverablePartners,
  getAllowedPartnerScopes,
  getPartnerAssignmentOptions,
  getPartnerScopeBadge,
  getPartnerTypeLabel,
  PARTNER_PROVINCES,
  PARTNER_SCOPE_LABELS,
  PARTNER_SCOPE_TYPES,
  PARTNER_TYPES,
  fetchPartnersSnapshot,
  fetchDiscoverablePartnerDirectory,
  updatePartnerRelationshipStatus,
} from '../lib/partnersRepository'
import {
  listOrganisationPartnerRoutingRules,
  listUserPreferredPartnerRoutingRules,
  removeOrganisationPartnerRoutingRule,
  saveOrganisationPartnerRoutingRule,
} from '../lib/settingsApi'
import { recordWorkspaceAuditEvent } from '../services/auditLogService'
import { getWorkspaceHierarchy } from '../services/bondWorkspaceHierarchyService'
import { getBondPartnerPeople } from '../services/bondPartnerProfileService'
import { buildPartnerNetworkIntelligence } from '../services/partnerNetworkIntelligenceService'
import { PARTNER_ROUTING_MODES, PARTNER_ROUTING_ROLE_TYPE_OPTIONS, PARTNER_ROUTING_ROLE_TYPES, PARTNER_ROUTING_SOURCE_TYPES, PARTNER_ROUTING_TARGET_TYPES } from '../constants/bondRoutingContract'
import OrganisationAvatar from '../components/organisation/OrganisationAvatar'
import PartnerNetworkIntelligencePanel from '../components/partner-network/PartnerNetworkIntelligencePanel'

const TABS = [
  { key: 'connected', label: 'Connected Partners' },
  { key: 'preferred', label: 'My Preferred Partners' },
  { key: 'defaults', label: 'Default Routing' },
  { key: 'network', label: 'Network Intelligence' },
  { key: 'invitations', label: 'Invitations' },
  { key: 'discover', label: 'Discover Partners' },
  { key: 'referrals', label: 'Referrals & Opportunities' },
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

function formatCurrency(value) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function formatDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function formatDateTime(value) {
  if (!value) return 'Not updated'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not updated'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
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

function parseScopeValue(value = '') {
  const [scopeType = 'organisation', ...rest] = String(value || '').split(':')
  return {
    scopeType,
    scopeId: rest.join(':'),
  }
}

function getDefaultRoutingScopeOptions(organisationId = '', hierarchy = {}) {
  const regionOptions = Array.isArray(hierarchy.regions)
    ? hierarchy.regions.map((region) => ({
        value: `${PARTNER_ROUTING_SOURCE_TYPES.region}:${region.id}`,
        label: `Region: ${region.name || region.code || region.id}`,
        requiresTarget: false,
        scopeId: region.id,
        scopeName: region.name || region.code || region.id,
      }))
    : []
  const unitOptions = Array.isArray(hierarchy.units)
    ? hierarchy.units.flatMap((unit) => {
        const unitType = normalizeLower(unit.unit_type || unit.unitType || unit.type || '')
        if (unitType === 'team') {
          return [{
            value: `${PARTNER_ROUTING_SOURCE_TYPES.team}:${unit.id}`,
            label: `Team: ${unit.name || unit.code || unit.id}`,
            requiresTarget: false,
            scopeId: unit.id,
            scopeName: unit.name || unit.code || unit.id,
          }]
        }
        return [{
          value: `${PARTNER_ROUTING_SOURCE_TYPES.branch}:${unit.id}`,
          label: `Branch: ${unit.name || unit.code || unit.id}`,
          requiresTarget: false,
          scopeId: unit.id,
          scopeName: unit.name || unit.code || unit.id,
        }]
      })
    : []
  return [
    { value: PARTNER_ROUTING_SOURCE_TYPES.organisation, label: 'Organisation', requiresTarget: false, scopeId: organisationId, scopeName: 'Organisation' },
    ...regionOptions,
    ...unitOptions,
  ]
}

function getRoutingModeForDefaultRole(roleType = '', hasPerson = false) {
  if (!hasPerson) return PARTNER_ROUTING_MODES.organisationQueue
  if (roleType === PARTNER_ROUTING_ROLE_TYPES.agent) return PARTNER_ROUTING_MODES.directAgent
  if (roleType === PARTNER_ROUTING_ROLE_TYPES.transferAttorney || roleType === PARTNER_ROUTING_ROLE_TYPES.bondAttorney || roleType === PARTNER_ROUTING_ROLE_TYPES.cancellationAttorney) {
    return PARTNER_ROUTING_MODES.directAttorney
  }
  return PARTNER_ROUTING_MODES.directConsultant
}

function personMatchesDefaultRole(person = {}, roleType = '') {
  const normalizedRole = normalizeLower(person?.role || person?.organisationRole)
  if (!roleType) return true
  if (roleType === PARTNER_ROUTING_ROLE_TYPES.agent) return normalizedRole === 'agent'
  if (roleType === PARTNER_ROUTING_ROLE_TYPES.transferAttorney) return ['transfer_attorney', 'attorney', 'conveyancer'].includes(normalizedRole)
  if (roleType === PARTNER_ROUTING_ROLE_TYPES.bondAttorney) return ['bond_attorney', 'attorney'].includes(normalizedRole)
  if (roleType === PARTNER_ROUTING_ROLE_TYPES.cancellationAttorney) return ['cancellation_attorney', 'attorney'].includes(normalizedRole)
  if (roleType === PARTNER_ROUTING_ROLE_TYPES.developer || roleType === PARTNER_ROUTING_ROLE_TYPES.developerContact) return ['developer', 'developer_contact'].includes(normalizedRole)
  return ['bond_originator', 'consultant', 'bond_consultant', 'processor', 'bond_processor', 'principal', 'director', 'manager', 'branch_manager', 'regional_manager', 'hq_manager'].includes(normalizedRole)
}

function normalizeDefaultRoutingPeople(payload = {}) {
  const groups = payload?.groups || {}
  const mapPerson = (person = {}, fallbackRole = '') => ({
    ...person,
    id: normalizeText(person.userId || person.id),
    userId: normalizeText(person.userId || person.id),
    role: normalizeText(person.role || fallbackRole),
    label: [person.firstName, person.lastName].map(normalizeText).filter(Boolean).join(' ') || person.name || person.email || person.id || 'Unknown person',
    branchId: normalizeText(person.branchId || person.branch_id),
    branchName: normalizeText(person.branchName || person.branch_name),
    regionId: normalizeText(person.regionId || person.region_id),
    regionName: normalizeText(person.regionName || person.region_name),
    teamId: normalizeText(person.teamId || person.team_id),
    teamName: normalizeText(person.teamName || person.team_name),
    department: normalizeText(person.department),
    title: normalizeText(person.title || person.jobTitle || person.job_title),
  })
  return [
    ...(Array.isArray(groups.principal) ? groups.principal.map((person) => mapPerson(person, 'principal')) : []),
    ...(Array.isArray(groups.branchManagers) ? groups.branchManagers.map((person) => mapPerson(person, 'branch_manager')) : []),
    ...(Array.isArray(groups.agents) ? groups.agents.map((person) => mapPerson(person, 'agent')) : []),
  ]
}

const DEFAULT_ROUTING_MANAGER_ROLES = new Set([
  'principal',
  'owner',
  'director',
  'partner',
  'manager',
  'branch_manager',
  'regional_manager',
  'team_lead',
  'hq_manager',
  'admin',
  'admin_staff',
])

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

function PartnerCard({ partner, relationship, action, actionLabel, actionDisabled = false, profileHref = '', muted = false }) {
  const isPreferred = Boolean(relationship?.preferred || relationship?.relationshipType === 'preferred')
  const statusLabel = relationship?.relationshipStatus || 'Pending'
  const typeLabel = getPartnerTypeLabel(partner?.type)
  const location = [partner?.city, partner?.province].filter(Boolean).join(', ') || 'Location pending'

  return (
    <article className={`rounded-[8px] border border-[#dbe5f0] bg-white p-4 ${muted ? 'opacity-75' : ''}`}>
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

      {relationship ? (
        <div className="mt-3 grid grid-cols-2 gap-2 text-left sm:grid-cols-3">
          <div className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-2">
            <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8ba0b8]">Shared Deals</span>
            <strong className="mt-1 block text-sm text-[#10243a]">{formatNumber(partner?.transactionStats?.activeTransactions)}</strong>
          </div>
          <div className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-2">
            <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8ba0b8]">Avg Response</span>
            <strong className="mt-1 block text-sm text-[#10243a]">{formatNumber(partner?.transactionStats?.responseTimeHours)}h</strong>
          </div>
          <div className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-2">
            <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8ba0b8]">Completion</span>
            <strong className="mt-1 block text-sm text-[#10243a]">{formatNumber(partner?.transactionStats?.avgDealSpeedDays)}d</strong>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-3">
        <Link
          to={profileHref || `/partners/${partner?.id || ''}`}
          className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#d9e4ef] bg-white px-3 text-sm font-semibold text-[#264563] transition hover:bg-[#f8fafc]"
        >
          Profile <ArrowUpRight size={14} />
        </Link>
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

function ProfilePanel({ partner, relationship, people = [], intelligence = null }) {
  if (!partner) {
    return (
      <aside className="rounded-[8px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <p className="text-sm font-semibold text-[#10243a]">Select a partner profile</p>
        <p className="mt-2 text-sm leading-6 text-[#60758d]">Profiles show operating areas, relationship status, shared visibility, staff directories, and performance signals.</p>
      </aside>
    )
  }

  const staff = Array.isArray(people) ? people : []
  const healthScore = Number(intelligence?.healthScore || 0)
  const healthLabel = intelligence?.healthLabel || (healthScore >= 80 ? 'Healthy' : healthScore >= 65 ? 'Watch' : healthScore >= 45 ? 'Inactive' : 'Dormant')

  return (
    <aside className="rounded-[8px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] xl:sticky xl:top-4">
      <div className="flex items-start gap-3">
        <PartnerLogo partner={partner} />
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-[#10243a]">{partner.name}</h2>
          <p className="text-sm text-[#60758d]">{getPartnerTypeLabel(partner.type)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {intelligence ? (
          <div className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Partner Health</p>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <strong className="block text-2xl font-semibold tracking-[-0.02em] text-[#10243a]">{healthScore}</strong>
                <p className="text-sm text-[#60758d]">{healthLabel}</p>
              </div>
              <div className="text-right text-xs text-[#60758d]">
                <p>{formatNumber(intelligence.transactionVolume || 0)} transactions</p>
                <p>{formatNumber(intelligence.referralCount || 0)} referrals</p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Overview</p>
          <p className="mt-2 text-sm leading-6 text-[#40556c]">
            Verified Bridge organisation operating in {[partner.city, partner.province].filter(Boolean).join(', ') || 'selected markets'} with a focus on {(partner.specialties || []).join(', ') || 'property transactions'}.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Active Deals" value={formatNumber(partner.transactionStats?.activeTransactions)} />
          <MetricCard label="Avg Speed" value={`${formatNumber(partner.transactionStats?.avgDealSpeedDays)}d`} />
        </div>
        <div className="rounded-[8px] border border-[#e4ebf4] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Active Areas</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(partner.activeAreas || []).map((area) => (
              <span key={area} className="rounded-full border border-[#e4ebf4] bg-[#f8fafc] px-2.5 py-1 text-xs font-semibold text-[#52677f]">{area}</span>
            ))}
          </div>
        </div>
        <div className="rounded-[8px] border border-[#e4ebf4] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Staff Directory</p>
          <div className="mt-3 space-y-2">
            {staff.length ? (
              staff.slice(0, 6).map((person) => (
                <div key={person.userId || person.id || person.name} className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-2.5">
                  <p className="text-sm font-semibold text-[#10243a]">{person.label || person.fullName || person.name || 'Partner user'}</p>
                  <p className="mt-1 text-xs text-[#60758d]">
                    {[person.role, person.branchName, person.regionName, person.teamName].filter(Boolean).join(' · ') || 'Visible through partner permissions'}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#60758d]">No approved staff has been loaded for this connection yet.</p>
            )}
          </div>
        </div>
        <div className="rounded-[8px] border border-[#e4ebf4] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Relationship Controls</p>
          <div className="mt-3 grid gap-2 text-sm text-[#40556c]">
            <p className="inline-flex items-center gap-2"><LockKeyhole size={15} className="text-[#52677f]" /> Listing visibility remains permission-gated.</p>
            <p className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-[#52677f]" /> Access is role-based and organisation-scoped.</p>
            <p className="inline-flex items-center gap-2"><Network size={15} className="text-[#52677f]" /> Status: {relationship?.relationshipStatus || 'Not connected'}</p>
            {relationship ? <p className="inline-flex items-center gap-2"><Network size={15} className="text-[#52677f]" /> {getPartnerScopeBadge(relationship).label}</p> : null}
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
  const { workspace, workspaceType, role, profile, currentMembership } = useWorkspace()
  const { organisation } = useOrganisation()
  const organisationId = organisation?.partnerOrganisationId || organisation?.organisationId || workspace?.organisationId || organisation?.id || workspace?.id || ''
  const resolvedWorkspaceType = organisation?.type || workspaceType || role

  const [activeTab, setActiveTab] = useState('connected')
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
  const [defaultRoutingRules, setDefaultRoutingRules] = useState([])
  const [workspaceHierarchy, setWorkspaceHierarchy] = useState({ regions: [], units: [] })
  const [defaultRoutingPeopleByRelationshipId, setDefaultRoutingPeopleByRelationshipId] = useState({})
  const [defaultRoutingLoadingRelationshipId, setDefaultRoutingLoadingRelationshipId] = useState('')
  const [savingDefaultRouting, setSavingDefaultRouting] = useState(false)
  const [editingDefaultRoutingId, setEditingDefaultRoutingId] = useState('')
  const connectingPartnerIdsRef = useRef(new Set())

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
  const [referralFilters, setReferralFilters] = useState({ query: '', status: 'all', dateRange: 'all' })
  const [defaultRoutingFilters, setDefaultRoutingFilters] = useState({
    scope: 'all',
    roleType: 'all',
    status: 'all',
    query: '',
  })
  const [networkSearchQuery, setNetworkSearchQuery] = useState('')
  const [defaultRoutingForm, setDefaultRoutingForm] = useState({
    ruleName: '',
    isActive: true,
    isDefault: true,
    assignmentPriority: 500,
    sourceScopeType: PARTNER_ROUTING_SOURCE_TYPES.organisation,
    sourceScopeId: '',
    targetRelationshipId: '',
    targetOrganisationId: '',
    targetRoleType: PARTNER_ROUTING_ROLE_TYPES.bondOriginator,
    targetUserId: '',
    targetScopeType: PARTNER_ROUTING_TARGET_TYPES.orgQueue,
    assignmentMode: PARTNER_ROUTING_MODES.organisationQueue,
    notes: '',
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
  const canManageDefaultRouting = useMemo(
    () =>
      DEFAULT_ROUTING_MANAGER_ROLES.has(
        normalizeOrganisationMembershipRole(currentMembership?.role || currentMembership?.workspaceRole || currentMembership?.organisationRole || 'viewer'),
      ) ||
      canManageOrganisationSettings({
        appRole: role,
        membershipRole: normalizeOrganisationMembershipRole(currentMembership?.role || currentMembership?.workspaceRole || currentMembership?.organisationRole || 'viewer'),
      }),
    [currentMembership?.organisationRole, currentMembership?.role, currentMembership?.workspaceRole, role],
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
  const defaultRoutingScopeOptions = useMemo(
    () => getDefaultRoutingScopeOptions(organisationId, workspaceHierarchy),
    [organisationId, workspaceHierarchy],
  )

  const loadSnapshot = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      setDiscoverDirectory([])
      const [nextSnapshot, nextPreferredRoutingRules, nextDefaultRoutingRules, nextHierarchy] = await Promise.all([
        fetchPartnersSnapshot({
          organisationId,
          workspaceType: resolvedWorkspaceType,
          accessContext,
          includeDirectory: false,
        }),
        listUserPreferredPartnerRoutingRules().catch(() => []),
        listOrganisationPartnerRoutingRules().catch(() => []),
        getWorkspaceHierarchy(organisationId).catch(() => ({ regions: [], units: [] })),
      ])
      setSnapshot(nextSnapshot)
      setPreferredRoutingRules(Array.isArray(nextPreferredRoutingRules) ? nextPreferredRoutingRules : [])
      setDefaultRoutingRules(Array.isArray(nextDefaultRoutingRules) ? nextDefaultRoutingRules : [])
      setWorkspaceHierarchy({
        regions: Array.isArray(nextHierarchy?.regions) ? nextHierarchy.regions : [],
        units: Array.isArray(nextHierarchy?.units) ? nextHierarchy.units : [],
      })
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load partner network.')
    } finally {
      setLoading(false)
    }
  }, [accessContext, organisationId, resolvedWorkspaceType])

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

  const connectedRelationshipById = useMemo(
    () =>
      new Map(
        connectedRelationships.map((relationship) => [
          normalizeText(relationship.id),
          relationship,
        ]),
      ),
    [connectedRelationships],
  )

  useEffect(() => {
    if (!['defaults', 'network'].includes(activeTab)) return
    const missingRelationships = connectedRelationships
      .filter((relationship) => relationship.relationshipStatus === 'accepted')
      .filter((relationship) => !defaultRoutingPeopleByRelationshipId[normalizeText(relationship.id || '')])
      .slice(0, 12)
    if (!missingRelationships.length) return
    void Promise.all(missingRelationships.map((relationship) => ensureDefaultRoutingPeople(relationship.id)))
  }, [activeTab, connectedRelationships, defaultRoutingPeopleByRelationshipId])

  const preferredPartnerRows = useMemo(() => {
    const connectedByOrgId = new Map(
      connectedRelationships.map((relationship) => [
        normalizeText(relationship.partner?.id || relationship.counterpartOrganisationId || relationship.partnerOrganisationId),
        relationship,
      ]),
    )

    return (preferredRoutingRules || [])
      .map((rule) => {
        const targetOrganisationId = normalizeText(rule?.targetOrganisationId || rule?.target_organisation_id)
        if (!targetOrganisationId) return null
        const relationship = connectedByOrgId.get(targetOrganisationId) || null
        const partner = relationship?.partner || null
        const partnerType = partner?.type || 'unknown'
        const personName = normalizeText(rule?.targetScopeName || partner?.name || 'Preferred partner')
        return {
          id: rule.id,
          partner,
          relationship,
          partnerType,
          personName,
          organisationName: partner?.name || 'Connected partner',
          organisationId: targetOrganisationId,
          contactPerson: personName,
          email: partner?.contactEmails?.[0] || '',
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
      .sort((left, right) => {
        const leftGroup = left.groupLabel || ''
        const rightGroup = right.groupLabel || ''
        if (leftGroup !== rightGroup) return leftGroup.localeCompare(rightGroup)
        return String(left.personName || '').localeCompare(String(right.personName || ''))
      })
  }, [connectedRelationships, preferredRoutingRules])

  const defaultRoutingRows = useMemo(() => {
    return (defaultRoutingRules || [])
      .filter((rule) => {
        const scopeType = normalizeText(rule.sourceScopeType || rule.source_scope)
        return Boolean(rule.isDefault) && [
          PARTNER_ROUTING_SOURCE_TYPES.organisation,
          PARTNER_ROUTING_SOURCE_TYPES.region,
          PARTNER_ROUTING_SOURCE_TYPES.branch,
          PARTNER_ROUTING_SOURCE_TYPES.team,
        ].includes(scopeType)
      })
      .map((rule) => {
        const targetOrganisationId = normalizeText(rule.targetOrganisationId || rule.target_organisation_id || '')
        const relationship =
          connectedRelationships.find((item) => normalizeText(item.partner?.id || item.counterpartOrganisationId || item.partnerOrganisationId) === targetOrganisationId) ||
          connectedRelationshipById.get(normalizeText(rule.targetRelationshipId || rule.partnerRelationshipId || rule.relationshipId || '')) ||
          null
        const partner = relationship?.partner || null
        const people = defaultRoutingPeopleByRelationshipId[normalizeText(relationship?.id || '')] || []
        const targetUserId = normalizeText(rule.targetUserId || rule.target_user_id || '')
        const selectedPerson = people.find((person) => normalizeText(person.userId || person.id) === targetUserId) || null
        const scopeType = normalizeLower(rule.sourceScopeType || rule.source_scope)
        const scopeId = normalizeText(rule.sourceScopeId || rule.sourceContextId || rule.source_context_id || '')
        const scopeLabel = scopeType === PARTNER_ROUTING_SOURCE_TYPES.region
          ? (workspaceHierarchy.regions.find((item) => normalizeText(item.id) === scopeId)?.name || 'Region')
          : scopeType === PARTNER_ROUTING_SOURCE_TYPES.branch || scopeType === PARTNER_ROUTING_SOURCE_TYPES.team
            ? (workspaceHierarchy.units.find((item) => normalizeText(item.id) === scopeId)?.name || 'Branch / Team')
            : 'Organisation'
        return {
          ...rule,
          relationship,
          partner,
          selectedPerson,
          targetOrganisationId,
          scopeLabel,
          roleLabel:
            PARTNER_ROUTING_ROLE_TYPE_OPTIONS.find((option) => option.value === normalizeText(rule.targetRoleType || rule.target_role_type))?.label ||
            normalizeText(rule.targetRoleType || rule.target_role_type) ||
            'Default partner',
        }
      })
      .sort((left, right) => {
        const leftScope = normalizeText(left.scopeLabel || '')
        const rightScope = normalizeText(right.scopeLabel || '')
        if (leftScope !== rightScope) return leftScope.localeCompare(rightScope)
        return normalizeText(left.roleLabel || '').localeCompare(normalizeText(right.roleLabel || ''))
      })
  }, [connectedRelationshipById, defaultRoutingPeopleByRelationshipId, defaultRoutingRules, workspaceHierarchy.regions, workspaceHierarchy.units])

  const visibleConnectedRelationships = useMemo(
    () =>
      connectedRelationships.filter((relationship) => {
        if (directoryFilters.query && !normalizeLower(relationship.partner?.name).includes(normalizeLower(directoryFilters.query))) return false
        if (directoryFilters.scope !== 'all' && relationship.scopeType !== directoryFilters.scope) return false
        if (directoryFilters.type && relationship.partner?.type !== directoryFilters.type) return false
        if (directoryFilters.preferredOnly && !relationship.preferred && relationship.relationshipType !== 'preferred') return false
        return true
      }),
    [connectedRelationships, directoryFilters],
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
    if (!partnerId) return connectedRelationships[0]?.partner || discoverablePartners[0] || null
    return (
      availableOrganisations.find((item) => item.id === partnerId) ||
      connectedRelationships.find((item) => item.partner?.id === partnerId)?.partner ||
      null
    )
  }, [availableOrganisations, connectedRelationships, discoverablePartners, partnerId])

  const selectedRelationship = useMemo(
    () => connectedRelationships.find((item) => item.partner?.id === selectedPartner?.id) || null,
    [connectedRelationships, selectedPartner?.id],
  )

  const selectedPartnerPeople = useMemo(
    () => defaultRoutingPeopleByRelationshipId[normalizeText(selectedRelationship?.id || '')] || [],
    [defaultRoutingPeopleByRelationshipId, selectedRelationship?.id],
  )

  const selectedDefaultRelationship = useMemo(
    () => connectedRelationshipById.get(normalizeText(defaultRoutingForm.targetRelationshipId || '')) || null,
    [connectedRelationshipById, defaultRoutingForm.targetRelationshipId],
  )

  const selectedDefaultPeople = useMemo(
    () => defaultRoutingPeopleByRelationshipId[normalizeText(selectedDefaultRelationship?.id || '')] || [],
    [defaultRoutingPeopleByRelationshipId, selectedDefaultRelationship?.id],
  )

  const defaultRoutingSourceUnitOptions = useMemo(() => {
    const scopeType = normalizeText(defaultRoutingForm.sourceScopeType || '')
    return (workspaceHierarchy.units || []).filter((unit) => {
      const unitType = normalizeLower(unit.unit_type || unit.unitType || unit.type || '')
      if (!unitType) return true
      if (scopeType === PARTNER_ROUTING_SOURCE_TYPES.team) return unitType === 'team'
      if (scopeType === PARTNER_ROUTING_SOURCE_TYPES.branch) return unitType === 'branch'
      return true
    })
  }, [defaultRoutingForm.sourceScopeType, workspaceHierarchy.units])

  const filteredDefaultRoutingRows = useMemo(() => {
    return defaultRoutingRows.filter((rule) => {
      if (defaultRoutingFilters.scope !== 'all' && normalizeText(rule.sourceScopeType || rule.source_scope) !== defaultRoutingFilters.scope) return false
      if (defaultRoutingFilters.roleType !== 'all' && normalizeText(rule.targetRoleType || rule.target_role_type) !== defaultRoutingFilters.roleType) return false
      if (defaultRoutingFilters.status === 'active' && !rule.isActive) return false
      if (defaultRoutingFilters.status === 'inactive' && rule.isActive) return false
      if (!defaultRoutingFilters.query) return true
      const query = normalizeLower(defaultRoutingFilters.query)
      const haystack = [
        rule.ruleName,
        rule.notes,
        rule.partner?.name,
        rule.selectedPerson?.label,
        rule.scopeLabel,
      ].join(' ')
      return normalizeLower(haystack).includes(query)
    })
  }, [defaultRoutingFilters.query, defaultRoutingFilters.roleType, defaultRoutingFilters.scope, defaultRoutingFilters.status, defaultRoutingRows])

  const transactionPartnerOptions = useMemo(
    () => ({
      attorneys: getPartnerAssignmentOptions(snapshot || {}, 'transfer_attorney', accessContext),
      bondOriginators: getPartnerAssignmentOptions(snapshot || {}, 'bond_originator', accessContext),
    }),
    [accessContext, snapshot],
  )

  const filteredReferrals = useMemo(() => {
    const now = Date.now()
    const maxDays = { all: Number.POSITIVE_INFINITY, '7d': 7, '30d': 30, '90d': 90 }[referralFilters.dateRange] || Number.POSITIVE_INFINITY

    return (snapshot?.referrals || []).filter((referral) => {
      const partner = relatedOrganisations.find((item) => [referral.referringOrganisationId, referral.referredOrganisationId].includes(item.id))
      const partnerName = normalizeLower(partner?.name || '')
      const status = normalizeLower(referral.referralStatus)
      const matchQuery = !referralFilters.query || partnerName.includes(normalizeLower(referralFilters.query))
      const statusMatch = referralFilters.status === 'all' || status === referralFilters.status
      const date = new Date(referral.referralDate || referral.createdAt)
      const ageOk = Number.isNaN(date.getTime()) ? true : date.getTime() >= now - maxDays * 24 * 60 * 60 * 1000
      return matchQuery && statusMatch && ageOk
    })
  }, [referralFilters.dateRange, referralFilters.query, referralFilters.status, relatedOrganisations, snapshot?.referrals])

  const partnerNetworkIntelligence = useMemo(
    () =>
      buildPartnerNetworkIntelligence({
        snapshot: snapshot || {},
        selectedPartnerId: selectedPartner?.id || '',
        selectedRelationshipId: selectedRelationship?.id || '',
        peopleByRelationshipId: defaultRoutingPeopleByRelationshipId,
        query: networkSearchQuery,
      }),
    [defaultRoutingPeopleByRelationshipId, networkSearchQuery, selectedPartner?.id, selectedRelationship?.id, snapshot],
  )

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
      const scope = selectedInviteScope || parseScopeValue(inviteScopeValue)
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

  async function handleMarkPreferred(relationship) {
    try {
      setError('')
      await updatePartnerRelationshipStatus({
        relationshipId: relationship.id,
        status: 'accepted',
        relationshipType: relationship.relationshipType === 'preferred' ? 'approved' : 'preferred',
        preferred: !(relationship.preferred || relationship.relationshipType === 'preferred'),
        workspaceType: resolvedWorkspaceType,
        organisationId,
      })
      await recordWorkspaceAuditEvent('partner_preferred_status_changed', {
        userId: profile?.id || '',
        workspaceId: organisationId,
        targetType: 'partner_relationship',
        targetId: relationship.id,
      })
      await loadSnapshot()
    } catch (updateError) {
      setError(updateError?.message || 'Unable to update preferred status.')
    }
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

  function resetDefaultRoutingForm() {
    setEditingDefaultRoutingId('')
    setDefaultRoutingForm({
      ruleName: '',
      isActive: true,
      isDefault: true,
      assignmentPriority: 500,
      sourceScopeType: PARTNER_ROUTING_SOURCE_TYPES.organisation,
      sourceScopeId: '',
      targetRelationshipId: '',
      targetOrganisationId: '',
      targetRoleType: PARTNER_ROUTING_ROLE_TYPES.bondOriginator,
      targetUserId: '',
      targetScopeType: PARTNER_ROUTING_TARGET_TYPES.orgQueue,
      assignmentMode: PARTNER_ROUTING_MODES.organisationQueue,
      notes: '',
    })
  }

  function updateDefaultRoutingFormField(field, value) {
    setDefaultRoutingForm((previous) => ({ ...previous, [field]: value }))
  }

  async function ensureDefaultRoutingPeople(relationshipId = '') {
    const safeRelationshipId = normalizeText(relationshipId)
    if (!safeRelationshipId) return []
    const existing = defaultRoutingPeopleByRelationshipId[safeRelationshipId]
    if (Array.isArray(existing)) return existing

    try {
      setDefaultRoutingLoadingRelationshipId(safeRelationshipId)
      const payload = await getBondPartnerPeople(safeRelationshipId)
      const people = normalizeDefaultRoutingPeople(payload)
      setDefaultRoutingPeopleByRelationshipId((previous) => ({
        ...previous,
        [safeRelationshipId]: people,
      }))
      return people
    } catch (peopleError) {
      setError(peopleError?.message || 'Unable to load partner staff directory.')
      return []
    } finally {
      setDefaultRoutingLoadingRelationshipId('')
    }
  }

  async function handleDefaultRoutingRelationshipChange(relationshipId) {
    setError('')
    const nextRelationship = connectedRelationshipById.get(normalizeText(relationshipId)) || null
    await ensureDefaultRoutingPeople(relationshipId)
    setDefaultRoutingForm((previous) => ({
      ...previous,
      targetRelationshipId: normalizeText(relationshipId),
      targetOrganisationId: nextRelationship?.partner?.id || nextRelationship?.partnerOrganisationId || nextRelationship?.counterpartOrganisationId || '',
      targetUserId: '',
      targetScopeType: PARTNER_ROUTING_TARGET_TYPES.orgQueue,
      assignmentMode: getRoutingModeForDefaultRole(previous.targetRoleType, false),
      ruleName:
        previous.ruleName ||
        `${nextRelationship?.partner?.name || 'Partner'} · ${PARTNER_ROUTING_ROLE_TYPE_OPTIONS.find((option) => option.value === previous.targetRoleType)?.label || 'Default'}`,
    }))
  }

  function startEditDefaultRoutingRule(rule = {}) {
    setEditingDefaultRoutingId(rule.id || '')
    const targetOrganisationId = normalizeText(rule.targetOrganisationId || rule.target_organisation_id || '')
    const relationshipId =
      normalizeText(rule.targetRelationshipId || rule.partnerRelationshipId || rule.relationshipId || '') ||
      connectedRelationships.find((item) => normalizeText(item.partner?.id || item.counterpartOrganisationId || item.partnerOrganisationId) === targetOrganisationId)?.id ||
      ''
    setDefaultRoutingForm({
      ruleName: rule.ruleName || '',
      isActive: Boolean(rule.isActive),
      isDefault: true,
      assignmentPriority: Number.isFinite(Number(rule.assignmentPriority)) ? Number(rule.assignmentPriority) : 500,
      sourceScopeType: normalizeText(rule.sourceScopeType || rule.source_scope) || PARTNER_ROUTING_SOURCE_TYPES.organisation,
      sourceScopeId: normalizeText(rule.sourceScopeId || rule.sourceContextId || rule.source_context_id || ''),
      targetRelationshipId: relationshipId,
      targetOrganisationId,
      targetRoleType: normalizeText(rule.targetRoleType || rule.target_role_type) || PARTNER_ROUTING_ROLE_TYPES.bondOriginator,
      targetUserId: normalizeText(rule.targetUserId || rule.target_user_id || ''),
      targetScopeType: normalizeText(rule.targetScopeType || rule.target_scope) || PARTNER_ROUTING_TARGET_TYPES.orgQueue,
      assignmentMode: normalizeText(rule.assignmentMode || rule.assignment_mode) || PARTNER_ROUTING_MODES.organisationQueue,
      notes: rule.notes || '',
    })
    if (relationshipId) {
      void ensureDefaultRoutingPeople(relationshipId)
    }
  }

  async function handleSaveDefaultRoutingRule(event) {
    event.preventDefault()
    if (!canManageDefaultRouting) return

    try {
      setError('')
      setMessage('')
      setSavingDefaultRouting(true)

      const relationship = connectedRelationshipById.get(normalizeText(defaultRoutingForm.targetRelationshipId || '')) || null
      if (!relationship || relationship.relationshipStatus !== 'accepted') {
        throw new Error('Choose a connected partner organisation before saving a default route.')
      }

      const sourceScopeType = normalizeText(defaultRoutingForm.sourceScopeType || PARTNER_ROUTING_SOURCE_TYPES.organisation)
      const sourceScopeId = sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.organisation ? '' : normalizeText(defaultRoutingForm.sourceScopeId || '')
      if (sourceScopeType !== PARTNER_ROUTING_SOURCE_TYPES.organisation && !sourceScopeId) {
        throw new Error('Choose a source region, branch, or team before saving this default route.')
      }

      const partnerPeople = await ensureDefaultRoutingPeople(relationship.id)
      const selectedPerson = partnerPeople.find((person) => normalizeText(person.userId || person.id) === normalizeText(defaultRoutingForm.targetUserId || '')) || null
      if (defaultRoutingForm.targetUserId && (!selectedPerson || selectedPerson.isActive === false)) {
        throw new Error('Choose an active person from the connected partner organisation.')
      }

      if (selectedPerson && !personMatchesDefaultRole(selectedPerson, defaultRoutingForm.targetRoleType)) {
        throw new Error('The selected person does not match the chosen role type.')
      }

      const hasPerson = Boolean(selectedPerson?.userId)
      const assignmentMode = getRoutingModeForDefaultRole(defaultRoutingForm.targetRoleType, hasPerson)
      const targetScopeType = hasPerson ? PARTNER_ROUTING_TARGET_TYPES.consultant : PARTNER_ROUTING_TARGET_TYPES.orgQueue
      const targetScopeName = hasPerson
        ? selectedPerson.label
        : `${relationship.partner?.name || 'Partner'} queue`

      const payload = {
        id: editingDefaultRoutingId || undefined,
        ruleName:
          normalizeText(defaultRoutingForm.ruleName) ||
          `${defaultRoutingScopeOptions.find((option) => option.value === (sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.organisation ? sourceScopeType : `${sourceScopeType}:${sourceScopeId}`))?.label || 'Organisation'} · ${
            PARTNER_ROUTING_ROLE_TYPE_OPTIONS.find((option) => option.value === defaultRoutingForm.targetRoleType)?.label || 'Default'
          }`,
        isActive: Boolean(defaultRoutingForm.isActive),
        isDefault: true,
        assignmentPriority: Number(defaultRoutingForm.assignmentPriority) || 500,
        sourceScopeType,
        sourceScopeId,
        sourceOrganisationId: organisationId,
        targetOrganisationId: relationship.partner?.id || relationship.partnerOrganisationId || relationship.counterpartOrganisationId || defaultRoutingForm.targetOrganisationId || '',
        targetScopeType,
        targetRoleType: defaultRoutingForm.targetRoleType,
        targetScopeId: hasPerson ? selectedPerson.userId : '',
        targetUserId: hasPerson ? selectedPerson.userId : '',
        targetConsultantUserId: hasPerson ? selectedPerson.userId : '',
        targetScopeName,
        assignmentMode,
        notes: normalizeText(defaultRoutingForm.notes),
      }

      const savedRule = await saveOrganisationPartnerRoutingRule(payload)
      try {
        await recordWorkspaceAuditEvent(editingDefaultRoutingId ? 'partner_default_route_updated' : 'partner_default_route_created', {
          userId: profile?.id || '',
          workspaceId: organisationId,
          targetType: 'partner_routing_rule',
          targetId: savedRule?.id || editingDefaultRoutingId || payload.id || '',
          metadata: {
            sourceScopeType,
            sourceScopeId,
            targetRoleType: defaultRoutingForm.targetRoleType,
            targetOrganisationId: payload.targetOrganisationId,
            targetUserId: payload.targetUserId || '',
          },
        })
      } catch {
        // Audit logging should not block a successful routing save.
      }
      setMessage(editingDefaultRoutingId ? 'Default route updated.' : 'Default route added.')
      resetDefaultRoutingForm()
      await loadSnapshot()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to save default route.')
    } finally {
      setSavingDefaultRouting(false)
    }
  }

  async function handleRemoveDefaultRoutingRule(rule = {}) {
    if (!canManageDefaultRouting) return
    if (!rule?.id) return
    if (!confirm('Remove this default route?')) return
    try {
      setSavingDefaultRouting(true)
      await removeOrganisationPartnerRoutingRule(rule.id)
      try {
        await recordWorkspaceAuditEvent('partner_default_route_removed', {
          userId: profile?.id || '',
          workspaceId: organisationId,
          targetType: 'partner_routing_rule',
          targetId: rule.id,
        })
      } catch {
        // Audit logging should not block a successful routing removal.
      }
      if (String(editingDefaultRoutingId) === String(rule.id)) {
        resetDefaultRoutingForm()
      }
      setMessage('Default route removed.')
      await loadSnapshot()
    } catch (removeError) {
      setError(removeError?.message || 'Unable to remove default route.')
    } finally {
      setSavingDefaultRouting(false)
    }
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active Partners" value={formatNumber(metrics.activePartners)} subtext={`${formatNumber(metrics.preferredPartners)} preferred`} />
        <MetricCard label="Invite Acceptance" value={`${formatNumber(metrics.inviteAcceptanceRate)}%`} subtext={`${formatNumber(metrics.newPartnerGrowth)} new in 30 days`} />
        <MetricCard label="Shared Deals" value={formatNumber(metrics.activeSharedDeals)} subtext={`${formatNumber(metrics.completedDeals)} completed registrations`} />
        <MetricCard label="Referral Influence" value={formatCurrency(metrics.revenueInfluenced)} subtext={`${formatNumber(metrics.referralConversionRate)}% conversion`} />
      </section>

      <section className="mt-5 rounded-[24px] border border-[#d9e3ee] bg-[rgba(248,251,254,0.94)] p-3 shadow-[0_14px_28px_rgba(15,23,42,0.1)] backdrop-blur-md md:p-4">
        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_220px]">
          <nav className="grid gap-2 md:grid-cols-2 xl:grid-cols-5" role="tablist" aria-label="Partner workspace sections">
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
                      placeholder="Search connected partners"
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
                    Preferred only
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {visibleConnectedRelationships.map((relationship) => (
                    <PartnerCard
                      key={relationship.id}
                      partner={relationship.partner}
                      relationship={relationship}
                      profileHref={
                        isBondPartnersRoute &&
                        relationship.relationshipStatus === 'accepted' &&
                        ['agency', 'agency_network'].includes(relationship.partner?.type) &&
                        relationship.id
                          ? `/bond/partners/${relationship.id}`
                          : ''
                      }
                      action={() => handleMarkPreferred(relationship)}
                      actionLabel={relationship.preferred || relationship.relationshipType === 'preferred' ? 'Remove Preferred' : 'Make Preferred'}
                    />
                  ))}
                </div>
                {connectedRelationships.length === 0 ? (
                  <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">No connected partners yet</div>
                ) : null}
                {connectedRelationships.length && !visibleConnectedRelationships.length ? (
                  <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">No partners match the selected filters</div>
                ) : null}
              </section>
            ) : null}

            {activeTab === 'preferred' ? (
              <section className="space-y-4">
                <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-4">
                  <p className="text-sm font-semibold text-[#10243a]">My Preferred Partners</p>
                  <p className="mt-1 text-sm leading-6 text-[#60758d]">
                    These are the people Bridge will try to route to first when you create new work from a connected partner organisation.
                  </p>
                </div>

                {!preferredPartnerRows.length ? (
                  <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">
                    No preferred partners have been set yet.
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
                                <Link
                                  to={`/partners/${encodeURIComponent(row.organisationId)}`}
                                  className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#d9e4ef] bg-white px-3 text-sm font-semibold text-[#264563] transition hover:bg-[#f8fafc]"
                                >
                                  Profile <ArrowUpRight size={14} />
                                </Link>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <span className="inline-flex rounded-full border border-[#d8eefe] bg-[#f4f9ff] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#1e4d82]">
                                  {row.contactPerson}
                                </span>
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

            {activeTab === 'defaults' ? (
              <section className="space-y-4">
                <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#10243a]">Default Routing</p>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-[#60758d]">
                        Set organisation, region, branch, and team partner defaults so Bridge has a sensible first choice before personal preferences or manual overrides.
                      </p>
                    </div>
                    {canManageDefaultRouting ? (
                      <button
                        type="button"
                        onClick={resetDefaultRoutingForm}
                        className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#d9e4ef] bg-white px-3 text-sm font-semibold text-[#264563] transition hover:bg-[#f8fafc]"
                      >
                        <Route size={14} /> New Default
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <label className="relative min-w-0 flex-1">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ba0b8]" />
                      <input
                        value={defaultRoutingFilters.query}
                        onChange={(event) => setDefaultRoutingFilters((previous) => ({ ...previous, query: event.target.value }))}
                        placeholder="Search defaults"
                        className="h-10 w-full rounded-[8px] border border-[#d7e2ee] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10"
                      />
                    </label>
                    <select
                      className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
                      value={defaultRoutingFilters.scope}
                      onChange={(event) => setDefaultRoutingFilters((previous) => ({ ...previous, scope: event.target.value }))}
                    >
                      <option value="all">All scopes</option>
                      {[
                        PARTNER_ROUTING_SOURCE_TYPES.organisation,
                        PARTNER_ROUTING_SOURCE_TYPES.region,
                        PARTNER_ROUTING_SOURCE_TYPES.branch,
                        PARTNER_ROUTING_SOURCE_TYPES.team,
                      ].map((scopeType) => (
                        <option key={scopeType} value={scopeType}>
                          {scopeType.charAt(0).toUpperCase() + scopeType.slice(1)}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
                      value={defaultRoutingFilters.roleType}
                      onChange={(event) => setDefaultRoutingFilters((previous) => ({ ...previous, roleType: event.target.value }))}
                    >
                      <option value="all">All roles</option>
                      {PARTNER_ROUTING_ROLE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
                      value={defaultRoutingFilters.status}
                      onChange={(event) => setDefaultRoutingFilters((previous) => ({ ...previous, status: event.target.value }))}
                    >
                      <option value="all">All statuses</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                {!filteredDefaultRoutingRows.length ? (
                  <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">
                    No default routes found.
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {filteredDefaultRoutingRows.map((rule) => (
                      <article key={rule.id} className="rounded-[8px] border border-[#dbe5f0] bg-white p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[#10243a]">
                              {rule.scopeLabel} · {rule.roleLabel}
                            </p>
                            <p className="mt-1 text-sm text-[#60758d]">
                              {rule.partner?.name || 'Partner organisation'}
                              {rule.selectedPerson ? ` · ${rule.selectedPerson.label}` : ' · Queue'}
                            </p>
                            <p className="mt-1 text-xs text-[#7b8ba5]">
                              Updated {formatDateTime(rule.updatedAt || rule.updated_at || rule.createdAt || rule.created_at)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] ${rule.isActive ? 'border-[#cce8d6] bg-[#f1fbf4] text-[#1f7a45]' : 'border-[#f0d4d4] bg-[#fff5f5] text-[#a23b3b]'}`}>
                              {rule.isActive ? 'Active' : 'Inactive'}
                            </span>
                            {rule.isDefault ? (
                              <span className="inline-flex rounded-full border border-[#d8e6f7] bg-[#eef5ff] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#2b5f93]">
                                Default
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {rule.notes ? <p className="mt-3 text-sm leading-6 text-[#40556c]">{rule.notes}</p> : null}
                        {canManageDefaultRouting ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => startEditDefaultRoutingRule(rule)}
                              className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#d9e4ef] bg-white px-3 text-sm font-semibold text-[#264563] transition hover:bg-[#f8fafc]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveDefaultRoutingRule(rule)}
                              className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#f0d4d4] bg-white px-3 text-sm font-semibold text-[#a23b3b] transition hover:bg-[#fff5f5]"
                            >
                              Remove
                            </button>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}

                <form onSubmit={handleSaveDefaultRoutingRule} className="rounded-[8px] border border-[#dbe5f0] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#10243a]">{editingDefaultRoutingId ? 'Edit Default Route' : 'Add Default Route'}</p>
                      <p className="mt-1 text-sm leading-6 text-[#60758d]">
                        Choose a source scope, connected partner organisation, and a preferred person if you want Bridge to assign directly.
                      </p>
                    </div>
                    {defaultRoutingLoadingRelationshipId ? (
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ba5]">Loading staff directory...</p>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="relative min-w-0 flex-1">
                      <span className="mb-1 block text-sm font-medium text-[#51657b]">Scope</span>
                      <select
                        value={
                          defaultRoutingForm.sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.organisation
                            ? PARTNER_ROUTING_SOURCE_TYPES.organisation
                            : `${defaultRoutingForm.sourceScopeType}:${defaultRoutingForm.sourceScopeId}`
                        }
                        onChange={(event) => {
                          const nextScope = parseScopeValue(event.target.value)
                          setDefaultRoutingForm((previous) => ({
                            ...previous,
                            sourceScopeType: nextScope.scopeType,
                            sourceScopeId: nextScope.scopeId,
                          }))
                        }}
                        disabled={!canManageDefaultRouting}
                        className="h-10 w-full rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10 disabled:bg-[#f8fafc]"
                      >
                        {defaultRoutingScopeOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="relative min-w-0 flex-1">
                      <span className="mb-1 block text-sm font-medium text-[#51657b]">Role type</span>
                      <select
                        value={defaultRoutingForm.targetRoleType}
                        onChange={(event) => {
                          const nextRoleType = event.target.value
                          setDefaultRoutingForm((previous) => ({
                            ...previous,
                            targetRoleType: nextRoleType,
                            targetUserId: '',
                            targetScopeType: PARTNER_ROUTING_TARGET_TYPES.orgQueue,
                            assignmentMode: getRoutingModeForDefaultRole(nextRoleType, false),
                          }))
                        }}
                        disabled={!canManageDefaultRouting}
                        className="h-10 w-full rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10 disabled:bg-[#f8fafc]"
                      >
                        {PARTNER_ROUTING_ROLE_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {defaultRoutingForm.sourceScopeType !== PARTNER_ROUTING_SOURCE_TYPES.organisation ? (
                      <label className="relative min-w-0 flex-1">
                        <span className="mb-1 block text-sm font-medium text-[#51657b]">
                          {defaultRoutingForm.sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.region
                            ? 'Region'
                            : defaultRoutingForm.sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.team
                              ? 'Team'
                              : 'Branch'}
                        </span>
                        <select
                          value={defaultRoutingForm.sourceScopeId}
                          onChange={(event) => updateDefaultRoutingFormField('sourceScopeId', event.target.value)}
                          disabled={!canManageDefaultRouting}
                          className="h-10 w-full rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10 disabled:bg-[#f8fafc]"
                        >
                          <option value="">Select source</option>
                          {(defaultRoutingForm.sourceScopeType === PARTNER_ROUTING_SOURCE_TYPES.region
                            ? workspaceHierarchy.regions
                            : defaultRoutingSourceUnitOptions
                          ).map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name || item.code || item.id}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <div className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3 text-sm text-[#40556c]">
                        Organisation scope applies to the whole organisation.
                      </div>
                    )}

                    <label className="relative min-w-0 flex-1">
                      <span className="mb-1 block text-sm font-medium text-[#51657b]">Partner organisation</span>
                      <select
                        value={defaultRoutingForm.targetRelationshipId}
                        onChange={(event) => {
                          void handleDefaultRoutingRelationshipChange(event.target.value)
                        }}
                        disabled={!canManageDefaultRouting}
                        className="h-10 w-full rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10 disabled:bg-[#f8fafc]"
                      >
                        <option value="">Select connected organisation</option>
                        {connectedRelationships.map((relationship) => (
                          <option key={relationship.id} value={relationship.id}>
                            {relationship.partner?.name || 'Connected organisation'}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="relative min-w-0 flex-1">
                      <span className="mb-1 block text-sm font-medium text-[#51657b]">Preferred person</span>
                      <select
                        value={defaultRoutingForm.targetUserId}
                        onChange={(event) =>
                          setDefaultRoutingForm((previous) => ({
                            ...previous,
                            targetUserId: event.target.value,
                            targetScopeType: event.target.value ? PARTNER_ROUTING_TARGET_TYPES.consultant : PARTNER_ROUTING_TARGET_TYPES.orgQueue,
                            assignmentMode: getRoutingModeForDefaultRole(previous.targetRoleType, Boolean(event.target.value)),
                          }))
                        }
                        disabled={!canManageDefaultRouting || !selectedDefaultRelationship}
                        className="h-10 w-full rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10 disabled:bg-[#f8fafc]"
                      >
                        <option value="">Partner queue only</option>
                        {selectedDefaultPeople
                          .filter((person) => person.isActive !== false)
                          .filter((person) => personMatchesDefaultRole(person, defaultRoutingForm.targetRoleType))
                          .map((person) => (
                            <option key={person.userId} value={person.userId}>
                              {person.label}
                            </option>
                          ))}
                      </select>
                    </label>

                    <label className="relative min-w-0 flex-1">
                      <span className="mb-1 block text-sm font-medium text-[#51657b]">Rule name</span>
                      <input
                        value={defaultRoutingForm.ruleName}
                        onChange={(event) => updateDefaultRoutingFormField('ruleName', event.target.value)}
                        disabled={!canManageDefaultRouting}
                        placeholder="Optional friendly name"
                        className="h-10 w-full rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10 disabled:bg-[#f8fafc]"
                      />
                    </label>

                    <label className="relative min-w-0 flex-1">
                      <span className="mb-1 block text-sm font-medium text-[#51657b]">Notes</span>
                      <input
                        value={defaultRoutingForm.notes}
                        onChange={(event) => updateDefaultRoutingFormField('notes', event.target.value)}
                        disabled={!canManageDefaultRouting}
                        placeholder="Optional notes"
                        className="h-10 w-full rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10 disabled:bg-[#f8fafc]"
                      />
                    </label>

                    <label className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm font-semibold text-[#35546c]">
                      <input
                        type="checkbox"
                        checked={Boolean(defaultRoutingForm.isActive)}
                        disabled={!canManageDefaultRouting}
                        onChange={(event) => updateDefaultRoutingFormField('isActive', event.target.checked)}
                        className="h-4 w-4 rounded border-[#c8d6e5] text-[#10243a]"
                      />
                      Active
                    </label>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {canManageDefaultRouting ? (
                      <>
                        <button
                          type="submit"
                          disabled={savingDefaultRouting}
                          className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#10243a] px-4 text-sm font-semibold text-white transition hover:bg-[#173a5e] disabled:cursor-not-allowed disabled:bg-[#dbe5ef] disabled:text-[#52677f]"
                        >
                          {savingDefaultRouting ? 'Saving...' : editingDefaultRoutingId ? 'Save Default' : 'Add Default'}
                        </button>
                        {editingDefaultRoutingId ? (
                          <button
                            type="button"
                            onClick={resetDefaultRoutingForm}
                            className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#d9e4ef] bg-white px-4 text-sm font-semibold text-[#35546c] transition hover:bg-[#f8fafc]"
                          >
                            Cancel Edit
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-[#60758d]">You can view default routing rules, but your current role cannot modify them.</p>
                    )}
                  </div>
                </form>
              </section>
            ) : null}

            {activeTab === 'network' ? (
              <section className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Total Connections"
                    value={formatNumber(partnerNetworkIntelligence.summary.totalConnections)}
                    subtext={`${formatNumber(partnerNetworkIntelligence.summary.activeConnections)} active · ${formatNumber(partnerNetworkIntelligence.summary.dormantConnections)} dormant`}
                  />
                  <MetricCard
                    label="Average Health"
                    value={`${formatNumber(partnerNetworkIntelligence.summary.averageHealthScore)} / 100`}
                    subtext={partnerNetworkIntelligence.summary.topProfile?.organisationName || 'No top partner yet'}
                  />
                  <MetricCard
                    label="Active Users"
                    value={formatNumber(partnerNetworkIntelligence.summary.totalUsers)}
                    subtext="Across visible partner staff directories"
                  />
                  <MetricCard
                    label="Partner Activity"
                    value={formatNumber(partnerNetworkIntelligence.summary.recentActivity)}
                    subtext={`${formatCurrency(partnerNetworkIntelligence.summary.referralVolume)} referral value`}
                  />
                </div>

                <PartnerNetworkIntelligencePanel
                  intelligence={partnerNetworkIntelligence}
                  searchQuery={networkSearchQuery}
                  onSearchQueryChange={setNetworkSearchQuery}
                />
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

            {activeTab === 'referrals' ? (
              <section>
                <div className="mb-4 flex flex-wrap gap-2">
                  <label className="relative min-w-0 flex-1">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ba0b8]" />
                    <input
                      value={referralFilters.query}
                      onChange={(event) => setReferralFilters((previous) => ({ ...previous, query: event.target.value }))}
                      placeholder="Search partner"
                      className="h-10 w-full rounded-[8px] border border-[#d7e2ee] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10"
                    />
                  </label>
                  <select
                    className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
                    value={referralFilters.status}
                    onChange={(event) => setReferralFilters((previous) => ({ ...previous, status: event.target.value }))}
                  >
                    <option value="all">All statuses</option>
                    <option value="open">Open</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                  <select
                    className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
                    value={referralFilters.dateRange}
                    onChange={(event) => setReferralFilters((previous) => ({ ...previous, dateRange: event.target.value }))}
                  >
                    <option value="all">All time</option>
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                  </select>
                </div>
                <div className="space-y-3">
                  {filteredReferrals.map((referral) => {
                    const partner = (snapshot?.organisations || []).find((item) => [referral.referringOrganisationId, referral.referredOrganisationId].includes(item.id))
                    const status = normalizeLower(referral.referralStatus)
                    return (
                      <div key={referral.id} className="grid gap-3 rounded-[8px] border border-[#dbe5f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] md:grid-cols-[1fr_auto]">
                        <div>
                          <p className="font-semibold text-[#10243a]">{partner?.name || 'Referral partner'}</p>
                          <p className="mt-1 text-sm text-[#60758d]">Transaction {referral.transactionId || 'unlinked'} · {formatDate(referral.referralDate)}</p>
                        </div>
                        <div className="text-left md:text-right">
                          <StatusBadge className="border-[#d9e7ff] bg-[#f3f7ff] text-[#1e4d82]">{status}</StatusBadge>
                          <p className="mt-2 text-sm font-semibold text-[#10243a]">{formatCurrency(referral.referralValue)}</p>
                        </div>
                      </div>
                    )
                  })}
                  {!filteredReferrals.length ? <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">No referrals or opportunities yet</div> : null}
                </div>
              </section>
            ) : null}
          </main>

          <div className="space-y-5">
            <ProfilePanel
              partner={selectedPartner}
              relationship={selectedRelationship}
              people={selectedPartnerPeople}
              intelligence={partnerNetworkIntelligence.selectedProfile}
            />
            <section className="rounded-[8px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#10243a]">
                <SlidersHorizontal size={16} /> Transaction defaults
              </div>
              <div className="mt-4 grid gap-3">
                <div className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Attorney Dropdown</p>
                  <p className="mt-2 text-sm font-semibold text-[#10243a]">{transactionPartnerOptions.attorneys[0]?.companyName || 'No connected attorney selected'}</p>
                </div>
                <div className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Bond Originator Dropdown</p>
                  <p className="mt-2 text-sm font-semibold text-[#10243a]">{transactionPartnerOptions.bondOriginators[0]?.companyName || 'No connected bond originator selected'}</p>
                </div>
              </div>
            </section>
            <section className="rounded-[8px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#10243a]">
                <Network size={16} /> Shared visibility
              </div>
              <div className="mt-4 space-y-3 text-sm text-[#40556c]">
                <p className="flex items-center gap-2"><CheckCircle2 size={15} className="text-[#17613d]" /> Listings: connected partners only</p>
                <p className="flex items-center gap-2"><CheckCircle2 size={15} className="text-[#17613d]" /> Developments: preferred partners only</p>
                <p className="flex items-center gap-2"><LockKeyhole size={15} className="text-[#52677f]" /> Editing remains private to the owning organisation</p>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
