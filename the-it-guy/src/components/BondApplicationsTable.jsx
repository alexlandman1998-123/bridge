import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ArrowUpRight, Bell, CheckCircle2, FilePlus2, UserPlus, XCircle } from 'lucide-react'
import {
  BOND_OPERATIONAL_QUEUE_KEYS,
  buildBondNewApplicationViewModel,
} from '../services/bondOperationalQueueService'
import { BOND_INTAKE_STATUSES } from '../core/transactions/bondIntakeSelectors'
import { getBondApplicationStage } from '../core/transactions/bondSelectors'
import { getTransactionScopeForRow } from '../core/transactions/transactionScope'
import { FINANCE_READINESS_DISCLAIMER, getFinanceReadinessSummary } from '../core/finance/financeReadinessSelectors'
import { resolveEffectiveBondAssignment } from '../services/bondAssignmentService'
import BondEmptyState from './bond/BondEmptyState'
import BondRiskBadge from './bond/BondRiskBadge'
import BondSectionCard from './bond/BondSectionCard'
import BondStatusBadge from './bond/BondStatusBadge'
import Button from './ui/Button'
import DataTable, { DataTableInner } from './ui/DataTable'
import {
  BOND_INTAKE_DECLINE_REASONS,
  acceptBondIntakeApplication,
  assignBondIntakeApplication,
  canAcceptBondIntake,
  canAssignBondIntake,
  canDeclineBondIntake,
  declineBondIntakeApplication,
  fetchBondConsultantOptions,
} from '../services/bondIntakeWorkflowService'

const CURRENCY = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

function formatCurrency(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) {
    return 'R 0'
  }

  return CURRENCY.format(amount)
}

function formatDate(value) {
  const parsed = new Date(value || 0)
  if (Number.isNaN(parsed.getTime())) {
    return '—'
  }

  return parsed.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getUpdatedAt(row) {
  return row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
}

function getDaysSinceUpdate(row) {
  const timestamp = new Date(getUpdatedAt(row) || 0).getTime()
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 0
  return Math.max(0, Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24)))
}

function stageLabelFromKey(key) {
  if (key === 'docs_requested') return 'Documents Required'
  if (key === 'docs_received') return 'Ready for Submission'
  if (key === 'application_submitted') return 'Submitted'
  if (key === 'bank_reviewing') return 'Bank Feedback'
  if (key === 'approval_granted') return 'Approved'
  if (key === 'declined') return 'Declined'
  return 'Awaiting Documents'
}

function getPropertyLabel(row) {
  if (getTransactionScopeForRow(row) === 'private') {
    return (
      row?.transaction?.property_description ||
      row?.transaction?.property_address_line_1 ||
      [row?.transaction?.suburb, row?.transaction?.city].filter(Boolean).join(', ') ||
      'Private property matter'
    )
  }

  const unitNumber = row?.unit?.unit_number ? `Unit ${row.unit.unit_number}` : 'Unit pending'
  const development = row?.development?.name || 'Development pending'
  return `${unitNumber}, ${development}`
}

function getBuyerLabel(row) {
  return row?.buyer?.name || row?.transaction?.buyer_name || 'Buyer pending'
}

function getMissingDocumentCount(row) {
  const explicit = Number(row?.documentSummary?.missingCount)
  if (Number.isFinite(explicit)) return explicit
  const totalRequired = Number(row?.documentSummary?.totalRequired || 0)
  const uploadedCount = Number(row?.documentSummary?.uploadedCount || 0)
  return Math.max(totalRequired - uploadedCount, 0)
}

function getRiskMeta(row) {
  const stage = getBondApplicationStage(row)
  const missingDocuments = getMissingDocumentCount(row)
  const daysSinceUpdate = getDaysSinceUpdate(row)

  if (stage === 'declined') {
    return { status: 'overdue', label: 'Blocked' }
  }

  if (missingDocuments > 0) {
    return { status: 'watch', label: `${missingDocuments} doc${missingDocuments === 1 ? '' : 's'} missing` }
  }

  if (daysSinceUpdate >= 8) {
    return { status: 'overdue', label: `${daysSinceUpdate}d stale` }
  }

  return { status: 'healthy', label: 'On track' }
}

