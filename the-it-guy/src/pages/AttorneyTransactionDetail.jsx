import {
  Activity,
  Building2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileText,
  MessageSquarePlus,
  MoreHorizontal,
  Send,
  UsersRound,
  Workflow,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import SharedTransactionShell from '../components/SharedTransactionShell'
import AttorneyAssignmentSection from '../components/attorney/assignments/AttorneyAssignmentSection'
import AttorneyWorkflowLanesPanel from '../components/attorney/workflow/AttorneyWorkflowLanesPanel'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import { getAttorneyTransferStage, stageLabelFromAttorneyKey } from '../core/transactions/attorneySelectors'
import { normalizeFinanceType } from '../core/transactions/financeType'
import { useWorkspace } from '../context/WorkspaceContext'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import { getAttorneyWorkflowOperationsForTransaction } from '../services/attorneyWorkflow/attorneyWorkflowLaneService'
import {
  addTransactionDiscussionComment,
  archiveTransactionLifecycle,
  cancelTransactionLifecycle,
  archiveTransactionDocument,
  inviteStakeholder,
  fetchTransactionCoreById,
  fetchTransactionById,
  getCompletionBlockers,
  getFinalReportData,
  getOrCreateTransactionOnboarding,
  getRegistrationBlockers,
  markTransactionCompleted,
  markTransactionRegistered,
  removeStakeholder,
  undoTransactionRegistration,
  unarchiveTransactionLifecycle,
  updateTransactionAccessControl,
  uploadDocument,
} from '../lib/api'
import { canAccessAttorneyMatter } from '../lib/attorneyPermissions'
import { MAIN_STAGE_LABELS, getMainStageFromDetailedStage } from '../lib/stages'
import { isSupabaseConfigured } from '../lib/supabaseClient'

const ATTORNEY_WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'parties', label: 'Parties' },
  { id: 'documents', label: 'Documents' },
  { id: 'financials', label: 'Financials' },
  { id: 'activity', label: 'Activity' },
]

const ATTORNEY_DOCUMENT_CATEGORIES = [
  'Instruction / OTP Documents',
  'Buyer FICA / Compliance',
  'Seller FICA / Compliance',
  'Drafting Documents',
  'Signing Documents',
  'Guarantees',
  'Clearance Documents',
  'Lodgement Documents',
  'Registration / Close-Out Documents',
  'Internal Working Documents',
]

const ATTORNEY_DOCUMENT_GROUPS = [
  {
    key: 'all_documents',
    label: 'All Documents',
    description: 'All uploaded and requested documents across this matter.',
    categories: ATTORNEY_DOCUMENT_CATEGORIES,
  },
  {
    key: 'buyer_documents',
    label: 'Buyer Documents',
    description: 'Buyer FICA, finance, onboarding, and signature-ready files.',
    categories: ['Buyer FICA / Compliance'],
  },
  {
    key: 'seller_documents',
    label: 'Seller Documents',
    description: 'Seller FICA, mandate, existing bond, and seller signature files.',
    categories: ['Seller FICA / Compliance'],
  },
  {
    key: 'transfer_documents',
    label: 'Transfer Documents',
    description: 'Instruction, transfer drafting, signing, lodgement, and registration files.',
    categories: ['Instruction / OTP Documents', 'Drafting Documents', 'Signing Documents', 'Lodgement Documents'],
  },
  {
    key: 'bond_documents',
    label: 'Bond Documents',
    description: 'Guarantee, finance approval, and clearance-related files.',
    categories: ['Guarantees', 'Clearance Documents'],
  },
  {
    key: 'cancellation_documents',
    label: 'Cancellation Documents',
    description: 'Existing bond cancellation figures, cancellation packs, and bank clearances.',
    categories: ['Clearance Documents'],
  },
  {
    key: 'generated_documents',
    label: 'Generated Documents',
    description: 'Generated transfer, bond, cancellation, and reporting documents.',
    categories: ['Internal Working Documents'],
  },
  {
    key: 'signed_documents',
    label: 'Signed Documents',
    description: 'Executed documents and registration close-out files.',
    categories: ['Registration / Close-Out Documents'],
  },
]

const DOCUMENT_VISIBILITY_OPTIONS = [
  { key: 'shared', label: 'Shared' },
  { key: 'internal', label: 'Internal Only' },
]

const STAKEHOLDER_ROLE_OPTIONS = [
  { key: 'developer', label: 'Developer' },
  { key: 'agent', label: 'Agent' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'seller', label: 'Seller' },
  { key: 'attorney', label: 'Attorney' },
  { key: 'bond_originator', label: 'Bond Originator' },
]

const SERVICE_PROVIDER_ROLE_OPTIONS = STAKEHOLDER_ROLE_OPTIONS.filter((option) =>
  ['developer', 'agent', 'attorney', 'bond_originator'].includes(option.key),
)

const ATTORNEY_LEGAL_ROLE_OPTIONS = [
  { key: 'transfer', label: 'Transfer Attorney' },
  { key: 'bond', label: 'Bond Attorney' },
  { key: 'cancellation', label: 'Cancellation Attorney' },
]

const TRANSACTION_ACCESS_LEVEL_OPTIONS = [
  { key: 'private', label: 'Private' },
  { key: 'shared', label: 'Shared' },
  { key: 'restricted', label: 'Restricted' },
]

const DISCUSSION_TYPES = [
  { key: 'operational', label: 'Operational' },
  { key: 'blocker', label: 'Blocker' },
  { key: 'document', label: 'Document' },
  { key: 'decision', label: 'Decision' },
  { key: 'legal', label: 'Legal' },
]
const DISCUSSION_VISIBILITY_OPTIONS = [
  { key: 'shared', label: 'Shared Update' },
  { key: 'internal', label: 'Internal Note' },
  { key: 'client_visible', label: 'Client Visible' },
]

const EMPTY_ARRAY = []
const LIFECYCLE_STATES = ['active', 'registered', 'completed', 'archived', 'cancelled']

function normalizeTransactionKind(transaction) {
  const normalized = String(transaction?.transaction_type || '')
    .trim()
    .toLowerCase()
  if (['development', 'developer_sale'].includes(normalized)) return 'development'
  if (['private', 'private_property'].includes(normalized)) return 'private'
  return transaction?.development_id || transaction?.unit_id ? 'development' : 'private'
}

function normalizeLifecycleState(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return LIFECYCLE_STATES.includes(normalized) ? normalized : 'active'
}

function getLifecycleStateLabel(value) {
  const normalized = normalizeLifecycleState(value)
  if (normalized === 'registered') return 'Registered'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'archived') return 'Archived'
  if (normalized === 'cancelled') return 'Cancelled'
  return 'Active'
}

function getLifecycleStateClasses(value) {
  const normalized = normalizeLifecycleState(value)
  if (normalized === 'registered') return 'border-info/30 bg-infoSoft text-info'
  if (normalized === 'completed') return 'border-success/30 bg-successSoft text-success'
  if (normalized === 'archived') return 'border-borderDefault bg-mutedBg text-textBody'
  if (normalized === 'cancelled') return 'border-danger/30 bg-dangerSoft text-danger'
  return 'border-borderDefault bg-surfaceAlt text-textMuted'
}

