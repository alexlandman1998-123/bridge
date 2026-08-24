import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  ExternalLink,
  EyeOff,
  FileText,
  Filter,
  Home,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import JourneyStageOverrideActions from '../components/journey/JourneyStageOverrideActions'
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
import { JOURNEY_ENTITY_TYPES } from '../core/journey/journeyStagePolicy.js'
import { applyJourneyStageOverrides } from '../core/journey/journeyStageOverrideState.js'
import {
  DEVELOPER_LEAD_PHASE18_CONTRACT,
  convertDeveloperLeadToTransactionAndSendOnboarding,
} from '../services/developerLeadConversionService'
import { fetchJourneyStageOverrides } from '../services/journeyStageOverrideService.js'
import {
  DEVELOPER_LEAD_PHASE11_CONTRACT,
  DEVELOPER_LEAD_PHASE12_CONTRACT,
  DEVELOPER_LEAD_SOURCE_FILTER_OPTIONS,
  DEVELOPER_LEAD_STATUS_OPTIONS,
  createDeveloperFedLead,
  findDeveloperLeadDuplicateWarnings,
  listDeveloperLeadIntake,
  requestAgencyLeadHandover,
  updateDeveloperLeadWorkspaceSetup,
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
  if (status === 'otp') return { label: 'OTP', className: 'border-[#d9e7ff] bg-[#f3f7ff] text-[#24568f]' }
  if (status === 'onboarding_submitted') return { label: 'Onboarding Submitted', className: 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]' }
  if (status === 'onboarding_sent') return { label: 'Onboarding Sent', className: 'border-[#d9e7ff] bg-[#f3f7ff] text-[#24568f]' }
  if (status === 'reserved') return { label: 'Reserved', className: 'border-[#d9e7ff] bg-[#f3f7ff] text-[#1e4d82]' }
  if (status === 'viewing') return { label: 'Viewing', className: 'border-[#d9e7ff] bg-[#f3f7ff] text-[#24568f]' }
  if (status === 'qualified') return { label: 'Qualified', className: 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]' }
  if (status === 'contacted') return { label: 'Contacted', className: 'border-[#f0dfb8] bg-[#fff9ec] text-[#8a5a12]' }
  if (status === 'lost') return { label: 'Lost', className: 'border-[#f8d7da] bg-[#fff5f6] text-[#8d2831]' }
  return { label: 'New', className: 'border-[#e4ebf4] bg-[#f8fafc] text-[#52677f]' }
}