function resolveBankLabel(row) {
  return row?.transaction?.bank || row?.transaction?.selected_bank || 'Bank not assigned'
}

function resolveBondValue(row) {
  return formatCurrency(
    row?.transaction?.bond_amount ??
      row?.transaction?.loan_amount ??
      row?.transaction?.sales_price ??
      row?.unit?.price ??
      0,
  )
}

function resolveTeamAssignment(row) {
  const assignment = resolveEffectiveBondAssignment(row?.transaction || {})
  const consultantName =
    assignment.primaryConsultantName ||
    row?.transaction?.primary_bond_consultant_name ||
    row?.transaction?.bond_originator ||
    'Unassigned consultant'
  const consultantDetail =
    assignment.primaryConsultantEmail ||
    row?.transaction?.assigned_bond_originator_email ||
    (consultantName === 'Unassigned consultant' ? 'Awaiting allocation' : 'Allocated consultant')
  const processorName =
    assignment.processorName ||
    row?.transaction?.assigned_bond_processor_name ||
    row?.transaction?.processor_name ||
    row?.transaction?.processor ||
    'Processor pending'
  const processorDetail =
    assignment.processorEmail ||
    row?.transaction?.assigned_bond_processor_email ||
    (processorName === 'Processor pending' ? 'Not assigned' : 'Processing desk')

  return {
    consultantName,
    consultantDetail,
    processorName,
    processorDetail,
    managerName: assignment.managerName || assignment.managerEmail || row?.transaction?.assigned_bond_manager_name || '',
    source: assignment.source || 'none',
  }
}

function progressLabel(status = '') {
  if (status === 'SUBMITTED') return 'Submitted'
  if (status === 'IN_PROGRESS') return 'In progress'
  return 'Not started'
}

function readinessToneClass(tone = '') {
  if (tone === 'success') return 'border-[#cfead8] bg-[#f6fcf8] text-[#226a45]'
  if (tone === 'warning') return 'border-[#f0dfb8] bg-[#fffaf0] text-[#8a5c00]'
  if (tone === 'danger') return 'border-[#efd6dc] bg-[#fff8fa] text-[#8f3747]'
  return 'border-[#dbe5f0] bg-[#f8fbff] text-[#516a83]'
}

function intakeFilterLabel(status = '') {
  if (status === BOND_INTAKE_STATUSES.AWAITING_BUYER_APPLICATION) return 'Awaiting Buyer'
  if (status === BOND_INTAKE_STATUSES.BUYER_IN_PROGRESS) return 'In Progress'
  if (status === BOND_INTAKE_STATUSES.AWAITING_DOCUMENTS) return 'Awaiting Docs'
  if (status === BOND_INTAKE_STATUSES.READY_FOR_REVIEW) return 'Ready For Review'
  return 'All'
}

