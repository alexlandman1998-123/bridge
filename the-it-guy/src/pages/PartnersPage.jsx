import {
  ArrowUpRight,
  CheckCircle2,
  LockKeyhole,
  Network,
  Search,
  ShieldCheck,
  X,
  UserPlus as InviteIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  listUserPreferredPartnerRoutingRules,
  removeUserPreferredPartnerRoutingRule,
  saveUserPreferredPartnerRoutingRule,
} from '../lib/settingsApi'
import { recordWorkspaceAuditEvent } from '../services/auditLogService'
import { getBondPartnerPeople } from '../services/bondPartnerProfileService'
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

function getRoutingRoleTypeForPartnerOrganisationType(value = '') {
  const normalized = normalizeLower(value)
  if (normalized === 'bond_originator') return PARTNER_ROUTING_ROLE_TYPES.bondOriginator
  if (normalized === 'attorney_firm') return PARTNER_ROUTING_ROLE_TYPES.transferAttorney
  if (normalized === 'developer_company' || normalized === 'developer') return PARTNER_ROUTING_ROLE_TYPES.developer
  if (normalized === 'agency' || normalized === 'agency_network') return PARTNER_ROUTING_ROLE_TYPES.agent
  return PARTNER_ROUTING_ROLE_TYPES.agent
}

