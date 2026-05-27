import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Filter,
  Handshake,
  LockKeyhole,
  Network,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus as InviteIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
  getPartnerAssignmentOptions,
  getPartnerScopeBadge,
  getPartnerTypeLabel,
  PARTNER_RELATIONSHIP_STATUSES,
  PARTNER_PROVINCES,
  PARTNER_SCOPE_LABELS,
  PARTNER_SPECIALTIES,
  PARTNER_SCOPE_TYPES,
  PARTNER_TYPES,
  fetchPartnersSnapshot,
  updatePartnerRelationshipStatus,
} from '../lib/partnersRepository'
import { recordWorkspaceAuditEvent } from '../services/auditLogService'

const TABS = [
  { key: 'connected', label: 'Connected Partners' },
  { key: 'sent', label: 'Sent Invitations' },
  { key: 'received', label: 'Received Invitations' },
  { key: 'discover', label: 'Discover Partners' },
  { key: 'referrals', label: 'Referrals & Opportunities' },
  { key: 'analytics', label: 'Partner Analytics' },
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

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function initials(value = '') {
  return String(value || 'Bridge')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'B9'
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

function MetricCard({ label, value, subtext }) {
  return (
    <div className="rounded-[8px] border border-[#dde7f2] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">{label}</p>
      <strong className="mt-2 block text-2xl font-semibold tracking-[-0.02em] text-[#10243a]">{value}</strong>
      {subtext ? <p className="mt-1 text-sm leading-5 text-[#60758d]">{subtext}</p> : null}
    </div>
  )
}

function PartnerLogo({ partner }) {
  if (partner?.logoUrl) {
    return (
      <img
        src={partner.logoUrl}
        alt=""
        className="h-12 w-12 rounded-[8px] border border-[#e2eaf4] object-cover"
      />
    )
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-[8px] border border-[#dfe8f3] bg-[#f6f9fc] text-sm font-semibold text-[#35546c]">
      {initials(partner?.name || partner?.companyName)}
    </div>
  )
}

function PartnerCard({ partner, relationship, action, actionLabel, muted = false }) {
  return (
    <article className={`rounded-[8px] border border-[#dbe5f0] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] ${muted ? 'opacity-75' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <PartnerLogo partner={partner} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold tracking-[-0.01em] text-[#10243a]">{partner?.name || 'Partner organisation'}</h3>
              {partner?.verificationStatus === 'verified' ? (
                <StatusBadge className="border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]">Verified</StatusBadge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-[#60758d]">
              {getPartnerTypeLabel(partner?.type)} · {[partner?.city, partner?.province].filter(Boolean).join(', ') || 'Location pending'}
            </p>
          </div>
        </div>
        {relationship ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <StatusBadge className={statusBadgeClass(relationship.relationshipStatus)}>
              {relationship.relationshipStatus === 'accepted' ? 'Connected' : relationship.relationshipStatus}
            </StatusBadge>
            {relationship.preferred || relationship.relationshipType === 'preferred' ? (
              <StatusBadge className={relationshipBadgeClass('preferred')}>Preferred</StatusBadge>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <StatusBadge className="border-[#e4ebf4] bg-[#f8fafc] text-[#52677f]">{getPartnerTypeLabel(partner?.type)}</StatusBadge>
        <PartnerScopeBadge relationship={relationship} />
        {(partner?.specialties || []).slice(0, 4).map((specialty) => (
          <span key={specialty} className="rounded-full border border-[#e4ebf4] bg-[#f8fafc] px-2.5 py-1 text-xs font-semibold text-[#52677f]">
            {specialty}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[#edf2f7] pt-4">
        <div>
          <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#8ba0b8]">Shared Files</span>
          <strong className="mt-1 block text-sm text-[#10243a]">{formatNumber(partner?.transactionStats?.activeTransactions)}</strong>
        </div>
        <div>
          <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#8ba0b8]">Avg Response</span>
          <strong className="mt-1 block text-sm text-[#10243a]">{formatNumber(partner?.transactionStats?.responseTimeHours)}h</strong>
        </div>
        <div>
          <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#8ba0b8]">Completion</span>
          <strong className="mt-1 block text-sm text-[#10243a]">{formatNumber(partner?.transactionStats?.avgDealSpeedDays)}d</strong>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Link
          to={`/partners/${partner?.id || ''}`}
          className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[#d9e4ef] bg-white px-3 text-sm font-semibold text-[#264563] transition hover:bg-[#f8fafc]"
        >
          Profile <ArrowUpRight size={14} />
        </Link>
        {action ? (
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-[#10243a] px-3 text-sm font-semibold text-white transition hover:bg-[#173a5e]"
            onClick={action}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </article>
  )
}

function ProfilePanel({ partner, relationship }) {
  if (!partner) {
    return (
      <aside className="rounded-[8px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
        <p className="text-sm font-semibold text-[#10243a]">Select a partner profile</p>
        <p className="mt-2 text-sm leading-6 text-[#60758d]">Profiles show operating areas, relationship status, shared visibility, and performance signals.</p>
      </aside>
    )
  }

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
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Relationship Controls</p>
          <div className="mt-3 grid gap-2 text-sm text-[#40556c]">
            <span className="inline-flex items-center gap-2"><LockKeyhole size={14} /> Listing visibility remains permission-gated.</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck size={14} /> Access is role-based and organisation-scoped.</span>
            <span className="inline-flex items-center gap-2"><Handshake size={14} /> Status: {relationship?.relationshipStatus || 'Not connected'}</span>
            {relationship ? <span className="inline-flex items-center gap-2"><Network size={14} /> {getPartnerScopeBadge(relationship).label}</span> : null}
          </div>
        </div>
      </div>
    </aside>
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

export default function PartnersPage() {
  const { partnerId = '' } = useParams()
  const { workspace, workspaceType, role, profile, currentMembership } = useWorkspace()
  const { organisation } = useOrganisation()
  const organisationId = organisation?.id || workspace?.id || ''
  const resolvedWorkspaceType = organisation?.type || workspaceType || role

  const [activeTab, setActiveTab] = useState('connected')
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteOrganisationQuery, setInviteOrganisationQuery] = useState('')
  const [selectedInviteOrganisationId, setSelectedInviteOrganisationId] = useState('')
  const [inviteType, setInviteType] = useState('agency')
  const [inviteNote, setInviteNote] = useState('')
  const [inviteScopeValue, setInviteScopeValue] = useState('')
  const [inviteScopeTargetId, setInviteScopeTargetId] = useState('')
  const [inviteScopeTargetName, setInviteScopeTargetName] = useState('')
  const [invitePreferred, setInvitePreferred] = useState(false)

  const [filters, setFilters] = useState({ query: '', type: '', province: '', specialty: '' })
  const [directoryFilters, setDirectoryFilters] = useState({
    scope: 'all',
    type: '',
    status: 'accepted',
    preferredOnly: false,
  })
  const [analyticsScope, setAnalyticsScope] = useState('all')

  const accessContext = useMemo(
    () => ({
      organisationId,
      role,
      profile,
      currentMembership,
    }),
    [currentMembership, organisationId, profile, role],
  )

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
    const selected = allowedScopes.find((scope) => scope.value === inviteScopeValue) || fallback
    return selected
  }, [allowedScopes, inviteScopeValue, organisationId])

  const inviteScopeNeedsTarget = Boolean(selectedInviteScope?.requiresTarget)

  const loadSnapshot = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const nextSnapshot = await fetchPartnersSnapshot({
        organisationId,
        workspaceType: resolvedWorkspaceType,
        accessContext,
      })
      setSnapshot(nextSnapshot)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load partner network.')
    } finally {
      setLoading(false)
    }
  }, [accessContext, organisationId, resolvedWorkspaceType])

  useEffect(() => {
    void loadSnapshot()
  }, [loadSnapshot])

  useEffect(() => {
    if (inviteScopeValue && allowedScopes.some((scope) => scope.value === inviteScopeValue)) return
    setInviteScopeValue(allowedScopes[0]?.value || '')
  }, [allowedScopes, inviteScopeValue])

  const relationships = useMemo(() => snapshot?.relationships || [], [snapshot?.relationships])
  const connectedRelationships = useMemo(
    () => filterPartnerRelationshipsByScope(relationships, accessContext).filter((item) => item.relationshipStatus === 'accepted'),
    [accessContext, relationships],
  )
  const visibleConnectedRelationships = useMemo(
    () =>
      connectedRelationships.filter((relationship) => {
        if (directoryFilters.status && relationship.relationshipStatus !== directoryFilters.status) return false
        if (directoryFilters.scope !== 'all' && relationship.scopeType !== directoryFilters.scope) return false
        if (directoryFilters.type && relationship.partner?.type !== directoryFilters.type) return false
        if (directoryFilters.preferredOnly && !relationship.preferred && relationship.relationshipType !== 'preferred') return false
        return true
      }),
    [connectedRelationships, directoryFilters],
  )
  const invitations = useMemo(() => snapshot?.invitations || [], [snapshot?.invitations])

  const sentInvitations = useMemo(
    () => invitations.filter((item) => item.fromOrganisationId === organisationId),
    [invitations, organisationId],
  )

  const receivedInvitations = useMemo(
    () => invitations.filter((item) => item.toOrganisationId === organisationId),
    [invitations, organisationId],
  )

  const pendingReceivedInvitations = useMemo(
    () => receivedInvitations.filter((item) => (normalizeLower(item.status) || 'pending') === 'pending'),
    [receivedInvitations],
  )

  const metrics = snapshot?.metrics || {}
  const currentType = resolvedWorkspaceType
  const discoverablePartners = useMemo(() => {
    const connectedIds = new Set(relationships.map((item) => item.counterpartOrganisationId || item.partner?.id))
    return filterDiscoverablePartners(snapshot?.organisations || [], filters).filter((partner) => {
      if (!canConnectPartnerTypes(currentType, partner.type)) return false
      return !connectedIds.has(partner.id)
    })
  }, [currentType, filters, relationships, snapshot?.organisations])

  const selectedInviteOrganisation = useMemo(() => {
    if (selectedInviteOrganisationId) {
      return (snapshot?.organisations || []).find((item) => item.id === selectedInviteOrganisationId) || null
    }

    const email = normalizeLower(inviteEmail)
    if (!email) return null

    return (
      (snapshot?.organisations || []).find((organisation) =>
        (organisation.contactEmails || []).some((candidate) => normalizeLower(candidate) === email),
      ) || null
    )
  }, [inviteEmail, selectedInviteOrganisationId, snapshot?.organisations])

  const inviteOrganisationResults = useMemo(() => {
    const query = normalizeLower(inviteOrganisationQuery)
    if (!query) return []
    return (snapshot?.organisations || [])
      .filter((item) => normalizeLower(item.name).includes(query))
      .slice(0, 5)
  }, [inviteOrganisationQuery, snapshot?.organisations])

  const selectedPartner = useMemo(() => {
    if (!partnerId) return connectedRelationships[0]?.partner || discoverablePartners[0] || null
    return (
      (snapshot?.organisations || []).find((item) => item.id === partnerId) ||
      connectedRelationships.find((item) => item.partner?.id === partnerId)?.partner ||
      null
    )
  }, [connectedRelationships, discoverablePartners, partnerId, snapshot?.organisations])

  const selectedRelationship = useMemo(
    () => connectedRelationships.find((item) => item.partner?.id === selectedPartner?.id) || null,
    [connectedRelationships, selectedPartner?.id],
  )

  const transactionPartnerOptions = useMemo(
    () => ({
      attorneys: getPartnerAssignmentOptions(snapshot || {}, 'transfer_attorney', accessContext),
      bondOriginators: getPartnerAssignmentOptions(snapshot || {}, 'bond_originator', accessContext),
    }),
    [accessContext, snapshot],
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
      await loadSnapshot()
    } catch (inviteError) {
      setError(inviteError?.message || 'Unable to send partner invitation.')
    }
  }

  async function handleConnect(partner) {
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
      setMessage(`Connection request sent to ${partner.name}.`)
      await loadSnapshot()
    } catch (connectError) {
      setError(connectError?.message || 'Unable to request partner connection.')
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

  function clearInviteOrganisation() {
    setSelectedInviteOrganisationId('')
    setInviteOrganisationQuery('')
  }

  const detectedInviteType = selectedInviteOrganisation?.type

  return (
    <div className="min-h-full bg-[#f6f8fb] pb-10 text-[#10243a]">
      <section className="rounded-[8px] border border-[#d9e4ef] bg-white p-5 shadow-[0_16px_38px_rgba(15,23,42,0.06)] sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#7890aa]">Partners</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#10243a]">Professional relationship infrastructure</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#60758d]">
              Manage trusted organisations, reusable transaction role players, controlled shared visibility, referrals, and relationship performance.
            </p>
          </div>
          <form onSubmit={handleInvite} className="w-full rounded-[8px] border border-[#e0e8f2] bg-[#f8fafc] p-3 lg:max-w-xl">
            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Invite partner</label>
            <div className="mt-2 grid gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(event.target.value)
                  if (selectedInviteOrganisationId) {
                    setSelectedInviteOrganisationId('')
                  }
                }}
                placeholder="partner@firm.co.za"
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
                placeholder="Optional message for this invitation"
                className="min-h-[72px] rounded-[8px] border border-[#d7e2ee] bg-white px-3 py-2 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10"
              />
              <div className="flex gap-2 flex-wrap">
                <button
                  type="submit"
                  className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#10243a] px-3 text-sm font-semibold text-white"
                >
                  <InviteIcon size={15} /> Invite
                </button>
                {detectedInviteType ? (
                  <button
                    type="button"
                    onClick={clearInviteOrganisation}
                    className="inline-flex h-10 items-center rounded-[8px] border border-[#d3deea] bg-white px-3 text-sm font-semibold text-[#35546c] hover:bg-[#f8fafc]"
                  >
                    Clear selected
                  </button>
                ) : null}
                <div className="inline-flex h-10 items-center rounded-[8px] border border-[#d3deea] bg-white px-3 text-sm text-[#35546c]">
                  <span className="inline-block rounded-full border border-[#c3d0e3] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.11em]">
                    {getPartnerTypeLabel(detectedInviteType || inviteType)}
                  </span>
                </div>
                {!selectedInviteOrganisation && (
                  <select
                    value={inviteType}
                    onChange={(event) => setInviteType(event.target.value)}
                    className="rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
                  >
                    {PARTNER_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                )}
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
                <label className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#d3deea] bg-white px-3 text-sm font-semibold text-[#35546c]">
                  <input
                    type="checkbox"
                    checked={invitePreferred}
                    onChange={(event) => setInvitePreferred(event.target.checked)}
                    className="h-4 w-4 rounded border-[#c8d6e5] text-[#10243a]"
                  />
                  Preferred
                </label>
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
                        className="rounded-[8px] border border-[#dbe5f0] bg-white p-2 text-left text-sm text-[#10243a] hover:bg-[#f6f9ff]"
                      >
                        <p className="font-semibold">{organisation.name}</p>
                        <p className="text-xs text-[#60758d]">{getPartnerTypeLabel(organisation.type)} · {organisation.city || 'Unspecified city'}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </form>
        </div>

        {snapshot?.source === 'demo' ? (
          <p className="mt-4 rounded-[8px] border border-[#f0dfb8] bg-[#fff9ec] px-4 py-3 text-sm font-semibold text-[#8a5a12]">
            Demo partner data is shown until the Partners migration is available in this environment.
          </p>
        ) : null}
        {error ? <p className="mt-4 rounded-[8px] border border-[#f1c9c5] bg-[#fff5f4] px-4 py-3 text-sm font-semibold text-[#b42318]">{error}</p> : null}
        {message ? <p className="mt-4 rounded-[8px] border border-[#cfe8dc] bg-[#f1fbf6] px-4 py-3 text-sm font-semibold text-[#17613d]">{message}</p> : null}
      </section>

      <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Active Partners" value={formatNumber(metrics.activePartners)} subtext={`${formatNumber(metrics.preferredPartners)} preferred`} />
        <MetricCard label="Invite Acceptance" value={`${formatNumber(metrics.inviteAcceptanceRate)}%`} subtext={`${formatNumber(metrics.newPartnerGrowth)} new in 30 days`} />
        <MetricCard label="Shared Deals" value={formatNumber(metrics.activeSharedDeals)} subtext={`${formatNumber(metrics.completedDeals)} completed registrations`} />
        <MetricCard label="Referral Influence" value={formatCurrency(metrics.revenueInfluenced)} subtext={`${formatNumber(metrics.referralConversionRate)}% conversion`} />
      </section>

      <nav className="mt-5 flex gap-2 overflow-x-auto rounded-[8px] border border-[#dbe5f0] bg-white p-1.5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`h-10 shrink-0 rounded-[8px] px-3 text-sm font-semibold transition ${
              activeTab === tab.key ? 'bg-[#10243a] text-white' : 'text-[#52677f] hover:bg-[#f6f8fb] hover:text-[#10243a]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <section className="mt-5 rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm font-semibold text-[#60758d]">
          Loading partner network...
        </section>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="min-w-0">
            {activeTab === 'connected' ? (
              <section>
                <div className="mb-4 rounded-[8px] border border-[#dbe5f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#10243a]"><SlidersHorizontal size={16} /> Partner directory filters</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <select
                      className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
                      value={directoryFilters.scope}
                      onChange={(event) => setDirectoryFilters((previous) => ({ ...previous, scope: event.target.value }))}
                    >
                      <option value="all">All Scopes</option>
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
                      <option value="">All partner types</option>
                      {PARTNER_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
                      value={directoryFilters.status}
                      onChange={(event) => setDirectoryFilters((previous) => ({ ...previous, status: event.target.value }))}
                    >
                      <option value="">All statuses</option>
                      {PARTNER_RELATIONSHIP_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
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
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {visibleConnectedRelationships.map((relationship) => (
                    <PartnerCard
                      key={relationship.id}
                      partner={relationship.partner}
                      relationship={relationship}
                      action={() => handleMarkPreferred(relationship)}
                      actionLabel={relationship.preferred || relationship.relationshipType === 'preferred' ? 'Remove Preferred' : 'Make Preferred'}
                    />
                  ))}
                </div>
                {!connectedRelationships.length ? (
                  <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">
                    No connected partners yet. Invite trusted organisations to collaborate on transactions.
                  </div>
                ) : null}
                {connectedRelationships.length && !visibleConnectedRelationships.length ? (
                  <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">
                    No partners match the selected filters.
                  </div>
                ) : null}
              </section>
            ) : null}

            {activeTab === 'sent' ? (
              <section className="space-y-3">
                {sentInvitations.map((invitation) => {
                  const organisationName = invitationPartnerName(invitation, organisationId)
                  const organisationType = invitationPartnerType(invitation, organisationId)
                  return (
                    <div
                      key={invitation.id}
                      className="flex flex-col gap-3 rounded-[8px] border border-[#dbe5f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <PartnerLogo partner={{ name: organisationName }} />
                        <div>
                          <p className="font-semibold text-[#10243a]">{organisationName}</p>
                          <p className="text-sm text-[#60758d]">{organisationType}</p>
                          <p className="mt-1 text-sm text-[#60758d]">Status: {invitation.status || 'pending'} · Sent {formatDate(invitation.createdAt)}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <PartnerScopeBadge relationship={invitation} />
                            {invitation.preferred ? <StatusBadge className={relationshipBadgeClass('preferred')}>Preferred</StatusBadge> : null}
                          </div>
                          {invitation.message ? <p className="mt-2 text-sm text-[#40556c]">{invitation.message}</p> : null}
                          {invitation.invitedByUserId ? <p className="mt-1 text-xs text-[#8a9ab2]">Invited by user {invitation.invitedByUserId}</p> : null}
                        </div>
                      </div>
                      <StatusBadge className={statusBadgeClass(invitation.status)}>
                        Status: {(normalizeLower(invitation.status) || 'pending').charAt(0).toUpperCase() + (normalizeLower(invitation.status) || 'pending').slice(1)}
                      </StatusBadge>
                    </div>
                  )
                })}
                {!sentInvitations.length ? (
                  <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">No pending invitations sent.</div>
                ) : null}
              </section>
            ) : null}

            {activeTab === 'received' ? (
              <section className="space-y-3">
                {pendingReceivedInvitations.map((invitation) => {
                  const fromName = invitationPartnerName(invitation, organisationId)
                  const fromType = invitationPartnerType(invitation, organisationId)
                  const requestMessage = invitation.message || 'Wants to connect with your organisation.'
                  return (
                    <div
                      key={invitation.id}
                      className="rounded-[8px] border border-[#dbe5f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex min-w-0 gap-3">
                          <PartnerLogo partner={{ name: fromName }} />
                          <div>
                            <p className="font-semibold text-[#10243a]">{fromName}</p>
                            <p className="text-sm text-[#60758d]">{fromType}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <PartnerScopeBadge relationship={invitation} />
                              {invitation.preferred ? <StatusBadge className={relationshipBadgeClass('preferred')}>Preferred</StatusBadge> : null}
                            </div>
                            <p className="mt-2 text-sm text-[#40556c]">{requestMessage}</p>
                            <p className="mt-1 text-xs text-[#6f7f95]">Sent {formatDate(invitation.createdAt)}</p>
                          </div>
                        </div>
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
                      </div>
                    </div>
                  )
                })}
                {!pendingReceivedInvitations.length ? (
                  <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-8 text-sm text-[#60758d]">No partner requests waiting for your response.</div>
                ) : null}
              </section>
            ) : null}

            {activeTab === 'discover' ? (
              <section>
                <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#10243a]"><Filter size={16} /> Discovery filters</div>
                  <div className="mt-3 grid gap-3 md:grid-cols-4">
                    <label className="relative md:col-span-1">
                      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ba0b8]" />
                      <input
                        value={filters.query}
                        onChange={(event) => setFilters((previous) => ({ ...previous, query: event.target.value }))}
                        placeholder="Search firms"
                        className="h-10 w-full rounded-[8px] border border-[#d7e2ee] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-4 focus:ring-[#1f4f78]/10"
                      />
                    </label>
                    <select className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm" value={filters.type} onChange={(event) => setFilters((previous) => ({ ...previous, type: event.target.value }))}>
                      <option value="">All organisation types</option>
                      {PARTNER_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                    </select>
                    <select className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm" value={filters.province} onChange={(event) => setFilters((previous) => ({ ...previous, province: event.target.value }))}>
                      <option value="">All provinces</option>
                      {PARTNER_PROVINCES.map((province) => <option key={province} value={province}>{province}</option>)}
                    </select>
                    <select className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm" value={filters.specialty} onChange={(event) => setFilters((previous) => ({ ...previous, specialty: event.target.value }))}>
                      <option value="">All specialties</option>
                      {PARTNER_SPECIALTIES.map((specialty) => <option key={specialty} value={specialty}>{specialty}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {discoverablePartners.map((partner) => (
                    <PartnerCard key={partner.id} partner={partner} action={() => handleConnect(partner)} actionLabel="Connect" />
                  ))}
                </div>
              </section>
            ) : null}

            {activeTab === 'referrals' ? (
              <section className="space-y-3">
                {snapshot?.referrals?.map((referral) => {
                  const partner = (snapshot?.organisations || []).find((item) => [referral.referringOrganisationId, referral.referredOrganisationId].includes(item.id))
                  return (
                    <div key={referral.id} className="grid gap-3 rounded-[8px] border border-[#dbe5f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)] md:grid-cols-[1fr_auto]">
                      <div>
                        <p className="font-semibold text-[#10243a]">{partner?.name || 'Referral partner'}</p>
                        <p className="mt-1 text-sm text-[#60758d]">Transaction {referral.transactionId || 'unlinked'} · {formatDate(referral.referralDate)}</p>
                      </div>
                      <div className="text-left md:text-right">
                        <StatusBadge className="border-[#d9e7ff] bg-[#f3f7ff] text-[#1e4d82]">{referral.referralStatus}</StatusBadge>
                        <p className="mt-2 text-sm font-semibold text-[#10243a]">{formatCurrency(referral.referralValue)}</p>
                      </div>
                    </div>
                  )
                })}
              </section>
            ) : null}

            {activeTab === 'analytics' ? (
              <section className="space-y-4">
                <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#10243a]"><BarChart3 size={16} /> Scope-aware analytics</div>
                    <select
                      className="h-10 rounded-[8px] border border-[#d7e2ee] bg-white px-3 text-sm"
                      value={analyticsScope}
                      onChange={(event) => setAnalyticsScope(event.target.value)}
                    >
                      <option value="all">All scopes</option>
                      <option value="partner">Partner organisation</option>
                      {PARTNER_SCOPE_TYPES.map((scopeType) => (
                        <option key={scopeType} value={scopeType}>
                          {PARTNER_SCOPE_LABELS[scopeType]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <MetricCard label="Avg Response" value={`${formatNumber(metrics.avgResponseTimeHours)}h`} subtext="Connected partner average" />
                  <MetricCard label="Document Turnaround" value={`${formatNumber(metrics.documentTurnaroundDays)}d`} subtext="Operational signal" />
                  <MetricCard label="Finance Approval" value={`${formatNumber(metrics.financeApprovalRate)}%`} subtext="Bond collaboration signal" />
                </div>
                <div className="rounded-[8px] border border-[#dbe5f0] bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#10243a]"><BarChart3 size={16} /> Internal scoring framework</div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {['Fastest Attorney', 'Highest Bond Approval Rate', 'Most Active Agency', 'Highest Conversion Rate'].map((label, index) => (
                      <div key={label} className="rounded-[8px] border border-[#e4ebf4] bg-[#f8fafc] p-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">{label}</p>
                        <p className="mt-2 text-sm font-semibold text-[#10243a]">{connectedRelationships[index % Math.max(connectedRelationships.length, 1)]?.partner?.name || 'Benchmark pending'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}
          </main>

          <div className="space-y-5">
            <ProfilePanel partner={selectedPartner} relationship={selectedRelationship} />
            <section className="rounded-[8px] border border-[#dbe5f0] bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#10243a]"><SlidersHorizontal size={16} /> Transaction defaults</div>
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
              <div className="flex items-center gap-2 text-sm font-semibold text-[#10243a]"><Network size={16} /> Shared visibility</div>
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
