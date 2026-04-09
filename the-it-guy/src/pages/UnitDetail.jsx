import { Component, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ExternalLink, Link2, Printer, Building2, CircleDollarSign, Clock3, UserRound } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AlterationRequestsPanel from '../components/AlterationRequestsPanel'
import AttorneyCloseoutPanel from '../components/AttorneyCloseoutPanel'
import ClientIssuesPanel from '../components/ClientIssuesPanel'
import DocumentsPanel from '../components/DocumentsPanel'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ProgressTimeline from '../components/ProgressTimeline'
import SharedTransactionShell from '../components/SharedTransactionShell'
import StageAgingChip from '../components/StageAgingChip'
import SubprocessWorkflowPanel from '../components/SubprocessWorkflowPanel'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  FINANCE_MANAGED_BY_OPTIONS,
  ONBOARDING_STATUSES,
  TRANSACTION_ROLE_LABELS,
  addTransactionDiscussionComment,
  completeTransactionSubprocess,
  createWorkspaceAlteration,
  deleteTransactionEverywhere,
  fetchUnitDetail,
  parseWorkflowStepComment,
  getOrCreateTransactionOnboarding,
  saveTransaction,
  saveTransactionClientInformation,
  signOffClientIssue,
  updateTransactionMainStage,
  updateDocumentClientVisibility,
  updateTransactionRequiredDocumentStatus,
  updateTransactionSubprocessStep,
  uploadDocument,
} from '../lib/api'
import { MAIN_PROCESS_STAGES, MAIN_STAGE_LABELS } from '../lib/stages'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { getPurchaserTypeOptions, getPurchaserTypeLabel, normalizePurchaserType } from '../lib/purchaserPersonas'
import { normalizeFinanceType } from '../core/transactions/financeType'
import { buildTransactionStageProgressModel } from '../core/transactions/stageProgressEngine'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const PANEL_SHELL = 'rounded-[28px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]'
const PANEL_COMPACT = 'rounded-[24px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]'
const WORKSPACE_MENU_IDS = ['overview', 'onboarding', 'documents', 'alterations', 'snags']
const FINANCE_TYPE_SELECT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bond', label: 'Bond' },
  { value: 'combination', label: 'Hybrid' },
]
const ONBOARDING_MODE_OPTIONS = [
  { value: 'client_portal', label: 'Client Portal' },
  { value: 'manual', label: 'Manual (Internal)' },
]
const CLIENT_INFO_SECTION_KEYS = ['identity', 'employment', 'purchase_structure']
const CLIENT_INFO_SECTION_LABELS = {
  identity: 'Identity',
  employment: 'Employment',
  purchase_structure: 'Purchase Structure',
}
const DEFAULT_SECTION_COMPLETION = {
  identity: false,
  employment: false,
  purchase_structure: false,
}

function normalizeOnboardingMode(value) {
  return String(value || '').trim().toLowerCase() === 'manual' ? 'manual' : 'client_portal'
}

function parseSectionCompletion(rawValue) {
  if (!rawValue) {
    return { ...DEFAULT_SECTION_COMPLETION }
  }

  let parsed = rawValue
  if (typeof rawValue === 'string') {
    try {
      parsed = JSON.parse(rawValue)
    } catch {
      parsed = {}
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ...DEFAULT_SECTION_COMPLETION }
  }

  return CLIENT_INFO_SECTION_KEYS.reduce((accumulator, key) => {
    accumulator[key] = Boolean(parsed[key])
    return accumulator
  }, {})
}

function normalizeDerivedDocumentStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'verified') return 'verified'
  if (normalized === 'uploaded') return 'uploaded'
  return 'missing'
}

function mapRequirementStatusToUi(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'accepted') return 'verified'
  if (normalized === 'uploaded' || normalized === 'under_review') return 'uploaded'
  return 'missing'
}

function mapUiStatusToRequirement(status) {
  const normalized = normalizeDerivedDocumentStatus(status)
  if (normalized === 'verified') return 'accepted'
  if (normalized === 'uploaded') return 'uploaded'
  return 'missing'
}

function normalizeDocumentMatcher(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
}

function getRequiredDocs(purchaserType, financeType) {
  const normalizedPurchaserType = normalizePurchaserType(purchaserType || 'individual')
  const normalizedFinanceType = normalizeFinanceType(financeType || 'cash')

  const individualCash = [
    { key: 'id_document', label: 'South African ID document or passport', matchers: ['id', 'passport'] },
    { key: 'proof_of_address', label: 'Proof of address', matchers: ['proof of address'] },
    { key: 'source_of_funds', label: 'Source of funds / proof of income', matchers: ['source of funds', 'proof of income', 'income'] },
  ]
  const individualBond = [
    { key: 'id_document', label: 'South African ID document or passport', matchers: ['id', 'passport'] },
    { key: 'proof_of_address', label: 'Proof of address', matchers: ['proof of address'] },
    { key: 'payslips', label: '3 months payslips', matchers: ['payslip'] },
    { key: 'bank_statements', label: '3 months bank statements', matchers: ['bank statement'] },
    { key: 'employment_confirmation', label: 'Employment confirmation', matchers: ['employment', 'employer'] },
  ]
  const companyDocs = [
    { key: 'company_registration', label: 'Company registration documents', matchers: ['company registration', 'cipc'] },
    { key: 'director_ids', label: 'Director ID documents', matchers: ['director id', 'director'] },
    { key: 'company_resolution', label: 'Company resolution letter', matchers: ['resolution'] },
    { key: 'company_bank_statements', label: 'Company bank statements', matchers: ['company bank statement', 'bank statement'] },
  ]
  const trustDocs = [
    { key: 'trust_deed', label: 'Trust deed', matchers: ['trust deed'] },
    { key: 'trustee_ids', label: 'Trustee ID documents', matchers: ['trustee id', 'trustee'] },
    { key: 'trust_resolution', label: 'Trust resolution', matchers: ['resolution'] },
    { key: 'proof_of_address', label: 'Proof of address', matchers: ['proof of address'] },
  ]
  const foreignDocs = [
    { key: 'passport', label: 'Passport document', matchers: ['passport'] },
    { key: 'proof_of_address', label: 'Proof of address', matchers: ['proof of address'] },
    { key: 'source_of_funds', label: 'Source of funds / proof of income', matchers: ['source of funds', 'proof of income', 'income'] },
  ]

  if (normalizedPurchaserType === 'company') {
    return companyDocs
  }
  if (normalizedPurchaserType === 'trust') {
    return trustDocs
  }
  if (normalizedPurchaserType === 'foreign_purchaser') {
    if (normalizedFinanceType === 'bond' || normalizedFinanceType === 'combination') {
      return [...foreignDocs, ...individualBond.filter((item) => item.key !== 'id_document')]
    }
    return foreignDocs
  }
  if (normalizedFinanceType === 'bond' || normalizedFinanceType === 'combination') {
    return individualBond
  }
  return individualCash
}

function buildDynamicRequiredDocuments({ purchaserType, financeType, requiredChecklist = [], statusOverrides = {} }) {
  const rules = getRequiredDocs(purchaserType, financeType)
  const normalizedChecklist = (requiredChecklist || []).map((item) => ({
    ...item,
    keyToken: normalizeDocumentMatcher(item.key),
    labelToken: normalizeDocumentMatcher(item.label),
  }))

  return rules.map((rule) => {
    const normalizedMatchers = (rule.matchers || []).map((matcher) => normalizeDocumentMatcher(matcher))
    const matchedRequirement = normalizedChecklist.find((item) =>
      normalizedMatchers.some((matcher) => item.keyToken.includes(matcher) || item.labelToken.includes(matcher)),
    )
    const overrideStatus = statusOverrides[rule.key]
    const status = overrideStatus
      ? normalizeDerivedDocumentStatus(overrideStatus)
      : mapRequirementStatusToUi(matchedRequirement?.status)

    return {
      ...rule,
      requirementKey: matchedRequirement?.key || null,
      matchedDocument: matchedRequirement?.matchedDocument || null,
      status,
    }
  })
}

function getSuggestedNextActions({
  onboardingMode,
  onboardingStatus,
  financeType,
  missingRequiredCount = 0,
} = {}) {
  if (onboardingMode !== 'manual' && (onboardingStatus === 'Not Started' || onboardingStatus === 'In Progress')) {
    return ['Send onboarding link']
  }

  if (missingRequiredCount > 0) {
    return ['Waiting for FICA documents', `Collect ${missingRequiredCount} missing required document${missingRequiredCount === 1 ? '' : 's'}`]
  }

  if (financeType === 'bond' || financeType === 'combination') {
    return ['Awaiting bond approval', 'Confirm lender status update']
  }

  return ['Ready for transfer preparation']
}

