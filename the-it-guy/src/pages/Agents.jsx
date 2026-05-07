import { Building2, Plus, Search, ShieldCheck, UserCircle2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import SectionHeader from '../components/ui/SectionHeader'
import { useWorkspace } from '../context/WorkspaceContext'
import { canAccessAgentsModule, canManageAgentOrganisations } from '../lib/roles'
import { fetchTransactionsByParticipantSummary, fetchTransactionsListSummary, saveTransaction } from '../lib/api'
import { invokeEdgeFunction, isSupabaseConfigured } from '../lib/supabaseClient'
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
  { key: 'overview', label: 'Overview' },
  { key: 'listings', label: 'Listings' },
  { key: 'deals', label: 'Deals' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'performance', label: 'Performance' },
  { key: 'documents', label: 'Documents' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'settings', label: 'Settings' },
]

const AGENT_WORKSPACE_PREVIEW_MODES = [
  { key: 'principal', label: 'Principal / Owner' },
  { key: 'branch_admin', label: 'Branch Admin' },
  { key: 'agent', label: 'Agent' },
]

const EMPTY_ORGANISATION = { id: 'all', name: 'All Organisations' }

const PIPELINE_STATUS_ORDER = [
  'New Lead',
  'Contacted',
  'Viewing Scheduled',
  'Interested',
  'Offer Pending',
  'Converted to Deal',
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
  const matched = AGENT_ROLE_OPTIONS.find((item) => item.value === normalized)
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
  const identifier = email || name.toLowerCase() || 'unassigned'

  return {
    id: identifier,
    name: name || 'Unassigned Agent',
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

function computeAgentWorkspaceData({ transactions, privateListings, pipelineRows, agentDirectory = null }) {
  const groupedByAgent = new Map()

  for (const row of transactions) {
    const identity = normalizeAgentIdentity(row)
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
    if (identity.id && !developmentAgentMap.has(developmentId)) {
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

  const agents = [...groupedByAgent.values()].map((agent) => {
    const agentPrivateListings = listingsByAgent.get(agent.id) || []
    const agentPipelineRows = pipelineByAgent.get(agent.id) || []

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

    const recentDeals = [...agent.deals]
      .sort((left, right) => new Date(right?.transaction?.updated_at || 0).getTime() - new Date(left?.transaction?.updated_at || 0).getTime())
      .slice(0, 4)

    return {
      ...agent,
      privateListings: agentPrivateListings,
      pipelineRows: agentPipelineRows,
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
    <div className="rounded-[16px] border border-[#dfe7f1] bg-[#fbfcfe] px-4 py-3">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</p>
      <p className="mt-2 text-[1.25rem] font-semibold tracking-[-0.02em] text-[#142132]">{value}</p>
      {helper ? <p className="mt-1 text-xs text-[#657a92]">{helper}</p> : null}
    </div>
  )
}

function AgentCard({ agent, onView }) {
  const statusKey = String(agent.status || '').trim().toLowerCase()
  const statusLabel = AGENT_STATUS_LABELS[statusKey] || agent.status || 'Active'
  const statusClassName = AGENT_STATUS_PILL_CLASS[statusKey] || AGENT_STATUS_PILL_CLASS[AGENT_INVITE_STATUS.ACTIVE]

  return (
    <article className="rounded-[20px] border border-[#dce5f0] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-full border border-[#d7e2ef] bg-[#f8fbff] text-[#30567a]">
            <UserCircle2 size={20} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[1.02rem] font-semibold text-[#142132]">{agent.name}</h3>
            <p className="truncate text-sm text-[#60758d]">{agent.office}</p>
          </div>
        </div>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusClassName}`}>
          {statusLabel}
        </span>
      </div>

      <div className="mt-3 space-y-1 text-xs text-[#61778f]">
        <p className="truncate">{agent.email || 'Email pending'}</p>
        <p>{agent.phone || 'Phone pending'}</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <AgentMetricCard label="Active Listings" value={agent.metrics.activeListings} />
        <AgentMetricCard label="Active Deals" value={agent.metrics.activeDeals} />
        <AgentMetricCard label="Pipeline" value={formatCurrency(agent.metrics.pipelineValue)} />
        <AgentMetricCard label="Registered" value={agent.metrics.registeredDeals} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-[#1f4f78]">Sales {formatCurrency(agent.metrics.totalSalesValue)}</p>
        <Button type="button" size="sm" variant="secondary" onClick={onView}>
          View Agent
        </Button>
      </div>
    </article>
  )
}

function AgentWorkspace({ agent, canManageSettings }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [previewMode, setPreviewMode] = useState(canManageSettings ? 'principal' : 'agent')

  useEffect(() => {
    if (!canManageSettings) {
      setPreviewMode('agent')
      return
    }
    setPreviewMode((previous) => (AGENT_WORKSPACE_PREVIEW_MODES.some((mode) => mode.key === previous) ? previous : 'principal'))
  }, [canManageSettings])

  const previewConfig = useMemo(() => {
    if (!canManageSettings || previewMode === 'agent') {
      return {
        label: 'Agent View',
        showSettings: false,
        showAssignListing: false,
        showAssignDeal: false,
        showEditAgent: false,
      }
    }

    if (previewMode === 'branch_admin') {
      return {
        label: 'Branch Admin View',
        showSettings: false,
        showAssignListing: true,
        showAssignDeal: true,
        showEditAgent: true,
      }
    }

    return {
      label: 'Principal / Owner View',
      showSettings: true,
      showAssignListing: true,
      showAssignDeal: true,
      showEditAgent: true,
    }
  }, [canManageSettings, previewMode])

  const allowedTabs = previewConfig.showSettings
    ? AGENT_WORKSPACE_TABS
    : AGENT_WORKSPACE_TABS.filter((tab) => tab.key !== 'settings')

  useEffect(() => {
    if (allowedTabs.some((tab) => tab.key === activeTab)) {
      return
    }
    setActiveTab('overview')
  }, [activeTab, allowedTabs])

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

  return (
    <section className="space-y-5">
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#d7e2ef] bg-[#f8fbff] text-[#2f5578]">
              <UserCircle2 size={24} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[1.45rem] font-semibold tracking-[-0.03em] text-[#142132]">{agent.name}</h1>
              <p className="text-sm text-[#60758d]">Agent • {agent.office}</p>
              <p className="mt-1 text-xs text-[#6b8098]">{agent.email || 'Email pending'} • {agent.phone || 'Phone pending'}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm">Message Agent</Button>
            {previewConfig.showAssignListing ? <Button type="button" variant="secondary" size="sm">Assign Listing</Button> : null}
            {previewConfig.showAssignDeal ? <Button type="button" variant="secondary" size="sm">Assign Deal</Button> : null}
            {previewConfig.showEditAgent ? <Button type="button" variant="accent" size="sm">Edit Agent</Button> : null}
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#dde8f3] bg-[#f7fbff] px-3 py-2">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#446583]">
            <ShieldCheck size={13} />
            {previewConfig.label}
          </div>
          {canManageSettings ? (
            <div className="inline-flex flex-wrap items-center gap-2">
              {AGENT_WORKSPACE_PREVIEW_MODES.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => setPreviewMode(mode.key)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    previewMode === mode.key
                      ? 'border-[#1f4f78] bg-[#1f4f78] text-white'
                      : 'border-[#cddae8] bg-white text-[#35546c] hover:border-[#b2c4d9]'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allowedTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'border-[#1f4f78] bg-[#1f4f78] text-white'
                  : 'border-[#d4deea] bg-[#f8fbff] text-[#35546c] hover:border-[#b9cadf]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' ? (
          <div className="mt-5 space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <AgentMetricCard label="Active Listings" value={agent.metrics.activeListings} />
              <AgentMetricCard label="Active Deals" value={agent.metrics.activeDeals} />
              <AgentMetricCard label="Pipeline Value" value={formatCurrency(agent.metrics.pipelineValue)} />
              <AgentMetricCard label="Registered Deals" value={agent.metrics.registeredDeals} />
              <AgentMetricCard label="Total Sales Value" value={formatCurrency(agent.metrics.totalSalesValue)} />
              <AgentMetricCard label="Commission Earned" value={formatCurrency(agent.metrics.commissionEarned)} />
              <AgentMetricCard label="Follow-ups Due" value={agent.metrics.followUpsDue} />
              <AgentMetricCard label="Average Deal Time" value={`${agent.metrics.averageDealTime} days`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4 lg:col-span-2">
                <h3 className="text-base font-semibold text-[#142132]">Current Priorities</h3>
                <ul className="mt-3 space-y-2 text-sm text-[#5d728a]">
                  <li>• Follow up on {agent.metrics.followUpsDue} open lead follow-ups.</li>
                  <li>• Progress {activeDeals.length} active deals toward registration milestones.</li>
                  <li>• Review seller document readiness on private mandates.</li>
                </ul>
              </article>
              <article className="rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
                <h3 className="text-base font-semibold text-[#142132]">Recent Activity</h3>
                <div className="mt-3 space-y-2">
                  {agent.recentDeals.length ? (
                    agent.recentDeals.map((row) => (
                      <div key={row.transaction.id} className="rounded-[12px] border border-[#e3ebf4] bg-white px-3 py-2">
                        <p className="text-sm font-semibold text-[#1f3448]">{row.buyer?.name || 'Buyer pending'}</p>
                        <p className="text-xs text-[#60758d]">{row.development?.name || 'Private'} • {row.unit?.unit_number || '-'}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[#60758d]">No recent activity yet.</p>
                  )}
                </div>
              </article>
            </div>
          </div>
        ) : null}

        {activeTab === 'listings' ? (
          <div className="mt-5 space-y-5">
            <article className="rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
              <h3 className="text-base font-semibold text-[#142132]">Development Listings</h3>
              <div className="mt-3 space-y-2">
                {developmentListings.length ? (
                  developmentListings.map((listing) => (
                    <div key={listing.id} className="grid gap-2 rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2 text-sm md:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))] md:items-center">
                      <span className="font-semibold text-[#1f3448]">{listing.title}</span>
                      <span>{listing.developmentName}</span>
                      <span>{formatCurrency(listing.price)}</span>
                      <span>{listing.status}</span>
                      <span>{formatDate(listing.listedAt)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#60758d]">No development listings linked yet.</p>
                )}
              </div>
            </article>

            <article className="rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
              <h3 className="text-base font-semibold text-[#142132]">Private Sales</h3>
              <div className="mt-3 space-y-2">
                {privateListings.length ? (
                  privateListings.map((listing) => (
                    <div key={listing.id} className="rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[#1f3448]">{listing.listingTitle}</p>
                        <span className="text-sm font-semibold text-[#1f4f78]">{formatCurrency(listing.askingPrice)}</span>
                      </div>
                      <p className="mt-1 text-xs text-[#60758d]">
                        {listing.suburb || 'Suburb pending'} • Mandate {listing.mandateType || 'sole'} • Seller onboarding {listing?.sellerOnboarding?.status || 'sent'}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#60758d]">No private sales captured yet.</p>
                )}
              </div>
            </article>
          </div>
        ) : null}

        {activeTab === 'deals' ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {[{ title: 'Active Deals', rows: activeDeals }, { title: 'Completed Deals', rows: completedDeals }, { title: 'Cancelled / Lost', rows: cancelledDeals }].map((group) => (
              <article key={group.title} className="rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
                <h3 className="text-base font-semibold text-[#142132]">{group.title}</h3>
                <div className="mt-3 space-y-2">
                  {group.rows.length ? (
                    group.rows.map((row) => (
                      <div key={row.transaction.id} className="rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2">
                        <p className="text-sm font-semibold text-[#1f3448]">{row.buyer?.name || 'Buyer pending'}</p>
                        <p className="mt-1 text-xs text-[#60758d]">
                          {row.development?.name || 'Private'} • {row.unit?.unit_number || '-'} • {row.transaction?.finance_type || 'cash'}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-[#60758d]">No deals in this segment.</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {activeTab === 'pipeline' ? (
          <div className="mt-5 rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
            <h3 className="text-base font-semibold text-[#142132]">Pipeline Activity</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {pipelineStageSummary.map((item) => (
                <div key={item.status} className="rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.08em] text-[#6b7f97]">{item.status}</p>
                  <p className="mt-1 text-[1.1rem] font-semibold text-[#16283c]">{item.count}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === 'performance' ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <AgentMetricCard label="Listings Captured" value={allListings.length} />
              <AgentMetricCard label="Deals Opened" value={agent.deals.length} />
              <AgentMetricCard label="Deals Registered" value={agent.metrics.registeredDeals} />
              <AgentMetricCard label="Conversion Rate" value={`${agent.deals.length ? Math.round((agent.metrics.registeredDeals / agent.deals.length) * 100) : 0}%`} />
              <AgentMetricCard label="Sales Value" value={formatCurrency(agent.metrics.totalSalesValue)} />
              <AgentMetricCard label="Commission" value={formatCurrency(agent.metrics.commissionEarned)} />
              <AgentMetricCard label="Average Time to Close" value={`${agent.metrics.averageDealTime} days`} />
              <AgentMetricCard label="Pipeline Conversion" value={`${agent.pipelineRows.length ? Math.round((agent.metrics.activeDeals / Math.max(agent.pipelineRows.length, 1)) * 100) : 0}%`} />
            </div>
            <div className="rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4 text-sm text-[#5e748d]">
              Monthly performance and development/source breakdown charts can be expanded here using the same metric cards and chart blocks already used in dashboard reporting.
            </div>
          </div>
        ) : null}

        {activeTab === 'documents' ? (
          <div className="mt-5 rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
            <h3 className="text-base font-semibold text-[#142132]">Documents</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {['Agent FICA', 'Employment / Contractor Agreement', 'Mandates', 'Certificates', 'Compliance Documents', 'Other Documents'].map((name) => (
                <div key={name} className="rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2 text-sm text-[#2d445d]">
                  {name} <span className="ml-2 text-xs text-[#6c8098]">Requested</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === 'reviews' ? (
          <div className="mt-5 rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
            <h3 className="text-base font-semibold text-[#142132]">Reviews</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <article className="rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2">
                <p className="text-sm font-semibold text-[#1f3448]">Client Review</p>
                <p className="mt-1 text-xs text-[#60758d]">Excellent communication and fast follow-up during OTP stage.</p>
              </article>
              {previewMode !== 'agent' ? (
                <article className="rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2">
                  <p className="text-sm font-semibold text-[#1f3448]">Internal Principal Note</p>
                  <p className="mt-1 text-xs text-[#60758d]">Strong pipeline quality this month. Focus on faster document turnarounds.</p>
                </article>
              ) : null}
            </div>
          </div>
        ) : null}

        {activeTab === 'settings' && previewConfig.showSettings ? (
          <div className="mt-5 rounded-[18px] border border-[#dce5f0] bg-[#fbfcfe] p-4">
            <h3 className="text-base font-semibold text-[#142132]">Settings</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {[
                'Assigned office / branch',
                'Role',
                'Status',
                'Permission level',
                'Commission setup',
                'Notification preferences',
                'Assigned developments',
              ].map((setting) => (
                <div key={setting} className="rounded-[12px] border border-[#e4ebf5] bg-white px-3 py-2 text-sm text-[#2d445d]">
                  {setting}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [inviteSentContext, setInviteSentContext] = useState({ email: '', link: '' })
  const [transactionRows, setTransactionRows] = useState([])
  const [officeFilter, setOfficeFilter] = useState('all')
  const [organisationFilter, setOrganisationFilter] = useState(EMPTY_ORGANISATION.id)
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

  const canAccess = canAccessAgentsModule({ role, baseRole, profile })
  const canManageDirectory = canManageAgentOrganisations({ role, baseRole, profile })

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

      const transactions = canManageDirectory
        ? await fetchTransactionsListSummary({ activeTransactionsOnly: false })
        : await fetchTransactionsByParticipantSummary({ userId: profile?.id, roleType: role })
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

      setAgents(mappedAgents)
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
  }, [canAccess, canManageDirectory, profile?.id, role])

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

  const filteredAgents = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return agents.filter((agent) => {
      const organisationMatch = organisationFilter === EMPTY_ORGANISATION.id
        ? true
        : String(agent?.organisationId || '').trim().toLowerCase() === organisationFilter
      const officeMatch = officeFilter === 'all' ? true : agent.office === officeFilter
      const searchMatch = query
        ? `${agent.name} ${agent.email} ${agent.office}`.toLowerCase().includes(query)
        : true
      return organisationMatch && officeMatch && searchMatch
    })
  }, [agents, officeFilter, organisationFilter, searchTerm])

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

    navigate('/deals')
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
      updateAgentRole({
        agentEmail: roleEditTarget.email,
        organisationId: roleEditTarget.organisationId,
        role: roleEditValue,
      })
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
        setAgentStatus({
          agentEmail: agent.email,
          organisationId: agent.organisationId,
          status: AGENT_INVITE_STATUS.REVOKED,
        })
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
        <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
          <SectionHeader
            title=""
            copy="Principal / Owner workspace. Manage organisations, agents, and transaction allocations."
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setOrganisationError('')
                    setOrganisationName('')
                    setOrganisationModalOpen(true)
                  }}
                >
                  <Building2 size={16} />
                  Create Organisation
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setActionMessage('')
                    setActionError('')
                    setInviteSentContext({ email: '', link: '' })
                    resetInviteForm()
                    setInviteModalOpen(true)
                  }}
                >
                  <Plus size={16} />
                  Add Agent
                </Button>
              </div>
            }
          />

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Organisation</span>
              <Field as="select" value={organisationFilter} onChange={(event) => setOrganisationFilter(event.target.value)}>
                {organisationFilterOptions.map((organisation) => (
                  <option key={organisation.id} value={organisation.id}>
                    {organisation.name}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Office</span>
              <Field as="select" value={officeFilter} onChange={(event) => setOfficeFilter(event.target.value)}>
                {officeOptions.map((office) => (
                  <option key={office} value={office}>
                    {office === 'all' ? 'All Offices' : office}
                  </option>
                ))}
              </Field>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Search Agent</span>
              <div className="ui-input flex items-center gap-2">
                <Search size={15} className="text-[#6f859d]" />
                <input
                  className="w-full border-0 bg-transparent p-0 text-sm text-[#142132] outline-none"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by name, email, or office"
                />
              </div>
            </label>
          </div>
        </section>
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
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredAgents.length ? (
              filteredAgents.map((agent) => (
                <AgentCard
                  key={`${agent.id}-${agent.organisationId || 'org'}`}
                  agent={agent}
                  onView={() => navigate(`/agents/${encodeURIComponent(agent.id)}`)}
                />
              ))
            ) : (
              <div className="rounded-[20px] border border-[#dde4ee] bg-white px-5 py-8 text-sm text-[#647a92]">
                No agents found for this filter.
              </div>
            )}
          </section>

          <section className="rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
            <h2 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Agents Registry</h2>
            <p className="mt-1.5 text-sm text-[#647a92]">Track invite status, role, organisation assignment, and activation progress.</p>

            <div className="mt-4 overflow-x-auto rounded-[16px] border border-[#e2eaf3]">
              <table className="min-w-[1120px] w-full text-left">
                <thead className="bg-[#f5f9fd] text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#70849d]">
                  <tr>
                    <th className="px-4 py-3">Agent</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Mobile</th>
                    <th className="px-4 py-3">Organisation</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date Invited</th>
                    <th className="px-4 py-3">Date Activated</th>
                    <th className="px-4 py-3">Last Active</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e8eef5] bg-white text-sm text-[#22384c]">
                  {filteredAgents.map((agent) => {
                    const statusKey = String(agent?.status || '').trim().toLowerCase()
                    const statusLabel = AGENT_STATUS_LABELS[statusKey] || agent?.status || 'Active'
                    const statusClassName = AGENT_STATUS_PILL_CLASS[statusKey] || AGENT_STATUS_PILL_CLASS[AGENT_INVITE_STATUS.ACTIVE]
                    return (
                      <tr key={`${agent.id}-${agent.organisationId || 'org'}-row`}>
                        <td className="px-4 py-3 font-semibold text-[#142132]">{agent.name || 'Agent'}</td>
                        <td className="px-4 py-3">{agent.email || '—'}</td>
                        <td className="px-4 py-3">{agent.phone || '—'}</td>
                        <td className="px-4 py-3">{agent.organisationName || 'Bridge Organisation'}</td>
                        <td className="px-4 py-3">{formatRoleLabel(agent.role)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusClassName}`}>
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#60758d]">{formatDateTime(agent.invitedAt)}</td>
                        <td className="px-4 py-3 text-xs text-[#60758d]">{formatDateTime(agent.activatedAt)}</td>
                        <td className="px-4 py-3 text-xs text-[#60758d]">{formatDateTime(agent.lastActiveAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {agent.inviteId ? (
                              <>
                                <Button type="button" size="sm" variant="secondary" onClick={() => handleResendInvite(agent)}>Resend Invite</Button>
                                <Button type="button" size="sm" variant="secondary" onClick={() => handleCopyInviteLink(agent)}>Copy Invite Link</Button>
                              </>
                            ) : null}
                            <Button type="button" size="sm" variant="secondary" onClick={() => openRoleEditor(agent)}>Edit Role</Button>
                            {statusKey !== AGENT_INVITE_STATUS.REVOKED ? (
                              <Button type="button" size="sm" variant="secondary" onClick={() => openConfirm('deactivate', agent)}>Deactivate Agent</Button>
                            ) : null}
                            {agent.inviteId && ![AGENT_INVITE_STATUS.ACTIVE, AGENT_INVITE_STATUS.REVOKED].includes(statusKey) ? (
                              <Button type="button" size="sm" variant="secondary" onClick={() => openConfirm('revoke', agent)}>Revoke Invite</Button>
                            ) : null}
                            <Button type="button" size="sm" variant="secondary" onClick={() => openConfirm('remove', agent)}>Remove</Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [agent, setAgent] = useState(null)

  const canAccess = canAccessAgentsModule({ role, baseRole, profile })
  const canManageSettings = canManageAgentOrganisations({ role, baseRole, profile })

  const loadWorkspace = useCallback(async () => {
    if (!canAccess) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')

      const transactions = canManageSettings
        ? await fetchTransactionsListSummary({ activeTransactionsOnly: false })
        : await fetchTransactionsByParticipantSummary({ userId: profile?.id, roleType: role })

      const privateListings = readLocalRows(PRIVATE_LISTINGS_STORAGE_KEY)
      const pipelineRows = readLocalRows(PIPELINE_STORAGE_KEY)
      const agentDirectory = readAgentDirectory()
      const mappedAgents = computeAgentWorkspaceData({
        transactions: Array.isArray(transactions) ? transactions : [],
        privateListings,
        pipelineRows,
        agentDirectory,
      })

      const target = mappedAgents.find((item) => item.id === String(agentId || '').trim().toLowerCase())
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
  }, [agentId, canAccess, canManageSettings, profile?.id, role])

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
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/agents')}>
          Back to Agents
        </Button>
        <div className="inline-flex items-center gap-2 text-xs text-[#647a92]">
          <ShieldCheck size={13} />
          {canManageSettings ? 'Principal Workspace' : 'Agent Workspace'}
        </div>
      </div>
      <AgentWorkspace agent={agent} canManageSettings={canManageSettings} />
    </section>
  )
}

export default AgentsPage
