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
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import { useWorkspace } from '../context/WorkspaceContext'
import { canAccessAgentsModule, canManageAgentOrganisations } from '../lib/roles'
import { fetchTransactionsByParticipantSummary, fetchTransactionsListSummary, saveTransaction } from '../lib/api'
import { listAppointmentsAsync } from '../lib/agencyPipelineService'
import { invokeEdgeFunction, isSupabaseConfigured } from '../lib/supabaseClient'
import { deactivateOrganisationUser, fetchOrganisationSettings, listOrganisationUsers, updateOrganisationUserRole } from '../lib/settingsApi'
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
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'principal', label: 'Principal / Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'branch_admin', label: 'Branch Admin / Manager' },
  { value: 'senior_agent', label: 'Senior Agent' },
  { value: 'agent', label: 'Agent' },
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

function formatRoleLabel(value) {
  const normalized = String(value || '').trim().toLowerCase()
  const matched = ORGANISATION_ROLE_OPTIONS.find((item) => item.value === normalized) || AGENT_ROLE_OPTIONS.find((item) => item.value === normalized)
  return matched?.label || 'Agent'
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
  showOrganisationSelect = false,
}) {
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
              <Field value={form.office} onChange={(event) => onChange('office', event.target.value)} placeholder="e.g. Sandton" />
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
    organisationId: String(agency?.id || profile?.agencyId || 'agency-default').trim().toLowerCase(),
    organisationName: String(agency?.name || profile?.agencyName || profile?.companyName || 'Bridge Organisation').trim(),
    office: '',
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
    office: user.branchName || (user.branchId ? 'Assigned Branch' : 'Head Office'),
    branchId: user.branchId || null,
    organisationId: normalizeAgentRecordId(context.organisationId || user.organisationId || 'agency-default'),
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

  if (!deduped.size) {
    register(profile?.agencyId || 'agency-default', profile?.agencyName || profile?.companyName || 'Bridge Organisation')
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
          <span className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-full border border-[#d7e2ef] bg-[linear-gradient(135deg,#f8fbff,#eaf2fb)] text-sm font-semibold text-[#244e70]">
            {getAgentInitials(agent)}
          </span>
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

function AgentDirectoryTable({ agents, onView, onEditRole, onDeactivate }) {
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
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#d7e2ef] bg-[#f8fbff] text-sm font-semibold text-[#245076]">
                      {getAgentInitials(agent)}
                    </span>
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
            <span className="relative inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-[#d7e2ef] bg-[linear-gradient(135deg,#f8fbff,#e7eef7)] text-2xl font-semibold text-[#2f5578]">
              {getAgentInitials(agent)}
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
  const { role, baseRole, profile } = useWorkspace()
  const [membershipRole, setMembershipRole] = useState('viewer')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [inviteSentContext, setInviteSentContext] = useState({ email: '', link: '' })
  const [transactionRows, setTransactionRows] = useState([])
  const [officeFilter, setOfficeFilter] = useState('all')
  const [organisationFilter, setOrganisationFilter] = useState(EMPTY_ORGANISATION.id)
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [viewMode, setViewMode] = useState('grid')
  const [sortBy, setSortBy] = useState('name')
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
  const [organisationModalOpen, setOrganisationModalOpen] = useState(false)
  const [organisationName, setOrganisationName] = useState('')
  const [organisationSubmitting, setOrganisationSubmitting] = useState(false)
  const [organisationError, setOrganisationError] = useState('')
  const [allocatingAgent, setAllocatingAgent] = useState(false)
  const [allocationError, setAllocationError] = useState('')
  const [inviteForm, setInviteForm] = useState(() => buildAgentInviteForm({ profile, directory: readAgentDirectory() }))

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
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')

      const [transactions, organisationSettings, organisationUsers] = await Promise.all([
        canManageDirectory
          ? fetchTransactionsListSummary({ activeTransactionsOnly: false })
          : fetchTransactionsByParticipantSummary({ userId: profile?.id, roleType: role }),
        fetchOrganisationSettings().catch(() => null),
        canManageDirectory ? listOrganisationUsers().catch(() => []) : Promise.resolve([]),
      ])
      const transactionRowsSource = Array.isArray(transactions) ? transactions : []

      const privateListings = readLocalRows(PRIVATE_LISTINGS_STORAGE_KEY)
      const pipelineRows = readLocalRows(PIPELINE_STORAGE_KEY)

      const directory = readAgentDirectory()
      const invites = readAgentInvites()
      const mapped = computeAgentWorkspaceData({
        transactions: transactionRowsSource,
        privateListings,
        pipelineRows,
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
        const organisationId = String(directoryMatch?.agencyId || directory?.agency?.id || 'agency-default').trim().toLowerCase()
        const inviteKey = `${normalizedEmail}::${organisationId}`
        const invite = inviteMap.get(inviteKey) || null
        const status = String(directoryMatch?.status || invite?.status || agent?.status || AGENT_INVITE_STATUS.ACTIVE).trim().toLowerCase()
        return {
          ...agent,
          email: directoryMatch?.email || agent?.email || '',
          phone: directoryMatch?.phone || agent?.phone || '',
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
      const organisationAgentRows = (organisationUsers || [])
        .map((user) => normalizeOrganisationUserAgent(user, {
          organisationId: organisationSettings?.organisation?.id || directory?.agency?.id,
          organisationName: organisationSettings?.organisation?.name || directory?.agency?.name,
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
          office: directory?.agency?.office || 'Head Office',
          organisationId: String(directory?.agency?.id || 'agency-default').trim().toLowerCase(),
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
      setAgentDirectory(directory)
      setAgentInvites(invites)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load agents.')
      setAgents([])
      setTransactionRows([])
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

  const officeOptions = useMemo(() => {
    const items = [...new Set(agents.map((agent) => agent.office).filter(Boolean))]
    return ['all', ...items]
  }, [agents])

  const roleOptions = useMemo(() => {
    const items = [...new Set(agents.map((agent) => String(agent.role || 'agent').trim().toLowerCase()).filter(Boolean))]
    return ['all', ...items]
  }, [agents])

  const statusOptions = useMemo(() => {
    const items = [...new Set(agents.map((agent) => String(agent.status || AGENT_INVITE_STATUS.ACTIVE).trim().toLowerCase()).filter(Boolean))]
    return ['all', ...items]
  }, [agents])

  const filteredAgents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const rows = agents.filter((agent) => {
      const organisationMatch = organisationFilter === EMPTY_ORGANISATION.id
        ? true
        : String(agent?.organisationId || '').trim().toLowerCase() === organisationFilter
      const officeMatch = officeFilter === 'all' ? true : agent.office === officeFilter
      const roleMatch = roleFilter === 'all' ? true : String(agent.role || '').trim().toLowerCase() === roleFilter
      const statusMatch = statusFilter === 'all' ? true : String(agent.status || '').trim().toLowerCase() === statusFilter
      const searchMatch = query
        ? `${agent.name} ${agent.email} ${agent.office} ${agent.organisationName} ${formatRoleLabel(agent.role)}`.toLowerCase().includes(query)
        : true
      return organisationMatch && officeMatch && roleMatch && statusMatch && searchMatch
    })
    return rows.sort((left, right) => {
      if (sortBy === 'pipeline') return getAgentPipelineValue(right) - getAgentPipelineValue(left)
      if (sortBy === 'active_deals') return Number(right?.metrics?.activeDeals || 0) - Number(left?.metrics?.activeDeals || 0)
      if (sortBy === 'recent') return (getAgentLastActivityDate(right)?.getTime() || 0) - (getAgentLastActivityDate(left)?.getTime() || 0)
      if (sortBy === 'status') return getAgentStatusMeta(left).label.localeCompare(getAgentStatusMeta(right).label)
      return String(left?.name || '').localeCompare(String(right?.name || ''))
    })
  }, [agents, officeFilter, organisationFilter, roleFilter, searchTerm, sortBy, statusFilter])

  const directorySummary = useMemo(() => {
    const activeAgents = agents.filter((agent) => getAgentStatusMeta(agent).key === AGENT_INVITE_STATUS.ACTIVE)
    const activeTodayRows = agents.filter((agent) => {
      const lastActivity = getAgentLastActivityDate(agent)
      if (!lastActivity) return false
      const today = new Date()
      return lastActivity.toDateString() === today.toDateString()
    })
    const activeToday = activeTodayRows.length || activeAgents.length
    const pipelineValue = agents.reduce((sum, agent) => sum + getAgentPipelineValue(agent), 0)
    const activeTransactions = agents.reduce((sum, agent) => sum + (Number(agent?.metrics?.activeDeals || 0) || 0), 0)
    return {
      totalAgents: agents.length,
      activeToday,
      activePercent: agents.length ? Math.round((activeToday / agents.length) * 100) : 0,
      pipelineValue,
      activeTransactions,
    }
  }, [agents])

  const topPerformers = useMemo(
    () => [...agents].sort((left, right) => getAgentPipelineValue(right) - getAgentPipelineValue(left)).slice(0, 5),
    [agents],
  )

  const recentAgents = useMemo(
    () => [...agents]
      .sort((left, right) => (getAgentLastActivityDate(right)?.getTime() || 0) - (getAgentLastActivityDate(left)?.getTime() || 0))
      .slice(0, 5),
    [agents],
  )

  const attentionAgents = useMemo(
    () => agents
      .filter((agent) => {
        const statusKey = getAgentStatusMeta(agent).key
        const lastActivity = getAgentLastActivityDate(agent)
        const daysSinceActivity = lastActivity ? (Date.now() - lastActivity.getTime()) / 86400000 : Infinity
        return (
          statusKey !== AGENT_INVITE_STATUS.ACTIVE ||
          Number(agent?.metrics?.activeListings || 0) <= 0 ||
          Number(agent?.metrics?.activeDeals || 0) <= 0 ||
          daysSinceActivity > 14
        )
      })
      .slice(0, 5),
    [agents],
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
        await invokeEdgeFunction('send-email', {
          body: {
            type: 'agent_invite',
            to: recipientEmail,
            agentName: `${invite?.firstName || ''} ${invite?.surname || ''}`.trim(),
            organisationName: invite?.organisationName || 'Bridge Organisation',
            onboardingLink: inviteLink,
          },
        })
      } catch (sendError) {
        console.error('[Agent Invite] email send failed', sendError)
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

    try {
      setInviteSubmitting(true)
      setInviteError('')
      setActionError('')

      const selectedOrganisation = organisationOptions.find((option) => option.id === String(inviteForm.organisationId || '').trim().toLowerCase())
      const created = createAgentInvite({
        firstName: inviteForm.firstName,
        surname: inviteForm.surname,
        email: inviteForm.email,
        mobile: inviteForm.mobile,
        organisationId: selectedOrganisation?.id || inviteForm.organisationId,
        organisationName: selectedOrganisation?.name || inviteForm.organisationName,
        office: inviteForm.office,
        role: inviteForm.role,
        notes: inviteForm.notes,
        invitedByUserId: profile?.id || '',
        invitedByEmail: profile?.email || '',
        invitedByName: profile?.fullName || profile?.name || profile?.email || '',
      })

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

  async function handleResendInvite(agent) {
    const inviteId = String(agent?.inviteId || '').trim()
    if (!inviteId) {
      setActionError('No invite record found for this agent.')
      return
    }

    try {
      setActionError('')
      const invites = readAgentInvites()
      const targetInvite = invites.find((invite) => String(invite?.id || '') === inviteId)
      if (!targetInvite) {
        throw new Error('Invite record not found.')
      }
      const sentInvite = markAgentInviteSent(inviteId)
      await sendInviteNotifications(sentInvite)
      setActionMessage(`Invite resent to ${targetInvite.email}.`)
      await loadData()
    } catch (resendError) {
      setActionError(resendError?.message || 'Unable to resend invite.')
    }
  }

  async function handleCopyInviteLink(agent) {
    const token = String(agent?.inviteToken || '').trim()
    if (!token) {
      setActionError('Invite link is not available for this agent.')
      return
    }

    const link = buildAgentInviteLink(token)
    try {
      await navigator.clipboard.writeText(link)
      setActionMessage('Invite link copied.')
      setActionError('')
    } catch {
      setActionError('Unable to copy invite link.')
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
    setConfirmDialog({ open: true, type, agent })
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
          <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-[1.65rem] font-semibold tracking-[-0.035em] text-[#0f2237]">Agents Directory</h1>
              <p className="mt-1 text-sm leading-6 text-[#667a92]">Browse and manage your agents across all branches and offices.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-xl border border-[#d9e3ef] bg-white p-1 shadow-sm">
                <button
                  type="button"
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${viewMode === 'grid' ? 'bg-[#1769d1] text-white shadow-sm' : 'text-[#60758d] hover:bg-[#f5f8fb]'}`}
                  aria-label="Grid view"
                  onClick={() => setViewMode('grid')}
                >
                  <Grid2X2 size={16} />
                </button>
                <button
                  type="button"
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition ${viewMode === 'list' ? 'bg-[#1769d1] text-white shadow-sm' : 'text-[#60758d] hover:bg-[#f5f8fb]'}`}
                  aria-label="List view"
                  onClick={() => setViewMode('list')}
                >
                  <List size={17} />
                </button>
              </div>
              <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-[#d9e3ef] bg-white px-3 shadow-sm">
                <span className="text-xs font-semibold text-[#60758d]">Sort by</span>
                <select
                  className="min-w-[150px] border-0 bg-transparent p-0 text-sm font-semibold text-[#24364b] outline-none"
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                >
                  <option value="name">Name A-Z</option>
                  <option value="pipeline">Pipeline value</option>
                  <option value="active_deals">Active deals</option>
                  <option value="recent">Recently active</option>
                  <option value="status">Status</option>
                </select>
              </label>
            </div>
          </section>

          <section className="flex flex-wrap items-center gap-2">
            <DirectorySelect
              label="All Branches"
              value={organisationFilter}
              onChange={setOrganisationFilter}
              options={organisationFilterOptions.map((organisation) => ({
                value: organisation.id,
                label: organisation.id === EMPTY_ORGANISATION.id ? 'All Branches' : organisation.name,
              }))}
            />
            <DirectorySelect
              label="All Offices"
              value={officeFilter}
              onChange={setOfficeFilter}
              options={officeOptions.map((office) => ({ value: office, label: office === 'all' ? 'All Offices' : office }))}
            />
            <DirectorySelect
              label="All Roles"
              value={roleFilter}
              onChange={setRoleFilter}
              options={roleOptions.map((item) => ({ value: item, label: item === 'all' ? 'All Roles' : formatRoleLabel(item) }))}
            />
            <DirectorySelect
              label="All Statuses"
              value={statusFilter}
              onChange={setStatusFilter}
              options={statusOptions.map((item) => ({
                value: item,
                label: item === 'all' ? 'All Statuses' : AGENT_STATUS_LABELS[item] || item,
              }))}
            />
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#d9e3ef] bg-white px-3 text-sm font-semibold text-[#24364b] shadow-sm transition hover:bg-[#f7fafc]"
              onClick={() => {
                setOrganisationFilter(EMPTY_ORGANISATION.id)
                setOfficeFilter('all')
                setRoleFilter('all')
                setStatusFilter('all')
                setSearchTerm('')
              }}
            >
              <SlidersHorizontal size={15} />
              Filters
            </button>
          </section>

          <AgentSummaryStrip summary={directorySummary} />
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
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            {filteredAgents.length ? (
              viewMode === 'grid' ? (
                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {filteredAgents.map((agent) => (
                    <AgentDirectoryCard
                      key={`${agent.id}-${agent.organisationId || 'org'}`}
                      agent={agent}
                      onView={() => navigate(`/agency/agents/${encodeURIComponent(agent.id)}`)}
                      onEditRole={() => openRoleEditor(agent)}
                      onDeactivate={() => openConfirm('deactivate', agent)}
                      onResendInvite={() => void handleResendInvite(agent)}
                      onCopyInviteLink={() => void handleCopyInviteLink(agent)}
                    />
                  ))}
                  <AddAgentDirectoryCard
                    onAddAgent={() => {
                      setActionMessage('')
                      setActionError('')
                      setInviteSentContext({ email: '', link: '' })
                      resetInviteForm()
                      setInviteModalOpen(true)
                    }}
                  />
                </section>
              ) : (
                <AgentDirectoryTable
                  agents={filteredAgents}
                  onView={(agent) => navigate(`/agency/agents/${encodeURIComponent(agent.id)}`)}
                  onEditRole={openRoleEditor}
                  onDeactivate={(agent) => openConfirm('deactivate', agent)}
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
          </div>

          <AgentInsightPanel
            topPerformers={topPerformers}
            recentAgents={recentAgents}
            attentionAgents={attentionAgents}
          />
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
            showOrganisationSelect={organisationOptions.length > 1}
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