function isConvertedLead(lead = {}) {
  return normalizeLower(lead.leadStatus) === 'converted'
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
            Review protected agency-fed leads, request buyer-detail handover, and keep onboarding locked until the agency releases the private record.
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
                  <p className="text-xs leading-5 text-[#7a8ba3]">Details hidden until handover. Buyer identity and contact details are hidden.</p>
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

function getInitials(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return 'BL'
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function getLeadSourceLabel(source = '') {
  const normalized = normalizeLower(source)
  return LEAD_SOURCE_OPTIONS.find((option) => option.key === normalized)?.label || normalizeText(source).replaceAll('_', ' ') || 'Unknown source'
}

function getLeadDisplayName(lead = {}) {
  if (isAgencyFedLead(lead) && requiresAgencyHandover(lead) && !lead.buyerFullName) {
    return lead.protectedSummary || 'Agency protected lead'
  }
  return normalizeText(lead.buyerFullName) || 'Buyer pending'
}

function getLeadContactLine(lead = {}, type = 'email') {
  if (isAgencyFedLead(lead) && requiresAgencyHandover(lead)) return 'Hidden until handover'
  const value = type === 'phone' ? lead.buyerPhone : lead.buyerEmail
  return normalizeText(value) || (type === 'phone' ? 'No phone number' : 'No email address')
}

function getAgentAccent(seed = '') {
  const palette = ['#315b7a', '#17613d', '#7c4d20', '#24568f', '#5a5278', '#8a5a12']
  const text = normalizeText(seed) || 'developer-lead'
  const index = Array.from(text).reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length
  return palette[index]
}

function formatRelativeTime(value) {
  if (!value) return 'No activity yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No activity yet'
  const diffMs = Date.now() - date.getTime()
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diffMs < minute) return 'Just now'
  if (diffMs < hour) return `${Math.max(1, Math.round(diffMs / minute))}m ago`
  if (diffMs < day) return `${Math.max(1, Math.round(diffMs / hour))}h ago`
  if (diffMs < 30 * day) return `${Math.max(1, Math.round(diffMs / day))}d ago`
  return formatDate(value)
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function firstFilled(...values) {
  return values.map((value) => normalizeText(value)).find(Boolean) || ''
}

function compactFullName(...parts) {
  return parts.map(normalizeText).filter(Boolean).join(' ')
}

function formatChoice(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  return text
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatYesNo(value = '') {
  const normalized = normalizeLower(value)
  if (normalized === 'yes') return 'Yes'
  if (normalized === 'no') return 'No'
  return formatChoice(value)
}

function formatOnboardingCurrency(value) {
  const normalized = Number(value || 0)
  return Number.isFinite(normalized) && normalized > 0 ? formatCurrency(normalized) : ''
}

function getLeadOnboardingFormData(lead = {}) {
  const candidate = lead.onboardingFormData?.formData || lead.onboardingFormData?.form_data || lead.onboardingFormData
  return isPlainObject(candidate) ? candidate : {}
}

function getPrimaryOnboardingPurchaser(formData = {}) {
  if (Array.isArray(formData.purchasers)) {
    const populated = formData.purchasers.find((item) => isPlainObject(item) && Object.values(item).some((value) => normalizeText(value)))
    if (populated) return populated
  }
  if (isPlainObject(formData.purchaser)) return formData.purchaser
  return {
    full_name: firstFilled(formData.full_name, formData.buyer_full_name, compactFullName(formData.first_name, formData.surname || formData.last_name)),
    first_name: formData.first_name,
    surname: formData.surname || formData.last_name,
    email: formData.email || formData.buyer_email,
    phone: formData.phone || formData.mobile || formData.buyer_phone,
    identity_number: formData.identity_number || formData.id_number,
    passport_number: formData.passport_number,
    residential_address: formData.residential_address,
    marital_status: formData.marital_status,
    marital_regime: formData.marital_regime,
    employment_type: formData.employment_type,
    employer_name: formData.employer_name,
    gross_monthly_income: formData.gross_monthly_income,
    net_monthly_income: formData.net_monthly_income,
  }
}

function getOnboardingBuyerName(lead = {}, fallbackTitle = '') {
  const formData = getLeadOnboardingFormData(lead)
  const purchaser = getPrimaryOnboardingPurchaser(formData)
  return firstFilled(
    purchaser.full_name,
    purchaser.fullName,
    compactFullName(purchaser.first_name || purchaser.firstName, purchaser.surname || purchaser.last_name || purchaser.lastName),
    formData.company?.company_name,
    formData.trust?.trust_name,
    fallbackTitle,
  )
}

function profileRow(label, value, { format = (item) => item } = {}) {
  const formatted = format(value)
  return normalizeText(formatted) ? { label, value: formatted } : null
}

function buildDeveloperLeadOnboardingProfile({
  lead,
  title,
  subtitle,
  budget,
  assignedLabel,
  sourceLabel,
  handoverRequired,
} = {}) {
  const formData = getLeadOnboardingFormData(lead)
  const hasOnboarding = Boolean(lead?.onboardingFormData?.id || Object.keys(formData).length)
  if (!hasOnboarding) {
    return {
      hasOnboarding: false,
      sourceLabel: 'Lead capture',
      updatedAt: null,
      sections: [
        {
          title: 'Lead Capture',
          description: 'Buyer onboarding has not populated this workspace yet.',
          rows: [
            { label: 'Full name', value: handoverRequired ? 'Protected until handover' : title },
            { label: 'Email', value: subtitle?.includes('@') ? subtitle : getLeadContactLine(lead, 'email') },
            { label: 'Phone', value: getLeadContactLine(lead, 'phone') },
            { label: 'Budget', value: budget },
            { label: 'Assigned agent', value: assignedLabel },
            { label: 'Source', value: sourceLabel },
          ],
        },
      ],
      financeRows: [],
    }
  }

  const purchaser = getPrimaryOnboardingPurchaser(formData)
  const finance = isPlainObject(formData.finance) ? formData.finance : {}
  const company = isPlainObject(formData.company) ? formData.company : {}
  const trust = isPlainObject(formData.trust) ? formData.trust : {}
  const purchaserType = firstFilled(formData.purchaser_entity_type, formData.purchaser_type, lead?.onboardingFormData?.purchaserType)
  const financeType = firstFilled(formData.purchase_finance_type, formData.finance_type, finance.purchase_finance_type, finance.finance_type)
  const financeManagedBy = firstFilled(formData.finance_managed_by, formData.financeManagedBy, finance.finance_managed_by, finance.financeManagedBy)
  const naturalRows = [
    profileRow('Purchaser type', purchaserType, { format: formatChoice }),
    profileRow('Purchase mode', formData.natural_person_purchase_mode || purchaser.natural_person_purchase_mode, { format: formatChoice }),
    profileRow('Full name', getOnboardingBuyerName(lead, title)),
    profileRow('Email', firstFilled(purchaser.email, formData.email, lead.buyerEmail)),
    profileRow('Phone', firstFilled(purchaser.phone, purchaser.mobile, formData.phone, lead.buyerPhone)),
    profileRow('ID / Passport', firstFilled(purchaser.identity_number, purchaser.id_number, purchaser.passport_number)),
    profileRow('Residential address', firstFilled(purchaser.residential_address, purchaser.address)),
    profileRow('Marital status', purchaser.marital_status, { format: formatChoice }),
    profileRow('Marital regime', purchaser.marital_regime, { format: formatChoice }),
    profileRow('Spouse co-purchaser', purchaser.spouse_is_co_purchaser, { format: formatYesNo }),
  ].filter(Boolean)
  const employmentRows = [
    profileRow('Employment type', purchaser.employment_type, { format: formatChoice }),
    profileRow('Employer', purchaser.employer_name),
    profileRow('Gross monthly income', purchaser.gross_monthly_income, { format: formatOnboardingCurrency }),
    profileRow('Net monthly income', purchaser.net_monthly_income, { format: formatOnboardingCurrency }),
    profileRow('Monthly commitments', purchaser.monthly_credit_commitments, { format: formatOnboardingCurrency }),
  ].filter(Boolean)
  const entityRows = [
    profileRow('Company name', company.company_name),
    profileRow('Company registration', company.company_registration_number),
    profileRow('Company tax number', company.company_tax_number),
    profileRow('Registered address', company.company_registered_address),
    profileRow('Authorised signatory', company.authorised_signatory_name),
    profileRow('Trust name', trust.trust_name),
    profileRow('Trust registration', trust.trust_registration_number),
    profileRow('Trust type', trust.trust_type, { format: formatChoice }),
    profileRow('Authorised trustee', trust.authorised_trustee_name),
    profileRow('Trustees', Array.isArray(trust.trustees) ? `${trust.trustees.length} captured` : ''),
  ].filter(Boolean)
  const financeRows = [
    profileRow('Finance type', financeType, { format: formatChoice }),
    profileRow('Finance managed by', financeManagedBy, { format: formatChoice }),
    profileRow('Cash funds confirmed', firstFilled(finance.cash_funds_confirmed, formData.cash_funds_confirmed), { format: formatYesNo }),
    profileRow('Cash contribution available', firstFilled(finance.cash_contribution_available, formData.cash_contribution_available), { format: formatOnboardingCurrency }),
    profileRow('Deposit source', firstFilled(finance.deposit_source, formData.deposit_source), { format: formatChoice }),
    profileRow('Bond amount', firstFilled(finance.bond_amount, formData.bond_amount), { format: formatOnboardingCurrency }),
    profileRow('Bond process started', firstFilled(finance.bond_process_started, formData.bond_process_started), { format: formatYesNo }),
    profileRow('Pre-approval completed', firstFilled(finance.bond_preapproval_completed, formData.bond_preapproval_completed), { format: formatYesNo }),
    profileRow('Bond help requested', firstFilled(finance.bond_help_requested, formData.bond_help_requested), { format: formatYesNo }),
    profileRow('Preferred banks', Array.isArray(finance.buyer_banks) ? finance.buyer_banks.map(formatChoice).join(', ') : firstFilled(finance.bond_bank_name, formData.bond_bank_name)),
  ].filter(Boolean)

  return {
    hasOnboarding: true,
    sourceLabel: 'Submitted buyer onboarding',
    updatedAt: lead.onboardingFormData?.updatedAt || lead.onboardingFormData?.submittedAt || null,
    sections: [
      { title: 'Buyer Profile', description: 'Submitted buyer onboarding answers.', rows: naturalRows },
      ...(employmentRows.length ? [{ title: 'Employment & Income', description: 'Shown only when the buyer submitted finance/employment details.', rows: employmentRows }] : []),
      ...(entityRows.length ? [{ title: 'Entity Details', description: 'Company or trust buyer details from onboarding.', rows: entityRows }] : []),
      ...(financeRows.length ? [{ title: 'Finance', description: 'Buyer finance answers from onboarding.', rows: financeRows }] : []),
      {
        title: 'Workspace Context',
        description: 'Developer lead context linked to the submitted onboarding.',
        rows: [
          { label: 'Assigned agent', value: assignedLabel },
          { label: 'Source', value: sourceLabel },
          { label: 'Lead budget', value: budget },
        ],
      },
    ].filter((section) => section.rows.length),
    financeRows,
  }
}

function getLeadStagePresentation(status = 'new') {
  const normalized = normalizeLower(status)
  if (normalized === 'converted') return { label: 'Transaction', className: 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]', Icon: CheckCircle2 }
  if (normalized === 'otp') return { label: 'OTP', className: 'border-[#d9e7ff] bg-[#f3f7ff] text-[#24568f]', Icon: FileText }
  if (normalized === 'onboarding_submitted') return { label: 'Onboarding Submitted', className: 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]', Icon: CheckSquare }
  if (normalized === 'onboarding_sent') return { label: 'Onboarding Sent', className: 'border-[#d9e7ff] bg-[#f3f7ff] text-[#24568f]', Icon: Mail }
  if (normalized === 'reserved') return { label: 'Reserved', className: 'border-[#d9e7ff] bg-[#f3f7ff] text-[#24568f]', Icon: ShieldCheck }
  if (normalized === 'viewing') return { label: 'Viewing', className: 'border-[#d9e7ff] bg-[#f3f7ff] text-[#24568f]', Icon: CalendarDays }
  if (normalized === 'qualified') return { label: 'Qualified', className: 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]', Icon: TrendingUp }
  if (normalized === 'contacted') return { label: 'Contacted', className: 'border-[#f0dfb8] bg-[#fff9ec] text-[#8a5a12]', Icon: Phone }
  if (normalized === 'lost') return { label: 'Lost', className: 'border-[#f8d7da] bg-[#fff5f6] text-[#8d2831]', Icon: AlertTriangle }
  return { label: 'Captured', className: 'border-[#e4ebf4] bg-[#f8fafc] text-[#52677f]', Icon: ClipboardList }
}

function buildDeveloperLeadJourneyStages(lead = {}, overrides = []) {
  const status = normalizeLower(lead.leadStatus || 'new')
  const handoff = buildDeveloperLeadTransactionHandoff(lead)
  const statusRank = {
    new: 0,
    contacted: 1,
    qualified: 2,
    viewing: 3,
    reserved: 3,
    onboarding_sent: 4,
    onboarding_submitted: 5,
    otp: 6,
    converted: 6,
    lost: 0,
  }
  const activeRank = statusRank[status] ?? 0
  const reservationActive = status === 'reserved' || normalizeLower(lead.reservationState) === 'reserved'
  const steps = [
    { key: 'captured', label: 'Captured', detail: 'Lead created', rank: 0 },
    { key: 'contacted', label: 'Contacted', detail: 'Buyer contacted', rank: 1 },
    { key: 'qualified', label: 'Qualified', detail: handoff.eligible ? 'Ready for onboarding' : 'Buyer fit checked', rank: 2 },
    { key: 'viewing', label: 'Viewing', detail: reservationActive ? 'Reservation relevant' : 'Viewing / selection', rank: 3 },
    { key: 'onboarding_sent', label: 'Onboarding sent', detail: 'Buyer link sent', rank: 4 },
    { key: 'onboarding_submitted', label: 'Onboarding submitted', detail: 'Buyer details complete', rank: 5 },
    ...(reservationActive ? [{ key: 'reservation', label: 'Reservation deposit', detail: 'Deposit paid', rank: 5 }] : []),
    { key: 'otp', label: 'OTP', detail: 'Upload signed OTP', rank: 6 },
  ]

  const staged = steps.map((step) => {
    const state = step.rank < activeRank ? 'completed' : step.rank === activeRank ? 'current' : 'upcoming'
    return { ...step, state }
  })
  return applyJourneyStageOverrides({
    entityType: JOURNEY_ENTITY_TYPES.developerLead,
    stages: staged,
    overrides,
  })
}

function getNextManualLeadStatus(lead = {}) {
  const status = normalizeLower(lead.leadStatus || 'new')
  if (status === 'new') return { status: 'contacted', label: 'Mark Contacted', detail: 'Buyer has been contacted.' }
  if (status === 'contacted') return { status: 'qualified', label: 'Mark Qualified', detail: 'Buyer fit and development interest are qualified.' }
  if (status === 'qualified') return { status: 'viewing', label: 'Mark Viewing', detail: 'Buyer is viewing or selecting a unit.' }
  if (status === 'onboarding_sent') return { status: 'onboarding_submitted', label: 'Mark Onboarding Submitted', detail: 'Buyer onboarding has been submitted.' }
  if (status === 'onboarding_submitted') return { status: 'otp', label: 'Mark Signed OTP Uploaded', detail: 'Signed OTP has been uploaded manually.' }
  return null
}

function getStageCompletionStatus(stageKey = '', lead = {}) {
  const status = normalizeLower(lead.leadStatus || 'new')
  if (stageKey === 'captured' && status === 'new') return getNextManualLeadStatus(lead)
  if (stageKey === 'contacted' && status === 'contacted') return getNextManualLeadStatus(lead)
  if (stageKey === 'qualified' && status === 'qualified') return getNextManualLeadStatus(lead)
  if (stageKey === 'onboarding_sent' && status === 'onboarding_sent') return getNextManualLeadStatus(lead)
  if (stageKey === 'onboarding_submitted' && status === 'onboarding_submitted') return getNextManualLeadStatus(lead)
  return null
}

function getDeveloperLeadNextAction(lead = {}) {
  const handoff = buildDeveloperLeadTransactionHandoff(lead)
  const leadStatus = normalizeLower(lead.leadStatus || 'new')
  if (isConvertedLead(lead)) {
    return {
      label: 'Open the transaction workflow',
      helper: 'The signed OTP has moved this lead into the transaction workflow.',
    }
  }
  if (leadStatus === 'otp') {
    return {
      label: 'Open the transaction workflow',
      helper: 'Signed OTP has been uploaded, so finance, transfer, and registration can continue from the transaction workflow.',
    }
  }
  if (leadStatus === 'onboarding_submitted') {
    return {
      label: 'Upload signed OTP',
      helper: 'Buyer onboarding is submitted. The next handoff is signed OTP upload, which starts the transaction workflow.',
    }
  }
  if (leadStatus === 'onboarding_sent') {
    return {
      label: 'Wait for buyer onboarding submission',
      helper: 'The buyer has the onboarding link. Once submitted, upload the signed OTP to start the transaction workflow.',
    }
  }
  if (requiresAgencyHandover(lead)) {
    return {
      label: lead.visibilityState === 'consent_pending' ? 'Wait for agency handover' : 'Request agency handover',
      helper: 'Buyer details stay protected until the source agency releases them.',
    }
  }
  if (handoff.eligible) {
    return {
      label: 'Send buyer onboarding',
      helper: 'This sends the buyer onboarding link and prepares the onboarding context before OTP.',
    }
  }
  return {
    label: handoff.blockers?.[0]?.message || 'Complete lead setup',
    helper: 'Capture buyer details, development interest, and a qualified, viewing, or reserved status before sending onboarding.',
  }
}

function getLeadWorkspaceReadiness(journeyStages = []) {
  const stages = Array.isArray(journeyStages) ? journeyStages : []
  if (!stages.length) {
    return {
      score: 0,
      completedLabel: '0/0 steps complete',
      statusLabel: 'Captured',
    }
  }
  const currentIndex = Math.max(0, stages.findIndex((stage) => stage.state === 'current'))
  const completedCount = stages.filter((stage) => stage.state === 'completed').length
  const effectiveStep = currentIndex >= 0 ? currentIndex + 1 : Math.min(completedCount + 1, stages.length)
  const score = Math.max(0, Math.min(100, Math.round((effectiveStep / stages.length) * 100)))
  const currentStage = stages[currentIndex] || stages.find((stage) => stage.state === 'current') || stages[0]

  return {
    score,
    completedLabel: `${completedCount}/${stages.length} steps complete`,
    statusLabel: currentStage?.label || 'Captured',
  }
}

function getLeadWorkspaceContextLine({ lead = {}, developmentLabel = '', leadUnits = [] } = {}) {
  const preferredUnitId = normalizeText(lead.preferredUnitId)
  const preferredUnit = preferredUnitId ? leadUnits.find((unit) => unit.id === preferredUnitId) : null
  const unitLabel = normalizeText(
    preferredUnit?.unitNumber ||
      preferredUnit?.unit_number ||
      preferredUnit?.name ||
      preferredUnit?.title,
  )
  const development = normalizeText(developmentLabel)
  if (unitLabel && development) return `${unitLabel}, ${development}`
  if (development && development !== 'Unallocated') return development
  return normalizeText(lead.unitTypeInterest) || 'Property interest pending'
}

function getLeadWorkspaceFinanceLabel(lead = {}, onboardingProfile = {}) {
  const financeRows = Array.isArray(onboardingProfile.financeRows) ? onboardingProfile.financeRows : []
  const financeType = financeRows.find((row) => row.label === 'Finance type')?.value
  const managedBy = financeRows.find((row) => row.label === 'Finance managed by')?.value
  return firstFilled(lead.financeManagedBy, lead.financeRoute, financeType, managedBy, 'Not captured')
}

function getLeadWorkspaceUrgency(lead = {}, handoff = {}) {
  const leadStatus = normalizeLower(lead.leadStatus || 'new')
  if (leadStatus === 'onboarding_submitted' || leadStatus === 'otp' || isConvertedLead(lead)) {
    return { value: 'High', helper: 'Act now' }
  }
  if (handoff?.eligible || leadStatus === 'onboarding_sent') {
    return { value: 'Medium', helper: 'Active step' }
  }
  return { value: 'Normal', helper: 'Build readiness' }
}

function getLeadWorkspaceReadinessRows({
  lead = {},
  budget = '',
  onboardingProfile = {},
  journeyReadiness = {},
  handoff = {},
} = {}) {
  const interestedCount = Array.isArray(lead.interestedDevelopmentIds) ? lead.interestedDevelopmentIds.length : 0
  const signalCount = Math.max(interestedCount, lead.primaryDevelopmentId ? 1 : 0)
  const urgency = getLeadWorkspaceUrgency(lead, handoff)
  return [
    {
      key: 'budget',
      label: 'Budget',
      value: budget,
      helper: budget === 'Open budget' ? 'Needs capture' : 'Captured',
      Icon: Home,
    },
    {
      key: 'financing',
      label: 'Financing',
      value: getLeadWorkspaceFinanceLabel(lead, onboardingProfile),
      helper: onboardingProfile.hasOnboarding ? 'Buyer submitted' : 'Lead signal',
      Icon: CheckSquare,
    },
    {
      key: 'saved_searches',
      label: 'Saved Searches',
      value: signalCount ? String(signalCount) : '0',
      helper: signalCount === 1 ? 'Active signal' : 'Active signals',
      Icon: ClipboardList,
    },
    {
      key: 'match_score',
      label: 'Match Score',
      value: `${journeyReadiness.score || 0}%`,
      helper: handoff?.eligible ? 'Good fit' : 'Needs setup',
      Icon: TrendingUp,
    },
    {
      key: 'urgency',
      label: 'Urgency',
      value: urgency.value,
      helper: urgency.helper,
      Icon: Zap,
    },
  ]
}

function getOnboardingFinanceValue(onboardingProfile = {}, label = '') {
  const rows = Array.isArray(onboardingProfile.financeRows) ? onboardingProfile.financeRows : []
  return rows.find((row) => row.label === label)?.value || ''
}

function getDeveloperLeadQualificationRows({
  lead = {},
  budget = '',
  onboardingProfile = {},
  developmentLabel = '',
  headerContextLine = '',
  qualificationNote = '',
} = {}) {
  const formData = getLeadOnboardingFormData(lead)
  const finance = isPlainObject(formData.finance) ? formData.finance : {}
  const purchaser = getPrimaryOnboardingPurchaser(formData)
  const preferredAreas = firstFilled(
    formData.preferred_areas,
    formData.preferredAreas,
    Array.isArray(formData.area_interest) ? formData.area_interest.join(', ') : formData.area_interest,
    Array.isArray(lead.interestedDevelopmentIds) && lead.interestedDevelopmentIds.length ? developmentLabel : '',
    headerContextLine,
  )
  const moveTimeframe = firstFilled(
    formData.move_timeframe,
    formData.moveTimeframe,
    formData.purchase_timeframe,
    purchaser.move_timeframe,
  )
  const financeType = firstFilled(
    getOnboardingFinanceValue(onboardingProfile, 'Finance type'),
    lead.financeRoute,
    lead.financeManagedBy,
  )
  const subjectToFinance = firstFilled(finance.subject_to_finance, formData.subject_to_finance)
  const depositAvailable = firstFilled(
    getOnboardingFinanceValue(onboardingProfile, 'Cash contribution available'),
    finance.deposit_available,
    finance.cash_contribution_available,
    formData.deposit_available,
  )
  const preApprovalStatus = firstFilled(
    getOnboardingFinanceValue(onboardingProfile, 'Pre-approval completed'),
    finance.pre_approval_status,
    finance.bond_preapproval_completed,
    formData.pre_approval_status,
  )
  const propertyToSell = firstFilled(
    formData.property_to_sell_first,
    formData.property_to_sell,
    purchaser.property_to_sell_first,
  )
  const propertyNeed = firstFilled(lead.unitTypeInterest, formData.property_need, formData.propertyNeed)

  return [
    { label: 'Budget', value: budget === 'Open budget' ? '' : budget, Icon: Home },
    { label: 'Preferred areas', value: preferredAreas, Icon: Home },
    { label: 'Move timeframe', value: moveTimeframe, Icon: CalendarDays },
    { label: 'Cash or bond', value: financeType, Icon: CheckSquare },
    { label: 'Subject to finance', value: subjectToFinance, Icon: FileText },
    { label: 'Deposit available', value: depositAvailable, Icon: ClipboardList },
    { label: 'Pre-approval status', value: preApprovalStatus, Icon: ShieldCheck },
    { label: 'Property to sell first', value: propertyToSell, Icon: Home },
    { label: 'Property need', value: propertyNeed, Icon: UserPlus },
    { label: 'Call notes', value: qualificationNote, Icon: MessageCircle, wide: true },
  ].map((row) => ({
    ...row,
    value: firstFilled(row.value, 'Not captured'),
  }))
}

function getDeveloperQualificationStatusMeta(capturedCount = 0, totalCount = 0) {
  if (totalCount && capturedCount >= totalCount) {
    return { label: 'Qualified', className: 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]' }
  }
  if (capturedCount > 0) {
    return { label: 'In progress', className: 'border-[#f0dfb8] bg-[#fff9ec] text-[#8a5a12]' }
  }
  return { label: 'Needs qualification', className: 'border-[#d7e6f2] bg-[#f8fbfd] text-[#60758b]' }
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
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Released Buyer Onboarding</p>
          <h2 className="mt-1 text-lg font-semibold text-[#10243a]">Agency leads ready for buyer onboarding</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758d]">
            Buyer details released by the agency are checked against the same handoff rules before buyer onboarding can be sent.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold ${getHandoffTone(summary.status)}`}>
            {summary.label}
          </span>
          <span className="inline-flex h-8 items-center rounded-full border border-[#d9e5f2] bg-[#f8fafc] px-3 text-xs font-semibold text-[#52677f]">
            {queue.convertedCount} in transaction workflow
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
                    {converting ? 'Sending...' : 'Send Onboarding'}
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
            Track developer-direct and agency-introduced lead lanes by development, credited agent, handover state, and transaction outcome.
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
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Transactions</p>
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
              <span className="text-xs text-[#60758d]">Transactions <strong className="block text-sm text-[#10243a]">{row.convertedCount}</strong></span>
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
            Watch stale leads, missing development allocation, unassigned developer-owned leads, pending handovers, and released leads still waiting for onboarding.
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
  copying,
  selected,
  onOpenLead,
  onRequestHandover,
  onConvertLead,
  onCopyLeadOnboarding,
}) {
  const assigned = agents.find((agent) => (agent.userId || agent.id) === lead.assignedAgentId)
  const developmentLabel = getDevelopmentLabel(lead.primaryDevelopmentId, developments)
  const handoff = buildDeveloperLeadTransactionHandoff(lead)
  const agencyFed = isAgencyFedLead(lead)
  const handoverRequired = requiresAgencyHandover(lead)
  const handoverPending = agencyFed && lead.visibilityState === 'consent_pending'
  const title = getLeadDisplayName(lead)
  const assignedLabel = assigned ? getUserLabel(assigned) : agencyFed ? 'Agency agent' : 'Unassigned'
  const accent = getAgentAccent(lead.assignedAgentId || assignedLabel || title)
  const sourceLabel = agencyFed ? 'Agency protected' : getLeadSourceLabel(lead.leadSource)
  const stage = getLeadStagePresentation(lead.leadStatus)
  const StageIcon = stage.Icon
  const primaryHandoffMessage = handoff.blockers[0]?.message || handoff.warnings[0]?.message || (handoff.eligible ? 'Ready to convert and send onboarding' : 'Lead workspace ready')
  const activityReference = lead.updatedAt || lead.createdAt
  const openLabel = isConvertedLead(lead) ? 'Open developer lead' : 'Open lead workspace'
  const handleRowKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpenLead(lead)
    }
  }

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={openLabel}
      onClick={() => onOpenLead(lead)}
      onKeyDown={handleRowKeyDown}
      className={`min-w-0 cursor-pointer rounded-[20px] border px-4 py-4 shadow-[0_10px_24px_rgba(24,45,68,0.04)] transition hover:-translate-y-[1px] hover:border-[#cfdeeb] hover:shadow-[0_18px_36px_rgba(24,45,68,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#17613d] ${
        selected ? 'border-[#bfd5ea] bg-[#f7fbff]' : 'border-[#e2e8f0] bg-white'
      }`}
    >
      <div
        className="grid min-w-0 items-center gap-4"
        style={{ gridTemplateColumns: 'minmax(240px,1.18fr) minmax(118px,0.44fr) minmax(220px,0.95fr) minmax(190px,0.78fr) minmax(140px,0.54fr) minmax(132px,132px)' }}
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[0.9rem] font-bold text-white shadow-[0_10px_22px_rgba(24,45,68,0.12)]"
              style={{ backgroundImage: `linear-gradient(135deg, ${accent}, #173e63)` }}
            >
              {agencyFed && handoverRequired ? <EyeOff size={17} /> : getInitials(title)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">{title}</p>
              <div className="mt-2 grid gap-1 text-[0.82rem] font-medium text-[#60758b]">
                <span className="flex min-w-0 items-center gap-2">
                  <Phone size={13} className="shrink-0 text-[#8ba0b4]" />
                  <span className="min-w-0 truncate">{getLeadContactLine(lead, 'phone')}</span>
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <Mail size={13} className="shrink-0 text-[#8ba0b4]" />
                  <span className="min-w-0 truncate">{getLeadContactLine(lead, 'email')}</span>
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-[#dbe6f1] bg-[#f8fbff] px-2.5 py-1 text-[0.72rem] font-semibold text-[#4d6782]">
                  {assignedLabel === 'Unassigned' ? 'Unassigned' : `Assigned to ${assignedLabel}`}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <span className="inline-flex max-w-full items-center rounded-full border border-[#dbe6f1] bg-[#f8fbff] px-3 py-1.5 text-[0.78rem] font-semibold capitalize text-[#4d6782]">
            <span className="truncate">{sourceLabel}</span>
          </span>
          <p className="mt-2 truncate text-[0.8rem] font-medium text-[#60758b]">
            {agencyFed ? 'Agency introduced' : lead.sellingModel === 'agent_led' ? 'Agent-led' : 'Developer-led'}
          </p>
        </div>

        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] border border-[#e1e8f0] bg-[#f8fbff] text-[#5c7894]">
              <Home size={17} />
            </span>
            <div className="min-w-0">
              <p className={`truncate text-[0.96rem] font-semibold tracking-[-0.02em] ${developmentLabel === 'Unallocated' ? 'text-[#8aa0b5]' : 'text-[#142132]'}`}>
                {developmentLabel}
              </p>
              <p className="mt-1 truncate text-[0.84rem] font-medium text-[#60758b]">
                {lead.unitTypeInterest || (lead.interestedDevelopmentIds?.length > 1 ? `${lead.interestedDevelopmentIds.length} development interests` : 'Unit interest pending')}
              </p>
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <span className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-2 text-[0.82rem] font-semibold ${stage.className}`}>
            <StageIcon size={15} className="shrink-0" />
            <span className="line-clamp-2">{stage.label}</span>
          </span>
          <p className="mt-2 line-clamp-2 text-[0.8rem] font-medium text-[#60758b]">{primaryHandoffMessage}</p>
        </div>

        <div className="min-w-0">
          <p className="text-[0.95rem] font-semibold tracking-[-0.02em] text-[#142132]">{formatRelativeTime(activityReference)}</p>
          <p className="mt-1 truncate text-[0.84rem] font-medium text-[#60758b]">
            {handoverPending ? 'Handover requested' : lead.reservationState && lead.reservationState !== 'none' ? lead.reservationState : formatDate(activityReference)}
          </p>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2 justify-self-end" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[13px] border border-[#dbe4ee] bg-white text-[#5b7289] transition hover:border-[#c7d6e5] hover:bg-[#f8fbfe] hover:text-[#20364c] disabled:cursor-not-allowed disabled:opacity-55"
            aria-label={`Copy buyer onboarding link for ${title}`}
            title="Copy buyer onboarding link"
            disabled={handoverRequired || copying}
            onClick={() => onCopyLeadOnboarding(lead)}
          >
            <Copy size={17} />
          </button>
          <button
            type="button"
            className="inline-flex min-h-[40px] min-w-[78px] items-center justify-center gap-1.5 rounded-[13px] bg-[#0f2743] px-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,39,67,0.16)] transition hover:bg-[#0b223b]"
            onClick={() => onOpenLead(lead)}
          >
            Open
            <ArrowUpRight size={15} />
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-[#edf3f8] pt-3 lg:hidden" onClick={(event) => event.stopPropagation()}>
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
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={copying}
              onClick={() => onCopyLeadOnboarding(lead)}
            >
              <Copy size={15} />
              {copying ? 'Copying...' : 'Copy Link'}
            </Button>
            {handoff.eligible ? (
              <Button
                type="button"
                size="sm"
                disabled={converting}
                onClick={() => onConvertLead(lead)}
              >
                <ExternalLink size={15} />
                {converting ? 'Sending...' : 'Send Onboarding'}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </article>
  )
}

function DeveloperLeadList({
  leads,
  developments,
  agents,
  loading,
  routeDeveloperLeadId,
  searchTerm,
  statusFilter,
  sourceFilter,
  error,
  message,
  convertedOnboardingUrl,
  handoverSubmittingId,
  convertingLeadId,
  copyingLeadId,
  onSearchChange,
  onStatusFilterChange,
  onSourceFilterChange,
  onOpenLead,
  onRequestHandover,
  onConvertLead,
  onCopyLeadOnboarding,
  onRefresh,
  onCreateLead,
}) {
  return (
    <section className="developer-leads-panel min-w-0 overflow-hidden rounded-[16px] border border-[#d9e5f2] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_16px_42px_rgba(31,54,78,0.06)]" data-developer-lead-table="true">
      <div className="flex flex-col gap-2 border-b border-[#edf3f8] px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-end">
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-[14px] border border-[#d9e5f2] bg-white px-3 sm:min-w-[320px] lg:min-w-[420px]">
            <Search size={17} className="shrink-0 text-[#7a8ba3]" />
            <input
              className="h-11 min-w-0 flex-1 text-sm text-[#10243a] outline-none"
              value={searchTerm}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search buyer, development, source..."
            />
          </div>
          <Button type="button" variant="secondary" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={16} />
            Refresh
          </Button>
          <Button type="button" onClick={onCreateLead}>
            <Plus size={16} />
            Create Lead
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-b border-[#edf3f8] px-3 py-2.5 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm font-medium text-[#60758b]">
          {loading ? 'Loading leads...' : `${leads.length} lead${leads.length === 1 ? '' : 's'} in this view`}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex h-10 items-center gap-2 rounded-[12px] border border-[#d9e5f2] px-3 text-sm font-semibold text-[#29445f]">
            <Filter size={16} />
            <select className="bg-transparent outline-none" value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
              <option value="all">All statuses</option>
              {DEVELOPER_LEAD_STATUS_OPTIONS.map((status) => (
                <option key={status.key} value={status.key}>{status.label}</option>
              ))}
            </select>
          </label>
          <label className="flex h-10 items-center gap-2 rounded-[12px] border border-[#d9e5f2] px-3 text-sm font-semibold text-[#29445f]">
            <Users size={16} />
            <select className="bg-transparent outline-none" value={sourceFilter} onChange={(event) => onSourceFilterChange(event.target.value)}>
              {DEVELOPER_LEAD_SOURCE_FILTER_OPTIONS.map((source) => (
                <option key={source.key} value={source.key}>{source.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? (
        <div className="m-4 rounded-[12px] border border-[#f8d7da] bg-[#fff5f6] p-4 text-sm text-[#8d2831]">{error}</div>
      ) : null}
      {message ? (
        <div className="m-4 rounded-[12px] border border-[#d8efe4] bg-[#f1fbf6] p-4 text-sm text-[#17613d]">{message}</div>
      ) : null}
      {convertedOnboardingUrl ? (
        <div className="m-4 rounded-[12px] border border-[#d9e5f2] bg-[#f8fafc] p-4 text-sm text-[#29445f]">
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Buyer onboarding link</span>
          <a className="mt-2 block break-all font-semibold text-[#17613d]" href={convertedOnboardingUrl} target="_blank" rel="noreferrer">
            {convertedOnboardingUrl}
          </a>
        </div>
      ) : null}

      {loading ? (
        <div className="p-8 text-sm text-[#60758d]">Loading developer leads...</div>
      ) : leads.length ? (
        <>
          <div className="hidden min-h-0 max-w-full flex-1 overflow-x-auto overflow-y-visible lg:block">
            <div className="min-w-[1040px] px-3 py-3">
              <div
                className="grid items-center gap-4 px-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]"
                style={{ gridTemplateColumns: 'minmax(240px,1.18fr) minmax(118px,0.44fr) minmax(220px,0.95fr) minmax(190px,0.78fr) minmax(140px,0.54fr) minmax(132px,132px)' }}
              >
                <span>Lead</span>
                <span>Source</span>
                <span>Development</span>
                <span>Stage</span>
                <span>Last Activity</span>
                <span className="sr-only">Actions</span>
              </div>
              <div className="mt-2 space-y-2">
                {leads.map((lead) => (
                  <LeadRow
                    key={lead.developerLeadId}
                    lead={lead}
                    developments={developments}
                    agents={agents}
                    handoverSubmitting={handoverSubmittingId === lead.developerLeadId}
                    converting={convertingLeadId === lead.developerLeadId}
                    copying={copyingLeadId === lead.developerLeadId}
                    selected={normalizeText(routeDeveloperLeadId) === normalizeText(lead.developerLeadId)}
                    onOpenLead={onOpenLead}
                    onRequestHandover={onRequestHandover}
                    onConvertLead={onConvertLead}
                    onCopyLeadOnboarding={onCopyLeadOnboarding}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 p-3 lg:hidden">
            {leads.map((lead) => (
              <LeadRow
                key={lead.developerLeadId}
                lead={lead}
                developments={developments}
                agents={agents}
                handoverSubmitting={handoverSubmittingId === lead.developerLeadId}
                converting={convertingLeadId === lead.developerLeadId}
                copying={copyingLeadId === lead.developerLeadId}
                selected={normalizeText(routeDeveloperLeadId) === normalizeText(lead.developerLeadId)}
                onOpenLead={onOpenLead}
                onRequestHandover={onRequestHandover}
                onConvertLead={onConvertLead}
                onCopyLeadOnboarding={onCopyLeadOnboarding}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#eef8f2] text-[#0f8f4c]">
            <ShieldCheck size={21} />
          </div>
          <h3 className="mt-4 text-base font-semibold text-[#10243a]">No developer leads yet</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#60758d]">
            Create a developer-owned buyer lead or wait for an agency-introduced protected lead to arrive.
          </p>
          <Button type="button" className="mt-5" onClick={onCreateLead}>
            <Plus size={16} />
            Create Lead
          </Button>
        </div>
      )}
    </section>
  )
}

function DeveloperLeadWorkspacePanel({
  lead,
  developments,
  agents,
  organisationId,
  journeyOverrides = [],
  handoverSubmitting,
  converting,
  copying,
  setupUpdating,
  onClose,
  onOpenTransaction,
  onRequestHandover,
  onConvertLead,
  onCopyLeadOnboarding,
  onUpdateLeadSetup,
  onJourneyOverrideCreated,
  onJourneyOverrideError,
}) {
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedJourneyStage, setSelectedJourneyStage] = useState('captured')
  const [leadUnits, setLeadUnits] = useState([])
  const [leadUnitsLoading, setLeadUnitsLoading] = useState(false)
  const [selectedPreferredUnitId, setSelectedPreferredUnitId] = useState('')
  const [qualificationNote, setQualificationNote] = useState('')
  const [nextActionNote, setNextActionNote] = useState('')
  const [activityDraft, setActivityDraft] = useState({
    type: 'Call',
    outcome: '',
    note: '',
    setAsNextAction: false,
  })

  useEffect(() => {
    setActiveTab('overview')
    setSelectedJourneyStage('captured')
  }, [lead?.developerLeadId])

  useEffect(() => {
    setSelectedPreferredUnitId(normalizeText(lead?.preferredUnitId))
  }, [lead?.preferredUnitId, lead?.developerLeadId])

  useEffect(() => {
    setQualificationNote(normalizeText(lead?.qualificationNote))
    setNextActionNote(normalizeText(lead?.nextActionNote))
  }, [lead?.qualificationNote, lead?.nextActionNote, lead?.developerLeadId])

  useEffect(() => {
    setActivityDraft({
      type: 'Call',
      outcome: '',
      note: '',
      setAsNextAction: false,
    })
  }, [lead?.developerLeadId])

  useEffect(() => {
    let cancelled = false
    async function loadLeadUnits() {
      const developmentId = normalizeText(lead?.primaryDevelopmentId)
      if (!developmentId) {
        setLeadUnits([])
        setLeadUnitsLoading(false)
        return
      }
      try {
        setLeadUnitsLoading(true)
        const rows = await fetchUnitsForTransactionSetup(developmentId)
        if (!cancelled) setLeadUnits(rows || [])
      } catch {
        if (!cancelled) setLeadUnits([])
      } finally {
        if (!cancelled) setLeadUnitsLoading(false)
      }
    }
    void loadLeadUnits()
    return () => {
      cancelled = true
    }
  }, [lead?.primaryDevelopmentId])

  if (!lead) return null

  const assigned = agents.find((agent) => (agent.userId || agent.id) === lead.assignedAgentId)
  const handoff = buildDeveloperLeadTransactionHandoff(lead)
  const agencyFed = isAgencyFedLead(lead)
  const handoverRequired = requiresAgencyHandover(lead)
  const handoverPending = agencyFed && lead.visibilityState === 'consent_pending'
  const converted = isConvertedLead(lead)
  const leadStatus = normalizeLower(lead.leadStatus || 'new')
  const onboardingStarted = ['onboarding_sent', 'onboarding_submitted', 'otp'].includes(leadStatus) && Boolean(normalizeText(lead.convertedTransactionId))
  const capturedTitle = getLeadDisplayName(lead)
  const title = handoverRequired ? capturedTitle : getOnboardingBuyerName(lead, capturedTitle)
  const subtitle = agencyFed && handoverRequired
    ? 'Buyer details are protected until the source agency completes handover.'
    : lead.buyerEmail || lead.buyerPhone || 'Capture buyer contact details before onboarding.'
  const blockers = handoff.blockers || []
  const warnings = handoff.warnings || []
  const journeyStages = buildDeveloperLeadJourneyStages(lead, journeyOverrides)
  const selectedStage = journeyStages.find((stage) => stage.key === selectedJourneyStage) || journeyStages.find((stage) => stage.state === 'current') || journeyStages[0]
  const nextManualStatus = getNextManualLeadStatus(lead)
  const selectedStageCompletion = getStageCompletionStatus(selectedStage?.key, lead)
  const needsPreferredUnit = ['qualified', 'viewing', 'reserved'].includes(leadStatus) && blockers.some((blocker) => blocker.code === 'unit_missing')
  const nextAction = getDeveloperLeadNextAction(lead)
  const displayedNextActionLabel = normalizeText(lead.nextActionNote) || nextAction.label
  const budget = lead.budgetMin || lead.budgetMax
    ? `${formatCurrency(lead.budgetMin)} - ${formatCurrency(lead.budgetMax)}`
    : 'Open budget'
  const assignedLabel = assigned ? getUserLabel(assigned) : agencyFed ? 'Agency agent' : 'Unassigned'
  const developmentLabel = getDevelopmentLabel(lead.primaryDevelopmentId, developments)
  const sourceLabel = agencyFed ? 'Agency-fed protected lead' : getLeadSourceLabel(lead.leadSource)
  const onboardingProfile = buildDeveloperLeadOnboardingProfile({
    lead,
    title,
    subtitle,
    budget,
    assignedLabel,
    sourceLabel,
    handoverRequired,
  })
  const journeyReadiness = getLeadWorkspaceReadiness(journeyStages)
  const headerContextLine = getLeadWorkspaceContextLine({ lead, developmentLabel, leadUnits })
  const headerReadinessRows = getLeadWorkspaceReadinessRows({
    lead,
    budget,
    onboardingProfile,
    journeyReadiness,
    handoff,
  })
  const qualificationRows = getDeveloperLeadQualificationRows({
    lead,
    budget,
    onboardingProfile,
    developmentLabel,
    headerContextLine,
    qualificationNote,
  })
  const qualificationCapturedCount = qualificationRows.filter((row) => row.value !== 'Not captured').length
  const qualificationTotalCount = qualificationRows.length
  const qualificationProgressPercent = qualificationTotalCount
    ? Math.round((qualificationCapturedCount / qualificationTotalCount) * 100)
    : 0
  const qualificationStatusMeta = getDeveloperQualificationStatusMeta(qualificationCapturedCount, qualificationTotalCount)
  const workspaceTabs = [
    { key: 'overview', label: 'Overview', meta: '' },
    { key: 'buyer_profile', label: 'Buyer Profile', meta: handoverRequired ? 'Protected' : '' },
    { key: 'onboarding_otp', label: 'Transaction Setup / Offer', meta: handoff.eligible ? 'Ready' : '' },
    { key: 'development', label: 'Development', meta: lead.interestedDevelopmentIds?.length || '' },
    { key: 'documents', label: 'Documents', meta: onboardingStarted || converted ? 'Context' : '' },
    { key: 'activity', label: 'Activity', meta: '' },
  ]
  const activityItems = [
    { key: 'created', title: 'Lead captured', detail: getLeadSourceLabel(lead.leadSource), timestamp: lead.createdAt, Icon: ClipboardList },
    ...(handoverPending ? [{ key: 'handover', title: 'Agency handover requested', detail: 'Waiting for protected buyer details', timestamp: lead.updatedAt, Icon: EyeOff }] : []),
    ...(leadStatus === 'onboarding_sent' ? [{ key: 'onboarding_sent', title: 'Buyer onboarding sent', detail: 'Waiting for buyer submission', timestamp: lead.updatedAt, Icon: Mail }] : []),
    ...(leadStatus === 'onboarding_submitted' ? [{ key: 'onboarding_submitted', title: 'Buyer onboarding submitted', detail: 'Ready for signed OTP upload', timestamp: lead.updatedAt, Icon: CheckSquare }] : []),
    ...(leadStatus === 'otp' ? [{ key: 'otp', title: 'Signed OTP uploaded', detail: 'Transaction workflow has started', timestamp: lead.updatedAt, Icon: FileText }] : []),
    ...(converted ? [{ key: 'converted', title: 'Transaction workflow active', detail: 'Buyer lead has entered the transaction workflow', timestamp: lead.updatedAt, Icon: CheckCircle2 }] : []),
  ]

  function handleMarkStatus(action) {
    if (!action?.status) return
    onUpdateLeadSetup(lead, {
      leadStatus: action.status,
      previousLeadStatus: leadStatus,
      activityNote: action.detail,
    })
  }

  function handleSavePreferredUnit() {
    onUpdateLeadSetup(lead, {
      preferredUnitId: selectedPreferredUnitId,
      activityNote: 'Preferred unit was selected for buyer onboarding.',
    })
  }

  function handleSaveQualificationPlan({ markQualified = false } = {}) {
    const normalizedQualificationNote = normalizeText(qualificationNote)
    const normalizedNextActionNote = normalizeText(nextActionNote)
    const updates = {
      qualificationNote: normalizedQualificationNote,
      nextActionNote: normalizedNextActionNote,
      activityNote: markQualified
        ? normalizedQualificationNote || 'Lead was marked qualified.'
        : 'Lead qualification plan updated.',
    }
    if (markQualified) {
      updates.leadStatus = 'qualified'
      updates.previousLeadStatus = leadStatus
    }
    onUpdateLeadSetup(lead, updates)
  }

  function handleLogActivity(event) {
    event.preventDefault()
    const normalizedNote = normalizeText(activityDraft.note)
    const normalizedOutcome = normalizeText(activityDraft.outcome)
    const activitySummary = [
      activityDraft.type,
      normalizedOutcome,
      normalizedNote,
    ].filter(Boolean).join(' - ')
    const mergedQualificationNote = [
      normalizeText(qualificationNote),
      activitySummary,
    ].filter(Boolean).join('\n\n')
    const nextActionFromActivity = normalizedNote || normalizedOutcome || `${activityDraft.type} follow-up`

    setQualificationNote(mergedQualificationNote)
    if (activityDraft.setAsNextAction) setNextActionNote(nextActionFromActivity)
    onUpdateLeadSetup(lead, {
      qualificationNote: mergedQualificationNote,
      nextActionNote: activityDraft.setAsNextAction ? nextActionFromActivity : normalizeText(nextActionNote),
      activityNote: activitySummary || `${activityDraft.type} touchpoint captured.`,
    })
    setActivityDraft({
      type: activityDraft.type,
      outcome: '',
      note: '',
      setAsNextAction: false,
    })
  }

  function renderStageCompletionAction(action, { compact = false } = {}) {
    if (!action) return null
    return (
      <Button type="button" size={compact ? 'sm' : undefined} variant="secondary" disabled={setupUpdating} onClick={() => handleMarkStatus(action)}>
        <CheckCircle2 size={16} />
        {setupUpdating ? 'Updating...' : action.label}
      </Button>
    )
  }

  function renderPrimaryAction({ compact = false } = {}) {
    if (onboardingStarted && !converted) {
      return (
        <Button type="button" size={compact ? 'sm' : undefined} variant="secondary" onClick={() => onOpenTransaction(lead.convertedTransactionId)}>
          <ExternalLink size={16} />
          {leadStatus === 'otp' ? 'Open Transaction Workflow' : 'Open Onboarding Context'}
        </Button>
      )
    }
    if (converted) {
      return (
        <Button type="button" size={compact ? 'sm' : undefined} onClick={() => onOpenTransaction(lead.convertedTransactionId)}>
          <ExternalLink size={16} />
          Open Transaction Workflow
        </Button>
      )
    }
    if (handoverRequired) {
      return (
        <Button type="button" size={compact ? 'sm' : undefined} variant="secondary" disabled={handoverPending || handoverSubmitting} onClick={() => onRequestHandover(lead.developerLeadId)}>
          <EyeOff size={16} />
          {handoverPending ? 'Handover Requested' : 'Request Handover'}
        </Button>
      )
    }
    if (handoff.eligible) {
      return (
        <Button type="button" size={compact ? 'sm' : undefined} disabled={converting} onClick={() => onConvertLead(lead)}>
          <ExternalLink size={16} />
          {converting ? 'Sending...' : 'Send Buyer Onboarding'}
        </Button>
      )
    }
    if (needsPreferredUnit) {
      return (
        <Button type="button" size={compact ? 'sm' : undefined} variant="secondary" onClick={() => setActiveTab('development')}>
          <Home size={16} />
          Select Preferred Unit
        </Button>
      )
    }
    if (nextManualStatus) {
      return renderStageCompletionAction(nextManualStatus, { compact })
    }
    return (
      <span className="inline-flex min-h-10 items-center rounded-[12px] border border-[#d9e5f2] bg-[#f8fafc] px-3 text-sm font-semibold text-[#52677f]">
        Complete setup before onboarding can be sent.
      </span>
    )
  }

  function renderCopyOnboardingAction({ compact = false } = {}) {
    if (handoverRequired) return null
    return (
      <Button type="button" size={compact ? 'sm' : undefined} variant="secondary" disabled={copying} onClick={() => onCopyLeadOnboarding(lead)}>
        <Copy size={16} />
        {copying ? 'Copying...' : 'Copy Buyer Onboarding Link'}
      </Button>
    )
  }

  function renderWorkspaceTabs() {
    return (
      <section className="scroll-mt-3 overflow-x-auto rounded-[18px] border border-[#dce7f2] bg-white shadow-[0_10px_26px_rgba(31,54,78,0.045)]" role="tablist" aria-label="Buyer workspace sections" data-testid="lead-workspace-tabs">
        <div className="grid min-w-[840px]" style={{ gridTemplateColumns: `repeat(${workspaceTabs.length}, minmax(132px, 1fr))` }}>
          {workspaceTabs.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                role="tab"
                aria-selected={isActive}
                className={`relative flex min-h-[52px] items-center justify-center gap-2 whitespace-nowrap px-3 text-[0.82rem] transition ${
                  isActive ? 'font-semibold text-[#123955]' : 'font-medium text-[#60758b] hover:text-[#163247]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.meta !== '' ? (
                  <span className={`rounded-full px-2 py-0.5 text-[0.66rem] ${isActive ? 'bg-[#e8f2fb] text-[#1f5f8a]' : 'bg-[#f6f9fc] text-[#8aa0b7]'}`}>{tab.meta}</span>
                ) : null}
                <span className={`absolute inset-x-5 bottom-0 h-0.5 rounded-full bg-[#2f7b9e] transition ${isActive ? 'opacity-100' : 'opacity-0'}`} />
              </button>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <section className="grid min-w-0 gap-3" data-developer-lead-workspace="true">
      <div className="overflow-hidden rounded-[22px] border border-[#dbe7f2] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03),0_14px_34px_rgba(31,54,78,0.05)]">
        <div className="border-b border-[#edf3f8] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" className="inline-flex items-center gap-2 text-[0.82rem] font-semibold text-[#60758d] transition hover:text-[#17613d]" onClick={onClose}>
              <ArrowLeft size={16} />
              Back to Leads
            </button>
            <span className="sr-only">Buyer Lead Workspace</span>
            <details className="group relative">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-[13px] border border-[#d9e5f2] bg-white px-4 text-[0.82rem] font-semibold text-[#102033] shadow-[0_8px_20px_rgba(31,54,78,0.05)] transition hover:border-[#bfd0e0]">
                Actions
                <ChevronDown size={16} className="transition group-open:rotate-180" />
              </summary>
              <div className="absolute right-0 z-30 mt-2 grid min-w-[260px] gap-2 rounded-[16px] border border-[#dbe7f2] bg-white p-2 shadow-[0_18px_44px_rgba(16,38,61,0.16)]">
                <Button type="button" variant="secondary" className="justify-start" onClick={onClose}>
                  <ArrowLeft size={16} />
                  Lead Table
                </Button>
                {renderCopyOnboardingAction()}
                {renderPrimaryAction()}
              </div>
            </details>
          </div>

          <div className="mt-4 overflow-hidden rounded-[20px] border border-[#dbe7f2] bg-white shadow-[0_14px_34px_rgba(31,54,78,0.07)]">
            <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]">
              <div className="relative flex min-h-[220px] flex-col justify-between overflow-hidden bg-[#082b46] px-5 py-5 text-white sm:px-7 lg:px-8">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(47,123,158,0.32),transparent_34%),linear-gradient(145deg,rgba(5,31,52,0.12),rgba(5,31,52,0.92))]" />
                <div className="relative">
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex h-7 items-center rounded-full border border-[#2b74b7] bg-[#0c3760] px-3 text-[0.72rem] font-semibold text-white">Buyer Lead</span>
                    <span className="inline-flex h-7 items-center rounded-full border border-white/10 bg-white/10 px-3 text-[0.72rem] font-semibold text-[#d9e8f5]">Qualification</span>
                  </div>
                  <h2 className="mt-6 max-w-4xl text-[clamp(2rem,4.5vw,3.25rem)] font-semibold leading-none tracking-[-0.055em] text-white">
                    {title}
                  </h2>
                  <p className="mt-4 flex max-w-3xl items-center gap-2 text-[0.98rem] font-semibold text-[#d8e5f0]">
                    <Home size={17} className="shrink-0 text-[#9fb8ce]" />
                    <span className="min-w-0 truncate">{headerContextLine}</span>
                  </p>
                </div>
                <div className="relative mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[0.82rem] font-semibold text-[#d8e5f0]">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Phone size={15} className="shrink-0 text-[#9fb8ce]" />
                    <span className="truncate">{getLeadContactLine(lead, 'phone')}</span>
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <Mail size={15} className="shrink-0 text-[#9fb8ce]" />
                    <span className="truncate">{getLeadContactLine(lead, 'email')}</span>
                  </span>
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <UserPlus size={15} className="shrink-0 text-[#9fb8ce]" />
                    <span className="truncate">{assignedLabel}</span>
                  </span>
                </div>
              </div>

              <div className="bg-white px-5 py-5 sm:px-6 lg:px-7">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[#425a74]">Buyer Readiness</p>
                <div className="mt-4 grid gap-4 xl:grid-cols-[150px_minmax(0,1fr)] xl:items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className="grid h-32 w-32 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgba(219,231,242,0.9)]"
                      style={{ background: `conic-gradient(#2f87aa ${journeyReadiness.score}%, #e8eef6 0)` }}
                    >
                      <div className="grid h-20 w-20 place-items-center rounded-full bg-white shadow-[0_12px_26px_rgba(31,54,78,0.1)]">
                        <span className="text-2xl font-semibold tracking-[-0.04em] text-[#102033]">{journeyReadiness.score}</span>
                      </div>
                    </div>
                    <strong className="mt-3 text-base font-semibold text-[#102033]">{journeyReadiness.statusLabel}</strong>
                    <span className="mt-1 text-xs font-semibold text-[#6d839b]">{journeyReadiness.completedLabel}</span>
                  </div>

                  <div className="overflow-hidden rounded-[18px] border border-[#dbe7f2]">
                    {headerReadinessRows.map(({ key, label, value, helper, Icon }) => (
                      <div key={key} className="grid min-h-[54px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[#e8eff6] px-4 py-2 last:border-b-0">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Icon size={16} className="shrink-0 text-[#315b7a]" />
                          <span className="truncate text-[0.9rem] font-semibold text-[#20364c]">{label}</span>
                        </div>
                        <div className="min-w-0 text-right">
                          <strong className="block max-w-[126px] truncate text-[0.86rem] font-semibold text-[#6a8098]" title={String(value)}>{value}</strong>
                          <span className="mt-0.5 block text-[0.76rem] font-semibold text-[#8aa0b4]">{helper}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex h-7 items-center rounded-full border border-[#dbe6f1] bg-[#f8fbff] px-3 text-[0.72rem] font-semibold text-[#4d6782]">{sourceLabel}</span>
                  <StatusBadge status={lead.leadStatus} />
                  <span className={`inline-flex h-7 items-center rounded-full border px-3 text-[0.72rem] font-semibold ${getHandoffTone(handoff.status)}`}>
                    {converted ? 'Transaction created' : handoff.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-b border-[#edf3f8] px-4 py-3 sm:px-5">
          {renderWorkspaceTabs()}
        </div>

        <div className="px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[0.95rem] font-semibold uppercase tracking-[0.08em] text-[#102033]">Deal Journey</h3>
            <span className="rounded-full border border-[#d8e5f1] bg-[#fbfdff] px-3 py-1 text-[0.72rem] font-semibold text-[#60758b]">
              {selectedStage?.label || 'Lead captured'}
            </span>
          </div>
          <div className="mt-4 overflow-x-auto pb-1">
            <ol
              className="grid min-w-[780px] items-start"
              style={{ gridTemplateColumns: `repeat(${Math.max(journeyStages.length, 1)}, minmax(124px, 1fr))` }}
            >
              {journeyStages.map((stage, index) => {
                const isSelected = selectedStage?.key === stage.key
                const isCompleted = stage.state === 'completed'
                const isCurrent = stage.state === 'current'
                return (
                  <li key={stage.key} className="relative px-2">
                    {index < journeyStages.length - 1 ? (
                      <span className={`absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-[18px] h-0.5 ${isCompleted || isCurrent ? 'bg-[#9bc7de]' : 'bg-[#dce6f1]'}`} aria-hidden="true" />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelectedJourneyStage(stage.key)}
                      className={`relative flex min-h-[88px] w-full flex-col items-center text-center transition ${
                        isCurrent || isSelected ? 'rounded-[16px] border border-[#cfe0ee] bg-[#f4f9fc] px-2.5 py-2.5 shadow-[0_8px_18px_rgba(31,54,78,0.05)]' : 'px-2 py-2.5 hover:rounded-[16px] hover:bg-[#f8fbfd]'
                      }`}
                      aria-current={isCurrent ? 'step' : undefined}
                    >
                      <span className={`z-10 grid h-9 w-9 place-items-center rounded-full border-2 text-xs font-bold ${
                        isCompleted
                          ? 'border-[#2f7b9e] bg-[#2f7b9e] text-white'
                          : isCurrent
                            ? 'border-[#2f7b9e] bg-white text-[#245f86] shadow-[0_0_0_7px_rgba(47,123,158,0.12)]'
                            : 'border-[#cad7e5] bg-white text-[#8fa1b4]'
                      }`}>
                        {isCompleted ? <CheckCircle2 size={15} /> : index + 1}
                      </span>
                      <p className="mt-2 max-w-[130px] text-[0.8rem] font-semibold leading-4 text-[#203a54]">{stage.label}</p>
                      <p className="mt-1 max-w-[130px] truncate text-[0.7rem] font-semibold text-[#6d839b]" title={stage.detail}>{stage.detail}</p>
                      {isCurrent ? <span className="mt-2 rounded-full bg-[#dfeef7] px-2.5 py-1 text-[0.64rem] font-bold uppercase tracking-[0.1em] text-[#245f86]">Live</span> : null}
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
          <div className="mt-3 rounded-[16px] border border-[#e4edf6] bg-[#fbfdff] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7d91a8]">Stage Actions</p>
                <h3 className="mt-1 text-[0.92rem] font-semibold text-[#18324b]">{selectedStage?.label || 'Lead captured'}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <JourneyStageOverrideActions
                  organisationId={organisationId}
                  entityType={JOURNEY_ENTITY_TYPES.developerLead}
                  entityId={lead.developerLeadId}
                  stage={selectedStage}
                  onCreated={onJourneyOverrideCreated}
                  onError={onJourneyOverrideError}
                />
                {renderStageCompletionAction(selectedStageCompletion, { compact: true })}
                {selectedStage?.key === 'captured' || selectedStage?.key === 'contacted' ? (
                  <>
                    {renderCopyOnboardingAction({ compact: true })}
                    <Button type="button" size="sm" variant="secondary" onClick={() => setActiveTab('buyer_profile')}>Open profile</Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setActiveTab('activity')}>View activity</Button>
                  </>
                ) : selectedStage?.key === 'qualified' || selectedStage?.key === 'reservation' || selectedStage?.key === 'onboarding_otp' ? (
                  <>
                    {renderCopyOnboardingAction({ compact: true })}
                    {renderPrimaryAction({ compact: true })}
                    <Button type="button" size="sm" variant="secondary" onClick={() => setActiveTab('onboarding_otp')}>Open setup</Button>
                  </>
                ) : (
                  <>
                    {renderPrimaryAction({ compact: true })}
                    <Button type="button" size="sm" variant="secondary" onClick={() => setActiveTab('documents')}>Documents</Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(420px,0.55fr)_minmax(0,0.45fr)] xl:items-stretch">
        <form className="flex h-full flex-col rounded-[24px] border border-[#dce7f2] bg-white p-5 shadow-[0_14px_36px_rgba(31,54,78,0.05)]" onSubmit={(event) => {
          event.preventDefault()
          handleSaveQualificationPlan()
        }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6d839b]">Buyer Qualification</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#102033]">Phone qualification questions</h2>
              <span className="sr-only">Qualification note</span>
              <span className="sr-only">Save & Mark Qualified</span>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="h-2 w-36 overflow-hidden rounded-full bg-[#e8eef5]">
                  <span className="block h-full rounded-full bg-[#157aaf]" style={{ width: `${qualificationProgressPercent}%` }} />
                </span>
                <span className="text-sm font-semibold text-[#60758b]">
                  {qualificationCapturedCount} / {qualificationTotalCount} captured
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${qualificationStatusMeta.className}`}>
                {qualificationStatusMeta.label}
              </span>
              <Button type="button" size="sm" variant="secondary" onClick={() => setActiveTab('buyer_profile')}>
                <Pencil size={16} />
                Edit
              </Button>
            </div>
          </div>

          <div className="mt-5 flex flex-1 flex-col border-t border-[#edf3f8]">
            {qualificationRows.map((row, rowIndex) => {
              const isMissing = row.value === 'Not captured'
              const Icon = row.Icon
              return (
                <div key={row.label} className={`grid flex-1 grid-cols-[42px_minmax(0,1fr)] gap-x-4 gap-y-2 border-b border-[#edf3f8] py-3 last:border-b-0 sm:grid-cols-[42px_minmax(170px,0.42fr)_minmax(0,1fr)] ${row.wide ? 'sm:items-start' : 'sm:items-center'} ${rowIndex === 0 ? 'pt-5' : ''}`}>
                  <span className="grid h-10 w-10 place-items-center rounded-[13px] bg-[#eef5fb] text-[#1d65a6]">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 self-center">
                    <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#536f8f]">{row.label}</span>
                  </span>
                  <span className="col-start-2 min-w-0 self-center sm:col-start-auto">
                    <span className={`block text-base leading-6 ${row.wide && !isMissing ? 'max-h-[12rem] overflow-y-auto whitespace-pre-wrap rounded-[12px] border border-[#e4edf6] bg-[#fbfdff] p-3' : 'truncate'} ${isMissing ? 'font-medium text-[#9aa9b8]' : 'font-semibold text-[#102033]'}`} title={String(row.value)}>{row.value}</span>
                  </span>
                </div>
              )
            })}
          </div>
        </form>

        <div className="flex h-full min-w-0 flex-col gap-5">
          <section className="rounded-[24px] border border-[#17364d] bg-[#102033] p-6 text-white shadow-[0_14px_36px_rgba(16,32,51,0.16)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a8bfd3]">What’s Next</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">{displayedNextActionLabel}</h2>
            <p className="mt-3 text-base leading-7 text-[#c7d5e2]">{nextAction.helper}</p>
            <span className="mt-8 grid h-14 w-14 place-items-center rounded-full bg-white/10 text-[#9bd6b7] ring-1 ring-white/15">
              <CheckSquare size={24} />
            </span>
            <div className="mt-7">
              {renderPrimaryAction()}
            </div>
          </section>

          <section className="flex flex-1 flex-col rounded-[24px] border border-[#dce7f2] bg-white p-5 shadow-[0_14px_36px_rgba(31,54,78,0.05)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6d839b]">Activity Logger</p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#102033]">Capture touchpoint</h2>
                <span className="sr-only">Next action</span>
              </div>
              <Zap size={24} className="text-[#2f7b9e]" />
            </div>

            <form className="mt-5 flex flex-1 flex-col gap-4" onSubmit={handleLogActivity}>
              <div className="grid gap-1 rounded-[16px] bg-[#f3f7fb] p-1 sm:grid-cols-5">
                {[
                  ['Call', Phone],
                  ['WhatsApp', MessageCircle],
                  ['Email', Mail],
                  ['Note', Pencil],
                  ['Meeting', CalendarDays],
                ].map(([label, Icon]) => {
                  const active = activityDraft.type === label
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`flex min-h-12 items-center justify-center gap-2 rounded-[14px] px-3 text-sm font-semibold transition ${active ? 'bg-white text-[#123955] shadow-[0_8px_18px_rgba(31,54,78,0.08)]' : 'text-[#60758b] hover:text-[#123955]'}`}
                      onClick={() => setActivityDraft((previous) => ({ ...previous, type: label }))}
                    >
                      <Icon size={18} />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  )
                })}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <select
                  className="h-14 rounded-[14px] border border-[#dbe7f2] bg-white px-4 text-base font-medium text-[#20364c] outline-none transition focus:border-[#2f7b9e] focus:ring-2 focus:ring-[#d9eaf3]"
                  value={activityDraft.type}
                  onChange={(event) => setActivityDraft((previous) => ({ ...previous, type: event.target.value }))}
                >
                  {['Call', 'WhatsApp', 'Email', 'Note', 'Meeting'].map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
                <select
                  className="h-14 rounded-[14px] border border-[#dbe7f2] bg-white px-4 text-base font-medium text-[#20364c] outline-none transition focus:border-[#2f7b9e] focus:ring-2 focus:ring-[#d9eaf3]"
                  value={activityDraft.outcome}
                  onChange={(event) => setActivityDraft((previous) => ({ ...previous, outcome: event.target.value }))}
                >
                  {['', 'Connected', 'No answer', 'Qualified', 'Viewing booked', 'Follow-up needed'].map((option) => (
                    <option key={option || 'empty-outcome'} value={option}>{option || 'Outcome'}</option>
                  ))}
                </select>
              </div>

              <textarea
                className="min-h-[150px] flex-1 rounded-[16px] border border-[#dbe7f2] bg-white px-4 py-4 text-base text-[#20364c] outline-none transition placeholder:text-[#9aa9b8] focus:border-[#2f7b9e] focus:ring-2 focus:ring-[#d9eaf3]"
                value={activityDraft.note}
                onChange={(event) => setActivityDraft((previous) => ({ ...previous, note: event.target.value }))}
                placeholder="Add notes about this activity..."
                disabled={setupUpdating}
              />

              <label className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#60758b]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[#cbd8e6]"
                  checked={activityDraft.setAsNextAction}
                  onChange={(event) => setActivityDraft((previous) => ({ ...previous, setAsNextAction: event.target.checked }))}
                />
                Set as next action
              </label>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {!handoverRequired && lead.buyerPhone ? (
                  <a className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[#dbe7f2] px-4 text-sm font-semibold text-[#20364c]" href={`tel:${lead.buyerPhone}`}>
                    <Phone size={18} />
                    Call
                  </a>
                ) : null}
                {!handoverRequired && lead.buyerEmail ? (
                  <a className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-[#dbe7f2] px-4 text-sm font-semibold text-[#20364c]" href={`mailto:${lead.buyerEmail}`}>
                    <Mail size={18} />
                    Email
                  </a>
                ) : null}
                <Button type="submit" disabled={setupUpdating}>
                  {setupUpdating ? 'Logging...' : 'Log Activity'}
                </Button>
              </div>
            </form>
          </section>
        </div>
      </section>

      <section className="rounded-[20px] border border-[#dce7f2] bg-white p-5 shadow-[0_10px_30px_rgba(31,54,78,0.045)] sm:p-6">
        {activeTab === 'overview' ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-[16px] border border-[#e4edf6] bg-[#fbfdff] p-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Buyer</p>
              <p className="mt-2 text-lg font-semibold text-[#10243a]">{title}</p>
              <p className="mt-1 text-sm text-[#60758b]">{subtitle}</p>
            </div>
            <div className="rounded-[16px] border border-[#e4edf6] bg-[#fbfdff] p-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Development</p>
              <p className="mt-2 text-lg font-semibold text-[#10243a]">{developmentLabel}</p>
              <p className="mt-1 text-sm text-[#60758b]">{lead.unitTypeInterest || 'Unit interest pending'}</p>
            </div>
            <div className="rounded-[16px] border border-[#e4edf6] bg-[#fbfdff] p-4">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Onboarding</p>
              <p className="mt-2 text-lg font-semibold text-[#10243a]">{handoff.eligible ? 'Ready to send' : 'Setup required'}</p>
              <p className="mt-1 text-sm text-[#60758b]">{displayedNextActionLabel}</p>
            </div>
          </div>
        ) : null}

        {activeTab === 'buyer_profile' ? (
          <div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-xl font-semibold tracking-[-0.02em] text-[#102033]">Buyer Profile</h3>
                <p className="mt-2 text-sm leading-6 text-[#60758b]">
                  {onboardingProfile.hasOnboarding
                    ? 'These fields are populated from the submitted buyer onboarding.'
                    : 'These fields are still using the original lead capture because buyer onboarding has not populated this lead yet.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                <span className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold ${
                  onboardingProfile.hasOnboarding
                    ? 'border-[#d8efe4] bg-[#f1fbf6] text-[#17613d]'
                    : 'border-[#d9e5f2] bg-[#f8fafc] text-[#52677f]'
                }`}>
                  {onboardingProfile.sourceLabel}
                </span>
                {onboardingProfile.updatedAt ? (
                  <span className="inline-flex h-8 items-center rounded-full border border-[#d9e5f2] bg-[#fbfdff] px-3 text-xs font-semibold text-[#60758b]">
                    Updated {formatRelativeTime(onboardingProfile.updatedAt)}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="mt-5 grid gap-4">
              {onboardingProfile.sections.map((section) => (
                <section key={section.title} className="rounded-[16px] border border-[#e4edf6] bg-[#fbfdff] p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">{section.title}</p>
                      <p className="mt-1 text-sm text-[#60758b]">{section.description}</p>
                    </div>
                    <span className="text-xs font-semibold text-[#7a8ba3]">{section.rows.length} field{section.rows.length === 1 ? '' : 's'}</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {section.rows.map((row) => (
                      <div key={`${section.title}-${row.label}`} className="rounded-[14px] border border-[#e4edf6] bg-white p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">{row.label}</p>
                        <p className="mt-2 whitespace-pre-line break-words text-sm font-semibold text-[#29445f]">{row.value}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : null}

        {activeTab === 'onboarding_otp' ? (
          <div className="grid gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-xl font-semibold tracking-[-0.02em] text-[#102033]">Transaction Setup / Offer</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758b]">
                  This mirrors the buyer lead onboarding step from the agency workspace. OTP upload is the handoff into the transaction workflow.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {renderCopyOnboardingAction()}
                {renderPrimaryAction()}
              </div>
            </div>
            {blockers.length || warnings.length ? (
              <div className="grid gap-3">
                {blockers.map((blocker) => (
                  <div key={blocker.code} className="rounded-[14px] border border-[#f0dfb8] bg-[#fff9ec] p-3 text-sm text-[#8a5a12]">
                    {blocker.message}
                  </div>
                ))}
                {warnings.map((warning) => (
                  <div key={warning.code} className="rounded-[14px] border border-[#d9e5f2] bg-[#f8fafc] p-3 text-sm text-[#29445f]">
                    {warning.message}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[14px] border border-[#d8efe4] bg-[#f1fbf6] p-3 text-sm font-semibold text-[#17613d]">
                The lead is ready for buyer onboarding. Upload the signed OTP after onboarding is submitted to start the transaction workflow.
              </div>
            )}
            {onboardingProfile.hasOnboarding && onboardingProfile.financeRows.length ? (
              <section className="rounded-[16px] border border-[#e4edf6] bg-[#fbfdff] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Submitted Finance Setup</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {onboardingProfile.financeRows.map((row) => (
                    <div key={`finance-${row.label}`} className="rounded-[14px] border border-[#e4edf6] bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">{row.label}</p>
                      <p className="mt-2 whitespace-pre-line break-words text-sm font-semibold text-[#29445f]">{row.value}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'development' ? (
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.02em] text-[#102033]">Development Interest</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-[14px] border border-[#e4edf6] bg-[#fbfdff] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Primary Development</p>
                <p className="mt-2 text-sm font-semibold text-[#29445f]">{developmentLabel}</p>
              </div>
              <div className="rounded-[14px] border border-[#e4edf6] bg-[#fbfdff] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Unit Type</p>
                <p className="mt-2 text-sm font-semibold text-[#29445f]">{lead.unitTypeInterest || 'Any unit'}</p>
              </div>
              <div className="rounded-[14px] border border-[#e4edf6] bg-[#fbfdff] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]">Reservation</p>
                <p className="mt-2 text-sm font-semibold capitalize text-[#29445f]">{lead.reservationState || 'Not reserved'}</p>
              </div>
            </div>
            <div className="mt-4 rounded-[16px] border border-[#e4edf6] bg-[#fbfdff] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 flex-1">
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7a8ba3]" htmlFor="developer-lead-preferred-unit">
                    Preferred Unit
                  </label>
                  <select
                    id="developer-lead-preferred-unit"
                    className="mt-2 h-11 w-full rounded-[12px] border border-[#d9e5f2] bg-white px-3 text-sm font-semibold text-[#20364c] outline-none transition focus:border-[#2f7b9e] focus:ring-2 focus:ring-[#d9eaf3]"
                    value={selectedPreferredUnitId}
                    onChange={(event) => setSelectedPreferredUnitId(event.target.value)}
                    disabled={leadUnitsLoading || !lead.primaryDevelopmentId || setupUpdating}
                  >
                    <option value="">{leadUnitsLoading ? 'Loading units...' : 'Select a unit'}</option>
                    {leadUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.unit_number || unit.unitNumber || unit.name || unit.title || `Unit ${unit.id}`}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs leading-5 text-[#60758b]">
                    Buyer onboarding for a development sale needs a preferred unit before the link can be sent.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={setupUpdating || leadUnitsLoading || !selectedPreferredUnitId || selectedPreferredUnitId === normalizeText(lead.preferredUnitId)}
                  onClick={handleSavePreferredUnit}
                >
                  <CheckCircle2 size={16} />
                  {setupUpdating ? 'Saving...' : 'Save Unit'}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {activeTab === 'documents' ? (
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.02em] text-[#102033]">Documents</h3>
            <p className="mt-2 text-sm leading-6 text-[#60758b]">
              Buyer onboarding documents stay with the onboarding context. Uploading the signed OTP starts the transaction workflow for finance, transfer, and registration.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {renderCopyOnboardingAction()}
              {renderPrimaryAction()}
            </div>
          </div>
        ) : null}

        {activeTab === 'activity' ? (
          <div>
            <h3 className="text-xl font-semibold tracking-[-0.02em] text-[#102033]">Activity</h3>
            <div className="mt-4 grid gap-2">
              {activityItems.map((item) => (
                <div key={item.key} className="rounded-[14px] border border-[#e4edf6] bg-[#fbfdff] p-4">
                  <p className="text-sm font-semibold text-[#29445f]">{item.title}</p>
                  <p className="mt-1 text-sm text-[#60758b]">{item.detail} · {formatRelativeTime(item.timestamp)}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </section>
  )
}

export default function DeveloperLeadsPage() {
  const navigate = useNavigate()
  const { developerLeadId: routeDeveloperLeadId = '' } = useParams()
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
  const [copyingLeadId, setCopyingLeadId] = useState('')
  const [setupUpdatingLeadId, setSetupUpdatingLeadId] = useState('')
  const [convertedOnboardingUrl, setConvertedOnboardingUrl] = useState('')
  const [selectedLeadJourneyOverrides, setSelectedLeadJourneyOverrides] = useState([])

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
  const selectedLead = useMemo(() => {
    const selectedKey = normalizeText(routeDeveloperLeadId)
    if (!selectedKey) return null
    return leads.find((lead) => normalizeText(lead.developerLeadId) === selectedKey) || null
  }, [leads, routeDeveloperLeadId])

  const loadSelectedLeadJourneyOverrides = useCallback(async () => {
    const entityId = normalizeText(selectedLead?.developerLeadId)
    if (!developerOrgId || !entityId || !isSupabaseConfigured) {
      setSelectedLeadJourneyOverrides([])
      return
    }
    try {
      const rows = await fetchJourneyStageOverrides({
        organisationId: developerOrgId,
        entityType: JOURNEY_ENTITY_TYPES.developerLead,
        entityId,
      })
      setSelectedLeadJourneyOverrides(rows)
    } catch (overrideError) {
      console.warn('[journey-overrides] unable to load developer lead overrides', overrideError)
      setSelectedLeadJourneyOverrides([])
    }
  }, [developerOrgId, selectedLead?.developerLeadId])

  useEffect(() => {
    void loadSelectedLeadJourneyOverrides()
  }, [loadSelectedLeadJourneyOverrides])

  const handleJourneyOverrideCreated = useCallback(async () => {
    setMessage('Journey override saved.')
    await loadSelectedLeadJourneyOverrides()
  }, [loadSelectedLeadJourneyOverrides])

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

  function handleOpenLead(lead) {
    const leadId = normalizeText(lead?.developerLeadId)
    if (!leadId) return
    navigate(`/developer/leads/${leadId}`)
  }

  function handleCloseLeadWorkspace() {
    navigate('/developer/leads')
  }

  function handleOpenTransaction(transactionId) {
    const normalizedTransactionId = normalizeText(transactionId)
    if (!normalizedTransactionId) return
    navigate(`/transactions/${normalizedTransactionId}`)
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

  async function handleUpdateLeadSetup(lead, updates = {}) {
    if (!developerOrgId || !lead?.developerLeadId) return
    try {
      setSetupUpdatingLeadId(lead.developerLeadId)
      setError('')
      setMessage('')
      setConvertedOnboardingUrl('')
      await updateDeveloperLeadWorkspaceSetup({
        developerOrgId,
        developerLeadId: lead.developerLeadId,
        ...updates,
      })

      const nextStatus = normalizeText(updates.leadStatus)
      if (nextStatus === 'otp') {
        setMessage('Signed OTP marked uploaded. The transaction workflow is ready to open.')
      } else if (nextStatus) {
        setMessage(`Lead moved to ${getLeadStagePresentation(nextStatus).label}.`)
      } else if (Object.prototype.hasOwnProperty.call(updates, 'preferredUnitId')) {
        setMessage('Preferred unit saved for buyer onboarding.')
      } else {
        setMessage('Developer lead setup updated.')
      }
      window.dispatchEvent(new Event('itg:developer-leads-changed'))
      await loadData()
    } catch (setupError) {
      setError(setupError.message || 'Developer lead setup could not be updated.')
    } finally {
      setSetupUpdatingLeadId('')
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
          ? 'Buyer onboarding email sent from the developer lead.'
          : 'Buyer onboarding link is ready, but email delivery needs attention.',
      )
      window.dispatchEvent(new CustomEvent('itg:transaction-created', { detail: result }))
      window.dispatchEvent(new Event('itg:developer-leads-changed'))
      await loadData()
      if (result.transactionId) {
        navigate(`/developer/leads/${lead.developerLeadId}`)
      }
    } catch (conversionError) {
      setError(conversionError.message || 'Buyer onboarding could not be sent from this developer lead.')
    } finally {
      setConvertingLeadId('')
    }
  }

  async function handleCopyLeadOnboarding(lead) {
    if (!developerOrgId || !lead?.developerLeadId) return
    try {
      setCopyingLeadId(lead.developerLeadId)
      setError('')
      setMessage('')
      setConvertedOnboardingUrl('')
      const result = await convertDeveloperLeadToTransactionAndSendOnboarding({
        developerOrgId,
        lead,
        sendBuyerOnboarding: false,
        manualBuyerOnboardingDelivery: true,
      })
      if (result.onboardingUrl && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(result.onboardingUrl).catch(() => null)
      }
      setConvertedOnboardingUrl(result.onboardingUrl || '')
      setMessage(
        result.onboardingUrl
          ? 'Buyer onboarding link copied. You can paste it into WhatsApp.'
          : 'Buyer onboarding context is ready, but no link was returned.',
      )
      window.dispatchEvent(new CustomEvent('itg:transaction-created', { detail: result }))
      window.dispatchEvent(new Event('itg:developer-leads-changed'))
      await loadData()
      if (result.transactionId) {
        navigate(`/developer/leads/${lead.developerLeadId}`)
      }
    } catch (copyError) {
      setError(copyError.message || 'Buyer onboarding link could not be copied from this developer lead.')
    } finally {
      setCopyingLeadId('')
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
    <main className="developer-leads-page min-h-screen overflow-x-hidden bg-[#f6f9fc] p-2 sm:p-3">
      <div className="developer-leads-shell mx-auto grid w-full min-w-0 max-w-none gap-3">
        {routeDeveloperLeadId && selectedLead ? (
          <>
            {error ? (
              <div className="rounded-[12px] border border-[#f8d7da] bg-[#fff5f6] p-4 text-sm text-[#8d2831]">{error}</div>
            ) : null}
            {message ? (
              <div className="rounded-[12px] border border-[#d8efe4] bg-[#f1fbf6] p-4 text-sm text-[#17613d]">{message}</div>
            ) : null}
            {convertedOnboardingUrl ? (
              <div className="rounded-[12px] border border-[#d9e5f2] bg-[#f8fafc] p-4 text-sm text-[#29445f]">
                <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-[#7a8ba3]">Buyer onboarding link</span>
                <a className="mt-2 block break-all font-semibold text-[#17613d]" href={convertedOnboardingUrl} target="_blank" rel="noreferrer">
                  {convertedOnboardingUrl}
                </a>
              </div>
            ) : null}
            <DeveloperLeadWorkspacePanel
              lead={selectedLead}
              developments={developments}
              agents={agents}
              organisationId={developerOrgId}
              journeyOverrides={selectedLeadJourneyOverrides}
              handoverSubmitting={handoverSubmittingId === selectedLead.developerLeadId}
              converting={convertingLeadId === selectedLead.developerLeadId}
              copying={copyingLeadId === selectedLead.developerLeadId}
              setupUpdating={setupUpdatingLeadId === selectedLead.developerLeadId}
              onClose={handleCloseLeadWorkspace}
              onOpenTransaction={handleOpenTransaction}
              onRequestHandover={handleRequestHandover}
              onConvertLead={handleConvertLead}
              onCopyLeadOnboarding={handleCopyLeadOnboarding}
              onUpdateLeadSetup={handleUpdateLeadSetup}
              onJourneyOverrideCreated={handleJourneyOverrideCreated}
              onJourneyOverrideError={setError}
            />
          </>
        ) : routeDeveloperLeadId && !loading ? (
          <section className="developer-leads-panel rounded-[12px] border border-[#f0dfb8] bg-[#fff9ec] p-4 text-sm text-[#8a5a12]">
            This developer lead could not be found in the current workspace.
          </section>
        ) : (
          <DeveloperLeadList
            leads={filteredLeads}
            developments={developments}
            agents={agents}
            loading={loading}
            routeDeveloperLeadId={routeDeveloperLeadId}
            searchTerm={searchTerm}
            statusFilter={statusFilter}
            sourceFilter={sourceFilter}
            error={error}
            message={message}
            convertedOnboardingUrl={convertedOnboardingUrl}
            handoverSubmittingId={handoverSubmittingId}
            convertingLeadId={convertingLeadId}
            copyingLeadId={copyingLeadId}
            onSearchChange={setSearchTerm}
            onStatusFilterChange={setStatusFilter}
            onSourceFilterChange={setSourceFilter}
            onOpenLead={handleOpenLead}
            onRequestHandover={handleRequestHandover}
            onConvertLead={handleConvertLead}
            onCopyLeadOnboarding={handleCopyLeadOnboarding}
            onRefresh={loadData}
            onCreateLead={() => setShowCreateModal(true)}
          />
        )}

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
