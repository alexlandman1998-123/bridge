import {
  ArrowLeft,
  ArrowRightLeft,
  Banknote,
  BarChart3,
  Building2,
  CalendarDays,
  Copy,
  ExternalLink,
  FileCheck2,
  Files,
  Mail,
  MapPin,
  Plus,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AddressAutocomplete from '../../components/location/AddressAutocomplete'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import InlineCommissionStructure from '../../components/commission/InlineCommissionStructure'
import {
  AGENT_ROLE_OPTIONS,
  buildAgentInviteLink,
} from '../../lib/agentInviteService'
import {
  fetchOrganisationSettings,
  listOrganisationCommissionStructures,
  listOrganisationPreferredPartners,
} from '../../lib/settingsApi'
import { upsertAreaFromAddress } from '../../lib/location/upsertArea'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { createWorkspaceUserInvite, resendWorkspaceUserInvite } from '../../services/workspaceUserInviteService'
import { getAgentLeaderboard } from '../../services/branchAnalyticsService'
import { getBranch, getBranches, getBranchListings, getBranchTransactions, updateBranch } from '../../services/agencyBranchService'
import { getBranchWorkspaceOverview } from '../../services/branchWorkspaceOverviewService'
import { buildBranchWorkspacePerformance } from '../../services/branchWorkspacePerformanceService'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'staff', label: 'Staff' },
  { key: 'listings', label: 'Listings' },
  { key: 'leads', label: 'Leads' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'performance', label: 'Performance' },
  { key: 'compliance', label: 'Compliance' },
  { key: 'settings', label: 'Settings' },
]

const BRANCH_AGENT_ROLE_VALUES = new Set([
  'agent',
  'assistant',
  'transaction_coordinator',
  'listing_coordinator',
  'admin_coordinator',
])

function normalizeText(value) {
  return String(value || '').trim()
}

function buildBranchAddressValue(branch = {}) {
  const formattedAddress = String(
    branch.formattedAddress ||
      [branch.address, branch.suburb, branch.city, branch.province].filter(Boolean).join(', '),
  ).trim()
  if (!formattedAddress) return null

  return {
    formattedAddress,
    streetAddress: String(branch.address || '').trim(),
    suburb: String(branch.suburb || '').trim(),
    city: String(branch.city || '').trim(),
    province: String(branch.province || '').trim(),
    country: String(branch.country || 'South Africa').trim(),
    postalCode: String(branch.postalCode || '').trim(),
    latitude: typeof branch.latitude === 'number' ? branch.latitude : Number(branch.latitude) || undefined,
    longitude: typeof branch.longitude === 'number' ? branch.longitude : Number(branch.longitude) || undefined,
    placeId: String(branch.googlePlaceId || '').trim(),
  }
}

function mergeBranchAddress(previous = {}, value = null) {
  if (!value) {
    return {
      ...previous,
      address: '',
      formattedAddress: '',
      suburb: '',
      city: '',
      province: '',
      country: 'South Africa',
      postalCode: '',
      latitude: null,
      longitude: null,
      googlePlaceId: '',
    }
  }

  return {
    ...previous,
    address: value.streetAddress || value.formattedAddress || '',
    formattedAddress: value.formattedAddress || '',
    suburb: value.suburb || '',
    city: value.city || '',
    province: value.province || '',
    country: value.country || 'South Africa',
    postalCode: value.postalCode || '',
    latitude: value.latitude ?? null,
    longitude: value.longitude ?? null,
    googlePlaceId: value.placeId || '',
  }
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function formatPercent(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric)) return '0%'
  return `${Math.round(numeric)}%`
}

function normalizeAgentInviteRole(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (['assistant', 'transaction_coordinator', 'listing_coordinator', 'admin_coordinator'].includes(normalized)) return normalized
  return 'agent'
}

function formatRoleLabel(value) {
  const normalized = normalizeText(value).toLowerCase()
  const matched = AGENT_ROLE_OPTIONS.find((option) => option.value === normalized)
  if (matched) return matched.label
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ') || 'Agent'
}

function getBranchAgentRoleOptions() {
  return AGENT_ROLE_OPTIONS.filter((option) => BRANCH_AGENT_ROLE_VALUES.has(option.value))
}

function formatDateShort(value) {
  if (!value) return 'No recent update'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No recent update'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function getInitials(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'BR'
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function KpiCard({ label, value, helper, icon, tone = 'blue' }) {
  const toneClass = {
    blue: 'bg-[#edf5ff] text-[#315f8f]',
    green: 'bg-[#effaf3] text-[#26724c]',
    gold: 'bg-[#fff7e8] text-[#8a641d]',
    slate: 'bg-[#f5f8fc] text-[#405b75]',
    navy: 'bg-[#edf2f6] text-[#163247]',
  }[tone] || 'bg-[#f5f8fc] text-[#405b75]'

  return (
    <article className="rounded-[18px] border border-[#dfe8f1] bg-white px-4 py-4 shadow-[0_10px_24px_rgba(24,45,68,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{label}</span>
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] ${toneClass}`}>
          {icon ? createElement(icon, { size: 14 }) : null}
        </span>
      </div>
      <strong className="mt-3 block text-[1.45rem] font-semibold leading-none tracking-[-0.04em] text-[#102236] tabular-nums">
        {value}
      </strong>
      <p className="mt-2 text-[0.78rem] font-medium leading-5 text-[#667b92]">{helper}</p>
    </article>
  )
}

function EmptyState({ title, copy, icon = Building2, action = null }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[#d6e2ef] bg-[#fbfdff] px-6 py-8 text-center">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-[16px] bg-[#edf4fb] text-[#35546c]">
        {createElement(icon, { size: 20 })}
      </div>
      <h4 className="mt-4 text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">{title}</h4>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#60758b]">{copy}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  )
}

function SectionTitle({ eyebrow, title, copy }) {
  return (
    <div>
      {eyebrow ? <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">{eyebrow}</p> : null}
      <h2 className="mt-1 text-[1.18rem] font-semibold tracking-[-0.03em] text-[#142132]">{title}</h2>
      {copy ? <p className="mt-1 text-sm leading-6 text-[#60758b]">{copy}</p> : null}
    </div>
  )
}

function SimpleTable({ columns, rows }) {
  return (
    <div className="overflow-x-auto rounded-[18px] border border-[#dfe8f1] bg-white">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-[#f7faff] text-left text-[0.68rem] uppercase tracking-[0.12em] text-[#6f839a]">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-4 py-3 font-semibold">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf2f7] bg-white text-[#223449]">
          {rows.map((row, index) => {
            const rowConfig = Array.isArray(row) ? { cells: row } : row
            const cells = rowConfig?.cells || []
            const clickable = typeof rowConfig?.onClick === 'function'
            return (
            <tr
              key={rowConfig?.key || `${index}-${cells.map((cell) => (typeof cell === 'string' || typeof cell === 'number' ? cell : cellIndexLabel(cell))).join('|')}`}
              className={`transition hover:bg-[#f8fbff] ${clickable ? 'cursor-pointer focus-within:bg-[#f8fbff]' : ''}`}
              onClick={rowConfig?.onClick}
              onKeyDown={(event) => {
                if (!clickable) return
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  rowConfig.onClick()
                }
              }}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
            >
              {cells.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3">{cell}</td>
              ))}
            </tr>
          )})}
        </tbody>
      </table>
    </div>
  )
}

function cellIndexLabel(cell) {
  if (cell == null) return ''
  if (typeof cell === 'string' || typeof cell === 'number') return String(cell)
  return 'cell'
}

function StatusPill({ children, tone = 'slate' }) {
  const className = {
    invited: 'border-[#e7ddf7] bg-[#f7f1ff] text-[#5c3a9d]',
    active: 'border-[#d7e7dd] bg-[#edf9f1] text-[#1d7d45]',
    slate: 'border-[#dce6f1] bg-[#f7f9fc] text-[#53677f]',
  }[tone] || 'border-[#dce6f1] bg-[#f7f9fc] text-[#53677f]'

  return (
    <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${className}`}>
      {children}
    </span>
  )
}

function ActionButton({ children, icon, variant = 'default', ...props }) {
  const Icon = icon
  const className = variant === 'danger'
    ? 'border-[#ead5d2] bg-[#fff8f8] text-[#8a3a33] hover:bg-[#fff3f1]'
    : 'border-[#dce6f1] bg-white text-[#263f58] hover:border-[#c7d6e5] hover:bg-[#f8fbff]'

  return (
    <button
      type="button"
      className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[14px] border px-3 text-sm font-semibold transition ${className}`}
      {...props}
    >
      {Icon ? <Icon size={15} /> : null}
      {children}
    </button>
  )
}