function NewApplicationsEmptyState() {
  return (
    <BondSectionCard
      eyebrow="Intake"
      title="New Applications"
      description="Review incoming Bond and Hybrid buyer applications before they are accepted into the active finance book."
    >
      <div className="rounded-[20px] border border-dashed border-[#d8e2ec] bg-[#fbfdff] px-5 py-7 text-center">
        <p className="text-lg font-semibold text-[#142132]">No new bond applications</p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#60758d]">
          When buyers select Bond or Hybrid and complete their onboarding, they will appear here for review.
        </p>
        <a
          href="/bond/pipeline"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-[12px] border border-[#dbe5f0] bg-white px-4 text-sm font-semibold text-[#17324d] transition hover:border-[#c5d5e6]"
        >
          View all applications
        </a>
      </div>
    </BondSectionCard>
  )
}

function normalizeText(value) {
  return String(value || '').trim()
}

function getCurrentUserOption(currentUser = {}) {
  const profile = currentUser.profile || currentUser
  const email = normalizeText(currentUser.email || profile.email)
  const name =
    normalizeText(currentUser.name || currentUser.fullName || profile.fullName || profile.full_name) ||
    normalizeText([profile.first_name, profile.last_name].filter(Boolean).join(' ')) ||
    email ||
    'Current user'
  return {
    id: normalizeText(currentUser.userId || currentUser.id || profile.id),
    name,
    email,
    label: `${name}${email ? ` · ${email}` : ''}`,
  }
}

function getConsultantOptions(currentUser = {}, item = {}) {
  const current = getCurrentUserOption(currentUser)
  const existing = {
    id: normalizeText(item?.sourceRow?.transaction?.primary_bond_consultant_user_id),
    name: normalizeText(item?.sourceRow?.transaction?.bond_originator),
    email: normalizeText(item?.sourceRow?.transaction?.assigned_bond_originator_email),
  }
  const options = [current]
  if ((existing.id || existing.email) && existing.id !== current.id && existing.email !== current.email) {
    options.push({
      ...existing,
      label: `${existing.name || existing.email || 'Existing consultant'}${existing.email ? ` · ${existing.email}` : ''}`,
    })
  }
  return options.filter((option) => option.id || option.email)
}

function NewApplicationCard({ item, currentUser, onRowClick, onAction }) {
  const sourceRow = item.sourceRow || {}
  const openRow = () => onRowClick(sourceRow)
  const missingPreview = item.missingDocumentLabels?.length
    ? item.missingDocumentLabels.slice(0, 2).join(', ')
    : 'No missing documents'
  const userCanAccept = canAcceptBondIntake(currentUser, sourceRow)
  const userCanAssign = canAssignBondIntake(currentUser)
  const userCanDecline = canDeclineBondIntake(currentUser)
  const acceptDisabledTitle = item.canAccept
    ? 'Accept this application.'
    : 'Buyer application and documents must be complete before acceptance.'

  return (
    <article className="rounded-[20px] border border-[#dbe5f0] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.035)]">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.85fr)_minmax(230px,0.65fr)] xl:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[#315f8c]" />
            <p className="truncate text-base font-semibold text-[#142132]">{item.buyerName}</p>
            <BondStatusBadge label={item.financeType} status="submitted" tone="blue" />
          </div>
          <p className="mt-2 text-sm font-semibold text-[#31445a]">{item.propertyLabel}</p>
          <p className="mt-1 text-sm text-[#60758d]">{item.developmentName} · {item.agentName}</p>
          <p className="mt-2 text-xs text-[#7a8fa5]">Preferred originator: {item.preferredOriginatorName}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Application</p>
            <p className="mt-2 text-sm font-semibold text-[#142132]">{progressLabel(item.bondApplicationStatus)}</p>
            <p className="mt-1 text-xs text-[#60758d]">{item.bondApplicationSubmittedAt ? formatDate(item.bondApplicationSubmittedAt) : item.ageLabel}</p>
          </div>
          <div className="rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Documents</p>
            <p className="mt-2 text-sm font-semibold text-[#142132]">
              {item.documentUploadedCount} / {item.documentRequiredCount} docs submitted
            </p>
            <p className="mt-1 truncate text-xs text-[#60758d]">{item.documentMissingCount} missing · {missingPreview}</p>
          </div>
          <div className="rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-3 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Finance Readiness</p>
              <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${readinessToneClass(item.financeReadinessTone)}`}>
                {item.financeReadinessScore}% · {item.financeReadinessLabel}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold text-[#142132]">
              {formatCurrency(item.affordabilityEstimate?.estimatedPurchaseRangeMin)} - {formatCurrency(item.affordabilityEstimate?.estimatedPurchaseRangeMax)}
            </p>
            <p className="mt-1 truncate text-xs text-[#60758d]">
              {item.financeRiskFlags?.[0] || item.financeNextRecommendedAction || 'Buyer readiness inputs pending'}
            </p>
          </div>
          <div className="rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-3 sm:col-span-2">
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Approval Confidence</p>
                <p className="mt-2 text-sm font-semibold text-[#142132]">{item.approvalConfidence?.score || 0}% · {item.approvalConfidence?.probabilityBand || 'Insufficient Data'}</p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Risk Score</p>
                <p className="mt-2 text-sm font-semibold text-[#142132]">{item.operationalRisk?.riskScore || 0}% · {item.operationalRisk?.riskLevel || 'Low'}</p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Velocity</p>
                <p className="mt-2 text-sm font-semibold text-[#142132]">{item.velocity?.velocityScore || 0}% · {item.velocity?.expectedApprovalDays || 0}d est.</p>
              </div>
            </div>
            <p className="mt-2 truncate text-xs text-[#60758d]">
              {item.financeInsights?.conversionOpportunities?.[0] || item.financeInsights?.operationalWarnings?.[0] || item.financeInsights?.recommendations?.[0] || 'No predictive warnings yet.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 xl:items-end">
          <BondStatusBadge label={item.intakeLabel} status={item.intakeStatus} tone={item.intakeUiTone} className="justify-center" />
          <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
            <button
              type="button"
              onClick={openRow}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-[12px] border border-[#dbe5f0] bg-[#f8fbff] px-3 text-sm font-semibold text-[#17324d] transition hover:border-[#c5d5e6]"
            >
              View
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              disabled
              className="inline-flex h-9 items-center justify-center gap-1 rounded-[12px] border border-[#dbe5f0] bg-white px-3 text-sm font-semibold text-[#8aa0b6] opacity-70"
            >
              <Bell size={14} />
              Remind Buyer
            </button>
            <button
              type="button"
              disabled
              className="inline-flex h-9 items-center justify-center gap-1 rounded-[12px] border border-[#dbe5f0] bg-white px-3 text-sm font-semibold text-[#8aa0b6] opacity-70"
            >
              <FilePlus2 size={14} />
              Request Documents
            </button>
            <button
              type="button"
              disabled={!userCanAccept}
              title={userCanAccept ? 'Accept this application.' : acceptDisabledTitle}
              onClick={() => onAction('accept', item)}
              className="inline-flex h-9 items-center justify-center rounded-[12px] bg-[#143250] px-3 text-sm font-semibold text-white transition enabled:hover:bg-[#173a5e] disabled:cursor-not-allowed disabled:bg-[#c7d3df]"
            >
              <CheckCircle2 size={14} className="mr-1" />
              Accept
            </button>
            {userCanAssign ? (
              <button
                type="button"
                disabled={item.intakeStatus !== BOND_INTAKE_STATUSES.READY_FOR_REVIEW}
                title={item.intakeStatus === BOND_INTAKE_STATUSES.READY_FOR_REVIEW ? 'Assign this application.' : 'Application must be ready for review before assignment.'}
                onClick={() => onAction('assign', item)}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-[12px] border border-[#dbe5f0] bg-white px-3 text-sm font-semibold text-[#17324d] transition enabled:hover:border-[#c5d5e6] disabled:cursor-not-allowed disabled:text-[#8aa0b6] disabled:opacity-70"
              >
                <UserPlus size={14} />
                Assign
              </button>
            ) : null}
            {userCanDecline ? (
              <button
                type="button"
                onClick={() => onAction('decline', item)}
                className="inline-flex h-9 items-center justify-center gap-1 rounded-[12px] border border-[#efd6dc] bg-[#fff8fa] px-3 text-sm font-semibold text-[#8f3747] transition hover:border-[#e7bdc7]"
              >
                <XCircle size={14} />
                Decline
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  )
}

function IntakeActionModal({ action = '', item = null, currentUser = {}, busy = false, onClose, onSubmit }) {
  const [assigneeKey, setAssigneeKey] = useState('0')
  const [note, setNote] = useState('')
  const [reason, setReason] = useState(BOND_INTAKE_DECLINE_REASONS[0])
  const [remoteConsultants, setRemoteConsultants] = useState([])
  const fallbackConsultants = useMemo(() => getConsultantOptions(currentUser, item), [currentUser, item])
  const consultantOptions = remoteConsultants.length ? remoteConsultants : fallbackConsultants
  const selectedAssignee = consultantOptions[Number(assigneeKey)] || consultantOptions[0] || getCurrentUserOption(currentUser)
  const isDecline = action === 'decline'
  const title = action === 'assign' ? 'Assign application' : isDecline ? 'Decline application' : 'Accept application'
  const description = action === 'assign'
    ? 'Choose the consultant who should own this bond intake file.'
    : isDecline
      ? 'Decline this intake without deleting the transaction.'
      : 'Accept this ready intake file and move it into the active bond queue.'

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      setAssigneeKey('0')
      setRemoteConsultants([])
    })
    if (!item || action === 'decline') return () => {
      active = false
    }

    fetchBondConsultantOptions({ user: currentUser }).then((options) => {
      if (!active) return
      setRemoteConsultants(options)
    })

    return () => {
      active = false
    }
  }, [action, currentUser, item])

  if (!item) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#102033]/35 px-4 py-6">
      <div className="w-full max-w-xl rounded-[24px] border border-[#dbe5f0] bg-white p-5 shadow-[0_28px_80px_rgba(15,23,42,0.2)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7d93aa]">Bond Intake</p>
            <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-[#142132]">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-[#60758d]">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-[#dbe5f0] px-3 py-1 text-sm font-semibold text-[#60758d] disabled:opacity-60"
          >
            Close
          </button>
        </div>

        <div className="mt-5 rounded-[18px] border border-[#edf2f7] bg-[#fbfdff] p-4">
          <p className="text-sm font-semibold text-[#142132]">{item.buyerName}</p>
          <p className="mt-1 text-sm text-[#60758d]">{item.propertyLabel} · {item.developmentName}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7d93aa]">{item.intakeLabel}</p>
        </div>

        {!isDecline ? (
          <label className="mt-5 block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Consultant</span>
            <select
              value={assigneeKey}
              onChange={(event) => setAssigneeKey(event.target.value)}
              className="mt-2 h-11 w-full rounded-[14px] border border-[#dbe5f0] bg-white px-3 text-sm font-semibold text-[#142132] outline-none focus:border-[#9bb6d1]"
            >
              {consultantOptions.map((option, index) => (
                <option key={`${option.id || option.email || index}`} value={String(index)}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="mt-5 block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Reason</span>
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-2 h-11 w-full rounded-[14px] border border-[#dbe5f0] bg-white px-3 text-sm font-semibold text-[#142132] outline-none focus:border-[#9bb6d1]"
            >
              {BOND_INTAKE_DECLINE_REASONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        )}

        <label className="mt-4 block">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7d93aa]">Optional note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className="mt-2 w-full rounded-[14px] border border-[#dbe5f0] bg-white px-3 py-2 text-sm text-[#142132] outline-none focus:border-[#9bb6d1]"
            placeholder={isDecline ? 'Add context for the decline reason.' : 'Add an internal assignment note.'}
          />
        </label>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-10 items-center justify-center rounded-[12px] border border-[#dbe5f0] bg-white px-4 text-sm font-semibold text-[#17324d] disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || (isDecline && !reason)}
            onClick={() => onSubmit({ assignee: selectedAssignee, reason, note })}
            className={`inline-flex h-10 items-center justify-center rounded-[12px] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-65 ${
              isDecline ? 'bg-[#8f3747] hover:bg-[#79303d]' : 'bg-[#143250] hover:bg-[#173a5e]'
            }`}
          >
            {busy ? 'Saving…' : isDecline ? 'Decline application' : action === 'assign' ? 'Assign application' : 'Accept application'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NewApplicationsInbox({ rows = [], onRowClick, currentUser = {}, onActionComplete }) {
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortMode, setSortMode] = useState('highest_risk')
  const [feedback, setFeedback] = useState(null)
  const [modalState, setModalState] = useState({ action: '', item: null })
  const [busy, setBusy] = useState(false)
  const [dismissedIds, setDismissedIds] = useState([])
  const items = useMemo(() => rows.map(buildBondNewApplicationViewModel), [rows])
  const activeItems = items.filter((item) => !dismissedIds.includes(item.id))
  const visibleItems = (statusFilter === 'all' ? activeItems : activeItems.filter((item) => item.intakeStatus === statusFilter))
    .slice()
    .sort((left, right) => {
      if (sortMode === 'highest_confidence') return (right.approvalConfidence?.score || 0) - (left.approvalConfidence?.score || 0)
      if (sortMode === 'fastest_ready') return (right.velocity?.velocityScore || 0) - (left.velocity?.velocityScore || 0)
      if (sortMode === 'aging') return String(left.ageLabel || '').localeCompare(String(right.ageLabel || ''))
      return (right.operationalRisk?.riskScore || 0) - (left.operationalRisk?.riskScore || 0)
    })
  const filters = [
    { key: 'all', label: `All (${activeItems.length})` },
    ...[
      BOND_INTAKE_STATUSES.AWAITING_BUYER_APPLICATION,
      BOND_INTAKE_STATUSES.BUYER_IN_PROGRESS,
      BOND_INTAKE_STATUSES.AWAITING_DOCUMENTS,
      BOND_INTAKE_STATUSES.READY_FOR_REVIEW,
    ].map((status) => ({
      key: status,
      label: `${intakeFilterLabel(status)} (${activeItems.filter((item) => item.intakeStatus === status).length})`,
    })),
  ]

  async function submitAction(payload = {}) {
    if (!modalState.item || busy) return
    setBusy(true)
    setFeedback(null)
    try {
      const input = {
        row: modalState.item.sourceRow,
        transactionId: modalState.item.transactionId,
        user: currentUser,
        ...payload,
      }
      const result =
        modalState.action === 'assign'
          ? await assignBondIntakeApplication(input)
          : modalState.action === 'decline'
            ? await declineBondIntakeApplication(input)
            : await acceptBondIntakeApplication(input)

      setDismissedIds((previous) => [...new Set([...previous, modalState.item.id])])
      setModalState({ action: '', item: null })
      setFeedback({ tone: 'success', message: result?.message || 'Application updated successfully.' })
      if (typeof onActionComplete === 'function') {
        await onActionComplete()
      }
    } catch (error) {
      const rawMessage = error?.message || 'Unable to update this application.'
      const safeMessage = /row-level security|permission denied/i.test(rawMessage)
        ? 'You do not have permission to update this application.'
        : rawMessage
      setFeedback({ tone: 'danger', message: safeMessage })
    } finally {
      setBusy(false)
    }
  }

  if (!items.length) {
    return <NewApplicationsEmptyState />
  }

  return (
    <BondSectionCard
      eyebrow="Intake"
      title="New Applications"
      description="Incoming Bond and Hybrid applications waiting for buyer completion, document readiness, or review."
      action={<span className="rounded-full border border-[#dbe5f0] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#516a83]">{visibleItems.length} new</span>}
    >
      {feedback ? (
        <div
          className={`mb-4 rounded-[14px] border px-4 py-3 text-sm font-semibold ${
            feedback.tone === 'danger'
              ? 'border-[#efd6dc] bg-[#fff8fa] text-[#8f3747]'
              : 'border-[#d5e9dc] bg-[#f7fcf8] text-[#2f7653]'
          }`}
          role="status"
        >
          {feedback.message}
        </div>
      ) : null}
      <div className="mb-5 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => setStatusFilter(filter.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === filter.key
                ? 'border-[#143250] bg-[#143250] text-white'
                : 'border-[#dbe5f0] bg-[#f8fbff] text-[#516a83] hover:border-[#c5d5e6]'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {[
          { key: 'highest_risk', label: 'Highest risk' },
          { key: 'highest_confidence', label: 'Highest confidence' },
          { key: 'fastest_ready', label: 'Fastest ready' },
          { key: 'aging', label: 'Aging applications' },
        ].map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setSortMode(option.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              sortMode === option.key
                ? 'border-[#315f8c] bg-[#e8f0f8] text-[#17324d]'
                : 'border-[#dbe5f0] bg-white text-[#516a83] hover:border-[#c5d5e6]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mb-5 rounded-[14px] border border-[#dbe5f0] bg-[#f8fbff] px-4 py-3 text-xs leading-5 text-[#60758d]">
        {FINANCE_READINESS_DISCLAIMER}
      </p>
      <div className="space-y-3">
        {visibleItems.length ? visibleItems.map((item) => (
          <NewApplicationCard
            key={item.id}
            item={item}
            currentUser={currentUser}
            onRowClick={onRowClick}
            onAction={(action, actionItem) => setModalState({ action, item: actionItem })}
          />
        )) : (
          <BondEmptyState
            compact
            title="No applications in this filter"
            description="Try a different intake status filter."
          />
        )}
      </div>
      <IntakeActionModal
        action={modalState.action}
        item={modalState.item}
        currentUser={currentUser}
        busy={busy}
        onClose={() => (busy ? null : setModalState({ action: '', item: null }))}
        onSubmit={submitAction}
      />
    </BondSectionCard>
  )
}

function ApplicationRow({ row, onRowClick, index = 0 }) {
  const stageKey = getBondApplicationStage(row)
  const updatedAt = getUpdatedAt(row)
  const risk = getRiskMeta(row)
  const financeReadiness = getFinanceReadinessSummary(row)
  const team = resolveTeamAssignment(row)
  const canOpenRow = Boolean(row?.unit?.id || row?.transaction?.id)
  const buyerLabel = getBuyerLabel(row)
  const propertyLabel = getPropertyLabel(row)
  const readinessScore = financeReadiness.readinessScore?.score || 0
  const readinessLabel = financeReadiness.readinessScore?.label || 'Incomplete'

  const openRow = () => {
    if (!canOpenRow) return
    onRowClick(row)
  }

  return (
    <tr
      className={`${canOpenRow ? 'ui-data-row-clickable' : ''} ${index % 2 === 0 ? 'bond-pipeline-row-even' : 'bond-pipeline-row-odd'}`.trim()}
      onClick={openRow}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && canOpenRow) {
          event.preventDefault()
          openRow()
        }
      }}
      tabIndex={canOpenRow ? 0 : -1}
      role={canOpenRow ? 'button' : undefined}
    >
      <td className="bond-pipeline-sticky-first" data-label="Application / Client">
        <div className="transaction-list-cell">
          <strong className="transaction-cell-primary" title={buyerLabel}>{buyerLabel}</strong>
          <small className="transaction-cell-secondary" title={row?.buyer?.email || row?.buyer?.phone || ''}>
            {row?.buyer?.email || row?.buyer?.phone || 'Client details pending'}
          </small>
        </div>
      </td>
      <td data-label="Property / Source">
        <div className="transaction-list-cell">
          <strong className="transaction-cell-primary" title={propertyLabel}>{propertyLabel}</strong>
          <small className="transaction-cell-secondary" title={row?.development?.suburb || row?.transaction?.suburb || row?.transaction?.city || ''}>
            {row?.development?.suburb || row?.transaction?.suburb || row?.transaction?.city || 'Property context loading'}
          </small>
        </div>
      </td>
      <td data-label="Allocated Consultant">
        <div className="transaction-list-cell">
          <strong className="transaction-cell-primary" title={team.consultantName}>{team.consultantName}</strong>
          <small className="transaction-cell-secondary" title={team.consultantDetail}>{team.consultantDetail}</small>
          {team.managerName ? <small className="transaction-cell-secondary" title={team.managerName}>Manager: {team.managerName}</small> : null}
        </div>
      </td>
      <td data-label="Processor">
        <div className="transaction-list-cell">
          <strong className="transaction-cell-primary" title={team.processorName}>{team.processorName}</strong>
          <small className="transaction-cell-secondary" title={team.processorDetail}>{team.processorDetail}</small>
        </div>
      </td>
      <td data-label="Bank / Value">
        <div className="transaction-list-cell">
          <strong className="transaction-cell-primary" title={resolveBankLabel(row)}>{resolveBankLabel(row)}</strong>
          <small className="transaction-cell-secondary">{resolveBondValue(row)}</small>
        </div>
      </td>
      <td data-label="Stage">
        <BondStatusBadge status={stageKey} label={stageLabelFromKey(stageKey)} />
      </td>
      <td data-label="Readiness / Docs">
        <div className="transaction-progress-cell">
          <div className="transaction-progress-summary">
            <strong>{readinessScore}%</strong>
            <small>{readinessLabel}</small>
          </div>
          <div className="transaction-progress-track" aria-hidden="true">
            <span style={{ width: `${Math.max(readinessScore > 0 ? 8 : 0, readinessScore)}%` }} />
          </div>
          <span className={`transaction-workflow-chip ${readinessToneClass(financeReadiness.readinessScore?.tone)}`}>
            {getMissingDocumentCount(row)} docs missing
          </span>
        </div>
      </td>
      <td data-label="Last Activity">
        <span className="transaction-cell-secondary">{formatDate(updatedAt)}</span>
      </td>
      <td data-label="Risk">
        <BondRiskBadge status={risk.status} label={risk.label} />
      </td>
      <td data-label="Action" onClick={(event) => event.stopPropagation()}>
        <div className="transaction-row-actions">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="table-action-button transaction-row-action-primary"
            disabled={!canOpenRow}
            onClick={openRow}
          >
            <ArrowUpRight size={14} />
            Open
          </Button>
        </div>
      </td>
    </tr>
  )
}

function BondApplicationsTable({
  rows = [],
  onRowClick,
  title = 'Applications Queue',
  description = 'Manage incoming or incomplete applications before they move into the active applications workspace.',
  emptyTitle = 'No applications found',
  emptyDescription = 'When finance applications match this queue, they will appear here.',
  queue = 'all',
  currentUser = {},
  onIntakeActionComplete,
}) {
  if (queue === BOND_OPERATIONAL_QUEUE_KEYS.NEW_APPLICATIONS) {
    return (
      <NewApplicationsInbox
        rows={rows}
        onRowClick={onRowClick}
        currentUser={currentUser}
        onActionComplete={onIntakeActionComplete}
      />
    )
  }

  return (
    <DataTable
      title={title}
      copy={description}
      className="bond-applications-panel bond-regional-pipeline-panel"
      actions={<span className="rounded-full border border-[#dbe5f0] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#516a83]">{rows.length} applications</span>}
    >
      <DataTableInner className="bond-applications-table bond-regional-pipeline-table">
        <thead>
          <tr>
            <th className="bond-pipeline-sticky-first">Application / Client</th>
            <th>Property / Source</th>
            <th>Allocated Consultant</th>
            <th>Processor</th>
            <th>Bank / Value</th>
            <th>Stage</th>
            <th>Readiness / Docs</th>
            <th>Last Activity</th>
            <th>Risk</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <ApplicationRow
              key={row?.transaction?.id || row?.unit?.id || `bond-row-${row?.buyer?.id || 'buyer'}`}
              row={row}
              index={index}
              onRowClick={onRowClick}
            />
          ))}

          {rows.length === 0 ? (
            <tr>
              <td colSpan={10}>
                <BondEmptyState
                  compact
                  title={emptyTitle}
                  description={emptyDescription}
                />
              </td>
            </tr>
          ) : null}
        </tbody>
      </DataTableInner>
      <p className="border-t border-[#edf2f7] px-4 py-3 text-xs leading-5 text-[#60758d]">
        {FINANCE_READINESS_DISCLAIMER}
      </p>
    </DataTable>
  )
}

export default BondApplicationsTable