function getDirectAssignmentModeForPartnerOrganisationType(value = '') {
  const roleType = getRoutingRoleTypeForPartnerOrganisationType(value)
  if (roleType === PARTNER_ROUTING_ROLE_TYPES.agent) return PARTNER_ROUTING_MODES.directAgent
  if (
    roleType === PARTNER_ROUTING_ROLE_TYPES.transferAttorney ||
    roleType === PARTNER_ROUTING_ROLE_TYPES.bondAttorney ||
    roleType === PARTNER_ROUTING_ROLE_TYPES.cancellationAttorney
  ) {
    return PARTNER_ROUTING_MODES.directAttorney
  }
  return PARTNER_ROUTING_MODES.directConsultant
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

function PartnerCard({ partner, relationship, action, actionLabel, actionDisabled = false, profileHref = '', onProfileClick, muted = false }) {
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

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#edf2f7] pt-3">
        {onProfileClick ? (
          <button
            type="button"
            onClick={onProfileClick}
            className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#d9e4ef] bg-white px-3 text-sm font-semibold text-[#264563] transition hover:bg-[#f8fafc]"
          >
            Profile <ArrowUpRight size={14} />
          </button>
        ) : (
          <Link
            to={profileHref || `/partners/${partner?.id || ''}`}
            className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#d9e4ef] bg-white px-3 text-sm font-semibold text-[#264563] transition hover:bg-[#f8fafc]"
          >
            Profile <ArrowUpRight size={14} />
          </Link>
        )}
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
  partner,
  relationship,
  people = [],
  onSetPreferredPerson,
  savingPreferred = false,
}) {
  if (!partner) {
    return (
      <aside className="rounded-[8px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <p className="text-sm font-semibold text-[#10243a]">Select an organisation</p>
        <p className="mt-2 text-sm leading-6 text-[#60758d]">Profiles show the organisation connection, visible staff, and reusable operational preferences.</p>
      </aside>
    )
  }

  const staff = Array.isArray(people) ? people : []

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
        <div className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Overview</p>
          <p className="mt-2 text-sm leading-6 text-[#40556c]">
            Verified Bridge organisation operating in {[partner.city, partner.province].filter(Boolean).join(', ') || 'selected markets'} with a focus on {(partner.specialties || []).join(', ') || 'property transactions'}.
          </p>
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
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Operational People</p>
          <p className="mt-1 text-xs leading-5 text-[#60758d]">People visible through this organisation connection. Set one as the person you normally work with.</p>
          <div className="mt-3 space-y-2">
            {staff.length ? (
              staff.slice(0, 6).map((person) => (
                <div key={person.userId || person.id || person.name} className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#10243a]">{person.label || person.fullName || person.name || 'Partner user'}</p>
                      <p className="mt-1 text-xs text-[#60758d]">
                        {[person.role, person.branchName, person.regionName, person.teamName].filter(Boolean).join(' · ') || 'Visible through partner permissions'}
                      </p>
                    </div>
                    {onSetPreferredPerson && (person.userId || person.id) ? (
                      <button
                        type="button"
                        disabled={savingPreferred}
                        onClick={() => onSetPreferredPerson(person)}
                        className="shrink-0 rounded-[8px] border border-[#d9e4ef] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#264563] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:bg-[#edf2f7] disabled:text-[#7a8ba3]"
                      >
                        {savingPreferred ? 'Saving...' : 'Set'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-[#60758d]">No staff is visible for this organisation connection yet.</p>
            )}
          </div>
        </div>
        <div className="rounded-[8px] border border-[#e4ebf4] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Relationship Controls</p>
          <div className="mt-3 grid gap-2 text-sm text-[#40556c]">
            <p className="inline-flex items-center gap-2"><LockKeyhole size={15} className="text-[#52677f]" /> Organisation data stays permission-gated.</p>
            <p className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-[#52677f]" /> Transaction sharing is granted per transaction.</p>
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
  const navigate = useNavigate()
  const { workspace, workspaceType, role, profile, currentMembership } = useWorkspace()
  const { organisation } = useOrganisation()
  const organisationId = organisation?.partnerOrganisationId || organisation?.organisationId || workspace?.organisationId || organisation?.id || workspace?.id || ''
  const resolvedWorkspaceType = organisation?.type || workspaceType || role

  const [activeTab, setActiveTab] = useState('connected')
  const [selectedPartnerId, setSelectedPartnerId] = useState(partnerId)
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)
  const [discoverDirectory, setDiscoverDirectory] = useState([])
  const [discoverDirectoryLoading, setDiscoverDirectoryLoading] = useState(false)
  const [connectingPartnerIds, setConnectingPartnerIds] = useState(() => new Set())
  const [sentConnectionPartnerIds, setSentConnectionPartnerIds] = useState(() => new Set())
  const [preferredSavingRelationshipIds, setPreferredSavingRelationshipIds] = useState(() => new Set())
  const [preferredRoutingRules, setPreferredRoutingRules] = useState([])
  const [partnerPeopleByRelationshipId, setPartnerPeopleByRelationshipId] = useState({})
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
        listUserPreferredPartnerRoutingRules().catch(() => []),
      ])
      setSnapshot(nextSnapshot)
      setPreferredRoutingRules(Array.isArray(nextPreferredRoutingRules) ? nextPreferredRoutingRules : [])
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
    setSelectedPartnerId(partnerId)
  }, [partnerId])

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
          personName: isPersonPreference ? targetName || 'Preferred person' : targetName || partner?.name || 'Organisation fallback',
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

  const selectedPartnerPeople = useMemo(
    () => partnerPeopleByRelationshipId[normalizeText(selectedRelationship?.id || '')] || [],
    [partnerPeopleByRelationshipId, selectedRelationship?.id],
  )

  useEffect(() => {
    const relationshipId = normalizeText(selectedRelationship?.id || '')
    if (!relationshipId || partnerPeopleByRelationshipId[relationshipId]) return
    void ensurePartnerPeople(relationshipId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerPeopleByRelationshipId, selectedRelationship?.id])

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

  async function savePreferredRouteForRelationship(relationship, person = null) {
    const partnerOrganisationId = normalizeText(relationship?.partner?.id || relationship?.counterpartOrganisationId || relationship?.partnerOrganisationId)
    const existingRoutingRule = preferredRoutingRuleByPartnerOrgId.get(partnerOrganisationId) || null
    const personUserId = normalizeText(person?.userId || person?.id)
    const personName = normalizeText(person?.label || person?.fullName || person?.name || person?.email)
    const isPersonPreference = Boolean(personUserId)

    if (!relationship?.id || !partnerOrganisationId) {
      setError('Unable to update an operational partner without an organisation connection.')
      return
    }

    try {
      setError('')
      setPreferredSavingRelationshipIds((previous) => new Set(previous).add(relationship.id))

      const saved = await saveUserPreferredPartnerRoutingRule({
        id: existingRoutingRule?.id,
        ruleName: isPersonPreference
          ? `Preferred ${personName || 'person'} at ${relationship.partner?.name || 'Partner'}`
          : `Preferred ${relationship.partner?.name || 'Partner'}`,
        targetOrganisationId: partnerOrganisationId,
        targetScopeType: isPersonPreference ? PARTNER_ROUTING_TARGET_TYPES.consultant : PARTNER_ROUTING_TARGET_TYPES.orgQueue,
        targetScopeId: isPersonPreference ? personUserId : '',
        targetUserId: isPersonPreference ? personUserId : '',
        targetConsultantUserId: isPersonPreference ? personUserId : '',
        targetRoleType: getRoutingRoleTypeForPartnerOrganisationType(relationship.partner?.type),
        targetScopeName: isPersonPreference ? personName || 'Preferred person' : relationship.partner?.name || 'Preferred organisation',
        assignmentMode: isPersonPreference
          ? getDirectAssignmentModeForPartnerOrganisationType(relationship.partner?.type)
          : PARTNER_ROUTING_MODES.organisationQueue,
        assignmentPriority: 1,
        isActive: true,
        isDefault: true,
        notes: isPersonPreference
          ? `Operational partner set from Partner Network for ${relationship.partner?.name || 'connected organisation'}.`
          : `Organisation fallback set from Partner Network for ${relationship.partner?.name || 'connected organisation'}.`,
      })
      if (saved?.id) {
        setPreferredRoutingRules((previous) => {
          const next = previous.filter((rule) => {
            const ruleTargetOrganisationId = normalizeText(rule.targetOrganisationId || rule.target_organisation_id)
            return ruleTargetOrganisationId !== partnerOrganisationId && String(rule.id) !== String(saved.id)
          })
          return [...next, saved]
        })
      }
      setSnapshot((previous) => {
        if (!previous?.relationships) return previous
        return {
          ...previous,
          relationships: previous.relationships.map((item) =>
            String(item.id) === String(relationship.id)
              ? { ...item, preferred: true, relationshipType: 'preferred' }
              : item,
          ),
        }
      })
      setMessage(
        isPersonPreference
          ? `${personName || 'This person'} is now your operational partner at ${relationship.partner?.name || 'the connected organisation'}.`
          : `${relationship.partner?.name || 'Partner'} is now your organisation fallback.`,
      )

      await recordWorkspaceAuditEvent('partner_preferred_status_changed', {
        userId: profile?.id || '',
        workspaceId: organisationId,
        targetType: 'partner_relationship',
        targetId: relationship.id,
        metadata: {
          targetOrganisationId: partnerOrganisationId,
          targetUserId: isPersonPreference ? personUserId : null,
          preferred: true,
          source: 'partner_routing_rules',
        },
      })
    } catch (updateError) {
      setError(updateError?.message || 'Unable to update preferred status.')
    } finally {
      setPreferredSavingRelationshipIds((previous) => {
        const next = new Set(previous)
        next.delete(relationship.id)
        return next
      })
    }
  }

  async function handleMarkPreferred(relationship) {
    const partnerOrganisationId = normalizeText(relationship?.partner?.id || relationship?.counterpartOrganisationId || relationship?.partnerOrganisationId)
    const existingRoutingRule = preferredRoutingRuleByPartnerOrgId.get(partnerOrganisationId) || null
    const isCurrentlyPreferred = Boolean(
      relationship?.preferred ||
        relationship?.relationshipType === 'preferred' ||
        existingRoutingRule,
    )

    if (!relationship?.id || !partnerOrganisationId) {
      setError('Unable to update an operational partner without an organisation connection.')
      return
    }

    if (!isCurrentlyPreferred) {
      await savePreferredRouteForRelationship(relationship)
      return
    }

    try {
      setError('')
      setPreferredSavingRelationshipIds((previous) => new Set(previous).add(relationship.id))
      if (existingRoutingRule?.id) {
        await removeUserPreferredPartnerRoutingRule(existingRoutingRule.id)
        setPreferredRoutingRules((previous) => previous.filter((rule) => String(rule.id) !== String(existingRoutingRule.id)))
      }
      setSnapshot((previous) => {
        if (!previous?.relationships) return previous
        return {
          ...previous,
          relationships: previous.relationships.map((item) =>
            String(item.id) === String(relationship.id)
              ? { ...item, preferred: false, relationshipType: item.relationshipType === 'preferred' ? 'approved' : item.relationshipType }
              : item,
          ),
        }
      })
      setMessage(`${relationship.partner?.name || 'Partner'} removed from your operational partners.`)
      await recordWorkspaceAuditEvent('partner_preferred_status_changed', {
        userId: profile?.id || '',
        workspaceId: organisationId,
        targetType: 'partner_relationship',
        targetId: relationship.id,
        metadata: {
          targetOrganisationId: partnerOrganisationId,
          preferred: false,
          source: 'partner_routing_rules',
        },
      })
    } catch (updateError) {
      setError(updateError?.message || 'Unable to update operational partner.')
    } finally {
      setPreferredSavingRelationshipIds((previous) => {
        const next = new Set(previous)
        next.delete(relationship.id)
        return next
      })
    }
  }

  function handleOpenPartnerProfile(relationship) {
    const partnerOrganisationId = normalizeText(relationship?.partner?.id || relationship?.counterpartOrganisationId || relationship?.partnerOrganisationId)
    if (!partnerOrganisationId) {
      setError('Unable to open this partner profile.')
      return
    }

    if (isBondPartnersRoute && isUuidLike(relationship?.id)) {
      navigate(`/bond/partners/${relationship.id}`)
      return
    }

    setSelectedPartnerId(partnerOrganisationId)
    setError('')
    if (!partnerId || partnerId !== partnerOrganisationId) {
      navigate(`/partners/${encodeURIComponent(partnerOrganisationId)}`, { replace: false })
    }
    requestAnimationFrame(() => {
      profilePanelRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    })
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

  async function ensurePartnerPeople(relationshipId = '') {
    const safeRelationshipId = normalizeText(relationshipId)
    if (!safeRelationshipId) return []
    const existing = partnerPeopleByRelationshipId[safeRelationshipId]
    if (Array.isArray(existing)) return existing

    try {
      const payload = await getBondPartnerPeople(safeRelationshipId)
      const people = normalizeDefaultRoutingPeople(payload)
      setPartnerPeopleByRelationshipId((previous) => ({
        ...previous,
        [safeRelationshipId]: people,
      }))
      return people
    } catch (peopleError) {
      setError(peopleError?.message || 'Unable to load partner staff directory.')
      return []
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

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Organisation Connections" value={formatNumber(metrics.activePartners)} subtext={`${formatNumber(metrics.preferredPartners)} marked preferred`} />
        <MetricCard label="Operational Partners" value={formatNumber(preferredPartnerRows.length)} subtext="Reusable people and organisation fallbacks" />
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
                    const isSavingPreferred = preferredSavingRelationshipIds.has(relationship.id)
                    return (
                      <PartnerCard
                        key={relationship.id}
                        partner={relationship.partner}
                        relationship={{ ...relationship, preferred: isPreferred, relationshipType: isPreferred ? 'preferred' : relationship.relationshipType }}
                        onProfileClick={() => handleOpenPartnerProfile(relationship)}
                        action={() => handleMarkPreferred(relationship)}
                        actionDisabled={isSavingPreferred}
                        actionLabel={isSavingPreferred ? 'Saving...' : isPreferred ? 'Remove' : 'Make Fallback'}
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
                                  className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#d9e4ef] bg-white px-3 text-sm font-semibold text-[#264563] transition hover:bg-[#f8fafc]"
                                >
                                  Profile <ArrowUpRight size={14} />
                                </button>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {row.contactPerson ? (
                                  <span className="inline-flex rounded-full border border-[#d8eefe] bg-[#f4f9ff] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#1e4d82]">
                                    {row.contactPerson}
                                  </span>
                                ) : (
                                  <span className="inline-flex rounded-full border border-[#d8eefe] bg-[#f4f9ff] px-2.5 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#1e4d82]">
                                    Organisation fallback
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
              partner={selectedPartner}
              relationship={selectedRelationship}
              people={selectedPartnerPeople}
              savingPreferred={selectedRelationship?.id ? preferredSavingRelationshipIds.has(selectedRelationship.id) : false}
              onSetPreferredPerson={
                selectedRelationship
                  ? (person) => savePreferredRouteForRelationship(selectedRelationship, person)
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