function BranchSettingsModal({ open, branch, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: '',
    city: '',
    province: '',
    address: '',
    formattedAddress: '',
    suburb: '',
    country: 'South Africa',
    postalCode: '',
    latitude: null,
    longitude: null,
    googlePlaceId: '',
    location: '',
    managerName: '',
    email: '',
    phone: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !branch) return
    setForm({
      name: branch.name || '',
      city: branch.city || '',
      province: branch.province || '',
      address: branch.address || '',
      formattedAddress: branch.formattedAddress || '',
      suburb: branch.suburb || '',
      country: branch.country || 'South Africa',
      postalCode: branch.postalCode || '',
      latitude: branch.latitude ?? null,
      longitude: branch.longitude ?? null,
      googlePlaceId: branch.googlePlaceId || '',
      location: branch.location || '',
      managerName: branch.principalName === 'Principal pending' ? '' : branch.principalName || '',
      email: branch.email || '',
      phone: branch.phone || '',
    })
    setError('')
  }, [branch, open])

  function updateField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  async function handleSave() {
    if (!normalizeText(form.name)) {
      setError('Branch name is required.')
      return
    }

    try {
      setSaving(true)
      setError('')
      const updated = await updateBranch(branch.id, form)
      await upsertAreaFromAddress(buildBranchAddressValue(form), { incrementListingCount: false })
      onSaved?.(updated)
      onClose?.()
    } catch (saveError) {
      setError(saveError?.message || 'Unable to update this branch right now.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Branch Settings"
      subtitle="Update the branch profile, contact details, and manager label."
      className="max-w-3xl"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Branch'}</Button>
        </div>
      )}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1.5 md:col-span-2">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch Name</span>
          <Field value={form.name} onChange={(event) => updateField('name', event.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">City</span>
          <Field value={form.city} onChange={(event) => updateField('city', event.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Province</span>
          <Field value={form.province} onChange={(event) => updateField('province', event.target.value)} />
        </label>
        <div className="md:col-span-2">
          <AddressAutocomplete
            label="Address"
            value={buildBranchAddressValue(form)}
            onChange={(nextAddress) => setForm((previous) => mergeBranchAddress(previous, nextAddress))}
            placeholder="12 Main Road Bedfordview"
            description="Used for branch reporting, routing, local search, and support context."
          />
        </div>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Suburb</span>
          <Field value={form.suburb} onChange={(event) => updateField('suburb', event.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Postal Code</span>
          <Field value={form.postalCode} onChange={(event) => updateField('postalCode', event.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Display Location</span>
          <Field value={form.location} onChange={(event) => updateField('location', event.target.value)} placeholder="e.g. Benoni, Gauteng" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Principal / Manager</span>
          <Field value={form.managerName} onChange={(event) => updateField('managerName', event.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch Email</span>
          <Field type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch Phone</span>
          <Field value={form.phone} onChange={(event) => updateField('phone', event.target.value)} />
        </label>
        <p className="rounded-[14px] border border-[#e1e8f2] bg-[#fbfcfe] px-4 py-3 text-sm leading-6 text-[#60758b] md:col-span-2">Trading status is managed separately in the confirmed Branch trading status section so active transactions cannot be orphaned.</p>
      </div>
      {error ? <p className="mt-4 rounded-[12px] border border-[#f2d7d7] bg-[#fff6f6] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
    </Modal>
  )
}

function BranchAgentInviteModal({
  open,
  branch,
  organisation,
  profile,
  commissionStructures = [],
  onCommissionStructureCreated,
  onClose,
  onSent,
}) {
  const defaultCommissionStructure = commissionStructures.find((structure) => structure?.isDefault) || null
  const [commissionSaving, setCommissionSaving] = useState(false)
  const branchAgentRoleOptions = useMemo(() => getBranchAgentRoleOptions(), [])
  const [form, setForm] = useState({
    firstName: '',
    surname: '',
    email: '',
    mobile: '',
    role: 'agent',
    commissionStructureId: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm({
      firstName: '',
      surname: '',
      email: '',
      mobile: '',
      role: 'agent',
      commissionStructureId: '',
      notes: '',
    })
    setError('')
  }, [open])

  function updateField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (commissionSaving) return
    if (!normalizeText(form.firstName) || !normalizeText(form.surname) || !normalizeText(form.email) || !normalizeText(form.mobile)) {
      setError('First name, surname, email, and mobile number are required.')
      return
    }
    const selectedCommissionStructure =
      form.commissionStructureId === '__unassigned__' ? null :
      commissionStructures.find((structure) => structure.id === form.commissionStructureId) || defaultCommissionStructure

    try {
      setSubmitting(true)
      setError('')
      const resolvedWorkspaceRole = normalizeAgentInviteRole(form.role)
      const resolvedRoleLabel = formatRoleLabel(resolvedWorkspaceRole)
      const inviteResult = await createWorkspaceUserInvite({
        workspaceId: organisation?.id || branch?.organisationId,
        organisationName: organisation?.name || 'Arch9 Organisation',
        role: resolvedWorkspaceRole,
        roleLabel: resolvedRoleLabel,
        branchId: branch?.id,
        branchName: branch?.name || '',
        email: form.email,
        mobile: form.mobile,
        firstName: form.firstName,
        lastName: form.surname,
        commissionStructureId: selectedCommissionStructure?.id || '',
        commissionStructureName: selectedCommissionStructure?.name || '',
        notes: form.notes,
        invitedByName: profile?.fullName || profile?.name || profile?.email || '',
        source: 'branch_workspace_agent_invite',
        metadata: {
          branch_id: branch?.id || '',
        },
      })
      const invite = inviteResult.invite
      onSent?.(invite)
      onClose?.()
    } catch (inviteError) {
      setError(inviteError?.message || 'Unable to send agent invite.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title="Add Agent"
      subtitle={`Invite an agent directly to ${branch?.name || 'this branch'}.`}
      className="max-w-4xl"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting || commissionSaving}>Cancel</Button>
          <Button type="submit" form="branch-agent-invite-form" disabled={submitting || commissionSaving}>{submitting ? 'Sending Invite...' : 'Send Invite'}</Button>
        </div>
      )}
    >
      <form id="branch-agent-invite-form" className="space-y-5" onSubmit={handleSubmit}>
        <section className="rounded-[16px] border border-[#e1e8f2] bg-[#fbfcfe] p-4">
          <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#7a8ca2]">Agent Details</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">First Name</span>
              <Field value={form.firstName} onChange={(event) => updateField('firstName', event.target.value)} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Surname</span>
              <Field value={form.surname} onChange={(event) => updateField('surname', event.target.value)} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Email Address</span>
              <Field type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Mobile Number</span>
              <Field value={form.mobile} onChange={(event) => updateField('mobile', event.target.value)} />
            </label>
          </div>
        </section>

        <section className="rounded-[16px] border border-[#e1e8f2] bg-[#fbfcfe] p-4">
          <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#7a8ca2]">Organisation Details</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Organisation</span>
              <Field value={organisation?.name || 'Arch9 Organisation'} disabled />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch</span>
              <Field value={branch?.name || 'Selected branch'} disabled />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Role / Permission</span>
              <Field as="select" value={form.role} onChange={(event) => updateField('role', event.target.value)}>
                {branchAgentRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Commission Structure (Optional)</span>
              <Field as="select" value={form.commissionStructureId} onChange={(event) => updateField('commissionStructureId', event.target.value)}>
                <option value="">{defaultCommissionStructure ? `Use agency default: ${defaultCommissionStructure.name}` : 'Assign later'}</option>
                {defaultCommissionStructure ? <option value="__unassigned__">Save agent without a commission structure</option> : null}
                {commissionStructures.map((structure) => (
                  <option key={structure.id} value={structure.id}>
                    {structure.name} ({formatPercent(structure.agentSplitPercentage)} agent / {formatPercent(structure.agencySplitPercentage)} agency)
                  </option>
                ))}
              </Field>
            </label>
          </div>
          {!commissionStructures.length ? (
            <div className="mt-3 rounded-[12px] border border-[#d8e4f0] bg-[#f5f9fd] px-3 py-2 text-sm text-[#48627f]">
              No commission structure is configured yet. You can invite this agent now and assign one later before creating a commissionable transaction.
            </div>
          ) : null}
          <InlineCommissionStructure disabled={submitting} onSavingChange={setCommissionSaving} onCreated={(structure) => {
            onCommissionStructureCreated?.(structure)
            updateField('commissionStructureId', structure.id)
          }} />
        </section>

        <section className="rounded-[16px] border border-[#e1e8f2] bg-[#fbfcfe] p-4">
          <p className="text-[0.74rem] font-semibold uppercase tracking-[0.1em] text-[#7a8ca2]">Notes</p>
          <label className="mt-3 grid gap-1.5">
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Internal Notes (optional)</span>
            <Field as="textarea" value={form.notes} onChange={(event) => updateField('notes', event.target.value)} placeholder="Add context for this invite" />
          </label>
        </section>

        {error ? <p className="rounded-[12px] border border-[#f2d7d7] bg-[#fff6f6] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      </form>
    </Modal>
  )
}

async function listPendingBranchInvites(branchId) {
  const safeBranchId = normalizeText(branchId)
  if (!safeBranchId || !isSupabaseConfigured || !supabase) return []

  const query = await supabase
    .from('invites')
    .select('id, token, status, email, phone, target_workspace_role, metadata, created_at, expires_at')
    .eq('target_branch_id', safeBranchId)
    .in('invite_type', ['branch_invite', 'workspace_invite'])
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (query.error) {
    const code = String(query.error.code || '').toUpperCase()
    const message = String(query.error.message || '').toLowerCase()
    if (code === '42P01' || message.includes('invites')) return []
    throw query.error
  }

  return (query.data || []).map((invite) => {
    const metadata = invite.metadata && typeof invite.metadata === 'object' ? invite.metadata : {}
    const firstName = normalizeText(metadata.first_name || metadata.firstName)
    const lastName = normalizeText(metadata.last_name || metadata.surname || metadata.lastName)
    const displayName = [firstName, lastName].filter(Boolean).join(' ') || normalizeText(invite.email) || 'Invited agent'
    return {
      id: invite.id,
      token: invite.token,
      name: displayName,
      role: formatRoleLabel(metadata.role || invite.target_workspace_role || 'agent'),
      listings: 0,
      transactions: 0,
      registered: 0,
      revenue: 0,
      conversionRate: 0,
      status: 'Invited',
      statusTone: 'invited',
      lastActive: invite.created_at,
      createdAt: invite.created_at,
      expiresAt: invite.expires_at,
      email: normalizeText(invite.email),
      phone: normalizeText(invite.phone || metadata.mobile),
      commissionStructureName: normalizeText(metadata.commission_structure_name),
      notes: normalizeText(metadata.notes),
      isPendingInvite: true,
    }
  })
}

function BranchInviteDetailModal({
  invite,
  branch,
  organisation,
  open,
  onClose,
  onResent,
}) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const inviteLink = buildAgentInviteLink(invite?.token)

  useEffect(() => {
    if (!open) return
    setSaving(false)
    setMessage('')
    setError('')
  }, [open, invite?.id])

  async function handleCopyLink() {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setMessage('Invite link copied.')
      setError('')
    } catch {
      setError('Unable to copy the invite link from this browser.')
    }
  }

  async function handleResend() {
    if (!invite?.isPendingInvite) return
    try {
      setSaving(true)
      setError('')
      setMessage('')
      await resendWorkspaceUserInvite({
        ...invite,
        organisationName: organisation?.name || invite?.organisationName || 'Arch9 Organisation',
      })
      setMessage(`Invite resent to ${invite.email}.`)
      onResent?.()
    } catch (resendError) {
      setError(resendError?.message || 'Unable to resend this invite.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={invite?.isPendingInvite ? 'Agent Invite' : 'Agent'}
      subtitle={invite?.isPendingInvite ? 'Review or resend this branch invite.' : 'Open this agent workspace.'}
      className="max-w-2xl"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Close</Button>
          {invite?.isPendingInvite ? (
            <Button type="button" onClick={handleResend} disabled={saving || !invite?.email}>
              {saving ? 'Resending...' : 'Resend Invite'}
            </Button>
          ) : null}
        </div>
      )}
    >
      <div className="space-y-4">
        <section className="rounded-[18px] border border-[#dfe8f1] bg-[#fbfdff] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Invitee</p>
              <h3 className="mt-1 text-lg font-semibold text-[#142132]">{invite?.name || 'Invited agent'}</h3>
              <p className="mt-1 text-sm text-[#60758b]">{invite?.role || 'Agent'} · {branch?.name || 'Branch'}</p>
            </div>
            <StatusPill tone={invite?.statusTone || 'invited'}>{invite?.status || 'Invited'}</StatusPill>
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Email</p>
              <p className="mt-1 break-all font-medium text-[#223449]">{invite?.email || 'Not captured'}</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Sent</p>
              <p className="mt-1 font-medium text-[#223449]">{formatDateShort(invite?.createdAt || invite?.lastActive)}</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Commission</p>
              <p className="mt-1 font-medium text-[#223449]">{invite?.commissionStructureName || 'Not assigned'}</p>
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Expires</p>
              <p className="mt-1 font-medium text-[#223449]">{formatDateShort(invite?.expiresAt)}</p>
            </div>
          </div>
        </section>

        {invite?.isPendingInvite ? (
          <section className="rounded-[18px] border border-[#dfe8f1] bg-white p-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Invite Link</p>
            <p className="mt-2 break-all rounded-[12px] border border-[#e2eaf3] bg-[#f8fbff] px-3 py-2 text-sm text-[#35546c]">
              {inviteLink || 'Invite link unavailable'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton icon={Copy} onClick={handleCopyLink}>Copy Link</ActionButton>
              <ActionButton icon={Mail} onClick={handleResend} disabled={saving || !invite?.email}>
                {saving ? 'Resending...' : 'Resend Email'}
              </ActionButton>
            </div>
          </section>
        ) : null}

        {message ? <p className="rounded-[12px] border border-[#cfe8d7] bg-[#f3fbf5] px-3 py-2 text-sm text-[#1d7d45]">{message}</p> : null}
        {error ? <p className="rounded-[12px] border border-[#f2d7d7] bg-[#fff6f6] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      </div>
    </Modal>
  )
}

export default function AgencyBranchWorkspacePage() {
  const { branchId = '', tab = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [branch, setBranch] = useState(null)
  const [accessibleBranches, setAccessibleBranches] = useState([])
  const [branchTransactions, setBranchTransactions] = useState([])
  const [branchListings, setBranchListings] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveSaving, setArchiveSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [agentInviteOpen, setAgentInviteOpen] = useState(false)
  const [selectedAgentRow, setSelectedAgentRow] = useState(null)
  const [organisationContext, setOrganisationContext] = useState({ organisation: null, profile: null })
  const [commissionStructures, setCommissionStructures] = useState([])
  const [preferredPartners, setPreferredPartners] = useState([])
  const [workspaceOverview, setWorkspaceOverview] = useState(null)
  const [workspacePerformance, setWorkspacePerformance] = useState(null)
  const rangeFrom = searchParams.get('from') || ''
  const rangeTo = searchParams.get('to') || ''
  const period = rangeFrom && rangeTo ? 'custom' : searchParams.get('period') || 'this_month'
  const [customRangeOpen, setCustomRangeOpen] = useState(Boolean(rangeFrom && rangeTo))
  const activeTab = TABS.some((item) => item.key === tab) ? tab : 'overview'

  useEffect(() => {
    if (tab && !TABS.some((item) => item.key === tab)) {
      navigate(`/agency/branches/${branchId}`, { replace: true, state: location.state })
    }
  }, [branchId, location.state, navigate, tab])

  function navigateToTab(nextTab, updates = {}) {
    const nextSearch = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === '') nextSearch.delete(key)
      else nextSearch.set(key, value)
    })
    navigate(
      {
        pathname: nextTab === 'overview' ? `/agency/branches/${branchId}` : `/agency/branches/${branchId}/${nextTab}`,
        search: nextSearch.toString() ? `?${nextSearch.toString()}` : '',
      },
      { state: location.state },
    )
  }

  function updateTabFilters(updates = {}) {
    const nextSearch = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([key, value]) => {
      if (value == null || value === '') nextSearch.delete(key)
      else nextSearch.set(key, value)
    })
    setSearchParams(nextSearch)
  }

  function switchBranch(nextBranchId) {
    const nextId = normalizeText(nextBranchId)
    if (!nextId || nextId === branchId) return
    const periodParams = new URLSearchParams()
    ;['period', 'from', 'to'].forEach((key) => {
      const value = searchParams.get(key)
      if (value) periodParams.set(key, value)
    })
    navigate({
      pathname: activeTab === 'overview' ? `/agency/branches/${encodeURIComponent(nextId)}` : `/agency/branches/${encodeURIComponent(nextId)}/${activeTab}`,
      search: periodParams.toString() ? `?${periodParams.toString()}` : '',
    }, { state: { returnTo: location.state?.returnTo || '/agency/branches' } })
  }

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [branchRow, transactions, listings, topAgents, overview, branches] = await Promise.all([
        getBranch(branchId),
        getBranchTransactions(branchId),
        getBranchListings(branchId),
        getAgentLeaderboard(branchId),
        getBranchWorkspaceOverview(branchId, { period, from: rangeFrom, to: rangeTo }),
        getBranches(),
      ])

      if (!branchRow) {
        throw new Error('Branch not found or no longer accessible.')
      }

      setBranch(branchRow)
      setAccessibleBranches(Array.isArray(branches) ? branches.filter((item) => item?.isActive !== false) : [])
      setBranchTransactions(transactions)
      setBranchListings(listings)
      setLeaderboard(topAgents)
      setWorkspaceOverview(overview)
      setWorkspacePerformance(buildBranchWorkspacePerformance(branchRow, { period, from: rangeFrom, to: rangeTo }))

      const [settingsContext, structures, branchInvites, partners] = await Promise.all([
        fetchOrganisationSettings().catch(() => null),
        listOrganisationCommissionStructures().catch(() => []),
        listPendingBranchInvites(branchId).catch((inviteError) => {
          console.warn('[Branch Workspace] pending invites unavailable', inviteError)
          return []
        }),
        listOrganisationPreferredPartners().catch(() => []),
      ])
      setOrganisationContext({
        organisation: settingsContext?.organisation || null,
        profile: settingsContext?.profile || null,
        membershipRole: settingsContext?.membershipRole || '',
      })
      setCommissionStructures(Array.isArray(structures) ? structures.filter((structure) => structure?.isActive !== false) : [])
      setPendingInvites(branchInvites)
      setPreferredPartners(Array.isArray(partners) ? partners.filter((partner) => partner?.isActive !== false) : [])
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load branch workspace right now.')
    } finally {
      setLoading(false)
    }
  }, [branchId, period, rangeFrom, rangeTo])

  useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const activeDeals = useMemo(() => branchTransactions.filter((row) => {
    const status = normalizeLower(row?.lifecycle_state)
    return status !== 'completed' && status !== 'archived' && status !== 'cancelled'
  }).length, [branchTransactions])

  const closedDeals = useMemo(() => branchTransactions.filter((row) => Boolean(row?.registered_at)).length, [branchTransactions])

  const closedRate = useMemo(() => {
    if (!branchTransactions.length) return 0
    return Math.round((closedDeals / branchTransactions.length) * 100)
  }, [closedDeals, branchTransactions.length])

  const overviewKpis = workspaceOverview?.kpis || []
  const pipelineValue = Number(overviewKpis.find((item) => item.key === 'pipeline')?.value || 0)
  const revenueSecured = Number(overviewKpis.find((item) => item.key === 'commission')?.value || 0)
  const branchName = branch?.name || 'Branch Workspace'
  const branchLocation = normalizeText(branch?.location) || [branch?.city, branch?.province].map(normalizeText).filter(Boolean).join(', ') || 'Location pending'
  const branchManager = normalizeText(branch?.managerName || branch?.principalName) || 'Not assigned'
  const activeSalesAgents = Number(branch?.kpis?.activeSalesAgents ?? branch?.kpis?.activeAgents ?? leaderboard.length ?? 0)
  const activeOperationalTeam = Number(branch?.kpis?.activeOperationalTeam ?? branch?.kpis?.activeProductionUsers ?? activeSalesAgents)
  const conversionRate = Number(branch?.kpis?.conversionRate || closedRate || 0)
  const membershipRole = normalizeLower(organisationContext.membershipRole || organisationContext.profile?.role)
  const canViewFinancials = ['owner', 'principal'].includes(membershipRole)
  const canViewCompliance = ['owner', 'principal', 'branch_manager', 'compliance'].includes(membershipRole)
  const canManageBranch = ['owner', 'principal', 'branch_manager'].includes(membershipRole)

  const openBranchAgentInvite = useCallback(() => {
    setAgentInviteOpen(true)
  }, [])

  const handleBranchSaved = useCallback((updatedBranch) => {
    if (updatedBranch) {
      setBranch(updatedBranch)
    }
    void loadWorkspace()
  }, [loadWorkspace])

  const branchStaffRows = useMemo(() => {
    const performanceByKey = new Map()
    leaderboard.forEach((agent) => {
      ;[agent.id, agent.email].map(normalizeLower).filter(Boolean).forEach((key) => performanceByKey.set(key, agent))
    })
    const members = Array.isArray(branch?.members) ? branch.members : []
    const memberRows = members.map((member) => {
      const performance = [member.id, member.user_id, member.email].map(normalizeLower).filter(Boolean).map((key) => performanceByKey.get(key)).find(Boolean) || {}
      const name = normalizeText([member.first_name, member.last_name].filter(Boolean).join(' ')) || normalizeText(member.name) || normalizeText(member.email) || 'Staff member'
      return {
        id: member.id || member.user_id || member.email,
        routeId: member.user_id || member.id || member.email,
        name,
        role: formatRoleLabel(member.role || member.workspace_role || 'staff'),
        listings: performance.listings || 0,
        transactions: performance.transactions || 0,
        revenue: performance.revenue || 0,
        status: member.status || 'Active',
        statusTone: normalizeLower(member.status) === 'invited' ? 'invited' : normalizeLower(member.status) === 'active' ? 'active' : 'slate',
        lastActive: member.last_active_at || member.updated_at || member.created_at,
        email: member.email || '',
        isPendingInvite: false,
      }
    })
    const memberEmails = new Set(memberRows.map((member) => normalizeLower(member.email)).filter(Boolean))
    const invites = pendingInvites.filter((invite) => !memberEmails.has(normalizeLower(invite.email))).map((invite) => ({
      id: invite.id || invite.email,
      name: invite.name || invite.email || 'Pending invitation',
      role: formatRoleLabel(invite.role || 'agent'),
      listings: 0,
      transactions: 0,
      revenue: 0,
      status: 'Invited',
      statusTone: 'invited',
      lastActive: invite.created_at,
      email: invite.email || '',
      isPendingInvite: true,
    }))
    return [...invites, ...memberRows]
  }, [branch?.members, leaderboard, pendingInvites])

  const branchLeads = useMemo(() => Array.isArray(branch?.leads) ? branch.leads : [], [branch?.leads])
  const staffSearch = normalizeLower(searchParams.get('staffSearch'))
  const staffRole = normalizeLower(searchParams.get('staffRole') || (searchParams.get('filter') === 'agents' ? 'agent' : ''))
  const staffStatus = normalizeLower(searchParams.get('staffStatus'))
  const listingSearch = normalizeLower(searchParams.get('listingSearch'))
  const listingStatus = normalizeLower(searchParams.get('listingStatus') || (searchParams.get('filter') === 'active' ? 'active' : ''))
  const listingAttention = normalizeLower(searchParams.get('attention')) === 'unassigned_listings'
  const leadSearch = normalizeLower(searchParams.get('leadSearch'))
  const leadStage = normalizeLower(searchParams.get('leadStage') || searchParams.get('stage'))
  const leadAttention = normalizeLower(searchParams.get('attention')) === 'unassigned_leads'
  const transactionSearch = normalizeLower(searchParams.get('transactionSearch'))
  const transactionStage = normalizeLower(searchParams.get('transactionStage') || searchParams.get('stage'))
  const transactionSort = normalizeLower(searchParams.get('transactionSort') || (searchParams.get('sort') === 'value' ? 'value' : 'updated'))
  const transactionAttention = normalizeLower(searchParams.get('attention')) === 'stale_transactions'

  const filteredStaffRows = useMemo(() => branchStaffRows.filter((agent) => {
    const haystack = normalizeLower(`${agent.name} ${agent.email} ${agent.role}`)
    return (!staffSearch || haystack.includes(staffSearch))
      && (!staffRole || normalizeLower(agent.role).includes(staffRole))
      && (!staffStatus || normalizeLower(agent.status) === staffStatus)
  }), [branchStaffRows, staffRole, staffSearch, staffStatus])

  const filteredListings = useMemo(() => branchListings.filter((listing) => {
    const status = normalizeLower(listing.listing_status || listing.stage || 'active')
    const haystack = normalizeLower(`${listing.listing_title || listing.title || ''} ${listing.assigned_agent_name || listing.assigned_agent_email || ''}`)
    return (!listingSearch || haystack.includes(listingSearch))
      && (!listingStatus || status.includes(listingStatus))
      && (!listingAttention || !normalizeText(listing.assigned_agent_id || listing.assigned_agent_email))
  }), [branchListings, listingAttention, listingSearch, listingStatus])

  const filteredLeads = useMemo(() => branchLeads.filter((lead) => {
    const stage = normalizeLower(lead.stage || lead.status)
    const haystack = normalizeLower(`${lead.lead_id || ''} ${lead.lead_category || ''} ${lead.assigned_agent_id || ''} ${lead.status || ''} ${lead.stage || ''}`)
    return (!leadSearch || haystack.includes(leadSearch))
      && (!leadStage || stage.includes(leadStage))
      && (!leadAttention || !normalizeText(lead.assigned_agent_id))
  }), [branchLeads, leadAttention, leadSearch, leadStage])

  const filteredTransactions = useMemo(() => branchTransactions
    .filter((row) => {
      const stage = normalizeLower(row.stage || row.lifecycle_state)
      const haystack = normalizeLower(`${row.transaction_reference || row.id || ''} ${row.assigned_agent || row.assigned_agent_email || ''} ${stage}`)
      const updatedAt = new Date(row.updated_at || row.created_at || 0)
      const stale = Number.isNaN(updatedAt.getTime()) || Date.now() - updatedAt.getTime() > 14 * 86400000
      return (!transactionSearch || haystack.includes(transactionSearch))
        && (!transactionStage || stage.includes(transactionStage))
        && (!transactionAttention || stale)
    })
    .sort((left, right) => transactionSort === 'value'
      ? Number(right.sales_price || right.purchase_price || 0) - Number(left.sales_price || left.purchase_price || 0)
      : new Date(right.updated_at || right.created_at || 0) - new Date(left.updated_at || left.created_at || 0)), [branchTransactions, transactionAttention, transactionSearch, transactionSort, transactionStage])

  function handleAgentRowClick(agent) {
    if (!agent) return
    if (agent.isPendingInvite) {
      setSelectedAgentRow(agent)
      return
    }
    const routeId = normalizeText(agent.routeId || agent.id)
    if (routeId) {
      navigate(`/agency/agents/${encodeURIComponent(routeId)}`, { state: { returnTo: `${location.pathname}${location.search}` } })
    }
  }

  if (loading) {
    return (
      <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_18px_42px_rgba(24,45,68,0.06)]">
        <div className="h-4 w-44 animate-pulse rounded-full bg-[#e7eef6]" />
        <div className="mt-5 h-10 w-80 max-w-full animate-pulse rounded-full bg-[#e7eef6]" />
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-[20px] bg-[#f0f5fa]" />)}
        </div>
      </section>
    )
  }

  if (error) {
    return <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">{error}</p>
  }

  return (
    <section className="flex flex-col gap-4">
      {actionError ? <p role="alert" className="text-sm text-red-700">{actionError}</p> : null}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm font-medium text-[#60758d]">
        <button type="button" onClick={() => navigate('/agency')} className="transition hover:text-[#163247]">Organisation</button>
        <span aria-hidden="true">/</span>
        <button type="button" onClick={() => navigate(location.state?.returnTo || '/agency/branches')} className="transition hover:text-[#163247]">Branches</button>
        <span aria-hidden="true">/</span>
        <span className="truncate font-semibold text-[#142132]" aria-current="page">{branchName}</span>
      </nav>
      <section className="rounded-[24px] border border-[#dfe8f1] bg-white px-5 py-4 shadow-[0_14px_34px_rgba(24,45,68,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] border border-[#dce7f2] bg-[#f4f8fc] text-[1rem] font-bold text-[#163247]">
                {getInitials(branchName)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-[1.7rem] font-semibold leading-tight tracking-[-0.045em] text-[#142132]">{branchName}</h1>
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.75rem] font-semibold ${branch?.isActive !== false ? 'border-[#d6ece0] bg-[#edfdf3] text-[#1c7d45]' : 'border-[#f4d7d4] bg-[#fff4f3] text-[#b42318]'}`}>
                    <span className="h-2 w-2 rounded-full bg-current" />
                    {branch?.isActive !== false ? 'Active' : 'Suspended'}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-[#60758d]">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin size={14} />
                    {branchLocation}
                  </span>
                  <span>{activeOperationalTeam} team members</span>
                  <span>{activeSalesAgents} sales agents</span>
                  <span>{activeDeals} active deals</span>
                </div>
                {accessibleBranches.length > 1 ? <label className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#60758d]">Switch branch<select value={branchId} onChange={(event) => switchBranch(event.target.value)} className="rounded-md border border-[#dce7f2] bg-white px-2 py-1.5 text-sm font-semibold text-[#263f58]"><option value={branchId}>{branchName}</option>{accessibleBranches.filter((item) => item.id !== branchId).map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select></label> : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <div className="hidden min-w-[150px] border-r border-[#e5edf5] pr-5 sm:block">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7b8ca2]">Branch manager</p>
              <p className="mt-1 truncate text-sm font-semibold text-[#142132]">{branchManager}</p>
            </div>
            <ActionButton icon={UserPlus} onClick={openBranchAgentInvite}>Add staff</ActionButton>
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[15px] bg-[#08784b] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(8,120,75,0.18)] transition hover:-translate-y-0.5 hover:bg-[#076a43]"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={16} />
              Edit branch
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-[18px] border border-[#dfe8f1] bg-white px-2 py-1 shadow-[0_10px_24px_rgba(24,45,68,0.04)]">
        <div className="flex min-w-max items-center gap-1" role="tablist" aria-label="Branch workspace sections">
          {TABS.map((tabItem) => (
            <button
              key={tabItem.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tabItem.key}
              onClick={() => navigateToTab(tabItem.key)}
              className={`relative min-h-[42px] rounded-[12px] px-4 text-center text-sm font-semibold transition ${
                activeTab === tabItem.key
                  ? 'bg-[#effaf3] text-[#08784b]'
                  : 'text-[#5f7187] hover:bg-[#f6f9fc] hover:text-[#163247]'
              }`}
            >
              {tabItem.label}
              {activeTab === tabItem.key ? <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-[#08784b]" /> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex justify-end">
          <div className="flex flex-wrap justify-end rounded-lg border border-[#dfe8f1] bg-white p-1">
            {[['this_month', 'This month'], ['last_month', 'Last month'], ['90_days', '90 days']].map(([value, label]) => (
              <button key={value} type="button" onClick={() => { const next = new URLSearchParams(searchParams); next.delete('from'); next.delete('to'); value === 'this_month' ? next.delete('period') : next.set('period', value); setCustomRangeOpen(false); setSearchParams(next) }} className={`min-h-[34px] rounded-md px-3 text-sm font-semibold ${period === value ? 'bg-[#effaf3] text-[#08784b]' : 'text-[#60758d]'}`}>{label}</button>
            ))}
            <button type="button" onClick={() => setCustomRangeOpen((open) => !open)} className={`min-h-[34px] rounded-md px-3 text-sm font-semibold ${period === 'custom' || customRangeOpen ? 'bg-[#effaf3] text-[#08784b]' : 'text-[#60758d]'}`}>Custom</button>
          </div>
        </div>
        {customRangeOpen ? <form className="flex flex-wrap items-end justify-end gap-2 rounded-[14px] border border-[#dfe8f1] bg-white p-3" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const from = String(data.get('from') || ''); const to = String(data.get('to') || ''); if (!from || !to || from > to) return; const next = new URLSearchParams(searchParams); next.delete('period'); next.set('from', from); next.set('to', to); setSearchParams(next) }}><label className="text-xs font-semibold text-[#60758d]">From<input required name="from" type="date" defaultValue={rangeFrom} className="mt-1 block rounded-md border border-[#dce7f2] px-2 py-1.5 text-sm text-[#142132]" /></label><label className="text-xs font-semibold text-[#60758d]">To<input required name="to" type="date" defaultValue={rangeTo} className="mt-1 block rounded-md border border-[#dce7f2] px-2 py-1.5 text-sm text-[#142132]" /></label><button type="submit" className="min-h-[34px] rounded-md bg-[#08784b] px-3 text-sm font-semibold text-white">Apply</button></form> : null}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {(workspaceOverview?.kpis || []).filter((kpi) => canViewFinancials || !['pipeline', 'commission'].includes(kpi.key)).map((kpi) => (
            <button key={kpi.key} type="button" onClick={() => navigateToTab(kpi.tab, kpi.key === 'staff' ? { filter: 'agents' } : kpi.key === 'listings' || kpi.key === 'leads' || kpi.key === 'transactions' ? { filter: 'active' } : kpi.key === 'pipeline' ? { sort: 'value' } : {})} className="text-left">
              <KpiCard label={kpi.label} value={kpi.currency ? formatCurrency(kpi.value) : kpi.value} helper={kpi.change === null ? 'No comparison data' : `${kpi.change >= 0 ? '+' : ''}${kpi.change}% vs previous period`} icon={kpi.key === 'commission' ? Banknote : kpi.key === 'pipeline' ? BarChart3 : Users} tone={kpi.key === 'commission' ? 'green' : 'blue'} />
            </button>
          ))}
        </section>
      </section>

      <section>
        {activeTab === 'overview' ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(300px,0.9fr)]">
            <div className="min-w-0 space-y-5">
              <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
                <SectionTitle eyebrow="Executive Overview" title="Branch Performance Cockpit" copy="Pipeline health, transaction velocity, listing movement, and conversion quality in one operating view." />
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {canViewFinancials ? <KpiCard label="Pipeline Value" value={formatCurrency(pipelineValue)} helper="Open branch portfolio" icon={BarChart3} tone="blue" /> : null}
                  <KpiCard label="Conversion Quality" value={formatPercent(conversionRate)} helper="Lead to closed signal" icon={TrendingUp} tone="green" />
                  <KpiCard label="Deal Velocity" value={activeDeals} helper="Deals in motion" icon={ArrowRightLeft} tone="gold" />
                  <KpiCard label="Listing Movement" value={branchListings.length} helper="Inventory tracked" icon={Building2} tone="slate" />
                </div>
              </section>

              <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Transaction Pipeline</p>
                    <h3 className="mt-1 text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Closed deal ratio across this branch portfolio</h3>
                  </div>
                  <span className="w-fit rounded-full border border-[#dce7f2] bg-[#f8fbff] px-3 py-1 text-sm font-semibold text-[#405b75]">{closedRate}% closed</span>
                </div>
                <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-[#e7eef6]">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#163247_0%,#4f82b8_70%,#77b8d6_100%)]" style={{ width: `${closedRate > 0 ? Math.min(100, Math.max(4, closedRate)) : 0}%` }} />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <KpiCard label="Registered" value={closedDeals} helper="Completed outcomes" icon={FileCheck2} tone="green" />
                  <KpiCard label="Transactions" value={branchTransactions.length} helper="Total branch deals" icon={ArrowRightLeft} tone="slate" />
                  {canViewFinancials ? <KpiCard label="Projected Commission" value={formatCurrency(revenueSecured)} helper="Recorded commission data" icon={Banknote} tone="blue" /> : null}
                </div>
              </section>

              <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
                <SectionTitle eyebrow="Branch performance" title="Operational movement" copy="Activity is grouped across the selected period from this branch’s live records." />
                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  {Object.entries(workspaceOverview?.series || {}).map(([key, values]) => {
                    const label = key === 'transactions' ? 'Transactions' : key === 'registrations' ? 'Registrations' : 'Listings'
                    const peak = Math.max(...values, 1)
                    return (
                      <div key={key} className="rounded-[18px] border border-[#e4edf5] bg-[#fbfdff] p-4">
                        <p className="text-sm font-semibold text-[#142132]">{label}</p>
                        <div className="mt-5 flex h-20 items-end gap-1.5" aria-label={`${label} activity chart`}>
                          {values.map((value, index) => <span key={index} title={`${value} ${label.toLowerCase()}`} className="min-w-0 flex-1 rounded-t-sm bg-[#2f7ee6]" style={{ height: `${Math.max(value ? 12 : 4, Math.round(value / peak * 100))}%`, opacity: 0.45 + (index / 20) }} />)}
                        </div>
                        <p className="mt-3 text-xs text-[#71849a]">{values.reduce((total, value) => total + value, 0)} updates in this period</p>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Sales pipeline</p>
                      <h3 className="mt-1 text-[1.05rem] font-semibold tracking-[-0.025em] text-[#142132]">Current branch stages</h3>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {(workspaceOverview?.stages || []).map((stage) => {
                      const tab = ['new', 'qualified', 'viewings'].includes(stage.key) ? 'leads' : 'transactions'
                      return <button key={stage.key} type="button" onClick={() => navigateToTab(tab, { stage: stage.key })} className="flex items-center justify-between rounded-[14px] border border-[#e0eaf3] bg-white px-3 py-3 text-left transition hover:border-[#9ecbb7] hover:bg-[#f5fcf8]"><span className="text-sm font-medium text-[#405b75]">{stage.label}</span><span className="text-lg font-semibold text-[#142132]">{stage.count}</span></button>
                    })}
                  </div>
                </div>
              </section>

              <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
                <SectionTitle eyebrow="Team Output" title="Agent Performance Snapshot" copy="Production is scoped to the selected period. Open Staff for the complete branch roster." />
                <div className="mt-5">
                  {(workspaceOverview?.staff || []).length ? (
                    <SimpleTable
                      columns={['Agent', 'Listings created', 'Transactions opened', ...(canViewFinancials ? ['Projected commission'] : [])]}
                      rows={workspaceOverview.staff.map((agent) => [agent.name, String(agent.listings), String(agent.transactions), ...(canViewFinancials ? [formatCurrency(agent.commission)] : [])])}
                    />
                  ) : (
                    <EmptyState title="Agent performance will appear here" copy="Agent performance will appear here once agents start managing listings and transactions." icon={Users} />
                  )}
                </div>
              </section>
            </div>

            <aside className="min-w-0 xl:sticky xl:top-5 xl:self-start">
              <section className="mb-5 rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
                <SectionTitle eyebrow="Follow-up" title="Needs attention" copy="Items are derived from branch records that need an owner or review." />
                <div className="mt-5 space-y-2">
                  {(workspaceOverview?.attention || []).length ? workspaceOverview.attention.map((item) => (
                    <button key={item.key} type="button" onClick={() => navigateToTab(item.tab, { attention: item.key })} className="w-full rounded-[16px] border border-[#e5edf5] bg-[#fbfdff] p-3 text-left transition hover:border-[#9ecbb7] hover:bg-white">
                      <div className="flex items-start gap-3"><span className="grid h-7 min-w-7 place-items-center rounded-full bg-[#fff3e8] text-sm font-bold text-[#d56a00]">{item.count}</span><span><span className="block text-sm font-semibold text-[#142132]">{item.title}</span><span className="mt-1 block text-xs leading-5 text-[#71849a]">{item.detail}</span></span></div>
                    </button>
                  )) : <EmptyState title="Nothing needs attention" copy="This branch has no unassigned open leads or listings, and no stale transactions." icon={ShieldCheck} />}
                </div>
              </section>
              <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
                <SectionTitle eyebrow="Live Feed" title="Recent Activity" copy="Agent, transaction, listing, and client movements will appear here in real time." />
                <div className="mt-5 space-y-3">
                  {(workspaceOverview?.activity || []).length ? (
                    workspaceOverview.activity.map((item) => {
                      const Icon = item.tab === 'transactions' ? ArrowRightLeft : item.tab === 'leads' ? Users : Building2
                      return (
                        <button key={item.id} type="button" onClick={() => navigateToTab(item.tab)} className="flex w-full items-start gap-3 rounded-[18px] border border-[#e7eef6] bg-[#fbfdff] px-4 py-3 text-left transition hover:border-[#cbd9e7] hover:bg-white">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf4fb] text-[#35546c]">
                            <Icon size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#142132]">{item.type}</p>
                            <p className="mt-1 text-sm leading-5 text-[#60758b]">{item.detail}</p>
                          </div>
                          <time className="shrink-0 text-[0.7rem] font-semibold text-[#8a9bb0]">{formatDateShort(item.at)}</time>
                        </button>
                      )
                    })
                  ) : (
                    <EmptyState title="No activity yet" copy="Recent branch activity will appear here as agents create leads, listings, appointments, and transactions." icon={CalendarDays} />
                  )}
                </div>
              </section>
            </aside>
          </div>
        ) : null}

        {activeTab === 'staff' ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Total staff" value={branchStaffRows.length} helper="Members and invitations" icon={Users} tone="slate" />
              <KpiCard label="Active agents" value={branchStaffRows.filter((agent) => normalizeLower(agent.role).includes('agent') && normalizeLower(agent.status) === 'active').length} helper="Current sales team" icon={Users} tone="green" />
              <KpiCard label="Operational staff" value={branchStaffRows.filter((agent) => !normalizeLower(agent.role).includes('agent') && !agent.isPendingInvite).length} helper="Coordinators and support" icon={Users} tone="blue" />
              <KpiCard label="Pending invitations" value={branchStaffRows.filter((agent) => agent.isPendingInvite).length} helper="Awaiting acceptance" icon={Mail} tone="gold" />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-[#dfe8f1] bg-white p-3">
              <input value={searchParams.get('staffSearch') || ''} onChange={(event) => updateTabFilters({ staffSearch: event.target.value })} placeholder="Search staff" className="min-h-[38px] min-w-[190px] flex-1 rounded-[10px] border border-[#dce7f2] px-3 text-sm text-[#142132] outline-none focus:border-[#61a98a]" />
              <select value={searchParams.get('staffRole') || (searchParams.get('filter') === 'agents' ? 'agent' : '')} onChange={(event) => updateTabFilters({ staffRole: event.target.value, filter: '' })} className="min-h-[38px] rounded-[10px] border border-[#dce7f2] px-3 text-sm text-[#405b75]"><option value="">All roles</option><option value="agent">Agents</option><option value="principal">Principals</option><option value="admin">Administrators</option></select>
              <select value={searchParams.get('staffStatus') || ''} onChange={(event) => updateTabFilters({ staffStatus: event.target.value })} className="min-h-[38px] rounded-[10px] border border-[#dce7f2] px-3 text-sm text-[#405b75]"><option value="">All statuses</option><option value="active">Active</option><option value="invited">Invited</option><option value="inactive">Inactive</option></select>
            </div>
            {filteredStaffRows.length ? (
              <SimpleTable
                columns={['Staff member', 'Role', 'Listings', 'Transactions', ...(canViewFinancials ? ['Revenue'] : []), 'Status', 'Last update']}
                rows={filteredStaffRows.map((agent) => ({
                key: agent.isPendingInvite ? `invite-${agent.id}` : `agent-${agent.id}`,
                onClick: () => handleAgentRowClick(agent),
                cells: [
                  <span className="inline-flex items-center gap-2 font-semibold text-[#142132]">
                    {agent.name}
                    {agent.isPendingInvite ? null : <ExternalLink size={13} className="text-[#8ca0b6]" />}
                  </span>,
                  agent.role,
                  String(agent.listings || 0),
                  String(agent.transactions || 0),
                  ...(canViewFinancials ? [formatCurrency(agent.revenue || 0)] : []),
                  <StatusPill tone={agent.statusTone}>{agent.status || 'Active'}</StatusPill>,
                  formatDateShort(agent.lastActive),
                ],
              }))}
              />
            ) : <EmptyState title="No staff match these filters" copy="Try clearing a filter or invite a member to this branch." icon={Users} action={<ActionButton icon={UserPlus} onClick={openBranchAgentInvite}>Invite staff</ActionButton>} />}
          </section>
        ) : null}

        {activeTab === 'listings' ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Active listings" value={branchListings.filter((item) => !['withdrawn', 'sold', 'archived'].includes(normalizeLower(item.listing_status))).length} helper="Current branch inventory" icon={Building2} tone="green" />
              <KpiCard label="Under offer" value={branchListings.filter((item) => normalizeLower(item.listing_status).includes('offer')).length} helper="Awaiting outcome" icon={Building2} tone="gold" />
              <KpiCard label="Sold" value={branchListings.filter((item) => normalizeLower(item.listing_status).includes('sold')).length} helper="Recorded branch sales" icon={FileCheck2} tone="blue" />
              <KpiCard label="Unassigned" value={branchListings.filter((item) => !normalizeText(item.assigned_agent_id || item.assigned_agent_email)).length} helper="Needs an owner" icon={Users} tone="slate" />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-[#dfe8f1] bg-white p-3">
              <input value={searchParams.get('listingSearch') || ''} onChange={(event) => updateTabFilters({ listingSearch: event.target.value })} placeholder="Search listings" className="min-h-[38px] min-w-[190px] flex-1 rounded-[10px] border border-[#dce7f2] px-3 text-sm text-[#142132] outline-none focus:border-[#61a98a]" />
              <select value={searchParams.get('listingStatus') || (searchParams.get('filter') === 'active' ? 'active' : '')} onChange={(event) => updateTabFilters({ listingStatus: event.target.value, filter: '' })} className="min-h-[38px] rounded-[10px] border border-[#dce7f2] px-3 text-sm text-[#405b75]"><option value="">All statuses</option><option value="active">Active</option><option value="offer">Under offer</option><option value="sold">Sold</option><option value="withdrawn">Withdrawn</option></select>
            </div>
            {filteredListings.length ? <SimpleTable columns={['Property', 'Status', ...(canViewFinancials ? ['Asking price'] : []), 'Assigned agent', 'Updated']} rows={filteredListings.map((listing) => ({ key: listing.id, onClick: () => navigate(`/agent/listings/${encodeURIComponent(listing.id)}`, { state: { returnTo: `${location.pathname}${location.search}` } }), cells: [listing.listing_title || listing.title || listing.id, <StatusPill>{listing.listing_status || listing.stage || 'Active'}</StatusPill>, ...(canViewFinancials ? [formatCurrency(listing.asking_price || 0)] : []), listing.assigned_agent_name || listing.assigned_agent_email || 'Unassigned', formatDateShort(listing.updated_at || listing.created_at)] }))} /> : <EmptyState title="No listings match these filters" copy="This branch has no visible listings for the selected filters." icon={Building2} />}
          </section>
        ) : null}

        {activeTab === 'transactions' ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Active transactions" value={branchTransactions.filter((row) => !['registered', 'cancelled', 'archived', 'completed'].includes(normalizeLower(row.lifecycle_state || row.stage))).length} helper="Deals in motion" icon={ArrowRightLeft} tone="blue" />
              <KpiCard label="Offers" value={branchTransactions.filter((row) => normalizeLower(row.stage || row.lifecycle_state).includes('offer')).length} helper="Accepted and negotiating" icon={ArrowRightLeft} tone="gold" />
              <KpiCard label="In transfer" value={branchTransactions.filter((row) => normalizeLower(row.stage || row.lifecycle_state).includes('transfer')).length} helper="Legal progress" icon={FileCheck2} tone="green" />
              {canViewFinancials ? <KpiCard label="Pipeline value" value={formatCurrency(branchTransactions.filter((row) => !['registered', 'cancelled', 'archived', 'completed'].includes(normalizeLower(row.lifecycle_state || row.stage))).reduce((sum, row) => sum + Number(row.sales_price || row.purchase_price || 0), 0))} helper="Active transaction value" icon={Banknote} tone="blue" /> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-[#dfe8f1] bg-white p-3">
              <input value={searchParams.get('transactionSearch') || ''} onChange={(event) => updateTabFilters({ transactionSearch: event.target.value })} placeholder="Search transactions" className="min-h-[38px] min-w-[190px] flex-1 rounded-[10px] border border-[#dce7f2] px-3 text-sm text-[#142132] outline-none focus:border-[#61a98a]" />
              <select value={searchParams.get('transactionStage') || searchParams.get('stage') || ''} onChange={(event) => updateTabFilters({ transactionStage: event.target.value, stage: '' })} className="min-h-[38px] rounded-[10px] border border-[#dce7f2] px-3 text-sm text-[#405b75]"><option value="">All stages</option><option value="offer">Offer</option><option value="finance">Finance</option><option value="transfer">Transfer</option><option value="lodged">Lodged</option><option value="registered">Registered</option></select>
              <select value={transactionSort} onChange={(event) => updateTabFilters({ transactionSort: event.target.value, sort: '' })} className="min-h-[38px] rounded-[10px] border border-[#dce7f2] px-3 text-sm text-[#405b75]"><option value="updated">Recently updated</option><option value="value">Highest value</option></select>
            </div>
            {filteredTransactions.length ? <SimpleTable columns={['Reference', 'Stage', 'Agent', ...(canViewFinancials ? ['Value'] : []), 'Status', 'Updated']} rows={filteredTransactions.map((row) => ({ key: row.id, onClick: () => navigate(`/transactions/${encodeURIComponent(row.id)}`, { state: { returnTo: `${location.pathname}${location.search}` } }), cells: [row.transaction_reference || row.id, <StatusPill>{row.stage || 'In progress'}</StatusPill>, row.assigned_agent || row.assigned_agent_email || 'Unassigned', ...(canViewFinancials ? [formatCurrency(row.sales_price || row.purchase_price || 0)] : []), row.lifecycle_state || 'Active', formatDateShort(row.updated_at || row.created_at)] }))} /> : <EmptyState title="No transactions match these filters" copy="This branch has no transactions for the selected stage or search." icon={ArrowRightLeft} />}
          </section>
        ) : null}

        {activeTab === 'leads' ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="New leads" value={branchLeads.filter((lead) => ['new', 'unqualified'].includes(normalizeLower(lead.stage || lead.status))).length} helper="Unqualified enquiries" icon={Users} tone="blue" />
              <KpiCard label="Unassigned leads" value={branchLeads.filter((lead) => !normalizeText(lead.assigned_agent_id)).length} helper="Needs ownership" icon={Users} tone="gold" />
              <KpiCard label="Qualified" value={branchLeads.filter((lead) => normalizeLower(lead.stage || lead.status).includes('qualif')).length} helper="Ready for next action" icon={FileCheck2} tone="green" />
              <KpiCard label="Viewings" value={branchLeads.filter((lead) => normalizeLower(lead.stage || lead.status).includes('view')).length} helper="Viewing stage" icon={CalendarDays} tone="slate" />
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-[18px] border border-[#dfe8f1] bg-white p-3">
              <input value={searchParams.get('leadSearch') || ''} onChange={(event) => updateTabFilters({ leadSearch: event.target.value })} placeholder="Search leads" className="min-h-[38px] min-w-[190px] flex-1 rounded-[10px] border border-[#dce7f2] px-3 text-sm text-[#142132] outline-none focus:border-[#61a98a]" />
              <select value={searchParams.get('leadStage') || searchParams.get('stage') || ''} onChange={(event) => updateTabFilters({ leadStage: event.target.value, stage: '' })} className="min-h-[38px] rounded-[10px] border border-[#dce7f2] px-3 text-sm text-[#405b75]"><option value="">All stages</option><option value="new">New</option><option value="qualified">Qualified</option><option value="view">Viewings</option></select>
            </div>
            {filteredLeads.length ? <SimpleTable columns={['Lead', 'Category', 'Stage', 'Assigned agent', ...(canViewFinancials ? ['Value'] : []), 'Updated']} rows={filteredLeads.map((lead) => ({ key: lead.lead_id, onClick: () => navigate(`/pipeline/leads/${encodeURIComponent(lead.lead_id)}`, { state: { returnTo: `${location.pathname}${location.search}` } }), cells: [lead.lead_id, lead.lead_category || 'Lead', <StatusPill>{lead.stage || lead.status || 'New'}</StatusPill>, lead.assigned_agent_id || 'Unassigned', ...(canViewFinancials ? [formatCurrency(lead.budget || lead.estimated_value || 0)] : []), formatDateShort(lead.updated_at || lead.created_at)] }))} /> : <EmptyState title="No leads match these filters" copy="This branch has no visible leads for the selected filters." icon={Users} />}
          </section>
        ) : null}

        {activeTab === 'performance' ? (
          <section className="space-y-5">
            <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
              <SectionTitle eyebrow="Performance" title="Branch operating trends" copy="Listings, transactions, and registrations are grouped across the selected period." />
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {Object.entries(workspacePerformance?.trends || {}).map(([key, values]) => {
                  const label = key === 'transactions' ? 'Transactions opened' : key === 'registrations' ? 'Registrations completed' : 'Listings created'
                  const peak = Math.max(...values, 1)
                  return <article key={key} className="rounded-[18px] border border-[#e3edf5] bg-[#fbfdff] p-4"><p className="text-sm font-semibold text-[#142132]">{label}</p><div className="mt-5 flex h-24 items-end gap-1.5" aria-label={`${label} trend`}>{values.map((value, index) => <span key={index} className="min-w-0 flex-1 rounded-t-sm bg-[#08784b]" style={{ height: `${Math.max(value ? 12 : 4, Math.round(value / peak * 100))}%`, opacity: 0.45 + index / 20 }} />)}</div><p className="mt-3 text-xs text-[#71849a]">{values.reduce((total, value) => total + value, 0)} events in this period</p></article>
                })}
              </div>
            </section>

            <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
              <SectionTitle eyebrow="Conversion funnel" title="From enquiry to registration" copy="Each stage follows the canonical lead and transaction lifecycle values already recorded for this branch." />
              <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {(workspacePerformance?.funnel || []).map((stage) => {
                  const tab = ['leads', 'qualified', 'viewings'].includes(stage.key) ? 'leads' : 'transactions'
                  const filter = stage.key === 'leads' ? {} : { stage: stage.key === 'transactions' ? 'active' : stage.key }
                  return <button key={stage.key} type="button" onClick={() => navigateToTab(tab, filter)} className="rounded-[16px] border border-[#e1eaf3] bg-[#fbfdff] p-4 text-left transition hover:border-[#9ecbb7] hover:bg-white"><p className="text-sm font-semibold text-[#405b75]">{stage.label}</p><div className="mt-2 flex items-end justify-between gap-3"><strong className="text-2xl tracking-[-0.04em] text-[#142132]">{stage.count}</strong><span className="text-xs font-semibold text-[#08784b]">{stage.rate == null ? 'Starting point' : `${stage.rate}% through`}</span></div></button>
                })}
              </div>
            </section>

            <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
              <SectionTitle eyebrow="Agent comparison" title="Production by agent" copy="Counts reflect branch records created or updated during the selected period." />
              {(workspacePerformance?.agentPerformance || []).length ? <div className="mt-5"><SimpleTable columns={['Agent', 'Listings', 'Transactions', 'Transaction/listing rate', canViewFinancials ? 'Projected commission' : null].filter(Boolean)} rows={workspacePerformance.agentPerformance.map((agent) => [agent.name, agent.listings, agent.transactions, agent.conversion == null ? '—' : `${agent.conversion}%`, ...(canViewFinancials ? [formatCurrency(agent.commission)] : [])])} /></div> : <div className="mt-5"><EmptyState title="No agent performance for this period" copy="Performance will appear when branch agents own listings or transactions in the selected date range." icon={Users} /></div>}
            </section>

            {canViewFinancials ? <section className="grid gap-3 sm:grid-cols-2"><KpiCard label="Projected commission" value={formatCurrency(workspacePerformance?.financials?.projectedCommission || 0)} helper="Active transactions" icon={Banknote} tone="green" /><KpiCard label="Registered commission" value={formatCurrency(workspacePerformance?.financials?.registeredCommission || 0)} helper="Registered during the selected period" icon={Banknote} tone="blue" /></section> : <p className="rounded-[16px] border border-[#dfe8f1] bg-[#fbfdff] px-4 py-3 text-sm text-[#60758b]">Financial performance is restricted to roles with commission visibility.</p>}
          </section>
        ) : null}

        {activeTab === 'compliance' ? (
          canViewCompliance ? <section className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[
                ['Mandate completion', workspacePerformance?.compliance?.mandate],
                ['Transaction compliance', workspacePerformance?.compliance?.transaction],
                ['Outstanding documents', workspacePerformance?.compliance?.documents],
              ].map(([label, metric]) => {
                const isDocuments = label === 'Outstanding documents'
                const value = !metric?.available ? '—' : isDocuments ? metric.outstanding : `${metric.complete}/${metric.total}`
                const helper = !metric?.available ? 'No compatible branch records available' : isDocuments ? 'Transactions flagged with missing documents' : 'Completed versus tracked records'
                return <KpiCard key={label} label={label} value={value} helper={helper} icon={ShieldCheck} tone={isDocuments && metric?.outstanding ? 'gold' : 'green'} />
              })}
            </section>
            <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
              <SectionTitle eyebrow="Exceptions" title="Compliance follow-up" copy="Only record-level operational status is shown here; identity documents and verification details stay in their authorised workflows." />
              {(workspacePerformance?.compliance?.exceptions || []).length ? <div className="mt-5 space-y-2">{workspacePerformance.compliance.exceptions.map((item) => <button key={item.id} type="button" onClick={() => navigate(item.kind === 'listing' ? `/agent/listings/${encodeURIComponent(item.recordId)}` : `/transactions/${encodeURIComponent(item.recordId)}`, { state: { returnTo: `${location.pathname}${location.search}` } })} className="flex w-full items-center justify-between gap-4 rounded-[16px] border border-[#e5edf5] bg-[#fbfdff] px-4 py-3 text-left transition hover:border-[#d6ad6a] hover:bg-white"><span><span className="block text-sm font-semibold text-[#142132]">{item.title}</span><span className="mt-1 block text-xs text-[#71849a]">{item.detail}</span></span><span className="shrink-0 text-sm font-semibold text-[#08784b]">Review</span></button>)}</div> : <div className="mt-5"><EmptyState title="No tracked compliance exceptions" copy="There are no outstanding mandate, transaction-compliance, or document flags in the branch records available to this workspace." icon={ShieldCheck} /></div>}
            </section>
          </section> : <EmptyState title="Compliance access is restricted" copy="This summary is available only to authorised branch management and compliance roles." icon={ShieldCheck} />
        ) : null}

        {activeTab === 'settings' ? (
          canManageBranch ? <section className="space-y-5">
            <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
              <SectionTitle eyebrow="Settings" title="Branch administration" copy="Edit the branch profile, manage its team, and review the organisation configurations available to this office." />
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <article className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfdff] p-5"><p className="text-sm font-semibold text-[#1f3348]">Branch information</p><p className="mt-2 text-sm leading-6 text-[#6b7d93]">{branchLocation} · {branch?.email || 'No branch email'} · {branch?.phone || 'No branch phone'}</p><div className="mt-4"><ActionButton icon={Building2} onClick={() => setSettingsOpen(true)}>Edit branch</ActionButton></div></article>
                <article className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfdff] p-5"><p className="text-sm font-semibold text-[#1f3348]">Staff and roles</p><p className="mt-2 text-sm leading-6 text-[#6b7d93]">{branchStaffRows.filter((member) => !member.isPendingInvite).length} staff · {pendingInvites.length} pending invitation{pendingInvites.length === 1 ? '' : 's'}</p><div className="mt-4 flex flex-wrap gap-2"><ActionButton icon={UserPlus} onClick={openBranchAgentInvite}>Invite staff</ActionButton><ActionButton onClick={() => navigateToTab('staff')}>Manage staff</ActionButton></div></article>
                <article className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfdff] p-5"><p className="text-sm font-semibold text-[#1f3348]">Commission configuration</p><p className="mt-2 text-sm leading-6 text-[#6b7d93]">{canViewFinancials ? `${commissionStructures.length} active structure${commissionStructures.length === 1 ? '' : 's'} available for branch staff.` : 'Commission configuration is restricted to authorised financial roles.'}</p>{canViewFinancials ? <div className="mt-4"><ActionButton onClick={() => navigate('/agency/commission')}>Manage commission</ActionButton></div> : null}</article>
              </div>
            </section>

            <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
              <SectionTitle eyebrow="Connections and partners" title="Organisation services available to this branch" copy="Connections remain organisation-managed; this branch view shows only the available configuration, not credentials." />
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <article className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfdff] p-5"><p className="text-sm font-semibold text-[#1f3348]">Portal and lead channels</p><p className="mt-2 text-sm leading-6 text-[#6b7d93]">Property portals, website forms, social channels, WhatsApp, and email are configured at organisation level. Branch routing is applied only where a saved rule exists.</p></article>
                <article className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfdff] p-5"><p className="text-sm font-semibold text-[#1f3348]">Preferred transaction partners</p><p className="mt-2 text-sm leading-6 text-[#6b7d93]">{preferredPartners.length ? preferredPartners.slice(0, 3).map((partner) => partner.companyName || partner.name || partner.partnerType).filter(Boolean).join(', ') : 'No active preferred partners are configured.'}</p></article>
              </div>
            </section>

            <section className="rounded-[22px] border border-[#f0d8d4] bg-[#fffafa] p-5 shadow-[0_12px_28px_rgba(24,45,68,0.04)] sm:p-6">
              <SectionTitle eyebrow="Danger zone" title="Branch trading status" copy={branch?.isActive === false ? 'This branch is inactive. Reactivation restores it to normal branch lists.' : activeDeals ? `${activeDeals} active transaction${activeDeals === 1 ? '' : 's'} must be resolved or reassigned before this branch can be archived.` : 'Archiving keeps historical records but removes this branch from active operations.'} />
              <div className="mt-5"><ActionButton variant="danger" onClick={() => setArchiveOpen(true)}>{branch?.isActive === false ? 'Reactivate branch' : 'Archive branch'}</ActionButton></div>
            </section>
          </section> : <EmptyState title="Branch settings are restricted" copy="Only authorised owners, principals, and branch managers can change branch administration settings." icon={Settings} />
        ) : null}
      </section>
      <ConfirmDialog open={archiveOpen} title={branch?.isActive === false ? 'Reactivate branch?' : 'Archive branch?'}
        description={branch?.isActive === false ? 'This restores the branch to active operations. Existing records remain unchanged.' : activeDeals ? 'This branch has active transactions and cannot be archived until they are resolved or reassigned.' : 'This archives the branch without deleting its historical staff or transactions. You can reactivate it later.'}
        confirming={archiveSaving} onCancel={() => setArchiveOpen(false)} onConfirm={async () => {
          setArchiveSaving(true)
          setActionError('')
          try {
            if (branch?.isActive !== false && activeDeals > 0) {
              throw new Error('Resolve or reassign active transactions before archiving this branch.')
            }
            const updated = await updateBranch(branchId, { isActive: branch?.isActive === false })
            setBranch(updated)
            setArchiveOpen(false)
          } catch (saveError) { setActionError(saveError.message || 'Unable to change branch status.') }
          finally { setArchiveSaving(false) }
        }} />
      <BranchSettingsModal
        open={settingsOpen}
        branch={branch}
        onClose={() => setSettingsOpen(false)}
        onSaved={handleBranchSaved}
      />
      <BranchInviteDetailModal
        open={Boolean(selectedAgentRow)}
        invite={selectedAgentRow}
        branch={branch}
        organisation={organisationContext.organisation}
        onClose={() => setSelectedAgentRow(null)}
        onResent={() => void loadWorkspace()}
      />
      <BranchAgentInviteModal
        open={agentInviteOpen}
        branch={branch}
        organisation={organisationContext.organisation}
        profile={organisationContext.profile}
        commissionStructures={commissionStructures}
        onCommissionStructureCreated={(structure) => setCommissionStructures((previous) => [...previous.filter((item) => item.id !== structure.id), structure])}
        onClose={() => setAgentInviteOpen(false)}
        onSent={() => {
          setAgentInviteOpen(false)
          navigateToTab('staff')
          void loadWorkspace()
        }}
      />
    </section>
  )
}