function toInputDate(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildAttorneyFinalReportHtml(report) {
  const timelineRows = (report?.timeline || [])
    .slice(0, 60)
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
          <td>${escapeHtml(item.type || 'Update')}</td>
          <td>${escapeHtml(typeof item.payload === 'object' ? JSON.stringify(item.payload) : String(item.payload || ''))}</td>
        </tr>
      `,
    )
    .join('')

  const documentRows = (report?.documents || [])
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name || 'Untitled')}</td>
          <td>${escapeHtml(item.category || 'Uncategorized')}</td>
          <td>${escapeHtml(toTitle(item.visibility || 'internal'))}</td>
          <td>${escapeHtml(item.uploadedByRole || 'Unknown')}</td>
          <td>${escapeHtml(formatDateTime(item.createdAt))}</td>
        </tr>
      `,
    )
    .join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Bridge Final Transaction Report</title>
  <style>
    body { margin: 0; padding: 24px; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; background: #fff; }
    h1, h2, h3 { margin: 0; }
    .meta { margin-top: 8px; color: #475569; font-size: 12px; }
    .section { margin-top: 18px; border: 1px solid #d7e0ea; border-radius: 8px; padding: 14px; page-break-inside: avoid; }
    .section h2 { font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; color: #334155; margin-bottom: 10px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
    .kv strong { display: block; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; margin-bottom: 3px; }
    .kv span { font-size: 13px; color: #111827; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
    th, td { text-align: left; border-bottom: 1px solid #e5e7eb; padding: 7px 4px; vertical-align: top; word-break: break-word; }
    th { color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    @media print {
      body { padding: 14px; }
      .section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>Bridge Final Transaction Report</h1>
  <p class="meta">Generated ${escapeHtml(formatDateTime(report.generatedAt))}</p>
  <p class="meta">Reference ${escapeHtml(report.transaction?.reference || '-')} • Lifecycle ${escapeHtml(toTitle(report.lifecycleState || 'active'))}</p>

  <section class="section">
    <h2>Transaction Summary</h2>
    <div class="grid">
      <div class="kv"><strong>Current Stage</strong><span>${escapeHtml(report.transaction?.stage || '-')}</span></div>
      <div class="kv"><strong>Main Stage</strong><span>${escapeHtml(report.transaction?.currentMainStage || '-')}</span></div>
      <div class="kv"><strong>Next Action</strong><span>${escapeHtml(report.transaction?.nextAction || 'Not set')}</span></div>
      <div class="kv"><strong>Risk Status</strong><span>${escapeHtml(report.transaction?.riskStatus || 'On track')}</span></div>
      <div class="kv"><strong>Registration Date</strong><span>${escapeHtml(formatDate(report.registration?.registrationDate))}</span></div>
      <div class="kv"><strong>Title Deed</strong><span>${escapeHtml(report.registration?.titleDeedNumber || 'Not captured')}</span></div>
    </div>
  </section>

  <section class="section">
    <h2>Stakeholders</h2>
    <div class="grid">
      <div class="kv"><strong>Buyer</strong><span>${escapeHtml(report.stakeholders?.buyer?.name || 'Not assigned')}</span></div>
      <div class="kv"><strong>Seller</strong><span>${escapeHtml(report.stakeholders?.seller?.name || 'Not assigned')}</span></div>
      <div class="kv"><strong>Attorney</strong><span>${escapeHtml(report.stakeholders?.attorney || 'Not assigned')}</span></div>
      <div class="kv"><strong>Agent</strong><span>${escapeHtml(report.stakeholders?.agent || 'Not assigned')}</span></div>
    </div>
  </section>

  <section class="section">
    <h2>Documents</h2>
    <table>
      <thead>
        <tr><th>Document</th><th>Category</th><th>Visibility</th><th>Uploaded By</th><th>Uploaded</th></tr>
      </thead>
      <tbody>${documentRows || '<tr><td colspan="5">No documents recorded.</td></tr>'}</tbody>
    </table>
  </section>

  <section class="section">
    <h2>Timeline</h2>
    <table>
      <thead>
        <tr><th>Timestamp</th><th>Event</th><th>Detail</th></tr>
      </thead>
      <tbody>${timelineRows || '<tr><td colspan="3">No timeline events recorded.</td></tr>'}</tbody>
    </table>
  </section>
</body>
</html>`
}

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function formatDate(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatShortDayMonth(value) {
  const date = new Date(value || 0)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
  })
}

function normalizeRichTextToPlainText(value) {
  const input = String(value || '').trim()
  if (!input) {
    return ''
  }

  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function getCommentRoleTone(role) {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized === 'developer') {
    return {
      badge: 'border border-info/30 bg-infoSoft text-info',
      card: 'border-[#d9e7f5] bg-[#f8fbff]',
    }
  }
  if (normalized === 'attorney' || normalized === 'conveyancer') {
    return {
      badge: 'border border-primary/30 bg-primarySoft text-primary',
      card: 'border-[#d9e7f5] bg-white',
    }
  }
  if (normalized === 'agent') {
    return {
      badge: 'border border-warning/30 bg-warningSoft text-warning',
      card: 'border-[#efe3cf] bg-white',
    }
  }
  if (normalized === 'bond_originator' || normalized === 'bond') {
    return {
      badge: 'border border-indigo-200 bg-indigo-50 text-indigo-700',
      card: 'border-[#e2e7f7] bg-white',
    }
  }
  if (normalized === 'client' || normalized === 'buyer' || normalized === 'seller') {
    return {
      badge: 'border border-success/30 bg-successSoft text-success',
      card: 'border-[#d8eadf] bg-white',
    }
  }
  return {
    badge: 'border border-borderDefault bg-mutedBg text-textMuted',
    card: 'border-[#e1e9f2] bg-white',
  }
}

function buildPropertyAddress(transaction) {
  return [
    transaction?.property_address_line_1,
    transaction?.property_address_line_2,
    transaction?.suburb,
    transaction?.city,
    transaction?.province,
    transaction?.postal_code,
  ]
    .filter(Boolean)
    .join(', ')
}

function getAttorneyDocumentGroupKey(category) {
  const normalizedCategory = ATTORNEY_DOCUMENT_CATEGORIES.includes(category) ? category : 'Internal Working Documents'
  const match = ATTORNEY_DOCUMENT_GROUPS.find((group) => group.categories.includes(normalizedCategory))
  return match?.key || 'generated_documents'
}

function toTitle(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function isServiceProviderRole(roleType) {
  return ['developer', 'agent', 'attorney', 'bond_originator'].includes(String(roleType || '').trim().toLowerCase())
}

function buildInviteParticipantName(form = {}) {
  const baseName = String(form.participantName || '').trim()
  if (String(form.roleType || '') !== 'agent') {
    return baseName
  }

  const agency = String(form.agentAgencyName || '').trim()
  const phone = String(form.agentPhone || '').trim()
  const extras = [agency, phone].filter(Boolean)

  if (!extras.length) {
    return baseName
  }

  if (baseName) {
    return `${baseName} (${extras.join(' • ')})`
  }

  return extras.join(' • ')
}

function formatCurrencyValue(value, fallback = 'Not captured') {
  const amount = Number(value || 0)
  return amount ? currency.format(amount) : fallback
}

function daysBetween(startValue, endValue = Date.now()) {
  const start = new Date(startValue || 0).getTime()
  const end = new Date(endValue || Date.now()).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) return 'Not set'
  return `${Math.max(0, Math.ceil((end - start) / 86_400_000))} days`
}

const WORKFLOW_STATUS_META = {
  completed: { label: 'Completed', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  in_progress: { label: 'In Progress', dot: 'bg-blue-600', text: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200' },
  waiting: { label: 'Waiting', dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  blocked: { label: 'Blocked', dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  not_started: { label: 'Not Started', dot: 'bg-slate-300', text: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
}

const LANE_ACCENTS = {
  transfer: {
    ring: 'border-l-blue-600',
    icon: 'bg-blue-50 text-blue-700 ring-blue-100',
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    fill: 'bg-blue-600',
  },
  bond: {
    ring: 'border-l-violet-600',
    icon: 'bg-violet-50 text-violet-700 ring-violet-100',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    fill: 'bg-violet-600',
  },
  cancellation: {
    ring: 'border-l-orange-500',
    icon: 'bg-orange-50 text-orange-700 ring-orange-100',
    badge: 'border-orange-200 bg-orange-50 text-orange-700',
    fill: 'bg-orange-500',
  },
}

const WORKFLOW_STEP_LABEL_OVERRIDES = {
  instruction_received: 'Instruction Received',
  fica_received: 'FICA Received',
  transfer_documents_prepared: 'Transfer Docs Prepared',
  buyer_signed: 'Buyer Signed Docs',
  seller_signed: 'Seller Signed Docs',
  guarantees_received: 'Guarantees Received',
  lodgement_submitted: 'Lodgement Submitted',
  registration_confirmed: 'Registration Confirmed',
  bond_instruction_received: 'Bond Instruction Received',
  buyer_fica_received: 'Buyer FICA Received',
  bond_documents_prepared: 'Bond Docs Prepared',
  buyer_signed_bond_docs: 'Buyer Signed Bond Docs',
  guarantees_issued: 'Guarantees Issued',
  bond_lodged: 'Bond Lodged',
  bond_registered: 'Bond Registered',
  cancellation_instruction_received: 'Cancellation Instruction',
  settlement_figures_requested: 'Settlement Figures Requested',
  settlement_figures_received: 'Settlement Figures Received',
  guarantees_provided: 'Guarantees Provided',
  cancellation_docs_prepared: 'Cancellation Docs Prepared',
  cancellation_lodged: 'Cancellation Lodged',
  bond_cancelled: 'Bond Cancelled',
}

function normalizeWorkspaceStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'complete') return 'completed'
  if (normalized === 'pending' || normalized === 'under_review' || normalized === 'requested') return 'waiting'
  return WORKFLOW_STATUS_META[normalized] ? normalized : 'not_started'
}

function getWorkflowStepLabel(step = {}) {
  return WORKFLOW_STEP_LABEL_OVERRIDES[step.stepKey] || WORKFLOW_STEP_LABEL_OVERRIDES[step.step_key] || step.stepLabel || step.step_label || toTitle(step.stepKey || step.step_key)
}

function getWorkflowLaneTitle(lane = {}) {
  const laneKey = String(lane?.laneKey || lane?.processType || '').toLowerCase()
  if (laneKey === 'bond') return 'Bond Workflow'
  if (laneKey === 'cancellation') return 'Cancellation Workflow'
  return 'Transfer Workflow'
}

function getAssignedFirmLabel(lane = {}) {
  return (
    lane?.assignment?.firmName ||
    lane?.assignment?.attorneyFirmName ||
    lane?.assignment?.firm_name ||
    lane?.assignment?.attorney_firm_name ||
    lane?.assignment?.organisationName ||
    'Assigned firm pending'
  )
}

function getDocumentStatus(document = {}) {
  const raw = String(document.review_status || document.status || '').trim().toLowerCase()
  if (raw === 'under_review') return 'Uploaded'
  if (raw === 'completed') return 'Approved'
  return toTitle(raw || 'Uploaded')
}

function MatterWorkspaceTabs({ tabs = [], activeTab = '', onChange }) {
  const iconByTab = {
    overview: Workflow,
    parties: UsersRound,
    documents: FileText,
    financials: CircleDollarSign,
    activity: Activity,
  }

  return (
    <nav className="no-print -mx-1 overflow-x-auto border-b border-borderDefault px-1" aria-label="Matter workspace tabs">
      <div className="flex min-w-max gap-5">
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          const Icon = iconByTab[tab.id] || FileText
          return (
            <button
              key={tab.id}
              type="button"
              className={`inline-flex min-h-[46px] items-center gap-2 border-b-2 px-1 text-sm font-semibold transition ${
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-textMuted hover:border-borderDefault hover:text-textStrong'
              }`}
              onClick={() => onChange?.(tab.id)}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function MatterCompactHeader({ title, statusLabel, statusClassName, propertyLabel, subtitle, stats = [], onAddNote, onAction }) {
  return (
    <section className="rounded-[18px] border border-borderDefault bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)] md:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-xl font-bold text-textStrong md:text-2xl">{title}</h1>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusClassName}`}>
              {statusLabel}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-textMuted">
            <strong className="text-textStrong">{propertyLabel}</strong>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onAction}>
            <MoreHorizontal size={14} />
            Actions
          </Button>
          <Button type="button" size="sm" onClick={onAddNote}>
            <MessageSquarePlus size={14} />
            Add Note
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5 xl:grid-cols-10">
        {stats.map((item) => (
          <article key={item.label} className="min-w-0 border-l border-borderSoft px-3 first:border-l-0 first:pl-0">
            <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{item.label}</span>
            <strong className="mt-1 block truncate text-sm font-semibold text-textStrong">{item.value || 'Not set'}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}

function WorkflowLaneCard({ lane, expanded, onToggle, onOpenControls }) {
  const laneKey = String(lane?.laneKey || 'transfer').toLowerCase()
  const accent = LANE_ACCENTS[laneKey] || LANE_ACCENTS.transfer
  const statusKey = normalizeWorkspaceStatus(lane?.laneStatus || lane?.summary?.status)
  const statusMeta = WORKFLOW_STATUS_META[statusKey] || WORKFLOW_STATUS_META.not_started
  const progress = Number(lane?.summary?.completionPercent || 0)
  const canManage = Boolean(lane?.permissions?.canUpdateStage)
  const steps = Array.isArray(lane?.steps) ? lane.steps : []

  return (
    <article className={`overflow-hidden rounded-[16px] border border-borderDefault border-l-4 bg-white shadow-[0_10px_22px_rgba(15,23,42,0.04)] ${accent.ring}`}>
      <div className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3">
            <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1 ${accent.icon}`}>
              <Workflow size={18} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-textStrong">{getWorkflowLaneTitle(lane)}</h3>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold ${accent.badge}`}>
                  {getAssignedFirmLabel(lane)}
                </span>
              </div>
              <p className="mt-1 text-sm text-textMuted">Assigned firm shown for context. Phase 1 allows matter teams to update all active lanes.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusMeta.border} ${statusMeta.bg} ${statusMeta.text}`}>
              <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
              {statusMeta.label}
            </span>
            <span className="text-sm font-semibold text-textStrong">{progress}%</span>
            <Button type="button" variant="secondary" size="sm" onClick={onToggle}>
              View Details
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>

        <div className="mt-4">
          <div className="h-1.5 rounded-full bg-slate-100">
            <div className={`h-1.5 rounded-full ${accent.fill}`} style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
            {steps.map((step) => {
              const stepStatusKey = normalizeWorkspaceStatus(step.status)
              const stepStatus = WORKFLOW_STATUS_META[stepStatusKey] || WORKFLOW_STATUS_META.not_started
              return (
                <div key={step.id || step.stepKey} className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${stepStatus.dot}`} />
                    <span className="truncate text-xs font-semibold text-textStrong">{getWorkflowStepLabel(step)}</span>
                  </div>
                  <p className={`mt-1 truncate pl-4 text-[0.7rem] font-medium ${stepStatus.text}`}>
                    {step.completedAt ? formatShortDayMonth(step.completedAt) : stepStatus.label}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-borderSoft bg-surfaceAlt p-4">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {steps.map((step) => {
              const stepStatusKey = normalizeWorkspaceStatus(step.status)
              const stepStatus = WORKFLOW_STATUS_META[stepStatusKey] || WORKFLOW_STATUS_META.not_started
              return (
                <article key={`detail-${step.id || step.stepKey}`} className="rounded-[12px] border border-borderSoft bg-white px-3 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <strong className="text-sm text-textStrong">{getWorkflowStepLabel(step)}</strong>
                    <span className={`rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${stepStatus.bg} ${stepStatus.text}`}>
                      {stepStatus.label}
                    </span>
                  </div>
                  {step.comment ? <p className="mt-2 text-xs leading-5 text-textMuted">{step.comment}</p> : null}
                  <Button type="button" variant="ghost" size="sm" disabled={!canManage} onClick={onOpenControls} className="mt-3">
                    Manage Step
                  </Button>
                </article>
              )
            })}
          </div>
        </div>
      ) : null}
    </article>
  )
}

function OverviewSidePanel({ title, children }) {
  return (
    <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
      <h3 className="text-sm font-semibold text-textStrong">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function AttorneyTransactionDetail() {
  const { transactionId } = useParams()
  const { profile, role: workspaceRole } = useWorkspace()
  const attorneyPermissionState = useAttorneyPermissions()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [matterAccessChecked, setMatterAccessChecked] = useState(workspaceRole !== 'attorney')
  const [matterAccessAllowed, setMatterAccessAllowed] = useState(workspaceRole !== 'attorney')
  const [saving, setSaving] = useState(false)
  const [workspaceMenu, setWorkspaceMenu] = useState('overview')
  const [discussionBody, setDiscussionBody] = useState('')
  const [discussionType, setDiscussionType] = useState('operational')
  const [discussionVisibility, setDiscussionVisibility] = useState('shared')
  const [uploadDraft, setUploadDraft] = useState({
    category: ATTORNEY_DOCUMENT_CATEGORIES[0],
    visibility: 'shared',
    file: null,
  })
  const [uploadInputVersion, setUploadInputVersion] = useState(0)
  const [activeDocumentGroup, setActiveDocumentGroup] = useState(ATTORNEY_DOCUMENT_GROUPS[0]?.key || 'sales_documents')
  const [stakeholderInviteForm, setStakeholderInviteForm] = useState({
    roleType: 'attorney',
    legalRole: 'transfer',
    participantName: '',
    agentPhone: '',
    agentAgencyName: '',
    email: '',
    expiresDays: '14',
  })
  const [stakeholderMessage, setStakeholderMessage] = useState('')
  const [inviteLinkResult, setInviteLinkResult] = useState('')
  const [accessControlForm, setAccessControlForm] = useState({
    ownerUserId: '',
    accessLevel: 'shared',
  })
  const [removeDialog, setRemoveDialog] = useState({
    open: false,
    stakeholderId: null,
    title: '',
    description: '',
  })
  const [registrationModalOpen, setRegistrationModalOpen] = useState(false)
  const [registrationDraft, setRegistrationDraft] = useState({
    registrationDate: '',
    titleDeedNumber: '',
    registrationConfirmationDocumentId: '',
  })
  const [registrationValidation, setRegistrationValidation] = useState({
    loading: false,
    canMarkRegistered: false,
    blockers: [],
  })
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    description: '',
    action: '',
  })
  const [reasonDialog, setReasonDialog] = useState({
    open: false,
    action: '',
    title: '',
    subtitle: '',
    confirmLabel: 'Save',
    reasonRequired: true,
  })
  const [reasonDraft, setReasonDraft] = useState('')
  const [onboardingModalOpen, setOnboardingModalOpen] = useState(false)
  const [onboardingActionMessage, setOnboardingActionMessage] = useState('')
  const [onboardingActionBusy, setOnboardingActionBusy] = useState(false)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [detailPanelKey, setDetailPanelKey] = useState('matter')
  const [hydratingDetail, setHydratingDetail] = useState(false)
  const [workflowOperations, setWorkflowOperations] = useState(null)
  const [workflowLoading, setWorkflowLoading] = useState(false)
  const [workflowError, setWorkflowError] = useState('')
  const [expandedWorkflowLane, setExpandedWorkflowLane] = useState('')
  const [showWorkflowControls, setShowWorkflowControls] = useState(false)
  const [activityFilter, setActivityFilter] = useState('all')

  const loadData = useCallback(async ({ background = false } = {}) => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    const startedAt = Date.now()
    let hasCoreData = false
    try {
      if (!background) {
        setLoading(true)
      }
      setError('')
      const coreDetail = await fetchTransactionCoreById(transactionId)
      if (coreDetail) {
        hasCoreData = true
        setData((previous) => {
          if (!previous) {
            return coreDetail
          }
          return {
            ...previous,
            ...coreDetail,
            transaction: coreDetail.transaction || previous.transaction,
            unit: coreDetail.unit || previous.unit,
            development: coreDetail.development || previous.development,
            buyer: coreDetail.buyer || previous.buyer,
          }
        })
        console.log('[perf][transaction-workspace] core data loaded', {
          transactionId,
          durationMs: Date.now() - startedAt,
        })
      }
      setLoading(false)
    } catch (coreError) {
      if (!background) {
        setLoading(true)
      }
      if (!hasCoreData) {
        setError(coreError.message || 'Unable to load transaction.')
      }
    }

    try {
      setHydratingDetail(true)
      const detail = await fetchTransactionById(transactionId)
      setData(detail)
      setError('')
      console.log('[perf][transaction-workspace] full data loaded', {
        transactionId,
        durationMs: Date.now() - startedAt,
      })
    } catch (loadError) {
      if (!hasCoreData) {
        setError(loadError.message || 'Unable to load transaction.')
      }
    } finally {
      setHydratingDetail(false)
      setLoading(false)
    }
  }, [transactionId])

  useEffect(() => {
    if (workspaceRole === 'attorney') {
      if (attorneyPermissionState.loading) {
        return
      }
      if (!matterAccessAllowed) {
        setLoading(false)
        return
      }
    }
    void loadData({ background: false })
  }, [attorneyPermissionState.loading, loadData, matterAccessAllowed, workspaceRole])

  useEffect(() => {
    let active = true

    async function checkMatterAccess() {
      if (workspaceRole !== 'attorney') {
        if (!active) return
        setMatterAccessAllowed(true)
        setMatterAccessChecked(true)
        return
      }

      if (attorneyPermissionState.loading || !transactionId) {
        return
      }

      if (!attorneyPermissionState.membership?.isActive) {
        if (!active) return
        setMatterAccessAllowed(false)
        setMatterAccessChecked(true)
        return
      }

      try {
        const allowed = await canAccessAttorneyMatter(transactionId, attorneyPermissionState.firmId || null)
        if (!active) return
        setMatterAccessAllowed(Boolean(allowed))
      } catch {
        if (!active) return
        setMatterAccessAllowed(false)
      } finally {
        if (active) setMatterAccessChecked(true)
      }
    }

    setMatterAccessChecked(workspaceRole !== 'attorney')
    void checkMatterAccess()

    return () => {
      active = false
    }
  }, [attorneyPermissionState.firmId, attorneyPermissionState.loading, attorneyPermissionState.membership?.isActive, transactionId, workspaceRole])

  const transaction = data?.transaction || null
  const buyer = data?.buyer || null
  const development = data?.development || null
  const unit = data?.unit || null
  const documents = data?.documents ?? EMPTY_ARRAY
  const requiredDocumentChecklist = data?.requiredDocumentChecklist || []
  const transactionDiscussion = data?.transactionDiscussion ?? EMPTY_ARRAY
  const canViewInternalDiscussion =
    workspaceRole !== 'attorney' || attorneyPermissionState.hasPermission('can_view_internal_comments')
  const canPostSharedDiscussion =
    workspaceRole !== 'attorney' || attorneyPermissionState.hasPermission('can_comment_shared')
  const canPostInternalDiscussion =
    workspaceRole !== 'attorney' || attorneyPermissionState.hasPermission('can_comment_internal')
  const canPublishClientVisibleDiscussion =
    workspaceRole !== 'attorney' || attorneyPermissionState.hasPermission('can_publish_client_visible_updates')
  const visibleTransactionDiscussion = useMemo(
    () =>
      transactionDiscussion.filter((comment) => {
        const visibility = String(comment?.visibility || 'shared').trim().toLowerCase()
        if (visibility !== 'internal') return true
        return canViewInternalDiscussion
      }),
    [canViewInternalDiscussion, transactionDiscussion],
  )
  const transactionEvents = data?.transactionEvents ?? EMPTY_ARRAY
  const transactionParticipants = data?.transactionParticipants ?? EMPTY_ARRAY
  const activeWorkspaceMenu = ATTORNEY_WORKSPACE_TABS.some((tab) => tab.id === workspaceMenu) ? workspaceMenu : 'overview'

  useEffect(() => {
    let active = true

    async function loadWorkflowOperations() {
      if (!transaction?.id) {
        setWorkflowOperations(null)
        return
      }

      try {
        setWorkflowLoading(true)
        setWorkflowError('')
        const operations = await getAttorneyWorkflowOperationsForTransaction(transaction.id)
        if (!active) return
        setWorkflowOperations(operations)
      } catch (workflowLoadError) {
        if (!active) return
        setWorkflowOperations(null)
        setWorkflowError(workflowLoadError?.message || 'Unable to load attorney workflow lanes.')
      } finally {
        if (active) setWorkflowLoading(false)
      }
    }

    void loadWorkflowOperations()

    return () => {
      active = false
    }
  }, [transaction?.id])

  const mainStage = useMemo(
    () => data?.mainStage || getMainStageFromDetailedStage(transaction?.stage || 'Available'),
    [data?.mainStage, transaction?.stage],
  )
  const transactionKind = normalizeTransactionKind(transaction)
  const isPrivateMatter = transactionKind === 'private'
  const mainStageLabel = MAIN_STAGE_LABELS[mainStage] || toTitle(transaction?.stage || 'Available')
  const matterTypeLabel = isPrivateMatter ? 'Private Matter' : 'Development Matter'
  const financeTypeLabel = toTitle(normalizeFinanceType(transaction?.finance_type || 'cash'))
  const purchasePriceValue = Number(transaction?.purchase_price || transaction?.sales_price || unit?.price || 0)
  const propertyAddress = buildPropertyAddress(transaction)
  const matterHeadline = !isPrivateMatter
    ? `${development?.name || 'Development'}${unit?.unit_number ? ` • Unit ${unit.unit_number}` : ''}`
    : transaction?.property_description || transaction?.property_address_line_1 || 'Private Property Transaction'
  const matterReference = transaction?.transaction_reference || `TRX-${String(transaction?.id || '').slice(0, 8).toUpperCase()}`
  const transferStageKey = getAttorneyTransferStage({ transaction, stage: transaction?.stage, unit, development })
  const transferStageLabel = stageLabelFromAttorneyKey(transferStageKey)
  const lifecycleState = normalizeLifecycleState(
    transaction?.lifecycle_state || (transferStageKey === 'registered' ? 'registered' : 'active'),
  )
  const lifecycleLabel = getLifecycleStateLabel(lifecycleState)
  const operationalStateLabel = transaction?.operational_state ? toTitle(transaction.operational_state) : lifecycleLabel
  const onboardingLifecycleStatus = String(transaction?.onboarding_status || '').trim().toLowerCase()
  const onboardingRecordStatus = String(data?.onboarding?.status || '').trim().toLowerCase()
  const onboardingCompleted =
    onboardingLifecycleStatus === 'client_onboarding_complete' ||
    Boolean(transaction?.onboarding_completed_at) ||
    ['submitted', 'reviewed', 'approved'].includes(onboardingRecordStatus)
  const registrationDocumentOptions = useMemo(
    () =>
      documents.filter((document) => {
        const status = String(document?.status || '').trim().toLowerCase()
        return status !== 'archived'
      }),
    [documents],
  )
  const documentReadinessText = requiredDocumentChecklist.length
    ? `${documents.length}/${requiredDocumentChecklist.length} uploaded`
    : documents.length
      ? `${documents.length} files uploaded`
      : 'No requirements configured'
  const workspaceMenuTabs = ATTORNEY_WORKSPACE_TABS.map((tab) => {
    if (tab.id === 'parties') {
      return { ...tab, meta: `${transactionParticipants.length} parties` }
    }
    if (tab.id === 'documents') {
      return { ...tab, meta: `${documents.length} files` }
    }
    if (tab.id === 'financials') {
      return { ...tab, meta: currency.format(purchasePriceValue || 0) }
    }
    if (tab.id === 'activity') {
      return { ...tab, meta: `${visibleTransactionDiscussion.length + transactionEvents.length} updates` }
    }
    return { ...tab, meta: transferStageLabel }
  })

  const groupedDocuments = useMemo(() => {
    const groups = ATTORNEY_DOCUMENT_GROUPS.reduce((accumulator, group) => {
      accumulator[group.key] = []
      return accumulator
    }, {})

    for (const document of documents) {
      const category = ATTORNEY_DOCUMENT_CATEGORIES.includes(document?.category) ? document.category : 'Internal Working Documents'
      const groupKey = getAttorneyDocumentGroupKey(category)
      const normalizedDocument = { ...document, normalizedCategory: category }
      groups.all_documents.push(normalizedDocument)
      groups[groupKey].push(normalizedDocument)
    }

    return groups
  }, [documents])
  const attorneyDocumentSections = useMemo(
    () =>
      ATTORNEY_DOCUMENT_GROUPS.map((group) => ({
        ...group,
        items: groupedDocuments[group.key] || [],
      })),
    [groupedDocuments],
  )
  const activeAttorneyDocumentSection = useMemo(
    () => attorneyDocumentSections.find((group) => group.key === activeDocumentGroup) || attorneyDocumentSections[0] || null,
    [activeDocumentGroup, attorneyDocumentSections],
  )
  const sharedAttorneyDocumentCount = useMemo(
    () => documents.filter((document) => String(document.visibility_scope || 'shared').toLowerCase() === 'shared').length,
    [documents],
  )
  const internalAttorneyDocumentCount = Math.max(0, documents.length - sharedAttorneyDocumentCount)
  const uploadedByClientCount = useMemo(
    () => documents.filter((document) => String(document.uploaded_by_role || '').toLowerCase() === 'client').length,
    [documents],
  )

  useEffect(() => {
    if (!attorneyDocumentSections.length) return
    if (!attorneyDocumentSections.some((group) => group.key === activeDocumentGroup)) {
      setActiveDocumentGroup(attorneyDocumentSections[0].key)
    }
  }, [activeDocumentGroup, attorneyDocumentSections])

  const activeStakeholders = useMemo(
    () => transactionParticipants.filter((item) => item?.stakeholderStatus !== 'removed'),
    [transactionParticipants],
  )
  const serviceProviderStakeholders = useMemo(
    () =>
      activeStakeholders
        .filter((item) => isServiceProviderRole(item?.roleType))
        .sort((left, right) => {
          const leftRole = String(left?.roleLabel || left?.roleType || '')
          const rightRole = String(right?.roleLabel || right?.roleType || '')
          const roleDiff = leftRole.localeCompare(rightRole, 'en-ZA', { sensitivity: 'base' })
          if (roleDiff !== 0) return roleDiff
          const leftName = String(left?.participantName || left?.participantEmail || '')
          const rightName = String(right?.participantName || right?.participantEmail || '')
          return leftName.localeCompare(rightName, 'en-ZA', { sensitivity: 'base' })
        }),
    [activeStakeholders],
  )
  const transferAttorney = useMemo(
    () => activeStakeholders.find((item) => item?.roleType === 'attorney' && item?.legalRole === 'transfer') || null,
    [activeStakeholders],
  )
  const bondAttorney = useMemo(
    () => activeStakeholders.find((item) => item?.roleType === 'attorney' && item?.legalRole === 'bond') || null,
    [activeStakeholders],
  )
  const cancellationAttorney = useMemo(
    () => activeStakeholders.find((item) => item?.roleType === 'attorney' && item?.legalRole === 'cancellation') || null,
    [activeStakeholders],
  )
  const legalRoleAssignmentNote = useMemo(() => {
    if (transferAttorney && bondAttorney) {
      const transferIdentity = String(transferAttorney.participantEmail || transferAttorney.participantName || '').trim().toLowerCase()
      const bondIdentity = String(bondAttorney.participantEmail || bondAttorney.participantName || '').trim().toLowerCase()
      if (transferIdentity && bondIdentity && transferIdentity !== bondIdentity) {
        return 'Transfer and bond legal roles are assigned to different attorneys.'
      }
      return 'Transfer and bond legal roles are currently handled by the same attorney.'
    }

    if (transferAttorney && !bondAttorney) {
      return 'Transfer attorney is assigned. Bond attorney is optional and can be assigned separately when required.'
    }

    return 'Assign legal roles explicitly so transfer and bond responsibilities remain clear.'
  }, [bondAttorney, transferAttorney])
  const ownerCandidateOptions = useMemo(() => {
    const map = new Map()
    for (const participant of activeStakeholders) {
      if (!participant?.userId) continue
      const labelBase = participant.participantName || participant.participantEmail || participant.roleLabel || participant.roleType || 'Stakeholder'
      const roleLabel = participant.roleLabel || toTitle(participant.roleType || '')
      map.set(participant.userId, `${labelBase} (${roleLabel})`)
    }
    if (profile?.id) {
      const fallbackLabel = profile?.fullName || profile?.email || 'Current User'
      if (!map.has(profile.id)) {
        map.set(profile.id, `${fallbackLabel} (Current user)`)
      }
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }))
  }, [activeStakeholders, profile?.email, profile?.fullName, profile?.id])

  const activityFeed = useMemo(
    () =>
      [
        ...transactionEvents.map((event) => ({
          id: `event-${event.id}`,
          title: event.title || toTitle(event.event_type || 'Update'),
          body: normalizeRichTextToPlainText(event.body) || 'Transaction event recorded.',
          createdAt: event.created_at,
          kind: 'event',
          authorName: event.actor_name || 'System',
          roleLabel: toTitle(event.source_role || 'system'),
          commentType: 'System',
          roleTone: getCommentRoleTone(event.source_role || 'system'),
        })),
        ...visibleTransactionDiscussion.map((comment) => ({
          id: `comment-${comment.id}`,
          title: `${comment.authorName || 'Participant'} • ${comment.authorRoleLabel || toTitle(comment.authorRole || 'Participant')}`,
          body: normalizeRichTextToPlainText(comment.commentBody || comment.commentText) || 'Comment added.',
          createdAt: comment.createdAt || comment.created_at,
          kind: 'comment',
          authorName: comment.authorName || 'Participant',
          roleLabel: comment.authorRoleLabel || toTitle(comment.authorRole || 'participant'),
          commentType: toTitle(comment.discussionType || comment.discussion_type || 'operational'),
          roleTone: getCommentRoleTone(comment.authorRole || 'participant'),
        })),
      ].sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()),
    [transactionEvents, visibleTransactionDiscussion],
  )
  const workflowLanes = useMemo(
    () => (Array.isArray(workflowOperations?.lanes) ? workflowOperations.lanes : EMPTY_ARRAY),
    [workflowOperations?.lanes],
  )
  const matterHeaderStats = useMemo(
    () => [
      { label: 'Buyer', value: buyer?.name || 'Buyer pending' },
      { label: 'Seller', value: transaction?.seller_name || 'Seller pending' },
      { label: 'Purchase Price', value: formatCurrencyValue(purchasePriceValue, 'Not captured') },
      { label: 'Finance Type', value: financeTypeLabel },
      { label: 'Bond Amount', value: formatCurrencyValue(transaction?.bond_amount, financeTypeLabel.toLowerCase().includes('bond') ? 'Pending' : 'N/A') },
      { label: 'Deposit', value: formatCurrencyValue(transaction?.deposit_amount, 'Not captured') },
      { label: 'Target Registration', value: formatDate(transaction?.target_registration_date || transaction?.expected_transfer_date) },
      { label: 'Days Active', value: daysBetween(transaction?.created_at) },
      { label: 'Current Stage', value: transferStageLabel },
      { label: 'Matter Status', value: operationalStateLabel },
    ],
    [
      buyer?.name,
      financeTypeLabel,
      operationalStateLabel,
      purchasePriceValue,
      transaction?.bond_amount,
      transaction?.created_at,
      transaction?.deposit_amount,
      transaction?.expected_transfer_date,
      transaction?.seller_name,
      transaction?.target_registration_date,
      transferStageLabel,
    ],
  )
  const matterSubtitle = [
    development?.name || null,
    propertyAddress || null,
  ].filter(Boolean).join(' • ')
  const overviewKeyDates = [
    { label: 'Offer accepted', value: formatDate(transaction?.offer_accepted_at || transaction?.created_at), complete: true },
    { label: 'Transfer duty paid', value: formatDate(transaction?.transfer_duty_paid_at), complete: Boolean(transaction?.transfer_duty_paid_at) },
    { label: 'Target registration', value: formatDate(transaction?.target_registration_date || transaction?.expected_transfer_date), emphasis: true },
    { label: 'Estimated registration', value: formatDate(transaction?.estimated_registration_date || transaction?.target_registration_date || transaction?.expected_transfer_date) },
  ]
  const overviewNextActions = useMemo(() => {
    const rows = []
    const blockedLane = workflowLanes.find((lane) => normalizeWorkspaceStatus(lane?.laneStatus || lane?.summary?.status) === 'blocked')
    const waitingLane = workflowLanes.find((lane) => lane?.documentSummary?.missing || lane?.documentSummary?.requested)
    if (transaction?.next_action) {
      rows.push({
        title: transaction.next_action,
        description: 'Matter-level next action',
        dueDate: transaction?.target_registration_date || transaction?.expected_transfer_date,
        workflow: 'Overview',
        action: 'View matter',
      })
    }
    if (blockedLane) {
      rows.push({
        title: `${getWorkflowLaneTitle(blockedLane)} blocked`,
        description: blockedLane.summary?.blocked?.comment || 'A workflow step needs attention.',
        dueDate: blockedLane.dueDate,
        workflow: getWorkflowLaneTitle(blockedLane),
        action: 'View workflow',
      })
    }
    if (waitingLane) {
      rows.push({
        title: 'Documents outstanding',
        description: `${waitingLane.documentSummary?.missing || waitingLane.documentSummary?.requested || 0} document item(s) need follow-up.`,
        dueDate: waitingLane.dueDate,
        workflow: getWorkflowLaneTitle(waitingLane),
        action: 'Upload Document',
      })
    }
    if (!rows.length) {
      rows.push({
        title: 'Review latest activity',
        description: 'No urgent action is currently flagged.',
        dueDate: transaction?.updated_at,
        workflow: 'Activity',
        action: 'Open Activity',
      })
    }
    return rows.slice(0, 4)
  }, [transaction?.expected_transfer_date, transaction?.next_action, transaction?.target_registration_date, transaction?.updated_at, workflowLanes])
  const assignedTeamRows = useMemo(
    () => [
      { role: 'Transfer Attorney', participant: transferAttorney, lane: 'transfer' },
      { role: 'Bond Attorney', participant: bondAttorney, lane: 'bond' },
      { role: 'Cancellation Attorney', participant: cancellationAttorney, lane: 'cancellation' },
      {
        role: 'Conveyancer / Secretary',
        participant: activeStakeholders.find((item) => /secretary|conveyancer|admin/i.test(`${item?.roleLabel || ''} ${item?.participantName || ''}`)),
        lane: 'support',
      },
    ],
    [activeStakeholders, bondAttorney, cancellationAttorney, transferAttorney],
  )
  const agents = useMemo(
    () => activeStakeholders.filter((item) => item?.roleType === 'agent'),
    [activeStakeholders],
  )
  const partySections = useMemo(
    () => [
      {
        title: 'Buyer',
        subtitle: 'Buyer details, onboarding, FICA, finance position, and buyer notes.',
        items: [
          ['Name', buyer?.name || 'Not assigned'],
          ['Email', buyer?.email || 'Not captured'],
          ['Phone', buyer?.phone || 'Not captured'],
          ['Onboarding', onboardingCompleted ? 'Completed' : 'Pending'],
          ['FICA Status', transaction?.buyer_fica_status ? toTitle(transaction.buyer_fica_status) : documentReadinessText],
          ['Finance Details', financeTypeLabel],
        ],
      },
      {
        title: 'Seller',
        subtitle: 'Seller details, onboarding, FICA, existing bond, and cancellation requirements.',
        items: [
          ['Name', transaction?.seller_name || 'Not assigned'],
          ['Email', transaction?.seller_email || 'Not captured'],
          ['Phone', transaction?.seller_phone || 'Not captured'],
          ['FICA Status', transaction?.seller_fica_status ? toTitle(transaction.seller_fica_status) : 'Pending'],
          ['Existing Bond', transaction?.seller_has_existing_bond ? 'Yes' : 'Not flagged'],
          ['Cancellation Requirement', transaction?.seller_has_existing_bond ? 'Required' : 'Not required'],
        ],
      },
      {
        title: 'Property',
        subtitle: 'Property, unit, development, price, and registration details.',
        items: [
          ['Erf / Unit', unit?.unit_number ? `Unit ${unit.unit_number}` : transaction?.erf_number || 'Not captured'],
          ['Development', development?.name || 'Standalone matter'],
          ['Address', propertyAddress || transaction?.property_description || 'Not captured'],
          ['Purchase Price', formatCurrencyValue(purchasePriceValue, 'Not captured')],
          ['Registration Date', formatDate(transaction?.registration_date || transaction?.registered_at)],
          ['Target Registration', formatDate(transaction?.target_registration_date || transaction?.expected_transfer_date)],
        ],
      },
      {
        title: 'Agents',
        subtitle: 'Agent and brokerage contacts linked to this matter.',
        items: agents.length
          ? agents.map((agent) => [agent.roleLabel || 'Agent', agent.participantName || agent.participantEmail || 'Agent'])
          : [['Agents', 'No agents linked']],
      },
      {
        title: 'Attorney Roles',
        subtitle: 'Firms and people assigned to each legal role.',
        items: [
          ['Transfer Attorney', transferAttorney?.organisationName || transferAttorney?.participantName || transferAttorney?.participantEmail || 'Not assigned'],
          ['Bond Attorney', bondAttorney?.organisationName || bondAttorney?.participantName || bondAttorney?.participantEmail || 'Not assigned'],
          ['Cancellation Attorney', cancellationAttorney?.organisationName || cancellationAttorney?.participantName || cancellationAttorney?.participantEmail || 'Not assigned'],
        ],
      },
    ],
    [
      agents,
      bondAttorney,
      buyer?.email,
      buyer?.name,
      buyer?.phone,
      cancellationAttorney,
      development?.name,
      documentReadinessText,
      financeTypeLabel,
      onboardingCompleted,
      propertyAddress,
      purchasePriceValue,
      transaction,
      transferAttorney,
      unit?.unit_number,
    ],
  )
  const financialRows = [
    ['Purchase Price', formatCurrencyValue(purchasePriceValue, 'Not captured')],
    ['Deposit', formatCurrencyValue(transaction?.deposit_amount, 'Not captured')],
    ['Bond Amount', formatCurrencyValue(transaction?.bond_amount, financeTypeLabel.toLowerCase().includes('bond') ? 'Pending' : 'N/A')],
    ['Cash Portion', formatCurrencyValue(transaction?.cash_portion, 'Not captured')],
    ['Transfer Fees', formatCurrencyValue(transaction?.transfer_fees, 'Pending')],
    ['Bond Registration Fees', formatCurrencyValue(transaction?.bond_registration_costs, 'Pending')],
    ['Cancellation Costs', formatCurrencyValue(transaction?.cancellation_costs, transaction?.seller_has_existing_bond ? 'Pending' : 'N/A')],
    ['Guarantees', formatCurrencyValue(transaction?.guarantee_amount, 'Pending')],
    ['Commission', formatCurrencyValue(transaction?.commission_amount, 'Pending')],
    ['Trust / Disbursements', formatCurrencyValue(transaction?.trust_balance, 'Placeholder')],
  ]
  const activityFilterOptions = ['all', 'transfer', 'bond', 'cancellation', 'documents', 'notes', 'internal', 'client_visible']
  const filteredActivityFeed = useMemo(
    () =>
      activityFeed.filter((entry) => {
        if (activityFilter === 'all') return true
        if (activityFilter === 'notes') return entry.kind === 'comment'
        if (activityFilter === 'documents') return /document/i.test(`${entry.commentType} ${entry.title} ${entry.body}`)
        if (activityFilter === 'internal') return /internal/i.test(`${entry.commentType} ${entry.roleLabel}`)
        if (activityFilter === 'client_visible') return /client/i.test(`${entry.commentType} ${entry.roleLabel}`)
        return new RegExp(activityFilter, 'i').test(`${entry.commentType} ${entry.title} ${entry.body}`)
      }),
    [activityFeed, activityFilter],
  )
  const onboardingRecipients = useMemo(() => {
    const buyerParticipant = activeStakeholders.find((participant) => participant?.roleType === 'buyer')
    const sellerParticipant = isPrivateMatter
      ? activeStakeholders.find((participant) => participant?.roleType === 'seller')
      : null

    const rows = [
      {
        key: 'buyer',
        roleLabel: 'Buyer',
        name: buyer?.name || buyerParticipant?.participantName || 'Buyer not assigned',
        email: buyer?.email || buyerParticipant?.participantEmail || '',
        stakeholderStatus: buyerParticipant?.stakeholderStatus || '',
      },
    ]

    if (isPrivateMatter) {
      rows.push({
        key: 'seller',
        roleLabel: 'Seller',
        name: transaction?.seller_name || sellerParticipant?.participantName || 'Seller not assigned',
        email: transaction?.seller_email || sellerParticipant?.participantEmail || '',
        stakeholderStatus: sellerParticipant?.stakeholderStatus || '',
      })
    }

    return rows.map((row) => {
      const stakeholderState = row.stakeholderStatus ? toTitle(row.stakeholderStatus) : row.email ? 'Active' : 'Missing email'
      return {
        ...row,
        stateLabel: onboardingCompleted ? 'Onboarding completed' : stakeholderState,
        canSend: Boolean(row.email) && !onboardingCompleted,
      }
    })
  }, [activeStakeholders, buyer?.email, buyer?.name, isPrivateMatter, onboardingCompleted, transaction?.seller_email, transaction?.seller_name])

  const detailPanelSections = useMemo(
    () => ({
      matter: {
        title: 'Matter Details',
        subtitle: 'Reference and transaction metadata relevant to legal execution.',
        summary: `${transferStageLabel} • ${matterReference}`,
        items: [
          { label: 'Transaction Reference', value: matterReference },
          { label: 'Development', value: development?.name || 'Standalone matter' },
          { label: 'Unit', value: unit?.unit_number ? `Unit ${unit.unit_number}` : 'Not linked' },
          { label: 'Property Address', value: propertyAddress || transaction?.property_description || 'Not set' },
          { label: 'Transaction Type', value: matterTypeLabel },
          { label: 'Finance Type', value: financeTypeLabel },
          { label: 'Current Stage', value: transferStageLabel },
          { label: 'Main Process Stage', value: mainStageLabel },
          { label: 'Expected Transfer Date', value: formatDate(transaction?.expected_transfer_date) },
          { label: 'Created', value: formatDateTime(transaction?.created_at) },
          { label: 'Last Updated', value: formatDateTime(transaction?.updated_at) },
        ],
      },
      buyer: {
        title: 'Buyer Details',
        subtitle: 'Primary purchaser identity and contact details.',
        summary: `${buyer?.name || 'Buyer not assigned'}${buyer?.email ? ` • ${buyer.email}` : ''}`,
        items: [
          { label: 'Buyer Name', value: buyer?.name || 'Not assigned' },
          { label: 'Buyer Email', value: buyer?.email || 'Not set' },
          { label: 'Buyer Phone', value: buyer?.phone || 'Not set' },
          { label: 'Purchaser Type', value: toTitle(transaction?.purchaser_type || 'individual') },
          { label: 'Onboarding Status', value: onboardingCompleted ? 'Completed' : 'Pending' },
        ],
      },
      seller: {
        title: 'Seller Details',
        subtitle: 'Seller identity and contact details for this matter.',
        summary: `${transaction?.seller_name || 'Seller not assigned'}${transaction?.seller_email ? ` • ${transaction.seller_email}` : ''}`,
        items: [
          { label: 'Seller Name', value: transaction?.seller_name || 'Not assigned' },
          { label: 'Seller Email', value: transaction?.seller_email || 'Not set' },
          { label: 'Seller Phone', value: transaction?.seller_phone || 'Not set' },
          { label: 'Matter Type', value: matterTypeLabel },
        ],
      },
    }),
    [
      buyer?.email,
      buyer?.name,
      buyer?.phone,
      financeTypeLabel,
      mainStageLabel,
      matterReference,
      matterTypeLabel,
      onboardingCompleted,
      propertyAddress,
      transaction?.created_at,
      transaction?.expected_transfer_date,
      transaction?.property_description,
      transaction?.purchaser_type,
      transaction?.seller_email,
      transaction?.seller_name,
      transaction?.seller_phone,
      transaction?.updated_at,
      transferStageLabel,
      development?.name,
      unit?.unit_number,
    ],
  )

  const detailRows = useMemo(
    () => [
      { key: 'matter', title: 'Matter Details' },
      { key: 'buyer', title: 'Buyer Details' },
      { key: 'seller', title: 'Seller Details' },
    ],
    [],
  )

  const activeDetailPanel = detailPanelSections[detailPanelKey] || detailPanelSections.matter

  function handleOpenDetailPanel(key) {
    setDetailPanelKey(key)
    setDetailPanelOpen(true)
  }

  useEffect(() => {
    if (!transaction) {
      return
    }
    const preferredRegistrationDoc =
      transaction.registration_confirmation_document_id ||
      registrationDocumentOptions.find((item) => item.category === 'Registration / Close-Out Documents')?.id ||
      registrationDocumentOptions[0]?.id ||
      ''
    setRegistrationDraft({
      registrationDate: toInputDate(transaction.registration_date || transaction.registered_at || new Date().toISOString()),
      titleDeedNumber: transaction.title_deed_number || '',
      registrationConfirmationDocumentId: preferredRegistrationDoc,
    })
  }, [registrationDocumentOptions, transaction])

  useEffect(() => {
    if (!transaction) return
    setAccessControlForm({
      ownerUserId: transaction.owner_user_id || profile?.id || '',
      accessLevel: transaction.access_level || 'shared',
    })
  }, [profile?.id, transaction])

  function openPrintDocument(content, popupErrorMessage) {
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const printWindow = window.open(url, '_blank', 'width=980,height=1320')

    if (!printWindow) {
      URL.revokeObjectURL(url)
      setError(popupErrorMessage)
      return
    }

    const cleanup = () => {
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }

    printWindow.onload = () => {
      window.setTimeout(() => {
        try {
          printWindow.focus()
          printWindow.print()
        } finally {
          cleanup()
        }
      }, 250)
    }
  }

  async function ensureOnboardingToken() {
    if (!transaction?.id) {
      throw new Error('Transaction data is missing.')
    }

    const record = data?.onboarding?.token
      ? data.onboarding
      : await getOrCreateTransactionOnboarding({
          transactionId: transaction.id,
          purchaserType: transaction?.purchaser_type || 'individual',
        })

    if (!record?.token) {
      throw new Error('Unable to generate onboarding link right now.')
    }

    setData((previous) => (previous ? { ...previous, onboarding: record } : previous))
    return record
  }

  async function getOnboardingLinkUrl() {
    const record = await ensureOnboardingToken()
    return `${window.location.origin}/client/onboarding/${record.token}`
  }

  async function handleCopyOnboardingLinkForRecipient(recipient) {
    if (!recipient?.canSend) {
      return
    }

    try {
      setOnboardingActionBusy(true)
      setError('')
      const linkUrl = await getOnboardingLinkUrl()
      await navigator.clipboard.writeText(linkUrl)
      setOnboardingActionMessage(`Onboarding link copied for ${recipient.roleLabel.toLowerCase()}.`)
    } catch (copyError) {
      setError(copyError?.message || 'Unable to copy onboarding link right now.')
    } finally {
      setOnboardingActionBusy(false)
    }
  }

  async function handleSendOnboardingLinkForRecipient(recipient) {
    if (!recipient?.canSend) {
      return
    }

    try {
      setOnboardingActionBusy(true)
      setError('')
      const linkUrl = await getOnboardingLinkUrl()
      const subject = encodeURIComponent('Bridge Onboarding Link')
      const body = encodeURIComponent(
        `Hello ${recipient.name || ''},\n\nPlease complete your onboarding here:\n${linkUrl}\n\nBridge`,
      )
      window.open(`mailto:${recipient.email}?subject=${subject}&body=${body}`, '_blank', 'noopener,noreferrer')
      setOnboardingActionMessage(`Mail draft opened for ${recipient.roleLabel.toLowerCase()}.`)
    } catch (sendError) {
      setError(sendError?.message || 'Unable to prepare onboarding send action right now.')
    } finally {
      setOnboardingActionBusy(false)
    }
  }

  const refreshRegistrationValidation = useCallback(async () => {
    if (!transaction?.id) {
      return
    }

    try {
      setRegistrationValidation((previous) => ({ ...previous, loading: true }))
      const validation = await getRegistrationBlockers({
        transactionId: transaction.id,
        registrationDate: registrationDraft.registrationDate || null,
        titleDeedNumber: registrationDraft.titleDeedNumber,
        registrationConfirmationDocumentId: registrationDraft.registrationConfirmationDocumentId || null,
      })
      setRegistrationValidation({
        loading: false,
        canMarkRegistered: Boolean(validation?.canMarkRegistered),
        blockers: validation?.blockers || [],
      })
    } catch (validationError) {
      setRegistrationValidation({
        loading: false,
        canMarkRegistered: false,
        blockers: [
          {
            key: 'validation_failed',
            label: validationError.message || 'Unable to validate registration prerequisites.',
          },
        ],
      })
    }
  }, [
    registrationDraft.registrationConfirmationDocumentId,
    registrationDraft.registrationDate,
    registrationDraft.titleDeedNumber,
    transaction?.id,
  ])

  async function handleOpenRegistrationFlow() {
    setRegistrationModalOpen(true)
    await refreshRegistrationValidation()
  }

  async function handleRunRegistration() {
    if (!transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await markTransactionRegistered({
        transactionId: transaction.id,
        registrationDate: registrationDraft.registrationDate || null,
        titleDeedNumber: registrationDraft.titleDeedNumber,
        registrationConfirmationDocumentId: registrationDraft.registrationConfirmationDocumentId || null,
      })
      setRegistrationModalOpen(false)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadData()
    } catch (registrationError) {
      setError(registrationError.message || 'Unable to mark this transaction as Registered.')
      await refreshRegistrationValidation()
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmAction(action) {
    if (!transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')

      if (action === 'complete') {
        const completion = await getCompletionBlockers(transaction.id)
        if (!completion?.canMarkCompleted) {
          throw new Error((completion?.blockers || []).map((item) => item.label).join(' • ') || 'Completion requirements are not met.')
        }
        await markTransactionCompleted(transaction.id)
      } else if (action === 'unarchive') {
        await unarchiveTransactionLifecycle(transaction.id)
      } else {
        throw new Error('Unsupported action.')
      }

      setConfirmDialog({ open: false, title: '', description: '', action: '' })
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadData()
    } catch (actionError) {
      setError(actionError.message || 'Unable to complete lifecycle action.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitReasonAction() {
    if (!transaction?.id) {
      return
    }

    const reasonValue = reasonDraft.trim()
    if (reasonDialog.reasonRequired && !reasonValue) {
      setError('Reason is required for this action.')
      return
    }

    try {
      setSaving(true)
      setError('')
      if (reasonDialog.action === 'undo_registration') {
        await undoTransactionRegistration({
          transactionId: transaction.id,
          reason: reasonValue,
        })
      } else if (reasonDialog.action === 'archive') {
        await archiveTransactionLifecycle({
          transactionId: transaction.id,
          reason: reasonValue,
        })
      } else if (reasonDialog.action === 'cancel') {
        await cancelTransactionLifecycle({
          transactionId: transaction.id,
          reason: reasonValue,
        })
      } else {
        throw new Error('Unsupported action.')
      }

      setReasonDialog((previous) => ({ ...previous, open: false }))
      setReasonDraft('')
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadData()
    } catch (actionError) {
      setError(actionError.message || 'Unable to apply lifecycle action.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePrintFinalReport() {
    if (!transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const report = await getFinalReportData(transaction.id)
      if (!report) {
        throw new Error('No report data found for this transaction.')
      }
      const html = buildAttorneyFinalReportHtml(report)
      openPrintDocument(html, 'Unable to open final report. Please allow pop-ups and try again.')
    } catch (reportError) {
      setError(reportError.message || 'Unable to generate final report.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!registrationModalOpen) {
      return
    }
    void refreshRegistrationValidation()
  }, [refreshRegistrationValidation, registrationModalOpen])

  async function handleUploadDocument(event) {
    event.preventDefault()
    if (!transaction?.id || !uploadDraft.file) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await uploadDocument({
        transactionId: transaction.id,
        file: uploadDraft.file,
        category: uploadDraft.category,
        isClientVisible: uploadDraft.visibility === 'shared',
        stageKey: transferStageKey,
      })
      setUploadDraft((previous) => ({ ...previous, file: null }))
      setUploadInputVersion((previous) => previous + 1)
      await loadData()
    } catch (uploadError) {
      setError(uploadError.message || 'Unable to upload document.')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchiveDocument(documentId) {
    if (!documentId) return
    try {
      setSaving(true)
      setError('')
      await archiveTransactionDocument(documentId)
      await loadData()
    } catch (archiveError) {
      setError(archiveError.message || 'Unable to archive document.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAccessControl(event) {
    event.preventDefault()
    if (!transaction?.id) return
    try {
      setSaving(true)
      setError('')
      setStakeholderMessage('')
      setInviteLinkResult('')
      const refreshed = await updateTransactionAccessControl({
        transactionId: transaction.id,
        ownerUserId: accessControlForm.ownerUserId || null,
        accessLevel: accessControlForm.accessLevel || 'shared',
      })
      if (refreshed) {
        setData(refreshed)
      } else {
        await loadData()
      }
      setStakeholderMessage('Access control updated.')
      window.dispatchEvent(new Event('itg:transaction-updated'))
    } catch (saveAccessError) {
      setError(saveAccessError.message || 'Unable to update transaction access control.')
    } finally {
      setSaving(false)
    }
  }

  async function handleInviteStakeholder(event) {
    event.preventDefault()
    if (!transaction?.id) return
    try {
      setSaving(true)
      setError('')
      setStakeholderMessage('')
      const response = await inviteStakeholder({
        transactionId: transaction.id,
        roleType: stakeholderInviteForm.roleType,
        legalRole: stakeholderInviteForm.roleType === 'attorney' ? stakeholderInviteForm.legalRole : null,
        email: stakeholderInviteForm.email,
        participantName: buildInviteParticipantName(stakeholderInviteForm),
        expiresDays: Number(stakeholderInviteForm.expiresDays) || 14,
      })
      const invitationUrl = response?.invitationUrl
        ? `${window.location.origin}${response.invitationUrl}`
        : ''
      if (invitationUrl) {
        try {
          await navigator.clipboard.writeText(invitationUrl)
        } catch {
          // Clipboard can fail in embedded browsers; keep url visible in UI.
        }
      }
      setInviteLinkResult(invitationUrl)
      setStakeholderInviteForm((previous) => ({
        ...previous,
        participantName: '',
        agentPhone: '',
        agentAgencyName: '',
        email: '',
      }))
      const agentMeta =
        stakeholderInviteForm.roleType === 'agent'
          ? [stakeholderInviteForm.agentAgencyName?.trim(), stakeholderInviteForm.agentPhone?.trim()].filter(Boolean).join(' • ')
          : ''
      setStakeholderMessage(invitationUrl ? 'Invite created and link copied.' : 'Invite created.')
      if (agentMeta) {
        setStakeholderMessage((previous) => `${previous} Agent details captured: ${agentMeta}.`)
      }
      await loadData()
      window.dispatchEvent(new Event('itg:transaction-updated'))
    } catch (inviteError) {
      setError(inviteError.message || 'Unable to create stakeholder invitation.')
    } finally {
      setSaving(false)
    }
  }

  function requestStakeholderRemoval(participant) {
    if (!participant?.id) return
    const participantLabel = participant.participantName || participant.participantEmail || participant.roleLabel || 'this stakeholder'
    setRemoveDialog({
      open: true,
      stakeholderId: participant.id,
      title: 'Remove Stakeholder',
      description: `Remove ${participantLabel} from this transaction? Access will be revoked immediately, and history will be retained.`,
    })
  }

  async function confirmRemoveStakeholder() {
    if (!transaction?.id || !removeDialog.stakeholderId) return
    try {
      setSaving(true)
      setError('')
      setStakeholderMessage('')
      setInviteLinkResult('')
      await removeStakeholder({
        transactionId: transaction.id,
        stakeholderId: removeDialog.stakeholderId,
      })
      setRemoveDialog({ open: false, stakeholderId: null, title: '', description: '' })
      setStakeholderMessage('Stakeholder removed.')
      await loadData()
      window.dispatchEvent(new Event('itg:transaction-updated'))
    } catch (removeError) {
      setError(removeError.message || 'Unable to remove stakeholder.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddDiscussion(event) {
    event.preventDefault()
    if (!transaction?.id || !discussionBody.trim()) {
      return
    }

    try {
      setSaving(true)
      setError('')
      if (discussionVisibility === 'internal' && !canPostInternalDiscussion) {
        setError('You do not have permission to post internal attorney notes.')
        return
      }
      if (discussionVisibility === 'shared' && !canPostSharedDiscussion) {
        setError('You do not have permission to post shared updates.')
        return
      }
      if (discussionVisibility === 'client_visible' && !canPublishClientVisibleDiscussion) {
        setError('You do not have permission to publish client-visible updates.')
        return
      }
      const normalizedDiscussion = discussionBody.trim()
      const prefixedDiscussion = `[${discussionType}] [${discussionVisibility}] ${normalizedDiscussion}`

      await addTransactionDiscussionComment({
        transactionId: transaction.id,
        authorName: 'Bridge Conveyancing',
        authorRole: 'attorney',
        commentText: prefixedDiscussion,
        unitId: unit?.id || null,
      })
      setDiscussionBody('')
      setDiscussionVisibility('shared')
      await loadData()
    } catch (saveError) {
      setError(saveError.message || 'Unable to post update.')
    } finally {
      setSaving(false)
    }
  }

  if (!isSupabaseConfigured) {
    return <p className="status-message error">Supabase is not configured for this workspace.</p>
  }

  if (workspaceRole === 'attorney' && attorneyPermissionState.loading) {
    return <LoadingSkeleton lines={8} className="panel" />
  }

  if (workspaceRole === 'attorney' && attorneyPermissionState.membership && !attorneyPermissionState.membership.isActive) {
    return <p className="status-message error">You do not have access to this attorney workspace.</p>
  }

  if (workspaceRole === 'attorney' && !matterAccessChecked) {
    return <LoadingSkeleton lines={8} className="panel" />
  }

  if (workspaceRole === 'attorney' && !matterAccessAllowed) {
    return <p className="status-message error">You do not have access to this matter.</p>
  }

  if (loading) {
    return <LoadingSkeleton lines={8} className="panel" />
  }

  if (!data || !transaction) {
    return <p className="status-message error">{error || 'Transaction not found.'}</p>
  }

  return (
    <>
      <SharedTransactionShell
      printTitle="Attorney Matter Report"
      printSubtitle={matterHeadline}
      printGeneratedAt={formatDate(new Date().toISOString())}
      errorMessage={error}
      headline={(
        <div className="space-y-4">
            <MatterCompactHeader
              title={matterReference}
            statusLabel={hydratingDetail ? 'Refreshing' : lifecycleLabel}
            statusClassName={getLifecycleStateClasses(lifecycleState)}
            propertyLabel={matterHeadline}
            subtitle={matterSubtitle}
            stats={matterHeaderStats}
            onAction={() => void handleOpenRegistrationFlow()}
            onAddNote={() => setWorkspaceMenu('activity')}
          />
          <MatterWorkspaceTabs tabs={workspaceMenuTabs} activeTab={activeWorkspaceMenu} onChange={setWorkspaceMenu} />
        </div>
      )}
    >
      <div className="space-y-6">
        {activeWorkspaceMenu === 'overview' ? (
          <>
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="space-y-4">
                <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-textStrong">Workflow Lanes</h2>
                      <p className="mt-1 text-sm text-textMuted">Assigned firms are shown for context. Phase 1 lets the authorised matter team update all active lanes.</p>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs font-medium text-textMuted">
                      {Object.entries(WORKFLOW_STATUS_META).map(([key, meta]) => (
                        <span key={key} className="inline-flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>

                {workflowLoading ? (
                  <LoadingSkeleton lines={5} className="rounded-[16px] border border-borderDefault bg-white p-4" />
                ) : workflowError ? (
                  <p className="rounded-[16px] border border-warning/30 bg-warningSoft px-4 py-3 text-sm font-medium text-warning">
                    {workflowError}
                  </p>
                ) : workflowLanes.length ? (
                  workflowLanes.map((lane) => (
                    <WorkflowLaneCard
                      key={lane.id || lane.laneKey}
                      lane={lane}
                      expanded={expandedWorkflowLane === lane.laneKey}
                      onToggle={() => setExpandedWorkflowLane((previous) => (previous === lane.laneKey ? '' : lane.laneKey))}
                      onOpenControls={() => setShowWorkflowControls(true)}
                    />
                  ))
                ) : (
                  <p className="rounded-[16px] border border-dashed border-borderDefault bg-white px-4 py-6 text-sm text-textMuted">
                    No required attorney workflow lanes are configured for this matter yet.
                  </p>
                )}

                {showWorkflowControls ? (
                  <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-textStrong">Workflow Controls</h3>
                        <p className="mt-1 text-sm text-textMuted">Detailed lane updates are open to the authorised matter team in Phase 1.</p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setShowWorkflowControls(false)}>
                        Hide controls
                      </Button>
                    </div>
                    <AttorneyWorkflowLanesPanel transactionId={transaction?.id} onChanged={loadData} />
                  </section>
                ) : null}

                <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-textStrong">Recent Activity Summary</h3>
                      <p className="mt-1 text-sm text-textMuted">Latest workflow, document, and note updates.</p>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setWorkspaceMenu('activity')}>
                      View all activity
                    </Button>
                  </div>
                  <div className="divide-y divide-borderSoft">
                    {activityFeed.slice(0, 4).map((entry) => (
                      <article key={entry.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <strong className="block truncate text-sm text-textStrong">{entry.title}</strong>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-textMuted">{entry.body}</p>
                          </div>
                          <span className="shrink-0 text-xs text-textMuted">{formatShortDayMonth(entry.createdAt)}</span>
                        </div>
                      </article>
                    ))}
                    {!activityFeed.length ? (
                      <p className="py-3 text-sm text-textMuted">Activity will appear here as the matter progresses.</p>
                    ) : null}
                  </div>
                </section>
              </div>

              <aside className="space-y-4">
                <OverviewSidePanel title="Next Actions">
                  <div className="space-y-3">
                    {overviewNextActions.map((item) => (
                      <article key={`${item.title}-${item.workflow}`} className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-3">
                        <div className="flex items-start gap-2">
                          <Clock3 size={15} className="mt-0.5 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <strong className="block text-sm text-textStrong">{item.title}</strong>
                            <p className="mt-1 text-xs leading-5 text-textMuted">{item.description}</p>
                            <p className="mt-1 text-xs font-semibold text-warning">{formatDate(item.dueDate)}</p>
                          </div>
                        </div>
                        <Button type="button" variant="secondary" size="sm" className="mt-2 w-full justify-center">
                          {item.action}
                        </Button>
                      </article>
                    ))}
                  </div>
                </OverviewSidePanel>

                <OverviewSidePanel title="Key Dates">
                  <div className="space-y-2">
                    {overviewKeyDates.map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-3 rounded-[10px] px-1 py-1.5">
                        <span className="text-sm text-textMuted">{item.label}</span>
                        <span className={`text-right text-sm font-semibold ${item.emphasis ? 'text-primary' : 'text-textStrong'}`}>
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </OverviewSidePanel>

                <OverviewSidePanel title="Assigned Team">
                  <div className="space-y-3">
                    {assignedTeamRows.map((row) => {
                      const isCurrentUser = row.participant?.userId && row.participant.userId === profile?.id
                      return (
                        <article key={row.role} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">{row.role}</span>
                            <strong className="mt-1 block truncate text-sm text-textStrong">
                              {row.participant?.participantName || row.participant?.organisationName || row.participant?.participantEmail || 'Not assigned'}
                            </strong>
                          </div>
                          {isCurrentUser ? (
                            <span className="rounded-full border border-primary/20 bg-primarySoft px-2 py-0.5 text-[0.68rem] font-semibold text-primary">
                              You
                            </span>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                </OverviewSidePanel>
              </aside>
            </section>
          </>
        ) : null}

        {activeWorkspaceMenu === 'buyer' ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Buyer Workspace</h3>
                  <p className="mt-1 text-secondary text-textMuted">Buyer identity, FICA, finance position, signatures, and communication notes.</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-helper font-semibold ${onboardingCompleted ? 'border-success/30 bg-successSoft text-success' : 'border-warning/30 bg-warningSoft text-warning'}`}>
                  {onboardingCompleted ? 'Onboarding complete' : 'Onboarding pending'}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {detailPanelSections.buyer.items.map((item) => (
                  <article key={item.label} className="min-w-0 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <span className="text-label font-semibold uppercase text-textMuted">{item.label}</span>
                    <strong className="mt-1 block truncate text-body font-semibold text-textStrong">{item.value}</strong>
                  </article>
                ))}
                <article className="min-w-0 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                  <span className="text-label font-semibold uppercase text-textMuted">Finance Type</span>
                  <strong className="mt-1 block text-body font-semibold text-textStrong">{financeTypeLabel}</strong>
                </article>
                <article className="min-w-0 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                  <span className="text-label font-semibold uppercase text-textMuted">Signature Status</span>
                  <strong className="mt-1 block text-body font-semibold text-textStrong">
                    {requiredDocumentChecklist.length ? documentReadinessText : 'No signature pack configured'}
                  </strong>
                </article>
              </div>
            </section>

            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <h3 className="text-section-title font-semibold text-textStrong">Buyer Documents</h3>
              <p className="mt-1 text-secondary text-textMuted">Buyer-facing files remain separated from seller and internal legal documents.</p>
              <div className="mt-4 grid gap-3">
                {(groupedDocuments.buyer_documents || []).slice(0, 6).map((document) => (
                  <article key={document.id} className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <strong className="block truncate text-sm text-textStrong">{document.name || 'Buyer document'}</strong>
                    <p className="mt-1 text-xs text-textMuted">{document.normalizedCategory || document.category || 'Buyer document'} • {toTitle(document.status || 'uploaded')}</p>
                  </article>
                ))}
                {!(groupedDocuments.buyer_documents || []).length ? (
                  <p className="rounded-control border border-dashed border-borderSoft bg-surfaceAlt px-4 py-4 text-sm text-textMuted">
                    No buyer documents have been uploaded yet.
                  </p>
                ) : null}
              </div>
            </section>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'seller' ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Seller Workspace</h3>
                  <p className="mt-1 text-secondary text-textMuted">Seller identity, FICA, existing bond information, cancellation triggers, and seller documents.</p>
                </div>
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-helper font-semibold ${
                  transaction?.seller_has_existing_bond ? 'border-warning/30 bg-warningSoft text-warning' : 'border-borderDefault bg-mutedBg text-textMuted'
                }`}>
                  {transaction?.seller_has_existing_bond ? 'Cancellation required' : 'No seller bond flagged'}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {detailPanelSections.seller.items.map((item) => (
                  <article key={item.label} className="min-w-0 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <span className="text-label font-semibold uppercase text-textMuted">{item.label}</span>
                    <strong className="mt-1 block truncate text-body font-semibold text-textStrong">{item.value}</strong>
                  </article>
                ))}
                {[
                  ['Existing Bond', transaction?.seller_has_existing_bond ? 'Yes' : 'Not flagged'],
                  ['Current Bond Bank', transaction?.current_bond_bank || 'Not captured'],
                  ['Bond Account', transaction?.current_bond_account_number || 'Not captured'],
                  ['Estimated Settlement', transaction?.estimated_settlement_amount ? currency.format(Number(transaction.estimated_settlement_amount || 0)) : 'Not captured'],
                ].map(([label, value]) => (
                  <article key={label} className="min-w-0 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <span className="text-label font-semibold uppercase text-textMuted">{label}</span>
                    <strong className="mt-1 block truncate text-body font-semibold text-textStrong">{value}</strong>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <h3 className="text-section-title font-semibold text-textStrong">Seller & Cancellation Documents</h3>
              <p className="mt-1 text-secondary text-textMuted">Seller files and cancellation-specific documents stay visible together.</p>
              <div className="mt-4 grid gap-3">
                {[...(groupedDocuments.seller_documents || []), ...(groupedDocuments.cancellation_documents || [])].slice(0, 6).map((document) => (
                  <article key={document.id} className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <strong className="block truncate text-sm text-textStrong">{document.name || 'Seller document'}</strong>
                    <p className="mt-1 text-xs text-textMuted">{document.normalizedCategory || document.category || 'Seller document'} • {toTitle(document.status || 'uploaded')}</p>
                  </article>
                ))}
                {![...(groupedDocuments.seller_documents || []), ...(groupedDocuments.cancellation_documents || [])].length ? (
                  <p className="rounded-control border border-dashed border-borderSoft bg-surfaceAlt px-4 py-4 text-sm text-textMuted">
                    No seller or cancellation documents have been uploaded yet.
                  </p>
                ) : null}
              </div>
            </section>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'parties' ? (
          <section className="space-y-5">
            <section className="grid gap-4 lg:grid-cols-2">
              {partySections.map((section) => (
                <article key={section.title} className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primarySoft text-primary">
                      {section.title === 'Property' ? <Building2 size={17} /> : section.title === 'Attorney Roles' ? <Workflow size={17} /> : <UsersRound size={17} />}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-textStrong">{section.title}</h3>
                      <p className="mt-1 text-sm leading-5 text-textMuted">{section.subtitle}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {section.items.map(([label, value]) => (
                      <div key={`${section.title}-${label}`} className="min-w-0 rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2.5">
                        <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{label}</span>
                        <strong className="mt-1 block truncate text-sm text-textStrong">{value || 'Not captured'}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </section>

            <AttorneyAssignmentSection
              transactionId={transaction?.id}
              financeType={transaction?.finance_type || 'cash'}
              transaction={transaction}
            />
          </section>
        ) : null}

        {activeWorkspaceMenu === 'documents' ? (
          <section className="space-y-5">
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-[1.25rem] font-semibold tracking-[-0.03em] text-[#142132]">Documents</h3>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                    Upload shared or internal legal documents and keep each file in the correct workflow group.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  {[
                    ['Shared', sharedAttorneyDocumentCount],
                    ['Internal', internalAttorneyDocumentCount],
                    ['Required', requiredDocumentChecklist.length],
                    ['Client Uploads', uploadedByClientCount],
                  ].map(([label, value]) => (
                    <article key={label} className="rounded-[16px] border border-[#dde4ee] bg-[#fbfdff] px-4 py-3">
                      <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                      <strong className="mt-2 block text-sm font-semibold text-[#142132]">{value}</strong>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">Upload Document</h3>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Select a category, set visibility, and upload your latest legal file.</p>
                </div>
                {uploadDraft.file ? (
                  <span className="inline-flex max-w-full items-center rounded-full border border-[#dde4ee] bg-[#f8fafc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">
                    {uploadDraft.file.name}
                  </span>
                ) : null}
              </div>
              <form onSubmit={handleUploadDocument} className="mt-4 grid gap-3 lg:grid-cols-12 lg:items-end">
                <label className="flex flex-col gap-1.5 lg:col-span-4">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Category</span>
                  <Field
                    as="select"
                    value={uploadDraft.category}
                    onChange={(event) => setUploadDraft((previous) => ({ ...previous, category: event.target.value }))}
                  >
                    {ATTORNEY_DOCUMENT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </Field>
                </label>
                <label className="flex flex-col gap-1.5 lg:col-span-3">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Visibility</span>
                  <Field
                    as="select"
                    value={uploadDraft.visibility}
                    onChange={(event) => setUploadDraft((previous) => ({ ...previous, visibility: event.target.value }))}
                  >
                    {DOCUMENT_VISIBILITY_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </label>
                <label className="flex flex-col gap-1.5 lg:col-span-5">
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">File</span>
                  <Field
                    key={`upload-input-${uploadInputVersion}`}
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null
                      setUploadDraft((previous) => ({ ...previous, file }))
                    }}
                  />
                </label>
                <div className="lg:col-span-12">
                  <Button type="submit" disabled={saving || !uploadDraft.file} className="min-w-[176px] justify-center">
                    {saving ? 'Uploading…' : 'Upload Document'}
                  </Button>
                </div>
              </form>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="rounded-[18px] border border-[#dde4ee] bg-[#f8fafc] p-3">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                  {attorneyDocumentSections.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      className={`flex w-full items-center justify-between gap-3 rounded-[14px] border px-4 py-3 text-left transition ${
                        activeDocumentGroup === group.key
                          ? 'border-[#bfd3ea] bg-white text-[#1f3247] shadow-[0_8px_20px_rgba(15,23,42,0.06)]'
                          : 'border-transparent bg-transparent text-[#5c7088] hover:border-[#d5e0ed] hover:bg-white/70'
                      }`}
                      onClick={() => setActiveDocumentGroup(group.key)}
                    >
                      <span className="text-sm font-semibold">{group.label}</span>
                      <span className="inline-flex items-center rounded-full border border-[#d7e2ee] bg-[#f7fafd] px-2.5 py-1 text-[0.68rem] font-semibold text-[#6d8098]">
                        {group.items.length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {activeAttorneyDocumentSection ? (
                <section className="mt-4 rounded-[20px] border border-[#dde4ee] bg-white p-6">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-[1.1rem] font-semibold tracking-[-0.03em] text-[#142132]">{activeAttorneyDocumentSection.label}</h3>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{activeAttorneyDocumentSection.description}</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f8fafc] px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">
                      {activeAttorneyDocumentSection.items.length} file{activeAttorneyDocumentSection.items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {activeAttorneyDocumentSection.items.length ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {activeAttorneyDocumentSection.items.map((document) => {
                        const visibility = String(document.visibility_scope || 'shared').toLowerCase()
                        const isShared = visibility === 'shared'
                        const isArchived = Boolean(document.archived_at)
                        return (
                          <article key={document.id} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-5 py-5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <strong className="block break-words text-sm font-semibold leading-7 text-[#142132]">
                                  {document.name || 'Untitled document'}
                                </strong>
                                <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                                  {document.normalizedCategory || document.category || 'Document'}
                                </p>
                              </div>
                              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${
                                isShared
                                  ? 'border-[#d6e5f4] bg-[#eef5fb] text-[#35546c]'
                                  : 'border-[#dde4ee] bg-[#f8fafc] text-[#66758b]'
                              }`}>
                                {isShared ? 'Client-visible' : 'Internal'}
                              </span>
                            </div>
                            <div className="mt-4 grid gap-2 text-xs text-[#60758d]">
                              {[
                                ['Status', getDocumentStatus(document)],
                                ['Uploaded by', document.uploaded_by_role || document.uploadedByRole || 'Internal user'],
                                ['Requested by', document.requested_by_role || document.requestedByRole || document.requested_by || 'Not recorded'],
                                ['Reviewed by', document.reviewed_by_name || document.reviewedByName || document.reviewed_by || 'Not reviewed'],
                                ['Last updated', formatDateTime(document.updated_at || document.created_at)],
                              ].map(([label, value]) => (
                                <div key={label} className="flex justify-between gap-3">
                                  <span>{label}</span>
                                  <strong className="min-w-0 truncate text-right text-[#142132]">{value}</strong>
                                </div>
                              ))}
                            </div>
                            {document.rejection_reason || document.rejected_reason ? (
                              <p className="mt-3 rounded-[12px] border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                                {document.rejection_reason || document.rejected_reason}
                              </p>
                            ) : null}
                            {isArchived ? <p className="mt-1 text-xs font-semibold text-[#b42318]">Archived</p> : null}
                            <div className="mt-4 flex flex-wrap gap-2">
                              {document.url ? (
                                <a
                                  href={document.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 rounded-full border border-[#dde4ee] bg-white px-4 py-2 text-sm font-semibold text-[#35546c]"
                                >
                                  <FileText size={14} />
                                  View
                                </a>
                              ) : null}
                              {document.url ? (
                                <a
                                  href={document.url}
                                  download
                                  className="inline-flex items-center rounded-full border border-[#dde4ee] bg-white px-4 py-2 text-sm font-semibold text-[#35546c]"
                                >
                                  Download
                                </a>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleArchiveDocument(document.id)}
                                disabled={saving || isArchived}
                              >
                                Archive
                              </Button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-5 py-6 text-sm text-[#6b7d93]">
                      No documents in {activeAttorneyDocumentSection.label.toLowerCase()} yet.
                    </div>
                  )}
                </section>
              ) : null}
            </section>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'financials' ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Financials</h3>
                  <p className="mt-1 text-secondary text-textMuted">Purchase price, bond exposure, guarantees, transfer fees, and trust placeholders for this matter.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
                  Management view
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {financialRows.map(([label, value]) => (
                  <article key={label} className="min-w-0 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <span className="text-label font-semibold uppercase text-textMuted">{label}</span>
                    <strong className="mt-1 block truncate text-body font-semibold text-textStrong">{value}</strong>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <h3 className="text-section-title font-semibold text-textStrong">Guarantee & Cost Notes</h3>
              <p className="mt-1 text-secondary text-textMuted">Financial workflows can be expanded here as trust and fee ledgers are connected.</p>
              <div className="mt-4 grid gap-3">
                {[
                  ['Finance Type', financeTypeLabel],
                  ['Current Stage', transferStageLabel],
                  ['Expected Transfer Date', formatDate(transaction?.expected_transfer_date)],
                  ['Registration Date', formatDate(transaction?.registration_date || transaction?.registered_at)],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <span className="text-sm text-textMuted">{label}</span>
                    <strong className="truncate text-right text-sm text-textStrong">{value}</strong>
                  </div>
                ))}
              </div>
            </section>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'activity' ? (
          <section className="space-y-5">
            <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-textStrong">Activity Timeline</h3>
                  <p className="mt-1 text-sm text-textMuted">Workflow updates, documents, notes, appointments, generated documents, and status changes.</p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {activityFilterOptions.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        activityFilter === filter
                          ? 'border-primary bg-primary text-white'
                          : 'border-borderDefault bg-white text-textMuted hover:text-textStrong'
                      }`}
                      onClick={() => setActivityFilter(filter)}
                    >
                      {filter === 'client_visible' ? 'Client-visible' : toTitle(filter)}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-[16px] border border-borderDefault bg-white shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                <div className="divide-y divide-borderSoft">
                  {filteredActivityFeed.map((entry) => (
                    <article key={entry.id} className="px-4 py-4">
                      <div className="flex gap-3">
                        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${entry.kind === 'comment' ? 'bg-amber-500' : 'bg-blue-600'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h4 className="truncate text-sm font-semibold text-textStrong">{entry.title}</h4>
                              <p className="mt-1 text-xs text-textMuted">{entry.authorName} • {entry.roleLabel}</p>
                            </div>
                            <span className="text-xs text-textMuted">{formatDateTime(entry.createdAt)}</span>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-textBody">{entry.body}</p>
                          <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-[0.68rem] font-semibold ${entry.kind === 'comment' ? entry.roleTone.badge : 'border border-borderDefault bg-mutedBg text-textMuted'}`}>
                            {entry.commentType}
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                  {!filteredActivityFeed.length ? (
                    <p className="px-4 py-8 text-sm text-textMuted">No activity matches this filter yet.</p>
                  ) : null}
                </div>
              </div>

              <form onSubmit={handleAddDiscussion} className="h-fit rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                <h3 className="text-sm font-semibold text-textStrong">Add Note</h3>
                <div className="mt-4 grid gap-3">
                  <label className="grid gap-1.5 text-sm font-medium text-[#35546c]">
                    <span>Update Type</span>
                    <Field as="select" value={discussionType} onChange={(event) => setDiscussionType(event.target.value)}>
                      {DISCUSSION_TYPES.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </Field>
                  </label>
                  <label className="grid gap-1.5 text-sm font-medium text-[#35546c]">
                    <span>Visibility</span>
                    <Field as="select" value={discussionVisibility} onChange={(event) => setDiscussionVisibility(event.target.value)}>
                      {DISCUSSION_VISIBILITY_OPTIONS.map((item) => (
                        <option
                          key={item.key}
                          value={item.key}
                          disabled={
                            (item.key === 'internal' && !canPostInternalDiscussion) ||
                            (item.key === 'shared' && !canPostSharedDiscussion) ||
                            (item.key === 'client_visible' && !canPublishClientVisibleDiscussion)
                          }
                        >
                          {item.label}
                        </option>
                      ))}
                    </Field>
                  </label>
                  <Field
                    as="textarea"
                    rows={5}
                    value={discussionBody}
                    onChange={(event) => setDiscussionBody(event.target.value)}
                    placeholder="Add an internal note or shared update..."
                  />
                  <Button
                    type="submit"
                    disabled={
                      saving ||
                      !discussionBody.trim() ||
                      (discussionVisibility === 'internal' && !canPostInternalDiscussion) ||
                      (discussionVisibility === 'shared' && !canPostSharedDiscussion) ||
                      (discussionVisibility === 'client_visible' && !canPublishClientVisibleDiscussion)
                    }
                    className="justify-center"
                  >
                    {saving ? 'Posting...' : 'Post Update'}
                  </Button>
                </div>
              </form>
            </section>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'stakeholders' ? (
          <section className="space-y-5">
            <AttorneyAssignmentSection
              transactionId={transaction?.id}
              financeType={transaction?.finance_type || 'cash'}
              transaction={transaction}
            />

            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <h3 className="text-section-title font-semibold text-textStrong">Legal Role Assignments</h3>
              <p className="mt-1 text-secondary text-textMuted">Transfer attorney is mandatory. Bond and cancellation attorneys are optional and may be different firms.</p>
              <p className="mt-2 rounded-control border border-borderSoft bg-surfaceAlt px-3 py-2 text-helper text-textMuted">
                {legalRoleAssignmentNote}
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  { label: 'Transfer Attorney', item: transferAttorney, required: true },
                  { label: 'Bond Attorney', item: bondAttorney, required: false },
                  { label: 'Cancellation Attorney', item: cancellationAttorney, required: false },
                ].map((entry) => (
                  <article key={entry.label} className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                    <span className="text-label font-semibold uppercase text-textMuted">{entry.label}</span>
                    <strong className="mt-1 block text-body font-semibold text-textStrong">
                      {entry.item?.participantName || entry.item?.participantEmail || (entry.required ? 'Required' : 'Not assigned')}
                    </strong>
                    <small className="mt-1 block text-helper text-textMuted">
                      {entry.item?.stakeholderStatus ? toTitle(entry.item.stakeholderStatus) : entry.required ? 'Must be configured' : 'Optional'}
                    </small>
                    {entry.item?.participantEmail ? (
                      <small className="mt-1 block text-helper text-textMuted">{entry.item.participantEmail}</small>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Ownership & Access</h3>
                  <p className="mt-1 text-secondary text-textMuted">Control transaction owner and collaboration visibility (Private / Shared / Restricted).</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
                  Current: {toTitle(accessControlForm.accessLevel || transaction?.access_level || 'shared')}
                </span>
              </div>
              <form onSubmit={handleSaveAccessControl} className="grid gap-3 md:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-label font-semibold uppercase text-textMuted">Owner</span>
                  <Field
                    as="select"
                    value={accessControlForm.ownerUserId}
                    onChange={(event) =>
                      setAccessControlForm((previous) => ({
                        ...previous,
                        ownerUserId: event.target.value,
                      }))
                    }
                  >
                    <option value="">Unassigned</option>
                    {ownerCandidateOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-label font-semibold uppercase text-textMuted">Access Level</span>
                  <Field
                    as="select"
                    value={accessControlForm.accessLevel}
                    onChange={(event) =>
                      setAccessControlForm((previous) => ({
                        ...previous,
                        accessLevel: event.target.value,
                      }))
                    }
                  >
                    {TRANSACTION_ACCESS_LEVEL_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </Field>
                </label>
                <div className="flex items-end">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving…' : 'Save Access'}
                  </Button>
                </div>
              </form>
            </section>

            <section className="grid items-stretch gap-5 xl:grid-cols-2">
              <form onSubmit={handleInviteStakeholder} className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
                <h3 className="text-section-title font-semibold text-textStrong">Invite Stakeholder</h3>
                <p className="mt-1 text-secondary text-textMuted">
                  Invite service providers only. Buyer and seller onboarding is managed separately.
                </p>
                <div className="mt-4 grid gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Role</span>
                    <Field
                      as="select"
                      value={stakeholderInviteForm.roleType}
                      onChange={(event) =>
                        setStakeholderInviteForm((previous) => ({
                          ...previous,
                          roleType: event.target.value,
                          legalRole: event.target.value === 'attorney' ? previous.legalRole : 'transfer',
                          agentPhone: event.target.value === 'agent' ? previous.agentPhone : '',
                          agentAgencyName: event.target.value === 'agent' ? previous.agentAgencyName : '',
                        }))
                      }
                    >
                      {SERVICE_PROVIDER_ROLE_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </Field>
                  </label>
                  {stakeholderInviteForm.roleType === 'attorney' ? (
                    <label className="flex flex-col gap-1.5">
                      <span className="text-label font-semibold uppercase text-textMuted">Legal Role</span>
                      <Field
                        as="select"
                        value={stakeholderInviteForm.legalRole}
                        onChange={(event) =>
                          setStakeholderInviteForm((previous) => ({
                            ...previous,
                            legalRole: event.target.value,
                          }))
                        }
                      >
                        {ATTORNEY_LEGAL_ROLE_OPTIONS.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </Field>
                    </label>
                  ) : null}
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Name (optional)</span>
                    <Field
                      value={stakeholderInviteForm.participantName}
                      onChange={(event) =>
                        setStakeholderInviteForm((previous) => ({
                          ...previous,
                          participantName: event.target.value,
                        }))
                      }
                      placeholder="Stakeholder name"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Email</span>
                    <Field
                      type="email"
                      required
                      value={stakeholderInviteForm.email}
                      onChange={(event) =>
                        setStakeholderInviteForm((previous) => ({
                          ...previous,
                          email: event.target.value,
                        }))
                      }
                      placeholder="person@example.com"
                    />
                  </label>
                  {stakeholderInviteForm.roleType === 'agent' ? (
                    <>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-label font-semibold uppercase text-textMuted">Agent Phone</span>
                        <Field
                          value={stakeholderInviteForm.agentPhone}
                          onChange={(event) =>
                            setStakeholderInviteForm((previous) => ({
                              ...previous,
                              agentPhone: event.target.value,
                            }))
                          }
                          placeholder="+27 82 000 0000"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-label font-semibold uppercase text-textMuted">Agency Name</span>
                        <Field
                          value={stakeholderInviteForm.agentAgencyName}
                          onChange={(event) =>
                            setStakeholderInviteForm((previous) => ({
                              ...previous,
                              agentAgencyName: event.target.value,
                            }))
                          }
                          placeholder="Agency / Brokerage"
                        />
                      </label>
                    </>
                  ) : null}
                  <label className="flex flex-col gap-1.5 md:max-w-[220px]">
                    <span className="text-label font-semibold uppercase text-textMuted">Expires (days)</span>
                    <Field
                      type="number"
                      min="1"
                      max="90"
                      value={stakeholderInviteForm.expiresDays}
                      onChange={(event) =>
                        setStakeholderInviteForm((previous) => ({
                          ...previous,
                          expiresDays: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div>
                    <Button type="submit" disabled={saving || !stakeholderInviteForm.email.trim()}>
                      {saving ? 'Creating…' : 'Create Invite'}
                    </Button>
                  </div>
                  {inviteLinkResult ? (
                    <p className="rounded-control border border-borderDefault bg-surfaceAlt px-3 py-2 text-helper text-textMuted">
                      Invite URL: <a href={inviteLinkResult} target="_blank" rel="noreferrer" className="font-semibold text-primary">{inviteLinkResult}</a>
                    </p>
                  ) : null}
                </div>
              </form>

              <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-section-title font-semibold text-textStrong">Stakeholder Contacts</h3>
                    <p className="mt-1 text-secondary text-textMuted">Current invited and linked service providers on this transaction.</p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
                    {serviceProviderStakeholders.length} service provider{serviceProviderStakeholders.length === 1 ? '' : 's'}
                  </span>
                </div>

                {serviceProviderStakeholders.length ? (
                  <div className="space-y-2.5">
                    {serviceProviderStakeholders.map((participant) => (
                      <article key={participant.id} className="grid gap-3 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_auto] md:items-center">
                        <div className="min-w-0">
                          <strong className="block truncate text-body font-semibold text-textStrong">
                            {participant.participantName || participant.participantEmail || 'Unassigned'}
                          </strong>
                          <small className="mt-1 block truncate text-helper text-textMuted">
                            {participant.participantEmail || 'No contact email captured'}
                          </small>
                        </div>
                        <div className="min-w-0">
                          <small className="block text-helper text-textMuted">
                            {participant.roleLabel}
                            {participant.roleType === 'attorney' && participant.legalRole ? ` • ${toTitle(participant.legalRole)} role` : ''}
                          </small>
                          <small className="block text-helper text-textMuted">
                            {toTitle(participant.stakeholderStatus || 'active')} • {participant.userId ? 'Linked User' : 'Invitation'}
                            {participant.accessInherited ? ' • Inherited from development' : ''}
                          </small>
                        </div>
                        <div className="flex justify-start md:justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={saving || participant.accessInherited}
                            onClick={() => requestStakeholderRemoval(participant)}
                          >
                            Remove
                          </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-control border border-dashed border-borderDefault bg-surfaceAlt px-4 py-4 text-secondary text-textMuted">
                    No service providers are currently linked to this transaction.
                  </p>
                )}
              </section>
            </section>

            {stakeholderMessage ? (
              <p className="rounded-control border border-borderDefault bg-surfaceAlt px-4 py-3 text-secondary text-textMuted">
                {stakeholderMessage}
              </p>
            ) : null}
          </section>
        ) : null}

        {activeWorkspaceMenu === 'details' ? (
          <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-section-title font-semibold text-textStrong">Details</h3>
                <p className="mt-1 text-secondary text-textMuted">Open Matter, Buyer, or Seller details in a focused panel.</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => void handlePrintFinalReport()} disabled={saving}>
                <FileText size={14} />
                Export
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {detailRows.map((row) => {
                const section = detailPanelSections[row.key]
                return (
                  <button
                    key={row.key}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3 text-left transition hover:border-borderDefault hover:bg-surface"
                    onClick={() => handleOpenDetailPanel(row.key)}
                  >
                    <div className="min-w-0">
                      <strong className="block text-body font-semibold text-textStrong">{row.title}</strong>
                      <span className="mt-1 block truncate text-helper text-textMuted">{section?.summary || 'Open for details'}</span>
                    </div>
                    <ChevronRight size={16} className="text-textMuted" />
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}
      </div>
      </SharedTransactionShell>

      <Modal
        open={detailPanelOpen}
        onClose={() => setDetailPanelOpen(false)}
        title={activeDetailPanel?.title || 'Details'}
        subtitle={activeDetailPanel?.subtitle || ''}
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setDetailPanelOpen(false)}>
              Close
            </Button>
            <Button type="button" onClick={() => void handlePrintFinalReport()} disabled={saving}>
              <FileText size={14} />
              Export
            </Button>
          </div>
        )}
      >
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={() => void handlePrintFinalReport()} disabled={saving}>
              <FileText size={14} />
              Export
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {(activeDetailPanel?.items || []).map((item) => (
              <article key={item.label} className="rounded-control border border-borderSoft bg-surfaceAlt px-4 py-3">
                <span className="text-label font-semibold uppercase text-textMuted">{item.label}</span>
                <strong className="mt-1 block text-body font-semibold text-textStrong">{item.value || 'Not set'}</strong>
              </article>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        open={onboardingModalOpen}
        onClose={onboardingActionBusy ? undefined : () => setOnboardingModalOpen(false)}
        title="Onboarding Links"
        subtitle={
          isPrivateMatter
            ? 'Share onboarding links for both buyer and seller on this private matter.'
            : 'Share the buyer onboarding link for this development matter.'
        }
        footer={(
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setOnboardingModalOpen(false)} disabled={onboardingActionBusy}>
              Close
            </Button>
          </div>
        )}
      >
        <div className="space-y-5">
          <p className="rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3 text-secondary text-textMuted">
            Choose a recipient below and either copy the onboarding link or open a prefilled email draft.
          </p>
          {onboardingRecipients.map((recipient) => (
            <article key={recipient.key} className="rounded-[16px] border border-borderSoft bg-surfaceAlt px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <strong className="block text-body font-semibold text-textStrong">{recipient.roleLabel}</strong>
                <p className="mt-1 text-secondary text-textBody">{recipient.name}</p>
                <small className="mt-1.5 block text-helper text-textMuted">
                  {recipient.email || 'No contact email captured'} • {recipient.stateLabel}
                </small>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleCopyOnboardingLinkForRecipient(recipient)}
                  disabled={onboardingActionBusy || !recipient.canSend}
                >
                  Copy Link
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleSendOnboardingLinkForRecipient(recipient)}
                  disabled={onboardingActionBusy || !recipient.canSend}
                >
                  <Send size={14} />
                  Send Link
                </Button>
              </div>
              </div>
            </article>
          ))}
          {onboardingActionMessage ? (
            <p className="rounded-[14px] border border-borderDefault bg-surfaceAlt px-4 py-2.5 text-helper text-textMuted">{onboardingActionMessage}</p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={registrationModalOpen}
        onClose={saving ? undefined : () => setRegistrationModalOpen(false)}
        title="Guided Registration"
        subtitle="Capture registration details, validate blockers, and confirm legal registration."
        footer={(
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setRegistrationModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void refreshRegistrationValidation()}
              disabled={saving || registrationValidation.loading}
            >
              {registrationValidation.loading ? 'Validating…' : 'Recheck Requirements'}
            </Button>
            <Button
              type="button"
              onClick={() => void handleRunRegistration()}
              disabled={saving || !registrationValidation.canMarkRegistered}
            >
              {saving ? 'Saving…' : 'Mark Registered'}
            </Button>
          </div>
        )}
      >
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-semibold uppercase text-textMuted">Registration Date</span>
              <Field
                type="date"
                value={registrationDraft.registrationDate}
                onChange={(event) =>
                  setRegistrationDraft((previous) => ({
                    ...previous,
                    registrationDate: event.target.value,
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-semibold uppercase text-textMuted">Title Deed Number</span>
              <Field
                value={registrationDraft.titleDeedNumber}
                onChange={(event) =>
                  setRegistrationDraft((previous) => ({
                    ...previous,
                    titleDeedNumber: event.target.value,
                  }))
                }
                placeholder="TD-2026-000123"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-label font-semibold uppercase text-textMuted">Registration Confirmation Document</span>
            <Field
              as="select"
              value={registrationDraft.registrationConfirmationDocumentId}
              onChange={(event) =>
                setRegistrationDraft((previous) => ({
                  ...previous,
                  registrationConfirmationDocumentId: event.target.value,
                }))
              }
            >
              <option value="">Select document</option>
              {registrationDocumentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || `Document ${item.id}`}
                </option>
              ))}
            </Field>
          </label>

          <section className="rounded-control border border-borderSoft bg-surfaceAlt p-4">
            <h4 className="text-body font-semibold text-textStrong">Validation</h4>
            {registrationValidation.blockers.length ? (
              <ul className="mt-2 space-y-1 text-secondary text-danger">
                {registrationValidation.blockers.map((blocker) => (
                  <li key={blocker.key || blocker.label}>• {blocker.label}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-secondary text-success">All required registration checks are satisfied.</p>
            )}
          </section>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.action === 'unarchive' ? 'Unarchive' : 'Mark Completed'}
        variant={confirmDialog.action === 'unarchive' ? 'default' : 'destructive'}
        confirming={saving}
        onCancel={() => setConfirmDialog({ open: false, title: '', description: '', action: '' })}
        onConfirm={() => void handleConfirmAction(confirmDialog.action)}
      />

      <ConfirmDialog
        open={removeDialog.open}
        title={removeDialog.title}
        description={removeDialog.description}
        confirmLabel="Remove Stakeholder"
        variant="destructive"
        confirming={saving}
        onCancel={() => setRemoveDialog({ open: false, stakeholderId: null, title: '', description: '' })}
        onConfirm={() => void confirmRemoveStakeholder()}
      />

      <Modal
        open={reasonDialog.open}
        onClose={saving ? undefined : () => setReasonDialog((previous) => ({ ...previous, open: false }))}
        title={reasonDialog.title}
        subtitle={reasonDialog.subtitle}
        footer={(
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReasonDialog((previous) => ({ ...previous, open: false }))}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={reasonDialog.action === 'cancel' || reasonDialog.action === 'undo_registration' ? 'bg-danger text-textInverse hover:brightness-95' : ''}
              onClick={() => void handleSubmitReasonAction()}
              disabled={saving || (reasonDialog.reasonRequired && !reasonDraft.trim())}
            >
              {saving ? 'Processing…' : reasonDialog.confirmLabel}
            </Button>
          </div>
        )}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-label font-semibold uppercase text-textMuted">
            {reasonDialog.reasonRequired ? 'Reason (required)' : 'Reason (optional)'}
          </span>
          <Field
            as="textarea"
            rows={4}
            value={reasonDraft}
            onChange={(event) => setReasonDraft(event.target.value)}
            placeholder="Add context for this lifecycle action..."
          />
        </label>
      </Modal>
    </>
  )
}

export default AttorneyTransactionDetail
