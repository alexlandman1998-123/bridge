import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DollarSign,
  Edit3,
  FileText,
  Grid2X2,
  KeyRound,
  List,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Trash2,
  Trophy,
  UserCog,
  UserCircle2,
  Users,
  XCircle,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useWorkspace } from '../context/WorkspaceContext'
import { canAccessAgentsModule, canManageAgentOrganisations } from '../lib/roles'
import { fetchTransactionsByParticipantSummary, fetchTransactionsListSummary, saveTransaction } from '../lib/api'
import { listAppointmentsAsync } from '../lib/agencyPipelineService'
import { invokeEdgeFunction, isSupabaseConfigured } from '../lib/supabaseClient'
import { isUnsafeFallbackAllowed } from '../lib/envValidation'
import {
  assignOrganisationUserCommissionProfile,
  deactivateOrganisationUser,
  fetchOrganisationSettings,
  listOrganisationCommissionStructures,
  listOrganisationUsers,
  updateOrganisationUserRole,
} from '../lib/settingsApi'
import { normalizeOrganisationMembershipRole } from '../lib/organisationAccess'
import {
  AGENT_INVITE_STATUS,
  AGENT_ROLE_OPTIONS,
  buildAgentInviteLink,
  createAgentOrganisation,
  createAgentInvite,
  markAgentInviteSent,
  readAgentDirectory,
  readAgentInvites,
  removeAgentFromOrganisation,
  revokeAgentInvite,
  setAgentStatus,
  updateAgentRole,
} from '../lib/agentInviteService'
import { formatSouthAfricanWhatsAppNumber, sendWhatsAppNotification } from '../lib/whatsapp'
import { AGENT_DATE_RANGE_OPTIONS, LEADERBOARD_METRICS } from '../modules/agency/agents/agentPerformanceUtils'
import { loadAgentPerformanceSources } from '../modules/agency/agents/agentPerformanceDataService'
import { getPrincipalAgentCommandCentre } from '../modules/agency/agents/principalAgentCommandCentreService'
import {
  discoverAgentOffboardingAssets,
  executeAgentAssetReassignment,
  hasBlockingAgentAssets,
} from '../services/agentOffboardingService'
import {
  buildTransferMembershipReport,
  executeAgentTransferRetention,
  recordAgentTransferMembershipTransition,
  validateTransferRetentionStrategy,
} from '../services/agentTransferService'

const PRIVATE_LISTINGS_STORAGE_KEY = 'itg:agent-private-listings:v1'
const PIPELINE_STORAGE_KEY = 'itg:pipeline-leads:v1'

const AGENT_WORKSPACE_TABS = [
  { key: 'overview', label: 'Overview', icon: Grid2X2 },
  { key: 'listings', label: 'Listings', icon: Building2 },
  { key: 'transactions', label: 'Transactions', icon: BriefcaseBusiness },
  { key: 'pipeline', label: 'Pipeline', icon: ArrowRight },
  { key: 'performance', label: 'Performance', icon: Trophy },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'reviews', label: 'Reviews', icon: Star },
  { key: 'commission', label: 'Commission', icon: DollarSign },
  { key: 'permissions', label: 'Permissions', icon: ShieldCheck },
  { key: 'settings', label: 'Settings', icon: Settings },
]

const ORGANISATION_ROLE_OPTIONS = [
  { value: 'owner', label: 'Organisation Owner' },
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'principal', label: 'Principal / Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'branch_admin', label: 'Branch Admin / Manager' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'senior_agent', label: 'Senior Agent' },
  { value: 'agent', label: 'Agent' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'transaction_coordinator', label: 'Transaction Coordinator' },
  { value: 'listing_coordinator', label: 'Listing Coordinator' },
  { value: 'admin_coordinator', label: 'Admin Coordinator' },
]

const EMPTY_ORGANISATION = { id: 'all', name: 'All Organisations' }

const PIPELINE_STATUS_ORDER = [
  'New Lead',
  'Contacted',
  'Viewing Scheduled',
  'Interested',
  'Offer Pending',
  'Converted to Transaction',
  'Lost',
]

const AGENT_STATUS_LABELS = {
  [AGENT_INVITE_STATUS.PENDING_INVITE]: 'Pending Invite',
  [AGENT_INVITE_STATUS.INVITE_SENT]: 'Invite Sent',
  [AGENT_INVITE_STATUS.ONBOARDING_STARTED]: 'Onboarding Started',
  [AGENT_INVITE_STATUS.ACTIVE]: 'Active',
  [AGENT_INVITE_STATUS.EXPIRED]: 'Expired',
  [AGENT_INVITE_STATUS.REVOKED]: 'Revoked',
}

const AGENT_STATUS_PILL_CLASS = {
  [AGENT_INVITE_STATUS.ACTIVE]: 'border-[#d7e7dd] bg-[#edf9f1] text-[#1d7d45]',
  [AGENT_INVITE_STATUS.ONBOARDING_STARTED]: 'border-[#dbe6f4] bg-[#f1f7ff] text-[#1f4f78]',
  [AGENT_INVITE_STATUS.INVITE_SENT]: 'border-[#e7ddf7] bg-[#f7f1ff] text-[#5c3a9d]',
  [AGENT_INVITE_STATUS.PENDING_INVITE]: 'border-[#e7ddf7] bg-[#f7f1ff] text-[#5c3a9d]',
  [AGENT_INVITE_STATUS.EXPIRED]: 'border-[#f4e2c9] bg-[#fff7ed] text-[#9a5b13]',
  [AGENT_INVITE_STATUS.REVOKED]: 'border-[#f3d8d8] bg-[#fff4f4] text-[#a03c3c]',
}

const SUPPORT_USER_ROLES = new Set(['assistant', 'transaction_coordinator', 'listing_coordinator', 'admin_coordinator', 'admin_staff'])

function formatRoleLabel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  const matched = ORGANISATION_ROLE_OPTIONS.find((item) => item.value === normalized) || AGENT_ROLE_OPTIONS.find((item) => item.value === normalized)
  return matched?.label || 'Agent'
}

function canReceiveOperationalOwnership(agent = {}) {
  const role = String(agent?.role || agent?.workspaceRole || agent?.organisationRole || '').trim().toLowerCase()
  return !SUPPORT_USER_ROLES.has(role)
}

function formatPercent(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '0%'
  return `${numeric.toFixed(2).replace(/\.00$/, '')}%`
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getAgentInitials(agent) {
  const source = String(agent?.name || agent?.email || 'Agent').trim()
  const parts = source.includes('@') ? source.split('@')[0].split(/[._\s-]+/) : source.split(/\s+/)
  return parts
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'A'
}

function getAgentAvatarUrl(agent = {}) {
  return String(
    agent.avatarUrl ||
      agent.avatar_url ||
      agent.profilePhotoUrl ||
      agent.profile_photo_url ||
      agent.photoUrl ||
      agent.photo_url ||
      agent.picture ||
      '',
  ).trim()
}

function AgentAvatar({ agent = {}, initials = '', className = '' }) {
  const avatarUrl = getAgentAvatarUrl(agent)
  const safeInitials = initials || agent.initials || getAgentInitials(agent)

  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}>
      {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : safeInitials}
    </span>
  )
}

function buildInviteMessage({ invite, inviteLink }) {
  const agentName = `${invite?.firstName || ''} ${invite?.surname || ''}`.trim() || 'Agent'
  const orgName = invite?.organisationName || 'your organisation'
  return `Hi ${agentName},\n\nYou have been invited to join ${orgName} on Bridge 9.\n\nComplete your agent onboarding here:\n${inviteLink}\n\n- Bridge`
}

function AgentInviteModal({
  open,
  onClose,
  onSubmit,
  submitting = false,
  error = '',
  success = '',
  form,
  onChange,
  organisationOptions = [],
  branchOptions = [],
  commissionStructureOptions = [],
  defaultCommissionStructure = null,
  showOrganisationSelect = false,
  onManageCommissionStructures,
}) {
  const hasCommissionStructures = commissionStructureOptions.length > 0
  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title="Add Agent"
      subtitle="Invite an agent to your organisation. They will receive an onboarding link by email and WhatsApp."
      className="max-w-4xl"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="agent-invite-form" disabled={submitting}>
            {submitting ? 'Sending Invite…' : 'Send Invite'}
          </Button>
        </div>
      }
    >
      <form id="agent-invite-form" className="space-y-5" onSubmit={onSubmit}>
        <section className="rounded-[16px] border border-[#e1e8f2] bg-[#fbfcfe] p-4">
          <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#7a8ca2]">Agent Details</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">First Name</span>
              <Field value={form.firstName} onChange={(event) => onChange('firstName', event.target.value)} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Surname</span>
              <Field value={form.surname} onChange={(event) => onChange('surname', event.target.value)} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Email Address</span>
              <Field type="email" value={form.email} onChange={(event) => onChange('email', event.target.value)} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Mobile Number</span>
              <Field value={form.mobile} onChange={(event) => onChange('mobile', event.target.value)} />
            </label>
          </div>
        </section>

        <section className="rounded-[16px] border border-[#e1e8f2] bg-[#fbfcfe] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#7a8ca2]">Commercial Details</p>
              <p className="mt-1 text-sm text-[#61748d]">Set the commission structure before this agent starts generating pipeline or transaction data.</p>
            </div>
            {!hasCommissionStructures ? (
              <Button type="button" variant="ghost" onClick={onManageCommissionStructures}>
                Set Up
              </Button>
            ) : null}
          </div>
          {hasCommissionStructures ? (
            <label className="mt-3 grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Commission Structure</span>
              <Field as="select" value={form.commissionStructureId || ''} onChange={(event) => onChange('commissionStructureId', event.target.value)}>
                <option value="">
                  {defaultCommissionStructure
                    ? `Use agency default: ${defaultCommissionStructure.name}`
                    : 'Select commission structure'}
                </option>
                {commissionStructureOptions.map((structure) => (
                  <option key={structure.id} value={structure.id}>
                    {structure.name} ({formatPercent(structure.agentSplitPercentage)} agent / {formatPercent(structure.agencySplitPercentage)} agency)
                  </option>
                ))}
              </Field>
            </label>
          ) : (
            <div className="mt-3 rounded-[12px] border border-[#f3d9a8] bg-[#fff8ec] px-3 py-2 text-sm text-[#8a5b13]">
              Create at least one commission structure before inviting agents so new transactions do not fall back to generic splits.
            </div>
          )}
        </section>

        <section className="rounded-[16px] border border-[#e1e8f2] bg-[#fbfcfe] p-4">
          <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#7a8ca2]">Organisation Details</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {showOrganisationSelect ? (
              <label className="grid gap-1.5">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Organisation</span>
                <Field as="select" value={form.organisationId} onChange={(event) => onChange('organisationId', event.target.value)}>
                  {organisationOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Field>
              </label>
            ) : (
              <label className="grid gap-1.5">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Organisation</span>
                <Field value={form.organisationName} disabled />
              </label>
            )}

            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Role / Permission</span>
              <Field as="select" value={form.role} onChange={(event) => onChange('role', event.target.value)}>
                {AGENT_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Field>
            </label>

            <label className="grid gap-1.5 md:col-span-2">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch / Office (optional)</span>
              <Field
                as="select"
                value={form.branchId || ''}
                onChange={(event) => {
                  const branchId = event.target.value
                  const selectedBranch = branchOptions.find((branch) => branch.id === branchId)
                  onChange('branchId', branchId)
                  onChange('office', selectedBranch?.name || '')
                }}
              >
                <option value="">{branchOptions.length ? 'Select branch' : 'No branches available'}</option>
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Field>
            </label>
          </div>
        </section>

        <section className="rounded-[16px] border border-[#e1e8f2] bg-[#fbfcfe] p-4">
          <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#7a8ca2]">Notes</p>
          <label className="mt-3 grid gap-1.5">
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Internal Notes (optional)</span>
            <Field as="textarea" value={form.notes} onChange={(event) => onChange('notes', event.target.value)} placeholder="Add context for this invite" />
          </label>
        </section>

        {error ? <p className="rounded-[12px] border border-[#f2d7d7] bg-[#fff6f6] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
        {success ? <p className="rounded-[12px] border border-[#d6ece0] bg-[#edf9f1] px-3 py-2 text-sm text-[#1d7d45]">{success}</p> : null}
      </form>
    </Modal>
  )
}

function CreateOrganisationModal({
  open,
  onClose,
  onSubmit,
  submitting = false,
  error = '',
  name = '',
  onChange,
}) {
  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title="Create Organisation / Agency"
      subtitle="Create an organisation that can own agents and transactions."
      className="max-w-[560px]"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="create-organisation-form" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create Organisation'}
          </Button>
        </div>
      }
    >
      <form id="create-organisation-form" className="space-y-4" onSubmit={onSubmit}>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Organisation Name</span>
          <Field value={name} onChange={(event) => onChange(event.target.value)} placeholder="e.g. Bridge Realty Pretoria" />
        </label>
        {error ? <p className="rounded-[12px] border border-[#f2d7d7] bg-[#fff6f6] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      </form>
    </Modal>
  )
}

function AllocateAgentModal({
  open,
  onClose,
  onSubmit,
  submitting = false,
  error = '',
  colleagues = [],
  value = '',
  onChange,
  transactionLabel = '',
}) {
  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title="Allocate Agent to Transaction"
      subtitle={transactionLabel || 'Select an agent from your organisation to allocate to this transaction.'}
      className="max-w-[560px]"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={submitting || !value}>
            {submitting ? 'Allocating…' : 'Allocate Agent'}
          </Button>
        </div>
      }
    >
      <label className="grid gap-1.5">
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Organisation Agent</span>
        <Field as="select" value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Select agent</option>
          {colleagues.map((colleague) => (
            <option key={colleague.email} value={colleague.email}>
              {colleague.name} ({colleague.email})
            </option>
          ))}
        </Field>
      </label>
      {error ? <p className="mt-3 rounded-[12px] border border-[#f2d7d7] bg-[#fff6f6] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
    </Modal>
  )
}

function readLocalRows(storageKey) {
  if (typeof window === 'undefined') {
    return []
  }
  if (!isUnsafeFallbackAllowed()) {
    return []
  }

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function buildAgentInviteForm({ profile, directory }) {
  const agency = directory?.agency || null
  return {
    firstName: '',
    surname: '',
    email: '',
    mobile: '',
    organisationId: String(agency?.id || profile?.agencyId || '').trim().toLowerCase(),
    organisationName: String(agency?.name || profile?.agencyName || profile?.companyName || 'Bridge Organisation').trim(),
    branchId: '',
    office: '',
    commissionStructureId: '',
    role: 'agent',
    notes: '',
  }
}

function normalizeAgentIdentity(row) {
  const email = String(row?.transaction?.assigned_agent_email || '').trim().toLowerCase()
  const name = String(row?.transaction?.assigned_agent || '').trim()
  const identifier = email || name.toLowerCase()

  if (!identifier) {
    return null
  }

  return {
    id: identifier,
    name: name || '',
    email: email || '',
  }
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'R 0'
  }

  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleDateString('en-ZA')
}

function normalizeIdentityEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeAgentRecordId(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeAgentDirectoryStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'active' || normalized === 'accepted') return AGENT_INVITE_STATUS.ACTIVE
  if (normalized === 'invited' || normalized === 'pending') return AGENT_INVITE_STATUS.PENDING_INVITE
  if (normalized === 'deactivated' || normalized === 'disabled' || normalized === 'inactive') return AGENT_INVITE_STATUS.REVOKED
  return normalized || AGENT_INVITE_STATUS.ACTIVE
}

function buildEmptyAgentMetrics() {
  return {
    activeListings: 0,
    activeDeals: 0,
    completedDeals: 0,
    cancelledDeals: 0,
    registeredDeals: 0,
    totalSalesValue: 0,
    pipelineValue: 0,
    activeDealValue: 0,
    commissionEarned: 0,
    upcomingAppointments: 0,
    completedAppointments: 0,
    followUpsDue: 0,
    averageDealTime: 0,
  }
}

