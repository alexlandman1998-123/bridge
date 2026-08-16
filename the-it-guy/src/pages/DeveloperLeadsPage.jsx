import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  EyeOff,
  Filter,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEVELOPER_LEAD_PHASE16_CONTRACT,
  buildDeveloperLeadLaunchReadiness,
} from '../core/developerLeads/developerLeadLaunchReadiness'
import {
  DEVELOPER_LEAD_PHASE17_CONTRACT,
  buildDeveloperLeadTransactionHandoff,
  summarizeDeveloperLeadTransactionHandoffs,
} from '../core/developerLeads/developerLeadTransactionHandoff'
import {
  DEVELOPER_LEAD_PHASE21_CONTRACT,
  buildProtectedDeveloperLeadQueue,
  summarizeProtectedDeveloperLeadQueue,
} from '../core/developerLeads/developerLeadProtectedIntakeQueue'
import {
  DEVELOPER_LEAD_PHASE23_CONTRACT,
  buildReleasedDeveloperLeadConversionQueue,
  summarizeReleasedDeveloperLeadConversionQueue,
} from '../core/developerLeads/developerLeadReleasedConversionQueue'
import {
  DEVELOPER_LEAD_PHASE25_CONTRACT,
  buildDeveloperLeadAttributionLedger,
  summarizeDeveloperLeadAttributionLedger,
} from '../core/developerLeads/developerLeadAttributionLedger'
import {
  DEVELOPER_LEAD_PHASE26_CONTRACT,
  buildDeveloperLeadOperationsHealth,
  summarizeDeveloperLeadOperationsHealth,
} from '../core/developerLeads/developerLeadOperationsHealth'
import { fetchDevelopmentOptions, fetchUnitsForTransactionSetup } from '../lib/api'
import { listOrganisationUsers } from '../lib/settingsApi'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { useWorkspace } from '../context/WorkspaceContext'
import Button from '../components/ui/Button'
import {
  DEVELOPER_LEAD_PHASE18_CONTRACT,
  convertDeveloperLeadToTransactionAndSendOnboarding,
} from '../services/developerLeadConversionService'
import {
  DEVELOPER_LEAD_PHASE11_CONTRACT,
  DEVELOPER_LEAD_PHASE12_CONTRACT,
  DEVELOPER_LEAD_SOURCE_FILTER_OPTIONS,
  DEVELOPER_LEAD_STATUS_OPTIONS,
  createDeveloperFedLead,
  findDeveloperLeadDuplicateWarnings,
  listDeveloperLeadIntake,
  requestAgencyLeadHandover,
} from '../services/developerLeadService'

const EMPTY_FORM = {
  buyerFullName: '',
  buyerEmail: '',
  buyerPhone: '',
  leadSource: 'developer_direct',
  primaryDevelopmentId: '',
  preferredUnitId: '',
  interestedDevelopmentIds: [],
  assignedAgentId: '',
  unitTypeInterest: '',
  budgetMin: '',
  budgetMax: '',
  privateNotes: '',
}

const LEAD_SOURCE_OPTIONS = [
  { key: 'developer_direct', label: 'Developer direct' },
  { key: 'walk_in', label: 'Walk-in' },
  { key: 'portal', label: 'Portal' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'referral', label: 'Referral' },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function formatCurrency(value) {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized) || normalized <= 0) return 'Open budget'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(normalized)
}

function formatDate(value) {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  return new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

function formatPercent(value) {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized) || normalized <= 0) return '0%'
  return `${Math.round(normalized * 100)}%`
}

function getUserLabel(user = {}) {
  return normalizeText(user.fullName || `${user.firstName || ''} ${user.lastName || ''}`) || normalizeText(user.email) || 'Team member'
}

function getDevelopmentLabel(developmentId, developments = []) {
  if (!developmentId) return 'Unallocated'
  return developments.find((item) => item.id === developmentId)?.name || 'Selected development'
}

function getStatusMeta(status = 'new') {
  if (status === 'converted') return { label: 'Converted', className: 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]' }
  if (status === 'reserved') return { label: 'Reserved', className: 'border-[#d9e7ff] bg-[#f3f7ff] text-[#1e4d82]' }
  if (status === 'qualified') return { label: 'Qualified', className: 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]' }
  if (status === 'contacted') return { label: 'Contacted', className: 'border-[#f0dfb8] bg-[#fff9ec] text-[#8a5a12]' }
  if (status === 'lost') return { label: 'Lost', className: 'border-[#f8d7da] bg-[#fff5f6] text-[#8d2831]' }
  return { label: 'New', className: 'border-[#e4ebf4] bg-[#f8fafc] text-[#52677f]' }
}

function isAgencyFedLead(lead = {}) {
  return lead.leadOwner === 'agency' || lead.accessProfile?.agencyFed === true
}

function requiresAgencyHandover(lead = {}) {
  return isAgencyFedLead(lead) && lead.accessProfile?.requiresHandoverBeforePrivateDetails === true
}

function StatusBadge({ status }) {
  const meta = getStatusMeta(status)
  return (
    <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  )
}

function MetricCard({ label, value, helper, icon: Icon }) {
  return (
    <div className="rounded-[8px] border border-[#dde7f2] bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">{label}</p>
          <strong className="mt-2 block text-2xl font-semibold text-[#10243a]">{value}</strong>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#eef8f2] text-[#0f8f4c]">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-2 text-sm leading-5 text-[#60758d]">{helper}</p>
    </div>
  )
}

