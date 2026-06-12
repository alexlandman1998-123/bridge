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
  Copy,
  Download,
  DollarSign,
  Edit3,
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
  Trash2,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import AppointmentDashboardSection from '../components/appointments/dashboard/AppointmentDashboardSection'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import SectionHeader from '../components/ui/SectionHeader'
import { useWorkspace } from '../context/WorkspaceContext'
import { canAccessAgentsModule, canManageAgentOrganisations } from '../lib/roles'
import { saveTransaction } from '../lib/api'
import { invokeEdgeFunction, isSupabaseConfigured } from '../lib/supabaseClient'
import { isUnsafeFallbackAllowed } from '../lib/envValidation'
import {
  deactivateOrganisationUser,
  fetchOrganisationSettings,
  assignOrganisationUserCommissionProfile,
  listOrganisationCommissionStructures,
  listOrganisationUserCommissionProfiles,
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
import { LEADERBOARD_METRICS } from '../modules/agency/agents/agentPerformanceUtils'
import { loadAgentPerformanceSources } from '../modules/agency/agents/agentPerformanceDataService'
import { getPrincipalAgentCommandCentre, getPrincipalAgentDetailCommandCentre } from '../modules/agency/agents/principalAgentCommandCentreService'
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
import {
  createWorkspaceUserInvite,
  listWorkspaceUserInvites,
  resendWorkspaceUserInvite,
  revokeWorkspaceUserInvite,
} from '../services/workspaceUserInviteService'

const PRIVATE_LISTINGS_STORAGE_KEY = 'itg:agent-private-listings:v1'
const PIPELINE_STORAGE_KEY = 'itg:pipeline-leads:v1'

const AGENT_WORKSPACE_TABS = [
  { key: 'overview', label: 'Overview', icon: Grid2X2 },
  { key: 'deals', label: 'Deals', icon: BriefcaseBusiness },
  { key: 'listings', label: 'Listings', icon: Building2 },
  { key: 'clients', label: 'Clients', icon: Users },
  { key: 'performance', label: 'Performance', icon: Trophy },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays },
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

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getEmailPrefix(value) {
  const email = String(value || '').trim()
  if (!email.includes('@')) return email || 'Agent'
  return email.split('@')[0]
}

function getAgentPrimaryName(agent = {}) {
  const profileFullName = String(agent?.profile?.full_name || agent?.profile?.fullName || '').trim()
  if (profileFullName) return profileFullName
  const directFullName = String(agent?.fullName || agent?.full_name || '').trim()
  if (directFullName) return directFullName
  const firstLastName = [agent?.firstName || agent?.first_name, agent?.lastName || agent?.last_name].filter(Boolean).join(' ').trim()
  if (firstLastName) return firstLastName
  const userMetadataFullName = String(agent?.userMetadata?.full_name || agent?.user_metadata?.full_name || '').trim()
  if (userMetadataFullName) return userMetadataFullName
  return String(agent?.name || '').trim() || getEmailPrefix(agent?.email)
}

function getAgentRoleTitle(agent = {}) {
  const explicitTitle = String(agent?.title || agent?.jobTitle || agent?.position || '').trim()
  if (explicitTitle) return explicitTitle
  return formatRoleLabel(agent?.role)
}

function formatSummaryMetricValue(metric = {}) {
  if (metric.format === 'currency') return formatCurrency(metric.value)
  if (metric.format === 'percent') return `${Math.round(Number(metric.value || 0))}%`
  return metric.value ?? '—'
}

function getAppointmentStatusClass(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized.includes('completed')) return 'border-[#d7e7dd] bg-[#edf9f1] text-[#1d7d45]'
  if (normalized.includes('confirmed') || normalized.includes('accepted')) return 'border-[#dbe6f4] bg-[#f1f7ff] text-[#1f4f78]'
  if (normalized.includes('cancel') || normalized.includes('declin') || normalized.includes('no_show')) return 'border-[#f3d8d8] bg-[#fff4f4] text-[#a03c3c]'
  return 'border-[#ece4c7] bg-[#fff8eb] text-[#8a641d]'
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
    agent?.avatarUrl ||
      agent?.avatar_url ||
      agent?.profilePhotoUrl ||
      agent?.profile_photo_url ||
      agent?.photoUrl ||
      agent?.photo_url ||
      agent?.picture ||
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
  const firstName = String(user.firstName || user.first_name || '').trim()
  const lastName = String(user.lastName || user.last_name || '').trim()
  const userMetadata = user.userMetadata || user.user_metadata || {}
  const fullName = String(user.fullName || user.full_name || user.profile?.full_name || [firstName, lastName].filter(Boolean).join(' ') || userMetadata.full_name || email || 'Agent').trim()
  const overrideSplit = Number(user.overrideAgentSplitPercentage)
  return {
    id: id || email,
    organisationUserId: normalizeAgentRecordId(user.id),
    userId: normalizeAgentRecordId(user.userId),
    name: fullName,
    fullName,
    firstName,
    lastName,
    title: String(user.title || user.jobTitle || user.position || '').trim(),
    profile: user.profile || null,
    userMetadata,
    createdAt: user.createdAt || user.created_at || null,
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
    commissionStructureId: normalizeAgentRecordId(user.commissionStructureId),
    appliedCommissionStructureId: normalizeAgentRecordId(user.commissionStructureId),
    commissionStructureName: user.commissionStructureName || '',
    commissionEffectiveFrom: user.commissionEffectiveFrom || user.effectiveFrom || null,
    overrideAgentSplitPercentage: Number.isFinite(overrideSplit) ? overrideSplit : null,
    baseCommissionRate: user.baseCommissionRate || '',
    commissionSplit: user.commissionSplit || '',
    performanceTier: user.performanceTier || '',
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

function createCommissionProfileMap(profiles = []) {
  const map = new Map()
  for (const profile of profiles) {
    const organisationUserId = normalizeAgentRecordId(profile?.organisationUserId)
    const userId = normalizeAgentRecordId(profile?.userId)
    const email = normalizeIdentityEmail(profile?.email)
    if (organisationUserId) map.set(`org-user:${organisationUserId}`, profile)
    if (userId) map.set(`user:${userId}`, profile)
    if (email) map.set(`email:${email}`, profile)
  }
  return map
}

function findCommissionProfileForAgent(agent = {}, profileMap = new Map()) {
  const organisationUserId = normalizeAgentRecordId(agent.organisationUserId)
  const userId = normalizeAgentRecordId(agent.userId)
  const email = normalizeIdentityEmail(agent.email)
  return (
    (organisationUserId && profileMap.get(`org-user:${organisationUserId}`)) ||
    (userId && profileMap.get(`user:${userId}`)) ||
    (email && profileMap.get(`email:${email}`)) ||
    null
  )
}

function formatCommissionSplitLabel(agentSplit, overrideApplied = false) {
  const numeric = Number(agentSplit)
  if (!Number.isFinite(numeric)) return ''
  return `Agent ${formatPercent(numeric)} / Agency ${formatPercent(100 - numeric)}${overrideApplied ? ' override' : ''}`
}

function getAgentRoleAccessSummary(role = '') {
  const normalized = String(role || '').trim().toLowerCase()
  if (['owner', 'super_admin', 'principal'].includes(normalized)) {
    return {
      workspaceAccess: 'All workspace',
      branchAccess: 'All branches',
      listings: 'All listings',
      deals: 'All deals',
      clients: 'All clients',
      reports: 'Full reporting',
      agencySettings: 'Manage',
      commissionVisibility: 'Visible',
    }
  }
  if (['admin', 'branch_admin', 'branch_manager', 'transaction_coordinator', 'listing_coordinator', 'admin_coordinator'].includes(normalized)) {
    return {
      workspaceAccess: 'Branch workspace',
      branchAccess: 'Assigned branch',
      listings: 'Branch listings',
      deals: 'Branch deals',
      clients: 'Branch clients',
      reports: 'Branch reporting',
      agencySettings: ['admin', 'branch_admin', 'branch_manager'].includes(normalized) ? 'Limited manage' : 'No access',
      commissionVisibility: 'Restricted',
    }
  }
  if (['team_lead', 'senior_agent'].includes(normalized)) {
    return {
      workspaceAccess: 'Team / assigned',
      branchAccess: 'Assigned branch',
      listings: 'Team and assigned',
      deals: 'Team and assigned',
      clients: 'Team and assigned',
      reports: 'Team reporting',
      agencySettings: 'No access',
      commissionVisibility: 'Own only',
    }
  }
  if (['assistant'].includes(normalized)) {
    return {
      workspaceAccess: 'Assigned support',
      branchAccess: 'Assigned branch',
      listings: 'Assigned support',
      deals: 'Assigned support',
      clients: 'Assigned support',
      reports: 'No access',
      agencySettings: 'No access',
      commissionVisibility: 'No access',
    }
  }
  if (normalized === 'viewer') {
    return {
      workspaceAccess: 'Read-only',
      branchAccess: 'Assigned only',
      listings: 'View only',
      deals: 'View only',
      clients: 'View only',
      reports: 'View only',
      agencySettings: 'No access',
      commissionVisibility: 'No access',
    }
  }
  return {
    workspaceAccess: 'Assigned workspace',
    branchAccess: 'Assigned branch',
    listings: 'Assigned listings',
    deals: 'Assigned deals',
    clients: 'Assigned clients',
    reports: 'Own reporting',
    agencySettings: 'No access',
    commissionVisibility: 'Own only',
  }
}

function enrichAgentWithCommissionProfile(agent = {}, profileMap = new Map(), structures = []) {
  const profile = findCommissionProfileForAgent(agent, profileMap)
  const structureMap = new Map(structures.map((structure) => [normalizeAgentRecordId(structure?.id), structure]))
  const explicitStructureId = normalizeAgentRecordId(profile?.commissionStructureId || agent.commissionStructureId)
  const defaultStructure = structures.find((structure) => structure?.isDefault && structure?.isActive) || null
  const appliedStructure = explicitStructureId
    ? structureMap.get(explicitStructureId) || null
    : defaultStructure
  const overrideSplit = profile?.overrideAgentSplitPercentage ?? agent.overrideAgentSplitPercentage ?? null
  const effectiveAgentSplit = Number.isFinite(Number(overrideSplit))
    ? Number(overrideSplit)
    : appliedStructure
      ? Number(appliedStructure.agentSplitPercentage)
      : NaN
  const usesDefaultStructure = !explicitStructureId && Boolean(appliedStructure)

  return {
    ...agent,
    commissionProfileId: profile?.id || agent.commissionProfileId || '',
    commissionStructureId: explicitStructureId,
    appliedCommissionStructureId: normalizeAgentRecordId(appliedStructure?.id || explicitStructureId),
    commissionStructureName: appliedStructure?.name
      ? `${appliedStructure.name}${usesDefaultStructure ? ' (Default)' : ''}`
      : profile?.commissionStructureName || agent.commissionStructureName || '',
    commissionEffectiveFrom: profile?.effectiveFrom || agent.commissionEffectiveFrom || null,
    overrideAgentSplitPercentage: Number.isFinite(Number(overrideSplit)) ? Number(overrideSplit) : null,
    baseCommissionRate: appliedStructure ? `Agency ${formatPercent(appliedStructure.agencySplitPercentage)}` : agent.baseCommissionRate || '',
    commissionSplit: formatCommissionSplitLabel(effectiveAgentSplit, Number.isFinite(Number(overrideSplit))) || agent.commissionSplit || '',
    performanceTier: appliedStructure
      ? appliedStructure.isActive
        ? appliedStructure.isDefault
          ? 'Default active structure'
          : 'Active structure'
        : 'Inactive structure'
      : agent.performanceTier || '',
  }
}

function normalizeInviteAgentRow(invite = {}, context = {}) {
  const email = normalizeIdentityEmail(invite.email)
  const id = normalizeAgentRecordId(invite.id || invite.inviteId || email)
  if (!id && !email) return null
  const firstName = String(invite.firstName || invite.first_name || '').trim()
  const lastName = String(invite.lastName || invite.surname || invite.last_name || '').trim()
  const name = String(invite.name || [firstName, lastName].filter(Boolean).join(' ') || email || 'Invited agent').trim()
  const status = normalizeAgentDirectoryStatus(invite.status || AGENT_INVITE_STATUS.PENDING_INVITE)
  const organisationId = normalizeAgentRecordId(invite.organisationId || invite.targetWorkspaceId || context.organisationId || '')
  const organisationName = String(invite.organisationName || context.organisationName || 'Bridge Organisation').trim()
  const branchName = String(invite.branchName || invite.office || '').trim()
  return {
    id: id || email,
    organisationUserId: '',
    userId: '',
    name,
    email,
    phone: invite.phone || invite.mobile || '',
    avatarUrl: getAgentAvatarUrl(invite),
    profilePhotoUrl: getAgentAvatarUrl(invite),
    office: branchName || organisationName,
    branchId: invite.branchId || null,
    branchName,
    organisationId,
    organisationName,
    role: String(invite.role || 'agent').trim().toLowerCase() || 'agent',
    status,
    invitedAt: invite.invitedAt || invite.createdAt || null,
    activatedAt: invite.activatedAt || null,
    lastActiveAt: null,
    inviteId: invite.inviteId || invite.id || '',
    inviteToken: invite.inviteToken || invite.token || '',
    inviteLink: invite.inviteLink || buildAgentInviteLink(invite.inviteToken || invite.token),
    isPendingInvite: status === AGENT_INVITE_STATUS.PENDING_INVITE,
    isCanonicalInvite: Boolean(invite.isCanonicalInvite),
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
      fullName: overlay.fullName || existing.fullName,
      firstName: overlay.firstName || existing.firstName,
      lastName: overlay.lastName || existing.lastName,
      title: overlay.title || existing.title,
      profile: overlay.profile || existing.profile,
      userMetadata: overlay.userMetadata || existing.userMetadata,
      createdAt: overlay.createdAt || existing.createdAt,
      email: overlay.email || existing.email,
      phone: overlay.phone || existing.phone,
      avatarUrl: getAgentAvatarUrl(overlay) || getAgentAvatarUrl(existing),
      profilePhotoUrl: getAgentAvatarUrl(overlay) || getAgentAvatarUrl(existing),
      office: overlay.office || existing.office,
      branchId: overlay.branchId || existing.branchId,
      organisationId: overlay.organisationId || existing.organisationId,
      organisationName: overlay.organisationName || existing.organisationName,
      role: overlay.role || existing.role,
      status: overlay.status || existing.status,
      invitedAt: overlay.invitedAt || existing.invitedAt,
      activatedAt: overlay.activatedAt || existing.activatedAt,
      lastActiveAt: overlay.lastActiveAt || existing.lastActiveAt,
      commissionProfileId: overlay.commissionProfileId || existing.commissionProfileId,
      commissionStructureId: overlay.commissionStructureId || existing.commissionStructureId,
      appliedCommissionStructureId: overlay.appliedCommissionStructureId || existing.appliedCommissionStructureId,
      commissionStructureName: overlay.commissionStructureName || existing.commissionStructureName,
      commissionEffectiveFrom: overlay.commissionEffectiveFrom || existing.commissionEffectiveFrom,
      overrideAgentSplitPercentage: overlay.overrideAgentSplitPercentage ?? existing.overrideAgentSplitPercentage ?? null,
      baseCommissionRate: overlay.baseCommissionRate || existing.baseCommissionRate,
      commissionSplit: overlay.commissionSplit || existing.commissionSplit,
      performanceTier: overlay.performanceTier || existing.performanceTier,
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

function formatCompactActivity(value) {
  if (!value) return { label: 'No activity', tone: 'danger' }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return { label: 'No activity', tone: 'danger' }
  const diffDays = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
  if (diffDays <= 0) return { label: 'Today', tone: 'active' }
  if (diffDays === 1) return { label: 'Yesterday', tone: 'active' }
  if (diffDays <= 7) return { label: `${diffDays} days ago`, tone: 'warning' }
  return { label: `${diffDays} days ago`, tone: 'danger' }
}

function formatConversionRate(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—'
  return `${Math.round(Number(value))}%`
}

function MiniTrendLine({ values = [] }) {
  const points = Array.isArray(values) ? values.map(Number).filter((value) => Number.isFinite(value)) : []
  if (points.length < 2 || points.every((value) => value === points[0])) return null
  const width = 88
  const height = 24
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = Math.max(1, max - min)
  const step = width / Math.max(1, points.length - 1)
  const path = points
    .map((value, index) => {
      const x = index * step
      const y = height - ((value - min) / range) * (height - 4) - 2
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg className="mt-2 h-6 w-[88px] text-success" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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

function PerformanceKpiStrip({ kpis, onAttentionClick }) {
  const cards = [
    { label: 'Total Pipeline Value', value: formatCompactCurrency(kpis.pipelineValue ?? kpis.totalPipelineValue), helper: 'Across visible agents', icon: ArrowRight, tone: 'bg-infoSoft text-info' },
    { label: 'Active Transactions', value: kpis.transactions ?? kpis.activeTransactions ?? 0, helper: 'In-flight deals', icon: BriefcaseBusiness, tone: 'bg-successSoft text-success' },
    { label: 'Avg. Conversion Rate', value: formatConversionRate(kpis.conversionRate ?? kpis.averageConversionRate), helper: 'Leads → OTP', icon: Trophy, tone: 'bg-primarySoft text-primary' },
    { label: 'Avg. Days to Registration', value: kpis.avgDaysToRegistration ?? '—', helper: 'Avg. days', icon: Clock3, tone: 'bg-warningSoft text-warning' },
    { label: 'Agents Needing Attention', value: kpis.agentsNeedingAttention ?? 0, helper: 'No activity > 7 days', icon: AlertTriangle, tone: 'bg-dangerSoft text-danger', onClick: onAttentionClick },
  ]

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon
        const Tag = card.onClick ? 'button' : 'article'
        return (
          <Tag key={card.label} type={card.onClick ? 'button' : undefined} onClick={card.onClick} className="min-h-[122px] min-w-0 rounded-2xl border border-borderDefault bg-surface px-4 py-4 text-left shadow-surface transition hover:border-borderStrong hover:bg-mutedBg/40">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${card.tone}`}>
                <Icon size={15} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{card.label}</p>
                <p className="mt-2 truncate text-[1.45rem] font-semibold leading-none tracking-[-0.035em] text-textStrong">{card.value}</p>
                <p className="mt-2 truncate text-xs text-textMuted">{card.helper}</p>
                {card.onClick ? <p className="mt-2 text-xs font-semibold text-primary">View agents</p> : null}
              </div>
            </div>
          </Tag>
        )
      })}
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

  const podiumRows = [rows[1], rows[0], rows[2]].filter(Boolean)

  return (
    <article className="h-full min-w-0 rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[#10243a]">Top Performers This Month</h2>
          <p className="mt-0.5 text-xs text-[#6d8299]">Ranked by the selected performance metric.</p>
        </div>
        <DirectorySelect
          label="Leaderboard metric"
          value={metric}
          onChange={onMetricChange}
          options={metricOptions.map((item) => ({ value: item.value, label: item.label }))}
        />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3 md:items-end">
        {podiumRows.length ? podiumRows.map((row) => (
          <button
            key={row.id}
            type="button"
            className={`relative min-h-[178px] rounded-2xl border bg-[linear-gradient(180deg,#ffffff,#fbfdff)] p-4 text-center transition hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(15,23,42,0.08)] ${row.rank === 1 ? 'border-[#f3c665] md:min-h-[208px] md:pb-6' : 'border-[#dfe8f2]'}`}
            onClick={() => onView(row.agent)}
          >
            <span className={`absolute left-1/2 top-0 inline-flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-sm font-semibold shadow-sm ${row.rank === 1 ? 'border-[#f3c665] bg-[#ffc247] text-white' : row.rank === 2 ? 'border-[#cbd6e4] bg-[#8ca0b5] text-white' : 'border-[#d8b28b] bg-[#c98342] text-white'}`}>
              {row.rank}
            </span>
            <AgentAvatar agent={row} className={`mx-auto mt-4 border border-[#d7e2ef] bg-white font-semibold text-[#245076] ${row.rank === 1 ? 'h-16 w-16 text-base' : 'h-14 w-14 text-sm'}`} />
            <h3 className="mt-3 truncate text-sm font-semibold text-[#10243a]">{row.name}</h3>
            <p className="mt-1 truncate text-xs text-[#6d8299]">{row.branchName || 'Current Office'}</p>
            <p className={`mt-3 font-semibold tracking-[-0.03em] text-[#10243a] ${row.rank === 1 ? 'text-[1.45rem]' : 'text-[1.2rem]'}`}>{renderMetric(row)}</p>
            <div className="mt-3 flex items-center justify-center gap-1 text-xs font-semibold text-[#16894f]">
              <ArrowRight size={13} className="-rotate-45" />
              <span>{Math.max(0, row.progress || 0)}%</span>
              <span className="font-medium text-[#71859c]">of leader</span>
            </div>
          </button>
        )) : (
          <p className="rounded-xl bg-[#f8fbff] px-3 py-6 text-center text-sm text-[#6b7f97] md:col-span-3">No ranked performance data yet.</p>
        )}
      </div>
    </article>
  )
}

function AttentionAgentsPanel({ rows = [], onView }) {
  const statusClass = {
    High: 'bg-[#fff4f4] text-[#b42318]',
    Medium: 'bg-[#fff8eb] text-[#946215]',
    Low: 'bg-[#f8fbff] text-[#60758d]',
  }

  return (
    <article className="flex h-full max-h-[368px] min-w-0 flex-col rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[#10243a]">Agents Requiring Attention</h2>
          <p className="mt-0.5 truncate text-xs text-[#6d8299]">Operational watchlist across your visible branches.</p>
        </div>
        <button type="button" className="shrink-0 text-xs font-semibold text-[#1769d1]">View watchlist</button>
      </div>
      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {rows.length ? (
          <table className="w-full table-fixed text-left">
            <thead className="text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#71859c]">
              <tr className="border-b border-[#edf2f7]">
                <th className="w-[42%] px-2 py-2">Agent</th>
                <th className="w-[18%] px-2 py-2">Pipeline</th>
                <th className="w-[22%] px-2 py-2">Last Active</th>
                <th className="w-[18%] px-2 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f7] text-sm">
              {rows.map((row) => {
                const performance = row.agent?.performance || {}
                return (
                  <tr key={row.id} className="cursor-pointer hover:bg-[#f8fbff]" onClick={() => onView(row.agent)}>
                    <td className="px-2 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <AgentAvatar agent={row} className="h-8 w-8 bg-[#eef5ff] text-xs font-semibold text-[#1769d1]" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#10243a]">{row.name}</p>
                          <p className="truncate text-xs text-[#6d8299]">{row.primaryReason}</p>
                        </div>
                      </div>
                    </td>
                    <td className="truncate px-2 py-3 font-semibold text-[#10243a]">{formatCompactCurrency(performance.pipelineValue)}</td>
                    <td className="px-2 py-3 text-[#60758d]">{formatRelativeActivity(performance.lastActivityAt)}</td>
                    <td className="px-2 py-3 text-right">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[0.66rem] font-semibold ${statusClass[row.severity] || statusClass.Low}`}>Needs attention</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <p className="rounded-xl bg-[#f8fbff] px-3 py-6 text-center text-sm text-[#6b7f97]">No intervention items right now.</p>
        )}
      </div>
    </article>
  )
}

function InvitedAgentsPanel({ rows = [], actionSlot = null, onShowPending, onResendInvite, onCopyInviteLink, onRevokeInvite }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[#dde6f1] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-[#edf2f7] px-4 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[#10243a]">Invited Agents</h2>
          <p className="mt-0.5 truncate text-xs text-[#6d8299]">Pending invitations that have not been accepted yet.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-[#e7ddf7] bg-[#f7f1ff] px-3 py-1 text-xs font-semibold text-[#5c3a9d]">{rows.length} pending</span>
          {actionSlot}
          <Button type="button" size="sm" variant="secondary" onClick={onShowPending}>Show pending</Button>
        </div>
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="bg-[#f8fbff] text-[0.66rem] font-semibold uppercase tracking-[0.1em] text-[#71859c]">
              <tr>
                <th className="px-4 py-3">Invitee</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Invited</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f7] text-sm text-[#22384c]">
              {rows.map((agent) => {
                const statusMeta = getAgentStatusMeta(agent)
                return (
                  <tr key={`${agent.id || agent.email}-pending-invite`}>
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <AgentAvatar agent={agent} className="h-9 w-9 border border-[#d7e2ef] bg-white text-xs font-semibold text-[#245076]" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#10243a]">{agent.name || 'Invited agent'}</p>
                          <p className="truncate text-xs text-[#60758d]">{agent.email || 'No email added'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">{agent.office || agent.branchName || 'Current Office'}</td>
                    <td className="px-4 py-3">{formatRoleLabel(agent.role)}</td>
                    <td className="px-4 py-3">{formatDate(agent.invitedAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold ${statusMeta.className}`}>{statusMeta.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button type="button" size="sm" variant="secondary" onClick={() => onResendInvite?.(agent)}><Send size={14} />Resend</Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => onCopyInviteLink?.(agent)}><Copy size={14} />Copy</Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => onRevokeInvite?.(agent)}><XCircle size={14} />Revoke</Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 py-8 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f7f1ff] text-[#5c3a9d]">
            <Send size={20} />
          </span>
          <h3 className="mt-3 text-sm font-semibold text-[#10243a]">No pending agent invites</h3>
          <p className="mt-1 text-sm text-[#6d8299]">Invited agents will appear here until they accept their invitation.</p>
        </div>
      )}
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

function AgentPerformanceTable({
  rows = [],
  canManage = false,
  sortBy = 'pipeline',
  onSort,
  title = 'All Agents',
  helper = 'Manage agents across every branch in your visible scope.',
  actionSlot = null,
  onView,
  onDeactivate,
  onViewTransactions,
  onAssignLead,
  onSendMessage,
  onResendInvite,
  onCopyInviteLink,
  onRevokeInvite,
}) {
  const headers = [
    { key: 'name', label: 'Agent' },
    { key: 'pipeline', label: 'Pipeline Value' },
    { key: 'deals', label: 'Active Transactions' },
    { key: 'listings', label: 'Listings' },
    { key: 'conversion', label: 'Conversion' },
    { key: 'stageMix', label: 'Stage Mix' },
    { key: 'lastActivity', label: 'Last Activity' },
  ]

  return (
    <div className="overflow-hidden rounded-2xl border border-[#dde6f1] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-[#edf2f7] px-4 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[#10243a]">{title}</h2>
          <p className="mt-0.5 truncate text-xs text-[#6d8299]">{helper}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#60758d]">{rows.length} agents</span>
          {actionSlot}
        </div>
      </div>
      <div className="hidden lg:block">
        <table className="w-full table-fixed text-left">
          <colgroup>
            <col className="w-[23%]" />
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[11%]" />
            <col className="w-[17%]" />
            <col className="w-[11%]" />
            <col className="w-[6%]" />
          </colgroup>
          <thead className="bg-[#f6f9fc] text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#70849d]">
            <tr>
              {headers.map((header) => (
                <th key={header.key} className={`px-3 py-3 ${header.key === 'stageMix' ? 'hidden xl:table-cell' : ''}`}>
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
              const pendingInvite = row.statusKey === AGENT_INVITE_STATUS.PENDING_INVITE || row.agent?.isPendingInvite
              const activity = formatCompactActivity(performance.lastActivityAt)
              return (
                <tr key={`${row.id}-${row.branchId || 'branch'}-performance-row`} className="cursor-pointer hover:bg-[#f8fbff]" onClick={() => onView(row.agent)}>
                  <td className="px-4 py-4">
                    <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={(event) => { event.stopPropagation(); onView(row.agent) }}>
                      <AgentAvatar agent={row} className="h-9 w-9 border border-[#d7e2ef] bg-[#f8fbff] text-xs font-semibold text-[#245076]" />
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate font-semibold text-[#142132]">{row.name || 'Agent'}</span>
                          {row.needsAttention ? <AlertTriangle size={13} className="shrink-0 text-warning" aria-label="Needs attention" /> : null}
                        </span>
                        <span className="block truncate text-xs text-[#60758d]">{formatRoleLabel(row.role)}</span>
                        <span className="block truncate text-xs text-[#60758d]">{row.branchName || 'Current Office'}</span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 py-4">
                    <p className="font-semibold text-[#10243a]">{formatCompactCurrency(performance.pipelineValue)}</p>
                    <MiniTrendLine values={performance.sparkline} />
                  </td>
                  <td className="px-3 py-4 text-center font-semibold text-[#10243a]">{performance.activeTransactionCount ?? performance.activeTransactions ?? 0}</td>
                  <td className="px-3 py-4 text-center font-semibold text-[#10243a]">{performance.activeListingCount ?? performance.listings ?? 0}</td>
                  <td className="px-3 py-4">
                    <p className="font-semibold text-[#10243a]">{formatConversionRate(performance.conversionRate)}</p>
                    {performance.conversionDelta !== null && performance.conversionDelta !== undefined ? (
                      <p className={`mt-1 text-xs font-semibold ${Number(performance.conversionDelta) >= 0 ? 'text-success' : 'text-danger'}`}>
                        {Number(performance.conversionDelta) >= 0 ? '↑' : '↓'} {Math.abs(Math.round(Number(performance.conversionDelta)))}pp
                      </p>
                    ) : null}
                  </td>
                  <td className="hidden px-3 py-4 xl:table-cell">
                    <StageMixChips counts={performance.stageCounts} onSelect={(stage) => onViewTransactions?.(row.agent, stage)} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-[#344054]">
                      <span className={`h-2 w-2 rounded-full ${activity.tone === 'active' ? 'bg-success' : activity.tone === 'warning' ? 'bg-warning' : 'bg-danger'}`} />
                      {activity.label}
                    </span>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex justify-end gap-1">
                      <a className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#526981] hover:bg-[#edf5ff] hover:text-[#1769d1]" href={row.phone ? `tel:${row.phone}` : undefined} onClick={(event) => event.stopPropagation()} aria-label="Call agent"><Phone size={15} /></a>
                      <a className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#526981] hover:bg-[#edf5ff] hover:text-[#1769d1]" href={row.email ? `mailto:${row.email}` : undefined} onClick={(event) => event.stopPropagation()} aria-label="Email agent"><Mail size={15} /></a>
                      {pendingInvite ? (
                        <AgentRowActions
                          canManage={canManage}
                          pendingInvite
                          onResend={() => onResendInvite?.(row.agent)}
                          onCopy={() => onCopyInviteLink?.(row.agent)}
                          onRevoke={() => onRevokeInvite?.(row.agent)}
                        />
                      ) : (
                        <AgentRowActions
                          canManage={canManage}
                          onView={() => onView(row.agent)}
                          onTransactions={() => onViewTransactions?.(row.agent)}
                          onAssignLead={() => onAssignLead?.(row.agent)}
                          onSendMessage={() => onSendMessage?.(row.agent)}
                          onDeactivate={() => onDeactivate(row.agent)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 p-4 lg:hidden">
        {rows.map((row) => (
          <AgentTableMobileCard
            key={`${row.id}-${row.branchId || 'branch'}-mobile-card`}
            row={row}
            canManage={canManage}
            onView={onView}
            onViewTransactions={onViewTransactions}
            onAssignLead={onAssignLead}
            onSendMessage={onSendMessage}
            onDeactivate={onDeactivate}
            onResendInvite={onResendInvite}
            onCopyInviteLink={onCopyInviteLink}
            onRevokeInvite={onRevokeInvite}
          />
        ))}
      </div>
    </div>
  )
}

function StageMixChips({ counts = {}, onSelect }) {
  const stages = [
    { key: 'otp', label: 'OTP', className: 'border-info/20 bg-infoSoft text-info' },
    { key: 'finance', label: 'FIN', className: 'border-primary/20 bg-primarySoft text-primary' },
    { key: 'transfer', label: 'TRF', className: 'border-warning/20 bg-warningSoft text-warning' },
    { key: 'registration', label: 'REG', className: 'border-success/20 bg-successSoft text-success' },
  ]
  return (
    <div className="flex flex-wrap gap-1.5">
      {stages.map((stage) => (
        <button
          key={stage.key}
          type="button"
          className={`inline-flex min-w-[46px] flex-col items-center rounded-lg border px-2 py-1 text-[0.62rem] font-semibold leading-tight transition hover:brightness-95 ${stage.className}`}
          onClick={(event) => {
            event.stopPropagation()
            onSelect?.(stage.key)
          }}
        >
          <span className="text-sm leading-none tabular-nums">{Number(counts?.[stage.key] || 0)}</span>
          <span>{stage.label}</span>
        </button>
      ))}
    </div>
  )
}

function AgentRowActions({
  canManage = false,
  pendingInvite = false,
  onView,
  onTransactions,
  onAssignLead,
  onSendMessage,
  onDeactivate,
  onResend,
  onCopy,
  onRevoke,
}) {
  const [open, setOpen] = useState(false)
  const run = (event, action) => {
    event.stopPropagation()
    setOpen(false)
    action?.()
  }

  return (
    <div className="relative">
      <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#526981] hover:bg-[#edf5ff] hover:text-[#1769d1]" onClick={(event) => { event.stopPropagation(); setOpen((value) => !value) }} aria-label="More actions">
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-44 rounded-2xl border border-[#dce6f0] bg-white p-2 text-left shadow-[0_18px_40px_rgba(15,23,42,0.15)]">
          {pendingInvite ? (
            <>
              {canManage ? <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" onClick={(event) => run(event, onResend)}>Resend invite</button> : null}
              {canManage ? <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" onClick={(event) => run(event, onCopy)}>Copy invite link</button> : null}
              {canManage ? <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-danger hover:bg-dangerSoft" onClick={(event) => run(event, onRevoke)}>Revoke</button> : null}
            </>
          ) : (
            <>
              <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" onClick={(event) => run(event, onView)}>View Agent</button>
              <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" onClick={(event) => run(event, onTransactions)}>View Transactions</button>
              {canManage ? <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" onClick={(event) => run(event, onAssignLead)}>Assign Lead</button> : null}
              <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]" onClick={(event) => run(event, onSendMessage)}>Send Message</button>
              {canManage ? <button type="button" className="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-danger hover:bg-dangerSoft" onClick={(event) => run(event, onDeactivate)}>Deactivate</button> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function AgentTableMobileCard({
  row,
  canManage,
  onView,
  onViewTransactions,
  onAssignLead,
  onSendMessage,
  onDeactivate,
  onResendInvite,
  onCopyInviteLink,
  onRevokeInvite,
}) {
  const performance = row.performance || {}
  const pendingInvite = row.statusKey === AGENT_INVITE_STATUS.PENDING_INVITE || row.agent?.isPendingInvite
  const activity = formatCompactActivity(performance.lastActivityAt)

  return (
    <article className="rounded-2xl border border-[#e1e9f3] bg-[linear-gradient(180deg,#ffffff,#fbfdff)] p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => onView(row.agent)}>
          <AgentAvatar agent={row} className="h-11 w-11 border border-[#d7e2ef] bg-white text-sm font-semibold text-[#245076]" />
          <span className="min-w-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-[#10243a]">{row.name || 'Agent'}</span>
              {row.needsAttention ? <AlertTriangle size={13} className="shrink-0 text-warning" aria-label="Needs attention" /> : null}
            </span>
            <span className="block truncate text-xs text-[#60758d]">{formatRoleLabel(row.role)}</span>
            <span className="block truncate text-xs text-[#60758d]">{row.branchName || 'Current Office'}</span>
          </span>
        </button>
        <AgentRowActions
          canManage={canManage}
          pendingInvite={pendingInvite}
          onView={() => onView(row.agent)}
          onTransactions={() => onViewTransactions?.(row.agent)}
          onAssignLead={() => onAssignLead?.(row.agent)}
          onSendMessage={() => onSendMessage?.(row.agent)}
          onDeactivate={() => onDeactivate(row.agent)}
          onResend={() => onResendInvite?.(row.agent)}
          onCopy={() => onCopyInviteLink?.(row.agent)}
          onRevoke={() => onRevokeInvite?.(row.agent)}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <AgentMetricCard label="Pipeline Value" value={formatCompactCurrency(performance.pipelineValue)} />
        <AgentMetricCard label="Active Transactions" value={performance.activeTransactionCount ?? performance.activeTransactions ?? 0} />
        <AgentMetricCard label="Listings" value={performance.activeListingCount ?? performance.listings ?? 0} />
        <AgentMetricCard label="Conversion" value={formatConversionRate(performance.conversionRate)} />
      </div>
      <div className="mt-4">
        <StageMixChips counts={performance.stageCounts} onSelect={(stage) => onViewTransactions?.(row.agent, stage)} />
      </div>
      <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#344054]">
        <span className={`h-2 w-2 rounded-full ${activity.tone === 'active' ? 'bg-success' : activity.tone === 'warning' ? 'bg-warning' : 'bg-danger'}`} />
        {activity.label}
      </p>
    </article>
  )
}

function AgentCommandCardGrid({
  rows = [],
  canManage = false,
  actionSlot = null,
  onView,
  onDeactivate,
  onViewTransactions,
  onAssignLead,
  onSendMessage,
  onResendInvite,
  onCopyInviteLink,
  onRevokeInvite,
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#dde6f1] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-[#edf2f7] px-4 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[#10243a]">All Agents</h2>
          <p className="mt-0.5 truncate text-xs text-[#6d8299]">Card view for branch-aware agent management.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-[#dbe6f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#60758d]">{rows.length} agents</span>
          {actionSlot}
        </div>
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-3">
        {rows.map((row) => {
          const performance = row.performance || {}
          const pendingInvite = row.statusKey === AGENT_INVITE_STATUS.PENDING_INVITE || row.agent?.isPendingInvite
          const activity = formatCompactActivity(performance.lastActivityAt)
          return (
            <article key={`${row.id}-${row.branchId || 'branch'}-command-card`} className="flex min-h-[260px] flex-col rounded-2xl border border-[#e1e9f3] bg-[linear-gradient(180deg,#ffffff,#fbfdff)] p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <AgentAvatar agent={row} className="h-12 w-12 border border-[#d7e2ef] bg-white text-sm font-semibold text-[#245076]" />
                  <div className="min-w-0">
                    <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-[#10243a]">
                      <span className="truncate">{row.name || 'Agent'}</span>
                      {row.needsAttention ? <AlertTriangle size={13} className="shrink-0 text-warning" aria-label="Needs attention" /> : null}
                    </h3>
                    <p className="truncate text-xs text-[#60758d]">{formatRoleLabel(row.role)}</p>
                    <p className="truncate text-xs text-[#60758d]">{row.branchName || 'Current Office'}</p>
                    <p className="truncate text-xs text-[#8294aa]">{row.email || 'No email added'}</p>
                  </div>
                </div>
                <AgentRowActions
                  canManage={canManage}
                  pendingInvite={pendingInvite}
                  onView={() => onView(row.agent)}
                  onTransactions={() => onViewTransactions?.(row.agent)}
                  onAssignLead={() => onAssignLead?.(row.agent)}
                  onSendMessage={() => onSendMessage?.(row.agent)}
                  onDeactivate={() => onDeactivate(row.agent)}
                  onResend={() => onResendInvite?.(row.agent)}
                  onCopy={() => onCopyInviteLink?.(row.agent)}
                  onRevoke={() => onRevokeInvite?.(row.agent)}
                />
              </div>

              <div className="mt-4 grid grid-cols-3 divide-x divide-[#e4ebf4] rounded-2xl border border-[#edf2f7] bg-white py-3">
                <div className="px-3">
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#71859c]">Pipeline</p>
                  <p className="mt-1 truncate text-sm font-semibold text-[#10243a]">{formatCompactCurrency(performance.pipelineValue)}</p>
                </div>
                <div className="px-3">
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#71859c]">Deals</p>
                  <p className="mt-1 text-sm font-semibold text-[#10243a]">{performance.activeTransactionCount ?? performance.activeTransactions ?? 0}</p>
                </div>
                <div className="px-3">
                  <p className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#71859c]">Conversion</p>
                  <p className="mt-1 text-sm font-semibold text-[#10243a]">{formatConversionRate(performance.conversionRate)}</p>
                </div>
              </div>

              <div className="mt-4">
                <StageMixChips counts={performance.stageCounts} onSelect={(stage) => onViewTransactions?.(row.agent, stage)} />
              </div>

              <div className="mt-4 space-y-2 text-xs text-[#60758d]">
                <p className="flex items-center justify-between gap-3">
                  <span>Last active</span>
                  <span className="inline-flex items-center gap-2 font-semibold text-[#10243a]">
                    <span className={`h-2 w-2 rounded-full ${activity.tone === 'active' ? 'bg-success' : activity.tone === 'warning' ? 'bg-warning' : 'bg-danger'}`} />
                    {activity.label}
                  </span>
                </p>
              </div>

              <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                <Button type="button" size="sm" onClick={() => onView(row.agent)}>Open</Button>
                {pendingInvite ? (
                  <>
                    {canManage ? <Button type="button" size="sm" variant="secondary" onClick={() => onResendInvite?.(row.agent)}><Send size={14} />Resend</Button> : null}
                    {canManage ? <Button type="button" size="sm" variant="secondary" onClick={() => onCopyInviteLink?.(row.agent)}><Copy size={14} />Copy</Button> : null}
                    {canManage ? <Button type="button" size="sm" variant="secondary" onClick={() => onRevokeInvite?.(row.agent)}><XCircle size={14} />Revoke</Button> : null}
                  </>
                ) : (
                  null
                )}
              </div>
            </article>
          )
        })}
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

function getWorkspaceDisplayValue(value, formatter = null) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'number' && !Number.isFinite(value)) return '—'
  if (formatter) return formatter(value)
  return value
}

function getNumericMetric(agent, key) {
  const value = Number(agent?.metrics?.[key])
  return Number.isFinite(value) ? value : 0
}

function getDealStageText(row = {}) {
  return [
    row?.stage,
    row?.status,
    row?.transaction?.stage,
    row?.transaction?.status,
    row?.transaction?.current_stage,
    row?.transaction?.current_main_stage,
    row?.transaction?.current_sub_stage,
    row?.transaction?.current_sub_stage_summary,
    row?.transaction?.lifecycle_state,
  ].filter(Boolean).join(' ').toLowerCase()
}

function buildWorkspaceDealStages(agent, activeDeals, completedDeals) {
  const sourceDeals = Array.isArray(agent?.deals) ? agent.deals : []
  const stageMatchers = [
    { label: 'Lead', count: Array.isArray(agent?.pipelineRows) ? agent.pipelineRows.length : 0 },
    {
      label: 'OTP',
      count: sourceDeals.filter((row) => {
        const text = getDealStageText(row)
        return text.includes('otp') || text.includes('offer') || text.includes('agreement')
      }).length,
    },
    {
      label: 'Finance',
      count: activeDeals.filter((row) => {
        const text = getDealStageText(row)
        return text.includes('finance') || text.includes('bond')
      }).length,
    },
    {
      label: 'Transfer',
      count: activeDeals.filter((row) => {
        const text = getDealStageText(row)
        return text.includes('transfer') || text.includes('convey') || text.includes('lodg')
      }).length,
    },
    { label: 'Registration', count: completedDeals.length },
  ]
  return stageMatchers
}

function buildWorkspaceListingStatuses(listings) {
  const rows = [
    { label: 'Active', tone: 'bg-[#16894f]' },
    { label: 'Under Offer', tone: 'bg-[#1769d1]' },
    { label: 'Sold', tone: 'bg-[#f2b72f]' },
    { label: 'Withdrawn', tone: 'bg-[#aeb9c6]' },
  ]
  return rows.map((row) => {
    const normalizedLabel = row.label.toLowerCase()
    const count = listings.filter((listing) => {
      const status = String(listing?.status || '').trim().toLowerCase()
      if (normalizedLabel === 'active') return !status || status === 'active' || status === 'listed'
      if (normalizedLabel === 'under offer') return status.includes('offer')
      if (normalizedLabel === 'sold') return status.includes('sold') || status.includes('registered')
      return status.includes('withdraw') || status.includes('inactive')
    }).length
    return { ...row, count }
  })
}

function MonthSummaryMetric({ label, value }) {
  return (
    <div className="min-w-0 border-t border-[#e8eff7] pt-4 first:border-t-0 first:pt-0 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0 sm:first:border-l-0 sm:first:pl-0">
      <p className="truncate text-[1.45rem] font-semibold tracking-[-0.04em] text-[#10243a]" title={String(value ?? '—')}>{value ?? '—'}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#526981]">{label}</p>
      <p className="mt-2 text-xs font-semibold text-[#6f839a]">vs last month <span className="text-[#10243a]">—</span></p>
    </div>
  )
}

function WorkspaceCard({ title, actionLabel = '', children, className = '' }) {
  return (
    <article className={`min-w-0 overflow-hidden rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)] sm:p-5 ${className}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <h3 className="min-w-0 truncate text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#6b7f97]">{title}</h3>
        {actionLabel ? <span className="shrink-0 text-xs font-semibold text-[#1769d1]">{actionLabel}</span> : null}
      </div>
      <div className="mt-4">{children}</div>
    </article>
  )
}

function DealsByStageCard({ stages }) {
  const maxValue = Math.max(1, ...stages.map((item) => Number(item.count) || 0))
  const total = stages.reduce((sum, item) => sum + (Number(item.count) || 0), 0)
  return (
    <WorkspaceCard title="Deals by Stage" className="min-h-[260px]">
      <div className="space-y-3.5">
        {stages.map((stage) => {
          const width = `${Math.max(6, Math.round(((Number(stage.count) || 0) / maxValue) * 100))}%`
          return (
            <div key={stage.label} className="grid grid-cols-[82px_minmax(0,1fr)_32px] items-center gap-3">
              <span className="truncate text-sm font-medium text-[#526981]">{stage.label}</span>
              <span className="h-5 overflow-hidden rounded-[6px] bg-[#edf3fa]">
                <span className="block h-full rounded-[6px] bg-[#cfe0f5]" style={{ width }} />
              </span>
              <span className="text-right text-sm font-semibold text-[#10243a]">{stage.count}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-[#edf2f7] pt-4 text-sm">
        <span className="font-semibold text-[#526981]">Total Active Deals</span>
        <span className="font-semibold text-[#10243a]">{total}</span>
      </div>
    </WorkspaceCard>
  )
}

function ListingsOverviewCard({ statuses, total }) {
  const active = statuses.find((item) => item.label === 'Active')?.count || 0
  const activeRatio = total ? Math.round((active / total) * 100) : 0
  return (
    <WorkspaceCard title="Listings Overview" className="min-h-[260px]">
      <div className="grid min-w-0 gap-6 sm:grid-cols-[148px_minmax(0,1fr)] sm:items-center lg:grid-cols-1 xl:grid-cols-[148px_minmax(0,1fr)] 2xl:grid-cols-[164px_minmax(0,1fr)]">
        <div
          className="mx-auto grid h-36 w-36 place-items-center rounded-full 2xl:h-40 2xl:w-40"
          style={{ background: `conic-gradient(#16894f 0 ${activeRatio}%, #1769d1 ${activeRatio}% ${Math.min(100, activeRatio + 24)}%, #f2b72f ${Math.min(100, activeRatio + 24)}% ${Math.min(100, activeRatio + 38)}%, #d7dee8 ${Math.min(100, activeRatio + 38)}% 100%)` }}
        >
          <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center shadow-sm 2xl:h-28 2xl:w-28">
            <span>
              <span className="block text-2xl font-semibold tracking-[-0.04em] text-[#10243a]">{total}</span>
              <span className="block text-[0.68rem] font-medium text-[#6f839a]">Total</span>
            </span>
          </div>
        </div>
        <div className="space-y-3">
          {statuses.map((status) => (
            <div key={status.label} className="flex min-w-0 items-center justify-between gap-3">
              <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-[#526981]">
                <i className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.tone}`} />
                <span className="truncate">{status.label}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-[#10243a]">{status.count}</span>
            </div>
          ))}
        </div>
      </div>
    </WorkspaceCard>
  )
}

function FinancialPerformanceCard({ rows }) {
  return (
    <WorkspaceCard title="Financial Performance" className="min-h-[260px]">
      <div className="space-y-2">
        {rows.map(([label, value]) => (
          <DetailInfoRow key={label} label={label} value={value} />
        ))}
      </div>
    </WorkspaceCard>
  )
}

function AgentWorkspace({ agent, canManageSettings = false, commissionStructures = [], workspaceSnapshot = {}, onRefresh }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [editMenuOpen, setEditMenuOpen] = useState(false)
  const [modalMode, setModalMode] = useState('')
  const [pendingAction, setPendingAction] = useState(null)
  const [actionNotice, setActionNotice] = useState('')
  const [commissionForm, setCommissionForm] = useState({
    commissionStructureId: '',
    overrideAgentSplitPercentage: '',
    effectiveFrom: '',
  })
  const [commissionSaving, setCommissionSaving] = useState(false)
  const [commissionError, setCommissionError] = useState('')
  const [permissionsForm, setPermissionsForm] = useState({ role: '' })
  const [permissionsSaving, setPermissionsSaving] = useState(false)
  const [permissionsError, setPermissionsError] = useState('')

  const effectiveActiveTab = AGENT_WORKSPACE_TABS.some((tab) => tab.key === activeTab) ? activeTab : 'overview'
  const activeCommissionStructures = commissionStructures.filter((structure) => structure?.isActive)
  const defaultCommissionStructure = activeCommissionStructures.find((structure) => structure?.isDefault) || null
  const selectedCommissionStructure =
    activeCommissionStructures.find((structure) => normalizeAgentRecordId(structure.id) === normalizeAgentRecordId(commissionForm.commissionStructureId)) ||
    (!commissionForm.commissionStructureId ? defaultCommissionStructure : null)

  useEffect(() => {
    if (modalMode !== 'commission') return
    setCommissionError('')
    setCommissionForm({
      commissionStructureId: agent.commissionStructureId || '',
      overrideAgentSplitPercentage:
        agent.overrideAgentSplitPercentage === null || agent.overrideAgentSplitPercentage === undefined
          ? ''
          : String(agent.overrideAgentSplitPercentage),
      effectiveFrom: agent.commissionEffectiveFrom ? String(agent.commissionEffectiveFrom).slice(0, 10) : new Date().toISOString().slice(0, 10),
    })
  }, [agent.commissionEffectiveFrom, agent.commissionStructureId, agent.overrideAgentSplitPercentage, modalMode])

  useEffect(() => {
    if (modalMode !== 'permissions') return
    setPermissionsError('')
    setPermissionsForm({ role: agent.role || 'agent' })
  }, [agent.role, modalMode])

  const {
    branches = [],
    leads = [],
    transactions = [],
    listings = [],
    appointments = [],
    tasks = [],
    leadActivities = [],
    canvassingProspects = [],
    canvassingActivities = [],
  } = workspaceSnapshot

  const developmentListings = agent.developmentListings || []
  const privateListings = agent.privateListings || []
  const allListings = [...developmentListings, ...privateListings.map((listing) => ({
    id: listing.id,
    title: listing.listingTitle,
    listingType: 'private_sale',
    developmentName: 'Private Sale',
    suburb: listing.suburb || 'Area pending',
    price: Number(listing.askingPrice || 0),
    status: listing.status || 'Active',
    mandateStatus: listing.mandateType || '—',
    sellerOnboardingStatus: listing?.sellerOnboarding?.status || '—',
    documentsStatus: listing.documentsStatus || '—',
    listedAt: listing.createdAt || null,
  }))]

  const activeDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'active')
  const completedDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'completed')
  const cancelledDeals = agent.deals.filter((row) => normalizeDealStatus(row) === 'cancelled')
  const activeClientCount = Math.max(agent.pipelineRows?.length || 0, getNumericMetric(agent, 'activeDeals'))
  const conversionRate = agent.deals.length ? `${Math.round((getNumericMetric(agent, 'registeredDeals') / agent.deals.length) * 100)}%` : '—'
  const commandCentre = useMemo(
    () =>
      getPrincipalAgentDetailCommandCentre({
        agent,
        branches,
        leads,
        transactions,
        listings,
        appointments,
        tasks,
        activities: leadActivities,
        canvassingProspects,
        canvassingActivities,
      }),
    [agent, appointments, branches, canvassingActivities, canvassingProspects, leadActivities, leads, listings, tasks, transactions],
  )
  const agentDisplayName = getAgentPrimaryName(agent)
  const agentRoleTitle = getAgentRoleTitle(agent)
  const lastActivity = commandCentre?.agentIdentity?.lastActivityAt || getAgentLastActivityDate(agent)
  const joinedDate = commandCentre?.agentIdentity?.joinedAt || agent.activatedAt || agent.invitedAt || agent.createdAt
  const branchName = commandCentre?.agentIdentity?.branchName || agent.office || agent.organisationName || '—'
  const dealStages = commandCentre?.existingCharts?.dealStages || buildWorkspaceDealStages(agent, activeDeals, completedDeals)
  const listingStatuses = commandCentre?.existingCharts?.listingStatuses || buildWorkspaceListingStatuses(allListings)
  const financialRows = (commandCentre?.existingCharts?.financialRows || []).map(([label, value]) => [
    label,
    typeof value === 'number' && label !== 'Average Response Time' ? formatCurrency(value) : value || '—',
  ])
  const monthSummary = commandCentre?.monthlyPerformance?.metrics || []
  const headerActionPermissions = commandCentre?.headerActionsPermissions || {
    canMessage: Boolean(agent.email),
    canViewCalendar: true,
    canAssignDeal: true,
    canAssignListing: true,
  }

  const recentActivity = [
    ...agent.recentDeals.map((row) => ({
      id: `deal-${row?.transaction?.id || row?.transaction?.updated_at}`,
      label: normalizeDealStatus(row) === 'completed' ? 'Registered deal' : 'Updated deal',
      record: row?.development?.name || row?.buyer?.name || row?.seller?.name || 'Deal workspace',
      timestamp: row?.transaction?.updated_at || row?.transaction?.created_at,
      icon: BriefcaseBusiness,
      tone: 'bg-[#eef4ff] text-[#1769d1]',
    })),
    ...allListings.slice(0, 4).map((listing) => ({
      id: `listing-${listing.id}`,
      label: 'Created listing',
      record: listing.title || listing.listingTitle || 'Listing',
      timestamp: listing.listedAt || listing.createdAt,
      icon: Building2,
      tone: 'bg-[#ecfdf3] text-[#16894f]',
    })),
    ...(agent.appointments || []).slice(0, 4).map((appointment) => ({
      id: `appointment-${appointment.appointmentId || appointment.id}`,
      label: 'Added appointment',
      record: appointment.title || appointment.appointmentType || 'Appointment',
      timestamp: appointment.updatedAt || appointment.dateTime,
      icon: CalendarDays,
      tone: 'bg-[#fff7ed] text-[#d77d00]',
    })),
  ]
    .filter((item) => item.id)
    .sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime())
    .slice(0, 7)

  const contactRows = [
    ['Email', getWorkspaceDisplayValue(agent.email)],
    ['Phone', getWorkspaceDisplayValue(agent.phone)],
    ['Mobile', getWorkspaceDisplayValue(agent.mobile || agent.phone)],
    ['Branch', getWorkspaceDisplayValue(branchName)],
    ['Joined', getWorkspaceDisplayValue(joinedDate, formatDate)],
    ['Role / Title', getWorkspaceDisplayValue(agentRoleTitle)],
    ['Last Login', getWorkspaceDisplayValue(agent.lastActiveAt, formatDateTime)],
  ]

  const commissionPlanRows = [
    ['Current plan', getWorkspaceDisplayValue(agent.commissionStructureName || agent.commissionPlanName)],
    ['Effective from', getWorkspaceDisplayValue(agent.commissionEffectiveFrom, formatDate)],
    ['Base commission', getWorkspaceDisplayValue(agent.baseCommissionRate)],
    ['Split', getWorkspaceDisplayValue(agent.commissionSplit)],
    ['Performance tier', getWorkspaceDisplayValue(agent.performanceTier)],
    ['Status', getAgentStatusMeta(agent).label],
  ]

  const teamAllocationRows = [
    ['Team size', getWorkspaceDisplayValue(agent.teamSize)],
    ['Listings assigned', allListings.length],
    ['Deals assigned', agent.deals.length],
    ['Active clients', activeClientCount],
    ['Branch allocation', getWorkspaceDisplayValue(agent.office || agent.organisationName)],
    ['Managed agents', getWorkspaceDisplayValue(agent.managedAgentCount)],
  ]

  const roleAccessSummary = getAgentRoleAccessSummary(agent.role)
  const draftRoleAccessSummary = getAgentRoleAccessSummary(permissionsForm.role || agent.role)
  const permissionRows = [
    ['Workspace Access', getWorkspaceDisplayValue(agent.permissions?.workspaceAccess || roleAccessSummary.workspaceAccess)],
    ['Branch Access', getWorkspaceDisplayValue(agent.office || roleAccessSummary.branchAccess)],
    ['Listings', getWorkspaceDisplayValue(agent.permissions?.listings || roleAccessSummary.listings)],
    ['Deals', getWorkspaceDisplayValue(agent.permissions?.deals || agent.permissions?.transactions || roleAccessSummary.deals)],
    ['Clients', getWorkspaceDisplayValue(agent.permissions?.clients || roleAccessSummary.clients)],
    ['Reports', getWorkspaceDisplayValue(agent.permissions?.reports || roleAccessSummary.reports)],
    ['Agency Settings', getWorkspaceDisplayValue(agent.permissions?.agencySettings || roleAccessSummary.agencySettings)],
    ['Commission Visibility', getWorkspaceDisplayValue(agent.permissions?.commissionVisibility || roleAccessSummary.commissionVisibility)],
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

  function updateCommissionForm(key, value) {
    setCommissionForm((previous) => ({ ...previous, [key]: value }))
  }

  async function handleSaveCommissionAssignment() {
    if (!canManageSettings || commissionSaving) return
    const overrideValue = String(commissionForm.overrideAgentSplitPercentage || '').trim()
    const parsedOverride = overrideValue === '' ? null : Number(overrideValue)
    if (parsedOverride !== null && (!Number.isFinite(parsedOverride) || parsedOverride < 0 || parsedOverride > 100)) {
      setCommissionError('Override split must be between 0 and 100.')
      return
    }

    try {
      setCommissionSaving(true)
      setCommissionError('')
      await assignOrganisationUserCommissionProfile({
        organisationUserId: agent.organisationUserId || '',
        userId: agent.userId || '',
        email: agent.email || '',
        commissionStructureId: commissionForm.commissionStructureId || '',
        overrideAgentSplitPercentage: parsedOverride,
        effectiveFrom: commissionForm.effectiveFrom || new Date().toISOString().slice(0, 10),
      })
      setActionNotice('Commission assignment updated.')
      setModalMode('')
      await onRefresh?.()
    } catch (saveError) {
      setCommissionError(saveError?.message || 'Unable to save commission assignment.')
    } finally {
      setCommissionSaving(false)
    }
  }

  async function handleSavePermissionsAssignment() {
    if (!canManageSettings || permissionsSaving) return
    if (!agent.organisationUserId) {
      setPermissionsError('This agent is not linked to an organisation user row yet, so role changes cannot be saved here.')
      return
    }

    try {
      setPermissionsSaving(true)
      setPermissionsError('')
      await updateOrganisationUserRole(agent.organisationUserId, permissionsForm.role || 'agent')
      setActionNotice('Agent permissions updated.')
      setModalMode('')
      await onRefresh?.()
    } catch (saveError) {
      setPermissionsError(saveError?.message || 'Unable to save permission changes.')
    } finally {
      setPermissionsSaving(false)
    }
  }

  function handleConfirmedAction() {
    if (!pendingAction) return
    const label = pendingAction === 'remove' ? 'Remove agent' : pendingAction === 'archive' ? 'Archive agent' : 'Deactivate agent'
    setActionNotice(`${label} requires the connected account workflow. Nothing was changed yet.`)
    setPendingAction(null)
  }

  const actionItems = [
    ['message', 'Message', MessageCircle, false],
    ['calendar', 'View Calendar', CalendarDays, false],
    ['assign-deal', 'Assign Deal', BriefcaseBusiness, false],
    ['assign-listing', 'Assign Listing', Building2, false],
    ['profile', 'Edit Profile', Edit3, false],
    ['commission', 'Commission', DollarSign, false],
    ['permissions', 'Permissions', ShieldCheck, false],
  ]

  return (
    <section className="min-w-0 space-y-4 overflow-hidden">
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

      <section className="min-w-0 rounded-3xl border border-[#dde6f1] bg-white p-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)] sm:p-5 lg:p-6">
        <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-center gap-3 2xl:gap-4">
            <span className="relative inline-flex h-16 w-16 shrink-0 sm:h-20 sm:w-20 2xl:h-24 2xl:w-24">
              <AgentAvatar agent={agent} className="h-full w-full border border-[#d7e2ef] bg-[linear-gradient(135deg,#f8fbff,#e7eef7)] text-2xl font-semibold text-[#2f5578]" />
              <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-[#16a365]" />
            </span>
            <div className="min-w-0">
              <h1 className="min-w-0 truncate text-[1.35rem] font-semibold tracking-[-0.045em] text-[#10243a] 2xl:text-[1.65rem]">{agentDisplayName}</h1>
              <p className="mt-1 truncate text-sm font-semibold text-[#536b84]">{agentRoleTitle}</p>
              <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-[#61778f]">
                <StatusBadge agent={agent} />
                <span>·</span>
                <span className="truncate">{branchName}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 size={14} />
                  Last activity {lastActivity ? formatRelativeActivity(lastActivity) : '—'}
                </span>
                {joinedDate ? (
                  <>
                    <span>·</span>
                    <span>Joined {formatDate(joinedDate)}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
            {headerActionPermissions.canMessage ? (
              <button
                type="button"
                className="hidden min-h-10 items-center justify-center gap-2 rounded-xl border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#0f2742] shadow-sm transition hover:bg-[#f7fafc] md:inline-flex 2xl:px-4"
                onClick={() => openPlaceholder('message')}
              >
                <MessageCircle size={16} />
                Message
              </button>
            ) : null}
            {headerActionPermissions.canViewCalendar ? (
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#0f2742] shadow-sm transition hover:bg-[#f7fafc] 2xl:px-4"
                onClick={() => setActiveTab('calendar')}
              >
                <CalendarDays size={16} />
                View Calendar
              </button>
            ) : null}
            {headerActionPermissions.canAssignDeal ? (
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#0f2742] px-3 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(15,39,66,0.18)] transition hover:bg-[#173a5e] 2xl:px-4"
                onClick={() => openPlaceholder('assign-deal')}
              >
                <BriefcaseBusiness size={16} />
                Assign Deal
              </button>
            ) : null}
            {headerActionPermissions.canAssignListing ? (
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#173a5e] px-3 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(15,39,66,0.14)] transition hover:bg-[#204a74] 2xl:px-4"
                onClick={() => openPlaceholder('assign-listing')}
              >
                <List size={16} />
                Assign Listing
              </button>
            ) : null}
            <div className="relative w-full sm:w-auto">
              <button type="button" onClick={() => setEditMenuOpen((open) => !open)} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#d9e3ef] bg-white px-4 text-sm font-semibold text-[#0f2742] shadow-sm transition hover:bg-[#f7fafc] sm:w-auto">
                More
                <MoreHorizontal size={16} />
              </button>
              {editMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-56 rounded-2xl border border-[#dce6f0] bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.15)]">
                  {actionItems.map(([key, label, icon]) => (
                    <button
                      key={key}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#1f3448] hover:bg-[#f6f9fc]"
                      onClick={() => (key === 'calendar' ? setActiveTab('calendar') : openPlaceholder(key))}
                    >
                      {createElement(icon, { size: 15 })}
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <nav className="min-w-0 max-w-full overflow-x-auto rounded-2xl border border-[#dde6f1] bg-white p-2 shadow-sm">
        <div className="flex min-w-max items-center gap-1 lg:min-w-full">
          {AGENT_WORKSPACE_TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition lg:flex-1 ${
                  effectiveActiveTab === tab.key
                    ? 'bg-[#0f2742] text-white shadow-sm'
                    : 'text-[#405870] hover:bg-[#f6f9fc] hover:text-[#10243a]'
                }`}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </nav>

      {effectiveActiveTab === 'overview' ? (
        <section className="min-w-0 space-y-4">
          <WorkspaceCard title="Prospecting Activity" actionLabel="This Month">
            {commandCentre?.prospectingActivity?.hasActivity ? (
              <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {commandCentre.prospectingActivity.metrics.map((metric) => (
                  <AgentMetricCard key={metric.key} label={metric.label} value={metric.value} helper="This month" />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#647a92]">
                No prospecting activity captured for this agent yet.
              </div>
            )}
          </WorkspaceCard>

          <div className="grid min-w-0 gap-4 xl:grid-cols-2">
            <WorkspaceCard title="Pipeline Health">
              {commandCentre?.pipelineHealth?.hasPipeline ? (
                <>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-3">
                    <AgentMetricCard label="Pipeline Value" value={formatCurrency(commandCentre.pipelineHealth.pipelineValue)} helper="Open opportunities" />
                    <AgentMetricCard label="Active Deals" value={commandCentre.pipelineHealth.activeDeals} helper="Live transactions" />
                    <AgentMetricCard label="At Risk / Overdue" value={commandCentre.pipelineHealth.atRiskDeals} helper="Needs intervention" />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {commandCentre.pipelineHealth.stages.map((stage) => (
                      <div key={stage.key} className="rounded-xl border border-[#e4ebf5] bg-[#fbfcfe] px-4 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">{stage.label}</p>
                        <p className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-[#142132]">{stage.count}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#647a92]">
                  No pipeline activity is currently assigned to this agent.
                </div>
              )}
            </WorkspaceCard>
          </div>

          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
            <WorkspaceCard title="Follow-Up Compliance">
              {commandCentre?.followUpCompliance?.hasSignals ? (
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  {commandCentre.followUpCompliance.tasksCompletedPercent !== null ? (
                    <AgentMetricCard label="Tasks Completed %" value={`${commandCentre.followUpCompliance.tasksCompletedPercent}%`} helper="This month" />
                  ) : null}
                  <AgentMetricCard label="Overdue Tasks" value={commandCentre.followUpCompliance.overdueTasks} helper="Needs action" />
                  <AgentMetricCard label="Average Response Time" value={commandCentre.followUpCompliance.averageResponseTimeLabel} helper="Lead response" />
                  <AgentMetricCard label="Follow-ups Due Today" value={commandCentre.followUpCompliance.dueToday} helper="Today" />
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#647a92]">
                  No follow-up pressure is showing for this agent right now.
                </div>
              )}
            </WorkspaceCard>

            <WorkspaceCard title="This Month Summary" actionLabel="This Month">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {monthSummary.map((metric) => (
                  <MonthSummaryMetric key={metric.key || metric.label} label={metric.label} value={formatSummaryMetricValue(metric)} />
                ))}
              </div>
            </WorkspaceCard>
          </div>

          <div className="grid min-w-0 gap-4 lg:grid-cols-3 2xl:gap-5">
            <DealsByStageCard stages={dealStages} />
            <ListingsOverviewCard statuses={listingStatuses} total={allListings.length} />
            <FinancialPerformanceCard rows={financialRows} />
          </div>

          <AppointmentDashboardSection
            module="agent"
            organisationId={String(agent?.organisationId || '').trim()}
            appointmentRows={workspaceSnapshot?.appointments || []}
            users={[agent].filter(Boolean)}
            userId={agent?.userId || agent?.id || ''}
            userEmail={agent?.email || ''}
            includeAll={false}
            onViewCalendar={() => navigate('/pipeline/calendar')}
            onOpenCalendar={() => navigate('/pipeline/calendar')}
            onManageAppointment={() => navigate('/pipeline/calendar')}
            onOpenAppointment={() => navigate('/pipeline/calendar')}
            onScheduleAppointment={() => navigate('/pipeline/calendar')}
            refreshKey={`${(workspaceSnapshot?.appointments || []).length}:${agent?.id || agent?.email || ''}`}
          />

          <WorkspaceCard title="Recent Activity">
            {recentActivity.length ? (
              <div className="space-y-2">
                {recentActivity.map((item) => (
                  <div key={item.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-[#e4ebf5] bg-[#fbfcfe] px-4 py-3">
                    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
                      {createElement(item.icon, { size: 16 })}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#10243a]">{item.label}</p>
                      <p className="truncate text-xs text-[#60758d]">{item.record}</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-[#6f839a]">{formatDateTime(item.timestamp)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#647a92]">
                No recent activity has been logged for this agent.
              </div>
            )}
          </WorkspaceCard>
        </section>
      ) : null}

      {effectiveActiveTab === 'deals' ? (
        <PrincipalAgentTabShell title="Deals" description="Active, closed and lost deals assigned to this agent." actionLabel="Assign Deal" onAction={() => openPlaceholder('assign-deal')}>
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-4">
            {[{ title: 'Active Deals', rows: activeDeals }, { title: 'Closed Deals', rows: completedDeals }, { title: 'Cancelled / Lost', rows: cancelledDeals }].map((group) => (
              <article key={group.title} className="min-w-0 rounded-xl border border-[#e4ebf5] bg-[#fbfcfe] p-4">
                <h3 className="truncate text-sm font-semibold text-[#10243a]">{group.title}</h3>
                <div className="mt-3 space-y-2">
                  {group.rows.length ? group.rows.map((row) => (
                    <div key={row.transaction.id} className="min-w-0 rounded-xl border border-[#e4ebf5] bg-white px-3 py-2">
                      <p className="truncate text-sm font-semibold text-[#1f3448]">{row.buyer?.name || row.seller?.name || 'Client pending'}</p>
                      <p className="mt-1 truncate text-xs text-[#60758d]">{row.development?.name || 'Private'} • {row.unit?.unit_number || '-'} • {formatCurrency(row.transaction?.sales_price || row.transaction?.purchase_price)}</p>
                    </div>
                  )) : <p className="text-sm text-[#60758d]">No deals in this segment.</p>}
                </div>
              </article>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-[#e4ebf5] bg-[#fbfcfe] p-4">
            <h3 className="text-sm font-semibold text-[#10243a]">Deal Documents</h3>
            <p className="mt-1 text-sm text-[#61778f]">Deal-linked documents will appear inside each deal workspace when connected.</p>
          </div>
        </PrincipalAgentTabShell>
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

      {effectiveActiveTab === 'clients' ? (
        <PrincipalAgentTabShell title="Clients" description="Buyer and seller client activity connected to this agent.">
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <AgentMetricCard label="Active Clients" value={activeClientCount} helper="Pipeline leads and active deals" />
            <AgentMetricCard label="Pipeline Leads" value={agent.pipelineRows?.length || 0} helper="Assigned lead rows" />
            <AgentMetricCard label="Active Buyers / Sellers" value={getNumericMetric(agent, 'activeDeals')} helper="From deal workspaces" />
            <AgentMetricCard label="Follow-ups Due" value={getNumericMetric(agent, 'followUpsDue')} helper="Open lead tasks" />
          </div>
        </PrincipalAgentTabShell>
      ) : null}

      {effectiveActiveTab === 'performance' ? (
        <PrincipalAgentTabShell title="Performance" description="Operational performance indicators for this agent.">
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <AgentMetricCard label="Pipeline Value" value={formatCurrency(getNumericMetric(agent, 'pipelineValue'))} helper="Open pipeline" />
            <AgentMetricCard label="Sales Value" value={formatCurrency(getNumericMetric(agent, 'totalSalesValue'))} helper="Completed deals" />
            <AgentMetricCard label="Conversion Rate" value={conversionRate} helper="Registered / all deals" />
            <AgentMetricCard label="Average Deal Time" value={getNumericMetric(agent, 'averageDealTime') ? `${getNumericMetric(agent, 'averageDealTime')} days` : '—'} helper="Cycle time" />
            <AgentMetricCard label="Monthly Activity" value={recentActivity.length} helper="Recent updates" />
            <AgentMetricCard label="Listings to Deals" value={`${allListings.length}:${agent.deals.length}`} helper="Stock conversion" />
            <AgentMetricCard label="Commission Earned" value={formatCurrency(getNumericMetric(agent, 'commissionEarned'))} helper="Estimated" />
            <AgentMetricCard label="Follow-ups Due" value={getNumericMetric(agent, 'followUpsDue')} helper="Lead tasks" />
          </div>
        </PrincipalAgentTabShell>
      ) : null}

      {effectiveActiveTab === 'calendar' ? (
        <PrincipalAgentTabShell title="Calendar" description="Upcoming and historical appointments scoped to this agent.">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AgentMetricCard label="Upcoming Appointments" value={commandCentre?.calendarSummary?.upcomingItems?.length || 0} helper="Scheduled ahead" />
            <AgentMetricCard label="Past Appointments" value={commandCentre?.calendarSummary?.pastItems?.length || 0} helper="History" />
            <AgentMetricCard label="Viewings" value={commandCentre?.calendarSummary?.nextSevenDayCounts?.find((item) => item.key === 'viewings')?.count || 0} helper="Next 7 days" />
            <AgentMetricCard label="Valuations" value={commandCentre?.calendarSummary?.nextSevenDayCounts?.find((item) => item.key === 'valuations')?.count || 0} helper="Next 7 days" />
          </div>

          <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-2">
            <WorkspaceCard title="Upcoming Appointments">
              {(commandCentre?.calendarSummary?.upcomingItems || []).length ? (
                <div className="space-y-2">
                  {commandCentre.calendarSummary.upcomingItems.map((item) => (
                    <div key={item.id} className="rounded-xl border border-[#e4ebf5] bg-[#fbfcfe] px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#10243a]">{item.title}</p>
                        <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${getAppointmentStatusClass(item.status)}`}>{item.statusLabel}</span>
                      </div>
                      <p className="mt-1 text-sm text-[#60758d]">{formatDate(item.dateTime)} at {formatTime(item.dateTime)}</p>
                      <p className="mt-1 text-xs text-[#6f839a]">
                        {[item.type, item.relatedLabel, item.location || item.meetingUrl].filter(Boolean).join(' • ') || 'Details pending'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#647a92]">
                  No appointments scheduled.
                </div>
              )}
            </WorkspaceCard>

            <WorkspaceCard title="Past Appointments">
              {(commandCentre?.calendarSummary?.pastItems || []).length ? (
                <div className="space-y-2">
                  {commandCentre.calendarSummary.pastItems.slice(0, 10).map((item) => (
                    <div key={item.id} className="rounded-xl border border-[#e4ebf5] bg-[#fbfcfe] px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#10243a]">{item.title}</p>
                        <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${getAppointmentStatusClass(item.status)}`}>{item.statusLabel}</span>
                      </div>
                      <p className="mt-1 text-sm text-[#60758d]">{formatDate(item.dateTime)} at {formatTime(item.dateTime)}</p>
                      <p className="mt-1 text-xs text-[#6f839a]">
                        {[item.type, item.relatedLabel, item.location || item.meetingUrl].filter(Boolean).join(' • ') || 'Details pending'}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#647a92]">
                  No appointment history is available yet.
                </div>
              )}
            </WorkspaceCard>
          </div>
        </PrincipalAgentTabShell>
      ) : null}

      {effectiveActiveTab === 'settings' ? (
        <PrincipalAgentTabShell title="Settings" description="Profile, permissions, commission structure, notifications and account controls.">
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
            <AgentManagementCard title="Profile" actionLabel="Edit" onAction={() => openPlaceholder('profile')}>
              <div className="space-y-1">
                {contactRows.map(([label, value]) => (
                  <DetailInfoRow key={label} label={label} value={value} />
                ))}
              </div>
            </AgentManagementCard>

            <AgentManagementCard title="Permissions" actionLabel="Manage" onAction={() => openPlaceholder('permissions')}>
              <div className="space-y-1">
                {permissionRows.map(([label, value]) => (
                  <DetailInfoRow key={label} label={label} value={value} />
                ))}
              </div>
            </AgentManagementCard>

            <AgentManagementCard title="Commission Structure" actionLabel="Manage" onAction={() => openPlaceholder('commission')}>
              <div className="space-y-1">
                {commissionPlanRows.map(([label, value]) => (
                  <DetailInfoRow key={label} label={label} value={value} />
                ))}
              </div>
            </AgentManagementCard>

            <AgentManagementCard title="Notification Settings">
              <DetailInfoRow label="Email Alerts" value={agent.email ? 'Enabled via user profile' : 'No email on profile'} />
              <DetailInfoRow label="Mobile Alerts" value={agent.phone ? 'Enabled via user profile' : 'No mobile number on profile'} />
              <DetailInfoRow label="Last Login" value={formatDateTime(agent.lastActiveAt)} />
              <button type="button" className="mt-3 truncate rounded-xl border border-[#d9e3ef] bg-white px-4 py-2 text-left text-sm font-semibold text-[#20364d]" onClick={() => openPlaceholder('notification-preferences')}>Notification preferences</button>
            </AgentManagementCard>

            <AgentManagementCard title="Account Settings">
              <DetailInfoRow label="Status" value={getAgentStatusMeta(agent).label} />
              <DetailInfoRow label="Role" value={formatRoleLabel(agent.role)} />
              <DetailInfoRow label="Branch" value={branchName} />
              <DetailInfoRow label="Invite Sent" value={formatDateTime(agent.invitedAt)} />
              <DetailInfoRow label="Activated" value={formatDateTime(agent.activatedAt)} />
              <div className="mt-4 grid gap-2">
                <button type="button" className="truncate rounded-xl border border-[#d9e3ef] bg-white px-4 py-2 text-left text-sm font-semibold text-[#20364d]" onClick={() => setActiveTab('calendar')}>Open calendar view</button>
                <button type="button" className="truncate rounded-xl border border-[#f2c9c5] bg-[#fff8f7] px-4 py-2 text-left text-sm font-semibold text-[#b42318]" onClick={() => setPendingAction('deactivate')}>Deactivate agent</button>
                <button type="button" className="truncate rounded-xl border border-[#f2c9c5] bg-[#fff8f7] px-4 py-2 text-left text-sm font-semibold text-[#b42318]" onClick={() => setPendingAction('remove')}>Remove agent</button>
              </div>
            </AgentManagementCard>

            <AgentManagementCard title="Team & Allocation">
              <div className="space-y-1">
                {teamAllocationRows.map(([label, value]) => (
                  <DetailInfoRow key={label} label={label} value={value} />
                ))}
              </div>
            </AgentManagementCard>

            <AgentManagementCard title="Administrative Controls">
              <div className="grid gap-2">
                <button type="button" className="truncate rounded-xl border border-[#d9e3ef] bg-white px-4 py-2 text-left text-sm font-semibold text-[#20364d]" onClick={() => openPlaceholder('team')}>Manage team allocation</button>
                <button type="button" className="truncate rounded-xl border border-[#d9e3ef] bg-white px-4 py-2 text-left text-sm font-semibold text-[#20364d]" onClick={() => openPlaceholder('profile')}>Edit profile and branch</button>
                <button type="button" className="truncate rounded-xl border border-[#d9e3ef] bg-white px-4 py-2 text-left text-sm font-semibold text-[#20364d]" onClick={() => openPlaceholder('notification-preferences')}>Notification preferences</button>
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
        subtitle={
          modalMode === 'commission'
            ? 'Assign a commission structure, optional split override and effective date for this agent.'
            : modalMode === 'permissions'
              ? 'Update the agent role and review the workspace access it grants.'
            : 'This management surface is ready for the connected workflow.'
        }
        className={modalMode === 'commission' || modalMode === 'permissions' ? 'max-w-2xl' : 'max-w-xl'}
        footer={
          modalMode === 'commission' ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setModalMode('')} disabled={commissionSaving}>Cancel</Button>
              <Button
                type="button"
                onClick={handleSaveCommissionAssignment}
                disabled={!canManageSettings || commissionSaving || !activeCommissionStructures.length}
              >
                {commissionSaving ? 'Saving…' : 'Save Commission'}
              </Button>
            </div>
          ) : modalMode === 'permissions' ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setModalMode('')} disabled={permissionsSaving}>Cancel</Button>
              <Button
                type="button"
                onClick={handleSavePermissionsAssignment}
                disabled={!canManageSettings || permissionsSaving || !agent.organisationUserId}
              >
                {permissionsSaving ? 'Saving…' : 'Save Permissions'}
              </Button>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button type="button" variant="secondary" onClick={() => setModalMode('')}>Close</Button>
            </div>
          )
        }
      >
        {modalMode === 'commission' ? (
          <div className="space-y-4">
            {commissionError ? (
              <div className="rounded-xl border border-[#f2d7d7] bg-[#fff6f6] px-4 py-3 text-sm font-semibold text-[#b42318]">
                {commissionError}
              </div>
            ) : null}

            {!activeCommissionStructures.length ? (
              <div className="rounded-2xl border border-[#e3ebf5] bg-[#fbfcfe] p-5">
                <h3 className="text-base font-semibold text-[#10243a]">No active commission structures</h3>
                <p className="mt-2 text-sm leading-6 text-[#60758d]">
                  Create at least one active commission structure before assigning a plan to this agent.
                </p>
                <Button type="button" variant="secondary" className="mt-4" onClick={() => navigate('/settings/commission-structures')}>
                  Open Commission Settings
                </Button>
              </div>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 sm:col-span-2">
                    <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6f839a]">Commission Structure</span>
                    <Field
                      as="select"
                      value={commissionForm.commissionStructureId}
                      disabled={!canManageSettings || commissionSaving}
                      onChange={(event) => updateCommissionForm('commissionStructureId', event.target.value)}
                    >
                      <option value="">
                        {defaultCommissionStructure ? `Use default (${defaultCommissionStructure.name})` : 'Use default / unassigned'}
                      </option>
                      {activeCommissionStructures.map((structure) => (
                        <option key={structure.id} value={structure.id}>
                          {structure.name} ({formatPercent(structure.agentSplitPercentage)} agent / {formatPercent(structure.agencySplitPercentage)} agency)
                        </option>
                      ))}
                    </Field>
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6f839a]">Override Agent Split %</span>
                    <Field
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={commissionForm.overrideAgentSplitPercentage}
                      disabled={!canManageSettings || commissionSaving}
                      onChange={(event) => updateCommissionForm('overrideAgentSplitPercentage', event.target.value)}
                      placeholder={selectedCommissionStructure ? String(selectedCommissionStructure.agentSplitPercentage) : '70'}
                    />
                  </label>

                  <label className="grid gap-1.5">
                    <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6f839a]">Effective From</span>
                    <Field
                      type="date"
                      value={commissionForm.effectiveFrom}
                      disabled={!canManageSettings || commissionSaving}
                      onChange={(event) => updateCommissionForm('effectiveFrom', event.target.value)}
                    />
                  </label>
                </div>

                <div className="rounded-2xl border border-[#dfe8f2] bg-[#fbfcfe] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#10243a]">
                        {selectedCommissionStructure?.name || 'Default / unassigned'}
                      </p>
                      <p className="mt-1 text-xs font-medium text-[#6f839a]">
                        {commissionForm.commissionStructureId ? 'Explicit assignment' : selectedCommissionStructure ? 'Using agency default' : 'No structure selected'}
                      </p>
                    </div>
                    {selectedCommissionStructure?.isDefault ? (
                      <span className="rounded-full border border-[#d7e6f7] bg-[#eef6ff] px-3 py-1 text-xs font-semibold text-[#1769d1]">
                        Default
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <AgentMetricCard
                      label="Agent Split"
                      value={selectedCommissionStructure ? formatPercent(commissionForm.overrideAgentSplitPercentage || selectedCommissionStructure.agentSplitPercentage) : '—'}
                      helper={commissionForm.overrideAgentSplitPercentage ? 'Override' : 'Structure'}
                    />
                    <AgentMetricCard
                      label="Agency Split"
                      value={
                        selectedCommissionStructure
                          ? formatPercent(100 - Number(commissionForm.overrideAgentSplitPercentage || selectedCommissionStructure.agentSplitPercentage))
                          : '—'
                      }
                      helper="Calculated"
                    />
                    <AgentMetricCard
                      label="Assigned Agents"
                      value={selectedCommissionStructure?.assignedAgentsCount ?? '—'}
                      helper="Current plan"
                    />
                    <AgentMetricCard
                      label="Status"
                      value={selectedCommissionStructure ? (selectedCommissionStructure.isActive ? 'Active' : 'Inactive') : '—'}
                      helper={commissionForm.effectiveFrom ? `From ${formatDate(commissionForm.effectiveFrom)}` : ''}
                    />
                  </div>
                </div>

                {!canManageSettings ? (
                  <div className="rounded-xl border border-[#f0dfc2] bg-[#fffbf3] px-4 py-3 text-sm font-medium text-[#7a5a16]">
                    You can view this assignment, but only Principal-level users can change commission profiles.
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : modalMode === 'permissions' ? (
          <div className="space-y-4">
            {permissionsError ? (
              <div className="rounded-xl border border-[#f2d7d7] bg-[#fff6f6] px-4 py-3 text-sm font-semibold text-[#b42318]">
                {permissionsError}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6f839a]">Workspace Role</span>
                <Field
                  as="select"
                  value={permissionsForm.role}
                  disabled={!canManageSettings || permissionsSaving || !agent.organisationUserId}
                  onChange={(event) => setPermissionsForm((previous) => ({ ...previous, role: event.target.value }))}
                >
                  {ORGANISATION_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Field>
              </label>

              <div className="rounded-2xl border border-[#dfe8f2] bg-[#fbfcfe] p-4">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#6f839a]">Current Branch</p>
                <p className="mt-2 truncate text-sm font-semibold text-[#10243a]">{agent.office || '—'}</p>
                <p className="mt-1 text-xs font-medium text-[#6f839a]">
                  {agent.branchId ? `Branch ID: ${agent.branchId}` : 'No branch id on this user row'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#dfe8f2] bg-[#fbfcfe] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#10243a]">Access Preview</p>
                  <p className="mt-1 text-xs font-medium text-[#6f839a]">
                    These permissions are derived from the selected role and current branch allocation.
                  </p>
                </div>
                <span className="rounded-full border border-[#dbe6f2] bg-white px-3 py-1 text-xs font-semibold text-[#405870]">
                  {formatRoleLabel(permissionsForm.role)}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ['Workspace Access', draftRoleAccessSummary.workspaceAccess],
                  ['Branch Access', agent.office || draftRoleAccessSummary.branchAccess],
                  ['Listings', draftRoleAccessSummary.listings],
                  ['Deals', draftRoleAccessSummary.deals],
                  ['Clients', draftRoleAccessSummary.clients],
                  ['Reports', draftRoleAccessSummary.reports],
                  ['Agency Settings', draftRoleAccessSummary.agencySettings],
                  ['Commission Visibility', draftRoleAccessSummary.commissionVisibility],
                ].map(([label, value]) => (
                  <div key={label} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-[#e6edf5] bg-white px-3 py-2.5">
                    <span className="min-w-0 truncate text-xs font-semibold text-[#6f839a]">{label}</span>
                    <span className="min-w-0 truncate text-right text-sm font-semibold text-[#20364d]" title={value}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[#f0dfc2] bg-[#fffbf3] px-4 py-3 text-sm leading-6 text-[#7a5a16]">
              Branch reassignment and per-user visibility overrides are not connected to an editable agent-workspace API yet. This modal saves the role now and shows the access granted by that role.
            </div>

            {!canManageSettings ? (
              <div className="rounded-xl border border-[#f0dfc2] bg-[#fffbf3] px-4 py-3 text-sm font-medium text-[#7a5a16]">
                You can view this access profile, but only Principal-level users can change roles.
              </div>
            ) : null}

            {!agent.organisationUserId ? (
              <div className="rounded-xl border border-[#f2d7d7] bg-[#fff6f6] px-4 py-3 text-sm font-semibold text-[#b42318]">
                This agent is not linked to an organisation user row, so role changes cannot be saved here.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#dfe7f1] bg-[#fbfcfe] p-4 text-sm leading-6 text-[#526981]">
            <p>This action is intentionally staged as a safe management placeholder for now. It will connect to the existing workflow once the backing service is ready.</p>
          </div>
        )}
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
  const dateRange = 'last_30_days'
  const [leaderboardMetric, setLeaderboardMetric] = useState('pipelineValue')
  const officeFilter = 'all'
  const [organisationFilter, setOrganisationFilter] = useState(EMPTY_ORGANISATION.id)
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('pipeline')
  const [searchTerm, setSearchTerm] = useState('')
  const [agentDirectoryView, setAgentDirectoryView] = useState('table')
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
      const legacyInvites = readAgentInvites()
      const localPrivateListings = readLocalRows(PRIVATE_LISTINGS_STORAGE_KEY)
      const localPipelineRows = readLocalRows(PIPELINE_STORAGE_KEY)
      const [performanceSources, commissionStructureRows, canonicalInvites] = await Promise.all([
        loadAgentPerformanceSources({
          canManageDirectory,
          profile,
          role,
          directory,
          localPrivateListings,
          localPipelineRows,
        }),
        canManageDirectory ? listOrganisationCommissionStructures().catch(() => []) : Promise.resolve([]),
        canManageDirectory ? listWorkspaceUserInvites({ includeInactive: false }).catch((inviteError) => {
          console.warn('[Agents] canonical invites unavailable', inviteError)
          return []
        }) : Promise.resolve([]),
      ])
      const invites = [...legacyInvites, ...(Array.isArray(canonicalInvites) ? canonicalInvites : [])]
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
      let mergedAgents = mergeAgentRows(mappedAgents, organisationAgentRows)
      const existingActiveEmails = new Set(
        mergedAgents
          .filter((agent) => String(agent?.status || '').trim().toLowerCase() === AGENT_INVITE_STATUS.ACTIVE)
          .map((agent) => normalizeIdentityEmail(agent.email))
          .filter(Boolean),
      )
      const pendingInviteAgentRows = invites
        .filter((invite) => normalizeAgentDirectoryStatus(invite?.status) === AGENT_INVITE_STATUS.PENDING_INVITE)
        .filter((invite) => {
          const email = normalizeIdentityEmail(invite?.email)
          return email && !existingActiveEmails.has(email)
        })
        .map((invite) => normalizeInviteAgentRow(invite, {
          organisationId: performanceSources.organisationSettings?.organisation?.id || directory?.agency?.id,
          organisationName: performanceSources.organisationSettings?.organisation?.name || directory?.agency?.name,
        }))
        .filter(Boolean)
      mergedAgents = mergeAgentRows(mergedAgents, pendingInviteAgentRows)
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

  const roleOptions = useMemo(() => {
    const items = [...new Set(agents.map((agent) => String(agent.role || 'agent').trim().toLowerCase()).filter(Boolean))]
    return ['all', ...items]
  }, [agents])

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

  const invitedAgentRows = useMemo(() => {
    const selectedOrganisationId = organisationFilter === EMPTY_ORGANISATION.id
      ? String(agentDirectory?.agency?.id || '').trim().toLowerCase()
      : String(organisationFilter || '').trim().toLowerCase()
    const selectedBranchId = String(branchFilter || 'all').trim().toLowerCase()
    const selectedOffice = String(officeFilter || 'all').trim().toLowerCase()
    const selectedRole = String(roleFilter || 'all').trim().toLowerCase()
    const query = String(searchTerm || '').trim().toLowerCase()

    return agents
      .filter((agent) => normalizeAgentDirectoryStatus(agent?.status) === AGENT_INVITE_STATUS.PENDING_INVITE || agent?.isPendingInvite)
      .filter((agent) => {
        const agentOrganisationId = String(agent?.organisationId || '').trim().toLowerCase()
        if (selectedOrganisationId && selectedOrganisationId !== 'all' && agentOrganisationId && agentOrganisationId !== selectedOrganisationId) return false

        const agentBranchId = String(agent?.branchId || '').trim().toLowerCase()
        const agentOffice = String(agent?.office || agent?.branchName || '').trim().toLowerCase()
        if (selectedBranchId !== 'all' && agentBranchId !== selectedBranchId && agentOffice !== selectedBranchId) return false
        if (selectedOffice !== 'all' && agentOffice !== selectedOffice) return false
        if (selectedRole !== 'all' && String(agent?.role || '').trim().toLowerCase() !== selectedRole) return false
        if (!query) return true
        return [
          agent?.name,
          agent?.email,
          agent?.phone,
          agent?.office,
          agent?.branchName,
          agent?.organisationName,
        ].some((value) => String(value || '').toLowerCase().includes(query))
      })
      .sort((left, right) => (new Date(right?.invitedAt || 0).getTime() || 0) - (new Date(left?.invitedAt || 0).getTime() || 0))
  }, [agentDirectory?.agency?.id, agents, branchFilter, officeFilter, organisationFilter, roleFilter, searchTerm])

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
      const selectedCommissionStructure =
        activeCommissionStructureOptions.find((structure) => structure.id === String(inviteForm.commissionStructureId || '').trim()) ||
        defaultCommissionStructure
      const created = await createWorkspaceUserInvite({
        firstName: inviteForm.firstName,
        lastName: inviteForm.surname,
        email: inviteForm.email,
        mobile: inviteForm.mobile,
        workspaceId: selectedOrganisation?.id || inviteForm.organisationId,
        organisationName: selectedOrganisation?.name || inviteForm.organisationName,
        branchId: selectedBranch?.id || '',
        branchName: selectedBranch?.name || inviteForm.office,
        commissionStructureId: selectedCommissionStructure?.id,
        commissionStructureName: selectedCommissionStructure?.name,
        role: inviteForm.role,
        notes: inviteForm.notes,
        invitedByName: profile?.fullName || profile?.name || profile?.email || '',
        source: 'agents_page_add_agent',
      })

      setActionMessage(created.reusedExistingInvite
        ? 'This agent already had a pending invite, so Bridge resent the existing onboarding link.'
        : 'Agent invite sent. The agent has been sent an onboarding link to verify and activate their Bridge profile.')
      setInviteSentContext({
        email: created.invite?.email || inviteForm.email.trim(),
        link: created.inviteLink || buildAgentInviteLink(created.invite?.token),
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

  async function handleCopyAgentInviteLink(agent) {
    const link = agent?.inviteLink || buildAgentInviteLink(agent?.inviteToken)
    if (!link) {
      setActionError('Invite link is not available for this row.')
      return
    }
    try {
      await navigator.clipboard.writeText(link)
      setActionError('')
      setActionMessage('Invite link copied.')
      setInviteSentContext({
        email: agent?.email || '',
        link,
      })
    } catch {
      setActionError('Unable to copy the invite link from this browser.')
    }
  }

  async function handleResendAgentInvite(agent) {
    if (!agent?.inviteId && !agent?.inviteToken) {
      setActionError('Invite details are missing for this row.')
      return
    }
    try {
      setActionError('')
      setActionMessage('')
      const result = agent.isCanonicalInvite
        ? await resendWorkspaceUserInvite(agent)
        : { inviteLink: await sendInviteNotifications(agent) }
      if (!agent.isCanonicalInvite && agent.inviteId) {
        markAgentInviteSent(agent.inviteId)
      }
      setActionMessage(`Invite resent to ${agent.email}.`)
      setInviteSentContext({
        email: agent.email || '',
        link: result.inviteLink || agent.inviteLink || buildAgentInviteLink(agent.inviteToken),
      })
      await loadData()
    } catch (resendError) {
      setActionError(resendError?.message || 'Unable to resend invite.')
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
        if (agent.isCanonicalInvite) {
          await revokeWorkspaceUserInvite(agent)
        } else {
          revokeAgentInvite(agent.inviteId)
        }
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

  const openAgentInviteModal = () => {
    setActionMessage('')
    setActionError('')
    setInviteSentContext({ email: '', link: '' })
    resetInviteForm()
    setInviteModalOpen(true)
  }

  const agentDirectoryViewToggle = (
    <div className="inline-flex rounded-xl border border-[#d9e3ef] bg-white p-1 shadow-sm">
      <button
        type="button"
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${agentDirectoryView === 'table' ? 'bg-[#0f2742] text-white shadow-sm' : 'text-[#60758d] hover:bg-[#f7fafc]'}`}
        onClick={() => setAgentDirectoryView('table')}
      >
        <List size={14} />
        Table
      </button>
      <button
        type="button"
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${agentDirectoryView === 'cards' ? 'bg-[#0f2742] text-white shadow-sm' : 'text-[#60758d] hover:bg-[#f7fafc]'}`}
        onClick={() => setAgentDirectoryView('cards')}
      >
        <Grid2X2 size={14} />
        Cards
      </button>
    </div>
  )

  const inviteAgentAction = canManageDirectory ? (
    <Button type="button" size="sm" onClick={openAgentInviteModal}>
      <Plus size={15} />
      Add Agent
    </Button>
  ) : null

  function handleExportAgentRows() {
    const header = ['Agent', 'Role', 'Branch', 'Pipeline Value', 'Active Transactions', 'Listings', 'Conversion', 'Last Activity']
    const rows = commandCentreModel.agentsTable.map((row) => {
      const performance = row.performance || {}
      return [
        row.name || '',
        formatRoleLabel(row.role),
        row.branchName || 'Current Office',
        Number(performance.pipelineValue || 0),
        Number(performance.activeTransactionCount ?? performance.activeTransactions ?? 0),
        Number(performance.activeListingCount ?? performance.listings ?? 0),
        performance.conversionRate === null || performance.conversionRate === undefined ? '' : `${Math.round(Number(performance.conversionRate))}%`,
        formatCompactActivity(performance.lastActivityAt).label,
      ]
    })
    const csv = [header, ...rows]
      .map((line) => line.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `agents-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="space-y-5">
      {canManageDirectory ? (
        <>
          <section className="rounded-2xl border border-[#dde6f1] bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <h1 className="text-[1.45rem] font-semibold tracking-[-0.035em] text-[#10243a]">All Agents</h1>
                <p className="mt-1 text-sm text-[#526981]">Manage agents across every branch in your visible scope.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
                <label className="min-w-0 sm:w-[320px]">
                  <span className="sr-only">Search agents</span>
                  <input
                    className="h-10 w-full rounded-xl border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] shadow-sm outline-none transition placeholder:text-[#9aaabd] focus:border-[#1f4f78] focus:ring-2 focus:ring-[#1f4f78]/10"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search agents by name, email, branch..."
                  />
                </label>
                <DirectorySelect
                  label="Branch / office"
                  value={branchFilter}
                  onChange={setBranchFilter}
                  options={commandCentreModel.filterOptions.branches.map((branch) => ({ value: branch.id, label: branch.name }))}
                />
                <DirectorySelect
                  label="Role"
                  value={roleFilter}
                  onChange={setRoleFilter}
                  options={roleOptions.map((item) => ({ value: item, label: item === 'all' ? 'All Roles' : formatRoleLabel(item) }))}
                />
                {agentDirectoryViewToggle}
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] shadow-sm transition hover:bg-[#f7fafc]"
                  onClick={handleExportAgentRows}
                >
                  <Download size={15} />
                  Export
                </button>
                {inviteAgentAction}
              </div>
            </div>
          </section>

          <PerformanceKpiStrip kpis={commandCentreModel.kpis} onAttentionClick={() => setStatusFilter('needs_attention')} />
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
          <InvitedAgentsPanel
            rows={invitedAgentRows}
            actionSlot={inviteAgentAction}
            onShowPending={() => setStatusFilter(AGENT_INVITE_STATUS.PENDING_INVITE)}
            onResendInvite={handleResendAgentInvite}
            onCopyInviteLink={handleCopyAgentInviteLink}
            onRevokeInvite={(agent) => openConfirm('revoke', agent)}
          />

          {commandCentreModel.agentsTable.length ? (
            agentDirectoryView === 'cards' ? (
              <AgentCommandCardGrid
                rows={commandCentreModel.agentsTable}
                canManage={canManageDirectory}
                onView={(agent) => navigate(`/agency/agents/${encodeURIComponent(agent.id)}`)}
                onDeactivate={(agent) => openConfirm('deactivate', agent)}
                onViewTransactions={(agent, stage) => navigate(`/transactions?agent=${encodeURIComponent(agent.id || agent.email || '')}${stage ? `&stage=${encodeURIComponent(stage)}` : ''}`)}
                onAssignLead={(agent) => navigate(`/pipeline/leads?assignAgent=${encodeURIComponent(agent.id || agent.email || '')}`)}
                onSendMessage={(agent) => {
                  if (agent?.email) window.location.href = `mailto:${agent.email}`
                }}
                onResendInvite={handleResendAgentInvite}
                onCopyInviteLink={handleCopyAgentInviteLink}
                onRevokeInvite={(agent) => openConfirm('revoke', agent)}
              />
            ) : (
              <AgentPerformanceTable
                rows={commandCentreModel.agentsTable}
                canManage={canManageDirectory}
                sortBy={sortBy}
                onSort={setSortBy}
                onView={(agent) => navigate(`/agency/agents/${encodeURIComponent(agent.id)}`)}
                onDeactivate={(agent) => openConfirm('deactivate', agent)}
                onViewTransactions={(agent, stage) => navigate(`/transactions?agent=${encodeURIComponent(agent.id || agent.email || '')}${stage ? `&stage=${encodeURIComponent(stage)}` : ''}`)}
                onAssignLead={(agent) => navigate(`/pipeline/leads?assignAgent=${encodeURIComponent(agent.id || agent.email || '')}`)}
                onSendMessage={(agent) => {
                  if (agent?.email) window.location.href = `mailto:${agent.email}`
                }}
                onResendInvite={handleResendAgentInvite}
                onCopyInviteLink={handleCopyAgentInviteLink}
                onRevokeInvite={(agent) => openConfirm('revoke', agent)}
              />
            )
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
  const [commissionStructures, setCommissionStructures] = useState([])
  const [workspaceSnapshot, setWorkspaceSnapshot] = useState({
    branches: [],
    leads: [],
    transactions: [],
    listings: [],
    appointments: [],
    tasks: [],
    leadActivities: [],
    canvassingProspects: [],
    canvassingActivities: [],
  })

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

      const [
        performanceSources,
        commissionStructureRows,
        commissionProfileRows,
      ] = await Promise.all([
        loadAgentPerformanceSources({
          canManageDirectory: canManageSettings,
          profile,
          role,
          directory: readAgentDirectory(),
          localPrivateListings: readLocalRows(PRIVATE_LISTINGS_STORAGE_KEY),
          localPipelineRows: readLocalRows(PIPELINE_STORAGE_KEY),
        }),
        canManageSettings ? listOrganisationCommissionStructures().catch(() => []) : Promise.resolve([]),
        canManageSettings ? listOrganisationUserCommissionProfiles().catch(() => []) : Promise.resolve([]),
      ])
      const nextCommissionStructures = Array.isArray(commissionStructureRows) ? commissionStructureRows : []
      const commissionProfileMap = createCommissionProfileMap(Array.isArray(commissionProfileRows) ? commissionProfileRows : [])
      setCommissionStructures(nextCommissionStructures)

      const agentDirectory = readAgentDirectory()
      const mappedAgents = computeAgentWorkspaceData({
        transactions: Array.isArray(performanceSources.transactions) ? performanceSources.transactions : [],
        privateListings: Array.isArray(performanceSources.listings) ? performanceSources.listings : [],
        pipelineRows: Array.isArray(performanceSources.leads) ? performanceSources.leads : [],
        appointments: Array.isArray(performanceSources.appointments) ? performanceSources.appointments : [],
        agentDirectory,
      })
      const organisationAgentRows = (performanceSources.organisationUsers || [])
        .map((user) => normalizeOrganisationUserAgent(user, {
          organisationId: performanceSources.organisationSettings?.organisation?.id || agentDirectory?.agency?.id,
          organisationName: performanceSources.organisationSettings?.organisation?.name || agentDirectory?.agency?.name,
        }))
        .map((row) => enrichAgentWithCommissionProfile(row, commissionProfileMap, nextCommissionStructures))
        .filter(Boolean)
      const mergedAgents = mergeAgentRows(mappedAgents, organisationAgentRows)
        .map((row) => enrichAgentWithCommissionProfile(row, commissionProfileMap, nextCommissionStructures))

      const target = findAgentByRouteId(mergedAgents, agentId)
      if (!target) {
        setError('Agent not found in your current workspace scope.')
        setAgent(null)
      } else {
        setAgent(target)
        setWorkspaceSnapshot({
          branches: performanceSources.branches || [],
          leads: performanceSources.leads || [],
          transactions: performanceSources.transactions || [],
          listings: performanceSources.listings || [],
          appointments: performanceSources.appointments || [],
          tasks: performanceSources.tasks || [],
          leadActivities: performanceSources.leadActivities || [],
          canvassingProspects: performanceSources.canvassingProspects || [],
          canvassingActivities: performanceSources.canvassingActivities || [],
        })
      }
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load agent workspace.')
      setAgent(null)
      setCommissionStructures([])
      setWorkspaceSnapshot({
        branches: [],
        leads: [],
        transactions: [],
        listings: [],
        appointments: [],
        tasks: [],
        leadActivities: [],
        canvassingProspects: [],
        canvassingActivities: [],
      })
    } finally {
      setLoading(false)
    }
  }, [agentId, canAccess, canManageSettings, profile, role])

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
      <AgentWorkspace
        agent={agent}
        canManageSettings={canManageSettings}
        commissionStructures={commissionStructures}
        workspaceSnapshot={workspaceSnapshot}
        onRefresh={loadWorkspace}
      />
    </section>
  )
}

export default AgentsPage