function WorkspacePanel({ title, copy, actions = null, className = '', children }) {
  return (
    <section className={`${PANEL_COMPACT} ${className}`.trim()}>
      {title || copy || actions ? (
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            {title ? <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">{title}</h3> : null}
            {copy ? <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">{copy}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

class TransactionWorkspaceBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null
    }

    return this.props.children
  }
}

function formatDate(dateLike) {
  if (!dateLike) {
    return 'Not set'
  }

  const date = new Date(dateLike)
  if (Number.isNaN(date.getTime())) {
    return 'Not set'
  }

  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(dateLike) {
  if (!dateLike) {
    return 'Not set'
  }

  const date = new Date(dateLike)
  if (Number.isNaN(date.getTime())) {
    return 'Not set'
  }

  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resolveCommentAuthorName(comment, { buyer, transactionParticipants } = {}) {
  const rawName = String(comment?.authorName || '').trim()
  const normalizedRawName = rawName.toLowerCase()

  if (rawName && !normalizedRawName.includes('@theitguy.local')) {
    return rawName
  }

  const matchedParticipant = (transactionParticipants || []).find((item) => {
    const participantEmail = String(item?.participantEmail || item?.email || '').trim().toLowerCase()
    return participantEmail && participantEmail === normalizedRawName
  })

  if (matchedParticipant?.participantName) {
    return matchedParticipant.participantName
  }

  if (comment?.authorRole === 'client' && buyer?.name) {
    return buyer.name
  }

  if (buyer?.name) {
    return buyer.name
  }

  return rawName || 'Participant'
}

function sanitizeCommentBody(commentBody, comment, context = {}) {
  const rawBody = String(commentBody || '').trim()
  if (!rawBody) {
    return 'No detail provided.'
  }

  const authorName = resolveCommentAuthorName(comment, context)
  const rawAuthorName = String(comment?.authorName || '').trim()

  if (rawAuthorName && rawAuthorName.toLowerCase().includes('@theitguy.local')) {
    return rawBody.replaceAll(rawAuthorName, authorName)
  }

  return rawBody
}

function toTitleLabel(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function formatOnboardingFieldValue(value) {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => formatOnboardingFieldValue(entry))
      .filter(Boolean)
      .join(', ')
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, entryValue]) => `${toTitleLabel(key)}: ${formatOnboardingFieldValue(entryValue)}`)
      .join(' | ')
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  return String(value)
}

function isOnboardingMetaKey(key) {
  return String(key || '').startsWith('__bridge_')
}

function getOnboardingFieldGroupLabel(key) {
  const normalized = String(key || '').toLowerCase()

  if (
    normalized.includes('finance') ||
    normalized.includes('bond') ||
    normalized.includes('deposit') ||
    normalized.includes('fund') ||
    normalized.includes('bank') ||
    normalized.includes('loan') ||
    normalized.includes('reservation')
  ) {
    return 'Finance'
  }

  if (
    normalized.includes('employment') ||
    normalized.includes('employer') ||
    normalized.includes('income') ||
    normalized.includes('occupation') ||
    normalized.includes('salary') ||
    normalized.includes('commission') ||
    normalized.includes('retire') ||
    normalized.includes('contract')
  ) {
    return 'Employment & Income'
  }

  if (
    normalized.includes('spouse') ||
    normalized.includes('marriage') ||
    normalized.includes('marital') ||
    normalized.includes('trust') ||
    normalized.includes('trustee') ||
    normalized.includes('director') ||
    normalized.includes('company') ||
    normalized.includes('representative') ||
    normalized.includes('signatory')
  ) {
    return 'Purchasing Structure'
  }

  if (
    normalized.includes('address') ||
    normalized.includes('postal') ||
    normalized.includes('city') ||
    normalized.includes('province') ||
    normalized.includes('nationality') ||
    normalized.includes('residency') ||
    normalized.includes('tax') ||
    normalized.includes('identity') ||
    normalized.includes('passport')
  ) {
    return 'Identity & Address'
  }

  return 'Buyer Details'
}

function groupOnboardingFieldEntries(entries = []) {
  return entries.reduce((groups, entry) => {
    const [key] = entry
    const group = getOnboardingFieldGroupLabel(key)
    if (!groups[group]) {
      groups[group] = []
    }
    groups[group].push(entry)
    return groups
  }, {})
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getProgressStageState(stageKey, currentStage) {
  const currentIndex = MAIN_PROCESS_STAGES.indexOf(currentStage)
  const stageIndex = MAIN_PROCESS_STAGES.indexOf(stageKey)

  if (stageIndex < currentIndex) {
    return 'complete'
  }

  if (stageIndex === currentIndex) {
    return 'current'
  }

  return 'upcoming'
}

function buildPrintProgressMarkup(currentStage) {
  return MAIN_PROCESS_STAGES.map((stageKey, index) => {
    const state = getProgressStageState(stageKey, currentStage)
    const stageName = MAIN_STAGE_LABELS[stageKey] || stageKey
    return `
      <div class="onboarding-print-progress-node ${state}">
        <div class="onboarding-print-progress-top">
          <span class="dot"></span>
          ${index < MAIN_PROCESS_STAGES.length - 1 ? '<span class="line"></span>' : ''}
        </div>
        <div class="onboarding-print-progress-copy">
          <strong>${escapeHtml(stageName)}</strong>
          <span>${escapeHtml(state === 'complete' ? 'Complete' : state === 'current' ? 'Current' : 'Upcoming')}</span>
        </div>
      </div>
    `
  }).join('')
}

function chunkArray(items = [], size = 1) {
  const safeSize = Math.max(1, Math.trunc(size || 1))
  const chunks = []
  for (let index = 0; index < items.length; index += safeSize) {
    chunks.push(items.slice(index, index + safeSize))
  }
  return chunks
}

function getStageSymbol(state) {
  if (state === 'complete') return '✓'
  if (state === 'current') return '●'
  return '○'
}

function getWorkflowSymbol(status) {
  if (status === 'completed') return '✓'
  if (status === 'in_progress' || status === 'blocked') return '●'
  return '○'
}

function getHealthSummary({ progressPercent = 0, totalSteps = 0, completedSteps = 0, currentStageLabel = 'Available' } = {}) {
  const normalizedProgress = Number.isFinite(Number(progressPercent)) ? Number(progressPercent) : 0
  const completionRatio = totalSteps > 0 ? completedSteps / totalSteps : 1

  if (totalSteps > 0 && completedSteps >= totalSteps) {
    return {
      title: 'Status: Healthy',
      detail: `All workflows complete. Transaction is at ${currentStageLabel}.`,
    }
  }

  if (completionRatio >= 0.75 || normalizedProgress >= 75) {
    return {
      title: 'Status: Stable',
      detail: 'Most workflow steps are complete. Focus on final outstanding actions.',
    }
  }

  if (completionRatio >= 0.4 || normalizedProgress >= 40) {
    return {
      title: 'Status: In Progress',
      detail: 'Core workflow actions are underway, with several pending completion items.',
    }
  }

  return {
    title: 'Status: At Risk',
    detail: 'Limited workflow completion detected. Immediate operational follow-through is required.',
  }
}

function buildTransactionPrintCommentsMarkup(comments, { buyer, transactionParticipants } = {}) {
  if (!(comments || []).length) {
    return '<div class="tx-print-empty">No updates yet. Your team will post progress here as the transaction moves forward.</div>'
  }

  return comments
    .map((comment) => {
      const author = resolveCommentAuthorName(comment, { buyer, transactionParticipants })
      const body = sanitizeCommentBody(comment.commentBody || comment.commentText, comment, {
        buyer,
        transactionParticipants,
      })
      const roleLabel = comment.authorRoleLabel || TRANSACTION_ROLE_LABELS[comment.authorRole] || 'Participant'
      return `
        <article class="tx-print-comment">
          <header class="tx-print-comment-head">
            <div>
              <strong>${escapeHtml(author)}</strong>
              <span>${escapeHtml(roleLabel)}</span>
            </div>
            <time>${escapeHtml(formatDateTime(comment.createdAt))}</time>
          </header>
          <p>${escapeHtml(body)}</p>
        </article>
      `
    })
    .join('')
}

function buildWorkflowPrintMarkup(process, fallbackTitle) {
  const heading = process?.process_label || process?.name || fallbackTitle
  const steps = process?.steps || []

  if (!steps.length) {
    return `
      <section class="tx-print-section section">
        <header class="tx-print-section-head">
          <h3>${escapeHtml(heading)}</h3>
        </header>
        <div class="tx-print-empty">No workflow steps captured yet.</div>
      </section>
    `
  }

  const completedCount = steps.filter((step) => normalizeWorkflowStepStatus(step?.status) === 'completed').length
  const stepRows = steps
    .map((step) => {
      const normalizedStatus = normalizeWorkflowStepStatus(step?.status)
      const symbol = getWorkflowSymbol(normalizedStatus)
      const statusLabel = formatWorkflowStatusValue(normalizedStatus)
      const completedAt = step?.completed_at ? formatDate(step.completed_at) : '—'
      return `
        <li class="tx-print-workflow-row">
          <div class="tx-print-workflow-step">
            <span class="tx-print-symbol" aria-hidden="true">${symbol}</span>
            <span>${escapeHtml(step?.step_label || toTitleLabel(step?.step_key) || 'Workflow step')}</span>
          </div>
          <span class="tx-print-workflow-status">${escapeHtml(statusLabel)}</span>
          <time class="tx-print-workflow-date">${escapeHtml(completedAt)}</time>
        </li>
      `
    })
    .join('')

  return `
    <section class="tx-print-section section">
      <header class="tx-print-section-head">
        <h3>${escapeHtml(heading)}</h3>
        <span>${escapeHtml(`${completedCount} of ${steps.length} complete`)}</span>
      </header>
      <ol class="tx-print-workflow-list">${stepRows}</ol>
    </section>
  `
}

function buildTransactionReportPrintDocument({
  title,
  generatedAt,
  statusLabel,
  summaryLeft,
  summaryRight,
  timelineItems,
  healthSummary,
  workflowMarkup,
  commentChunks,
  buyer,
  transactionParticipants,
}) {
  const preparedCommentChunks = commentChunks?.length ? commentChunks : [[]]
  const totalPages = 1 + preparedCommentChunks.length

  const summaryLeftMarkup = summaryLeft
    .map(
      ([label, value]) => `
        <div class="tx-print-field">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `,
    )
    .join('')

  const summaryRightMarkup = summaryRight
    .map(
      ([label, value]) => `
        <div class="tx-print-field">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `,
    )
    .join('')

  const timelineMarkup = timelineItems
    .map((item) => {
      const state = getProgressStageState(item.stageKey, item.currentStage)
      const symbol = getStageSymbol(state)
      const descriptor = state === 'complete' ? 'Completed' : state === 'current' ? 'Current' : 'Not started'
      return `
        <li class="tx-print-timeline-row">
          <span class="tx-print-symbol" aria-hidden="true">${symbol}</span>
          <span class="tx-print-timeline-stage">${escapeHtml(item.label)}</span>
          <span class="tx-print-timeline-state">${escapeHtml(descriptor)}</span>
        </li>
      `
    })
    .join('')

  const pageOne = `
    <section class="tx-print-page">
      <header class="tx-print-header section">
        <p class="tx-print-kicker">Transaction Report</p>
        <h1>${escapeHtml(title)}</h1>
        <div class="tx-print-meta">
          <div><span>Generated</span><strong>${escapeHtml(generatedAt)}</strong></div>
          <div><span>Status</span><strong>${escapeHtml(statusLabel)}</strong></div>
        </div>
      </header>

      <section class="tx-print-section section">
        <header class="tx-print-section-head"><h2>Transaction Overview</h2></header>
        <div class="tx-print-overview-grid">
          <div class="tx-print-overview-col">${summaryLeftMarkup}</div>
          <div class="tx-print-overview-col">${summaryRightMarkup}</div>
        </div>
      </section>

      <section class="tx-print-section section">
        <header class="tx-print-section-head"><h2>Progress Timeline</h2></header>
        <ol class="tx-print-timeline-list">${timelineMarkup}</ol>
      </section>

      <section class="tx-print-section section">
        <header class="tx-print-section-head"><h2>Transaction Health Summary</h2></header>
        <div class="tx-print-health">
          <strong>${escapeHtml(healthSummary.title)}</strong>
          <p>${escapeHtml(healthSummary.detail)}</p>
        </div>
      </section>

      <footer class="tx-print-footer">
        <span>Report generated by Bridge</span>
        <span>Page 1 of ${totalPages}</span>
      </footer>
    </section>
  `

  const remainingPages = preparedCommentChunks
    .map((comments, index) => {
      const pageNumber = index + 2
      return `
        <section class="tx-print-page">
          <header class="tx-print-header section tx-print-header-sub">
            <p class="tx-print-kicker">Transaction Report</p>
            <h1>${escapeHtml(title)}</h1>
            <div class="tx-print-meta">
              <div><span>Generated</span><strong>${escapeHtml(generatedAt)}</strong></div>
              <div><span>Status</span><strong>${escapeHtml(statusLabel)}</strong></div>
            </div>
          </header>

          ${index === 0 ? `
            <section class="tx-print-section section">
              <header class="tx-print-section-head"><h2>Workflow Status</h2></header>
              <div class="tx-print-workflow-grid">${workflowMarkup}</div>
            </section>
          ` : ''}

          <section class="tx-print-section section">
            <header class="tx-print-section-head">
              <h2>${index === 0 ? 'Comments & Updates' : 'Comments & Updates (continued)'}</h2>
            </header>
            <div class="tx-print-comments">${buildTransactionPrintCommentsMarkup(comments, { buyer, transactionParticipants })}</div>
          </section>

          <footer class="tx-print-footer">
            <span>Report generated by Bridge</span>
            <span>Page ${pageNumber} of ${totalPages}</span>
          </footer>
        </section>
      `
    })
    .join('')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | Transaction Report</title>
    <style>
      @page { size: A4; margin: 14mm; }
      * { box-sizing: border-box; box-shadow: none !important; }
      html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: "Helvetica Neue", Arial, sans-serif; }
      body { font-size: 12px; line-height: 1.45; }
      .tx-print-page { min-height: calc(297mm - 28mm); display: flex; flex-direction: column; gap: 20px; page-break-after: always; break-after: page; }
      .tx-print-page:last-child { page-break-after: auto; break-after: auto; }
      .section { page-break-inside: avoid; break-inside: avoid; }
      .tx-print-header { border: 1px solid #ddd; padding: 18px; border-radius: 6px; }
      .tx-print-header-sub { padding-top: 14px; padding-bottom: 14px; }
      .tx-print-kicker { margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #666; font-weight: 600; }
      .tx-print-header h1 { margin: 8px 0 0; font-size: 23px; line-height: 1.2; font-weight: 700; letter-spacing: -0.02em; }
      .tx-print-meta { margin-top: 14px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .tx-print-meta span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #666; }
      .tx-print-meta strong { display: block; margin-top: 4px; font-size: 13px; font-weight: 700; color: #000; }
      .tx-print-section { border: 1px solid #ddd; padding: 16px; border-radius: 6px; }
      .tx-print-section-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 12px; }
      .tx-print-section-head h2, .tx-print-section-head h3 { margin: 0; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
      .tx-print-section-head span { font-size: 11px; color: #666; }
      .tx-print-overview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .tx-print-overview-col { display: grid; gap: 10px; }
      .tx-print-field { border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; }
      .tx-print-field span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #999; }
      .tx-print-field strong { display: block; margin-top: 4px; font-size: 14px; font-weight: 700; color: #000; word-break: break-word; }
      .tx-print-timeline-list, .tx-print-workflow-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
      .tx-print-timeline-row, .tx-print-workflow-row { display: grid; grid-template-columns: minmax(0,1fr) 140px 110px; gap: 10px; align-items: center; border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; }
      .tx-print-workflow-row { grid-template-columns: minmax(0,1fr) 120px 100px; }
      .tx-print-workflow-step { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .tx-print-timeline-stage, .tx-print-workflow-step span:last-child { font-size: 13px; font-weight: 600; color: #000; }
      .tx-print-timeline-state, .tx-print-workflow-status { text-align: left; font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.06em; }
      .tx-print-workflow-date { text-align: right; font-size: 11px; color: #999; }
      .tx-print-symbol { width: 14px; display: inline-block; text-align: center; font-weight: 700; color: #000; }
      .tx-print-health { border: 1px solid #ddd; border-radius: 6px; padding: 12px; }
      .tx-print-health strong { display: block; font-size: 14px; font-weight: 700; color: #000; }
      .tx-print-health p { margin: 6px 0 0; font-size: 12px; color: #444; }
      .tx-print-workflow-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .tx-print-comments { display: grid; gap: 10px; }
      .tx-print-comment { border: 1px solid #ddd; border-radius: 6px; padding: 12px; page-break-inside: avoid; break-inside: avoid; }
      .tx-print-comment-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
      .tx-print-comment-head strong { display: block; font-size: 13px; font-weight: 700; color: #000; }
      .tx-print-comment-head span, .tx-print-comment-head time { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.06em; }
      .tx-print-comment p { margin: 8px 0 0; color: #222; font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
      .tx-print-empty { border: 1px dashed #ddd; border-radius: 6px; padding: 12px; color: #666; font-size: 12px; }
      .tx-print-footer { margin-top: auto; padding-top: 8px; border-top: 1px solid #ddd; display: flex; justify-content: space-between; gap: 8px; color: #666; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
      @media print {
        body { color: #000; background: #fff; }
      }
      @media (max-width: 860px) {
        .tx-print-overview-grid, .tx-print-workflow-grid { grid-template-columns: minmax(0, 1fr); }
        .tx-print-timeline-row, .tx-print-workflow-row { grid-template-columns: minmax(0,1fr); }
        .tx-print-workflow-date { text-align: left; }
      }
    </style>
  </head>
  <body>${pageOne}${remainingPages}</body>
</html>`
}

function buildPrintOverviewMarkup(items) {
  return items
    .map(
      ([label, value]) => `
        <div class="onboarding-print-overview-item">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </div>
      `,
    )
    .join('')
}

function buildPrintDocumentHtml({
  title,
  subtitle,
  statusLabel,
  generatedAt,
  sections,
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page {
        size: A4;
        margin: 14mm;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: #eef3f9;
        color: #142132;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        padding: 20px;
      }

      .onboarding-print-page {
        width: 100%;
        max-width: 794px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #dbe5ef;
        border-radius: 26px;
        overflow: hidden;
      }

      .onboarding-print-hero {
        padding: 28px 30px 26px;
        background:
          radial-gradient(circle at top left, rgba(255,255,255,0.26), transparent 42%),
          linear-gradient(135deg, #365774 0%, #466a89 55%, #5a7d9b 100%);
        color: #ffffff;
      }

      .onboarding-print-eyebrow {
        margin: 0;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        opacity: 0.82;
      }

      .onboarding-print-hero h1 {
        margin: 14px 0 8px;
        font-size: 36px;
        line-height: 1.05;
        letter-spacing: -0.04em;
      }

      .onboarding-print-hero p {
        margin: 0;
        font-size: 18px;
        line-height: 1.4;
        color: rgba(255,255,255,0.86);
      }

      .onboarding-print-hero-meta {
        margin-top: 20px;
        display: flex;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
      }

      .onboarding-print-hero-meta div {
        min-width: 0;
      }

      .onboarding-print-hero-meta span {
        display: block;
        font-size: 11px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        opacity: 0.7;
      }

      .onboarding-print-hero-meta strong {
        display: block;
        margin-top: 6px;
        font-size: 15px;
        font-weight: 600;
      }

      .onboarding-print-body {
        padding: 24px 30px 30px;
      }

      .onboarding-print-section + .onboarding-print-section {
        margin-top: 20px;
      }

      .onboarding-print-section-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        margin-bottom: 14px;
      }

      .onboarding-print-section-header h2 {
        margin: 0;
        font-size: 18px;
        letter-spacing: -0.02em;
      }

      .onboarding-print-section-header span {
        color: #6b7d93;
        font-size: 12px;
      }

      .onboarding-print-panel {
        border: 1px solid #e1e9f2;
        background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
        border-radius: 22px;
        padding: 18px;
      }

      .onboarding-print-progress {
        display: flex;
        gap: 0;
      }

      .onboarding-print-progress-node {
        flex: 1 1 0;
        min-width: 0;
      }

      .onboarding-print-progress-top {
        display: flex;
        align-items: center;
      }

      .onboarding-print-progress-node .dot {
        width: 15px;
        height: 15px;
        border-radius: 999px;
        border: 3px solid #d4deea;
        background: #ffffff;
        flex: 0 0 auto;
      }

      .onboarding-print-progress-node .line {
        height: 4px;
        flex: 1 1 auto;
        margin-left: 8px;
        border-radius: 999px;
        background: #e3ebf4;
      }

      .onboarding-print-progress-copy {
        padding-top: 10px;
        padding-right: 10px;
      }

      .onboarding-print-progress-copy strong {
        display: block;
        font-size: 12px;
        line-height: 1.35;
      }

      .onboarding-print-progress-copy span {
        display: block;
        margin-top: 4px;
        color: #7b8ca2;
        font-size: 11px;
      }

      .onboarding-print-progress-node.complete .dot,
      .onboarding-print-progress-node.current .dot {
        border-color: #3f6584;
        background: #3f6584;
      }

      .onboarding-print-progress-node.complete .line {
        background: #3f6584;
      }

      .onboarding-print-progress-node.current .dot {
        box-shadow: 0 0 0 4px rgba(63, 101, 132, 0.16);
      }

      .onboarding-print-overview {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .onboarding-print-fields {
        display: grid;
        gap: 12px;
      }

      .onboarding-print-field-group {
        border: 1px solid #e1e9f2;
        border-radius: 20px;
        background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
        padding: 16px;
        break-inside: avoid;
      }

      .onboarding-print-field-group h3 {
        margin: 0 0 12px;
        font-size: 15px;
        letter-spacing: -0.02em;
      }

      .onboarding-print-field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .onboarding-print-field-item {
        border: 1px solid #e8eef5;
        border-radius: 14px;
        background: #fbfcfe;
        padding: 11px 12px;
      }

      .onboarding-print-field-item span {
        display: block;
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #7b8ca2;
      }

      .onboarding-print-field-item strong {
        display: block;
        margin-top: 6px;
        font-size: 13px;
        line-height: 1.55;
        font-weight: 600;
        color: #142132;
        word-break: break-word;
      }

      .onboarding-print-overview-item {
        border: 1px solid #e3ebf4;
        border-radius: 18px;
        background: #fbfcfe;
        padding: 14px 15px;
      }

      .onboarding-print-overview-item span {
        display: block;
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #7b8ca2;
      }

      .onboarding-print-overview-item strong {
        display: block;
        margin-top: 8px;
        font-size: 17px;
        line-height: 1.3;
        letter-spacing: -0.02em;
      }

      .onboarding-print-comments {
        display: grid;
        gap: 12px;
      }

      .onboarding-print-comment {
        border: 1px solid #e3ebf4;
        border-radius: 18px;
        padding: 14px 15px;
        background: #fbfcfe;
      }

      .onboarding-print-comment-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }

      .onboarding-print-comment-head strong {
        display: block;
        font-size: 14px;
      }

      .onboarding-print-comment-head span,
      .onboarding-print-comment-head time {
        color: #7b8ca2;
        font-size: 11px;
      }

      .onboarding-print-comment p {
        margin: 10px 0 0;
        font-size: 13px;
        line-height: 1.65;
        color: #23384c;
      }

      .onboarding-print-empty {
        border: 1px dashed #d8e2ee;
        border-radius: 18px;
        padding: 18px;
        color: #6b7d93;
        font-size: 13px;
        background: #fbfcfe;
      }

      @media print {
        body {
          padding: 0;
          background: #ffffff;
        }

        .onboarding-print-page {
          border: 0;
          border-radius: 0;
          max-width: none;
          box-shadow: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="onboarding-print-page">
      <section class="onboarding-print-hero">
        <p class="onboarding-print-eyebrow">bridge.</p>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(subtitle)}</p>
        <div class="onboarding-print-hero-meta">
          <div>
            <span>Status</span>
            <strong>${escapeHtml(statusLabel)}</strong>
          </div>
          <div>
            <span>Generated</span>
            <strong>${escapeHtml(generatedAt)}</strong>
          </div>
        </div>
      </section>

      <section class="onboarding-print-body">${sections.join('')}</section>
    </main>
  </body>
</html>`
}

function buildOnboardingPrintHtml({
  buyer,
  unit,
  mainStage,
  onboardingStatus,
  resolvedPurchaserTypeLabel,
  financeLabel,
  purchasePriceLabel,
  groupedOnboardingFields,
}) {
  const buyerName = buyer?.name || 'Buyer pending'
  const developmentName = unit?.development?.name || 'Development'
  const unitLabel = unit?.unit_number || 'Unit'
  const stageLabel = MAIN_STAGE_LABELS[mainStage] || mainStage || 'Available'
  const overviewItems = [
    ['Purchaser', buyerName],
    ['Purchaser Type', resolvedPurchaserTypeLabel || 'Not set'],
    ['Finance Type', financeLabel || 'Not set'],
    ['Purchase Price', purchasePriceLabel || 'R0'],
    ['Current Stage', stageLabel],
    ['Onboarding', onboardingStatus || 'Not Started'],
  ]

  const fieldGroupsMarkup = Object.keys(groupedOnboardingFields || {}).length
    ? Object.entries(groupedOnboardingFields)
        .map(([groupLabel, items]) => {
          const fieldsMarkup = items
            .map(
              ([key, value]) => `
                <div class="onboarding-print-field-item">
                  <span>${escapeHtml(toTitleLabel(key))}</span>
                  <strong>${escapeHtml(formatOnboardingFieldValue(value))}</strong>
                </div>
              `,
            )
            .join('')

          return `
            <section class="onboarding-print-field-group">
              <h3>${escapeHtml(groupLabel)}</h3>
              <div class="onboarding-print-field-grid">${fieldsMarkup}</div>
            </section>
          `
        })
        .join('')
    : '<div class="onboarding-print-empty">No onboarding fields have been submitted yet.</div>'

  return buildPrintDocumentHtml({
    title: `${buyerName} | Information Sheet`,
    subtitle: `${developmentName} | ${unitLabel}`,
    statusLabel: onboardingStatus || 'Not Started',
    generatedAt: formatDateTime(new Date().toISOString()),
    sections: [
      `
        <section class="onboarding-print-section">
          <div class="onboarding-print-section-header">
            <h2>Progress</h2>
            <span>${escapeHtml(stageLabel)}</span>
          </div>
          <div class="onboarding-print-panel">
            <div class="onboarding-print-progress">${buildPrintProgressMarkup(mainStage)}</div>
          </div>
        </section>
      `,
      `
        <section class="onboarding-print-section">
          <div class="onboarding-print-section-header">
            <h2>Unit Overview</h2>
            <span>Transaction snapshot</span>
          </div>
          <div class="onboarding-print-overview">${buildPrintOverviewMarkup(overviewItems)}</div>
        </section>
      `,
      `
        <section class="onboarding-print-section">
          <div class="onboarding-print-section-header">
            <h2>Submitted Onboarding Information</h2>
            <span>Full captured form data</span>
          </div>
          <div class="onboarding-print-fields">${fieldGroupsMarkup}</div>
        </section>
      `,
    ],
  })
}

function buildTransactionReportPrintHtml({
  buyer,
  unit,
  mainStage,
  progressPercent = 0,
  onboardingStatus,
  resolvedPurchaserTypeLabel,
  financeLabel,
  purchasePriceLabel,
  transactionSubprocesses,
  transactionDiscussion,
  transactionParticipants,
}) {
  const buyerName = buyer?.name || 'Buyer pending'
  const developmentName = unit?.development?.name || 'Development'
  const unitLabel = unit?.unit_number || 'Unit'
  const stageLabel = MAIN_STAGE_LABELS[mainStage] || mainStage || 'Available'
  const summaryLeft = [
    ['Purchaser Name', buyerName],
    ['Purchaser Type', resolvedPurchaserTypeLabel || 'Not set'],
    ['Finance Type', financeLabel || 'Not set'],
  ]
  const summaryRight = [
    ['Purchase Price', purchasePriceLabel || 'R0'],
    ['Current Stage', stageLabel],
    ['Onboarding Status', onboardingStatus || 'Not Started'],
  ]
  const timelineItems = MAIN_PROCESS_STAGES.map((stageKey) => ({
    stageKey,
    currentStage: mainStage,
    label: MAIN_STAGE_LABELS[stageKey] || stageKey,
  }))

  const financeProcess = (transactionSubprocesses || []).find((item) => item?.process_type === 'finance') || null
  const attorneyProcess = (transactionSubprocesses || []).find((item) => item?.process_type === 'attorney') || null
  const totalWorkflowSteps = [financeProcess, attorneyProcess].reduce((total, process) => total + (process?.steps || []).length, 0)
  const completedWorkflowSteps = [financeProcess, attorneyProcess].reduce(
    (total, process) =>
      total +
      (process?.steps || []).filter((step) => normalizeWorkflowStepStatus(step?.status) === 'completed').length,
    0,
  )
  const workflowMarkup = [
    buildWorkflowPrintMarkup(financeProcess, 'Finance Workflow'),
    buildWorkflowPrintMarkup(attorneyProcess, 'Attorney Workflow'),
  ].join('')
  const healthSummary = getHealthSummary({
    progressPercent,
    totalSteps: totalWorkflowSteps,
    completedSteps: completedWorkflowSteps,
    currentStageLabel: stageLabel,
  })
  const comments = (transactionDiscussion || []).slice(0, 36)
  const commentChunks = chunkArray(comments, 6)

  return buildTransactionReportPrintDocument({
    title: `${developmentName} | Unit ${unitLabel}`,
    generatedAt: formatDateTime(new Date().toISOString()),
    statusLabel: stageLabel,
    summaryLeft,
    summaryRight,
    timelineItems,
    healthSummary,
    workflowMarkup,
    commentChunks,
    buyer,
    transactionParticipants,
  })
}

const WORKFLOW_PROCESS_LABELS = {
  finance: 'Finance Workflow',
  attorney: 'Attorney Workflow',
}

const WORKFLOW_STATUS_LABELS = {
  completed: 'Completed',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  not_started: 'Pending',
}

const SYSTEM_DISCUSSION_TYPE = 'system'

function normalizeWorkflowStepStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(WORKFLOW_STATUS_LABELS, normalized) ? normalized : 'not_started'
}

function toDateOnlyValue(value) {
  if (!value) {
    return ''
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toISOString().slice(0, 10)
}

function formatWorkflowStatusValue(value) {
  return WORKFLOW_STATUS_LABELS[normalizeWorkflowStepStatus(value)] || 'Pending'
}

function formatOwnershipValue(name, email) {
  const normalizedName = String(name || '').trim()
  const normalizedEmail = String(email || '').trim()

  if (!normalizedName && !normalizedEmail) {
    return 'Unassigned'
  }

  if (normalizedName && normalizedEmail) {
    return `${normalizedName} (${normalizedEmail})`
  }

  return normalizedName || normalizedEmail
}

function formatFinanceOwnerValue(value) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return 'Not set'
  }
  return normalized.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function buildSystemDiscussionComment(message) {
  return `[${SYSTEM_DISCUSSION_TYPE}][shared] ${message}`
}

function prettifyDiscussionType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (!normalized) {
    return 'Update'
  }
  return normalized.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase())
}

function parseSystemDiscussionBody(body) {
  const normalized = String(body || '').trim()
  const compact = normalized.replace(/\s+/g, ' ')

  const changedFromToMatch = compact.match(/changed from (.+?) to (.+?)(?: by | at |$)/i)
  const changedToMatch = compact.match(/changed to (.+?)(?: by | at |$)/i)

  if (/^transaction stage updated:/i.test(compact)) {
    const stagePair = compact.match(/transaction stage updated:\s*(.+?)\s*changed to\s*(.+?)(?: by | at |$)/i)
    return {
      title: 'Stage Updated',
      summary: stagePair ? `${stagePair[1]} → ${stagePair[2]}` : changedToMatch ? `Moved to ${changedToMatch[1]}` : 'Stage moved',
      detail: compact,
    }
  }

  if (/finance workflow updated:/i.test(compact)) {
    return {
      title: 'Finance Workflow Updated',
      summary: changedFromToMatch ? `${changedFromToMatch[1]} → ${changedFromToMatch[2]}` : compact.replace(/^finance workflow updated:\s*/i, ''),
      detail: compact,
    }
  }

  if (/attorney workflow updated:/i.test(compact)) {
    return {
      title: 'Attorney Workflow Updated',
      summary: changedFromToMatch ? `${changedFromToMatch[1]} → ${changedFromToMatch[2]}` : compact.replace(/^attorney workflow updated:\s*/i, ''),
      detail: compact,
    }
  }

  if (/ownership updated:/i.test(compact)) {
    return {
      title: 'Ownership Updated',
      summary: changedFromToMatch ? `${changedFromToMatch[1]} → ${changedFromToMatch[2]}` : compact.replace(/^.*ownership updated:\s*/i, ''),
      detail: compact,
    }
  }

  return {
    title: 'System Update',
    summary: compact,
    detail: compact,
  }
}

function buildDiscussionCardData({ commentBody, discussionType }) {
  const normalizedBody = String(commentBody || '').trim()
  const normalizedType = String(discussionType || '').trim().toLowerCase()
  const isSystem = normalizedType === SYSTEM_DISCUSSION_TYPE

  if (isSystem) {
    return parseSystemDiscussionBody(normalizedBody)
  }

  return {
    title: `${prettifyDiscussionType(normalizedType)} Update`,
    summary: normalizedBody || 'No detail provided.',
    detail: normalizedBody || 'No detail provided.',
  }
}

function filterOnboardingEntriesByKeywords(entries = [], keywords = []) {
  const normalizedKeywords = (keywords || []).map((item) => String(item || '').toLowerCase()).filter(Boolean)
  return (entries || []).filter(([key]) => {
    const normalizedKey = String(key || '').toLowerCase()
    return normalizedKeywords.some((keyword) => normalizedKey.includes(keyword))
  })
}

function toMoneyInputValue(value) {
  if (value === null || value === undefined || value === '') {
    return ''
  }
  const numericValue = Number(value)
  if (Number.isFinite(numericValue)) {
    return String(numericValue)
  }
  return String(value)
}

function parseOptionalMoneyInput(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const normalizedValue = String(value).replaceAll(',', '').trim()
  if (!normalizedValue) {
    return null
  }
  const numericValue = Number(normalizedValue)
  return Number.isFinite(numericValue) ? numericValue : null
}

function splitBuyerName(fullName) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (!parts.length) {
    return { firstName: '', lastName: '' }
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

function buildBuyerDisplayName({ firstName = '', lastName = '', fallbackName = '' } = {}) {
  const fullName = [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ')
  return fullName || String(fallbackName || '').trim()
}

function validateClientInformationFinance(form = {}) {
  const financeType = normalizeFinanceType(form.finance_type || 'cash')
  const purchasePrice = parseOptionalMoneyInput(form.purchase_price)
  const cashAmountInput = parseOptionalMoneyInput(form.cash_amount)
  const bondAmountInput = parseOptionalMoneyInput(form.bond_amount)
  const depositAmountInput = parseOptionalMoneyInput(form.deposit_amount)
  const errors = {}

  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0) {
    errors.purchase_price = 'Purchase Price is required.'
  }

  if (depositAmountInput !== null && depositAmountInput < 0) {
    errors.deposit_amount = 'Deposit / reservation amount cannot be negative.'
  }

  if (financeType === 'bond') {
    if (!Number.isFinite(bondAmountInput) || bondAmountInput <= 0) {
      errors.bond_amount = 'Bond Amount is required for bond finance.'
    }
  }

  if (financeType === 'combination') {
    if (!Number.isFinite(cashAmountInput) || cashAmountInput <= 0) {
      errors.cash_amount = 'Cash Portion is required for hybrid finance.'
    }
    if (!Number.isFinite(bondAmountInput) || bondAmountInput <= 0) {
      errors.bond_amount = 'Bond Portion is required for hybrid finance.'
    }
    if (
      Number.isFinite(purchasePrice) &&
      purchasePrice > 0 &&
      Number.isFinite(cashAmountInput) &&
      Number.isFinite(bondAmountInput) &&
      Math.abs(cashAmountInput + bondAmountInput - purchasePrice) > 1
    ) {
      errors.hybrid_split = 'Cash Portion plus Bond Portion must equal the Purchase Price.'
    }
  }

  const normalizedCashAmount =
    financeType === 'cash' ? purchasePrice : financeType === 'combination' ? cashAmountInput : null
  const normalizedBondAmount = financeType === 'bond' || financeType === 'combination' ? bondAmountInput : null

  return {
    errors,
    normalized: {
      financeType,
      purchasePrice,
      cashAmount: normalizedCashAmount,
      bondAmount: normalizedBondAmount,
      depositAmount: depositAmountInput,
    },
  }
}

function UnitDetail() {
  const navigate = useNavigate()
  const { unitId } = useParams()
  const [searchParams] = useSearchParams()
  const { role: workspaceRole } = useWorkspace()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingTransaction, setDeletingTransaction] = useState(false)
  const [error, setError] = useState('')
  const [creatingAlteration, setCreatingAlteration] = useState(false)
  const [alterationCreationError, setAlterationCreationError] = useState('')
  const [workspaceMenu, setWorkspaceMenu] = useState(() => {
    const requestedMenu = searchParams.get('tab') || searchParams.get('menu') || 'overview'
    return WORKSPACE_MENU_IDS.includes(requestedMenu) ? requestedMenu : 'overview'
  })
  const [discussionBody, setDiscussionBody] = useState('')
  const [discussionType, setDiscussionType] = useState('operational')
  const [discussionFeedFilter, setDiscussionFeedFilter] = useState('all')
  const [actingRole, setActingRole] = useState('developer')
  const [clientPortalLink, setClientPortalLink] = useState(null)
  const workspaceLandingMode = 'full_workspace'
  const [documentCategory, setDocumentCategory] = useState('General')
  const [clientVisibleByDefault, setClientVisibleByDefault] = useState(false)
  const [stageForm, setStageForm] = useState({
    main_stage: 'AVAIL',
    finance_type: 'cash',
    purchaser_type: 'individual',
    finance_managed_by: 'bond_originator',
    assigned_agent: '',
    assigned_agent_email: '',
    attorney: '',
    assigned_attorney_email: '',
    bond_originator: '',
    assigned_bond_originator_email: '',
    next_action: '',
  })
  const [stageEditor, setStageEditor] = useState({
    open: false,
    targetStage: '',
    note: '',
  })
  const [clientInfoForm, setClientInfoForm] = useState({
    buyer_first_name: '',
    buyer_last_name: '',
    buyer_email: '',
    buyer_phone: '',
    identity_number: '',
    tax_number: '',
    company_name: '',
    company_registration_number: '',
    onboarding_status: 'Not Started',
    finance_type: 'cash',
    purchase_price: '',
    cash_amount: '',
    bond_amount: '',
    deposit_amount: '',
  })
  const [clientInfoSubmitAttempted, setClientInfoSubmitAttempted] = useState(false)
  const [onboardingMode, setOnboardingMode] = useState('client_portal')
  const [manualSectionCompletion, setManualSectionCompletion] = useState(() => ({ ...DEFAULT_SECTION_COMPLETION }))
  const [manualDocumentStatusOverrides, setManualDocumentStatusOverrides] = useState({})
  const [updatingRequiredDocumentKey, setUpdatingRequiredDocumentKey] = useState('')
  const [clientInfoSavedAt, setClientInfoSavedAt] = useState('')
  const purchaserTypeOptions = getPurchaserTypeOptions()
  const discussionPanelRef = useRef(null)
  const workspaceMenuRef = useRef(null)
  const workflowPanelRef = useRef(null)

  const loadDetail = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    try {
      setError('')
      setLoading(true)
      const data = await fetchUnitDetail(unitId)
      setDetail(data)
      const activePortalLink = (data?.clientPortalLinks || []).find((link) => link.is_active && link.token) || null
      setClientPortalLink(activePortalLink)

      if (data?.transaction) {
        setStageForm({
          main_stage: data.mainStage || 'AVAIL',
          finance_type: normalizeFinanceType(data.transaction.finance_type || 'cash'),
          purchaser_type: data.transaction.purchaser_type || data.purchaserType || 'individual',
          finance_managed_by: data.transaction.finance_managed_by || 'bond_originator',
          assigned_agent: data.transaction.assigned_agent || '',
          assigned_agent_email: data.transaction.assigned_agent_email || '',
          attorney: data.transaction.attorney || '',
          assigned_attorney_email: data.transaction.assigned_attorney_email || '',
          bond_originator: data.transaction.bond_originator || '',
          assigned_bond_originator_email: data.transaction.assigned_bond_originator_email || '',
          next_action: data.transaction.next_action || '',
        })
        setActingRole(data.activeViewerRole || 'developer')
      } else if (data) {
        setStageForm((previous) => ({
          ...previous,
          main_stage: data.mainStage || 'AVAIL',
          purchaser_type: data.purchaserType || 'individual',
        }))
        setActingRole(data.activeViewerRole || 'developer')
      }
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [unitId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  useEffect(() => {
    const requestedMenu = searchParams.get('tab') || searchParams.get('menu')
    if (!requestedMenu || !WORKSPACE_MENU_IDS.includes(requestedMenu)) {
      return
    }

    setWorkspaceMenu(requestedMenu)
  }, [searchParams])

  useEffect(() => {
    const onboardingData = detail?.onboardingFormData?.formData || {}
    const parsedBuyerName = splitBuyerName(detail?.buyer?.name || '')
    const buyerFirstName = String(onboardingData.first_name || '').trim() || parsedBuyerName.firstName
    const buyerLastName = String(onboardingData.last_name || '').trim() || parsedBuyerName.lastName
    const resolvedFinanceType = normalizeFinanceType(
      detail?.transaction?.finance_type || onboardingData.purchase_finance_type || 'cash',
    )

    setClientInfoForm({
      buyer_first_name: buyerFirstName,
      buyer_last_name: buyerLastName,
      buyer_email: detail?.buyer?.email || '',
      buyer_phone: detail?.buyer?.phone || '',
      identity_number: String(onboardingData.identity_number || onboardingData.passport_number || '').trim(),
      tax_number: String(onboardingData.tax_number || '').trim(),
      company_name: String(onboardingData.company_name || onboardingData.trust_name || '').trim(),
      company_registration_number: String(
        onboardingData.company_registration_number || onboardingData.trust_registration_number || '',
      ).trim(),
      onboarding_status: detail?.onboarding?.status || 'Not Started',
      finance_type: resolvedFinanceType,
      purchase_price: toMoneyInputValue(
        detail?.transaction?.purchase_price ??
          detail?.transaction?.sales_price ??
          onboardingData.purchase_price ??
          detail?.unit?.price ??
          '',
      ),
      cash_amount: toMoneyInputValue(
        detail?.transaction?.cash_amount ?? onboardingData.cash_amount ?? '',
      ),
      bond_amount: toMoneyInputValue(
        detail?.transaction?.bond_amount ?? onboardingData.bond_amount ?? '',
      ),
      deposit_amount: toMoneyInputValue(
        detail?.transaction?.deposit_amount ?? onboardingData.deposit_amount ?? '',
      ),
    })
    setOnboardingMode(normalizeOnboardingMode(onboardingData.__bridge_onboarding_mode))
    setManualSectionCompletion(parseSectionCompletion(onboardingData.__bridge_manual_section_completion))
    setManualDocumentStatusOverrides({})
    setClientInfoSavedAt('')
    setClientInfoSubmitAttempted(false)
  }, [detail])

  useEffect(() => {
    function onTransactionCreated(event) {
      const createdUnitId = event?.detail?.unitId
      if (!createdUnitId || createdUnitId === unitId) {
        void loadDetail()
      }
    }

    function onDocumentRequirementsChanged() {
      void loadDetail()
    }

    window.addEventListener('itg:transaction-created', onTransactionCreated)
    window.addEventListener('itg:transaction-updated', onDocumentRequirementsChanged)
    window.addEventListener('itg:document-requirements-changed', onDocumentRequirementsChanged)
    return () => {
      window.removeEventListener('itg:transaction-created', onTransactionCreated)
      window.removeEventListener('itg:transaction-updated', onDocumentRequirementsChanged)
      window.removeEventListener('itg:document-requirements-changed', onDocumentRequirementsChanged)
    }
  }, [loadDetail, unitId])

  useEffect(() => {
    function scrollToSection(ref) {
      ref?.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }

    function setUploadCategoryForRoleFromQuickAction() {
      if (actingRole === 'attorney') {
        setDocumentCategory('Transfer Documents')
        return
      }

      if (actingRole === 'bond_originator') {
        setDocumentCategory('Bond Approval')
        return
      }

      if (actingRole === 'client') {
        setDocumentCategory('Supporting Document')
        return
      }

      const firstMissing = (detail?.requiredDocumentChecklist || []).find((item) => !item.complete)
      setDocumentCategory(firstMissing?.label || 'General')
    }

    function onQuickAction(event) {
      const action = event?.detail?.action
      if (!action) {
        return
      }

      if (action === 'upload-required-doc') {
        setUploadCategoryForRoleFromQuickAction()
        setWorkspaceMenu('documents')
        scrollToSection(workspaceMenuRef)
      }

      if (action === 'post-update') {
        setDiscussionType(actingRole === 'client' ? 'client' : 'operational')
        setWorkspaceMenu('overview')
        scrollToSection(discussionPanelRef)
      }

      if (action === 'invite-next-party') {
        setWorkspaceMenu('overview')
        scrollToSection(workspaceMenuRef)
      }
    }

    window.addEventListener('itg:quick-action', onQuickAction)
    return () => window.removeEventListener('itg:quick-action', onQuickAction)
  }, [actingRole, detail])

  function resolveActingParticipantName() {
    return (
      detail?.transactionParticipants?.find((item) => item.roleType === actingRole)?.participantName ||
      TRANSACTION_ROLE_LABELS[actingRole] ||
      'Bridge Team'
    )
  }

  function getWorkflowStepSnapshot(stepId) {
    if (!stepId) {
      return null
    }

    for (const process of detail?.transactionSubprocesses || []) {
      const match = (process.steps || []).find((step) => step.id === stepId)
      if (match) {
        return match
      }
    }

    return null
  }

  async function postSystemDiscussionUpdates(messages = []) {
    if (!detail?.transaction?.id || !messages.length) {
      return
    }

    const authorName = resolveActingParticipantName()
    for (const message of messages) {
      await addTransactionDiscussionComment({
        transactionId: detail.transaction.id,
        authorName,
        authorRole: actingRole,
        commentText: buildSystemDiscussionComment(message),
        unitId: detail.unit.id,
      })
    }
  }

  function openStageEditor(targetStage) {
    const transitionBlockers = stageProgressModel?.getTransitionBlockers?.(targetStage) || []
    if (transitionBlockers.length) {
      const targetLabel = MAIN_STAGE_LABELS[targetStage] || targetStage
      setError(`Cannot move to ${targetLabel} yet. ${transitionBlockers.join(' • ')}`)
      return
    }

    setStageEditor({
      open: true,
      targetStage,
      note: '',
    })
  }

  function closeStageEditor() {
    setStageEditor({
      open: false,
      targetStage: '',
      note: '',
    })
  }

  async function handleConfirmMainStageUpdate(event) {
    event.preventDefault()

    if (!detail?.transaction?.id || !stageEditor.targetStage) {
      return
    }

    const previousMainStage = detail.mainStage || stageForm.main_stage || 'AVAIL'
    const nextMainStage = stageEditor.targetStage
    if (previousMainStage === nextMainStage) {
      closeStageEditor()
      return
    }

    const transitionBlockers = stageProgressModel?.getTransitionBlockers?.(nextMainStage) || []
    if (transitionBlockers.length) {
      const toLabel = MAIN_STAGE_LABELS[nextMainStage] || nextMainStage
      setError(`Cannot move to ${toLabel} yet. ${transitionBlockers.join(' • ')}`)
      return
    }

    try {
      setSaving(true)
      setError('')
      const actorName = resolveActingParticipantName()
      const timestampLabel = formatDateTime(new Date().toISOString())
      const note = String(stageEditor.note || '').trim()

      const result = await updateTransactionMainStage({
        transactionId: detail.transaction.id,
        unitId: detail.unit.id,
        mainStage: nextMainStage,
        note,
        actorRole: effectiveEditorRole,
      })

      setDetail((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          mainStage: result.nextMainStage,
          stage: result.nextStage,
          transaction: previous.transaction
            ? {
                ...previous.transaction,
                stage: result.nextStage,
                current_main_stage: result.nextMainStage,
                updated_at: new Date().toISOString(),
              }
            : previous.transaction,
        }
      })
      setStageForm((previous) => ({ ...previous, main_stage: result.nextMainStage }))

      const fromLabel = MAIN_STAGE_LABELS[result.previousMainStage] || result.previousMainStage
      const toLabel = MAIN_STAGE_LABELS[result.nextMainStage] || result.nextMainStage
      const message = note
        ? `Transaction stage updated: ${fromLabel} changed to ${toLabel} by ${actorName} at ${timestampLabel}. Note: ${note}`
        : `Transaction stage updated: ${fromLabel} changed to ${toLabel} by ${actorName} at ${timestampLabel}.`
      await postSystemDiscussionUpdates([message])

      closeStageEditor()
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleTransactionSave(event) {
    event.preventDefault()

    if (!detail) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const transactionSnapshot = detail.transaction || {}
      const timestampLabel = formatDateTime(new Date().toISOString())
      const actorName = resolveActingParticipantName()

      const systemMessages = []
      const ownershipChanges = [
        {
          area: 'Sales ownership',
          field: 'Assigned agent',
          previousValue: formatOwnershipValue(transactionSnapshot.assigned_agent, transactionSnapshot.assigned_agent_email),
          nextValue: formatOwnershipValue(stageForm.assigned_agent, stageForm.assigned_agent_email),
        },
        {
          area: 'Conveyancing ownership',
          field: 'Assigned conveyancer',
          previousValue: formatOwnershipValue(transactionSnapshot.attorney, transactionSnapshot.assigned_attorney_email),
          nextValue: formatOwnershipValue(stageForm.attorney, stageForm.assigned_attorney_email),
        },
        {
          area: 'Finance ownership',
          field: 'Bond originator',
          previousValue: formatOwnershipValue(transactionSnapshot.bond_originator, transactionSnapshot.assigned_bond_originator_email),
          nextValue: formatOwnershipValue(stageForm.bond_originator, stageForm.assigned_bond_originator_email),
        },
      ]

      ownershipChanges.forEach((change) => {
        if (change.previousValue === change.nextValue) {
          return
        }
        systemMessages.push(
          `${change.area} updated: ${change.field} changed from ${change.previousValue} to ${change.nextValue} by ${actorName} at ${timestampLabel}.`,
        )
      })

      const previousFinanceOwner = formatFinanceOwnerValue(transactionSnapshot.finance_managed_by || 'bond_originator')
      const nextFinanceOwner = formatFinanceOwnerValue(stageForm.finance_managed_by)
      if (previousFinanceOwner !== nextFinanceOwner) {
        systemMessages.push(
          `Finance ownership updated: Finance managed by changed from ${previousFinanceOwner} to ${nextFinanceOwner} by ${actorName} at ${timestampLabel}.`,
        )
      }

      await saveTransaction({
        unitId: detail.unit.id,
        transactionId: detail.transaction?.id,
        buyerId: detail.transaction?.buyer_id || null,
        financeType: stageForm.finance_type,
        purchaserType: stageForm.purchaser_type,
        financeManagedBy: stageForm.finance_managed_by,
        mainStage: stageForm.main_stage,
        assignedAgent: stageForm.assigned_agent,
        assignedAgentEmail: stageForm.assigned_agent_email,
        attorney: stageForm.attorney,
        assignedAttorneyEmail: stageForm.assigned_attorney_email,
        bondOriginator: stageForm.bond_originator,
        assignedBondOriginatorEmail: stageForm.assigned_bond_originator_email,
        nextAction: stageForm.next_action,
        actorRole: effectiveEditorRole,
      })
      await postSystemDiscussionUpdates(systemMessages)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleClientInformationSave(event) {
    event.preventDefault()

    if (!detail?.transaction?.id) {
      return
    }

    const financeValidation = validateClientInformationFinance(clientInfoForm)
    setClientInfoSubmitAttempted(true)

    if (Object.keys(financeValidation.errors).length > 0) {
      setError(
        financeValidation.errors.hybrid_split ||
          financeValidation.errors.purchase_price ||
          financeValidation.errors.bond_amount ||
          financeValidation.errors.cash_amount ||
          financeValidation.errors.deposit_amount ||
          'Please resolve validation errors before saving client information.',
      )
      return
    }

    if (onboardingMode === 'manual') {
      const normalizedPurchaserType = normalizePurchaserType(stageForm.purchaser_type || 'individual')
      const missingManualFields = []
      if (!String(clientInfoForm.buyer_first_name || '').trim()) missingManualFields.push('Name')
      if (!String(clientInfoForm.buyer_last_name || '').trim()) missingManualFields.push('Surname')
      if (!String(clientInfoForm.buyer_email || '').trim()) missingManualFields.push('Email')
      if (!String(clientInfoForm.buyer_phone || '').trim()) missingManualFields.push('Phone')
      if (!String(clientInfoForm.identity_number || '').trim()) missingManualFields.push('ID / Passport Number')
      if (
        (normalizedPurchaserType === 'company' || normalizedPurchaserType === 'trust') &&
        !String(clientInfoForm.company_name || '').trim()
      ) {
        missingManualFields.push('Company / Trust Name')
      }
      if (
        (normalizedPurchaserType === 'company' || normalizedPurchaserType === 'trust') &&
        !String(clientInfoForm.company_registration_number || '').trim()
      ) {
        missingManualFields.push('Registration Number')
      }

      if (missingManualFields.length) {
        setError(`Manual onboarding requires: ${missingManualFields.slice(0, 4).join(', ')}${missingManualFields.length > 4 ? '…' : ''}.`)
        return
      }
    }

    const resolvedBuyerName = buildBuyerDisplayName({
      firstName: clientInfoForm.buyer_first_name,
      lastName: clientInfoForm.buyer_last_name,
      fallbackName: detail?.buyer?.name || '',
    })

    try {
      setSaving(true)
      setError('')

      await saveTransactionClientInformation({
        transactionId: detail.transaction.id,
        buyerId: detail.transaction.buyer_id || detail.buyer?.id || null,
        buyerName: resolvedBuyerName,
        buyerFirstName: clientInfoForm.buyer_first_name,
        buyerLastName: clientInfoForm.buyer_last_name,
        buyerEmail: clientInfoForm.buyer_email,
        buyerPhone: clientInfoForm.buyer_phone,
        nextAction: stageForm.next_action,
        identityNumber: clientInfoForm.identity_number,
        taxNumber: clientInfoForm.tax_number,
        companyName: clientInfoForm.company_name,
        companyRegistrationNumber: clientInfoForm.company_registration_number,
        financeType: financeValidation.normalized.financeType,
        purchasePrice: financeValidation.normalized.purchasePrice,
        cashAmount: financeValidation.normalized.cashAmount,
        bondAmount: financeValidation.normalized.bondAmount,
        depositAmount: financeValidation.normalized.depositAmount,
        purchaserType: stageForm.purchaser_type,
        onboardingStatus: clientInfoForm.onboarding_status,
        onboardingMode,
        manualSectionCompletion,
        actorRole: effectiveEditorRole,
      })

      setStageForm((previous) => ({
        ...previous,
        finance_type: financeValidation.normalized.financeType,
      }))
      setClientInfoSubmitAttempted(false)
      setClientInfoSavedAt(new Date().toISOString())
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleRequiredDocumentStatusChange(documentItem, nextStatus) {
    if (!documentItem?.key) {
      return
    }

    const normalizedStatus = normalizeDerivedDocumentStatus(nextStatus)
    const previousStatus = manualDocumentStatusOverrides[documentItem.key]
    setManualDocumentStatusOverrides((previous) => ({
      ...previous,
      [documentItem.key]: normalizedStatus,
    }))

    if (!detail?.transaction?.id || !documentItem.requirementKey) {
      return
    }

    try {
      setUpdatingRequiredDocumentKey(documentItem.key)
      await updateTransactionRequiredDocumentStatus({
        transactionId: detail.transaction.id,
        documentKey: documentItem.requirementKey,
        status: mapUiStatusToRequirement(normalizedStatus),
        actorRole: effectiveEditorRole,
      })
      setClientInfoSavedAt(new Date().toISOString())
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (statusError) {
      setError(statusError?.message || 'Unable to update required document status.')
      setManualDocumentStatusOverrides((previous) => {
        const next = { ...previous }
        if (previousStatus) {
          next[documentItem.key] = previousStatus
        } else {
          delete next[documentItem.key]
        }
        return next
      })
    } finally {
      setUpdatingRequiredDocumentKey('')
    }
  }

  function handleToggleManualSectionCompletion(sectionKey) {
    if (!CLIENT_INFO_SECTION_KEYS.includes(sectionKey)) {
      return
    }

    setManualSectionCompletion((previous) => ({
      ...previous,
      [sectionKey]: !previous[sectionKey],
    }))
  }

  async function handleAddDiscussion(event) {
    event.preventDefault()

    if (!discussionBody.trim() || !detail?.transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const normalizedDiscussion = discussionBody.trim()
      const prefixedDiscussion = normalizedDiscussion.match(/^\[[a-z_ ]+\]/i)
        ? normalizedDiscussion
        : `[${discussionType}] ${normalizedDiscussion}`
      await addTransactionDiscussionComment({
        transactionId: detail.transaction.id,
        authorName:
          detail.transactionParticipants?.find((item) => item.roleType === actingRole)?.participantName ||
          TRANSACTION_ROLE_LABELS[actingRole],
        authorRole: actingRole,
        commentText: prefixedDiscussion,
        unitId: detail.unit.id,
      })
      setDiscussionBody('')
      await loadDetail()
    } catch (discussionError) {
      setError(discussionError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(event) {
    event.preventDefault()

    const file = event.currentTarget.file.files?.[0]
    if (!file || !detail?.transaction?.id) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await uploadDocument({
        transactionId: detail.transaction.id,
        file,
        category: documentCategory,
        isClientVisible: clientVisibleByDefault,
      })
      event.currentTarget.reset()
      await loadDetail()
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleDocumentVisibility(documentId, isClientVisible) {
    try {
      setSaving(true)
      setError('')
      await updateDocumentClientVisibility(documentId, isClientVisible)
      await loadDetail()
    } catch (visibilityError) {
      setError(visibilityError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleSubprocessStepSave(payload) {
    try {
      setSaving(true)
      setError('')
      const previousStep = getWorkflowStepSnapshot(payload.stepId)
      const processLabel = WORKFLOW_PROCESS_LABELS[payload.processType] || 'Workflow'
      const stepLabel = payload.stepLabel || previousStep?.step_label || 'Workflow step'
      const actorName = resolveActingParticipantName()
      const timestampLabel = formatDateTime(new Date().toISOString())

      const systemMessages = []
      const previousStatus = normalizeWorkflowStepStatus(previousStep?.status)
      const nextStatus = normalizeWorkflowStepStatus(payload.status)
      if (previousStatus !== nextStatus) {
        systemMessages.push(
          `${processLabel} updated: ${stepLabel} status changed from ${formatWorkflowStatusValue(previousStatus)} to ${formatWorkflowStatusValue(nextStatus)} by ${actorName} at ${timestampLabel}.`,
        )
      }

      const previousDate = toDateOnlyValue(previousStep?.completed_at)
      const nextDate = toDateOnlyValue(payload.completedAt)
      if (previousDate !== nextDate) {
        const previousDateLabel = previousDate ? formatDate(previousDate) : 'Not set'
        const nextDateLabel = nextDate ? formatDate(nextDate) : 'Not set'
        systemMessages.push(
          `${processLabel} updated: ${stepLabel} date changed from ${previousDateLabel} to ${nextDateLabel} by ${actorName} at ${timestampLabel}.`,
        )
      }

      const previousComment = parseWorkflowStepComment(previousStep?.comment).note
      const nextComment = parseWorkflowStepComment(payload.comment).note
      if (previousComment !== nextComment) {
        systemMessages.push(`${processLabel} updated: ${stepLabel} note updated by ${actorName} at ${timestampLabel}.`)
      }

      const subprocessUpdateResult = await updateTransactionSubprocessStep({
        ...payload,
        actorRole: effectiveEditorRole,
        allowAnyWorkflowEdit: elevatedWorkspaceRoles.includes(effectiveEditorRole),
      })

      if (subprocessUpdateResult?.subprocesses?.length) {
        setDetail((previous) => {
          if (!previous) return previous
          return {
            ...previous,
            transactionSubprocesses: subprocessUpdateResult.subprocesses,
          }
        })
      }

      await postSystemDiscussionUpdates(systemMessages)

      if (detail?.transaction?.id && payload.shareToDiscussion && String(payload.userComment || '').trim()) {
        await addTransactionDiscussionComment({
          transactionId: detail.transaction.id,
          authorName: actorName,
          authorRole: actingRole,
          commentText: `[operational][shared] ${processLabel}: ${stepLabel} note - ${String(payload.userComment || '').trim()}`,
          unitId: detail.unit.id,
        })
      }
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkAllWorkflowComplete({ processId, processType, processLabel, incompleteCount }) {
    if (!detail?.transaction?.id || !processId) {
      return
    }

    const pendingCount = Number(incompleteCount || 0)
    if (!pendingCount) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const actorName = resolveActingParticipantName()
      const timestampLabel = formatDateTime(new Date().toISOString())

      const bulkResult = await completeTransactionSubprocess({
        transactionId: detail.transaction.id,
        subprocessId: processId,
        processType,
        actorRole: effectiveEditorRole,
        allowAnyWorkflowEdit: elevatedWorkspaceRoles.includes(effectiveEditorRole),
      })

      if (bulkResult?.subprocesses?.length) {
        setDetail((previous) => {
          if (!previous) return previous
          return {
            ...previous,
            transactionSubprocesses: bulkResult.subprocesses,
          }
        })
      }

      const completedCount = Number(bulkResult?.updatedSteps || pendingCount)
      const laneLabel = processLabel || WORKFLOW_PROCESS_LABELS[processType] || 'Workflow'
      await postSystemDiscussionUpdates([
        `${laneLabel} updated: ${completedCount} item${completedCount === 1 ? '' : 's'} marked as Complete by ${actorName} at ${timestampLabel}.`,
      ])

      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function ensureOnboardingToken() {
    if (!detail?.transaction?.id) {
      throw new Error('Transaction data is missing.')
    }

    const record = await getOrCreateTransactionOnboarding({
      transactionId: detail.transaction.id,
      purchaserType: detail.transaction?.purchaser_type || detail.purchaserType || 'individual',
    })

    if (record?.token) {
      setDetail((previous) => (previous ? { ...previous, onboarding: record } : previous))
      return record
    }

    throw new Error('Unable to generate onboarding link right now.')
  }

  async function handleCopyOnboardingLink() {
    try {
      const record = detail?.onboarding?.token ? detail.onboarding : await ensureOnboardingToken()
      const url = `${window.location.origin}/client/onboarding/${record.token}`
      await navigator.clipboard.writeText(url)
    } catch (copyError) {
      setError(copyError?.message || 'Unable to copy onboarding link. Please copy it manually from your browser.')
    }
  }

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

  function handleDownloadOnboardingDocument() {
    if (!detail?.onboardingFormData?.formData) {
      setError('No onboarding information has been submitted yet.')
      return
    }

    setError('')

    const content = buildOnboardingPrintHtml({
      buyer: detail.buyer,
      unit: detail.unit,
      transaction: detail.transaction,
      mainStage: detail.mainStage || stageForm.main_stage,
      onboardingStatus: detail.onboarding?.status || 'Not Started',
      resolvedPurchaserTypeLabel: getPurchaserTypeLabel(detail.transaction?.purchaser_type || detail.purchaserType || 'individual'),
      financeLabel: normalizeFinanceType(detail.transaction?.finance_type || 'cash').replace(/\b\w/g, (match) => match.toUpperCase()),
      purchasePriceLabel: currency.format(Number(detail.transaction?.purchase_price || detail.transaction?.sales_price || detail.unit?.price || 0)),
      groupedOnboardingFields,
    })
    openPrintDocument(content, 'Unable to open the onboarding document. Please allow pop-ups and try again.')
  }

  function handlePrintTransactionReport() {
    if (!detail?.transaction?.id) {
      setError('Transaction data is not available yet.')
      return
    }

    setError('')

    const content = buildTransactionReportPrintHtml({
      buyer: detail.buyer,
      unit: detail.unit,
      mainStage: detail.mainStage || stageForm.main_stage,
      progressPercent: stageProgressModel.totalProgressPercent,
      onboardingStatus: detail.onboarding?.status || 'Not Started',
      resolvedPurchaserTypeLabel: resolvedPurchaserTypeLabel || 'Not set',
      financeLabel,
      purchasePriceLabel: currency.format(purchasePriceValue || 0),
      transactionSubprocesses: detail.transactionSubprocesses || [],
      transactionDiscussion: detail.transactionDiscussion || [],
      transactionParticipants: detail.transactionParticipants || [],
    })

    openPrintDocument(content, 'Unable to open the transaction report. Please allow pop-ups and try again.')
  }

  async function handleOpenOnboardingLink() {
    try {
      const record = detail?.onboarding?.token ? detail.onboarding : await ensureOnboardingToken()
      window.open(`/client/onboarding/${record.token}`, '_blank', 'noopener,noreferrer')
    } catch (openError) {
      setError(openError?.message || 'Onboarding link is not available yet for this transaction.')
    }
  }

  function handleOpenClientPortalLink() {
    if (!clientPortalLink?.token) {
      setError('Client portal link is not available yet for this transaction.')
      return
    }

    window.open(`/client/${clientPortalLink.token}`, '_blank', 'noopener,noreferrer')
  }

  async function handleDeleteTransactionFromWorkspace() {
    if (!transaction?.id || !unit?.id) {
      setError('Transaction data is not available for deletion.')
      return
    }

    const unitNumber = unit?.unit_number || 'this unit'
    const confirmed = window.confirm(
      `Delete this transaction for Unit ${unitNumber} and reset the unit to Available? This removes linked workflow, onboarding, and transaction records.`,
    )
    if (!confirmed) {
      return
    }

    try {
      setError('')
      setDeletingTransaction(true)
      await deleteTransactionEverywhere({
        transactionId: transaction.id,
        unitId: unit.id,
      })
      window.dispatchEvent(new Event('itg:transaction-updated'))
      navigate('/units')
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete this transaction.')
    } finally {
      setDeletingTransaction(false)
    }
  }

  async function handleSignOffIssue(issueId) {
    if (!transaction?.id) {
      throw new Error('Save the transaction before signing off on snags.')
    }

    await signOffClientIssue(issueId, actingRole || 'developer')
  }

  if (!isSupabaseConfigured) {
    return <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">Supabase is not configured for this workspace.</p>
  }

  if (loading) {
    return <LoadingSkeleton lines={12} className={PANEL_SHELL} />
  }

  if (!detail) {
    return <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">Unit not found.</p>
  }

  const {
    unit,
    buyer,
    transaction,
    documents,
    requiredDocumentChecklist,
    stage,
    clientIssues,
    alterationRequests,
    developmentSettings,
    transactionSubprocesses,
    mainStage,
    onboarding,
    purchaserTypeLabel,
    transactionParticipants,
    activeViewerPermissions,
    transactionDiscussion,
    onboardingFormData,
  } = detail

  const isRegisteredUnit = mainStage === 'REG' || /registered/i.test(String(stage || ''))
  const elevatedWorkspaceRoles = ['developer', 'internal_admin', 'agent', 'attorney']
  const hasWorkspaceEditOverride = elevatedWorkspaceRoles.includes(workspaceRole)
  const effectiveEditorRole = hasWorkspaceEditOverride ? workspaceRole : actingRole

  const isAttorneyLens = workspaceRole === 'attorney' || actingRole === 'attorney'
  const canSeeAttorneyCloseout = ['developer', 'internal_admin', 'attorney'].includes(effectiveEditorRole)
  const purchasePriceValue = Number(transaction?.purchase_price || transaction?.sales_price || unit?.price || 0)
  const financeLabel = transaction?.finance_type ? normalizeFinanceType(transaction.finance_type) : 'n/a'
  const mainStageLabel = MAIN_STAGE_LABELS[mainStage] || mainStage
  const resolvedPurchaserTypeLabel = purchaserTypeLabel || getPurchaserTypeLabel(transaction?.purchaser_type)
  const onboardingStatus = onboarding?.status || 'Not Started'
  const stageProgressModel = buildTransactionStageProgressModel({
    mainStage,
    transaction,
    unit,
    buyer,
    subprocesses: transactionSubprocesses || [],
    documents: documents || [],
    requiredDocumentChecklist: requiredDocumentChecklist || [],
    onboardingStatus,
    comments: transactionDiscussion || [],
    updatedAt: transaction?.updated_at || transaction?.created_at,
  })
  const onboardingComplete = ['Submitted', 'Reviewed', 'Approved'].includes(onboardingStatus)
  const alterationTotalAmount = (alterationRequests || []).reduce((sum, request) => sum + (Number(request.amount_inc_vat) || 0), 0)

  async function handleCreateAlteration(payload) {
    if (!transaction?.id || !unit) {
      throw new Error('Save the transaction before recording an alteration.')
    }

    try {
      setCreatingAlteration(true)
      setAlterationCreationError('')
      await createWorkspaceAlteration({
        developmentId: unit.development_id,
        unitId: unit.id,
        transactionId: transaction.id,
        buyerId: buyer?.id || null,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        amountIncVat: payload.amountIncVat,
        invoiceFile: payload.invoiceFile,
        proofFile: payload.proofFile,
      })
      return true
    } catch (creationError) {
      const message = creationError?.message || 'Unable to record alteration.'
      setAlterationCreationError(message)
      throw creationError
    } finally {
      setCreatingAlteration(false)
    }
  }
  const actingParticipant = (transactionParticipants || []).find((item) => item.roleType === actingRole) || null
  const actingPermissions = actingParticipant
    ? {
        canView: actingParticipant.canView,
        canComment: actingParticipant.canComment,
        canUploadDocuments: actingParticipant.canUploadDocuments,
        canEditFinanceWorkflow: actingParticipant.canEditFinanceWorkflow,
        canEditAttorneyWorkflow: actingParticipant.canEditAttorneyWorkflow,
        canEditCoreTransaction: actingParticipant.canEditCoreTransaction,
      }
    : activeViewerPermissions || {
        canView: true,
        canComment: true,
        canUploadDocuments: true,
        canEditFinanceWorkflow: true,
        canEditAttorneyWorkflow: true,
        canEditCoreTransaction: true,
      }
  const canCommentInWorkspace = Boolean(actingPermissions.canComment)
  const canUploadDocuments = Boolean(actingPermissions.canUploadDocuments)
  const canEditCoreTransaction = Boolean(actingPermissions.canEditCoreTransaction)
  const canEditWorkflowFromWorkspace = elevatedWorkspaceRoles.includes(effectiveEditorRole)
  const canEditMainStage = elevatedWorkspaceRoles.includes(effectiveEditorRole)
  const clientInfoFinanceValidation = validateClientInformationFinance(clientInfoForm)
  const systemDiscussionCount = (transactionDiscussion || []).filter(
    (item) => item.discussionType === SYSTEM_DISCUSSION_TYPE,
  ).length
  const manualDiscussionCount = (transactionDiscussion || []).length - systemDiscussionCount
  const visibleDiscussionItems = (transactionDiscussion || []).filter((item) => {
    if (discussionFeedFilter === 'system') {
      return item.discussionType === SYSTEM_DISCUSSION_TYPE
    }
    if (discussionFeedFilter === 'manual') {
      return item.discussionType !== SYSTEM_DISCUSSION_TYPE
    }
    return true
  })
  const uploadedDocs = Number(detail.documentSummary?.uploadedCount || 0)
  const requiredDocs = Number(detail.documentSummary?.totalRequired || 0)
  const documentReadinessText = requiredDocs > 0 ? `${uploadedDocs}/${requiredDocs} uploaded` : 'Not configured'
  const normalizedPurchaserType = normalizePurchaserType(stageForm.purchaser_type || transaction?.purchaser_type || 'individual')
  const normalizedClientFinanceType = normalizeFinanceType(
    clientInfoForm.finance_type || stageForm.finance_type || transaction?.finance_type || 'cash',
  )
  const dynamicRequiredDocuments = buildDynamicRequiredDocuments({
    purchaserType: normalizedPurchaserType,
    financeType: normalizedClientFinanceType,
    requiredChecklist: requiredDocumentChecklist || [],
    statusOverrides: manualDocumentStatusOverrides,
  })
  const completedDerivedRequiredDocs = dynamicRequiredDocuments.filter((item) => item.status !== 'missing').length
  const derivedRequiredDocsTotal = dynamicRequiredDocuments.length
  const derivedRequiredDocsMissing = Math.max(derivedRequiredDocsTotal - completedDerivedRequiredDocs, 0)
  const derivedRequiredDocsProgressPercent = derivedRequiredDocsTotal
    ? Math.round((completedDerivedRequiredDocs / derivedRequiredDocsTotal) * 100)
    : 0
  const suggestedNextActions = getSuggestedNextActions({
    onboardingMode,
    onboardingStatus: clientInfoForm.onboarding_status || onboardingStatus,
    financeType: normalizedClientFinanceType,
    missingRequiredCount: derivedRequiredDocsMissing,
  })
  const activeNextActionRecommendation = suggestedNextActions[0] || 'Ready for transfer preparation'
  const allManualSectionsCompleted = CLIENT_INFO_SECTION_KEYS.every((key) => manualSectionCompletion[key])

  const reportGeneratedAt = formatDateTime(new Date())
  const workflowFocusLane =
    workspaceLandingMode === 'my_lane'
      ? actingRole === 'attorney'
        ? 'attorney'
        : actingRole === 'bond_originator' && String(transaction?.finance_managed_by || 'bond_originator') === 'bond_originator'
          ? 'finance'
          : actingRole === 'developer' || actingRole === 'internal_admin'
            ? 'all'
            : null
      : null
  const financeStatusLabel = (() => {
    if (financeLabel === 'cash') {
      return 'Cash Purchase'
    }
    if (['ATTY', 'XFER', 'REG'].includes(mainStage) || stage === 'Bond Approved / Proof of Funds') {
      return 'Bond Approved'
    }
    if (mainStage === 'FIN') {
      return 'Awaiting Bond Approval'
    }
    return 'Finance Pending'
  })()
  const registeredAt = transaction?.updated_at || transaction?.created_at || null
  const ownerDisplayName = buyer?.name || 'Owner not assigned'
  const onboardingFieldEntries = Object.entries(onboardingFormData?.formData || {})
    .filter(([key]) => !isOnboardingMetaKey(key))
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .sort(([left], [right]) => left.localeCompare(right))
  const groupedOnboardingFields = groupOnboardingFieldEntries(onboardingFieldEntries)
  const identityAddressEntries = filterOnboardingEntriesByKeywords(onboardingFieldEntries, [
    'identity',
    'id_number',
    'passport',
    'nationality',
    'residency',
    'tax',
    'address',
    'street',
    'suburb',
    'city',
    'postal',
    'province',
  ])
  const employmentIncomeEntries = filterOnboardingEntriesByKeywords(onboardingFieldEntries, [
    'employment',
    'employer',
    'job',
    'occupation',
    'income',
    'salary',
    'business',
    'retired',
    'contract',
    'dependant',
    'credit_commitment',
  ])
  const purchaseStructureEntries = filterOnboardingEntriesByKeywords(onboardingFieldEntries, [
    'purchaser',
    'co_purchaser',
    'spouse',
    'marital',
    'marriage',
    'regime',
    'company',
    'trust',
    'trustee',
    'signatory',
    'entity',
    'finance_type',
    'bond',
    'cash',
    'investment',
    'first_time_buyer',
    'primary_residence',
  ])
  const purchaseRecordDocuments = (documents || []).filter((item) => !/(handover|snag|warranty|occupation|alteration)/i.test(`${item?.name || ''} ${item?.category || ''}`))
  const unitLifecycleDocuments = (documents || []).filter((item) => /(handover|snag|warranty|occupation|alteration)/i.test(`${item?.name || ''} ${item?.category || ''}`))
  const developmentModuleState = developmentSettings?.enabledModules || {}
  const developmentTeams = developmentSettings?.stakeholderTeams || {}
  const agentOptions = developmentTeams.agents || []
  const conveyancerOptions = developmentTeams.conveyancers || []
  const bondOriginatorOptions = developmentTeams.bondOriginators || []

  function handleAgentSelection(value) {
    const selected = agentOptions.find((item) => String(item.email || item.name) === value)
    if (!selected) {
      return
    }

    setStageForm((previous) => ({
      ...previous,
      assigned_agent: selected.name || previous.assigned_agent,
      assigned_agent_email: selected.email || previous.assigned_agent_email,
    }))
  }

  function handleConveyancerSelection(value) {
    const selected = conveyancerOptions.find((item) => String(item.email || item.firmName) === value)
    if (!selected) {
      return
    }

    setStageForm((previous) => ({
      ...previous,
      attorney: selected.firmName || selected.contactName || previous.attorney,
      assigned_attorney_email: selected.email || previous.assigned_attorney_email,
    }))
  }

  function handleBondOriginatorSelection(value) {
    const selected = bondOriginatorOptions.find((item) => String(item.email || item.name) === value)
    if (!selected) {
      return
    }

    setStageForm((previous) => ({
      ...previous,
      bond_originator: selected.name || previous.bond_originator,
      assigned_bond_originator_email: selected.email || previous.assigned_bond_originator_email,
    }))
  }

  const workspaceMenus = [
    { id: 'overview', label: 'Overview', meta: isRegisteredUnit ? 'Unit summary' : 'Transaction summary' },
    { id: 'onboarding', label: 'Client Information', meta: onboardingStatus },
    { id: 'documents', label: 'Documents', meta: `${documents?.length || 0} files` },
    { id: 'alterations', label: 'Alterations', meta: developmentSettings?.alteration_requests_enabled ? `${alterationRequests?.length || 0} requests` : 'Module off' },
    { id: 'snags', label: 'Snags', meta: developmentSettings?.snag_reporting_enabled ? `${clientIssues?.length || 0} logged` : 'Module off' },
  ]
  const activeWorkspaceMenu = workspaceMenus.some((tab) => tab.id === workspaceMenu) ? workspaceMenu : 'overview'
  const showOverviewWorkspaceHero = activeWorkspaceMenu === 'overview'
  const workflowOverviewSection = (
    <div ref={workflowPanelRef} className="no-print">
      <SubprocessWorkflowPanel
        subprocesses={transactionSubprocesses || []}
        documents={documents || []}
        saving={saving}
        disabled={!transaction?.id}
        roleLabel={TRANSACTION_ROLE_LABELS[actingRole] || actingRole}
        canEditFinanceWorkflow={canEditWorkflowFromWorkspace || Boolean(actingPermissions.canEditFinanceWorkflow)}
        canEditAttorneyWorkflow={canEditWorkflowFromWorkspace || Boolean(actingPermissions.canEditAttorneyWorkflow)}
        focusMode={workspaceLandingMode}
        focusLane={workflowFocusLane}
        allowCollapse={false}
        embedded
        hideSectionHeader
        onSaveStep={handleSubprocessStepSave}
        onMarkAllComplete={handleMarkAllWorkflowComplete}
        onDocumentUploaded={loadDetail}
      />
    </div>
  )

  const workspaceFallback = (
    <section className="space-y-4">
      <section className={PANEL_SHELL}>
        <div className="flex flex-col gap-5">
          <div className="min-w-0">
            <span className="text-[0.78rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Transaction Workspace</span>
            <h1 className="mt-3 text-[2rem] font-semibold tracking-[-0.04em] text-[#142132]">
              {unit.development?.name || 'Property Transaction'} • Unit {unit.unit_number}
            </h1>
            <p className="mt-3 text-[1rem] text-[#6b7d93]">{buyer?.name || 'Buyer not assigned yet'}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Current Stage', mainStageLabel],
              ['Purchase Price', currency.format(purchasePriceValue || 0)],
              ['Onboarding', onboardingStatus],
              [
                'Time In Stage',
                <StageAgingChip key="fallback-stage-age" stage={stage} updatedAt={transaction?.updated_at || transaction?.created_at} />,
              ],
            ].map(([label, value]) => (
              <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <WorkspacePanel
        title="Workspace Summary"
        copy="The full transaction workspace hit a render issue, so this safe fallback is shown instead."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[
            ['Development', unit.development?.name || 'Not set'],
            ['Unit', unit.unit_number || 'Not set'],
            ['Buyer', buyer?.name || 'Buyer not assigned yet'],
            ['Finance Type', financeLabel],
            ['Documents', documentReadinessText],
          ].map(([label, value]) => (
            <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
              <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
              <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
            </article>
          ))}
        </div>
      </WorkspacePanel>
    </section>
  )

  let workspaceContent

  try {
    workspaceContent = (
      <SharedTransactionShell
      printTitle="Unit Transaction Report"
      printSubtitle={`${unit.development?.name || '-'} • Unit ${unit.unit_number}`}
      printGeneratedAt={reportGeneratedAt}
      errorMessage={error}
      headline={showOverviewWorkspaceHero ? (
        <section className={`${PANEL_SHELL} relative overflow-hidden`}>
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(53,84,108,0.08)_0%,rgba(53,84,108,0)_100%)]" />
          <div className="relative flex flex-col gap-5">
            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-start">
              <div className="min-w-0">
                <span className="inline-flex items-center rounded-full border border-[#d9e4ef] bg-white/90 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#61758d] shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  Transaction Workspace
                </span>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <h1 className="text-[2.4rem] font-semibold leading-none tracking-[-0.06em] text-[#142132]">
                    {unit.development?.name || 'Property Transaction'}
                  </h1>
                  <span className="text-[1.8rem] font-medium leading-none text-[#a8b6c6]">|</span>
                  <span className="inline-flex items-center rounded-full border border-[#d7e2ee] bg-[#f8fbfe] px-4 py-2 text-[1rem] font-semibold text-[#35546c] shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
                    Unit {unit.unit_number}
                  </span>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-[#6b7d93]">
                  Direct transaction control for onboarding, finance, transfer workflow, and the live purchase record.
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {[
                    {
                      label: buyer?.name ? buyer.name : 'Buyer pending',
                      icon: <UserRound size={14} className="text-current" />,
                      className: buyer?.name
                        ? 'border-[#d8e7f6] bg-[#f6fbff] text-[#35546c]'
                        : 'border-[#f3d6a4] bg-[#fff9ef] text-[#a56a16]',
                    },
                    {
                      label: mainStageLabel,
                      icon: <Building2 size={14} className="text-current" />,
                      className: 'border-[#d8e7f6] bg-[#f6fbff] text-[#35546c]',
                    },
                    {
                      label: unit?.status ? toTitleLabel(unit.status) : 'Unit active',
                      icon: <Building2 size={14} className="text-current" />,
                      className: 'border-[#dbe5ef] bg-white text-[#5a6f86]',
                    },
                    {
                      label: `Onboarding ${onboardingStatus}`,
                      icon: <Link2 size={14} className="text-current" />,
                      className: onboardingComplete
                        ? 'border-[#cfe8da] bg-[#effaf3] text-[#22824d]'
                        : 'border-[#d8e7f6] bg-[#f6fbff] text-[#35546c]',
                    },
                  ].map((chip) => (
                    <span
                      key={chip.label}
                      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[0.82rem] font-semibold shadow-[0_8px_20px_rgba(15,23,42,0.04)] ${chip.className}`}
                    >
                      {chip.icon}
                      {chip.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="no-print flex flex-wrap items-center gap-3 2xl:justify-end">
              <Button variant="secondary" className="min-w-[158px]" onClick={handlePrintTransactionReport}>
                <Printer size={14} />
                Print Report
              </Button>
              <Button variant="secondary" className="min-w-[198px]" onClick={handleOpenClientPortalLink} disabled={!clientPortalLink?.token}>
                <ExternalLink size={14} />
                Client Portal
              </Button>
              <Button className="min-w-[232px]" onClick={handleCopyOnboardingLink} disabled={!onboarding?.token}>
                <Link2 size={14} />
                Generate Onboarding Link
              </Button>
              <Button
                variant="ghost"
                className="min-w-[192px] text-[#b42318] hover:bg-[#fff1f1]"
                onClick={() => void handleDeleteTransactionFromWorkspace()}
                disabled={!transaction?.id || deletingTransaction}
              >
                {deletingTransaction ? 'Deleting…' : 'Delete Transaction'}
              </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {[
                [
                  'Current Stage',
                  mainStageLabel,
                  financeLabel === 'n/a' ? 'Finance not assigned yet' : `Finance: ${financeLabel}`,
                  <Building2 key="stage-icon" size={16} className="text-[#35546c]" />,
                ],
                [
                  'Purchase Price',
                  currency.format(purchasePriceValue || 0),
                  financeStatusLabel,
                  <CircleDollarSign key="price-icon" size={16} className="text-[#35546c]" />,
                ],
                [
                  'Onboarding',
                  onboardingStatus,
                  onboarding?.token ? 'Link ready to share' : 'Link not available yet',
                  <UserRound key="onboarding-icon" size={16} className="text-[#35546c]" />,
                ],
                [
                  'Time In Stage',
                  <StageAgingChip key="stage-age" stage={stage} updatedAt={transaction?.updated_at || transaction?.created_at} />,
                  `Updated ${formatDate(transaction?.updated_at || transaction?.created_at)}`,
                  <Clock3 key="time-icon" size={16} className="text-[#35546c]" />,
                ],
              ].map(([label, value, meta, icon]) => (
                <article key={label} className="rounded-[22px] border border-[#e0e8f1] bg-white/90 px-4 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="block text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">{label}</span>
                      <strong className="mt-2 block text-[1.12rem] font-semibold tracking-[-0.03em] text-[#142132]">{value}</strong>
                      <span className="mt-1.5 block text-sm text-[#71839a]">{meta}</span>
                    </div>
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#edf4fb]">
                      {icon}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    >
      <div className="space-y-4">
        {showOverviewWorkspaceHero ? (
          <section className="rounded-[28px] border border-[#e5e7eb] bg-[#f7f8fa] p-6 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
            <div>
              <div className="rounded-[24px] border border-[#e5e7eb] bg-white px-4 py-5 shadow-[0_8px_18px_rgba(15,23,42,0.04)] md:px-5">
                <ProgressTimeline
                  currentStage={mainStage}
                  stages={MAIN_PROCESS_STAGES}
                  stageLabelMap={MAIN_STAGE_LABELS}
                  framed={false}
                  progressPercent={stageProgressModel.totalProgressPercent}
                  blockersByStage={stageProgressModel.stepBlockersByStage}
                  helperText={
                    stageProgressModel.currentStageBlockers.length
                      ? `Blockers: ${stageProgressModel.currentStageBlockers.slice(0, 2).join(' • ')}`
                      : `${mainStageLabel} is currently healthy.`
                  }
                  lastUpdatedLabel={stageProgressModel.latestUpdatedLabel}
                  onStageClick={canEditMainStage ? (stageOption) => openStageEditor(stageOption) : null}
                  isStageSelectable={(stageOption) => stageOption !== mainStage && stageProgressModel.canMoveTo(stageOption)}
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e7eb] pt-4">
                  <p className="text-sm text-[#4b5563]">
                    {canEditMainStage
                      ? 'Click a stage above to move the macro stage once required tasks are complete.'
                      : 'Stage updates are read-only for your current role.'}
                  </p>
                  <span className="inline-flex items-center rounded-full border border-[#dfe3e8] bg-white px-3 py-1 text-[0.72rem] font-semibold text-[#4b5563]">
                    Stage = macro, Progress = workflow completion
                  </span>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {stageEditor.open ? (
          <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[rgba(15,23,42,0.4)] p-4 no-print" onClick={closeStageEditor}>
            <form
              onSubmit={handleConfirmMainStageUpdate}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-[520px] rounded-[24px] border border-[#e3ebf4] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.22)]"
            >
              <div className="border-b border-[#e8eef5] pb-4">
                <h3 className="text-[1.16rem] font-semibold tracking-[-0.03em] text-[#142132]">Move transaction stage</h3>
                <p className="mt-2 text-sm leading-6 text-[#6b7d93]">
                  Move from <strong>{MAIN_STAGE_LABELS[mainStage] || mainStage}</strong> to{' '}
                  <strong>{MAIN_STAGE_LABELS[stageEditor.targetStage] || stageEditor.targetStage}</strong>?
                </p>
              </div>

              <label className="mt-5 grid gap-2 text-sm font-medium text-[#35546c]">
                <span>Optional note</span>
                <Field
                  as="textarea"
                  rows={3}
                  value={stageEditor.note}
                  onChange={(event) => setStageEditor((previous) => ({ ...previous, note: event.target.value }))}
                  placeholder="Add context for this stage movement..."
                />
              </label>

              <div className="mt-6 flex justify-end gap-3 border-t border-[#e8eef5] pt-4">
                <button
                  type="button"
                  onClick={closeStageEditor}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-[12px] border border-[#dde4ee] bg-white px-4 py-2 text-sm font-semibold text-[#4f647a] transition hover:bg-[#f8fafc]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex min-h-[40px] items-center justify-center rounded-[12px] border border-transparent bg-[#d97706] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#b15f07] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? 'Updating...' : 'Confirm Stage Move'}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <section ref={workspaceMenuRef} className={`${PANEL_COMPACT} no-print`}>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
            <h3 className="text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Unit Workspace</h3>
            <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Post-registration workspace for handover, support activity, documents, and the completed purchase record.</p>
            </div>
            <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.74rem] font-semibold text-[#66758b]">
              {workspaceMenus.length} sections
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-5" role="tablist" aria-label="Unit workspace tabs">
            {workspaceMenus.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeWorkspaceMenu === tab.id}
                className={[
                  'inline-flex min-h-[58px] flex-col items-center justify-center rounded-[18px] border px-4 py-3 text-sm font-semibold transition duration-150 ease-out',
                  activeWorkspaceMenu === tab.id
                    ? 'border-[#cfe1f7] bg-[#35546c] text-white shadow-[0_12px_28px_rgba(15,23,42,0.12)]'
                    : 'border-[#edf2f7] bg-[#f8fafc] text-[#4f647a] hover:border-[#dde4ee] hover:bg-white',
                ].join(' ')}
                onClick={() => setWorkspaceMenu(tab.id)}
              >
                <span>{tab.label}</span>
                {tab.meta ? <em className={`mt-1 text-[0.72rem] not-italic ${activeWorkspaceMenu === tab.id ? 'text-white/80' : 'text-[#8aa0b8]'}`}>{tab.meta}</em> : null}
              </button>
            ))}
          </div>
        </section>

        {activeWorkspaceMenu === 'overview' ? (
          <>
            <WorkspacePanel
              title="Comments & Updates"
              copy="Shared timeline for system events and manual transaction updates."
              className="no-print bg-[#f9fbfe]"
            >
              <div
                ref={discussionPanelRef}
                className="flex h-[620px] min-h-[520px] flex-col gap-4 overflow-hidden"
              >
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2">
                    {[
                      { key: 'all', label: 'All', count: (transactionDiscussion || []).length },
                      { key: 'system', label: 'System', count: systemDiscussionCount },
                      { key: 'manual', label: 'Manual', count: manualDiscussionCount },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={[
                          'inline-flex min-h-[36px] items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition duration-150 ease-out',
                          discussionFeedFilter === option.key
                            ? 'border-[#cbdcf1] bg-white text-[#132131] shadow-[0_8px_20px_rgba(15,23,42,0.08)]'
                            : 'border-[#e1e9f2] bg-[#f4f7fb] text-[#647a93] hover:border-[#d2deea] hover:bg-white',
                        ].join(' ')}
                        onClick={() => setDiscussionFeedFilter(option.key)}
                      >
                        <span>{option.label}</span>
                        <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#edf3fa] px-1.5 text-[0.68rem] text-[#5d7289]">
                          {option.count}
                        </span>
                      </button>
                    ))}
                  </div>
                  <span className="inline-flex items-center rounded-full border border-[#e0e8f1] bg-white px-3 py-1 text-[0.72rem] font-semibold text-[#6d8198]">
                    Activity timeline
                  </span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <div className="space-y-3 pb-1">
                    {visibleDiscussionItems.map((comment) => {
                      const commentBody = sanitizeCommentBody(comment.commentBody || comment.commentText, comment, {
                        buyer,
                        transactionParticipants,
                      })
                      const commentType = comment.discussionType || 'operational'
                      const isSystemComment = commentType === SYSTEM_DISCUSSION_TYPE
                      const commentAuthorName = resolveCommentAuthorName(comment, { buyer, transactionParticipants })
                      const cardData = buildDiscussionCardData({
                        commentBody,
                        discussionType: commentType,
                      })

                      return (
                        <article
                          key={comment.id}
                          className={[
                            'rounded-[20px] border px-5 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]',
                            isSystemComment ? 'border-[#efe1cf] bg-white' : 'border-[#e1e9f2] bg-white',
                          ].join(' ')}
                        >
                          <header className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">{cardData.title}</h4>
                              <p className="mt-1 text-xs text-[#7c8ea4]">
                                {commentAuthorName} • {comment.authorRoleLabel || TRANSACTION_ROLE_LABELS[comment.authorRole] || 'Participant'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={[
                                  'inline-flex items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em]',
                                  isSystemComment
                                    ? 'border-[#f2ddc1] bg-[#fff4e7] text-[#9a5a1a]'
                                    : 'border-[#dce5ef] bg-[#f7f9fc] text-[#66758b]',
                                ].join(' ')}
                              >
                                {toTitleLabel(commentType)}
                              </span>
                              <em className="text-xs not-italic text-[#7c8ea4]">{formatDateTime(comment.createdAt)}</em>
                            </div>
                          </header>

                          <div className="mt-4 rounded-[14px] border border-[#edf2f8] bg-[#f8fbff] px-4 py-3">
                            <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8ca0b6]">Update</span>
                            <strong className="mt-1 block text-sm font-semibold text-[#24384c]">{cardData.summary}</strong>
                          </div>

                          {cardData.detail && cardData.detail !== cardData.summary ? (
                            <p className="mt-3 text-sm leading-6 text-[#2a3f53]">{cardData.detail}</p>
                          ) : null}
                        </article>
                      )
                    })}
                    {!visibleDiscussionItems.length ? (
                      <p className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-5 py-6 text-sm text-[#6b7d93]">
                        No updates match the current filter.
                      </p>
                    ) : null}
                  </div>
                </div>

                <form
                  onSubmit={handleAddDiscussion}
                  className="shrink-0 rounded-[20px] border border-[#dce6f1] bg-white px-5 py-5 shadow-[0_14px_30px_rgba(15,23,42,0.05)]"
                >
                  <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end">
                    <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                      <span>Update Type</span>
                      <Field as="select" value={discussionType} onChange={(event) => setDiscussionType(event.target.value)}>
                        <option value="operational">Operational</option>
                        <option value="blocker">Blocker</option>
                        <option value="document">Document</option>
                        <option value="decision">Decision</option>
                        <option value="client">Client</option>
                      </Field>
                    </label>
                    <p className="text-sm leading-6 text-[#6b7d93]">
                      Stage and workflow updates post into this feed automatically.
                    </p>
                    <div className="flex justify-start md:justify-end">
                      <Button type="submit" disabled={saving || !discussionBody.trim() || !canCommentInWorkspace}>
                        Post Update
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[16px] border border-[#e3ebf4] bg-[#f9fbff] p-3">
                    <Field
                      as="textarea"
                      rows={4}
                      value={discussionBody}
                      onChange={(event) => setDiscussionBody(event.target.value)}
                      placeholder="Write a concise update for the activity feed..."
                    />
                  </div>
                  {!canCommentInWorkspace ? <p className="mt-3 text-sm text-[#6b7d93]">Your current role can view updates but cannot post comments.</p> : null}
                </form>
              </div>
            </WorkspacePanel>

            <div className="no-print">{workflowOverviewSection}</div>

            {!isAttorneyLens ? (
              <WorkspacePanel
                title="Role Assignments"
                copy="Clear ownership across sales, conveyancing, and finance."
                className="no-print"
              >
                {canEditCoreTransaction ? (
                  <form onSubmit={handleTransactionSave} className="grid gap-4">
                    <div className="grid gap-4 xl:grid-cols-3">
                      <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                        <h4 className="text-sm font-semibold text-[#142132]">Sales ownership</h4>
                        <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Commercial ownership for this transaction.</p>
                        <div className="mt-4 grid gap-3">
                          {developmentModuleState.agent && agentOptions.length ? (
                            <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                              <span>Development Agent</span>
                              <Field as="select" value={stageForm.assigned_agent_email || ''} onChange={(event) => handleAgentSelection(event.target.value)}>
                                <option value="">Select agent</option>
                                {agentOptions.map((item, index) => (
                                  <option key={`${item.email || item.name || 'agent'}-${index}`} value={item.email || item.name}>
                                    {item.name}{item.company ? ` • ${item.company}` : ''}
                                  </option>
                                ))}
                              </Field>
                            </label>
                          ) : null}
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Assigned Agent</span>
                            <Field
                              type="text"
                              value={stageForm.assigned_agent}
                              onChange={(event) => setStageForm((previous) => ({ ...previous, assigned_agent: event.target.value }))}
                            />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Agent Email</span>
                            <Field
                              type="email"
                              value={stageForm.assigned_agent_email}
                              onChange={(event) => setStageForm((previous) => ({ ...previous, assigned_agent_email: event.target.value }))}
                            />
                          </label>
                        </div>
                      </section>

                      <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                        <h4 className="text-sm font-semibold text-[#142132]">Conveyancing ownership</h4>
                        <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Transfer lane owner and contact details.</p>
                        <div className="mt-4 grid gap-3">
                          {developmentModuleState.conveyancing && conveyancerOptions.length ? (
                            <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                              <span>Development Conveyancer</span>
                              <Field as="select" value={stageForm.assigned_attorney_email || ''} onChange={(event) => handleConveyancerSelection(event.target.value)}>
                                <option value="">Select conveyancer</option>
                                {conveyancerOptions.map((item, index) => (
                                  <option key={`${item.email || item.firmName || 'conveyancer'}-${index}`} value={item.email || item.firmName}>
                                    {item.firmName}{item.contactName ? ` • ${item.contactName}` : ''}
                                  </option>
                                ))}
                              </Field>
                            </label>
                          ) : null}
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Attorney / Conveyancer</span>
                            <Field
                              type="text"
                              value={stageForm.attorney}
                              onChange={(event) => setStageForm((previous) => ({ ...previous, attorney: event.target.value }))}
                            />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Attorney Email</span>
                            <Field
                              type="email"
                              value={stageForm.assigned_attorney_email}
                              onChange={(event) => setStageForm((previous) => ({ ...previous, assigned_attorney_email: event.target.value }))}
                            />
                          </label>
                        </div>
                      </section>

                      <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                        <h4 className="text-sm font-semibold text-[#142132]">Finance ownership</h4>
                        <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Bond lane ownership and finance operator.</p>
                        <div className="mt-4 grid gap-3">
                          {developmentModuleState.bond_originator && bondOriginatorOptions.length ? (
                            <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                              <span>Development Bond Originator</span>
                              <Field as="select" value={stageForm.assigned_bond_originator_email || ''} onChange={(event) => handleBondOriginatorSelection(event.target.value)}>
                                <option value="">Select bond originator</option>
                                {bondOriginatorOptions.map((item, index) => (
                                  <option key={`${item.email || item.name || 'originator'}-${index}`} value={item.email || item.name}>
                                    {item.name}{item.contactName ? ` • ${item.contactName}` : ''}
                                  </option>
                                ))}
                              </Field>
                            </label>
                          ) : null}
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Bond Originator</span>
                            <Field
                              type="text"
                              value={stageForm.bond_originator}
                              onChange={(event) => setStageForm((previous) => ({ ...previous, bond_originator: event.target.value }))}
                            />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Bond Originator Email</span>
                            <Field
                              type="email"
                              value={stageForm.assigned_bond_originator_email}
                              onChange={(event) =>
                                setStageForm((previous) => ({
                                  ...previous,
                                  assigned_bond_originator_email: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Finance Managed By</span>
                            <Field
                              as="select"
                              value={stageForm.finance_managed_by}
                              onChange={(event) => setStageForm((previous) => ({ ...previous, finance_managed_by: event.target.value }))}
                            >
                              {FINANCE_MANAGED_BY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option.replaceAll('_', ' ')}
                                </option>
                              ))}
                            </Field>
                          </label>
                        </div>
                      </section>
                    </div>

                    <div className="flex justify-end border-t border-[#e6edf5] pt-4">
                      <Button type="submit" disabled={saving || !canEditCoreTransaction}>
                        Save Role Assignments
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                    This role can view transaction ownership, but only internal users with core transaction permissions can change assignments.
                  </div>
                )}
              </WorkspacePanel>
            ) : null}

            <AttorneyCloseoutPanel
              transaction={transaction}
              unit={unit}
              buyer={buyer}
              visible={Boolean(isRegisteredUnit && canSeeAttorneyCloseout)}
            />

          </>
        ) : null}

        {activeWorkspaceMenu === 'onboarding' ? (
          <div className="space-y-4">
            <WorkspacePanel
              title="Client Information"
              copy="Buyer onboarding control panel for manual alignment, finance structure, and required-document readiness."
              actions={
                <div className="no-print flex flex-wrap gap-3">
                  <Button
                    variant="secondary"
                    onClick={handleDownloadOnboardingDocument}
                    disabled={!onboardingFormData?.formData}
                  >
                    Download Onboarding
                  </Button>
                  {!onboardingComplete && onboardingMode !== 'manual' ? (
                    <Button variant="secondary" onClick={handleOpenOnboardingLink} disabled={!onboarding?.token}>
                      Open Onboarding
                    </Button>
                  ) : null}
                  <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-[#f7f9fc] px-3 py-1 text-[0.78rem] font-semibold text-[#66758b]">
                    {onboardingStatus}
                  </span>
                  {clientInfoSavedAt ? (
                    <span className="inline-flex items-center rounded-full border border-[#d5e8dd] bg-[#eef9f3] px-3 py-1 text-[0.78rem] font-semibold text-[#1c7d45]">
                      Saved {formatDateTime(clientInfoSavedAt)}
                    </span>
                  ) : null}
                </div>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ['Purchaser', ownerDisplayName],
                  ['Purchaser Type', getPurchaserTypeLabel(normalizedPurchaserType)],
                  ['Finance Type', normalizedClientFinanceType === 'combination' ? 'Hybrid' : normalizedClientFinanceType.replace(/\b\w/g, (match) => match.toUpperCase())],
                  ['Purchase Price', currency.format(Number(clientInfoForm.purchase_price || purchasePriceValue || 0))],
                  ['Onboarding Status', clientInfoForm.onboarding_status || onboardingStatus],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                    <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
                  </article>
                ))}
              </div>

              {canEditCoreTransaction ? (
                <form onSubmit={handleClientInformationSave} className="mt-5 rounded-[20px] border border-[#dbe5ef] bg-white px-5 py-5 shadow-[0_12px_26px_rgba(15,23,42,0.05)]">
                  <div className="mb-6">
                    <h4 className="text-base font-semibold text-[#142132]">Buyer Onboarding Control Panel</h4>
                    <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">
                      Manage manual onboarding, transaction alignment, and required-document readiness from one structured surface.
                    </p>
                  </div>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]">
                    <section className="space-y-6 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-5">
                      <header>
                        <h5 className="text-sm font-semibold text-[#142132]">Buyer Record</h5>
                        <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Primary purchaser profile used for contract drafting, FICA readiness, and bond processing.</p>
                      </header>

                      <section className="space-y-4">
                        <h6 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8ca0b6]">Personal Info</h6>
                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Name</span>
                            <Field
                              type="text"
                              value={clientInfoForm.buyer_first_name}
                              onChange={(event) => setClientInfoForm((previous) => ({ ...previous, buyer_first_name: event.target.value }))}
                              placeholder="First name"
                            />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Surname</span>
                            <Field
                              type="text"
                              value={clientInfoForm.buyer_last_name}
                              onChange={(event) => setClientInfoForm((previous) => ({ ...previous, buyer_last_name: event.target.value }))}
                              placeholder="Last name"
                            />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Email Address</span>
                            <Field
                              type="email"
                              value={clientInfoForm.buyer_email}
                              onChange={(event) => setClientInfoForm((previous) => ({ ...previous, buyer_email: event.target.value }))}
                              placeholder="name@email.com"
                            />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Phone Number</span>
                            <Field
                              type="text"
                              value={clientInfoForm.buyer_phone}
                              onChange={(event) => setClientInfoForm((previous) => ({ ...previous, buyer_phone: event.target.value }))}
                              placeholder="+27 ..."
                            />
                          </label>
                        </div>
                      </section>

                      <section className="space-y-4 border-t border-[#e4ebf3] pt-5">
                        <h6 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8ca0b6]">Identity</h6>
                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>ID / Passport Number</span>
                            <Field
                              type="text"
                              value={clientInfoForm.identity_number}
                              onChange={(event) => setClientInfoForm((previous) => ({ ...previous, identity_number: event.target.value }))}
                              placeholder="ID or passport"
                            />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Tax Number</span>
                            <Field
                              type="text"
                              value={clientInfoForm.tax_number}
                              onChange={(event) => setClientInfoForm((previous) => ({ ...previous, tax_number: event.target.value }))}
                              placeholder="Tax number"
                            />
                          </label>
                        </div>
                      </section>

                      <section className="space-y-4 border-t border-[#e4ebf3] pt-5">
                        <h6 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8ca0b6]">Entity (Conditional)</h6>
                        <div className="grid gap-4 md:grid-cols-2">
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Company / Trust Name</span>
                            <Field
                              type="text"
                              value={clientInfoForm.company_name}
                              onChange={(event) => setClientInfoForm((previous) => ({ ...previous, company_name: event.target.value }))}
                              placeholder="If applicable"
                            />
                          </label>
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Registration Number</span>
                            <Field
                              type="text"
                              value={clientInfoForm.company_registration_number}
                              onChange={(event) =>
                                setClientInfoForm((previous) => ({ ...previous, company_registration_number: event.target.value }))
                              }
                              placeholder="If applicable"
                            />
                          </label>
                        </div>
                      </section>

                      <section className="space-y-4 border-t border-[#e4ebf3] pt-5">
                        <h6 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8ca0b6]">Purchaser Type</h6>
                        <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                          <span>Purchaser Type</span>
                          <Field
                            as="select"
                            value={stageForm.purchaser_type}
                            onChange={(event) => setStageForm((previous) => ({ ...previous, purchaser_type: event.target.value }))}
                          >
                            {purchaserTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Field>
                        </label>
                      </section>
                    </section>

                    <section className="space-y-6 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-5">
                      <header>
                        <h5 className="text-sm font-semibold text-[#142132]">Transaction Alignment</h5>
                        <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Control onboarding mode, finance logic, and operational next action.</p>
                      </header>

                      <section className="space-y-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8ca0b6]">Onboarding Mode</span>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {ONBOARDING_MODE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={[
                                'inline-flex min-h-[40px] items-center justify-center rounded-[12px] border px-3 py-2 text-sm font-semibold transition',
                                onboardingMode === option.value
                                  ? 'border-[#cfe1f7] bg-white text-[#1f3b53] shadow-[0_8px_20px_rgba(15,23,42,0.08)]'
                                  : 'border-[#e3ebf4] bg-[#f7f9fc] text-[#6b7d93] hover:bg-white',
                              ].join(' ')}
                              onClick={() => setOnboardingMode(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </section>

                      <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                        <span>Onboarding Status</span>
                        <Field
                          as="select"
                          value={clientInfoForm.onboarding_status}
                          onChange={(event) => setClientInfoForm((previous) => ({ ...previous, onboarding_status: event.target.value }))}
                        >
                          {ONBOARDING_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </Field>
                      </label>

                      <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                        <span>Finance Type</span>
                        <Field
                          as="select"
                          value={clientInfoForm.finance_type}
                          onChange={(event) => {
                            const nextFinanceType = normalizeFinanceType(event.target.value || 'cash')
                            setClientInfoForm((previous) => ({ ...previous, finance_type: nextFinanceType }))
                            setStageForm((previous) => ({ ...previous, finance_type: nextFinanceType }))
                          }}
                        >
                          {FINANCE_TYPE_SELECT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </Field>
                      </label>

                      <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                        <span>Purchase Price (R)</span>
                        <Field
                          type="number"
                          min="0"
                          step="0.01"
                          value={clientInfoForm.purchase_price}
                          onChange={(event) => setClientInfoForm((previous) => ({ ...previous, purchase_price: event.target.value }))}
                          placeholder="0.00"
                        />
                        {clientInfoSubmitAttempted && clientInfoFinanceValidation.errors.purchase_price ? (
                          <span className="text-xs font-semibold text-[#b42318]">{clientInfoFinanceValidation.errors.purchase_price}</span>
                        ) : null}
                      </label>

                      {clientInfoForm.finance_type === 'bond' ? (
                        <div className="grid gap-4">
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Bond Amount (R)</span>
                            <Field
                              type="number"
                              min="0"
                              step="0.01"
                              value={clientInfoForm.bond_amount}
                              onChange={(event) => setClientInfoForm((previous) => ({ ...previous, bond_amount: event.target.value }))}
                              placeholder="0.00"
                            />
                            {clientInfoSubmitAttempted && clientInfoFinanceValidation.errors.bond_amount ? (
                              <span className="text-xs font-semibold text-[#b42318]">{clientInfoFinanceValidation.errors.bond_amount}</span>
                            ) : null}
                          </label>

                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Deposit / Reservation (R)</span>
                            <Field
                              type="number"
                              min="0"
                              step="0.01"
                              value={clientInfoForm.deposit_amount}
                              onChange={(event) => setClientInfoForm((previous) => ({ ...previous, deposit_amount: event.target.value }))}
                              placeholder="Optional"
                            />
                          </label>
                        </div>
                      ) : null}

                      {clientInfoForm.finance_type === 'combination' ? (
                        <div className="grid gap-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                              <span>Bond Portion (%)</span>
                              <Field
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={
                                  Number(clientInfoForm.purchase_price || 0) > 0
                                    ? Math.round((Number(clientInfoForm.bond_amount || 0) / Number(clientInfoForm.purchase_price || 1)) * 100)
                                    : 0
                                }
                                onChange={(event) => {
                                  const purchasePrice = Number(clientInfoForm.purchase_price || 0)
                                  const rawPercent = Number(event.target.value || 0)
                                  const clampedPercent = Math.max(0, Math.min(100, Number.isFinite(rawPercent) ? rawPercent : 0))
                                  const nextBondAmount = purchasePrice > 0 ? (purchasePrice * clampedPercent) / 100 : 0
                                  const nextCashAmount = purchasePrice > 0 ? Math.max(purchasePrice - nextBondAmount, 0) : 0
                                  setClientInfoForm((previous) => ({
                                    ...previous,
                                    bond_amount: nextBondAmount ? nextBondAmount.toFixed(2) : '',
                                    cash_amount: nextCashAmount ? nextCashAmount.toFixed(2) : '',
                                  }))
                                }}
                              />
                            </label>
                            <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                              <span>Cash Portion (%)</span>
                              <Field
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={
                                  Number(clientInfoForm.purchase_price || 0) > 0
                                    ? Math.round((Number(clientInfoForm.cash_amount || 0) / Number(clientInfoForm.purchase_price || 1)) * 100)
                                    : 0
                                }
                                onChange={(event) => {
                                  const purchasePrice = Number(clientInfoForm.purchase_price || 0)
                                  const rawPercent = Number(event.target.value || 0)
                                  const clampedPercent = Math.max(0, Math.min(100, Number.isFinite(rawPercent) ? rawPercent : 0))
                                  const nextCashAmount = purchasePrice > 0 ? (purchasePrice * clampedPercent) / 100 : 0
                                  const nextBondAmount = purchasePrice > 0 ? Math.max(purchasePrice - nextCashAmount, 0) : 0
                                  setClientInfoForm((previous) => ({
                                    ...previous,
                                    cash_amount: nextCashAmount ? nextCashAmount.toFixed(2) : '',
                                    bond_amount: nextBondAmount ? nextBondAmount.toFixed(2) : '',
                                  }))
                                }}
                              />
                            </label>
                          </div>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                              <span>Cash Portion (R)</span>
                              <Field
                                type="number"
                                min="0"
                                step="0.01"
                                value={clientInfoForm.cash_amount}
                                onChange={(event) => setClientInfoForm((previous) => ({ ...previous, cash_amount: event.target.value }))}
                                placeholder="0.00"
                              />
                              {clientInfoSubmitAttempted && clientInfoFinanceValidation.errors.cash_amount ? (
                                <span className="text-xs font-semibold text-[#b42318]">{clientInfoFinanceValidation.errors.cash_amount}</span>
                              ) : null}
                            </label>
                            <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                              <span>Bond Portion (R)</span>
                              <Field
                                type="number"
                                min="0"
                                step="0.01"
                                value={clientInfoForm.bond_amount}
                                onChange={(event) => setClientInfoForm((previous) => ({ ...previous, bond_amount: event.target.value }))}
                                placeholder="0.00"
                              />
                              {clientInfoSubmitAttempted && clientInfoFinanceValidation.errors.bond_amount ? (
                                <span className="text-xs font-semibold text-[#b42318]">{clientInfoFinanceValidation.errors.bond_amount}</span>
                              ) : null}
                            </label>
                          </div>
                          <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                            <span>Deposit / Reservation (R)</span>
                            <Field
                              type="number"
                              min="0"
                              step="0.01"
                              value={clientInfoForm.deposit_amount}
                              onChange={(event) => setClientInfoForm((previous) => ({ ...previous, deposit_amount: event.target.value }))}
                              placeholder="Optional"
                            />
                          </label>
                          {clientInfoFinanceValidation.errors.hybrid_split &&
                          (clientInfoSubmitAttempted ||
                            (clientInfoForm.purchase_price && clientInfoForm.cash_amount && clientInfoForm.bond_amount)) ? (
                            <p className="rounded-[10px] border border-[#ffd8d6] bg-[#fff6f5] px-3 py-2 text-xs font-semibold text-[#b42318]">
                              {clientInfoFinanceValidation.errors.hybrid_split}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <label className="grid gap-2 text-sm font-medium text-[#35546c]">
                        <span>Next Action</span>
                        <Field
                          type="text"
                          value={stageForm.next_action}
                          onChange={(event) => setStageForm((previous) => ({ ...previous, next_action: event.target.value }))}
                          placeholder={activeNextActionRecommendation}
                        />
                      </label>

                      <div className="grid gap-2">
                        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#8ca0b6]">Suggested next actions</span>
                        <div className="flex flex-wrap gap-2">
                          {suggestedNextActions.map((suggestion) => (
                            <button
                              key={suggestion}
                              type="button"
                              className="inline-flex min-h-[32px] items-center rounded-full border border-[#dde4ee] bg-white px-3 py-1 text-xs font-semibold text-[#4f647a] transition hover:bg-[#f8fafc]"
                              onClick={() => setStageForm((previous) => ({ ...previous, next_action: suggestion }))}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      </div>
                    </section>
                  </div>

                  {onboardingMode === 'manual' ? (
                    <section className="mt-6 rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h5 className="text-sm font-semibold text-[#142132]">Manual Section Completion</h5>
                          <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Mark each section complete while processing offline or back-office onboarding.</p>
                        </div>
                        <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-white px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">
                          {allManualSectionsCompleted ? 'All sections complete' : 'Pending sections'}
                        </span>
                      </header>
                      <div className="grid gap-3 md:grid-cols-3">
                        {CLIENT_INFO_SECTION_KEYS.map((sectionKey) => {
                          const complete = Boolean(manualSectionCompletion[sectionKey])
                          return (
                            <article key={sectionKey} className="rounded-[14px] border border-[#e3ebf4] bg-white px-4 py-3">
                              <div className="flex items-center justify-between gap-2">
                                <strong className="text-sm font-semibold text-[#142132]">{CLIENT_INFO_SECTION_LABELS[sectionKey]}</strong>
                                <span
                                  className={[
                                    'inline-flex items-center rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.06em]',
                                    complete
                                      ? 'border-[#d5e8dd] bg-[#eef9f3] text-[#1c7d45]'
                                      : 'border-[#e2e8f0] bg-[#f8fafc] text-[#64748b]',
                                  ].join(' ')}
                                >
                                  {complete ? 'Complete' : 'Pending'}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="mt-3 inline-flex min-h-[34px] items-center justify-center rounded-[10px] border border-[#dde4ee] bg-white px-3 py-1.5 text-xs font-semibold text-[#4f647a] transition hover:bg-[#f8fafc]"
                                onClick={() => handleToggleManualSectionCompletion(sectionKey)}
                              >
                                {complete ? 'Reopen Section' : 'Mark Section Complete'}
                              </button>
                            </article>
                          )
                        })}
                      </div>
                    </section>
                  ) : null}

                  <div className="sticky bottom-0 z-10 mt-6 flex justify-end border-t border-[#e6edf5] bg-white/95 pt-4 backdrop-blur">
                    <Button type="submit" disabled={saving || !detail?.transaction?.id}>
                      {saving ? 'Saving...' : 'Save Client Information'}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mt-5 rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                  This role can view client information, but only internal users with core transaction permissions can update onboarding controls.
                </div>
              )}

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                {[
                  {
                    title: 'Buyer Overview',
                    entries: [
                      ['Buyer Name', ownerDisplayName],
                      ['Buyer Email', clientInfoForm.buyer_email || buyer?.email || '—'],
                      ['Buyer Phone', clientInfoForm.buyer_phone || buyer?.phone || '—'],
                      ['Purchaser Type', getPurchaserTypeLabel(normalizedPurchaserType)],
                      ['Registration Date', formatDate(registeredAt)],
                    ],
                  },
                  {
                    title: 'Structured Snapshot',
                    entries: [
                      ['Identity & Address', identityAddressEntries.length ? `${identityAddressEntries.length} captured fields` : 'No fields captured'],
                      ['Employment & Income', employmentIncomeEntries.length ? `${employmentIncomeEntries.length} captured fields` : 'No fields captured'],
                      ['Purchase Structure', purchaseStructureEntries.length ? `${purchaseStructureEntries.length} captured fields` : 'No fields captured'],
                      ['Document Readiness', `${completedDerivedRequiredDocs}/${derivedRequiredDocsTotal || 0} complete`],
                    ],
                  },
                ].map((section) => (
                  <section key={section.title} className="rounded-[18px] border border-[#e3ebf4] bg-white px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                    <h4 className="text-base font-semibold text-[#142132]">{section.title}</h4>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {section.entries.map(([key, value]) => (
                        <article key={`${section.title}-${key}`} className="rounded-[14px] border border-[#e5ecf4] bg-[#fbfcfe] px-4 py-3">
                          <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.09em] text-[#8ca0b6]">{toTitleLabel(key)}</span>
                          <strong className="mt-1 block text-sm font-semibold text-[#1c2e42]">{formatOnboardingFieldValue(value)}</strong>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </WorkspacePanel>

            <WorkspacePanel
              title="Required Documents"
              copy="Rules-based checklist generated from purchaser and finance logic, with manual status control for internal onboarding."
            >
              {dynamicRequiredDocuments.length ? (
                <div className="space-y-4">
                  <div className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <strong className="text-sm font-semibold text-[#142132]">
                          {completedDerivedRequiredDocs}/{derivedRequiredDocsTotal} documents ready
                        </strong>
                        <p className="mt-1 text-xs text-[#6b7d93]">
                          {derivedRequiredDocsMissing ? `${derivedRequiredDocsMissing} item${derivedRequiredDocsMissing === 1 ? '' : 's'} still missing` : 'No missing items'}
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-[#dde4ee] bg-white px-3 py-1 text-[0.72rem] font-semibold text-[#66758b]">
                        {derivedRequiredDocsProgressPercent}% complete
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8eef5]">
                      <div className="h-full rounded-full bg-[#35546c]" style={{ width: `${Math.max(0, Math.min(100, derivedRequiredDocsProgressPercent))}%` }} />
                    </div>
                  </div>

                  <ul className="space-y-2.5">
                    {dynamicRequiredDocuments.map((item) => {
                      const statusTone =
                        item.status === 'verified'
                          ? 'border-[#d5e8dd] bg-[#eef9f3] text-[#1c7d45]'
                          : item.status === 'uploaded'
                            ? 'border-[#d8e7f6] bg-[#f4f8fd] text-[#35546c]'
                            : 'border-[#f4d9d7] bg-[#fff5f4] text-[#b42318]'

                      return (
                        <li key={item.key} className="rounded-[14px] border border-[#e3ebf4] bg-white px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <strong className="block text-sm font-semibold text-[#142132]">{item.label}</strong>
                              <span className="mt-1 block text-xs text-[#7c8ea4]">
                                {item.matchedDocument?.name ? `Matched file: ${item.matchedDocument.name}` : 'No uploaded file matched yet'}
                              </span>
                            </div>
                            {onboardingMode === 'manual' && canEditCoreTransaction ? (
                              <Field
                                as="select"
                                value={item.status}
                                onChange={(event) => void handleRequiredDocumentStatusChange(item, event.target.value)}
                                disabled={updatingRequiredDocumentKey === item.key}
                              >
                                <option value="missing">Missing</option>
                                <option value="uploaded">Uploaded</option>
                                <option value="verified">Verified</option>
                              </Field>
                            ) : (
                              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.06em] ${statusTone}`}>
                                {item.status}
                              </span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : (
                <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                  No documents derived yet. Select purchaser type and finance type to generate requirements.
                </div>
              )}
            </WorkspacePanel>
          </div>
        ) : null}

        {activeWorkspaceMenu === 'snags' ? (
          <WorkspacePanel
            title="Snags"
            copy="Track post-registration defects, snag items, and resolution status for this unit."
            className="no-print"
          >
            {developmentSettings?.snag_reporting_enabled ? (
              <ClientIssuesPanel
                embedded
                showHeader={false}
                issues={clientIssues || []}
                onUpdated={loadDetail}
                saving={saving}
                onSignOff={handleSignOffIssue}
              />
            ) : (
              <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                Snag reporting is not enabled for this development.
              </div>
            )}
          </WorkspacePanel>
        ) : null}

        {activeWorkspaceMenu === 'alterations' ? (
          <WorkspacePanel
            title="Alterations"
            copy="Manage owner change requests, review decisions, and supporting documents."
            className="no-print"
          >
            {developmentSettings?.alteration_requests_enabled ? (
              <AlterationRequestsPanel
                embedded
                showHeader={false}
                requests={alterationRequests || []}
                onUpdated={loadDetail}
                saving={saving}
                onCreate={handleCreateAlteration}
                creating={creatingAlteration}
                creationError={alterationCreationError}
                createDisabled={!transaction?.id}
                totalAmount={alterationTotalAmount}
              />
            ) : (
              <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                Alteration requests are not enabled for this development.
              </div>
            )}
          </WorkspacePanel>
        ) : null}

        {activeWorkspaceMenu === 'documents' ? (
          <>
            <WorkspacePanel
              title="Document Groups"
              copy="Live unit and handover documents remain editable, while purchase documents stay available as read-only acquisition history."
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['Purchase Record Documents', purchaseRecordDocuments.length],
                  ['Unit / Handover Documents', unitLifecycleDocuments.length],
                  ['Document Readiness', documentReadinessText],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                    <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{value}</strong>
                  </article>
                ))}
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-5 py-5">
                  <h4 className="text-base font-semibold text-[#142132]">Unit &amp; Handover</h4>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Editable records and owner-facing handover material.</p>
                  {unitLifecycleDocuments.length ? (
                    <ul className="mt-4 grid gap-3">
                      {unitLifecycleDocuments.slice(0, 6).map((document) => (
                        <li key={document.id} className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                          <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Untitled document'}</strong>
                          <span className="mt-1 block text-xs text-[#7c8ea4]">{document.category || 'General'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-4 rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                      No unit or handover documents uploaded yet.
                    </div>
                  )}
                </article>

                <article className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-5 py-5">
                  <h4 className="text-base font-semibold text-[#142132]">Purchase Record</h4>
                  <p className="mt-1.5 text-sm leading-6 text-[#6b7d93]">Read-only documents retained from the completed acquisition.</p>
                  {purchaseRecordDocuments.length ? (
                    <ul className="mt-4 grid gap-3">
                      {purchaseRecordDocuments.slice(0, 6).map((document) => (
                        <li key={document.id} className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                          <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Untitled document'}</strong>
                          <span className="mt-1 block text-xs text-[#7c8ea4]">{document.category || 'General'}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="mt-4 rounded-[16px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                      No completed purchase documents available yet.
                    </div>
                  )}
                </article>
              </div>
            </WorkspacePanel>

            <DocumentsPanel
              checklist={requiredDocumentChecklist || []}
              documents={documents}
              onSubmit={handleUpload}
              saving={saving}
              canUpload={Boolean(transaction?.id) && canUploadDocuments}
              documentCategory={documentCategory}
              setDocumentCategory={setDocumentCategory}
              markClientVisible={true}
              clientVisibleByDefault={clientVisibleByDefault}
              setClientVisibleByDefault={setClientVisibleByDefault}
              onToggleClientVisibility={handleToggleDocumentVisibility}
            />
          </>
        ) : null}

      </div>
    </SharedTransactionShell>
    )
  } catch {
    return workspaceFallback
  }

  return (
    <TransactionWorkspaceBoundary resetKey={unitId} fallback={workspaceFallback}>
      {workspaceContent}
    </TransactionWorkspaceBoundary>
  )
}

export default UnitDetail