function getReadinessTone(status = 'pending') {
  if (status === 'ready') return 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]'
  if (status === 'blocked') return 'border-[#f8d7da] bg-[#fff5f6] text-[#8d2831]'
  if (status === 'attention') return 'border-[#f0dfb8] bg-[#fff9ec] text-[#8a5a12]'
  return 'border-[#d9e5f2] bg-[#f5f8fb] text-[#52677f]'
}

function DeveloperLeadReadinessPanel({ readiness }) {
  return (
    <section className="rounded-[8px] border border-[#d9e5f2] bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Launch Readiness</p>
          <h2 className="mt-1 text-lg font-semibold text-[#10243a]">Developer lead operations</h2>
        </div>
        <span className={`inline-flex h-8 w-fit items-center rounded-full border px-3 text-xs font-semibold ${getReadinessTone(readiness.status)}`}>
          {readiness.status}
        </span>
      </div>
      <div className="developer-leads-card-grid mt-4 grid gap-3">
        {readiness.checks.map((check) => (
          <div key={check.key} className="rounded-[8px] border border-[#e5edf6] p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#29445f]">{check.label}</p>
              <span className={`inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-semibold ${getReadinessTone(check.status)}`}>
                {check.status}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-[#60758d]">{check.detail}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function getProtectedQueueTone(status = 'ready') {
  if (status === 'blocked') return 'border-[#f8d7da] bg-[#fff5f6] text-[#8d2831]'
  if (status === 'attention') return 'border-[#f0dfb8] bg-[#fff9ec] text-[#8a5a12]'
  return 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]'
}

function ProtectedDeveloperLeadQueuePanel({
  queue,
  summary,
  developments,
  handoverSubmittingId,
  onRequestHandover,
}) {
  return (
    <section className="rounded-[8px] border border-[#d9e5f2] bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.05)]" data-contract={DEVELOPER_LEAD_PHASE21_CONTRACT}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Protected Intake Queue</p>
          <h2 className="mt-1 text-lg font-semibold text-[#10243a]">Agency-submitted buyer leads</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">
            Review protected agency-fed leads, request buyer-detail handover, and keep conversion locked until the agency releases the private record.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold ${getProtectedQueueTone(summary.status)}`}>
            {summary.label}
          </span>
          <span className="inline-flex h-8 items-center rounded-full border border-[#d9e5f2] bg-[#f8fafc] px-3 text-xs font-semibold text-[#52677f]">
            {queue.releasedCount} released
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Protected</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{queue.protectedCount}</strong>
        </div>
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Can request</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{queue.handoverReadyCount}</strong>
        </div>
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Requested</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{queue.handoverRequestedCount}</strong>
        </div>
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Privacy leaks</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{queue.privacyLeaks}</strong>
        </div>
      </div>

      {queue.cards.length ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {queue.cards.slice(0, 4).map((card) => {
            const budget = card.budgetMin || card.budgetMax
              ? `${formatCurrency(card.budgetMin)} - ${formatCurrency(card.budgetMax)}`
              : 'Open budget'
            const developmentLabel = getDevelopmentLabel(card.primaryDevelopmentId, developments)
            const submitting = handoverSubmittingId === card.developerLeadId
            return (
              <article key={card.developerLeadId} className="rounded-[8px] border border-[#d9e5f2] bg-[#fbfdff] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-semibold leading-5 text-[#10243a]">{card.protectedSummary}</p>
                    <p className="mt-1 text-xs text-[#60758d]">{developmentLabel} / {card.unitTypeInterest}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[#d9e5f2] bg-white px-2.5 py-1 text-xs font-semibold text-[#52677f]">
                    {card.privacyLabel}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-[#60758d] md:grid-cols-3">
                  <span>Budget: <strong className="text-[#29445f]">{budget}</strong></span>
                  <span>Status: <strong className="text-[#29445f]">{card.leadStatus}</strong></span>
                  <span>Source: <strong className="text-[#29445f]">{card.sourceAgencyOrgId ? 'Agency' : 'Pending'}</strong></span>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#e5edf6] pt-3">
                  <p className="text-xs leading-5 text-[#7a8ba3]">Buyer identity and contact details are hidden.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!card.canRequestHandover || submitting}
                    onClick={() => onRequestHandover(card.developerLeadId)}
                  >
                    <EyeOff size={15} />
                    {card.canRequestHandover ? submitting ? 'Requesting...' : 'Request Handover' : 'Awaiting Agency'}
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-[8px] border border-dashed border-[#d9e5f2] bg-[#fbfdff] p-4 text-sm text-[#60758d]">
          {summary.detail}
        </div>
      )}
    </section>
  )
}

function DeveloperLeadCreateModal({
  open,
  form,
  saving,
  duplicateWarnings,
  developments,
  units,
  unitsLoading,
  agents,
  onClose,
  onChange,
  onSubmit,
}) {
  if (!open) return null

  const selectedInterestIds = new Set(form.interestedDevelopmentIds || [])

  function toggleInterest(id) {
    const next = selectedInterestIds.has(id)
      ? (form.interestedDevelopmentIds || []).filter((item) => item !== id)
      : [...(form.interestedDevelopmentIds || []), id]
    onChange({ ...form, interestedDevelopmentIds: next })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f2742]/35 p-6">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[8px] border border-[#d9e5f2] bg-white shadow-[0_22px_80px_rgba(15,39,66,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-[#e5edf6] px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Developer Leads</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-[#10243a]">Create Developer-Fed Lead</h2>
          </div>
          <button type="button" className="rounded-[8px] px-3 py-2 text-sm font-semibold text-[#60758d] hover:bg-[#f5f8fb]" onClick={onClose}>
            Close
          </button>
        </div>

        <form className="grid max-h-[calc(92vh-88px)] gap-6 overflow-y-auto p-6" onSubmit={onSubmit}>
          {duplicateWarnings.length ? (
            <div className="rounded-[8px] border border-[#f0dfb8] bg-[#fff9ec] p-4 text-sm text-[#8a5a12]">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Possible duplicate lead</p>
                  <p className="mt-1">A developer lead with matching contact details already exists. You can still save this lead if it is intentional.</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold text-[#29445f]">
              Buyer name
              <input className="h-11 rounded-[8px] border border-[#d9e5f2] px-3 text-sm text-[#10243a] outline-none focus:border-[#0f8f4c]" value={form.buyerFullName} onChange={(event) => onChange({ ...form, buyerFullName: event.target.value })} required />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#29445f]">
              Email
              <input className="h-11 rounded-[8px] border border-[#d9e5f2] px-3 text-sm text-[#10243a] outline-none focus:border-[#0f8f4c]" type="email" value={form.buyerEmail} onChange={(event) => onChange({ ...form, buyerEmail: event.target.value })} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#29445f]">
              Phone
              <input className="h-11 rounded-[8px] border border-[#d9e5f2] px-3 text-sm text-[#10243a] outline-none focus:border-[#0f8f4c]" value={form.buyerPhone} onChange={(event) => onChange({ ...form, buyerPhone: event.target.value })} />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold text-[#29445f]">
              Primary development
              <select className="h-11 rounded-[8px] border border-[#d9e5f2] px-3 text-sm text-[#10243a] outline-none focus:border-[#0f8f4c]" value={form.primaryDevelopmentId} onChange={(event) => onChange({ ...form, primaryDevelopmentId: event.target.value, preferredUnitId: '' })}>
                <option value="">Unallocated</option>
                {developments.map((development) => (
                  <option key={development.id} value={development.id}>{development.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#29445f]">
              Preferred unit
              <select
                className="h-11 rounded-[8px] border border-[#d9e5f2] px-3 text-sm text-[#10243a] outline-none focus:border-[#0f8f4c]"
                value={form.preferredUnitId}
                onChange={(event) => onChange({ ...form, preferredUnitId: event.target.value })}
                disabled={!form.primaryDevelopmentId || unitsLoading}
              >
                <option value="">{unitsLoading ? 'Loading units...' : 'Select unit'}</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id} disabled={Boolean(unit.activeTransaction)}>
                    Unit {unit.unit_number || unit.unitNumber || unit.id}{unit.activeTransaction ? ' - active transaction' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#29445f]">
              Assigned agent
              <select className="h-11 rounded-[8px] border border-[#d9e5f2] px-3 text-sm text-[#10243a] outline-none focus:border-[#0f8f4c]" value={form.assignedAgentId} onChange={(event) => onChange({ ...form, assignedAgentId: event.target.value })}>
                <option value="">Developer direct</option>
                {agents.map((agent) => (
                  <option key={agent.userId || agent.id} value={agent.userId || agent.id}>{getUserLabel(agent)}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#29445f] md:col-span-3">
              Lead source
              <select className="h-11 rounded-[8px] border border-[#d9e5f2] px-3 text-sm text-[#10243a] outline-none focus:border-[#0f8f4c]" value={form.leadSource} onChange={(event) => onChange({ ...form, leadSource: event.target.value })}>
                {LEAD_SOURCE_OPTIONS.map((source) => (
                  <option key={source.key} value={source.key}>{source.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold text-[#29445f]">
              Unit type
              <input className="h-11 rounded-[8px] border border-[#d9e5f2] px-3 text-sm text-[#10243a] outline-none focus:border-[#0f8f4c]" value={form.unitTypeInterest} onChange={(event) => onChange({ ...form, unitTypeInterest: event.target.value })} placeholder="2 bed, garden unit..." />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#29445f]">
              Budget min
              <input className="h-11 rounded-[8px] border border-[#d9e5f2] px-3 text-sm text-[#10243a] outline-none focus:border-[#0f8f4c]" type="number" min="0" value={form.budgetMin} onChange={(event) => onChange({ ...form, budgetMin: event.target.value })} />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#29445f]">
              Budget max
              <input className="h-11 rounded-[8px] border border-[#d9e5f2] px-3 text-sm text-[#10243a] outline-none focus:border-[#0f8f4c]" type="number" min="0" value={form.budgetMax} onChange={(event) => onChange({ ...form, budgetMax: event.target.value })} />
            </label>
          </div>

          <div className="grid gap-3">
            <p className="text-sm font-semibold text-[#29445f]">Other development interests</p>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {developments.map((development) => (
                <label key={development.id} className="flex min-h-11 items-center gap-3 rounded-[8px] border border-[#d9e5f2] px-3 text-sm text-[#29445f]">
                  <input type="checkbox" checked={selectedInterestIds.has(development.id)} onChange={() => toggleInterest(development.id)} />
                  <span className="truncate">{development.name}</span>
                </label>
              ))}
            </div>
          </div>

          <label className="grid gap-2 text-sm font-semibold text-[#29445f]">
            Private notes
            <textarea className="min-h-24 rounded-[8px] border border-[#d9e5f2] px-3 py-3 text-sm text-[#10243a] outline-none focus:border-[#0f8f4c]" value={form.privateNotes} onChange={(event) => onChange({ ...form, privateNotes: event.target.value })} />
          </label>

          <div className="flex justify-end gap-3 border-t border-[#e5edf6] pt-5">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating lead...' : 'Create Lead'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function getHandoffTone(status = 'blocked') {
  if (status === 'ready') return 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]'
  if (status === 'attention') return 'border-[#f0dfb8] bg-[#fff9ec] text-[#8a5a12]'
  return 'border-[#f8d7da] bg-[#fff5f6] text-[#8d2831]'
}

function ReleasedDeveloperLeadConversionPanel({
  queue,
  summary,
  developments,
  convertingLeadId,
  onConvertLead,
}) {
  return (
    <section className="rounded-[8px] border border-[#d9e5f2] bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.05)]" data-contract={DEVELOPER_LEAD_PHASE23_CONTRACT}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Released Buyer Conversion</p>
          <h2 className="mt-1 text-lg font-semibold text-[#10243a]">Agency leads ready for transaction setup</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">
            Buyer details released by the agency are checked against the same transaction handoff rules before conversion and buyer onboarding.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold ${getHandoffTone(summary.status)}`}>
            {summary.label}
          </span>
          <span className="inline-flex h-8 items-center rounded-full border border-[#d9e5f2] bg-[#f8fafc] px-3 text-xs font-semibold text-[#52677f]">
            {queue.convertedCount} converted
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Released</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{queue.totalReleased}</strong>
        </div>
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Ready</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{queue.readyToConvertCount}</strong>
        </div>
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Needs setup</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{queue.blockedCount}</strong>
        </div>
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Attention</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{queue.attentionCount}</strong>
        </div>
      </div>

      {queue.cards.length ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {queue.cards.slice(0, 4).map((card) => {
            const converting = convertingLeadId === card.developerLeadId
            return (
              <article key={card.developerLeadId} className="rounded-[8px] border border-[#d9e5f2] bg-[#fbfdff] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#10243a]">{card.buyerFullName}</p>
                    <p className="mt-1 truncate text-xs text-[#60758d]">{card.buyerEmail || card.buyerPhone || 'Contact details need attention'}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${getHandoffTone(card.handoffStatus)}`}>
                    {card.handoffLabel}
                  </span>
                </div>
                <div className="mt-4 grid gap-2 text-xs text-[#60758d] md:grid-cols-3">
                  <span>Development: <strong className="text-[#29445f]">{getDevelopmentLabel(card.primaryDevelopmentId, developments)}</strong></span>
                  <span>Unit: <strong className="text-[#29445f]">{card.preferredUnitId ? 'Selected' : 'Missing'}</strong></span>
                  <span>Status: <strong className="text-[#29445f]">{card.leadStatus}</strong></span>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#e5edf6] pt-3">
                  <p className="max-w-xl text-xs leading-5 text-[#7a8ba3]">{card.nextAction}</p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!card.canConvert || converting}
                    onClick={() => onConvertLead(card.lead)}
                  >
                    <ExternalLink size={15} />
                    {converting ? 'Converting...' : 'Convert & Send'}
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-[8px] border border-dashed border-[#d9e5f2] bg-[#fbfdff] p-4 text-sm text-[#60758d]">
          {summary.detail}
        </div>
      )}
    </section>
  )
}

function DeveloperLeadAttributionLedgerPanel({
  ledger,
  summary,
  developments,
  agents,
}) {
  const agentById = new Map((agents || []).map((agent) => [agent.userId || agent.id, agent]))

  function getAttributionLabel(row = {}) {
    if (row.attributionType === 'agency_introduced') return row.sourceAgencyOrgId ? `Agency ${row.sourceAgencyOrgId.slice(-8)}` : 'Agency introduced'
    if (row.attributionType === 'developer_assigned') return 'Developer assigned'
    return 'Developer direct'
  }

  function getCreditedAgentLabel(row = {}) {
    const agent = agentById.get(row.creditedAgentId)
    if (agent) return getUserLabel(agent)
    if (row.creditedAgentId) return `Agent ${row.creditedAgentId.slice(-8)}`
    return 'Unassigned'
  }

  return (
    <section className="rounded-[8px] border border-[#d9e5f2] bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.05)]" data-contract={DEVELOPER_LEAD_PHASE25_CONTRACT}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Attribution Ledger</p>
          <h2 className="mt-1 text-lg font-semibold text-[#10243a]">Lead source and conversion ownership</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">
            Track developer-direct and agency-introduced lead lanes by development, credited agent, handover state, and conversion outcome.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold ${getReadinessTone(summary.status)}`}>
            {summary.label}
          </span>
          <span className="inline-flex h-8 items-center rounded-full border border-[#d9e5f2] bg-[#f8fafc] px-3 text-xs font-semibold text-[#52677f]">
            {formatPercent(ledger.conversionRate)} conversion
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Total</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{ledger.totalLeads}</strong>
        </div>
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Agency</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{ledger.agencyIntroducedCount}</strong>
        </div>
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Developer</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{ledger.developerOwnedCount}</strong>
        </div>
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Converted</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{ledger.convertedCount}</strong>
        </div>
      </div>

      {ledger.rows.length ? (
        <div className="mt-4 overflow-hidden rounded-[8px] border border-[#e5edf6]">
          {ledger.rows.slice(0, 6).map((row) => (
            <article key={row.ledgerKey} className="grid gap-3 border-b border-[#e5edf6] bg-[#fbfdff] p-4 last:border-b-0 lg:grid-cols-[minmax(220px,1.1fr)_minmax(180px,0.9fr)_repeat(4,minmax(92px,0.45fr))] lg:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#10243a]">{getAttributionLabel(row)}</p>
                <p className="mt-1 truncate text-xs text-[#60758d]">{getDevelopmentLabel(row.primaryDevelopmentId, developments)}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#29445f]">{getCreditedAgentLabel(row)}</p>
                <p className="mt-1 text-xs text-[#7a8ba3]">{formatDate(row.latestActivityAt)}</p>
              </div>
              <span className="text-xs text-[#60758d]">Leads <strong className="block text-sm text-[#10243a]">{row.totalLeads}</strong></span>
              <span className="text-xs text-[#60758d]">Released <strong className="block text-sm text-[#10243a]">{row.releasedCount}</strong></span>
              <span className="text-xs text-[#60758d]">Converted <strong className="block text-sm text-[#10243a]">{row.convertedCount}</strong></span>
              <span className="text-xs text-[#60758d]">Rate <strong className="block text-sm text-[#10243a]">{formatPercent(row.conversionRate)}</strong></span>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-[8px] border border-dashed border-[#d9e5f2] bg-[#fbfdff] p-4 text-sm text-[#60758d]">
          {summary.detail}
        </div>
      )}
    </section>
  )
}

function DeveloperLeadOperationsHealthPanel({
  health,
  summary,
  developments,
  agents,
}) {
  const agentById = new Map((agents || []).map((agent) => [agent.userId || agent.id, agent]))

  function getAssignedLabel(alert = {}) {
    const agent = agentById.get(alert.assignedAgentId)
    if (agent) return getUserLabel(agent)
    if (alert.assignedAgentId) return `Agent ${alert.assignedAgentId.slice(-8)}`
    return alert.sourceAgencyOrgId ? 'Agency owner' : 'Unassigned'
  }

  return (
    <section className="rounded-[8px] border border-[#d9e5f2] bg-white p-4 shadow-[0_12px_35px_rgba(15,23,42,0.05)]" data-contract={DEVELOPER_LEAD_PHASE26_CONTRACT}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Operations Health</p>
          <h2 className="mt-1 text-lg font-semibold text-[#10243a]">Lead follow-up exceptions</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">
            Watch stale leads, missing development allocation, unassigned developer-owned leads, pending handovers, and released leads still waiting for conversion.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold ${getReadinessTone(summary.status)}`}>
            {summary.label}
          </span>
          <span className="inline-flex h-8 items-center rounded-full border border-[#d9e5f2] bg-[#f8fafc] px-3 text-xs font-semibold text-[#52677f]">
            {health.activeLeads} active
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Blockers</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{health.blockerCount}</strong>
        </div>
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Attention</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{health.attentionCount}</strong>
        </div>
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Stale</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{health.staleCount}</strong>
        </div>
        <div className="rounded-[8px] border border-[#e5edf6] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Released</p>
          <strong className="mt-1 block text-2xl font-semibold text-[#10243a]">{health.releasedAwaitingConversionCount}</strong>
        </div>
      </div>

      {health.alerts.length ? (
        <div className="mt-4 overflow-hidden rounded-[8px] border border-[#e5edf6]">
          {health.alerts.slice(0, 6).map((alert) => (
            <article key={`${alert.developerLeadId}-${alert.type}`} className="grid gap-3 border-b border-[#e5edf6] bg-[#fbfdff] p-4 last:border-b-0 lg:grid-cols-[minmax(220px,1.1fr)_minmax(160px,0.7fr)_minmax(180px,0.8fr)_100px] lg:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#10243a]">{alert.leadLabel}</p>
                <p className="mt-1 truncate text-xs text-[#60758d]">{alert.message}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#29445f]">{getDevelopmentLabel(alert.primaryDevelopmentId, developments)}</p>
                <p className="mt-1 text-xs text-[#7a8ba3]">{getAssignedLabel(alert)}</p>
              </div>
              <div className="min-w-0">
                <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${getReadinessTone(alert.severity === 'blocker' ? 'blocked' : alert.severity)}`}>
                  {alert.severity}
                </span>
                <p className="mt-1 truncate text-xs text-[#7a8ba3]">{alert.type.replaceAll('_', ' ')}</p>
              </div>
              <span className="text-xs text-[#60758d]">Age <strong className="block text-sm text-[#10243a]">{alert.ageDays}d</strong></span>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-[8px] border border-dashed border-[#d9e5f2] bg-[#fbfdff] p-4 text-sm text-[#60758d]">
          {summary.detail}
        </div>
      )}
    </section>
  )
}

function LeadRow({
  lead,
  developments,
  agents,
  handoverSubmitting,
  converting,
  onRequestHandover,
  onConvertLead,
}) {
  const assigned = agents.find((agent) => (agent.userId || agent.id) === lead.assignedAgentId)
  const developmentLabel = getDevelopmentLabel(lead.primaryDevelopmentId, developments)
  const handoff = buildDeveloperLeadTransactionHandoff(lead)
  const budget = lead.budgetMin || lead.budgetMax
    ? `${formatCurrency(lead.budgetMin)} - ${formatCurrency(lead.budgetMax)}`
    : 'Open budget'
  const agencyFed = isAgencyFedLead(lead)
  const handoverRequired = requiresAgencyHandover(lead)
  const handoverPending = agencyFed && lead.visibilityState === 'consent_pending'
  const title = agencyFed && !lead.buyerFullName
    ? lead.protectedSummary || 'Agency protected lead'
    : lead.buyerFullName || 'Buyer pending'
  const subtitle = agencyFed && handoverRequired
    ? 'Details hidden until handover'
    : lead.buyerEmail || lead.buyerPhone || 'Contact details pending'

  const primaryHandoffMessage = handoff.blockers[0]?.message || handoff.warnings[0]?.message || 'Transaction handoff payload is ready.'

  return (
    <div className="grid gap-4 border-b border-[#e5edf6] px-4 py-4 last:border-b-0 xl:grid-cols-[minmax(260px,1.2fr)_180px_150px_160px_150px_190px_170px] xl:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-[#10243a]">{title}</p>
          <StatusBadge status={lead.leadStatus} />
          {agencyFed ? (
            <span className="inline-flex h-7 items-center rounded-full border border-[#d9e5f2] bg-[#f5f8fb] px-2.5 text-xs font-semibold text-[#52677f]">
              Agency-fed
            </span>
          ) : null}
        </div>
        <p className="mt-1 truncate text-xs text-[#60758d]">{subtitle}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-[#29445f]">{developmentLabel}</p>
        <p className="mt-1 text-xs text-[#7a8ba3]">{lead.interestedDevelopmentIds?.length > 1 ? `${lead.interestedDevelopmentIds.length} interests` : 'Single interest'}</p>
      </div>
      <div>
        <p className="text-sm font-semibold text-[#29445f]">{assigned ? getUserLabel(assigned) : agencyFed ? 'Agency agent' : 'Developer direct'}</p>
        <p className="mt-1 text-xs text-[#7a8ba3]">{agencyFed ? 'Agency introduced' : lead.sellingModel === 'agent_led' ? 'Agent-led' : 'Developer-led'}</p>
      </div>
      <div>
        <p className="text-sm font-semibold text-[#29445f]">{lead.unitTypeInterest || 'Any unit'}</p>
        <p className="mt-1 text-xs text-[#7a8ba3]">{budget}</p>
      </div>
      <div>
        <p className="text-sm font-semibold text-[#29445f]">{formatDate(lead.updatedAt)}</p>
        <p className="mt-1 text-xs text-[#7a8ba3]">{handoverPending ? 'Handover requested' : lead.reservationState === 'none' ? 'Not reserved' : lead.reservationState}</p>
      </div>
      <div className="min-w-0">
        <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${getHandoffTone(handoff.status)}`}>
          {handoff.label}
        </span>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#7a8ba3]">{primaryHandoffMessage}</p>
      </div>
      <div className="flex xl:justify-end">
        {handoverRequired ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={handoverPending || handoverSubmitting}
            onClick={() => onRequestHandover(lead.developerLeadId)}
          >
            <EyeOff size={15} />
            {handoverPending ? 'Requested' : 'Request Handover'}
          </Button>
        ) : handoff.eligible ? (
          <Button
            type="button"
            size="sm"
            disabled={converting}
            onClick={() => onConvertLead(lead)}
          >
            <ExternalLink size={15} />
            {converting ? 'Converting...' : 'Convert & Send'}
          </Button>
        ) : (
          <span className="inline-flex h-8 items-center rounded-full border border-[#d8efe4] bg-[#f1fbf6] px-3 text-xs font-semibold text-[#17613d]">
            Details available
          </span>
        )}
      </div>
    </div>
  )
}

export default function DeveloperLeadsPage() {
  const { currentWorkspace } = useWorkspace()
  const developerOrgId = normalizeText(currentWorkspace?.id)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [leads, setLeads] = useState([])
  const [developments, setDevelopments] = useState([])
  const [agents, setAgents] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formUnits, setFormUnits] = useState([])
  const [formUnitsLoading, setFormUnitsLoading] = useState(false)
  const [duplicateWarnings, setDuplicateWarnings] = useState([])
  const [handoverSubmittingId, setHandoverSubmittingId] = useState('')
  const [convertingLeadId, setConvertingLeadId] = useState('')
  const [convertedOnboardingUrl, setConvertedOnboardingUrl] = useState('')

  const loadData = useCallback(async () => {
    if (!isSupabaseConfigured || !developerOrgId) {
      setLoading(false)
      return
    }
    try {
      setError('')
      setLoading(true)
      const [leadRows, developmentRows, userRows] = await Promise.all([
        listDeveloperLeadIntake({ developerOrgId, status: statusFilter, source: sourceFilter }),
        fetchDevelopmentOptions({ organisationId: developerOrgId }).catch(() => []),
        listOrganisationUsers().catch(() => []),
      ])
      setLeads(leadRows)
      setDevelopments(developmentRows)
      setAgents((userRows || []).filter((user) => normalizeLower(user.status || user.membershipStatus) !== 'inactive'))
    } catch (loadError) {
      setError(loadError.message || 'Developer leads could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [developerOrgId, sourceFilter, statusFilter])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      if (!showCreateModal || !developerOrgId) return
      try {
        const warnings = await findDeveloperLeadDuplicateWarnings({
          developerOrgId,
          buyerEmail: form.buyerEmail,
          buyerPhone: form.buyerPhone,
        })
        if (!cancelled) setDuplicateWarnings(warnings)
      } catch {
        if (!cancelled) setDuplicateWarnings([])
      }
    }, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [developerOrgId, form.buyerEmail, form.buyerPhone, showCreateModal])

  useEffect(() => {
    let cancelled = false
    async function loadFormUnits() {
      if (!showCreateModal || !form.primaryDevelopmentId) {
        setFormUnits([])
        setFormUnitsLoading(false)
        return
      }
      try {
        setFormUnitsLoading(true)
        const rows = await fetchUnitsForTransactionSetup(form.primaryDevelopmentId)
        if (!cancelled) setFormUnits(rows || [])
      } catch {
        if (!cancelled) setFormUnits([])
      } finally {
        if (!cancelled) setFormUnitsLoading(false)
      }
    }
    void loadFormUnits()
    return () => {
      cancelled = true
    }
  }, [form.primaryDevelopmentId, showCreateModal])

  const filteredLeads = useMemo(() => {
    const needle = normalizeLower(searchTerm)
    return leads.filter((lead) => {
      if (!needle) return true
      const haystack = [
        lead.buyerFullName,
        lead.buyerEmail,
        lead.buyerPhone,
        lead.protectedSummary,
        lead.unitTypeInterest,
        lead.leadSource,
        lead.leadOwner,
        getDevelopmentLabel(lead.primaryDevelopmentId, developments),
      ].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  }, [developments, leads, searchTerm])

  const metrics = useMemo(() => {
    const open = leads.filter((lead) => !['converted', 'lost'].includes(lead.leadStatus)).length
    const assigned = leads.filter((lead) => Boolean(lead.assignedAgentId)).length
    const agencyProtected = leads.filter((lead) => isAgencyFedLead(lead) && requiresAgencyHandover(lead)).length
    const qualified = leads.filter((lead) => ['qualified', 'reserved'].includes(lead.leadStatus)).length
    const handoffSummary = summarizeDeveloperLeadTransactionHandoffs(leads)
    return { open, assigned, agencyProtected, qualified, handoffReady: handoffSummary.ready }
  }, [leads])

  const protectedLeadQueue = useMemo(() => buildProtectedDeveloperLeadQueue(leads), [leads])
  const protectedLeadQueueSummary = useMemo(() => summarizeProtectedDeveloperLeadQueue(leads), [leads])
  const releasedConversionQueue = useMemo(() => buildReleasedDeveloperLeadConversionQueue(leads), [leads])
  const releasedConversionQueueSummary = useMemo(() => summarizeReleasedDeveloperLeadConversionQueue(leads), [leads])
  const attributionLedger = useMemo(() => buildDeveloperLeadAttributionLedger(leads), [leads])
  const attributionLedgerSummary = useMemo(() => summarizeDeveloperLeadAttributionLedger(leads), [leads])
  const operationsHealth = useMemo(() => buildDeveloperLeadOperationsHealth(leads), [leads])
  const operationsHealthSummary = useMemo(() => summarizeDeveloperLeadOperationsHealth(leads), [leads])

  const readiness = useMemo(() => buildDeveloperLeadLaunchReadiness({
    leads,
    schemaAvailable: isSupabaseConfigured,
    conversionBridgeEnabled: true,
    buyerOnboardingSendEnabled: true,
  }), [leads])

  async function handleCreateLead(event) {
    event.preventDefault()
    if (!developerOrgId) return
    try {
      setSaving(true)
      setError('')
      setMessage('')
      setConvertedOnboardingUrl('')
      await createDeveloperFedLead({ ...form, developerOrgId })
      setMessage('Developer lead created.')
      setForm(EMPTY_FORM)
      setShowCreateModal(false)
      window.dispatchEvent(new Event('itg:developer-leads-changed'))
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Developer lead could not be created.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRequestHandover(developerLeadId) {
    if (!developerOrgId || !developerLeadId) return
    try {
      setHandoverSubmittingId(developerLeadId)
      setError('')
      setMessage('')
      setConvertedOnboardingUrl('')
      await requestAgencyLeadHandover({ developerOrgId, developerLeadId })
      setMessage('Agency handover requested.')
      window.dispatchEvent(new Event('itg:developer-leads-changed'))
      await loadData()
    } catch (handoverError) {
      setError(handoverError.message || 'Agency handover could not be requested.')
    } finally {
      setHandoverSubmittingId('')
    }
  }

  async function handleConvertLead(lead) {
    if (!developerOrgId || !lead?.developerLeadId) return
    try {
      setConvertingLeadId(lead.developerLeadId)
      setError('')
      setMessage('')
      setConvertedOnboardingUrl('')
      const result = await convertDeveloperLeadToTransactionAndSendOnboarding({
        developerOrgId,
        lead,
        sendBuyerOnboarding: true,
      })
      if (result.onboardingUrl && typeof navigator !== 'undefined') {
        void navigator.clipboard?.writeText(result.onboardingUrl)
      }
      setConvertedOnboardingUrl(result.onboardingUrl || '')
      setMessage(
        result.onboardingEmail?.sent
          ? 'Developer lead converted and buyer onboarding email sent.'
          : 'Developer lead converted. Buyer onboarding link is ready, but email delivery needs attention.',
      )
      window.dispatchEvent(new CustomEvent('itg:transaction-created', { detail: result }))
      window.dispatchEvent(new Event('itg:developer-leads-changed'))
      await loadData()
    } catch (conversionError) {
      setError(conversionError.message || 'Developer lead could not be converted.')
    } finally {
      setConvertingLeadId('')
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="min-h-screen bg-[#f6f9fc] p-8">
        <div className="rounded-[8px] border border-[#d9e5f2] bg-white p-8">
          <h1 className="text-2xl font-semibold text-[#10243a]">Developer Leads</h1>
          <p className="mt-2 text-sm text-[#60758d]">Supabase is not configured for this workspace.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="developer-leads-page min-h-screen bg-[#f6f9fc] p-4 sm:p-5 lg:p-6">
      <div className="developer-leads-shell mx-auto grid gap-6">
        <section className="developer-leads-panel developer-leads-hero flex flex-col gap-4 rounded-[8px] border border-[#d9e5f2] bg-white p-5 shadow-[0_12px_35px_rgba(15,23,42,0.05)] lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7a8ba3]">Developer Leads</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-[#10243a]">Lead Intake</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">
              Developer-fed buyer leads and agency-fed protected lead cards, with handover before private buyer details become visible.
            </p>
          </div>
          <div className="developer-leads-actions flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={loadData} disabled={loading}>
              <RefreshCw size={16} />
              Refresh
            </Button>
            <Button type="button" onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              Create Lead
            </Button>
          </div>
        </section>

        <section className="developer-leads-metrics grid gap-4">
          <MetricCard label="Open leads" value={metrics.open} helper="Not converted or lost" icon={ClipboardList} />
          <MetricCard label="Assigned" value={metrics.assigned} helper="Worked by an agent" icon={UserPlus} />
          <MetricCard label="Agency protected" value={metrics.agencyProtected} helper="Buyer details hidden" icon={EyeOff} />
          <MetricCard label="Transaction ready" value={metrics.handoffReady} helper={`${metrics.qualified} qualified or reserved`} icon={CheckCircle2} />
        </section>

        <DeveloperLeadReadinessPanel readiness={readiness} />

        <ProtectedDeveloperLeadQueuePanel
          queue={protectedLeadQueue}
          summary={protectedLeadQueueSummary}
          developments={developments}
          handoverSubmittingId={handoverSubmittingId}
          onRequestHandover={handleRequestHandover}
        />

        <ReleasedDeveloperLeadConversionPanel
          queue={releasedConversionQueue}
          summary={releasedConversionQueueSummary}
          developments={developments}
          convertingLeadId={convertingLeadId}
          onConvertLead={handleConvertLead}
        />

        <DeveloperLeadAttributionLedgerPanel
          ledger={attributionLedger}
          summary={attributionLedgerSummary}
          developments={developments}
          agents={agents}
        />

        <DeveloperLeadOperationsHealthPanel
          health={operationsHealth}
          summary={operationsHealthSummary}
          developments={developments}
          agents={agents}
        />

        <section className="developer-leads-panel rounded-[8px] border border-[#d9e5f2] bg-white shadow-[0_12px_35px_rgba(15,23,42,0.05)]">
          <div className="flex flex-col gap-4 border-b border-[#e5edf6] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[8px] border border-[#d9e5f2] bg-white px-3">
              <Search size={17} className="shrink-0 text-[#7a8ba3]" />
              <input className="h-11 min-w-0 flex-1 text-sm text-[#10243a] outline-none" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search buyer, development, source..." />
            </div>
            <label className="flex h-11 items-center gap-2 rounded-[8px] border border-[#d9e5f2] px-3 text-sm font-semibold text-[#29445f]">
              <Filter size={16} />
              <select className="bg-transparent outline-none" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {DEVELOPER_LEAD_STATUS_OPTIONS.map((status) => (
                  <option key={status.key} value={status.key}>{status.label}</option>
                ))}
              </select>
            </label>
            <label className="flex h-11 items-center gap-2 rounded-[8px] border border-[#d9e5f2] px-3 text-sm font-semibold text-[#29445f]">
              <Users size={16} />
              <select className="bg-transparent outline-none" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                {DEVELOPER_LEAD_SOURCE_FILTER_OPTIONS.map((source) => (
                  <option key={source.key} value={source.key}>{source.label}</option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <div className="m-4 rounded-[8px] border border-[#f8d7da] bg-[#fff5f6] p-4 text-sm text-[#8d2831]">{error}</div>
          ) : null}
          {message ? (
            <div className="m-4 rounded-[8px] border border-[#d8efe4] bg-[#f1fbf6] p-4 text-sm text-[#17613d]">{message}</div>
          ) : null}
          {convertedOnboardingUrl ? (
            <div className="m-4 rounded-[8px] border border-[#d9e5f2] bg-[#f8fafc] p-4 text-sm text-[#29445f]">
              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Buyer onboarding link</span>
              <a className="mt-2 block break-all font-semibold text-[#17613d]" href={convertedOnboardingUrl} target="_blank" rel="noreferrer">
                {convertedOnboardingUrl}
              </a>
            </div>
          ) : null}

          {loading ? (
            <div className="p-8 text-sm text-[#60758d]">Loading developer leads...</div>
          ) : filteredLeads.length ? (
            <div>
              {filteredLeads.map((lead) => (
                <LeadRow
                  key={lead.developerLeadId}
                  lead={lead}
                  developments={developments}
                  agents={agents}
                  handoverSubmitting={handoverSubmittingId === lead.developerLeadId}
                  converting={convertingLeadId === lead.developerLeadId}
                  onRequestHandover={handleRequestHandover}
                  onConvertLead={handleConvertLead}
                />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#eef8f2] text-[#0f8f4c]">
                <ShieldCheck size={21} />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[#10243a]">No developer leads yet</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#60758d]">
                Create a developer-owned buyer lead or wait for an agency-introduced protected lead to arrive.
              </p>
            </div>
          )}
        </section>

        <div className="hidden" data-contract={DEVELOPER_LEAD_PHASE11_CONTRACT} />
        <div className="hidden" data-contract={DEVELOPER_LEAD_PHASE12_CONTRACT} />
        <div className="hidden" data-contract={DEVELOPER_LEAD_PHASE16_CONTRACT} />
        <div className="hidden" data-contract={DEVELOPER_LEAD_PHASE17_CONTRACT} />
        <div className="hidden" data-contract={DEVELOPER_LEAD_PHASE18_CONTRACT} />
        <div className="hidden" data-contract={DEVELOPER_LEAD_PHASE21_CONTRACT} />
        <div className="hidden" data-contract={DEVELOPER_LEAD_PHASE23_CONTRACT} />
        <div className="hidden" data-contract={DEVELOPER_LEAD_PHASE25_CONTRACT} />
        <div className="hidden" data-contract={DEVELOPER_LEAD_PHASE26_CONTRACT} />
      </div>

      <DeveloperLeadCreateModal
        open={showCreateModal}
        form={form}
        saving={saving}
        duplicateWarnings={duplicateWarnings}
        developments={developments}
        units={formUnits}
        unitsLoading={formUnitsLoading}
        agents={agents}
        onClose={() => setShowCreateModal(false)}
        onChange={setForm}
        onSubmit={handleCreateLead}
      />
    </main>
  )
}