function normalizeOrganisationUserAgent(user = {}, context = {}) {
  const email = normalizeIdentityEmail(user.email)
  const id = normalizeAgentRecordId(user.id || user.userId || email)
  if (!id && !email) return null
  const role = String(user.role || 'agent').trim().toLowerCase()
  const fullName = String(user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ') || email || 'Agent').trim()
  return {
    id: id || email,
    organisationUserId: normalizeAgentRecordId(user.id),
    userId: normalizeAgentRecordId(user.userId),
    name: fullName,
    email,
    phone: user.phone || '',
    avatarUrl: getAgentAvatarUrl(user),
    profilePhotoUrl: getAgentAvatarUrl(user),
    office: user.branchName || (user.branchId ? 'Assigned Branch' : 'Head Office'),
    branchId: user.branchId || null,
    organisationId: normalizeAgentRecordId(context.organisationId || user.organisationId || ''),
    organisationName: context.organisationName || user.organisationName || 'Bridge Organisation',
    role,
    status: normalizeAgentDirectoryStatus(user.status),
    invitedAt: user.invitedAt || null,
    activatedAt: user.acceptedAt || null,
    lastActiveAt: user.lastActiveAt || null,
    inviteId: '',
    inviteToken: '',
    deals: [],
    developmentListings: [],
    privateListings: [],
    pipelineRows: [],
    appointments: [],
    metrics: buildEmptyAgentMetrics(),
    recentDeals: [],
  }
}

function getAgentMatchKeys(agent = {}) {
  return [
    agent.id,
    agent.organisationUserId,
    agent.userId,
    agent.email,
  ].map(normalizeAgentRecordId).filter(Boolean)
}

function mergeAgentRows(baseRows = [], overlayRows = []) {
  const merged = [...baseRows]
  for (const overlay of overlayRows.filter(Boolean)) {
    const overlayKeys = getAgentMatchKeys(overlay)
    const existingIndex = merged.findIndex((candidate) => {
      const candidateKeys = getAgentMatchKeys(candidate)
      return overlayKeys.some((key) => candidateKeys.includes(key))
    })
    if (existingIndex === -1) {
      merged.push(overlay)
      continue
    }
    const existing = merged[existingIndex]
    merged[existingIndex] = {
      ...existing,
      ...overlay,
      id: overlay.id || existing.id,
      organisationUserId: overlay.organisationUserId || existing.organisationUserId,
      userId: overlay.userId || existing.userId,
      name: overlay.name || existing.name,
      email: overlay.email || existing.email,
      phone: overlay.phone || existing.phone,
      avatarUrl: getAgentAvatarUrl(overlay) || getAgentAvatarUrl(existing),
      profilePhotoUrl: getAgentAvatarUrl(overlay) || getAgentAvatarUrl(existing),
      office: overlay.office || existing.office,
      organisationId: overlay.organisationId || existing.organisationId,
      organisationName: overlay.organisationName || existing.organisationName,
      role: overlay.role || existing.role,
      status: overlay.status || existing.status,
      invitedAt: overlay.invitedAt || existing.invitedAt,
      activatedAt: overlay.activatedAt || existing.activatedAt,
      lastActiveAt: overlay.lastActiveAt || existing.lastActiveAt,
      inviteId: overlay.inviteId || existing.inviteId,
      inviteToken: overlay.inviteToken || existing.inviteToken,
      deals: existing.deals?.length ? existing.deals : overlay.deals || [],
      developmentListings: existing.developmentListings?.length ? existing.developmentListings : overlay.developmentListings || [],
      privateListings: existing.privateListings?.length ? existing.privateListings : overlay.privateListings || [],
      pipelineRows: existing.pipelineRows?.length ? existing.pipelineRows : overlay.pipelineRows || [],
      appointments: existing.appointments?.length ? existing.appointments : overlay.appointments || [],
      metrics: existing.metrics || overlay.metrics || buildEmptyAgentMetrics(),
      recentDeals: existing.recentDeals?.length ? existing.recentDeals : overlay.recentDeals || [],
    }
  }
  return merged
}

function findAgentByRouteId(agents = [], routeId = '') {
  const target = normalizeAgentRecordId(routeId)
  if (!target) return null
  return agents.find((agent) => getAgentMatchKeys(agent).includes(target)) || null
}

function resolveOrganisationOptions({ directory = null, invites = [], profile = null } = {}) {
  const deduped = new Map()

  const register = (id, name) => {
    const normalizedId = String(id || '').trim().toLowerCase()
    if (!normalizedId) return
    const normalizedName = String(name || '').trim() || 'Bridge Organisation'
    if (!deduped.has(normalizedId)) {
      deduped.set(normalizedId, { id: normalizedId, name: normalizedName })
      return
    }

    const existing = deduped.get(normalizedId)
    if (!existing.name && normalizedName) {
      deduped.set(normalizedId, { id: normalizedId, name: normalizedName })
    }
  }

  if (Array.isArray(directory?.agencies)) {
    directory.agencies.forEach((agency) => register(agency?.id, agency?.name))
  }
  register(directory?.agency?.id, directory?.agency?.name)
  ;(directory?.agents || []).forEach((agent) => register(agent?.agencyId, agent?.agencyName))
  ;(invites || []).forEach((invite) => register(invite?.organisationId, invite?.organisationName))

  if (!deduped.size && profile?.agencyId) {
    register(profile.agencyId, profile?.agencyName || profile?.companyName || 'Bridge Organisation')
  }

  return [...deduped.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function filterRowsForAgentAllocation({ rows = [], profile = null } = {}) {
  const normalizedProfileEmail = normalizeIdentityEmail(profile?.email)
  const normalizedProfileName = String(profile?.fullName || profile?.name || '')
    .trim()
    .toLowerCase()

  return rows.filter((row) => {
    const transaction = row?.transaction || {}
    const assignedEmail = normalizeIdentityEmail(transaction.assigned_agent_email)
    const assignedName = String(transaction.assigned_agent || '').trim().toLowerCase()
    if (normalizedProfileEmail && assignedEmail && assignedEmail === normalizedProfileEmail) {
      return true
    }
    if (!normalizedProfileEmail && normalizedProfileName && assignedName && assignedName === normalizedProfileName) {
      return true
    }
    return false
  })
}

function normalizeDealStatus(row) {
  const stage = String(row?.stage || row?.transaction?.stage || '').trim().toLowerCase()
  const lifecycle = String(row?.transaction?.lifecycle_state || '').trim().toLowerCase()

  if (lifecycle.includes('cancel') || lifecycle.includes('lost') || stage.includes('cancelled')) {
    return 'cancelled'
  }

  if (stage === 'registered' || row?.transaction?.registered_at) {
    return 'completed'
  }

  return 'active'
}

function computeAgentWorkspaceData({ transactions, privateListings, pipelineRows, appointments = [], agentDirectory = null }) {
  const groupedByAgent = new Map()

  for (const row of transactions) {
    const identity = normalizeAgentIdentity(row)
    if (!identity) {
      continue
    }
    if (!groupedByAgent.has(identity.id)) {
      groupedByAgent.set(identity.id, {
        id: identity.id,
        name: identity.name,
        email: identity.email,
        phone: '',
        office: row?.development?.location || 'Main Office',
        status: 'Active',
        deals: [],
        developmentListings: [],
      })
    }

    const item = groupedByAgent.get(identity.id)
    item.deals.push(row)

    const developmentListingId = row?.unit?.id || row?.transaction?.unit_id || null
    if (developmentListingId) {
      item.developmentListings.push({
        id: developmentListingId,
        title: `Unit ${row?.unit?.unit_number || '-'}`,
        developmentName: row?.development?.name || 'Development',
        suburb: row?.transaction?.suburb || row?.development?.location || 'Area pending',
        price: Number(row?.transaction?.sales_price || row?.transaction?.purchase_price || row?.unit?.price || 0),
        status: normalizeDealStatus(row) === 'completed' ? 'Sold' : 'Active',
        mandateStatus: 'N/A',
        sellerOnboardingStatus: 'N/A',
        documentsStatus: 'In Progress',
        listedAt: row?.transaction?.created_at || null,
        listingType: 'development',
        row,
      })
    }
  }

  const listingsByAgent = privateListings.reduce((accumulator, listing) => {
    const agentId = String(listing?.commission?.agent_id || '').trim().toLowerCase()
    if (!agentId) {
      return accumulator
    }
    if (!accumulator.has(agentId)) {
      accumulator.set(agentId, [])
    }
    accumulator.get(agentId).push(listing)
    return accumulator
  }, new Map())

  const developmentAgentMap = new Map()
  for (const row of transactions) {
    const developmentId = String(row?.development?.id || row?.transaction?.development_id || row?.unit?.development_id || '').trim()
    if (!developmentId) {
      continue
    }
    const identity = normalizeAgentIdentity(row)
    if (identity?.id && !developmentAgentMap.has(developmentId)) {
      developmentAgentMap.set(developmentId, identity.id)
    }
  }

  const defaultAgentId = groupedByAgent.keys().next().value || ''
  const pipelineByAgent = pipelineRows.reduce((accumulator, item) => {
    const developmentId = String(item?.developmentId || item?.development_id || '').trim()
    const inferredByDevelopment = developmentId ? developmentAgentMap.get(developmentId) : ''
    const agentId = String(item?.agent_id || item?.assigned_agent_id || inferredByDevelopment || defaultAgentId || '').trim().toLowerCase()
    if (!agentId) {
      return accumulator
    }
    if (!accumulator.has(agentId)) {
      accumulator.set(agentId, [])
    }
    accumulator.get(agentId).push(item)
    return accumulator
  }, new Map())

  const directoryAgents = Array.isArray(agentDirectory?.agents) ? agentDirectory.agents : []
  for (const directoryAgent of directoryAgents) {
    const directoryId = String(directoryAgent?.id || directoryAgent?.email || directoryAgent?.name || '').trim().toLowerCase()
    if (!directoryId) continue
    if (!groupedByAgent.has(directoryId)) {
      groupedByAgent.set(directoryId, {
        id: directoryId,
        name: directoryAgent?.name || 'Agent',
        email: directoryAgent?.email || '',
        phone: directoryAgent?.phone || '',
        avatarUrl: getAgentAvatarUrl(directoryAgent),
        profilePhotoUrl: getAgentAvatarUrl(directoryAgent),
        office: directoryAgent?.office || 'Office',
        status: String(directoryAgent?.status || 'Active').replace(/\b\w/g, (char) => char.toUpperCase()),
        deals: [],
        developmentListings: [],
      })
    } else {
      const existing = groupedByAgent.get(directoryId)
      groupedByAgent.set(directoryId, {
        ...existing,
        name: existing.name || directoryAgent?.name || existing.name,
        email: existing.email || directoryAgent?.email || existing.email,
        phone: existing.phone || directoryAgent?.phone || existing.phone,
        avatarUrl: getAgentAvatarUrl(existing) || getAgentAvatarUrl(directoryAgent),
        profilePhotoUrl: getAgentAvatarUrl(existing) || getAgentAvatarUrl(directoryAgent),
        office: existing.office || directoryAgent?.office || existing.office,
      })
    }
  }

  const agentIdByEmail = new Map()
  const agentIdByName = new Map()
  for (const [agentId, agentRecord] of groupedByAgent.entries()) {
    const normalizedEmail = normalizeIdentityEmail(agentRecord?.email)
    const normalizedName = String(agentRecord?.name || '').trim().toLowerCase()
    if (normalizedEmail) {
      agentIdByEmail.set(normalizedEmail, agentId)
    }
    if (normalizedName) {
      agentIdByName.set(normalizedName, agentId)
    }
  }

  const appointmentsByAgent = new Map()
  for (const appointment of appointments) {
    const assignedAgentId = String(appointment?.assignedAgentId || '').trim().toLowerCase()
    const assignedAgentEmail = normalizeIdentityEmail(appointment?.assignedAgentEmail)
    const assignedAgentName = String(appointment?.assignedAgentName || '').trim().toLowerCase()
    const resolvedAgentId = groupedByAgent.has(assignedAgentId)
      ? assignedAgentId
      : agentIdByEmail.get(assignedAgentEmail) || agentIdByName.get(assignedAgentName) || ''

    if (!resolvedAgentId) continue
    if (!appointmentsByAgent.has(resolvedAgentId)) {
      appointmentsByAgent.set(resolvedAgentId, [])
    }
    appointmentsByAgent.get(resolvedAgentId).push(appointment)
  }

  const agents = [...groupedByAgent.values()].map((agent) => {
    const agentPrivateListings = listingsByAgent.get(agent.id) || []
    const agentPipelineRows = pipelineByAgent.get(agent.id) || []
    const agentAppointments = appointmentsByAgent.get(agent.id) || []

    const activeDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'active')
    const completedDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'completed')
    const cancelledDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'cancelled')

    const totalSalesValue = completedDeals.reduce((sum, row) => {
      const value = Number(row?.transaction?.sales_price || row?.transaction?.purchase_price || row?.unit?.price || 0)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)

    const activeDealValue = activeDeals.reduce((sum, row) => {
      const value = Number(row?.transaction?.sales_price || row?.transaction?.purchase_price || row?.unit?.price || 0)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)

    const pipelineValue = agentPipelineRows.reduce((sum, lead) => {
      const value = Number(lead?.budget || 0)
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)

    const estimatedCommission = totalSalesValue * 0.03
    const avgDealTime = completedDeals.length ? 42 : 0
    const nowTime = Date.now()
    const upcomingAppointments = agentAppointments.filter((appointment) => {
      const status = String(appointment?.status || '').trim().toLowerCase()
      if (!['pending confirmation', 'confirmed', 'needs reschedule'].includes(status)) return false
      const value = new Date(appointment?.dateTime || 0).getTime()
      return Number.isFinite(value) && value >= nowTime
    })
    const completedAppointments = agentAppointments.filter((appointment) => String(appointment?.status || '').trim().toLowerCase() === 'completed')

    const recentDeals = [...agent.deals]
      .sort((left, right) => new Date(right?.transaction?.updated_at || 0).getTime() - new Date(left?.transaction?.updated_at || 0).getTime())
      .slice(0, 4)

    return {
      ...agent,
      privateListings: agentPrivateListings,
      pipelineRows: agentPipelineRows,
      appointments: agentAppointments
        .slice()
        .sort((left, right) => new Date(right?.updatedAt || right?.dateTime || 0).getTime() - new Date(left?.updatedAt || left?.dateTime || 0).getTime()),
      metrics: {
        activeListings: agent.developmentListings.filter((item) => item.status !== 'Sold').length + agentPrivateListings.length,
        activeDeals: activeDeals.length,
        completedDeals: completedDeals.length,
        cancelledDeals: cancelledDeals.length,
        registeredDeals: completedDeals.length,
        totalSalesValue,
        pipelineValue,
        activeDealValue,
        commissionEarned: estimatedCommission,
        upcomingAppointments: upcomingAppointments.length,
        completedAppointments: completedAppointments.length,
        followUpsDue: agentPipelineRows.filter((lead) => !!lead?.nextFollowUpDate || !!lead?.next_follow_up_date).length,
        averageDealTime: avgDealTime,
      },
      recentDeals,
    }
  })

  return agents.sort((left, right) => right.metrics.totalSalesValue - left.metrics.totalSalesValue)
}

function AgentMetricCard({ label, value, helper = '' }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[16px] border border-[#dfe7f1] bg-[#fbfcfe] px-4 py-3">
      <p className="truncate text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]" title={label}>{label}</p>
      <p className="mt-2 truncate text-[1.25rem] font-semibold tracking-[-0.02em] text-[#142132]" title={String(value ?? '—')}>{value}</p>
      {helper ? <p className="mt-1 truncate text-xs text-[#657a92]" title={helper}>{helper}</p> : null}
    </div>
  )
}

function formatCompactCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount).replace('ZAR', 'R')
}

function getAgentPipelineValue(agent) {
  return Number(agent?.metrics?.pipelineValue || agent?.metrics?.activeDealValue || 0) || 0
}

function getAgentStatusMeta(agent) {
  const statusKey = String(agent.status || '').trim().toLowerCase()
  return {
    key: statusKey || AGENT_INVITE_STATUS.ACTIVE,
    label: AGENT_STATUS_LABELS[statusKey] || agent.status || 'Active',
    className: AGENT_STATUS_PILL_CLASS[statusKey] || AGENT_STATUS_PILL_CLASS[AGENT_INVITE_STATUS.ACTIVE],
  }
}

function getRegisteredThisMonth(agent) {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  return (agent?.deals || []).filter((row) => {
    const value = row?.transaction?.registered_at || row?.transaction?.registration_date || row?.transaction?.completed_at
    if (!value) return false
    const date = new Date(value)
    return !Number.isNaN(date.getTime()) && date.getMonth() === currentMonth && date.getFullYear() === currentYear
  }).length
}

function getAgentLastActivityDate(agent) {
  const candidates = [
    agent?.lastActiveAt,
    ...(agent?.recentDeals || []).map((row) => row?.transaction?.updated_at || row?.transaction?.created_at),
    ...(agent?.appointments || []).map((appointment) => appointment?.updatedAt || appointment?.dateTime),
  ].filter(Boolean)
  const timestamps = candidates
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value))
  return timestamps.length ? new Date(Math.max(...timestamps)) : null
}

function formatRelativeActivity(value) {
  if (!value) return 'No recent activity'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'No recent activity'
  const diffMs = Date.now() - date.getTime()
  const diffHours = Math.max(0, Math.round(diffMs / 3600000))
  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.round(diffHours / 24)}d ago`
}

function DirectorySelect({ label, value, onChange, options }) {
  return (
    <label className="min-w-[150px] flex-1 sm:flex-none">
      <span className="sr-only">{label}</span>
      <select
        className="h-10 w-full rounded-xl border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] shadow-sm outline-none transition focus:border-[#1f4f78] focus:ring-2 focus:ring-[#1f4f78]/10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function AgentSummaryStrip({ summary }) {
  const cards = [
    { label: 'Total Agents', value: summary.totalAgents, helper: 'Across selected branches', icon: Users, tone: 'bg-[#edf5ff] text-[#1769d1]' },
    { label: 'Active Today', value: summary.activeToday, helper: `${summary.activePercent}% of total`, icon: CheckCircle2, tone: 'bg-[#ecfdf3] text-[#16894f]' },
    { label: 'Total Pipeline Value', value: formatCompactCurrency(summary.pipelineValue), helper: 'Assigned active pipeline', icon: ArrowRight, tone: 'bg-[#eef4ff] text-[#315adf]' },
    { label: 'Active Transactions', value: summary.activeTransactions, helper: 'Currently in motion', icon: BriefcaseBusiness, tone: 'bg-[#f3efff] text-[#7657d8]' },
  ]

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <article key={card.label} className="rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${card.tone}`}>
                <Icon size={19} />
              </span>
              <div className="min-w-0">
                <p className="text-[0.76rem] font-semibold text-[#60758d]">{card.label}</p>
                <p className="mt-1 text-[1.45rem] font-semibold leading-none tracking-[-0.035em] text-[#0f2237]">{card.value}</p>
                <p className="mt-1.5 truncate text-xs font-medium text-[#6b7f97]">{card.helper}</p>
              </div>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function AgentDirectoryCard({ agent, onView, onEditRole, onDeactivate, onResendInvite, onCopyInviteLink }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const statusMeta = getAgentStatusMeta(agent)
  const pipelineValue = getAgentPipelineValue(agent)
  const registeredThisMonth = getRegisteredThisMonth(agent)

  return (
    <article className="flex min-h-[268px] flex-col rounded-2xl border border-[#dce5f0] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-[#c8d6e5] hover:shadow-[0_16px_34px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AgentAvatar agent={agent} className="h-12 w-12 flex-none border border-[#d7e2ef] bg-[linear-gradient(135deg,#f8fbff,#eaf2fb)] text-sm font-semibold text-[#244e70]" />
          <div className="min-w-0">
            <h3 className="truncate text-[1rem] font-semibold text-[#142132]">{agent.name || 'Agent'}</h3>
            <p className="truncate text-sm text-[#60758d]">{formatRoleLabel(agent.role)}</p>
            <p className="truncate text-xs font-medium text-[#6f839a]">{agent.office || agent.organisationName || 'Not assigned'}</p>
          </div>
        </div>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusMeta.className}`}>
          {statusMeta.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 divide-x divide-[#e4ebf4] border-y border-[#edf2f7] py-3">
        <div className="pr-3">
          <p className="text-[0.68rem] font-medium text-[#72859c]">Pipeline</p>
          <p className="mt-1 truncate text-sm font-semibold text-[#10243a]">{formatCompactCurrency(pipelineValue)}</p>
        </div>
        <div className="px-3">
          <p className="text-[0.68rem] font-medium text-[#72859c]">Deals</p>
          <p className="mt-1 text-sm font-semibold text-[#10243a]">{agent.metrics.activeDeals || 0}</p>
        </div>
        <div className="pl-3">
          <p className="text-[0.68rem] font-medium text-[#72859c]">Listings</p>
          <p className="mt-1 text-sm font-semibold text-[#10243a]">{agent.metrics.activeListings || 0}</p>
        </div>
      </div>

      <div className="mt-3 space-y-2 text-xs text-[#61778f]">
        <p className="inline-flex min-w-0 max-w-full items-center gap-2">
          <Mail size={13} className="shrink-0 text-[#8aa0b6]" />
          <span className="truncate">{agent.email || 'No email added'}</span>
        </p>
        <p className="inline-flex items-center gap-2">
          <Phone size={13} className="shrink-0 text-[#8aa0b6]" />
          <span>{agent.phone || 'No phone added'}</span>
        </p>
        <p className="text-[#405870]">Registered this month: <span className="font-semibold text-[#10243a]">{registeredThisMonth}</span></p>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-4">
        <button
          type="button"
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-[#0f2742] px-3 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(15,39,66,0.18)] transition hover:bg-[#173a5e]"
          onClick={onView}
        >
          View Workspace
        </button>
        <div className="relative">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#d9e3ef] bg-white text-[#3d5570] transition hover:bg-[#f7fafc]"
            aria-label="Agent actions"
            onClick={() => setMenuOpen((previous) => !previous)}
          >
            <MoreHorizontal size={17} />
          </button>
          {menuOpen ? (
            <div className="absolute bottom-[calc(100%+8px)] right-0 z-20 w-44 rounded-2xl border border-[#dce6f0] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.15)]">
              <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" onClick={onView}>View workspace</button>
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]"
                onClick={() => {
                  setMenuOpen(false)
                  onEditRole?.()
                }}
              >
                Change role
              </button>
              {agent.inviteId ? (
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]"
                  onClick={() => {
                    setMenuOpen(false)
                    onResendInvite?.()
                  }}
                >
                  Resend invite
                </button>
              ) : null}
              {agent.inviteToken ? (
                <button
                  type="button"
                  className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]"
                  onClick={() => {
                    setMenuOpen(false)
                    onCopyInviteLink?.()
                  }}
                >
                  Copy invite link
                </button>
              ) : null}
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#9a3a13] hover:bg-[#fff7ed]"
                onClick={() => {
                  setMenuOpen(false)
                  onDeactivate?.()
                }}
              >
                Deactivate
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function AddAgentDirectoryCard({ onAddAgent }) {
  return (
    <article className="flex min-h-[268px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#c9d8e8] bg-[linear-gradient(180deg,#ffffff,#f8fbff)] p-5 text-center shadow-sm">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf5ff] text-[#1769d1]">
        <Plus size={24} />
      </span>
      <h3 className="mt-4 text-base font-semibold text-[#142132]">Add New Agent</h3>
      <p className="mt-1 max-w-[220px] text-sm leading-6 text-[#667a92]">Invite a new agent to your organisation.</p>
      <button
        type="button"
        className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#1f4f78] transition hover:bg-[#f7fafc]"
        onClick={onAddAgent}
      >
        + Add Agent
      </button>
    </article>
  )
}

function AgentInsightPanel({ topPerformers, recentAgents, attentionAgents }) {
  return (
    <aside className="space-y-4">
      <article className="rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[#142132]">Top Performers</h3>
          <span className="text-xs font-semibold text-[#1769d1]">Leaderboard</span>
        </div>
        <div className="mt-4 space-y-3">
          {topPerformers.length ? topPerformers.map((agent, index) => (
            <div key={`${agent.id}-top`} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eaf3ff] text-xs font-semibold text-[#1769d1]">{index + 1}</span>
                <span className="truncate text-sm font-semibold text-[#263a4f]">{agent.name || 'Agent'}</span>
              </div>
              <span className="shrink-0 text-xs font-semibold text-[#0f2742]">{formatCompactCurrency(getAgentPipelineValue(agent))}</span>
            </div>
          )) : <p className="text-sm text-[#6b7f97]">No performance data yet.</p>}
        </div>
      </article>

      <article className="rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[#142132]">Agents Needing Attention</h3>
          <span className="text-xs font-semibold text-[#1769d1]">Watchlist</span>
        </div>
        <div className="mt-4 space-y-3">
          {attentionAgents.length ? attentionAgents.map((agent) => {
            const inactive = getAgentStatusMeta(agent).key !== AGENT_INVITE_STATUS.ACTIVE
            const reason = inactive ? 'Inactive status' : !agent.metrics.activeListings ? 'No active listings' : !agent.metrics.activeDeals ? 'No active transactions' : 'No recent activity'
            return (
              <div key={`${agent.id}-attention`} className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff7ed] text-[#e07800]">
                  <AlertTriangle size={14} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#263a4f]">{agent.name || 'Agent'}</p>
                  <p className="text-xs text-[#6b7f97]">{reason}</p>
                </div>
              </div>
            )
          }) : <p className="text-sm text-[#6b7f97]">No attention items right now.</p>}
        </div>
      </article>

      <article className="rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[#142132]">Recent Agent Activity</h3>
          <span className="text-xs font-semibold text-[#1769d1]">Latest</span>
        </div>
        <div className="mt-4 space-y-3">
          {recentAgents.length ? recentAgents.map((agent) => (
            <div key={`${agent.id}-recent`} className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ecfdf3] text-[#16894f]">
                <Clock3 size={14} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#263a4f]">{agent.name || 'Agent'} updated workspace</p>
                <p className="text-xs text-[#6b7f97]">{formatRelativeActivity(getAgentLastActivityDate(agent))}</p>
              </div>
            </div>
          )) : <p className="text-sm text-[#6b7f97]">No recent activity yet.</p>}
        </div>
      </article>
    </aside>
  )
}

function AgentDirectoryTable({ agents, onView, onEditRole, onDeactivate, onTransfer }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[860px] text-left">
        <thead className="bg-slate-50 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#70849d]">
          <tr>
            <th className="px-4 py-3">Agent</th>
            <th className="px-4 py-3">Branch / Office</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Pipeline</th>
            <th className="px-4 py-3">Deals</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-sm text-[#22384c]">
          {agents.map((agent) => {
            const statusMeta = getAgentStatusMeta(agent)
            return (
              <tr key={`${agent.id}-${agent.organisationId || 'org'}-list`} className="hover:bg-slate-50">
                <td className="px-4 py-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <AgentAvatar agent={agent} className="h-10 w-10 border border-[#d7e2ef] bg-[#f8fbff] text-sm font-semibold text-[#245076]" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#142132]">{agent.name || 'Agent'}</p>
                      <p className="truncate text-xs text-[#60758d]">{agent.email || 'No email added'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">{agent.office || agent.organisationName || 'Not assigned'}</td>
                <td className="px-4 py-4">{formatRoleLabel(agent.role)}</td>
                <td className="px-4 py-4 font-semibold">{formatCompactCurrency(getAgentPipelineValue(agent))}</td>
                <td className="px-4 py-4">{agent.metrics.activeDeals || 0}</td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => onView(agent)}>Workspace</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => onEditRole(agent)}>Role</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => onTransfer(agent)}>Transfer</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => onDeactivate(agent)}>Deactivate</Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function normalizeOffboardingAgentId(agent = {}) {
  return String(agent.userId || agent.id || '').trim()
}

function AgentOffboardingWizard({
  open,
  agent,
  loading = false,
  executing = false,
  error = '',
  discovery = null,
  candidateAgents = [],
  onClose,
  onRefresh,
  onSubmit,
}) {
  const [step, setStep] = useState(1)
  const [mode, setMode] = useState('single')
  const [defaultAgentId, setDefaultAgentId] = useState('')
  const [reason, setReason] = useState('Agent offboarding')
  const [appointmentAction, setAppointmentAction] = useState('reassign')
  const [splitAssignments, setSplitAssignments] = useState({
    leads: '',
    listings: '',
    transactions: '',
    appointments: '',
    contacts: '',
    tasks: '',
    documentPackets: '',
    documentRequests: '',
  })

  const summary = discovery?.summary || {}
  const assets = discovery?.assets || {}
  const hasAssets = hasBlockingAgentAssets(summary)
  const options = candidateAgents
    .map((item) => ({
      id: normalizeOffboardingAgentId(item),
      userId: normalizeOffboardingAgentId(item),
      name: item.name || item.email || 'Agent',
      email: item.email || '',
      branchId: item.branchId || null,
      office: item.office || 'Assigned branch',
    }))
    .filter((item) => item.userId && item.userId !== normalizeOffboardingAgentId(agent))

  const selectedDefault = options.find((item) => item.userId === defaultAgentId) || null
  const selectedByType = Object.fromEntries(Object.entries(splitAssignments).map(([key, value]) => [key, options.find((item) => item.userId === value) || null]))
  const activeSummaryRows = [
    ['Seller Leads', summary.sellerLeads || 0],
    ['Buyer Leads', summary.buyerLeads || 0],
    ['Contacts', summary.contacts || 0],
    ['Tasks', summary.tasks || 0],
    ['Listings', summary.listings || 0],
    ['Active Transactions', summary.activeTransactions || 0],
    ['Future Appointments', summary.appointments || 0],
    ['Document Packets', summary.documentPackets || 0],
    ['Open Document Requests', summary.openDocumentRequests || 0],
    ['Pending Seller Uploads', summary.pendingSellerUploads || 0],
  ]
  const canSubmitNoAssets = !hasAssets
  const needsDestination = hasAssets && mode !== 'branch_pool'
  const hasDestination = mode === 'single' ? Boolean(selectedDefault) : ['leads', 'listings', 'transactions', 'appointments'].every((key) => {
    const countByKey = {
      leads: (summary.sellerLeads || 0) + (summary.buyerLeads || 0),
      listings: summary.listings || 0,
      transactions: summary.activeTransactions || 0,
      appointments: summary.appointments || 0,
    }
    return !countByKey[key] || Boolean(selectedByType[key])
  })
  const branchPoolBlocked = mode === 'branch_pool' && ((summary.listings || 0) || (summary.activeTransactions || 0) || (summary.appointments || 0) || (summary.documentPackets || 0))
  const canSubmit = !loading && !executing && (canSubmitNoAssets || (hasAssets && !branchPoolBlocked && (!needsDestination || hasDestination)))

  function submit() {
    const strategy = mode === 'split'
      ? {
          mode,
          defaultAgent: selectedDefault,
          byType: selectedByType,
        }
      : {
          mode,
          defaultAgent: selectedDefault,
          byType: {},
        }
    onSubmit?.({
      strategy,
      reason,
      appointmentAction,
      assets,
    })
  }

  return (
    <Modal
      open={open}
      onClose={executing ? undefined : onClose}
      title="Agent Offboarding"
      subtitle={agent ? `Protect business assets before deactivating ${agent.name || agent.email || 'this agent'}.` : ''}
      className="max-w-[920px]"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-medium text-[#6a7f98]">
            {hasAssets ? 'Deactivation is blocked until active assets are handled.' : 'No active assets found. Deactivation can continue.'}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={executing}>Cancel</Button>
            {step > 1 ? <Button type="button" variant="secondary" onClick={() => setStep((value) => Math.max(1, value - 1))} disabled={executing}>Back</Button> : null}
            {step < 3 ? (
              <Button type="button" onClick={() => setStep((value) => Math.min(3, value + 1))} disabled={loading || executing}>
                Next
              </Button>
            ) : (
              <Button type="button" onClick={submit} disabled={!canSubmit}>
                {executing ? 'Completing Offboarding…' : 'Reassign Assets & Deactivate'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 gap-2">
          {['Review Agent', 'Asset Summary', 'Reassignment'].map((label, index) => {
            const active = step === index + 1
            return (
              <div key={label} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${active ? 'border-[#1769d1] bg-[#eef6ff] text-[#1254a3]' : 'border-[#e1e8f0] bg-white text-[#70849a]'}`}>
                {index + 1}. {label}
              </div>
            )
          })}
        </div>

        {error ? <div className="rounded-xl border border-[#f2d7d7] bg-[#fff6f6] px-4 py-3 text-sm text-[#b42318]">{error}</div> : null}

        {step === 1 ? (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="rounded-2xl border border-[#dfe8f2] bg-white p-4">
              <div className="flex items-center gap-3">
                <AgentAvatar agent={agent || {}} className="h-14 w-14 bg-[#0f2742] text-base font-semibold text-white" />
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-[#10243a]">{agent?.name || 'Agent'}</h3>
                  <p className="truncate text-sm text-[#60758d]">{agent?.email || 'No email'}</p>
                  <p className="truncate text-xs font-semibold text-[#7a8ea5]">{agent?.office || 'No branch'} · {formatRoleLabel(agent?.role)}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#edf2f7] bg-[#f8fbff] p-3">
                  <p className="text-xs font-semibold text-[#71859c]">Status</p>
                  <p className="mt-1 text-sm font-semibold text-[#10243a]">{getAgentStatusMeta(agent || {}).label}</p>
                </div>
                <div className="rounded-xl border border-[#edf2f7] bg-[#f8fbff] p-3">
                  <p className="text-xs font-semibold text-[#71859c]">Joined</p>
                  <p className="mt-1 text-sm font-semibold text-[#10243a]">{formatDate(agent?.activatedAt || agent?.invitedAt)}</p>
                </div>
                <div className="rounded-xl border border-[#edf2f7] bg-[#f8fbff] p-3">
                  <p className="text-xs font-semibold text-[#71859c]">Current Assets</p>
                  <p className="mt-1 text-sm font-semibold text-[#10243a]">{loading ? 'Scanning…' : summary.totalAssets || 0}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[#f0dfc2] bg-[#fffbf3] p-4">
              <AlertTriangle size={20} className="text-[#b7791f]" />
              <h4 className="mt-3 text-sm font-semibold text-[#3a2a12]">Hard safety rule</h4>
              <p className="mt-2 text-sm leading-6 text-[#7a5a25]">Agents with active assets must be reassigned before deactivation completes. Historical attribution stays untouched.</p>
              <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={onRefresh} disabled={loading || executing}>
                {loading ? 'Scanning…' : 'Refresh asset scan'}
              </Button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {activeSummaryRows.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-[#e1e9f2] bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7890a8]">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#10243a]">{loading ? '…' : value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-[#dbe7f3] bg-[#f7fbff] p-4 text-sm leading-6 text-[#415a73]">
              Seller and buyer relationships, portals, documents, tasks, and appointments stay connected to their business records. The wizard changes only operational ownership.
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ['single', 'Single Agent', 'Assign every transferable asset to one active agent.'],
                ['split', 'Split Assignment', 'Choose destination owners per asset type.'],
                ['branch_pool', 'Branch Pool', 'Move lead workload to the branch pool only.'],
              ].map(([value, label, copy]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={`rounded-2xl border p-4 text-left transition ${mode === value ? 'border-[#1769d1] bg-[#eef6ff] shadow-sm' : 'border-[#dfe8f2] bg-white hover:bg-[#f8fbff]'}`}
                >
                  <span className="text-sm font-semibold text-[#10243a]">{label}</span>
                  <span className="mt-2 block text-xs leading-5 text-[#637991]">{copy}</span>
                </button>
              ))}
            </div>

            {branchPoolBlocked ? (
              <div className="rounded-xl border border-[#f2d7d7] bg-[#fff6f6] px-4 py-3 text-sm text-[#b42318]">
                Branch pool can only be used when the agent has no active listings, transactions, appointments, or document packets.
              </div>
            ) : null}

            {mode === 'single' ? (
              <label className="grid gap-1.5">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Destination Agent</span>
                <Field as="select" value={defaultAgentId} onChange={(event) => setDefaultAgentId(event.target.value)}>
                  <option value="">Select destination agent</option>
                  {options.map((option) => (
                    <option key={option.userId} value={option.userId}>{option.name} · {option.office}</option>
                  ))}
                </Field>
              </label>
            ) : null}

            {mode === 'split' ? (
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ['leads', 'Leads'],
                  ['listings', 'Listings'],
                  ['transactions', 'Transactions'],
                  ['appointments', 'Appointments'],
                  ['contacts', 'Contacts'],
                  ['tasks', 'Tasks'],
                  ['documentPackets', 'Document Packets'],
                  ['documentRequests', 'Document Requests'],
                ].map(([key, label]) => (
                  <label key={key} className="grid gap-1.5">
                    <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{label}</span>
                    <Field as="select" value={splitAssignments[key]} onChange={(event) => setSplitAssignments((previous) => ({ ...previous, [key]: event.target.value }))}>
                      <option value="">Select agent</option>
                      {options.map((option) => (
                        <option key={`${key}-${option.userId}`} value={option.userId}>{option.name} · {option.office}</option>
                      ))}
                    </Field>
                  </label>
                ))}
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Future Appointments</span>
                <Field as="select" value={appointmentAction} onChange={(event) => setAppointmentAction(event.target.value)}>
                  <option value="reassign">Reassign to new owner</option>
                  <option value="cancel">Cancel and audit</option>
                </Field>
              </label>
              <label className="grid gap-1.5">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Reason</span>
                <Field value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Agent resignation, branch move, restructuring…" />
              </label>
            </div>
          </section>
        ) : null}
      </div>
    </Modal>
  )
}

