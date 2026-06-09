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
  MoreHorizontal,
  Plus,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Field from '../../components/ui/Field'
import Modal from '../../components/ui/Modal'
import {
  AGENT_ROLE_OPTIONS,
  buildAgentInviteLink,
} from '../../lib/agentInviteService'
import {
  assignOrganisationUserCommissionProfile,
  fetchOrganisationSettings,
  listOrganisationCommissionStructures,
} from '../../lib/settingsApi'
import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { formatSouthAfricanWhatsAppNumber, sendWhatsAppNotification } from '../../lib/whatsapp'
import { createInvite } from '../../services/inviteService'
import { getAgentLeaderboard } from '../../services/branchAnalyticsService'
import { getBranch, getBranchListings, getBranchTransactions, updateBranch } from '../../services/agencyBranchService'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'agents', label: 'Agents' },
  { key: 'listings', label: 'Listings' },
  { key: 'transactions', label: 'Transactions' },
  { key: 'clients', label: 'Clients' },
  { key: 'reporting', label: 'Reporting' },
  { key: 'documents', label: 'Documents' },
  { key: 'settings', label: 'Settings' },
]

function normalizeText(value) {
  return String(value || '').trim()
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

function buildInviteMessage({ invite, inviteLink }) {
  const agentName = `${invite?.firstName || ''} ${invite?.surname || ''}`.trim() || 'Agent'
  const orgName = invite?.organisationName || 'your organisation'
  return `Hi ${agentName},\n\nYou have been invited to join ${orgName} on Bridge 9.\n\nComplete your agent onboarding here:\n${inviteLink}\n\n- Bridge`
}

async function sendBranchInviteEmail({ invite, organisationName }) {
  const recipientEmail = normalizeText(invite?.email)
  const inviteLink = buildAgentInviteLink(invite?.token)
  if (!recipientEmail) {
    throw new Error('Invite email address is missing.')
  }
  if (!inviteLink) {
    throw new Error('Invite link is missing.')
  }
  if (!isSupabaseConfigured) {
    throw new Error('Email sending is unavailable because Supabase is not configured.')
  }

  const emailResult = await invokeEdgeFunction('send-email', {
    body: {
      type: 'branch_invite',
      to: recipientEmail,
      inviteeName: invite?.name || `${invite?.firstName || ''} ${invite?.surname || ''}`.trim(),
      organisationName: organisationName || invite?.organisationName || 'Bridge Organisation',
      workspaceRole: 'agent',
      inviteLink,
    },
  })
  if (emailResult?.error) {
    throw emailResult.error
  }
  return inviteLink
}

function normalizeAgentInviteRole(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'super_admin') return 'owner'
  if (normalized === 'admin' || normalized === 'branch_admin') return 'admin_staff'
  if (normalized === 'senior_agent') return 'agent'
  if (normalized === 'branch_manager') return 'branch_manager'
  if (normalized === 'principal') return 'principal'
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
    location: '',
    managerName: '',
    email: '',
    phone: '',
    isActive: true,
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
      location: branch.location || '',
      managerName: branch.principalName === 'Principal pending' ? '' : branch.principalName || '',
      email: branch.email || '',
      phone: branch.phone || '',
      isActive: branch.isActive !== false,
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
      subtitle="Update the branch profile, contact details, manager label, and active status."
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
        <label className="grid gap-1.5 md:col-span-2">
          <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Address</span>
          <Field value={form.address} onChange={(event) => updateField('address', event.target.value)} />
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
        <label className="flex items-center gap-3 rounded-[14px] border border-[#e1e8f2] bg-[#fbfcfe] px-4 py-3 md:col-span-2">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(event) => updateField('isActive', event.target.checked)}
            className="h-4 w-4 rounded border-[#cbd8e6] text-[#163247] focus:ring-[#163247]"
          />
          <span className="text-sm font-semibold text-[#263f58]">Branch is active</span>
        </label>
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
  onClose,
  onSent,
}) {
  const defaultCommissionStructure = commissionStructures.find((structure) => structure?.isDefault) || null
  const hasCommissionStructures = commissionStructures.length > 0
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
      commissionStructureId: defaultCommissionStructure?.id || '',
      notes: '',
    })
    setError('')
  }, [defaultCommissionStructure?.id, open])

  function updateField(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  async function sendInviteNotifications(invite) {
    const inviteLink = buildAgentInviteLink(invite?.token)
    const inviteMessage = buildInviteMessage({ invite, inviteLink })
    const recipientEmail = normalizeText(invite?.email)
    const recipientPhone = formatSouthAfricanWhatsAppNumber(invite?.mobile)

    if (recipientEmail && isSupabaseConfigured) {
      try {
        await sendBranchInviteEmail({
          invite,
          organisationName: invite?.organisationName || organisation?.name || 'Bridge Organisation',
        })
      } catch (sendError) {
        console.error('[Branch Agent Invite] email send failed', sendError)
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
        console.error('[Branch Agent Invite] WhatsApp send failed', sendError)
      }
    }

    return inviteLink
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!normalizeText(form.firstName) || !normalizeText(form.surname) || !normalizeText(form.email) || !normalizeText(form.mobile)) {
      setError('First name, surname, email, and mobile number are required.')
      return
    }
    if (!hasCommissionStructures) {
      setError('Create a commission structure before inviting agents.')
      return
    }
    const selectedCommissionStructure =
      commissionStructures.find((structure) => structure.id === form.commissionStructureId) ||
      defaultCommissionStructure
    if (!selectedCommissionStructure?.id) {
      setError('Select a commission structure before inviting this agent.')
      return
    }

    try {
      setSubmitting(true)
      setError('')
      const inviteResult = await createInvite({
        invite_type: 'branch_invite',
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        target_workspace_id: organisation?.id || branch?.organisationId,
        target_workspace_role: normalizeAgentInviteRole(form.role),
        target_branch_id: branch?.id,
        email: form.email,
        phone: form.mobile,
        metadata: {
          source: 'branch_workspace_agent_invite',
          first_name: normalizeText(form.firstName),
          last_name: normalizeText(form.surname),
          mobile: normalizeText(form.mobile),
          branch_name: branch?.name || '',
          role: form.role,
          commission_structure_id: selectedCommissionStructure.id,
          commission_structure_name: selectedCommissionStructure.name,
          notes: normalizeText(form.notes),
          invited_by_name: profile?.fullName || profile?.name || profile?.email || '',
        },
      })
      const invite = {
        id: inviteResult.invite_id,
        token: inviteResult.token,
        firstName: form.firstName,
        surname: form.surname,
        email: form.email,
        mobile: form.mobile,
        organisationName: organisation?.name || 'Bridge Organisation',
      }

      await assignOrganisationUserCommissionProfile({
        email: form.email,
        commissionStructureId: selectedCommissionStructure.id,
      })
      await sendInviteNotifications(invite)
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
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" form="branch-agent-invite-form" disabled={submitting}>{submitting ? 'Sending Invite...' : 'Send Invite'}</Button>
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
              <Field value={organisation?.name || 'Bridge Organisation'} disabled />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Branch</span>
              <Field value={branch?.name || 'Selected branch'} disabled />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Role / Permission</span>
              <Field as="select" value={form.role} onChange={(event) => updateField('role', event.target.value)}>
                {AGENT_ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Commission Structure</span>
              <Field as="select" value={form.commissionStructureId} onChange={(event) => updateField('commissionStructureId', event.target.value)}>
                <option value="">{hasCommissionStructures ? 'Select commission structure' : 'No commission structures available'}</option>
                {commissionStructures.map((structure) => (
                  <option key={structure.id} value={structure.id}>
                    {structure.name} ({formatPercent(structure.agentSplitPercentage)} agent / {formatPercent(structure.agencySplitPercentage)} agency)
                  </option>
                ))}
              </Field>
            </label>
          </div>
          {!hasCommissionStructures ? (
            <div className="mt-3 rounded-[12px] border border-[#f3d9a8] bg-[#fff8ec] px-3 py-2 text-sm text-[#8a5b13]">
              Create a commission structure in Settings before inviting branch agents.
            </div>
          ) : null}
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
      await sendBranchInviteEmail({
        invite,
        organisationName: organisation?.name || 'Bridge Organisation',
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
  const { branchId = '' } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [branch, setBranch] = useState(null)
  const [branchTransactions, setBranchTransactions] = useState([])
  const [branchListings, setBranchListings] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [pendingInvites, setPendingInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [agentInviteOpen, setAgentInviteOpen] = useState(false)
  const [selectedAgentRow, setSelectedAgentRow] = useState(null)
  const [organisationContext, setOrganisationContext] = useState({ organisation: null, profile: null })
  const [commissionStructures, setCommissionStructures] = useState([])

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [branchRow, transactions, listings, topAgents] = await Promise.all([
        getBranch(branchId),
        getBranchTransactions(branchId),
        getBranchListings(branchId),
        getAgentLeaderboard(branchId),
      ])

      if (!branchRow) {
        throw new Error('Branch not found or no longer accessible.')
      }

      setBranch(branchRow)
      setBranchTransactions(transactions)
      setBranchListings(listings)
      setLeaderboard(topAgents)

      const [settingsContext, structures, branchInvites] = await Promise.all([
        fetchOrganisationSettings().catch(() => null),
        listOrganisationCommissionStructures().catch(() => []),
        listPendingBranchInvites(branchId).catch((inviteError) => {
          console.warn('[Branch Workspace] pending invites unavailable', inviteError)
          return []
        }),
      ])
      setOrganisationContext({
        organisation: settingsContext?.organisation || null,
        profile: settingsContext?.profile || null,
      })
      setCommissionStructures(Array.isArray(structures) ? structures.filter((structure) => structure?.isActive !== false) : [])
      setPendingInvites(branchInvites)
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load branch workspace right now.')
    } finally {
      setLoading(false)
    }
  }, [branchId])

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

  const pipelineValue = Number(branch?.kpis?.pipelineValue || 0)
  const revenueSecured = pipelineValue * 0.03
  const monthlyPerformance = Math.max(0, Math.round(revenueSecured / 1000))
  const branchName = branch?.name || 'Branch Workspace'
  const branchLocation = normalizeText(branch?.location) || [branch?.city, branch?.province].map(normalizeText).filter(Boolean).join(', ') || 'Location pending'
  const activeAgents = Number(branch?.kpis?.activeAgents ?? leaderboard.length ?? 0)
  const listingCount = Number(branch?.kpis?.activeListings ?? branchListings.length)
  const conversionRate = Number(branch?.kpis?.conversionRate || closedRate || 0)

  const openBranchAgentInvite = useCallback(() => {
    setAgentInviteOpen(true)
  }, [])

  const handleBranchSaved = useCallback((updatedBranch) => {
    if (updatedBranch) {
      setBranch(updatedBranch)
    }
    void loadWorkspace()
  }, [loadWorkspace])

  const activityItems = useMemo(() => {
    const transactions = branchTransactions.slice(0, 5).map((row) => ({
      id: `tx-${row.id}`,
      actor: row.assigned_agent || row.assigned_agent_email || 'Branch team',
      title: 'Transaction updated',
      detail: `${row.transaction_reference || row.id} - ${row.stage || 'In progress'}`,
      timestamp: row.updated_at || row.created_at,
      icon: ArrowRightLeft,
    }))
    const listings = branchListings.slice(0, 4).map((listing) => ({
      id: `listing-${listing.id}`,
      actor: listing.assigned_agent_name || listing.assigned_agent_email || 'Branch team',
      title: 'Listing activity',
      detail: `${listing.listing_title || listing.id} - ${listing.listing_status || 'Active'}`,
      timestamp: listing.updated_at || listing.created_at,
      icon: Building2,
    }))
    return [...transactions, ...listings]
      .sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0))
      .slice(0, 7)
  }, [branchListings, branchTransactions])

  const agentPerformanceRows = useMemo(() => leaderboard.map((agent) => [
    agent.name,
    String(agent.listings || 0),
    String(agent.transactions || 0),
    String(agent.registered || agent.registeredDeals || 0),
    formatCurrency(agent.revenue || 0),
    formatPercent(agent.conversionRate || 0),
  ]), [leaderboard])

  const branchAgentRows = useMemo(() => {
    const activeRows = leaderboard.map((agent) => ({
      id: agent.id || agent.email || agent.name,
      routeId: agent.id || agent.userId || agent.email || agent.name,
      name: agent.name || 'Agent',
      role: formatRoleLabel(agent.role || 'agent'),
      listings: agent.listings || 0,
      transactions: agent.transactions || 0,
      registered: agent.registered || agent.registeredDeals || 0,
      revenue: agent.revenue || 0,
      conversionRate: agent.conversionRate || 0,
      status: agent.status || 'Active',
      statusTone: normalizeLower(agent.status) === 'invited' ? 'invited' : 'active',
      lastActive: agent.lastActive,
      email: agent.email || '',
      phone: agent.phone || '',
      commissionStructureName: agent.commissionStructureName || '',
      isPendingInvite: false,
    }))

    const activeEmails = new Set(activeRows.map((agent) => normalizeLower(agent.email)).filter(Boolean))
    const visiblePendingInvites = pendingInvites.filter((invite) => !activeEmails.has(normalizeLower(invite.email)))
    return [...visiblePendingInvites, ...activeRows]
  }, [leaderboard, pendingInvites])

  function handleAgentRowClick(agent) {
    if (!agent) return
    if (agent.isPendingInvite) {
      setSelectedAgentRow(agent)
      return
    }
    const routeId = normalizeText(agent.routeId || agent.id)
    if (routeId) {
      navigate(`/agency/agents/${encodeURIComponent(routeId)}`)
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
      <section className="rounded-[24px] border border-[#dfe8f1] bg-white px-5 py-4 shadow-[0_14px_34px_rgba(24,45,68,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <button type="button" onClick={() => navigate('/agency/branches')} className="inline-flex items-center gap-2 text-[0.74rem] font-semibold uppercase tracking-[0.12em] text-[#6b7d93] transition hover:text-[#163247]">
              <ArrowLeft size={14} />
              Back to Branches
            </button>
            <div className="mt-3 flex min-w-0 items-center gap-4">
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
                  <span>{activeAgents} agents</span>
                  <span>{activeDeals} active deals</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[15px] bg-[#163247] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,50,71,0.2)] transition hover:-translate-y-0.5 hover:bg-[#1d435f]"
              onClick={() => navigate('/new-transaction', { state: { branchId } })}
            >
              <Plus size={16} />
              Add Transaction
            </button>
            <ActionButton icon={UserPlus} onClick={openBranchAgentInvite}>Add Agent</ActionButton>
            <ActionButton icon={Settings} onClick={() => setSettingsOpen(true)} aria-label="Branch settings" />
            <ActionButton aria-label="More branch actions"><MoreHorizontal size={17} /></ActionButton>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
        <KpiCard label="Agents" value={activeAgents} helper="Active branch users" icon={Users} tone="blue" />
        <KpiCard label="Listings" value={listingCount} helper="Live inventory" icon={Building2} tone="slate" />
        <KpiCard label="Active Deals" value={activeDeals} helper={`${branchTransactions.length} total tracked`} icon={ArrowRightLeft} tone="gold" />
        <KpiCard label="Revenue Secured" value={formatCurrency(revenueSecured)} helper="Estimated commission value" icon={Banknote} tone="green" />
        <KpiCard label="Close Rate" value={formatPercent(closedRate)} helper={`${closedDeals} registered deals`} icon={FileCheck2} tone="navy" />
        <KpiCard label="Performance Trend" value={`${monthlyPerformance}k`} helper="Monthly revenue signal" icon={TrendingUp} tone="blue" />
      </section>

      <section className="rounded-[20px] border border-[#dfe8f1] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(24,45,68,0.04)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton icon={Building2} onClick={() => setSettingsOpen(true)}>Edit Branch</ActionButton>
            <ActionButton icon={UserPlus} onClick={openBranchAgentInvite}>Invite Agent</ActionButton>
            <ActionButton icon={Settings} onClick={() => setSettingsOpen(true)}>Branch Settings</ActionButton>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton variant="danger">Archive Branch</ActionButton>
            <ActionButton aria-label="More branch actions"><MoreHorizontal size={17} /></ActionButton>
          </div>
        </div>
      </section>

      <section className="overflow-x-auto pb-1">
        <div className="grid w-full min-w-[760px] grid-cols-8 items-center rounded-[18px] border border-[#dfe8f1] bg-white p-1 shadow-[0_10px_24px_rgba(24,45,68,0.04)]">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`min-h-[38px] rounded-[14px] px-3 text-center text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'bg-[#163247] text-white shadow-[0_8px_18px_rgba(22,50,71,0.18)]'
                  : 'text-[#5f7187] hover:bg-[#f6f9fc] hover:text-[#163247]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        {activeTab === 'overview' ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.85fr)_minmax(300px,0.9fr)]">
            <div className="min-w-0 space-y-5">
              <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
                <SectionTitle eyebrow="Executive Overview" title="Branch Performance Cockpit" copy="Pipeline health, transaction velocity, listing movement, and conversion quality in one operating view." />
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard label="Pipeline Value" value={formatCurrency(pipelineValue)} helper="Open branch portfolio" icon={BarChart3} tone="blue" />
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
                  <KpiCard label="Revenue Signal" value={formatCurrency(revenueSecured)} helper="Estimated commission" icon={Banknote} tone="blue" />
                </div>
              </section>

              <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
                <SectionTitle eyebrow="Team Output" title="Agent Performance Snapshot" copy="Quick visibility into production across listings, active deals, registered outcomes, and revenue signal." />
                <div className="mt-5">
                  {agentPerformanceRows.length ? (
                    <SimpleTable
                      columns={['Agent', 'Listings', 'Active Deals', 'Registered', 'Revenue Signal', 'Conversion']}
                      rows={agentPerformanceRows}
                    />
                  ) : (
                    <EmptyState title="Agent performance will appear here" copy="Agent performance will appear here once agents start managing listings and transactions." icon={Users} />
                  )}
                </div>
              </section>
            </div>

            <aside className="min-w-0 xl:sticky xl:top-5 xl:self-start">
              <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
                <SectionTitle eyebrow="Live Feed" title="Recent Activity" copy="Agent, transaction, listing, and client movements will appear here in real time." />
                <div className="mt-5 space-y-3">
                  {activityItems.length ? (
                    activityItems.map((item) => {
                      const Icon = item.icon
                      return (
                        <article key={item.id} className="flex items-start gap-3 rounded-[18px] border border-[#e7eef6] bg-[#fbfdff] px-4 py-3 transition hover:border-[#cbd9e7] hover:bg-white">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf4fb] text-[#35546c]">
                            <Icon size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[#142132]">{item.title}</p>
                            <p className="mt-1 text-sm leading-5 text-[#60758b]">{item.actor}</p>
                            <p className="mt-0.5 text-xs leading-5 text-[#7d8fa4]">{item.detail}</p>
                          </div>
                          <time className="shrink-0 text-[0.7rem] font-semibold text-[#8a9bb0]">{formatDateShort(item.timestamp)}</time>
                        </article>
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

        {activeTab === 'agents' ? (
          branchAgentRows.length ? (
            <SimpleTable
              columns={['Name', 'Role', 'Listings', 'Transactions', 'Revenue', 'Status', 'Last Update']}
              rows={branchAgentRows.map((agent) => ({
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
                  formatCurrency(agent.revenue || 0),
                  <StatusPill tone={agent.statusTone}>{agent.status || 'Active'}</StatusPill>,
                  formatDateShort(agent.lastActive),
                ],
              }))}
            />
          ) : (
            <EmptyState
              title="No agents yet"
              copy="Invite branch agents to unlock team performance and deal ownership tracking."
              icon={Users}
              action={<ActionButton icon={UserPlus} onClick={openBranchAgentInvite}>Invite Agent</ActionButton>}
            />
          )
        ) : null}

        {activeTab === 'listings' ? (
          branchListings.length ? (
            <SimpleTable
              columns={['Listing', 'Status', 'Asking Price', 'Assigned Agent', 'Updated']}
              rows={branchListings.map((listing) => [
                listing.listing_title || listing.id,
                listing.listing_status || listing.stage || 'active',
                formatCurrency(listing.asking_price || 0),
                listing.assigned_agent_name || listing.assigned_agent_email || 'Unassigned',
                formatDateShort(listing.updated_at),
              ])}
            />
          ) : (
            <EmptyState title="No listings yet" copy="Create or assign listings to this branch to start branch-level inventory tracking." icon={Building2} />
          )
        ) : null}

        {activeTab === 'transactions' ? (
          branchTransactions.length ? (
            <SimpleTable
              columns={['Reference', 'Stage', 'Agent', 'Value', 'Status', 'Updated']}
              rows={branchTransactions.map((row) => [
                row.transaction_reference || row.id,
                row.stage || 'In progress',
                row.assigned_agent || row.assigned_agent_email || 'Unassigned',
                formatCurrency(row.sales_price || row.purchase_price || 0),
                row.lifecycle_state || 'active',
                formatDateShort(row.updated_at),
              ])}
            />
          ) : (
            <EmptyState title="No transactions yet" copy="Branch transactions will appear once deals are created or assigned." icon={ArrowRightLeft} />
          )
        ) : null}

        {activeTab === 'clients' ? (
          <EmptyState title="Client workspace coming next" copy="Client rollups per branch will be wired into the branch operating cockpit." icon={Users} />
        ) : null}

        {activeTab === 'reporting' ? (
          <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
            <SectionTitle eyebrow="Reporting" title="Branch Intelligence" copy="Revenue trends, conversion quality, and comparative branch performance." />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <KpiCard label="Pipeline" value={formatCurrency(pipelineValue)} helper="Open portfolio value" icon={BarChart3} tone="blue" />
              <KpiCard label="Conversion" value={formatPercent(conversionRate)} helper="Performance quality" icon={TrendingUp} tone="green" />
              <KpiCard label="Registered" value={branch?.kpis?.registeredDeals || closedDeals} helper="Completed outcomes" icon={FileCheck2} tone="navy" />
            </div>
          </section>
        ) : null}

        {activeTab === 'documents' ? (
          <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
            <SectionTitle eyebrow="Documents" title="Branch Document Hub" copy="Company docs, compliance files, training assets, and reporting packs." />
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Company Docs', Files],
                ['Marketing Assets', Building2],
                ['Compliance', ShieldCheck],
                ['Branch Reports', BarChart3],
              ].map(([label, Icon]) => (
                <article key={label} className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfdff] p-4">
                  <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#edf4fb] text-[#35546c]">
                    {createElement(Icon, { size: 16 })}
                  </span>
                  <p className="mt-4 text-sm font-semibold text-[#1f3348]">{label}</p>
                  <p className="mt-2 text-xs leading-5 text-[#6b7d93]">No documents uploaded yet.</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === 'settings' ? (
          <section className="rounded-[22px] border border-[#dfe8f1] bg-white p-5 shadow-[0_12px_28px_rgba(24,45,68,0.05)] sm:p-6">
            <SectionTitle eyebrow="Settings" title="Branch Controls" copy="Permissions, branding, notifications, and role boundaries for this office." />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <article className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfdff] p-5">
                <p className="text-sm font-semibold text-[#1f3348]">Permissions</p>
                <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Principal, manager, and agent access policies are branch-scoped.</p>
              </article>
              <article className="rounded-[18px] border border-[#e4ebf4] bg-[#fbfdff] p-5">
                <p className="text-sm font-semibold text-[#1f3348]">Branding</p>
                <p className="mt-2 text-sm leading-6 text-[#6b7d93]">Branch logo, cover image, and notification identity settings.</p>
              </article>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <ActionButton icon={Building2} onClick={() => setSettingsOpen(true)}>Edit Branch Details</ActionButton>
              <ActionButton icon={UserPlus} onClick={openBranchAgentInvite}>Invite Agent To Branch</ActionButton>
            </div>
          </section>
        ) : null}
      </section>
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
        onClose={() => setAgentInviteOpen(false)}
        onSent={() => {
          setAgentInviteOpen(false)
          setActiveTab('agents')
          void loadWorkspace()
        }}
      />
    </section>
  )
}