function AgentTransferWizard({
  open,
  agent,
  loading = false,
  executing = false,
  error = '',
  discovery = null,
  candidateAgents = [],
  destinationOrganisations = [],
  branchOptions = [],
  sourceOrganisation = {},
  onClose,
  onRefresh,
  onSubmit,
}) {
  const currentOrganisationId = String(agent?.organisationId || sourceOrganisation?.id || '').trim().toLowerCase()
  const availableOrganisations = destinationOrganisations.filter((organisation) => String(organisation?.id || '').trim().toLowerCase() !== currentOrganisationId)
  const [step, setStep] = useState(1)
  const [destinationMode, setDestinationMode] = useState(availableOrganisations.length ? 'existing' : 'new')
  const [destinationOrganisationId, setDestinationOrganisationId] = useState(availableOrganisations[0]?.id || '')
  const [newOrganisationName, setNewOrganisationName] = useState('')
  const [destinationBranchId, setDestinationBranchId] = useState('')
  const [destinationRole, setDestinationRole] = useState('agent')
  const [assetMode, setAssetMode] = useState('single')
  const [retentionAgentId, setRetentionAgentId] = useState('')
  const [appointmentAction, setAppointmentAction] = useState('reassign')
  const [reason, setReason] = useState('Agent transfer between agencies')
  const [splitAssignments, setSplitAssignments] = useState({
    leads: '',
    listings: '',
    transactions: '',
    appointments: '',
    contacts: '',
    tasks: '',
    documentPackets: '',
    documentRequests: '',
  })

  const summary = discovery?.summary || {}
  const assets = discovery?.assets || {}
  const hasAssets = hasBlockingAgentAssets(summary)
  const retentionOptions = candidateAgents
    .map((item) => ({
      id: normalizeOffboardingAgentId(item),
      userId: normalizeOffboardingAgentId(item),
      name: item.name || item.email || 'Agent',
      email: item.email || '',
      branchId: item.branchId || null,
      office: item.office || 'Assigned branch',
    }))
    .filter((item) => item.userId && item.userId !== normalizeOffboardingAgentId(agent))

  const selectedRetentionAgent = retentionOptions.find((item) => item.userId === retentionAgentId) || null
  const selectedByType = Object.fromEntries(Object.entries(splitAssignments).map(([key, value]) => [key, retentionOptions.find((item) => item.userId === value) || null]))
  const effectiveDestinationOrganisationId =
    destinationOrganisationId && availableOrganisations.some((organisation) => organisation.id === destinationOrganisationId)
      ? destinationOrganisationId
      : availableOrganisations[0]?.id || ''
  const selectedDestinationOrganisation = destinationMode === 'existing'
    ? availableOrganisations.find((organisation) => organisation.id === effectiveDestinationOrganisationId) || null
    : { id: '', name: newOrganisationName.trim() }
  const selectedDestinationBranch = branchOptions.find((branch) => branch.id === destinationBranchId) || null
  const transferReport = buildTransferMembershipReport({
    agent,
    sourceOrganisation,
    destinationOrganisation: selectedDestinationOrganisation,
    summary,
  })
  const retentionStrategy = assetMode === 'split'
    ? { mode: assetMode, defaultAgent: selectedRetentionAgent, byType: selectedByType }
    : { mode: assetMode, defaultAgent: selectedRetentionAgent, byType: {} }
  const validation = validateTransferRetentionStrategy({ summary, strategy: retentionStrategy })
  const destinationValid = destinationMode === 'existing' ? Boolean(selectedDestinationOrganisation?.id) : Boolean(newOrganisationName.trim())
  const branchPoolBlocked = assetMode === 'branch_pool' && ((summary.listings || 0) || (summary.activeTransactions || 0) || (summary.appointments || 0) || (summary.documentPackets || 0))
  const canSubmit = !loading && !executing && destinationValid && validation.ok && !branchPoolBlocked
  const activeSummaryRows = [
    ['Seller Leads', summary.sellerLeads || 0],
    ['Buyer Leads', summary.buyerLeads || 0],
    ['Listings', summary.listings || 0],
    ['Active Transactions', summary.activeTransactions || 0],
    ['Future Appointments', summary.appointments || 0],
    ['Document Packets', summary.documentPackets || 0],
  ]

  function submit() {
    onSubmit?.({
      assets,
      summary,
      retentionStrategy,
      destination: {
        mode: destinationMode,
        organisation: selectedDestinationOrganisation,
        newOrganisationName: newOrganisationName.trim(),
        branch: selectedDestinationBranch,
        role: destinationRole,
      },
      appointmentAction,
      reason,
    })
  }

  return (
    <Modal
      open={open}
      onClose={executing ? undefined : onClose}
      title="Transfer Agent"
      subtitle={agent ? `Move ${agent.name || agent.email || 'this agent'} to another agency without moving source-agency assets.` : ''}
      className="max-w-[980px]"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-[#6a7f98]">
            Default rule: the agent moves, the old agency's business assets stay.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose} disabled={executing}>Cancel</Button>
            {step > 1 ? <Button type="button" variant="secondary" onClick={() => setStep((value) => Math.max(1, value - 1))} disabled={executing}>Back</Button> : null}
            {step < 4 ? (
              <Button type="button" onClick={() => setStep((value) => Math.min(4, value + 1))} disabled={loading || executing}>
                Next
              </Button>
            ) : (
              <Button type="button" onClick={submit} disabled={!canSubmit}>
                {executing ? 'Transferring Agent…' : 'Transfer Agent'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-4">
          {['Review Agent', 'Review Assets', 'Destination', 'Retain Assets'].map((label, index) => {
            const active = step === index + 1
            return (
              <div key={label} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${active ? 'border-[#1769d1] bg-[#eef6ff] text-[#1254a3]' : 'border-[#e1e8f0] bg-white text-[#70849a]'}`}>
                {index + 1}. {label}
              </div>
            )
          })}
        </div>

        {error ? <div className="rounded-xl border border-[#f2d7d7] bg-[#fff6f6] px-4 py-3 text-sm text-[#b42318]">{error}</div> : null}

        {step === 1 ? (
          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-2xl border border-[#dfe8f2] bg-white p-4">
              <div className="flex items-center gap-3">
                <AgentAvatar agent={agent || {}} className="h-14 w-14 bg-[#0f2742] text-base font-semibold text-white" />
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-[#10243a]">{agent?.name || 'Agent'}</h3>
                  <p className="truncate text-sm text-[#60758d]">{agent?.email || 'No email'}</p>
                  <p className="truncate text-xs font-semibold text-[#7a8ea5]">{sourceOrganisation?.name || agent?.organisationName || 'Current agency'} · {formatRoleLabel(agent?.role)}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#edf2f7] bg-[#f8fbff] p-3">
                  <p className="text-xs font-semibold text-[#71859c]">Current Membership</p>
                  <p className="mt-1 text-sm font-semibold text-[#10243a]">{getAgentStatusMeta(agent || {}).label}</p>
                </div>
                <div className="rounded-xl border border-[#edf2f7] bg-[#f8fbff] p-3">
                  <p className="text-xs font-semibold text-[#71859c]">Joined</p>
                  <p className="mt-1 text-sm font-semibold text-[#10243a]">{formatDate(agent?.activatedAt || agent?.invitedAt)}</p>
                </div>
                <div className="rounded-xl border border-[#edf2f7] bg-[#f8fbff] p-3">
                  <p className="text-xs font-semibold text-[#71859c]">Source Assets</p>
                  <p className="mt-1 text-sm font-semibold text-[#10243a]">{loading ? 'Scanning…' : summary.totalAssets || 0}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[#dbe7f3] bg-[#f7fbff] p-4">
              <ShieldCheck size={20} className="text-[#1769d1]" />
              <h4 className="mt-3 text-sm font-semibold text-[#10243a]">Membership model</h4>
              <ul className="mt-2 space-y-2 text-sm leading-5 text-[#526981]">
                {transferReport.desiredBehaviour.slice(0, 3).map((item) => <li key={item}>• {item}</li>)}
              </ul>
              <Button type="button" variant="secondary" size="sm" className="mt-4" onClick={onRefresh} disabled={loading || executing}>
                {loading ? 'Scanning…' : 'Refresh asset scan'}
              </Button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {activeSummaryRows.map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-[#e1e9f2] bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7890a8]">{label}</p>
                  <p className="mt-2 text-2xl font-semibold text-[#10243a]">{loading ? '…' : value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-[#f0dfc2] bg-[#fffbf3] p-4 text-sm leading-6 text-[#6d5423]">
              These records remain in {sourceOrganisation?.name || agent?.organisationName || 'the source agency'}. Created-by, won-by, and originated-by attribution is not overwritten.
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ['existing', 'Existing Agency Invite', 'Send the agent an invite to an agency already known to this workspace.'],
                ['new', 'New Agency', 'Create a destination agency record and send an invite.'],
              ].map(([value, label, copy]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDestinationMode(value)}
                  className={`rounded-2xl border p-4 text-left transition ${destinationMode === value ? 'border-[#1769d1] bg-[#eef6ff] shadow-sm' : 'border-[#dfe8f2] bg-white hover:bg-[#f8fbff]'}`}
                >
                  <span className="text-sm font-semibold text-[#10243a]">{label}</span>
                  <span className="mt-2 block text-xs leading-5 text-[#637991]">{copy}</span>
                </button>
              ))}
            </div>

            {destinationMode === 'existing' ? (
              <label className="grid gap-1.5">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Destination Agency</span>
                <Field as="select" value={effectiveDestinationOrganisationId} onChange={(event) => setDestinationOrganisationId(event.target.value)}>
                  <option value="">Select destination agency</option>
                  {availableOrganisations.map((organisation) => (
                    <option key={organisation.id} value={organisation.id}>{organisation.name}</option>
                  ))}
                </Field>
              </label>
            ) : (
              <label className="grid gap-1.5">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">New Agency Name</span>
                <Field value={newOrganisationName} onChange={(event) => setNewOrganisationName(event.target.value)} placeholder="RE/MAX Sandton, Harcourts West..." />
              </label>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Destination Branch</span>
                <Field as="select" value={destinationBranchId} onChange={(event) => setDestinationBranchId(event.target.value)}>
                  <option value="">Destination agency to assign later</option>
                  {branchOptions.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </Field>
              </label>
              <label className="grid gap-1.5">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Destination Role</span>
                <Field as="select" value={destinationRole} onChange={(event) => setDestinationRole(event.target.value)}>
                  {AGENT_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Field>
              </label>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ['single', 'Single Internal Owner', 'Retain all source-agency assets under one active colleague.'],
                ['split', 'Split Retention', 'Choose different internal owners per asset type.'],
                ['branch_pool', 'Branch Pool', 'Only lead workload can move to the branch pool.'],
              ].map(([value, label, copy]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAssetMode(value)}
                  className={`rounded-2xl border p-4 text-left transition ${assetMode === value ? 'border-[#1769d1] bg-[#eef6ff] shadow-sm' : 'border-[#dfe8f2] bg-white hover:bg-[#f8fbff]'}`}
                >
                  <span className="text-sm font-semibold text-[#10243a]">{label}</span>
                  <span className="mt-2 block text-xs leading-5 text-[#637991]">{copy}</span>
                </button>
              ))}
            </div>

            {branchPoolBlocked || !validation.ok ? (
              <div className="rounded-xl border border-[#f2d7d7] bg-[#fff6f6] px-4 py-3 text-sm text-[#b42318]">
                {branchPoolBlocked ? 'Branch pool cannot retain active listings, transactions, appointments, or document packets.' : validation.reason}
              </div>
            ) : null}

            {assetMode === 'single' ? (
              <label className="grid gap-1.5">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Source-Agency Retention Owner</span>
                <Field as="select" value={retentionAgentId} onChange={(event) => setRetentionAgentId(event.target.value)} disabled={!hasAssets}>
                  <option value="">{hasAssets ? 'Select internal owner' : 'No source assets to retain'}</option>
                  {retentionOptions.map((option) => (
                    <option key={option.userId} value={option.userId}>{option.name} · {option.office}</option>
                  ))}
                </Field>
              </label>
            ) : null}

            {assetMode === 'split' ? (
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ['leads', 'Leads'],
                  ['listings', 'Listings'],
                  ['transactions', 'Transactions'],
                  ['appointments', 'Appointments'],
                  ['contacts', 'Contacts'],
                  ['tasks', 'Tasks'],
                  ['documentPackets', 'Document Packets'],
                  ['documentRequests', 'Document Requests'],
                ].map(([key, label]) => (
                  <label key={key} className="grid gap-1.5">
                    <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">{label}</span>
                    <Field as="select" value={splitAssignments[key]} onChange={(event) => setSplitAssignments((previous) => ({ ...previous, [key]: event.target.value }))}>
                      <option value="">Select internal owner</option>
                      {retentionOptions.map((option) => (
                        <option key={`${key}-${option.userId}`} value={option.userId}>{option.name} · {option.office}</option>
                      ))}
                    </Field>
                  </label>
                ))}
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Future Appointments</span>
                <Field as="select" value={appointmentAction} onChange={(event) => setAppointmentAction(event.target.value)}>
                  <option value="reassign">Reassign to retained owner</option>
                  <option value="cancel">Cancel and audit</option>
                </Field>
              </label>
              <label className="grid gap-1.5">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Reason</span>
                <Field value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Agent resigned and joined another agency..." />
              </label>
            </div>
          </section>
        ) : null}
      </div>
    </Modal>
  )
}

function PerformanceKpiStrip({ kpis }) {
  const cards = [
    { label: 'Total Agents', value: kpis.totalAgents, helper: 'In selected scope', icon: Users, tone: 'bg-[#edf5ff] text-[#1769d1]' },
    { label: 'Active Today', value: kpis.activeToday, helper: 'Logged activity today', icon: CheckCircle2, tone: 'bg-[#ecfdf3] text-[#16894f]' },
    { label: 'Pipeline Value', value: formatCompactCurrency(kpis.pipelineValue ?? kpis.totalPipelineValue), helper: 'Active assigned value', icon: ArrowRight, tone: 'bg-[#eef4ff] text-[#315adf]' },
    { label: 'Transactions', value: kpis.transactions ?? kpis.activeTransactions, helper: 'Active deals', icon: BriefcaseBusiness, tone: 'bg-[#f3efff] text-[#7657d8]' },
    { label: 'Conversion Rate', value: `${(kpis.conversionRate ?? kpis.averageConversionRate) || 0}%`, helper: 'Network conversion', icon: Trophy, tone: 'bg-[#fff7e8] text-[#a46313]' },
    { label: 'Commission MTD', value: kpis.commissionMtd === null || kpis.commissionMtd === undefined ? 'N/A' : formatCompactCurrency(kpis.commissionMtd), helper: 'Registered month to date', icon: DollarSign, tone: 'bg-[#f0fbf5] text-[#1d7d45]' },
  ]

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <article key={card.label} className="min-w-0 rounded-2xl border border-[#dfe7f1] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.tone}`}>
                <Icon size={15} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#71859c]">{card.label}</p>
                <p className="mt-1 truncate text-[1.16rem] font-semibold leading-none tracking-[-0.025em] text-[#10243a]">{card.value}</p>
                <p className="mt-1 truncate text-[0.68rem] text-[#71859c]">{card.helper}</p>
              </div>
            </div>
          </article>
        )
      })}
    </section>
  )
}

function BranchPerformanceScroller({ branches = [] }) {
  return (
    <section className="min-w-0 rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[#10243a]">Branch Performance</h2>
          <p className="mt-0.5 truncate text-xs text-[#6d8299]">Office-level performance inside the selected scope.</p>
        </div>
        <span className="shrink-0 rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#60758d]">{branches.length} offices</span>
      </div>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
        {branches.map((branch) => (
          <article key={branch.id} className="min-w-[250px] rounded-2xl border border-[#e2ebf5] bg-[#fbfdff] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-[#10243a]">{branch.name}</h3>
                <p className="mt-1 text-xs text-[#6d8299]">{branch.attentionCount || 0} need attention</p>
              </div>
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf5ff] text-[#1769d1]">
                <Building2 size={16} />
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-white px-3 py-2">
                <p className="text-[#71859c]">Agents</p>
                <p className="mt-1 font-semibold text-[#10243a]">{branch.activeAgents}</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <p className="text-[#71859c]">Pipeline</p>
                <p className="mt-1 font-semibold text-[#10243a]">{formatCompactCurrency(branch.pipelineValue)}</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <p className="text-[#71859c]">Transactions</p>
                <p className="mt-1 font-semibold text-[#10243a]">{branch.transactions}</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <p className="text-[#71859c]">Conversion</p>
                <p className="mt-1 font-semibold text-[#10243a]">{branch.conversionRate || 0}%</p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function TopPerformersPanel({ rows = [], metric = 'pipelineValue', metricOptions = LEADERBOARD_METRICS, onMetricChange, onView }) {
  const renderMetric = (row) => {
    if (metric === 'conversionRate') return `${row.metricValue || 0}%`
    if (metric === 'activityVolume' || metric === 'registrations' || metric === 'deals') return row.metricValue || 0
    if (metric === 'responseTime') return row.metricValue ? `${Math.round(row.metricValue)}h` : 'N/A'
    return formatCompactCurrency(row.metricValue)
  }

  return (
    <article className="min-w-0 rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[#10243a]">Top Performers</h2>
          <p className="mt-0.5 text-xs text-[#6d8299]">Ranked by the selected performance metric.</p>
        </div>
        <DirectorySelect
          label="Leaderboard metric"
          value={metric}
          onChange={onMetricChange}
          options={metricOptions.map((item) => ({ value: item.value, label: item.label }))}
        />
      </div>
      <div className="mt-4 divide-y divide-[#edf2f7]">
        {rows.length ? rows.map((row) => (
          <button key={row.id} type="button" className="grid w-full grid-cols-[34px_minmax(0,1fr)_96px] items-center gap-3 py-3 text-left hover:bg-[#f8fbff]" onClick={() => onView(row.agent)}>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#eef5ff] text-xs font-semibold text-[#1769d1]">{row.rank}</span>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <AgentAvatar agent={row} className="h-8 w-8 border border-[#d7e2ef] bg-white text-[0.68rem] font-semibold text-[#245076]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[#10243a]">{row.name}</span>
                  <span className="block truncate text-xs text-[#6d8299]">{formatRoleLabel(row.role)} · {row.branchName || 'Current Office'}</span>
                </span>
              </span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-[#edf2f7]">
                <span className="block h-full rounded-full bg-[#1769d1]" style={{ width: `${Math.max(5, row.progress || 0)}%` }} />
              </span>
            </span>
            <span className="text-right text-xs font-semibold text-[#10243a]">{renderMetric(row)}</span>
          </button>
        )) : (
          <p className="rounded-xl bg-[#f8fbff] px-3 py-6 text-center text-sm text-[#6b7f97]">No ranked performance data yet.</p>
        )}
      </div>
    </article>
  )
}

function AttentionAgentsPanel({ rows = [], onView }) {
  const severityClass = {
    High: 'border-[#f1c9c9] bg-[#fff4f4] text-[#a03c3c]',
    Medium: 'border-[#f0dfb8] bg-[#fff8eb] text-[#8a641d]',
    Low: 'border-[#dbe6f2] bg-[#f8fbff] text-[#60758d]',
  }

  return (
    <article className="min-w-0 rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[#10243a]">Agents Requiring Attention</h2>
          <p className="mt-0.5 truncate text-xs text-[#6d8299]">Coaching signals from activity, follow-ups and conversion.</p>
        </div>
        <span className="shrink-0 rounded-full border border-[#f0dfb8] bg-[#fff8eb] px-3 py-1 text-xs font-semibold text-[#8a641d]">{rows.length} watch</span>
      </div>
      <div className="mt-4 divide-y divide-[#edf2f7]">
        {rows.length ? rows.map((row) => (
          <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <AgentAvatar agent={row} className="h-8 w-8 bg-[#fff7ed] text-xs font-semibold text-[#9a5b13]" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#10243a]">{row.name}</p>
                  <p className="truncate text-xs text-[#6d8299]">{row.primaryReason}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold ${severityClass[row.severity] || severityClass.Low}`}>{row.severity} risk</span>
                <span className="text-xs font-semibold text-[#60758d]">{row.suggestedAction}</span>
              </div>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => onView(row.agent)}>Open</Button>
          </div>
        )) : (
          <p className="rounded-xl bg-[#f8fbff] px-3 py-6 text-center text-sm text-[#6b7f97]">No intervention items right now.</p>
        )}
      </div>
    </article>
  )
}

function ChartShell({ title, helper, children, empty }) {
  return (
    <article className="min-w-0 rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[#10243a]">{title}</h3>
          <p className="mt-0.5 truncate text-xs text-[#6d8299]">{helper}</p>
        </div>
      </div>
      <div className="mt-4 min-h-[164px]">
        {empty ? (
          <div className="flex min-h-[150px] items-center justify-center rounded-xl bg-[#f8fbff] px-4 text-center text-sm text-[#6d8299]">
            No data recorded for this period.
          </div>
        ) : children}
      </div>
    </article>
  )
}

function PipelineValueChart({ data = [] }) {
  return (
    <div className="space-y-2.5">
      {data.map((item) => (
        <div key={`${item.agent}-pipeline`} className="grid grid-cols-[34px_minmax(0,1fr)_76px] items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#edf5ff] text-[0.68rem] font-semibold text-[#1769d1]">{item.initials}</span>
          <div className="min-w-0">
            <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
              <span className="truncate text-xs font-semibold text-[#294159]">{item.agent}</span>
            </div>
            <div className="h-2 rounded-full bg-[#edf2f7]">
              <div className="h-2 rounded-full bg-[#1769d1]" style={{ width: `${Math.max(4, item.percent)}%` }} />
            </div>
          </div>
          <span className="truncate text-right text-xs font-semibold text-[#10243a]">{formatCompactCurrency(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

function ConversionRateChart({ data = [] }) {
  return (
    <div className="space-y-2.5">
      {data.map((item) => (
        <div key={`${item.agent}-conversion`} className="grid grid-cols-[minmax(0,0.9fr)_minmax(100px,1fr)_42px] items-center gap-2">
          <span className="truncate text-xs font-semibold text-[#294159]">{item.agent}</span>
          <div className="h-2 rounded-full bg-[#edf2f7]">
            <div className="h-2 rounded-full bg-[#16a36b]" style={{ width: `${Math.max(3, Math.min(100, item.value || 0))}%` }} />
          </div>
          <span className="text-right text-xs font-semibold text-[#10243a]">{item.value || 0}%</span>
        </div>
      ))}
    </div>
  )
}

function ListingsRegistrationsChart({ data = [] }) {
  return (
    <div className="space-y-3">
      {data.map((item) => (
        <div key={`${item.agent}-listing-registration`} className="grid grid-cols-[minmax(0,0.8fr)_minmax(120px,1fr)] items-center gap-3">
          <span className="truncate text-xs font-semibold text-[#294159]">{item.agent}</span>
          <div className="grid gap-1.5">
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-[#edf2f7]">
                <div className="h-2 rounded-full bg-[#1769d1]" style={{ width: `${Math.max(4, Math.round((item.listings / Math.max(item.max, 1)) * 100))}%` }} />
              </div>
              <span className="w-6 text-right text-[0.68rem] font-semibold text-[#60758d]">{item.listings}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-[#edf2f7]">
                <div className="h-2 rounded-full bg-[#18a058]" style={{ width: `${Math.max(4, Math.round((item.registrations / Math.max(item.max, 1)) * 100))}%` }} />
              </div>
              <span className="w-6 text-right text-[0.68rem] font-semibold text-[#60758d]">{item.registrations}</span>
            </div>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-4 pt-1 text-[0.68rem] font-semibold text-[#6d8299]">
        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#1769d1]" /> Listings</span>
        <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#18a058]" /> Registrations</span>
      </div>
    </div>
  )
}

function ActivityHeatmap({ data = [] }) {
  const maxValue = Math.max(1, ...data.flatMap((row) => row.days.map((day) => day.value)))
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[86px_repeat(7,minmax(24px,1fr))] gap-1 text-[0.64rem] font-semibold uppercase tracking-[0.06em] text-[#8a9bb0]">
        <span />
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day} className="text-center">{day}</span>)}
      </div>
      {data.map((row) => (
        <div key={row.type} className="grid grid-cols-[86px_repeat(7,minmax(24px,1fr))] items-center gap-1">
          <span className="truncate text-xs font-semibold text-[#405870]">{row.label}</span>
          {row.days.map((day) => (
            <span
              key={`${row.type}-${day.day}`}
              title={`${row.label}: ${day.value}`}
              className="h-7 rounded-md border border-[#e4ebf4]"
              style={{
                backgroundColor: day.value ? `rgba(23, 105, 209, ${0.12 + (day.value / maxValue) * 0.5})` : '#f8fbff',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function AgentPerformanceCard({ agent, canManage = false, onView, onEditRole, onDeactivate, onTransfer, onAssignLead }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const performance = agent.performance || {}
  const statusMeta = agent.statusMeta || getAgentStatusMeta(agent)
  const sparkMax = Math.max(1, ...(performance.sparkline || []))

  return (
    <article className="group min-w-0 rounded-2xl border border-[#dfe7f1] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-[#c7d6e6] hover:bg-[#fbfdff] hover:shadow-[0_16px_34px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={onView}>
          <AgentAvatar agent={agent} className="h-11 w-11 border border-[#d7e2ef] bg-[linear-gradient(135deg,#f8fbff,#eaf2fb)] text-sm font-semibold text-[#244e70]" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[#10243a]">{agent.displayName || agent.name || 'Agent'}</span>
            <span className="mt-0.5 block truncate text-xs text-[#60758d]">{formatRoleLabel(agent.role)} • {agent.office || agent.organisationName || 'Unassigned'}</span>
          </span>
        </button>
        <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold ${statusMeta.className}`}>
          {statusMeta.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-4 divide-x divide-[#e7eef6] border-y border-[#edf2f7] py-3">
        <div className="min-w-0 pr-2">
          <p className="text-[0.66rem] font-medium text-[#72859c]">Pipeline</p>
          <p className="mt-1 truncate text-sm font-semibold text-[#10243a]">{formatCompactCurrency(performance.pipelineValue)}</p>
        </div>
        <div className="min-w-0 px-2">
          <p className="text-[0.66rem] font-medium text-[#72859c]">Deals</p>
          <p className="mt-1 text-sm font-semibold text-[#10243a]">{performance.deals || 0}</p>
        </div>
        <div className="min-w-0 px-2">
          <p className="text-[0.66rem] font-medium text-[#72859c]">Listings</p>
          <p className="mt-1 text-sm font-semibold text-[#10243a]">{performance.listings || 0}</p>
        </div>
        <div className="min-w-0 pl-2">
          <p className="text-[0.66rem] font-medium text-[#72859c]">Convert</p>
          <p className="mt-1 text-sm font-semibold text-[#10243a]">{performance.conversionRate || 0}%</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl bg-[#f8fbff] px-3 py-2">
          <p className="font-medium text-[#72859c]">Next follow-ups</p>
          <p className="mt-1 font-semibold text-[#10243a]">{performance.nextFollowUps || 0}</p>
        </div>
        <div className="rounded-xl bg-[#fff8f5] px-3 py-2">
          <p className="font-medium text-[#72859c]">Overdue</p>
          <p className="mt-1 font-semibold text-[#9a4038]">{performance.overdueFollowUps || 0}</p>
        </div>
        <div className="rounded-xl bg-[#f8fbff] px-3 py-2">
          <p className="font-medium text-[#72859c]">Response</p>
          <p className="mt-1 font-semibold text-[#10243a]">{performance.responseTimeLabel || 'N/A'}</p>
        </div>
      </div>

      {(performance.sparkline || []).some(Boolean) ? (
        <div className="mt-3 flex h-8 items-end gap-1">
          {performance.sparkline.map((value, index) => (
            <span key={`${agent.id}-spark-${index}`} className="flex-1 rounded-t bg-[#cfe0f5]" style={{ height: `${Math.max(15, Math.round((value / sparkMax) * 100))}%` }} />
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 opacity-70 transition group-hover:opacity-100">
          <a className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#526981] hover:bg-[#edf5ff] hover:text-[#1769d1]" href={agent.phone ? `tel:${agent.phone}` : undefined} aria-label="Call agent">
            <Phone size={15} />
          </a>
          <a className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#526981] hover:bg-[#edf5ff] hover:text-[#1769d1]" href={agent.phone ? `https://wa.me/${String(agent.phone).replace(/\D/g, '')}` : undefined} aria-label="WhatsApp agent">
            <MessageCircle size={15} />
          </a>
          <a className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#526981] hover:bg-[#edf5ff] hover:text-[#1769d1]" href={agent.email ? `mailto:${agent.email}` : undefined} aria-label="Email agent">
            <Mail size={15} />
          </a>
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#526981] hover:bg-[#edf5ff] hover:text-[#1769d1]" aria-label="Calendar" onClick={onView}>
            <CalendarDays size={15} />
          </button>
          {canManage ? (
            <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#526981] hover:bg-[#edf5ff] hover:text-[#1769d1]" aria-label="Assign lead" onClick={onAssignLead}>
              <ArrowRight size={15} />
            </button>
          ) : null}
        </div>
        <div className="relative">
          <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#526981] hover:bg-[#f5f8fb]" aria-label="More actions" onClick={() => setMenuOpen((open) => !open)}>
            <MoreHorizontal size={16} />
          </button>
          {menuOpen ? (
            <div className="absolute bottom-[calc(100%+8px)] right-0 z-20 w-44 rounded-2xl border border-[#dce6f0] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.15)]">
              <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" onClick={onView}>Open lead workspace</button>
              {canManage ? <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" onClick={onEditRole}>Edit agent</button> : null}
              {canManage ? <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" onClick={onTransfer}>Transfer agent</button> : null}
              {canManage ? <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#9a3a13] hover:bg-[#fff7ed]" onClick={onDeactivate}>Deactivate</button> : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function AgentPerformanceTable({ rows = [], canManage = false, sortBy = 'pipeline', onSort, onView, onEditRole, onDeactivate, onTransfer }) {
  const headers = [
    { key: 'name', label: 'Agent' },
    { key: 'branch', label: 'Branch' },
    { key: 'role', label: 'Role' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'deals', label: 'Deals' },
    { key: 'listings', label: 'Listings' },
    { key: 'conversion', label: 'Conversion' },
    { key: 'lastActivity', label: 'Last Activity' },
    { key: 'followUps', label: 'Follow-ups' },
    { key: 'status', label: 'Status' },
  ]

  return (
    <div className="overflow-hidden rounded-2xl border border-[#dde6f1] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-[#edf2f7] px-4 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[#10243a]">Agent Performance Table</h2>
          <p className="mt-0.5 truncate text-xs text-[#6d8299]">Sortable, filter-aware operating view for principal oversight.</p>
        </div>
        <span className="shrink-0 rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#60758d]">{rows.length} agents</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1160px] text-left">
          <thead className="bg-[#f6f9fc] text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#70849d]">
            <tr>
              {headers.map((header) => (
                <th key={header.key} className="px-4 py-3">
                  <button
                    type="button"
                    className={`inline-flex rounded-lg px-1 py-0.5 text-left transition hover:bg-white hover:text-[#1769d1] ${sortBy === header.key ? 'text-[#1769d1]' : ''}`}
                    onClick={() => onSort?.(header.key)}
                  >
                    {header.label}
                  </button>
                </th>
              ))}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e8eef5] text-sm text-[#22384c]">
            {rows.map((row) => {
              const performance = row.performance || {}
              const statusClassName = row.statusClassName || getAgentStatusMeta(row.agent || {}).className
              return (
                <tr key={`${row.id}-${row.branchId || 'branch'}-performance-row`} className="cursor-pointer hover:bg-[#f8fbff]" onClick={() => onView(row.agent)}>
                  <td className="px-4 py-3">
                    <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={(event) => { event.stopPropagation(); onView(row.agent) }}>
                      <AgentAvatar agent={row} className="h-9 w-9 border border-[#d7e2ef] bg-[#f8fbff] text-xs font-semibold text-[#245076]" />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[#142132]">{row.name || 'Agent'}</span>
                        <span className="block truncate text-xs text-[#60758d]">{row.email || 'No email added'}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3">{row.branchName || 'Current Office'}</td>
                  <td className="px-4 py-3">{formatRoleLabel(row.role)}</td>
                  <td className="px-4 py-3 font-semibold">{formatCompactCurrency(performance.pipelineValue)}</td>
                  <td className="px-4 py-3">{performance.deals || 0}</td>
                  <td className="px-4 py-3">{performance.listings || 0}</td>
                  <td className="px-4 py-3">{performance.conversionRate || 0}%</td>
                  <td className="px-4 py-3">{formatRelativeActivity(performance.lastActivityAt)}</td>
                  <td className="px-4 py-3">
                    <span className={performance.overdueFollowUps ? 'font-semibold text-[#9a4038]' : ''}>{performance.overdueFollowUps || 0}</span>
                  </td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold ${statusClassName}`}>{row.statusLabel || 'Active'}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <a className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#526981] hover:bg-[#edf5ff] hover:text-[#1769d1]" href={row.phone ? `tel:${row.phone}` : undefined} onClick={(event) => event.stopPropagation()} aria-label="Call agent"><Phone size={15} /></a>
                      <a className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#526981] hover:bg-[#edf5ff] hover:text-[#1769d1]" href={row.email ? `mailto:${row.email}` : undefined} onClick={(event) => event.stopPropagation()} aria-label="Email agent"><Mail size={15} /></a>
                      <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#526981] hover:bg-[#edf5ff] hover:text-[#1769d1]" onClick={(event) => { event.stopPropagation(); onView(row.agent) }} aria-label="Schedule"><CalendarDays size={15} /></button>
                      {canManage ? <Button type="button" size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); onEditRole(row.agent) }}>Role</Button> : null}
                      {canManage ? <Button type="button" size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); onTransfer(row.agent) }}>Transfer</Button> : null}
                      {canManage ? <Button type="button" size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); onDeactivate(row.agent) }}><MoreHorizontal size={15} /></Button> : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AgentLeaderboardView({ agents, metric, onMetricChange, onView }) {
  const sortedAgents = [...agents].sort((left, right) => {
    const leftPerformance = left.performance || {}
    const rightPerformance = right.performance || {}
    if (metric === 'registrations') return (rightPerformance.registrations || 0) - (leftPerformance.registrations || 0)
    if (metric === 'conversionRate') return (rightPerformance.conversionRate || 0) - (leftPerformance.conversionRate || 0)
    if (metric === 'activityVolume') return (rightPerformance.activityVolume || 0) - (leftPerformance.activityVolume || 0)
    if (metric === 'responseTime') return (leftPerformance.responseTimeHours ?? Infinity) - (rightPerformance.responseTimeHours ?? Infinity)
    return (rightPerformance.pipelineValue || 0) - (leftPerformance.pipelineValue || 0)
  })

  const renderMetricValue = (agent) => {
    const performance = agent.performance || {}
    if (metric === 'registrations') return performance.registrations || 0
    if (metric === 'conversionRate') return `${performance.conversionRate || 0}%`
    if (metric === 'activityVolume') return performance.activityVolume || 0
    if (metric === 'responseTime') return performance.responseTimeLabel || 'N/A'
    return formatCompactCurrency(performance.pipelineValue)
  }

  return (
    <section className="rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#10243a]">Leaderboard</h3>
          <p className="mt-0.5 text-xs text-[#6d8299]">Rank agents by the metric that matters this week.</p>
        </div>
        <DirectorySelect
          label="Leaderboard metric"
          value={metric}
          onChange={onMetricChange}
          options={LEADERBOARD_METRICS.map((item) => ({ value: item.value, label: item.label }))}
        />
      </div>
      <div className="mt-4 divide-y divide-[#edf2f7]">
        {sortedAgents.map((agent, index) => (
          <button key={`${agent.id}-leaderboard`} type="button" className="grid w-full grid-cols-[38px_minmax(0,1fr)_120px] items-center gap-3 py-3 text-left hover:bg-[#f8fbff]" onClick={() => onView(agent)}>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#edf5ff] text-xs font-semibold text-[#1769d1]">{index + 1}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[#10243a]">{agent.displayName || agent.name || 'Agent'}</span>
              <span className="block truncate text-xs text-[#6d8299]">{agent.office || agent.organisationName || 'Unassigned'}</span>
            </span>
            <span className="text-right text-sm font-semibold text-[#10243a]">{renderMetricValue(agent)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function AgentPerformanceIntelligencePanel({ intelligence, onLeaderboard }) {
  return (
    <aside className="space-y-4">
      <article className="rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[#142132]">Top Performers</h3>
          <button type="button" className="text-xs font-semibold text-[#1769d1]" onClick={onLeaderboard}>View Leaderboard</button>
        </div>
        <div className="mt-4 space-y-3">
          {intelligence.topPerformers?.length ? intelligence.topPerformers.map((agent, index) => (
            <div key={`${agent.id}-top-performance`} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eaf3ff] text-xs font-semibold text-[#1769d1]">{index + 1}</span>
                <AgentAvatar agent={agent} className="h-7 w-7 border border-[#d7e2ef] bg-white text-[0.64rem] font-semibold text-[#245076]" />
                <span className="truncate text-sm font-semibold text-[#263a4f]">{agent.displayName || agent.name || 'Agent'}</span>
              </div>
              <span className="shrink-0 text-xs font-semibold text-[#0f2742]">{formatCompactCurrency(agent.performance?.pipelineValue)}</span>
            </div>
          )) : <p className="rounded-xl bg-[#f8fbff] px-3 py-3 text-sm text-[#6b7f97]">No performance data yet.</p>}
        </div>
      </article>

      <article className="rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[#142132]">Agents Needing Attention</h3>
          <span className="text-xs font-semibold text-[#1769d1]">Watchlist</span>
        </div>
        <div className="mt-4 space-y-3">
          {intelligence.attentionAgents?.length ? intelligence.attentionAgents.map((agent) => (
            <div key={`${agent.id}-attention-performance`} className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fff7ed] text-[#e07800]">
                <AlertTriangle size={14} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#263a4f]">{agent.displayName || agent.name || 'Agent'}</p>
                <p className="text-xs text-[#6b7f97]">{agent.attentionFlags?.[0] || 'Needs review'}</p>
              </div>
            </div>
          )) : <p className="rounded-xl bg-[#f8fbff] px-3 py-3 text-sm text-[#6b7f97]">No attention items right now.</p>}
        </div>
      </article>

      <article className="rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[#142132]">Recent Agent Activity</h3>
          <span className="text-xs font-semibold text-[#1769d1]">Latest</span>
        </div>
        <div className="mt-4 space-y-3">
          {intelligence.recentActivity?.length ? intelligence.recentActivity.map((event, index) => (
            <div key={`${event.agentName}-${event.timestamp}-${index}`} className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ecfdf3] text-[#16894f]">
                <Clock3 size={14} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#263a4f]">{event.agentName}</p>
                <p className="truncate text-xs text-[#6b7f97]">{event.action}</p>
                <p className="mt-0.5 text-xs text-[#8294aa]">{formatRelativeActivity(event.timestamp)}</p>
              </div>
            </div>
          )) : <p className="rounded-xl bg-[#f8fbff] px-3 py-3 text-sm text-[#6b7f97]">No activity recorded for this period.</p>}
        </div>
      </article>
    </aside>
  )
}

function DetailInfoRow({ label, value }) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(86px,0.42fr)_minmax(0,1fr)] gap-3 border-b border-[#edf2f7] py-2.5 last:border-0 sm:grid-cols-[118px_minmax(0,1fr)]">
      <span className="min-w-0 truncate text-xs font-semibold text-[#6f839a]">{label}</span>
      <span className="min-w-0 truncate text-sm font-semibold text-[#20364d]" title={String(value || '—')}>{value || '—'}</span>
    </div>
  )
}

function AgentManagementCard({ title, actionLabel, onAction, children, className = '' }) {
  return (
    <article className={`min-w-0 overflow-hidden rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm ${className}`}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 border-b border-[#edf2f7] pb-3">
        <h3 className="min-w-0 text-base font-semibold tracking-[-0.025em] text-[#10243a]">{title}</h3>
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} className="shrink-0 text-xs font-semibold text-[#1769d1] hover:text-[#0f4f9f]">
            {actionLabel}
          </button>
        ) : actionLabel ? (
          <span className="shrink-0 rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#60758d]">
            {actionLabel}
          </span>
        ) : null}
      </div>
      <div className="mt-3">{children}</div>
    </article>
  )
}

function PrincipalAgentTabShell({ title, description, actionLabel, onAction, children }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-[-0.03em] text-[#10243a]">{title}</h2>
          <p className="mt-1 text-sm text-[#61778f]">{description}</p>
        </div>
        {actionLabel ? (
          <button type="button" onClick={onAction} className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#0f2742] shadow-sm transition hover:bg-[#f7fafc]">
            {actionLabel}
          </button>
        ) : null}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

function StatusBadge({ agent }) {
  const statusMeta = getAgentStatusMeta(agent)
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusMeta.className}`}>
      {statusMeta.label}
    </span>
  )
}

function AgentWorkspace({ agent, canManageSettings }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [editMenuOpen, setEditMenuOpen] = useState(false)
  const [modalMode, setModalMode] = useState('')
  const [pendingAction, setPendingAction] = useState(null)
  const [actionNotice, setActionNotice] = useState('')

  const effectiveActiveTab = AGENT_WORKSPACE_TABS.some((tab) => tab.key === activeTab) ? activeTab : 'overview'

  const developmentListings = agent.developmentListings || []
  const privateListings = agent.privateListings || []
  const allListings = [...developmentListings, ...privateListings.map((listing) => ({
    id: listing.id,
    title: listing.listingTitle,
    listingType: 'private_sale',
    developmentName: 'Private Sale',
    suburb: listing.suburb || 'Area pending',
    price: Number(listing.askingPrice || 0),
    status: 'Active',
    mandateStatus: listing.mandateType || 'Sole',
    sellerOnboardingStatus: listing?.sellerOnboarding?.status || 'sent',
    documentsStatus: 'Requested',
    listedAt: listing.createdAt || null,
  }))]

  const activeDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'active')
  const completedDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'completed')
  const cancelledDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'cancelled')
  const pipelineStageSummary = PIPELINE_STATUS_ORDER.map((status) => ({
    status,
    count: agent.pipelineRows.filter((lead) => lead.status === status).length,
  }))
  const recentActivity = [
    ...agent.recentDeals.map((row) => ({
      id: `deal-${row?.transaction?.id}`,
      label: 'Transaction updated',
      record: row?.buyer?.name || row?.development?.name || 'Deal workspace',
      timestamp: row?.transaction?.updated_at || row?.transaction?.created_at,
      icon: BriefcaseBusiness,
      tone: 'bg-blue-50 text-blue-600',
    })),
    ...allListings.slice(0, 3).map((listing) => ({
      id: `listing-${listing.id}`,
      label: 'Listing assigned',
      record: listing.title || listing.listingTitle || 'Listing',
      timestamp: listing.listedAt || listing.createdAt,
      icon: Building2,
      tone: 'bg-emerald-50 text-emerald-600',
    })),
    ...(agent.appointments || []).slice(0, 3).map((appointment) => ({
      id: `appointment-${appointment.appointmentId}`,
      label: 'Appointment created',
      record: appointment.title || appointment.appointmentType || 'Appointment',
      timestamp: appointment.updatedAt || appointment.dateTime,
      icon: CalendarDays,
      tone: 'bg-orange-50 text-orange-600',
    })),
  ]
    .filter((item) => item.id)
    .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime())
    .slice(0, 6)

  const primaryMetrics = [
    { label: 'Pipeline Value', value: formatCurrency(agent.metrics.pipelineValue), helper: 'Active assigned pipeline' },
    { label: 'Active Deals', value: agent.metrics.activeDeals, helper: 'In progress' },
    { label: 'Active Listings', value: agent.metrics.activeListings, helper: 'Assigned stock' },
    { label: 'Registered Deals', value: agent.metrics.registeredDeals, helper: 'Closed / registered' },
  ]

  const secondaryMetrics = [
    { label: 'Total Sales Value', value: formatCurrency(agent.metrics.totalSalesValue), helper: 'All completed deals' },
    { label: 'Commission Earned', value: formatCurrency(agent.metrics.commissionEarned), helper: 'Estimated commission' },
    { label: 'Follow-ups Due', value: agent.metrics.followUpsDue, helper: 'Open lead tasks' },
    { label: 'Average Deal Time', value: `${agent.metrics.averageDealTime || 0} days`, helper: 'Average cycle' },
  ]

  const permissionRows = [
    ['Listings', 'Full Access'],
    ['Transactions', 'Full Access'],
    ['Clients', 'Edit'],
    ['Reports', canManageSettings ? 'Full Access' : 'View Only'],
    ['Documents', 'Edit'],
    ['Agency Settings', canManageSettings ? 'Edit' : 'No Access'],
    ['Commission Visibility', canManageSettings ? 'Full Access' : 'View Only'],
  ]

  const teamAllocationRows = [
    ['Team size', canManageSettings ? '4 Agents' : '—'],
    ['Listings assigned', allListings.length],
    ['Deals assigned', agent.deals.length],
    ['Active clients', Math.max(agent.pipelineRows.length, agent.metrics.activeDeals)],
    ['Branch allocation', agent.office || agent.organisationName || 'Not assigned'],
    ['Managed agents', formatRoleLabel(agent.role).toLowerCase().includes('principal') ? 'Organisation team' : '—'],
  ]

  const confirmDescriptions = {
    deactivate: `Deactivate ${agent.name || 'this agent'} so they can no longer work as an active agent in this organisation.`,
    archive: `Archive ${agent.name || 'this agent'} from the active agent directory. Records will remain available for reporting.`,
    remove: `Remove ${agent.name || 'this agent'} from this organisation. This should only be used when access must be revoked.`,
  }

  function openPlaceholder(mode) {
    setEditMenuOpen(false)
    setModalMode(mode)
  }

  function handleConfirmedAction() {
    if (!pendingAction) return
    const label = pendingAction === 'remove' ? 'Remove agent' : pendingAction === 'archive' ? 'Archive agent' : 'Deactivate agent'
    setActionNotice(`${label} requires the connected account workflow. Nothing was changed yet.`)
    setPendingAction(null)
  }

  return (
    <section className="min-w-0 space-y-5 overflow-hidden">
      <button
        type="button"
        onClick={() => navigate('/agency/agents')}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#4f6882] transition hover:text-[#0f2742]"
      >
        <ArrowLeft size={16} />
        Back to Agents
      </button>

      {actionNotice ? (
        <div className="rounded-2xl border border-[#dbe6f4] bg-[#f4f8ff] px-4 py-3 text-sm font-semibold text-[#244e70]">
          {actionNotice}
        </div>
      ) : null}

      <section className="min-w-0 rounded-3xl border border-[#dde6f1] bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)] sm:p-5">
        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row">
            <span className="relative inline-flex h-20 w-20 shrink-0">
              <AgentAvatar agent={agent} className="h-20 w-20 border border-[#d7e2ef] bg-[linear-gradient(135deg,#f8fbff,#e7eef7)] text-2xl font-semibold text-[#2f5578]" />
              <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-[#16a365]" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 truncate text-2xl font-semibold tracking-[-0.04em] text-[#10243a]">{agent.name || 'Agent'}</h1>
                <StatusBadge agent={agent} />
              </div>
              <p className="mt-1 text-sm font-semibold text-[#60758d]">{formatRoleLabel(agent.role)}</p>
              <p className="mt-1 text-sm text-[#60758d]">{agent.office || agent.organisationName || 'Not assigned'}</p>
              <div className="mt-3 grid min-w-0 gap-x-5 gap-y-2 text-xs font-medium text-[#61778f] sm:grid-cols-2">
                <span className="inline-flex min-w-0 items-center gap-1.5"><Mail size={13} className="shrink-0" /><span className="min-w-0 truncate" title={agent.email || 'Email pending'}>{agent.email || 'Email pending'}</span></span>
                <span className="inline-flex min-w-0 items-center gap-1.5"><Phone size={13} className="shrink-0" /><span className="min-w-0 truncate">{agent.phone || 'Phone pending'}</span></span>
                <span className="min-w-0 truncate">Agent ID: {agent.userId || agent.id || 'Pending'}</span>
                <span className="min-w-0 truncate">Joined {formatDate(agent.activatedAt || agent.invitedAt)}</span>
              </div>
            </div>
          </div>

          <div className="grid min-w-0 gap-4">
            <div className="flex min-w-0 flex-wrap justify-start gap-2 2xl:justify-end">
              <button type="button" className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#0f2742] shadow-sm transition hover:bg-[#f7fafc] sm:w-auto" onClick={() => openPlaceholder('message')}>
                <MessageCircle size={16} />
                Message Agent
              </button>
              <button type="button" className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#0f2742] shadow-sm transition hover:bg-[#f7fafc] sm:w-auto" onClick={() => openPlaceholder('assign-listing')}>
                Assign Listing
              </button>
              <button type="button" className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#0f2742] shadow-sm transition hover:bg-[#f7fafc] sm:w-auto" onClick={() => openPlaceholder('assign-deal')}>
                Assign Deal
              </button>
              <div className="relative w-full sm:w-auto">
                <button type="button" onClick={() => setEditMenuOpen((open) => !open)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#0f2742] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(15,39,66,0.18)] transition hover:bg-[#173a5e] sm:w-auto">
                  Edit Agent
                  <MoreHorizontal size={16} />
                </button>
                {editMenuOpen ? (
                  <div className="absolute left-0 top-[calc(100%+8px)] z-20 w-52 rounded-2xl border border-[#dce6f0] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.15)] sm:left-auto sm:right-0">
                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" onClick={() => openPlaceholder('profile')}><Edit3 size={15} />Edit profile</button>
                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" onClick={() => openPlaceholder('commission')}><DollarSign size={15} />Commission</button>
                    <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" onClick={() => openPlaceholder('permissions')}><ShieldCheck size={15} />Permissions</button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(136px,1fr))] gap-3">
              {primaryMetrics.map((metric) => (
                <div key={metric.label} className="min-w-0 rounded-2xl border border-[#e4ebf4] bg-[#fbfcfe] px-3 py-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#71859c]">{metric.label}</p>
                  <p className="mt-1 truncate text-[1.2rem] font-semibold tracking-[-0.035em] text-[#10243a]">{metric.value}</p>
                  <p className="mt-1 truncate text-[0.68rem] text-[#73879f]">{metric.helper}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <nav className="min-w-0 max-w-full overflow-x-auto rounded-2xl border border-[#dde6f1] bg-white p-2 shadow-sm">
        <div className="flex w-max min-w-full items-center gap-1">
          {AGENT_WORKSPACE_TABS.map((tab) => {
            const Icon = tab.icon
            return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition ${
                effectiveActiveTab === tab.key
                  ? 'bg-[#0f2742] text-white shadow-sm'
                  : 'text-[#405870] hover:bg-[#f6f9fc] hover:text-[#10243a]'
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )})}
        </div>
      </nav>

      {effectiveActiveTab === 'overview' ? (
        <section className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.38fr)]">
          <div className="min-w-0 space-y-4">
            <AgentManagementCard title="Agent Summary" actionLabel="This Month">
              <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
                {[...primaryMetrics, ...secondaryMetrics].map((metric) => (
                  <AgentMetricCard key={metric.label} label={metric.label} value={metric.value} helper={metric.helper} />
                ))}
              </div>
            </AgentManagementCard>

            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
              <AgentManagementCard title="Commission Structure" actionLabel="Manage Commission" onAction={() => openPlaceholder('commission')}>
                <div className="space-y-1">
                  <DetailInfoRow label="Current Structure" value={formatRoleLabel(agent.role).toLowerCase().includes('principal') ? 'Principal Commission Plan' : 'Standard Agent Plan'} />
                  <DetailInfoRow label="Effective From" value="1 Jan 2025" />
                  <DetailInfoRow label="Base Commission" value="2.5%" />
                  <DetailInfoRow label="Split" value="Principal approval required" />
                  <DetailInfoRow label="Performance Tier" value={agent.metrics.registeredDeals > 5 ? 'Growth tier' : 'Standard tier'} />
                  <DetailInfoRow label="Status" value="Active" />
                </div>
              </AgentManagementCard>

              <AgentManagementCard title="Permissions" actionLabel="Manage Permissions" onAction={() => openPlaceholder('permissions')}>
                <div className="space-y-1">
                  {permissionRows.map(([label, value]) => (
                    <div key={label} className="flex min-w-0 items-center justify-between gap-3 border-b border-[#edf2f7] py-2.5 last:border-0">
                      <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-[#20364d]">
                        <CheckCircle2 size={15} className="shrink-0 text-[#1d9a56]" />
                        <span className="truncate">{label}</span>
                      </span>
                      <span className="shrink-0 text-xs font-semibold text-[#647a92]">{value}</span>
                    </div>
                  ))}
                </div>
              </AgentManagementCard>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4 2xl:block 2xl:space-y-4">
            <AgentManagementCard title="Contact & Details" actionLabel="View Full Profile" onAction={() => openPlaceholder('profile')}>
              <DetailInfoRow label="Email" value={agent.email || 'Email pending'} />
              <DetailInfoRow label="Phone" value={agent.phone || 'Phone pending'} />
              <DetailInfoRow label="Mobile" value={agent.phone || 'Phone pending'} />
              <DetailInfoRow label="Branch / Office" value={agent.office || agent.organisationName || 'Not assigned'} />
              <DetailInfoRow label="Role" value={formatRoleLabel(agent.role)} />
              <DetailInfoRow label="Status" value={getAgentStatusMeta(agent).label} />
              <DetailInfoRow label="Joined" value={formatDate(agent.activatedAt || agent.invitedAt)} />
              <DetailInfoRow label="Last Login" value={formatDateTime(agent.lastActiveAt)} />
            </AgentManagementCard>

            <AgentManagementCard title="Team & Allocation" actionLabel="Manage Team" onAction={() => openPlaceholder('team')}>
              {teamAllocationRows.map(([label, value]) => (
                <DetailInfoRow key={label} label={label} value={value} />
              ))}
            </AgentManagementCard>

            <AgentManagementCard title="Agent Actions">
              <div className="divide-y divide-[#edf2f7]">
                {[
                  ['reset-password', 'Reset Password', KeyRound, false],
                  ['resend-invite', agent.inviteId ? 'Resend Invite' : 'Send Invite', Send, false],
                  ['login-activity', 'View Login Activity', Clock3, false],
                  ['deactivate', 'Deactivate Agent', XCircle, true],
                  ['archive', 'Archive Agent', Archive, true],
                  ['remove', 'Remove Agent', Trash2, true],
                ].map(([key, label, icon, destructive]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => destructive ? setPendingAction(key) : openPlaceholder(key)}
                    className={`flex w-full min-w-0 items-center gap-3 py-3 text-left text-sm font-semibold transition ${
                      destructive ? 'text-[#b42318] hover:text-[#8a1c14]' : 'text-[#294159] hover:text-[#0f2742]'
                    }`}
                  >
                    {createElement(icon, { size: 16, className: 'shrink-0' })}
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
            </AgentManagementCard>

            <AgentManagementCard title="Recent Activity" actionLabel="View All" onAction={() => openPlaceholder('activity')}>
              <div className="space-y-3">
                {recentActivity.length ? (
                  recentActivity.map((item) => {
                    const Icon = item.icon
                    return (
                      <div key={item.id} className="flex gap-3">
                        <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
                          <Icon size={16} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#20364d]">{item.label}</p>
                          <p className="truncate text-xs text-[#61778f]">{item.record}</p>
                          <p className="mt-0.5 text-xs text-[#8294aa]">{formatRelativeActivity(item.timestamp)}</p>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="rounded-xl bg-[#f8fbff] px-4 py-3 text-sm text-[#61778f]">No recent activity yet.</p>
                )}
              </div>
            </AgentManagementCard>
          </div>
        </section>
      ) : null}

      {effectiveActiveTab === 'listings' ? (
        <PrincipalAgentTabShell title="Listings" description="Listings assigned to this agent, with principal-level assignment context." actionLabel="Assign Listing" onAction={() => openPlaceholder('assign-listing')}>
          <div className="mb-4 grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
            <input className="h-10 min-w-0 rounded-xl border border-[#d9e3ef] bg-white px-3 text-sm outline-none focus:border-[#1f4f78] focus:ring-2 focus:ring-[#1f4f78]/10" placeholder="Search listings..." />
            <select className="h-10 min-w-0 rounded-xl border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#294159]"><option>All Statuses</option></select>
          </div>
          <div className="space-y-2">
            {allListings.length ? allListings.map((listing) => (
              <div key={listing.id} className="grid min-w-0 gap-2 rounded-xl border border-[#e4ebf5] bg-[#fbfcfe] px-4 py-3 text-sm 2xl:grid-cols-[minmax(0,1.4fr)_110px_120px_90px_90px_110px] 2xl:items-center">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[#10243a]">{listing.title}</p>
                  <p className="truncate text-xs text-[#6f839a]">{listing.developmentName || listing.suburb || 'Property pending'}</p>
                </div>
                <span className="truncate">{listing.status || 'Active'}</span>
                <span className="truncate font-semibold">{formatCurrency(listing.price)}</span>
                <span className="truncate">{listing.enquiries || 0} enquiries</span>
                <span className="truncate">{listing.viewings || 0} viewings</span>
                <span className="truncate">{formatDate(listing.listedAt)}</span>
              </div>
            )) : <p className="rounded-xl bg-[#f8fbff] px-4 py-3 text-sm text-[#61778f]">No listings assigned to this agent yet.</p>}
          </div>
        </PrincipalAgentTabShell>
      ) : null}

      {effectiveActiveTab === 'transactions' ? (
        <PrincipalAgentTabShell title="Transactions" description="Active and closed transactions assigned to this agent." actionLabel="Assign Deal" onAction={() => openPlaceholder('assign-deal')}>
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">
            {[{ title: 'Active Transactions', rows: activeDeals }, { title: 'Closed Transactions', rows: completedDeals }, { title: 'Cancelled / Lost', rows: cancelledDeals }].map((group) => (
              <article key={group.title} className="min-w-0 rounded-xl border border-[#e4ebf5] bg-[#fbfcfe] p-4">
                <h3 className="truncate text-sm font-semibold text-[#10243a]">{group.title}</h3>
                <div className="mt-3 space-y-2">
                  {group.rows.length ? group.rows.map((row) => (
                    <div key={row.transaction.id} className="min-w-0 rounded-xl border border-[#e4ebf5] bg-white px-3 py-2">
                      <p className="truncate text-sm font-semibold text-[#1f3448]">{row.buyer?.name || row.seller?.name || 'Client pending'}</p>
                      <p className="mt-1 truncate text-xs text-[#60758d]">{row.development?.name || 'Private'} • {row.unit?.unit_number || '-'} • {formatCurrency(row.transaction?.sales_price || row.transaction?.purchase_price)}</p>
                    </div>
                  )) : <p className="text-sm text-[#60758d]">No transactions in this segment.</p>}
                </div>
              </article>
            ))}
          </div>
        </PrincipalAgentTabShell>
      ) : null}

      {effectiveActiveTab === 'pipeline' ? (
        <PrincipalAgentTabShell title="Pipeline" description="Lead and prospect movement for this agent only.">
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {pipelineStageSummary.map((item) => (
              <AgentMetricCard key={item.status} label={item.status} value={item.count} helper="Pipeline leads" />
            ))}
          </div>
        </PrincipalAgentTabShell>
      ) : null}

      {effectiveActiveTab === 'performance' ? (
        <PrincipalAgentTabShell title="Performance" description="Operational performance indicators for this agent.">
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <AgentMetricCard label="Pipeline Value" value={formatCurrency(agent.metrics.pipelineValue)} helper="Open pipeline" />
            <AgentMetricCard label="Registered Value" value={formatCurrency(agent.metrics.totalSalesValue)} helper="Completed transactions" />
            <AgentMetricCard label="Conversion Rate" value={`${agent.deals.length ? Math.round((agent.metrics.registeredDeals / agent.deals.length) * 100) : 0}%`} helper="Registered / all deals" />
            <AgentMetricCard label="Average Deal Time" value={`${agent.metrics.averageDealTime || 0} days`} helper="Cycle time" />
            <AgentMetricCard label="Monthly Activity" value={recentActivity.length} helper="Recent updates" />
            <AgentMetricCard label="Listings to Deals" value={`${allListings.length}:${agent.deals.length}`} helper="Stock conversion" />
            <AgentMetricCard label="Commission Earned" value={formatCurrency(agent.metrics.commissionEarned)} helper="Estimated" />
            <AgentMetricCard label="Follow-ups Due" value={agent.metrics.followUpsDue} helper="Lead tasks" />
          </div>
        </PrincipalAgentTabShell>
      ) : null}

      {effectiveActiveTab === 'documents' ? (
        <PrincipalAgentTabShell title="Documents" description="Internal and compliance documents connected to this agent." actionLabel="Request Document" onAction={() => openPlaceholder('documents')}>
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
            {['Agent FICA', 'Employment / Contractor Agreement', 'Mandates', 'Certificates', 'Compliance Documents', 'Internal Documents'].map((name) => (
              <div key={name} className="min-w-0 rounded-xl border border-[#e4ebf5] bg-[#fbfcfe] px-4 py-3">
                <p className="truncate text-sm font-semibold text-[#20364d]">{name}</p>
                <p className="mt-1 text-xs text-[#61778f]">Ready for upload / review</p>
              </div>
            ))}
          </div>
        </PrincipalAgentTabShell>
      ) : null}

      {effectiveActiveTab === 'reviews' ? (
        <PrincipalAgentTabShell title="Reviews" description="Client and internal review notes for this agent.">
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-3">
            <article className="min-w-0 rounded-xl border border-[#e4ebf5] bg-[#fbfcfe] p-4">
              <p className="text-sm font-semibold text-[#20364d]">Client Reviews</p>
              <p className="mt-1 text-sm text-[#61778f]">Review data will appear here once client feedback is connected.</p>
            </article>
            <article className="min-w-0 rounded-xl border border-[#e4ebf5] bg-[#fbfcfe] p-4">
              <p className="text-sm font-semibold text-[#20364d]">Internal Reviews</p>
              <p className="mt-1 text-sm text-[#61778f]">Principal notes and internal quality reviews can be tracked here.</p>
            </article>
          </div>
        </PrincipalAgentTabShell>
      ) : null}

      {effectiveActiveTab === 'commission' ? (
        <PrincipalAgentTabShell title="Commission" description="Commission plan, split and transaction commission history." actionLabel="Manage Commission" onAction={() => openPlaceholder('commission')}>
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
            <AgentManagementCard title="Current Plan">
              <DetailInfoRow label="Plan" value={formatRoleLabel(agent.role).toLowerCase().includes('principal') ? 'Principal Commission Plan' : 'Standard Agent Plan'} />
              <DetailInfoRow label="Base Commission" value="2.5%" />
              <DetailInfoRow label="Split" value="Configurable" />
              <DetailInfoRow label="Effective From" value="1 Jan 2025" />
            </AgentManagementCard>
            <AgentManagementCard title="Commission Earned">
              <AgentMetricCard label="Estimated Commission" value={formatCurrency(agent.metrics.commissionEarned)} helper="Based on completed deals" />
              <p className="mt-3 text-sm text-[#61778f]">Transaction-level commission breakdowns will appear once commission rules are connected.</p>
            </AgentManagementCard>
          </div>
        </PrincipalAgentTabShell>
      ) : null}

      {effectiveActiveTab === 'permissions' ? (
        <PrincipalAgentTabShell title="Permissions" description="Role, workspace access and module permissions for this agent." actionLabel="Manage Permissions" onAction={() => openPlaceholder('permissions')}>
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3">
            {permissionRows.map(([label, value]) => (
              <div key={label} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-[#e4ebf5] bg-[#fbfcfe] px-4 py-3">
                <span className="min-w-0 truncate font-semibold text-[#20364d]">{label}</span>
                <span className="shrink-0 rounded-full border border-[#dbe6f2] bg-white px-3 py-1 text-xs font-semibold text-[#405870]">{value}</span>
              </div>
            ))}
          </div>
        </PrincipalAgentTabShell>
      ) : null}

      {effectiveActiveTab === 'settings' ? (
        <PrincipalAgentTabShell title="Settings" description="Agent account, role, status and administrative controls.">
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
            <AgentManagementCard title="Account State">
              <DetailInfoRow label="Status" value={getAgentStatusMeta(agent).label} />
              <DetailInfoRow label="Role" value={formatRoleLabel(agent.role)} />
              <DetailInfoRow label="Branch" value={agent.office || agent.organisationName || 'Not assigned'} />
              <DetailInfoRow label="Invite Sent" value={formatDateTime(agent.invitedAt)} />
              <DetailInfoRow label="Activated" value={formatDateTime(agent.activatedAt)} />
            </AgentManagementCard>
            <AgentManagementCard title="Administrative Controls">
              <div className="grid gap-2">
                <button type="button" className="truncate rounded-xl border border-[#d9e3ef] bg-white px-4 py-2 text-left text-sm font-semibold text-[#20364d]" onClick={() => openPlaceholder('profile')}>Edit profile and branch</button>
                <button type="button" className="truncate rounded-xl border border-[#d9e3ef] bg-white px-4 py-2 text-left text-sm font-semibold text-[#20364d]" onClick={() => openPlaceholder('notification-preferences')}>Notification preferences</button>
                <button type="button" className="truncate rounded-xl border border-[#f2c9c5] bg-[#fff8f7] px-4 py-2 text-left text-sm font-semibold text-[#b42318]" onClick={() => setPendingAction('deactivate')}>Deactivate agent</button>
                <button type="button" className="truncate rounded-xl border border-[#f2c9c5] bg-[#fff8f7] px-4 py-2 text-left text-sm font-semibold text-[#b42318]" onClick={() => setPendingAction('remove')}>Remove agent</button>
              </div>
            </AgentManagementCard>
          </div>
        </PrincipalAgentTabShell>
      ) : null}

      <Modal
        open={Boolean(modalMode)}
        onClose={() => setModalMode('')}
        title={
          modalMode === 'commission'
            ? 'Manage Commission'
            : modalMode === 'permissions'
              ? 'Manage Permissions'
              : modalMode === 'team'
                ? 'Manage Team'
                : modalMode === 'profile'
                  ? 'Agent Profile'
                  : 'Agent Action'
        }
        subtitle="This management surface is ready for the connected workflow."
        className="max-w-xl"
        footer={
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setModalMode('')}>Close</Button>
          </div>
        }
      >
        <div className="rounded-2xl border border-[#dfe7f1] bg-[#fbfcfe] p-4 text-sm leading-6 text-[#526981]">
          {modalMode === 'commission' ? (
            <p>Commission rules, splits, effective dates, bonus rules and transaction-level commission history will be configurable here once the commission data model is connected.</p>
          ) : modalMode === 'permissions' ? (
            <p>Role assignment, branch access, workspace access, report visibility and commission visibility will be managed here without using view-switching controls.</p>
          ) : (
            <p>This action is intentionally staged as a safe management placeholder for now. It will connect to the existing workflow once the backing service is ready.</p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction === 'remove' ? 'Remove Agent?' : pendingAction === 'archive' ? 'Archive Agent?' : 'Deactivate Agent?'}
        description={confirmDescriptions[pendingAction] || 'Confirm this agent action.'}
        confirmLabel={pendingAction === 'remove' ? 'Confirm Remove' : pendingAction === 'archive' ? 'Confirm Archive' : 'Confirm Deactivate'}
        cancelLabel="Cancel"
        variant="destructive"
        onCancel={() => setPendingAction(null)}
        onConfirm={handleConfirmedAction}
      />
    </section>
  )
}

function AgentMemberWorkspace({
  profile,
  transactionRows = [],
  agentDirectory = null,
  onOpenTransaction,
  onAllocateAgent,
  allocating = false,
  allocationError = '',
}) {
  const normalizedProfileEmail = normalizeIdentityEmail(profile?.email)
  const myAllocatedRows = useMemo(
    () => filterRowsForAgentAllocation({ rows: transactionRows, profile }),
    [profile, transactionRows],
  )
  const [allocationTarget, setAllocationTarget] = useState(null)
  const [allocationAgentEmail, setAllocationAgentEmail] = useState('')

  const organisationMemberships = useMemo(() => {
    const memberships = new Map()
    const sourceAgents = Array.isArray(agentDirectory?.agents) ? agentDirectory.agents : []
    sourceAgents.forEach((agent) => {
      const email = normalizeIdentityEmail(agent?.email)
      if (!email || email !== normalizedProfileEmail) return
      const orgId = String(agent?.agencyId || '').trim().toLowerCase()
      if (!orgId) return
      memberships.set(orgId, {
        id: orgId,
        name: String(agent?.agencyName || '').trim() || 'Bridge Organisation',
      })
    })

    if (!memberships.size && agentDirectory?.agency?.id) {
      memberships.set(String(agentDirectory.agency.id).trim().toLowerCase(), {
        id: String(agentDirectory.agency.id).trim().toLowerCase(),
        name: String(agentDirectory.agency.name || 'Bridge Organisation').trim(),
      })
    }

    return [...memberships.values()]
  }, [agentDirectory, normalizedProfileEmail])

  const organisationColleagues = useMemo(() => {
    const sourceAgents = Array.isArray(agentDirectory?.agents) ? agentDirectory.agents : []
    const allowedOrgIds = new Set(organisationMemberships.map((item) => item.id))
    const rows = sourceAgents
      .filter((agent) => {
        const orgId = String(agent?.agencyId || '').trim().toLowerCase()
        if (!orgId || !allowedOrgIds.has(orgId)) return false
        const email = normalizeIdentityEmail(agent?.email)
        if (!email || email === normalizedProfileEmail) return false
        const status = String(agent?.status || AGENT_INVITE_STATUS.ACTIVE).trim().toLowerCase()
        return status !== AGENT_INVITE_STATUS.REVOKED
      })
      .map((agent) => ({
        email: normalizeIdentityEmail(agent?.email),
        name: String(agent?.name || '').trim() || normalizeIdentityEmail(agent?.email),
        organisationId: String(agent?.agencyId || '').trim().toLowerCase(),
      }))

    return rows.filter((item, index, list) => list.findIndex((candidate) => candidate.email === item.email) === index)
  }, [agentDirectory, organisationMemberships, normalizedProfileEmail])

  return (
    <section className="space-y-5">
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <SectionHeader
          title=""
          copy="Your agent workspace shows only the transactions allocated to you."
          actions={
            <div className="inline-flex items-center gap-2 rounded-full border border-[#dbe5f0] bg-[#f8fbff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#56718d]">
              <Building2 size={12} />
              Agent View
            </div>
          }
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AgentMetricCard label="Allocated Transactions" value={myAllocatedRows.length} />
          <AgentMetricCard
            label="Active Deals"
            value={myAllocatedRows.filter((row) => normalizeDealStatus(row) === 'active').length}
          />
          <AgentMetricCard
            label="Registered Deals"
            value={myAllocatedRows.filter((row) => normalizeDealStatus(row) === 'completed').length}
          />
          <AgentMetricCard label="Organisations" value={organisationMemberships.length} />
        </div>
      </section>

      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <h2 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Your Organisations</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {organisationMemberships.length ? (
            organisationMemberships.map((organisation) => (
              <span key={organisation.id} className="inline-flex rounded-full border border-[#d7e3f0] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#2f5578]">
                {organisation.name}
              </span>
            ))
          ) : (
            <p className="text-sm text-[#60758d]">No organisation memberships detected yet.</p>
          )}
        </div>
      </section>

      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <h2 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Allocated Transactions</h2>
        <p className="mt-1.5 text-sm text-[#647a92]">Open your transaction and allocate another organisation agent when needed.</p>
        {myAllocatedRows.length ? (
          <div className="mt-4 overflow-x-auto rounded-[16px] border border-[#e2eaf3]">
            <table className="min-w-[980px] w-full text-left">
              <thead className="bg-[#f5f9fd] text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#70849d]">
                <tr>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Development</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8eef5] bg-white text-sm text-[#22384c]">
                {myAllocatedRows.map((row) => (
                  <tr key={row?.transaction?.id || row?.unit?.id}>
                    <td className="px-4 py-3 font-semibold text-[#142132]">{row?.transaction?.transaction_reference || 'Transaction'}</td>
                    <td className="px-4 py-3">{row?.buyer?.name || 'Buyer pending'}</td>
                    <td className="px-4 py-3">{row?.development?.name || 'Private transaction'}</td>
                    <td className="px-4 py-3">{row?.unit?.unit_number || '—'}</td>
                    <td className="px-4 py-3">{row?.stage || 'Pending'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Button type="button" size="sm" variant="secondary" onClick={() => onOpenTransaction(row)}>
                          Open Transaction
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setAllocationTarget(row)
                            setAllocationAgentEmail('')
                          }}
                          disabled={!row?.transaction?.unit_id || !organisationColleagues.length}
                        >
                          Allocate Agent
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 rounded-[16px] border border-[#dce5f0] bg-[#fbfcfe] px-4 py-3 text-sm text-[#647a92]">
            No transactions are currently allocated to your profile.
          </p>
        )}
      </section>

      <AllocateAgentModal
        open={Boolean(allocationTarget)}
        onClose={() => {
          if (allocating) return
          setAllocationTarget(null)
          setAllocationAgentEmail('')
        }}
        onSubmit={async () => {
          if (!allocationTarget || !allocationAgentEmail) return
          const colleague = organisationColleagues.find((item) => item.email === allocationAgentEmail)
          await onAllocateAgent({
            row: allocationTarget,
            agentEmail: allocationAgentEmail,
            agentName: colleague?.name || allocationAgentEmail,
          })
          setAllocationTarget(null)
          setAllocationAgentEmail('')
        }}
        submitting={allocating}
        error={allocationError}
        colleagues={organisationColleagues}
        value={allocationAgentEmail}
        onChange={setAllocationAgentEmail}
        transactionLabel={
          allocationTarget
            ? `${allocationTarget?.development?.name || 'Transaction'} • ${allocationTarget?.unit?.unit_number || allocationTarget?.transaction?.transaction_reference || 'No reference'}`
            : ''
        }
      />
    </section>
  )
}

export function AgentsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { role, baseRole, profile } = useWorkspace()
  const [membershipRole, setMembershipRole] = useState('viewer')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [inviteSentContext, setInviteSentContext] = useState({ email: '', link: '' })
  const [transactionRows, setTransactionRows] = useState([])
  const [branches, setBranches] = useState([])
  const [leadRows, setLeadRows] = useState([])
  const [leadActivities, setLeadActivities] = useState([])
  const [taskRows, setTaskRows] = useState([])
  const [appointmentRows, setAppointmentRows] = useState([])
  const [listingRows, setListingRows] = useState([])
  const [commissionStructures, setCommissionStructures] = useState([])
  const [branchFilter, setBranchFilter] = useState('all')
  const [dateRange, setDateRange] = useState('last_30_days')
  const [leaderboardMetric, setLeaderboardMetric] = useState('pipelineValue')
  const [officeFilter, setOfficeFilter] = useState('all')
  const [organisationFilter, setOrganisationFilter] = useState(EMPTY_ORGANISATION.id)
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('pipeline')
  const [searchTerm, setSearchTerm] = useState('')
  const [agents, setAgents] = useState([])
  const [agentDirectory, setAgentDirectory] = useState(() => readAgentDirectory())
  const [agentInvites, setAgentInvites] = useState(() => readAgentInvites())
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [inviteSubmitting, setInviteSubmitting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [roleEditOpen, setRoleEditOpen] = useState(false)
  const [roleEditSubmitting, setRoleEditSubmitting] = useState(false)
  const [roleEditTarget, setRoleEditTarget] = useState(null)
  const [roleEditValue, setRoleEditValue] = useState('agent')
  const [confirmDialog, setConfirmDialog] = useState({ open: false, type: '', agent: null })
  const [confirmingAction, setConfirmingAction] = useState(false)
  const [offboardingWizard, setOffboardingWizard] = useState({ open: false, agent: null, discovery: null })
  const [offboardingLoading, setOffboardingLoading] = useState(false)
  const [offboardingExecuting, setOffboardingExecuting] = useState(false)
  const [offboardingError, setOffboardingError] = useState('')
  const [transferWizard, setTransferWizard] = useState({ open: false, agent: null, discovery: null })
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferExecuting, setTransferExecuting] = useState(false)
  const [transferError, setTransferError] = useState('')
  const [organisationModalOpen, setOrganisationModalOpen] = useState(false)
  const [organisationName, setOrganisationName] = useState('')
  const [organisationSubmitting, setOrganisationSubmitting] = useState(false)
  const [organisationError, setOrganisationError] = useState('')
  const [allocatingAgent, setAllocatingAgent] = useState(false)
  const [allocationError, setAllocationError] = useState('')
  const [inviteForm, setInviteForm] = useState(() => buildAgentInviteForm({ profile, directory: readAgentDirectory() }))
  const consumedOpenInviteStateRef = useRef('')

  const canAccess = canAccessAgentsModule({ role, baseRole, profile, membershipRole })
  const canManageDirectory = canManageAgentOrganisations({ role, baseRole, profile, membershipRole })

  useEffect(() => {
    let active = true
    async function loadMembershipRole() {
      try {
        const context = await fetchOrganisationSettings()
        if (!active) return
        setMembershipRole(normalizeOrganisationMembershipRole(context?.membershipRole))
      } catch {
        if (!active) return
        setMembershipRole('viewer')
      }
    }
    void loadMembershipRole()
    return () => {
      active = false
    }
  }, [])

  const loadData = useCallback(async () => {
    if (!canAccess) {
      setAgents([])
      setTransactionRows([])
      setBranches([])
      setLeadRows([])
      setLeadActivities([])
      setTaskRows([])
      setAppointmentRows([])
      setListingRows([])
      setCommissionStructures([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')

      const directory = readAgentDirectory()
      const invites = readAgentInvites()
      const localPrivateListings = readLocalRows(PRIVATE_LISTINGS_STORAGE_KEY)
      const localPipelineRows = readLocalRows(PIPELINE_STORAGE_KEY)
      const [performanceSources, commissionStructureRows] = await Promise.all([
        loadAgentPerformanceSources({
          canManageDirectory,
          profile,
          role,
          directory,
          localPrivateListings,
          localPipelineRows,
        }),
        canManageDirectory ? listOrganisationCommissionStructures().catch(() => []) : Promise.resolve([]),
      ])
      const transactionRowsSource = performanceSources.transactions
      const privateListings = performanceSources.listings
      const pipelineRows = performanceSources.leads
      const mapped = computeAgentWorkspaceData({
        transactions: transactionRowsSource,
        privateListings,
        pipelineRows,
        appointments: performanceSources.appointments,
        agentDirectory: directory,
      })

      const inviteMap = new Map()
      for (const invite of invites) {
        const key = `${String(invite?.email || '').trim().toLowerCase()}::${String(invite?.organisationId || '').trim().toLowerCase()}`
        const existing = inviteMap.get(key)
        if (!existing) {
          inviteMap.set(key, invite)
          continue
        }
        const existingTime = new Date(existing?.invitedAt || 0).getTime()
        const nextTime = new Date(invite?.invitedAt || 0).getTime()
        if (nextTime >= existingTime) {
          inviteMap.set(key, invite)
        }
      }

      const mappedAgents = mapped.map((agent) => {
        const normalizedEmail = String(agent?.email || '').trim().toLowerCase()
        const directoryMatchesByEmail = directory.agents.filter((item) => String(item?.email || '').trim().toLowerCase() === normalizedEmail)
        const directoryMatch = directoryMatchesByEmail[0] || null
        const organisationId = String(directoryMatch?.agencyId || directory?.agency?.id || '').trim().toLowerCase()
        const inviteKey = `${normalizedEmail}::${organisationId}`
        const invite = inviteMap.get(inviteKey) || null
        const status = String(directoryMatch?.status || invite?.status || agent?.status || AGENT_INVITE_STATUS.ACTIVE).trim().toLowerCase()
        return {
          ...agent,
          email: directoryMatch?.email || agent?.email || '',
          phone: directoryMatch?.phone || agent?.phone || '',
          avatarUrl: getAgentAvatarUrl(directoryMatch) || getAgentAvatarUrl(invite) || getAgentAvatarUrl(agent),
          profilePhotoUrl: getAgentAvatarUrl(directoryMatch) || getAgentAvatarUrl(invite) || getAgentAvatarUrl(agent),
          office: directoryMatch?.office || agent?.office || 'Office',
          organisationId,
          organisationName: directoryMatch?.agencyName || directory?.agency?.name || 'Bridge Organisation',
          role: directoryMatch?.role || invite?.role || 'agent',
          status,
          invitedAt: directoryMatch?.invitedAt || invite?.invitedAt || null,
          activatedAt: directoryMatch?.activatedAt || invite?.activatedAt || null,
          lastActiveAt: directoryMatch?.lastActiveAt || null,
          inviteId: directoryMatch?.inviteId || invite?.id || '',
          inviteToken: invite?.token || '',
        }
      })
      const organisationAgentRows = (performanceSources.organisationUsers || [])
        .map((user) => normalizeOrganisationUserAgent(user, {
          organisationId: performanceSources.organisationSettings?.organisation?.id || directory?.agency?.id,
          organisationName: performanceSources.organisationSettings?.organisation?.name || directory?.agency?.name,
        }))
        .filter(Boolean)
      const mergedAgents = mergeAgentRows(mappedAgents, organisationAgentRows)
      const profileEmail = String(profile?.email || '').trim().toLowerCase()
      const profileId = String(profile?.id || profileEmail || '').trim().toLowerCase()
      const principalAlreadyListed = mergedAgents.some((agent) => {
        const agentEmail = String(agent?.email || '').trim().toLowerCase()
        const agentId = String(agent?.id || agent?.userId || '').trim().toLowerCase()
        return (profileEmail && agentEmail === profileEmail) || (profileId && agentId === profileId)
      })
      if (canManageDirectory && (profileEmail || profileId) && !principalAlreadyListed) {
        mergedAgents.unshift({
          id: profileId || profileEmail,
          userId: profileId || '',
          name: profile?.fullName || profile?.name || profileEmail || 'Principal',
          email: profile?.email || '',
          phone: profile?.phoneNumber || profile?.phone || '',
          avatarUrl: getAgentAvatarUrl(profile),
          profilePhotoUrl: getAgentAvatarUrl(profile),
          office: directory?.agency?.office || 'Head Office',
          organisationId: String(directory?.agency?.id || performanceSources.organisationSettings?.organisation?.id || '').trim().toLowerCase(),
          organisationName: directory?.agency?.name || profile?.companyName || 'Bridge Organisation',
          role: 'principal',
          status: AGENT_INVITE_STATUS.ACTIVE,
          invitedAt: null,
          activatedAt: null,
          lastActiveAt: null,
          inviteId: '',
          inviteToken: '',
          deals: [],
          developmentListings: [],
          privateListings: [],
          pipelineRows: [],
          appointments: [],
          metrics: buildEmptyAgentMetrics(),
          recentDeals: [],
        })
      }

      setAgents(mergedAgents)
      setTransactionRows(transactionRowsSource)
      setBranches(performanceSources.branches)
      setLeadRows(pipelineRows)
      setLeadActivities(performanceSources.leadActivities)
      setTaskRows(performanceSources.tasks)
      setAppointmentRows(performanceSources.appointments)
      setListingRows(privateListings)
      setCommissionStructures(Array.isArray(commissionStructureRows) ? commissionStructureRows : [])
      setAgentDirectory(directory)
      setAgentInvites(invites)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load agents.')
      setAgents([])
      setTransactionRows([])
      setBranches([])
      setLeadRows([])
      setLeadActivities([])
      setTaskRows([])
      setAppointmentRows([])
      setListingRows([])
      setCommissionStructures([])
    } finally {
      setLoading(false)
    }
  }, [canAccess, canManageDirectory, profile, role])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    setInviteForm((previous) => {
      if (previous.organisationName) return previous
      return buildAgentInviteForm({ profile, directory: agentDirectory })
    })
  }, [agentDirectory, profile])

  useEffect(() => {
    function handleAgentDirectoryUpdate() {
      void loadData()
    }
    window.addEventListener('itg:agent-directory-updated', handleAgentDirectoryUpdate)
    return () => window.removeEventListener('itg:agent-directory-updated', handleAgentDirectoryUpdate)
  }, [loadData])

  useEffect(() => {
    function handleOpenAddAgent() {
      setActionMessage('')
      setActionError('')
      setInviteSentContext({ email: '', link: '' })
      setInviteForm(buildAgentInviteForm({ profile, directory: readAgentDirectory() }))
      setInviteError('')
      setInviteModalOpen(true)
    }

    function handleAgentsSearch(event) {
      setSearchTerm(String(event?.detail?.value || ''))
    }

    window.addEventListener('itg:open-add-agent', handleOpenAddAgent)
    window.addEventListener('itg:agents-search', handleAgentsSearch)
    return () => {
      window.removeEventListener('itg:open-add-agent', handleOpenAddAgent)
      window.removeEventListener('itg:agents-search', handleAgentsSearch)
    }
  }, [profile])

  const organisationOptions = useMemo(
    () => resolveOrganisationOptions({ directory: agentDirectory, invites: agentInvites, profile }),
    [agentDirectory, agentInvites, profile],
  )

  const organisationFilterOptions = useMemo(() => [EMPTY_ORGANISATION, ...organisationOptions], [organisationOptions])

  const inviteBranchOptions = useMemo(
    () =>
      branches
        .filter((branch) => branch?.isActive !== false)
        .map((branch) => ({
          id: String(branch?.id || branch?.branchId || '').trim(),
          name: String(branch?.name || branch?.branchName || branch?.location || 'Untitled Branch').trim(),
        }))
        .filter((branch) => branch.id && branch.name)
        .filter((branch, index, list) => list.findIndex((item) => item.id === branch.id) === index),
    [branches],
  )

  const activeCommissionStructureOptions = useMemo(
    () =>
      commissionStructures
        .filter((structure) => structure?.isActive !== false)
        .map((structure) => ({
          id: String(structure?.id || '').trim(),
          name: String(structure?.name || 'Commission Structure').trim(),
          agentSplitPercentage: structure?.agentSplitPercentage,
          agencySplitPercentage: structure?.agencySplitPercentage,
          isDefault: Boolean(structure?.isDefault),
        }))
        .filter((structure) => structure.id && structure.name),
    [commissionStructures],
  )

  const defaultCommissionStructure = useMemo(
    () => activeCommissionStructureOptions.find((structure) => structure.isDefault) || null,
    [activeCommissionStructureOptions],
  )

  useEffect(() => {
    if (organisationFilterOptions.some((option) => option.id === organisationFilter)) {
      return
    }
    setOrganisationFilter(EMPTY_ORGANISATION.id)
  }, [organisationFilter, organisationFilterOptions])

  useEffect(() => {
    if (!organisationOptions.length) return
    setInviteForm((previous) => {
      const currentId = String(previous?.organisationId || '').trim().toLowerCase()
      const matched = organisationOptions.find((option) => option.id === currentId)
      if (matched) {
        return {
          ...previous,
          organisationName: previous.organisationName || matched.name,
        }
      }

      const fallback = organisationOptions[0]
      return {
        ...previous,
        organisationId: fallback.id,
        organisationName: fallback.name,
      }
    })
  }, [organisationOptions])

  useEffect(() => {
    if (!inviteBranchOptions.length) return
    setInviteForm((previous) => {
      const branchId = String(previous?.branchId || '').trim()
      if (!branchId || inviteBranchOptions.some((branch) => branch.id === branchId)) return previous
      return { ...previous, branchId: '', office: '' }
    })
  }, [inviteBranchOptions])

  useEffect(() => {
    const routeState = location.state && typeof location.state === 'object' ? location.state : {}
    const shouldOpenInvite = Boolean(routeState.openInvite || routeState.openAgentInvite || routeState.branchId)
    const requestedBranchId = String(routeState.branchId || '').trim()
    if (!shouldOpenInvite) return
    if (requestedBranchId && loading && !inviteBranchOptions.length) return

    const consumeKey = `${location.key || location.pathname}:${requestedBranchId || 'no-branch'}`
    if (consumedOpenInviteStateRef.current === consumeKey) return
    consumedOpenInviteStateRef.current = consumeKey

    const selectedBranch = inviteBranchOptions.find((branch) => branch.id === requestedBranchId)
    setActionMessage('')
    setActionError('')
    setInviteError('')
    setInviteSentContext({ email: '', link: '' })
    setBranchFilter(selectedBranch?.id || requestedBranchId || 'all')
    setInviteForm({
      ...buildAgentInviteForm({ profile, directory: readAgentDirectory() }),
      branchId: selectedBranch?.id || requestedBranchId,
      office: selectedBranch?.name || String(routeState.branchName || '').trim(),
    })
    setInviteModalOpen(true)
    navigate(location.pathname, { replace: true, state: null })
  }, [inviteBranchOptions, loading, location.key, location.pathname, location.state, navigate, profile])

  useEffect(() => {
    setInviteForm((previous) => {
      const structureId = String(previous?.commissionStructureId || '').trim()
      if (!structureId || activeCommissionStructureOptions.some((structure) => structure.id === structureId)) return previous
      return { ...previous, commissionStructureId: '' }
    })
  }, [activeCommissionStructureOptions])

  const officeOptions = useMemo(() => {
    const items = [...new Set(agents.map((agent) => agent.office).filter(Boolean))]
    return ['all', ...items]
  }, [agents])

  const roleOptions = useMemo(() => {
    const items = [...new Set(agents.map((agent) => String(agent.role || 'agent').trim().toLowerCase()).filter(Boolean))]
    return ['all', ...items]
  }, [agents])

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: 'All Statuses' },
      { value: 'active', label: 'Active' },
      { value: 'needs_attention', label: 'Needs Attention' },
      { value: 'inactive', label: 'Inactive' },
      { value: 'on_leave', label: 'On Leave' },
    ],
    [],
  )

  const effectiveStatusFilter = statusFilter

  const commandCentreModel = useMemo(
    () => getPrincipalAgentCommandCentre({
      principalId: profile?.id || '',
      organisationId: organisationFilter === EMPTY_ORGANISATION.id
        ? (agentDirectory?.agency?.id || '')
        : organisationFilter,
      branchId: branchFilter,
      agents,
      branches,
      leads: leadRows,
      transactions: transactionRows,
      listings: listingRows,
      appointments: appointmentRows,
      tasks: taskRows,
      activities: leadActivities,
      filters: {
        branchId: branchFilter,
        office: officeFilter,
        role: roleFilter,
        status: effectiveStatusFilter,
        search: searchTerm,
        dateRange,
        rankingMetric: leaderboardMetric,
        sortBy,
      },
    }),
    [agentDirectory?.agency?.id, agents, appointmentRows, branchFilter, branches, dateRange, effectiveStatusFilter, leadActivities, leadRows, leaderboardMetric, listingRows, officeFilter, organisationFilter, profile?.id, roleFilter, searchTerm, sortBy, taskRows, transactionRows],
  )

  const offboardingDestinationAgents = useMemo(
    () =>
      agents
        .filter((agent) => String(agent?.status || '').trim().toLowerCase() === AGENT_INVITE_STATUS.ACTIVE)
        .filter(canReceiveOperationalOwnership)
        .filter((agent) => normalizeOffboardingAgentId(agent))
        .filter((agent) => normalizeOffboardingAgentId(agent) !== normalizeOffboardingAgentId(offboardingWizard.agent || {})),
    [agents, offboardingWizard.agent],
  )

  const transferRetentionAgents = useMemo(
    () =>
      agents
        .filter((agent) => String(agent?.status || '').trim().toLowerCase() === AGENT_INVITE_STATUS.ACTIVE)
        .filter(canReceiveOperationalOwnership)
        .filter((agent) => normalizeOffboardingAgentId(agent))
        .filter((agent) => normalizeOffboardingAgentId(agent) !== normalizeOffboardingAgentId(transferWizard.agent || {})),
    [agents, transferWizard.agent],
  )

  function handleInviteFormChange(key, value) {
    setInviteForm((previous) => ({ ...previous, [key]: value }))
  }

  function resetInviteForm() {
    setInviteForm(buildAgentInviteForm({ profile, directory: readAgentDirectory() }))
    setInviteError('')
  }

  async function handleCreateOrganisation(event) {
    event.preventDefault()
    const trimmedName = String(organisationName || '').trim()
    if (!trimmedName) {
      setOrganisationError('Organisation name is required.')
      return
    }

    try {
      setOrganisationSubmitting(true)
      setOrganisationError('')
      setActionError('')
      createAgentOrganisation({
        name: trimmedName,
        createdByUserId: profile?.id || '',
        createdByEmail: profile?.email || '',
      })
      setActionMessage(`Organisation "${trimmedName}" created.`)
      setOrganisationModalOpen(false)
      setOrganisationName('')
      await loadData()
    } catch (createError) {
      setOrganisationError(createError?.message || 'Unable to create organisation.')
    } finally {
      setOrganisationSubmitting(false)
    }
  }

  function handleOpenTransaction(row) {
    const unitId = row?.unit?.id || row?.transaction?.unit_id
    if (unitId) {
      navigate(`/units/${unitId}`)
      return
    }

    navigate('/transactions')
  }

  async function handleAllocateAgentToTransaction({ row, agentEmail, agentName }) {
    const transaction = row?.transaction || null
    if (!transaction?.id) {
      setAllocationError('Transaction reference is missing.')
      return
    }
    if (!transaction?.unit_id) {
      setAllocationError('This transaction must be opened from the deal workspace for agent allocation.')
      return
    }

    try {
      setAllocatingAgent(true)
      setAllocationError('')
      setActionError('')
      await saveTransaction({
        unitId: transaction.unit_id,
        transactionId: transaction.id,
        buyerId: transaction.buyer_id || null,
        financeType: transaction.finance_type || 'cash',
        purchasePrice: transaction.sales_price || transaction.purchase_price || 0,
        purchaserType: transaction.purchaser_type || 'individual',
        financeManagedBy: transaction.finance_managed_by || 'bond_originator',
        mainStage: row?.mainStage || transaction.current_main_stage || 'SALES',
        stage: row?.stage || transaction.stage || 'Reserved',
        assignedAgent: agentName,
        assignedAgentEmail: agentEmail,
        attorney: transaction.attorney || null,
        assignedAttorneyEmail: transaction.assigned_attorney_email || null,
        bondOriginator: transaction.bond_originator || null,
        assignedBondOriginatorEmail: transaction.assigned_bond_originator_email || null,
        nextAction: transaction.next_action || null,
        actorRole: role,
      })
      setActionMessage(`Transaction allocated to ${agentName}.`)
      await loadData()
    } catch (allocationFailure) {
      setAllocationError(allocationFailure?.message || 'Unable to allocate this agent to the transaction.')
    } finally {
      setAllocatingAgent(false)
    }
  }

  async function sendInviteNotifications(invite) {
    const inviteLink = buildAgentInviteLink(invite?.token)
    const inviteMessage = buildInviteMessage({ invite, inviteLink })
    const recipientEmail = String(invite?.email || '').trim()
    const recipientPhone = formatSouthAfricanWhatsAppNumber(invite?.mobile)

    if (recipientEmail && isSupabaseConfigured) {
      try {
        const emailResult = await invokeEdgeFunction('send-email', {
          body: {
            type: invite?.branchId ? 'branch_invite' : 'workspace_invite',
            to: recipientEmail,
            inviteeName: `${invite?.firstName || ''} ${invite?.surname || ''}`.trim(),
            organisationName: invite?.organisationName || 'Bridge Organisation',
            workspaceRole: 'agent',
            inviteLink,
          },
        })
        if (emailResult?.error) {
          throw emailResult.error
        }
      } catch (sendError) {
        console.error('[Agent Invite] email send failed', sendError)
        throw new Error(sendError?.message || 'Invite was created, but the email could not be sent. Please retry sending the invite.')
      }
    }

    if (recipientPhone) {
      try {
        await sendWhatsAppNotification({
          to: recipientPhone,
          role: 'agent_invite',
          message: inviteMessage,
        })
      } catch (sendError) {
        console.error('[Agent Invite] WhatsApp send failed', sendError)
      }
    }

    return inviteLink
  }

  async function handleSubmitInvite(event) {
    event.preventDefault()
    if (!inviteForm.firstName.trim() || !inviteForm.surname.trim() || !inviteForm.email.trim() || !inviteForm.mobile.trim()) {
      setInviteError('First name, surname, email, and mobile number are required.')
      return
    }
    if (!activeCommissionStructureOptions.length) {
      setInviteError('Create a commission structure before inviting agents.')
      return
    }
    if (!inviteForm.commissionStructureId && !defaultCommissionStructure) {
      setInviteError('Select a commission structure or set an agency default before inviting this agent.')
      return
    }

    try {
      setInviteSubmitting(true)
      setInviteError('')
      setActionError('')

      const selectedOrganisation = organisationOptions.find((option) => option.id === String(inviteForm.organisationId || '').trim().toLowerCase())
      const selectedBranch = inviteBranchOptions.find((branch) => branch.id === String(inviteForm.branchId || '').trim())
      const selectedCommissionStructure = activeCommissionStructureOptions.find((structure) => structure.id === String(inviteForm.commissionStructureId || '').trim())
      const created = createAgentInvite({
        firstName: inviteForm.firstName,
        surname: inviteForm.surname,
        email: inviteForm.email,
        mobile: inviteForm.mobile,
        organisationId: selectedOrganisation?.id || inviteForm.organisationId,
        organisationName: selectedOrganisation?.name || inviteForm.organisationName,
        branchId: selectedBranch?.id || '',
        office: selectedBranch?.name || inviteForm.office,
        commissionStructureId: selectedCommissionStructure?.id || '',
        commissionStructureName: selectedCommissionStructure?.name || '',
        role: inviteForm.role,
        notes: inviteForm.notes,
        invitedByUserId: profile?.id || '',
        invitedByEmail: profile?.email || '',
        invitedByName: profile?.fullName || profile?.name || profile?.email || '',
      })

      if (selectedCommissionStructure?.id) {
        await assignOrganisationUserCommissionProfile({
          email: inviteForm.email,
          commissionStructureId: selectedCommissionStructure.id,
        })
      }

      await sendInviteNotifications(created.invite)
      markAgentInviteSent(created.invite.id)

      setActionMessage('Agent invite sent. The agent has been sent an onboarding link to verify and activate their Bridge profile.')
      setInviteSentContext({
        email: created.invite?.email || inviteForm.email.trim(),
        link: buildAgentInviteLink(created.invite?.token),
      })
      setInviteModalOpen(false)
      resetInviteForm()
      await loadData()
    } catch (submitError) {
      setInviteError(submitError?.message || 'Unable to send agent invite.')
    } finally {
      setInviteSubmitting(false)
    }
  }

  function openRoleEditor(agent) {
    setRoleEditTarget(agent)
    setRoleEditValue(String(agent?.role || 'agent').trim().toLowerCase() || 'agent')
    setRoleEditOpen(true)
  }

  async function handleSaveRole() {
    if (!roleEditTarget) return
    try {
      setRoleEditSubmitting(true)
      if (roleEditTarget.organisationUserId) {
        await updateOrganisationUserRole(roleEditTarget.organisationUserId, roleEditValue)
      } else {
        updateAgentRole({
          agentEmail: roleEditTarget.email,
          organisationId: roleEditTarget.organisationId,
          role: roleEditValue,
        })
      }
      setRoleEditOpen(false)
      setRoleEditTarget(null)
      setActionMessage('Agent role updated.')
      await loadData()
    } catch (roleError) {
      setActionError(roleError?.message || 'Unable to update role.')
    } finally {
      setRoleEditSubmitting(false)
    }
  }

  function openConfirm(type, agent) {
    if (type === 'deactivate') {
      void openOffboardingWizard(agent)
      return
    }
    setConfirmDialog({ open: true, type, agent })
  }

  async function loadOffboardingDiscovery(agent) {
    if (!agent) return null
    const organisationId = agent.organisationId || agentDirectory?.agency?.id || ''
    setOffboardingLoading(true)
    setOffboardingError('')
    try {
      const discovery = await discoverAgentOffboardingAssets({ organisationId, agent })
      setOffboardingWizard((previous) => ({ ...previous, discovery }))
      return discovery
    } catch (discoveryError) {
      const message = discoveryError?.message || 'Unable to scan this agent’s assets.'
      setOffboardingError(message)
      return null
    } finally {
      setOffboardingLoading(false)
    }
  }

  async function openOffboardingWizard(agent) {
    setActionError('')
    setActionMessage('')
    setOffboardingError('')
    setOffboardingWizard({ open: true, agent, discovery: null })
    await loadOffboardingDiscovery(agent)
  }

  function closeOffboardingWizard() {
    if (offboardingExecuting) return
    setOffboardingWizard({ open: false, agent: null, discovery: null })
    setOffboardingError('')
  }

  async function handleOffboardingSubmit({ strategy, reason, appointmentAction, assets }) {
    const agent = offboardingWizard.agent
    if (!agent) return
    try {
      setOffboardingExecuting(true)
      setOffboardingError('')
      setActionError('')

      if (offboardingWizard.discovery?.summary?.totalAssets) {
        await executeAgentAssetReassignment({
          organisationId: agent.organisationId || agentDirectory?.agency?.id || '',
          agent,
          assets,
          strategy,
          appointmentAction,
          reason,
          actor: profile,
        })
      }

      if (agent.organisationUserId) {
        await deactivateOrganisationUser(agent.organisationUserId)
      } else {
        setAgentStatus({
          agentEmail: agent.email,
          organisationId: agent.organisationId,
          status: AGENT_INVITE_STATUS.REVOKED,
        })
      }

      setActionMessage(`Agent offboarded. ${agent.name || agent.email || 'The agent'} has been deactivated after business assets were handled.`)
      setOffboardingWizard({ open: false, agent: null, discovery: null })
      await loadData()
    } catch (offboardingFailure) {
      setOffboardingError(offboardingFailure?.message || 'Unable to complete agent offboarding.')
    } finally {
      setOffboardingExecuting(false)
    }
  }

  async function loadTransferDiscovery(agent) {
    if (!agent) return null
    const organisationId = agent.organisationId || agentDirectory?.agency?.id || ''
    setTransferLoading(true)
    setTransferError('')
    try {
      const discovery = await discoverAgentOffboardingAssets({ organisationId, agent })
      setTransferWizard((previous) => ({ ...previous, discovery }))
      return discovery
    } catch (discoveryError) {
      const message = discoveryError?.message || 'Unable to scan this agent’s source-agency assets.'
      setTransferError(message)
      return null
    } finally {
      setTransferLoading(false)
    }
  }

  async function openTransferWizard(agent) {
    setActionError('')
    setActionMessage('')
    setTransferError('')
    setTransferWizard({ open: true, agent, discovery: null })
    await loadTransferDiscovery(agent)
  }

  function closeTransferWizard() {
    if (transferExecuting) return
    setTransferWizard({ open: false, agent: null, discovery: null })
    setTransferError('')
  }

  async function handleTransferSubmit({ assets, summary, retentionStrategy, destination, appointmentAction, reason }) {
    const agent = transferWizard.agent
    if (!agent) return

    try {
      setTransferExecuting(true)
      setTransferError('')
      setActionError('')

      const sourceOrganisation = {
        id: agent.organisationId || agentDirectory?.agency?.id || '',
        name: agent.organisationName || agentDirectory?.agency?.name || 'Source agency',
      }
      let destinationOrganisation = destination?.organisation || null
      if (destination?.mode === 'new') {
        destinationOrganisation = createAgentOrganisation({
          name: destination?.newOrganisationName,
          createdByUserId: profile?.id || '',
          createdByEmail: profile?.email || '',
        })
      }
      if (!destinationOrganisation?.id && !destinationOrganisation?.name) {
        throw new Error('Choose a destination agency before transferring this agent.')
      }

      const nameParts = String(agent.name || '').trim().split(/\s+/).filter(Boolean)
      const firstName = agent.firstName || nameParts[0] || String(agent.email || '').split('@')[0] || 'Agent'
      const surname = agent.surname || nameParts.slice(1).join(' ') || 'Transfer'
      const destinationInvite = createAgentInvite({
        firstName,
        surname,
        email: agent.email,
        mobile: agent.phone || agent.mobile || '',
        organisationId: destinationOrganisation.id,
        organisationName: destinationOrganisation.name,
        branchId: destination?.branch?.id || '',
        office: destination?.branch?.name || '',
        role: destination?.role || 'agent',
        notes: `Agency transfer from ${sourceOrganisation.name}. ${reason || ''}`.trim(),
        invitedByUserId: profile?.id || '',
        invitedByEmail: profile?.email || '',
        invitedByName: profile?.fullName || profile?.name || profile?.email || '',
      })

      await executeAgentTransferRetention({
        organisationId: sourceOrganisation.id,
        agent,
        assets,
        summary,
        strategy: retentionStrategy,
        appointmentAction,
        reason,
        actor: profile,
        destinationOrganisation,
        destinationInvite: destinationInvite.invite,
      })

      await sendInviteNotifications(destinationInvite.invite)
      markAgentInviteSent(destinationInvite.invite.id)

      if (agent.organisationUserId) {
        await deactivateOrganisationUser(agent.organisationUserId)
      } else {
        setAgentStatus({
          agentEmail: agent.email,
          organisationId: agent.organisationId,
          status: AGENT_INVITE_STATUS.REVOKED,
        })
      }

      await recordAgentTransferMembershipTransition({
        actor: profile,
        agent,
        sourceOrganisation,
        destinationOrganisation,
        destinationInvite: destinationInvite.invite,
        reason,
        oldMembershipDeactivated: true,
      })

      setActionMessage(`${agent.name || agent.email || 'Agent'} transferred. Source-agency assets were retained and a destination invite was sent.`)
      setInviteSentContext({
        email: destinationInvite.invite?.email || agent.email || '',
        link: buildAgentInviteLink(destinationInvite.invite?.token),
      })
      setTransferWizard({ open: false, agent: null, discovery: null })
      await loadData()
    } catch (transferFailure) {
      setTransferError(transferFailure?.message || 'Unable to complete agent transfer.')
    } finally {
      setTransferExecuting(false)
    }
  }

  async function handleConfirmAction() {
    const agent = confirmDialog.agent
    const type = confirmDialog.type
    if (!agent || !type) return

    try {
      setConfirmingAction(true)
      setActionError('')
      if (type === 'deactivate') {
        if (agent.organisationUserId) {
          await deactivateOrganisationUser(agent.organisationUserId)
        } else {
          setAgentStatus({
            agentEmail: agent.email,
            organisationId: agent.organisationId,
            status: AGENT_INVITE_STATUS.REVOKED,
          })
        }
        setActionMessage('Agent deactivated.')
      } else if (type === 'remove') {
        removeAgentFromOrganisation({
          agentEmail: agent.email,
          organisationId: agent.organisationId,
        })
        setActionMessage('Agent removed from organisation.')
      } else if (type === 'revoke') {
        revokeAgentInvite(agent.inviteId)
        setActionMessage('Invite revoked.')
      }

      setConfirmDialog({ open: false, type: '', agent: null })
      await loadData()
    } catch (confirmError) {
      setActionError(confirmError?.message || 'Unable to process action.')
    } finally {
      setConfirmingAction(false)
    }
  }

  if (!canAccess) {
    return (
      <section className="space-y-5">
        <div className="rounded-[20px] border border-[#f3d8cc] bg-[#fff6f2] px-5 py-4 text-sm text-[#9a3a13]">
          Agents workspace is available to Agent and Admin users only.
        </div>
      </section>
    )
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="space-y-5">
        <div className="rounded-[20px] border border-[#f3d8cc] bg-[#fff6f2] px-5 py-4 text-sm text-[#9a3a13]">
          Supabase is not configured for this workspace.
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      {canManageDirectory ? (
        <>
          <section className="flex flex-col gap-4 rounded-2xl border border-[#dde6f1] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)] lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#8a9bb0]">Principal Workspace</p>
              <h1 className="mt-1 text-[1.65rem] font-semibold tracking-[-0.035em] text-[#0f2237]">Agent Command Centre</h1>
              <p className="mt-1 text-sm leading-6 text-[#667a92]">Network performance, coaching signals and operational ownership across your visible agent scope.</p>
            </div>
            <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
              <DirectorySelect
                label="Date range"
                value={dateRange}
                onChange={setDateRange}
                options={AGENT_DATE_RANGE_OPTIONS.map((range) => ({ value: range.value, label: range.label }))}
              />
              {canManageDirectory ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setActionMessage('')
                    setActionError('')
                    setInviteSentContext({ email: '', link: '' })
                    resetInviteForm()
                    setInviteModalOpen(true)
                  }}
                >
                  <Plus size={15} />
                  Add Agent
                </Button>
              ) : null}
            </div>
          </section>

          <section className="sticky top-0 z-20 grid gap-2 rounded-2xl border border-[#dde6f1] bg-white/95 p-3 shadow-sm backdrop-blur md:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(142px,auto))_auto]">
            <label className="min-w-0">
              <span className="sr-only">Search agents</span>
              <input
                className="h-10 w-full rounded-xl border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] shadow-sm outline-none transition placeholder:text-[#9aaabd] focus:border-[#1f4f78] focus:ring-2 focus:ring-[#1f4f78]/10"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search agent, email, phone or branch..."
              />
            </label>
            <DirectorySelect
              label="Branch / office"
              value={branchFilter}
              onChange={setBranchFilter}
              options={commandCentreModel.filterOptions.branches.map((branch) => ({ value: branch.id, label: branch.name }))}
            />
            <DirectorySelect
              label="Office"
              value={officeFilter}
              onChange={setOfficeFilter}
              options={officeOptions.map((office) => ({ value: office, label: office === 'all' ? 'All Offices' : office }))}
            />
            <DirectorySelect
              label="Role"
              value={roleFilter}
              onChange={setRoleFilter}
              options={roleOptions.map((item) => ({ value: item, label: item === 'all' ? 'All Roles' : formatRoleLabel(item) }))}
            />
            <DirectorySelect
              label="Status"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions}
            />
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] shadow-sm transition hover:bg-[#f7fafc]"
              onClick={() => {
                setBranchFilter('all')
                setOfficeFilter('all')
                setRoleFilter('all')
                setStatusFilter('all')
                setDateRange('last_30_days')
                setLeaderboardMetric('pipelineValue')
                setSortBy('pipeline')
                setSearchTerm('')
              }}
            >
              <SlidersHorizontal size={15} />
              Reset
            </button>
          </section>

          <PerformanceKpiStrip kpis={commandCentreModel.kpis} />
          <BranchPerformanceScroller branches={commandCentreModel.branchPerformance} />
          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <TopPerformersPanel
              rows={commandCentreModel.topPerformers}
              metric={leaderboardMetric}
              metricOptions={commandCentreModel.filterOptions.leaderboardMetrics}
              onMetricChange={setLeaderboardMetric}
              onView={(agent) => navigate(`/agency/agents/${encodeURIComponent(agent.id)}`)}
            />
            <AttentionAgentsPanel
              rows={commandCentreModel.attentionAgents}
              onView={(agent) => navigate(`/agency/agents/${encodeURIComponent(agent.id)}`)}
            />
          </section>
        </>
      ) : null}

      {error ? <p className="rounded-[16px] border border-[#f2d7d7] bg-[#fff6f6] px-4 py-3 text-sm text-[#b42318]">{error}</p> : null}
      {actionError ? <p className="rounded-[16px] border border-[#f2d7d7] bg-[#fff6f6] px-4 py-3 text-sm text-[#b42318]">{actionError}</p> : null}
      {actionMessage ? <p className="rounded-[16px] border border-[#d7e8dc] bg-[#edf9f1] px-4 py-3 text-sm text-[#1f7d44]">{actionMessage}</p> : null}
      {inviteSentContext.email ? (
        <div className="rounded-[16px] border border-[#d8e6f3] bg-[#f4f9ff] px-4 py-3">
          <p className="text-sm text-[#1f4f78]">
            Invite sent to <strong>{inviteSentContext.email}</strong>.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setInviteSentContext({ email: '', link: '' })
                setActionMessage('')
                resetInviteForm()
                setInviteModalOpen(true)
              }}
            >
              Add another agent
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/agents')}>
              View agents
            </Button>
            {inviteSentContext.link ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => navigator.clipboard.writeText(inviteSentContext.link).catch(() => {})}>
                Copy invite link
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {loading ? <div className="rounded-[20px] border border-[#dde4ee] bg-white px-5 py-6 text-sm text-[#647a92]">Loading agents…</div> : null}

      {!loading && canManageDirectory ? (
        <section className="space-y-4">
          {commandCentreModel.agentsTable.length ? (
            <AgentPerformanceTable
              rows={commandCentreModel.agentsTable}
              canManage={canManageDirectory}
              sortBy={sortBy}
              onSort={setSortBy}
              onView={(agent) => navigate(`/agency/agents/${encodeURIComponent(agent.id)}`)}
              onEditRole={openRoleEditor}
              onDeactivate={(agent) => openConfirm('deactivate', agent)}
              onTransfer={(agent) => openTransferWizard(agent)}
            />
          ) : (
            <section className="rounded-2xl border border-dashed border-[#c9d8e8] bg-white px-5 py-12 text-center shadow-sm">
              <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#edf5ff] text-[#1769d1]">
                <Users size={24} />
              </span>
              <h2 className="mt-4 text-base font-semibold text-[#142132]">No agents found for this filter.</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#647a92]">
                Try broadening the filters, or invite a new agent to this organisation.
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-4"
                onClick={() => {
                  resetInviteForm()
                  setInviteModalOpen(true)
                }}
              >
                + Add Agent
              </Button>
            </section>
          )}

          <details className="group rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-[#10243a]">Analytics</span>
                <span className="mt-0.5 block truncate text-xs text-[#6d8299]">Secondary charts kept below the command centre table.</span>
              </span>
              <span className="rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#60758d] group-open:hidden">Expand</span>
              <span className="hidden rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#60758d] group-open:inline-flex">Collapse</span>
            </summary>
            <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-4">
              <ChartShell title="Pipeline Value by Agent" helper="Top active pipeline owners" empty={!commandCentreModel.analytics.pipelineByAgent.length}>
                <PipelineValueChart data={commandCentreModel.analytics.pipelineByAgent} />
              </ChartShell>
              <ChartShell title="Conversion Rate by Agent" helper="Registered opportunities over total" empty={!commandCentreModel.analytics.conversionByAgent.length}>
                <ConversionRateChart data={commandCentreModel.analytics.conversionByAgent} />
              </ChartShell>
              <ChartShell title="Listings vs Registrations" helper="Active listings compared with closed deals" empty={!commandCentreModel.analytics.listingsVsRegistrations.length}>
                <ListingsRegistrationsChart data={commandCentreModel.analytics.listingsVsRegistrations} />
              </ChartShell>
              <ChartShell title="Activity Heatmap" helper="Activity type by weekday" empty={!commandCentreModel.analytics.activityHeatmap.some((row) => row.days.some((day) => day.value))}>
                <ActivityHeatmap data={commandCentreModel.analytics.activityHeatmap} />
              </ChartShell>
            </section>
          </details>
        </section>
      ) : null}

      {!loading && !canManageDirectory ? (
        <AgentMemberWorkspace
          profile={profile}
          transactionRows={transactionRows}
          agentDirectory={agentDirectory}
          onOpenTransaction={handleOpenTransaction}
          onAllocateAgent={handleAllocateAgentToTransaction}
          allocating={allocatingAgent}
          allocationError={allocationError}
        />
      ) : null}

      {canManageDirectory ? (
        <>
          <AgentInviteModal
            open={inviteModalOpen}
            onClose={() => {
              if (inviteSubmitting) return
              setInviteModalOpen(false)
              resetInviteForm()
            }}
            onSubmit={handleSubmitInvite}
            submitting={inviteSubmitting}
            error={inviteError}
            success=""
            form={inviteForm}
            onChange={handleInviteFormChange}
            organisationOptions={organisationOptions}
            branchOptions={inviteBranchOptions}
            commissionStructureOptions={activeCommissionStructureOptions}
            defaultCommissionStructure={defaultCommissionStructure}
            showOrganisationSelect={organisationOptions.length > 1}
            onManageCommissionStructures={() => {
              setInviteModalOpen(false)
              navigate('/settings/commission-structures')
            }}
          />

          <CreateOrganisationModal
            open={organisationModalOpen}
            onClose={() => {
              if (organisationSubmitting) return
              setOrganisationModalOpen(false)
              setOrganisationError('')
              setOrganisationName('')
            }}
            onSubmit={handleCreateOrganisation}
            submitting={organisationSubmitting}
            error={organisationError}
            name={organisationName}
            onChange={setOrganisationName}
          />

          <Modal
            open={roleEditOpen}
            onClose={roleEditSubmitting ? undefined : () => setRoleEditOpen(false)}
            title="Edit Agent Role"
            subtitle={roleEditTarget ? `Update role for ${roleEditTarget.name}` : ''}
            className="max-w-[560px]"
            footer={
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button type="button" variant="secondary" onClick={() => setRoleEditOpen(false)} disabled={roleEditSubmitting}>Cancel</Button>
                <Button type="button" onClick={handleSaveRole} disabled={roleEditSubmitting}>{roleEditSubmitting ? 'Saving…' : 'Save Role'}</Button>
              </div>
            }
          >
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Role</span>
              <Field as="select" value={roleEditValue} onChange={(event) => setRoleEditValue(event.target.value)}>
                {AGENT_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
            </label>
          </Modal>

          {offboardingWizard.open ? (
            <AgentOffboardingWizard
              open={offboardingWizard.open}
              agent={offboardingWizard.agent}
              loading={offboardingLoading}
              executing={offboardingExecuting}
              error={offboardingError}
              discovery={offboardingWizard.discovery}
              candidateAgents={offboardingDestinationAgents}
              onClose={closeOffboardingWizard}
              onRefresh={() => loadOffboardingDiscovery(offboardingWizard.agent)}
              onSubmit={handleOffboardingSubmit}
            />
          ) : null}

          {transferWizard.open ? (
            <AgentTransferWizard
              open={transferWizard.open}
              agent={transferWizard.agent}
              loading={transferLoading}
              executing={transferExecuting}
              error={transferError}
              discovery={transferWizard.discovery}
              candidateAgents={transferRetentionAgents}
              destinationOrganisations={organisationOptions}
              branchOptions={inviteBranchOptions}
              sourceOrganisation={{
                id: transferWizard.agent?.organisationId || agentDirectory?.agency?.id || '',
                name: transferWizard.agent?.organisationName || agentDirectory?.agency?.name || 'Current agency',
              }}
              onClose={closeTransferWizard}
              onRefresh={() => loadTransferDiscovery(transferWizard.agent)}
              onSubmit={handleTransferSubmit}
            />
          ) : null}

          <ConfirmDialog
            open={confirmDialog.open}
            title={
              confirmDialog.type === 'remove'
                ? 'Remove agent from organisation?'
                : confirmDialog.type === 'revoke'
                  ? 'Revoke invite?'
                  : 'Deactivate agent?'
            }
            description={
              confirmDialog.type === 'remove'
                ? 'This removes the agent from the organisation and revokes pending invites.'
                : confirmDialog.type === 'revoke'
                  ? 'This invite link will no longer be usable.'
                  : 'The agent will lose active access until re-invited or re-activated.'
            }
            confirmLabel={
              confirmDialog.type === 'remove'
                ? 'Remove Agent'
                : confirmDialog.type === 'revoke'
                  ? 'Revoke Invite'
                  : 'Deactivate Agent'
            }
            variant="destructive"
            confirming={confirmingAction}
            onCancel={() => setConfirmDialog({ open: false, type: '', agent: null })}
            onConfirm={handleConfirmAction}
          />
        </>
      ) : null}
    </section>
  )
}

export function AgentWorkspacePage() {
  const navigate = useNavigate()
  const { agentId } = useParams()
  const { role, baseRole, profile } = useWorkspace()
  const [membershipRole, setMembershipRole] = useState('viewer')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [agent, setAgent] = useState(null)

  const canAccess = canAccessAgentsModule({ role, baseRole, profile, membershipRole })
  const canManageSettings = canManageAgentOrganisations({ role, baseRole, profile, membershipRole })

  useEffect(() => {
    let active = true
    async function loadMembershipRole() {
      try {
        const context = await fetchOrganisationSettings()
        if (!active) return
        setMembershipRole(normalizeOrganisationMembershipRole(context?.membershipRole))
      } catch {
        if (!active) return
        setMembershipRole('viewer')
      }
    }
    void loadMembershipRole()
    return () => {
      active = false
    }
  }, [])

  const loadWorkspace = useCallback(async () => {
    if (!canAccess) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')

      const [transactions, organisationSettings, organisationUsers] = await Promise.all([
        canManageSettings
          ? fetchTransactionsListSummary({ activeTransactionsOnly: false })
          : fetchTransactionsByParticipantSummary({ userId: profile?.id, roleType: role }),
        fetchOrganisationSettings().catch(() => null),
        canManageSettings ? listOrganisationUsers().catch(() => []) : Promise.resolve([]),
      ])

      const privateListings = readLocalRows(PRIVATE_LISTINGS_STORAGE_KEY)
      const pipelineRows = readLocalRows(PIPELINE_STORAGE_KEY)
      const agentDirectory = readAgentDirectory()
      let appointments = []
      try {
        const context = await fetchOrganisationSettings()
        const organisationId = String(context?.organisation?.id || '').trim()
        if (organisationId) {
          appointments = await listAppointmentsAsync(organisationId, {
            includeAll: canManageSettings,
            agentId: canManageSettings ? '' : String(profile?.id || profile?.email || '').trim(),
            agentEmail: canManageSettings ? '' : String(profile?.email || '').trim(),
          })
        }
      } catch {
        appointments = []
      }
      const mappedAgents = computeAgentWorkspaceData({
        transactions: Array.isArray(transactions) ? transactions : [],
        privateListings,
        pipelineRows,
        appointments,
        agentDirectory,
      })
      const organisationAgentRows = (organisationUsers || [])
        .map((user) => normalizeOrganisationUserAgent(user, {
          organisationId: organisationSettings?.organisation?.id || agentDirectory?.agency?.id,
          organisationName: organisationSettings?.organisation?.name || agentDirectory?.agency?.name,
        }))
        .filter(Boolean)
      const mergedAgents = mergeAgentRows(mappedAgents, organisationAgentRows)

      const target = findAgentByRouteId(mergedAgents, agentId)
      if (!target) {
        setError('Agent not found in your current workspace scope.')
        setAgent(null)
      } else {
        setAgent(target)
      }
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load agent workspace.')
      setAgent(null)
    } finally {
      setLoading(false)
    }
  }, [agentId, canAccess, canManageSettings, profile?.email, profile?.id, role])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  if (!canAccess) {
    return (
      <section className="space-y-5">
        <div className="rounded-[20px] border border-[#f3d8cc] bg-[#fff6f2] px-5 py-4 text-sm text-[#9a3a13]">
          Agents workspace is available to Agent and Admin users only.
        </div>
      </section>
    )
  }

  if (loading) {
    return <div className="rounded-[20px] border border-[#dde4ee] bg-white px-5 py-6 text-sm text-[#647a92]">Loading agent workspace…</div>
  }

  if (error || !agent) {
    return (
      <section className="space-y-4">
        <p className="rounded-[16px] border border-[#f2d7d7] bg-[#fff6f6] px-4 py-3 text-sm text-[#b42318]">{error || 'Agent not found.'}</p>
        <Button type="button" variant="secondary" onClick={() => navigate('/agents')}>
          Back to Agents
        </Button>
      </section>
    )
  }

  return (
    <section className="min-w-0 space-y-4 overflow-hidden">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/agents')}>
          Back to Agents
        </Button>
        <div className="inline-flex min-w-0 items-center gap-2 truncate text-xs text-[#647a92]">
          <ShieldCheck size={13} />
          {canManageSettings ? 'Principal Workspace' : 'Agent Workspace'}
        </div>
      </div>
      <AgentWorkspace agent={agent} canManageSettings={canManageSettings} />
    </section>
  )
}

export default AgentsPage
