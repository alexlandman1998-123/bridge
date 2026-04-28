import { Component, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import AlterationRequestsPanel from '../components/AlterationRequestsPanel'
import AttorneyCloseoutPanel from '../components/AttorneyCloseoutPanel'
import ClientIssuesPanel from '../components/ClientIssuesPanel'
import FinanceWorkflowLane from '../components/FinanceWorkflowLane'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ProgressTimeline from '../components/ProgressTimeline'
import SalesWorkflowLane from '../components/SalesWorkflowLane'
import SharedTransactionShell from '../components/SharedTransactionShell'
import StageAgingChip from '../components/StageAgingChip'
import TransactionWorkspaceHeader from '../components/TransactionWorkspaceHeader'
import TransactionWorkspaceMenu from '../components/TransactionWorkspaceMenu'
import TransferWorkflowLane from '../components/TransferWorkflowLane'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Field from '../components/ui/Field'
import { useWorkspace } from '../context/WorkspaceContext'
import {
  FINANCE_MANAGED_BY_OPTIONS,
  ONBOARDING_STATUSES,
  TRANSACTION_ROLE_LABELS,
  addTransactionDiscussionComment,
  completeTransactionSubprocess,
  createTransactionDocumentRequests,
  createWorkspaceAlteration,
  deleteTransactionEverywhere,
  resendTransactionDocumentRequest,
  fetchUnitDetail,
  fetchUnitWorkspaceShell,
  parseWorkflowStepComment,
  getOrCreateTransactionOnboarding,
  saveTransaction,
  saveTransactionClientInformation,
  sendReservationDepositRequest,
  signOffClientIssue,
  updateTransactionMainStage,
  updateDocumentClientVisibility,
  updateOtpDocumentWorkflowState,
  updateTransactionRequiredDocumentStatus,
  updateTransactionSubprocessStep,
  uploadDocument,
} from '../lib/api'
import { MAIN_PROCESS_STAGES, MAIN_STAGE_LABELS } from '../lib/stages'
import { DOCUMENTS_BUCKET_CANDIDATES, invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { parseEdgeFunctionError } from '../lib/edgeFunctions'
import { createPerfTimer } from '../lib/performanceTrace'
import { getPurchaserTypeOptions, getPurchaserTypeLabel, normalizePurchaserType } from '../lib/purchaserPersonas'
import { normalizeFinanceType } from '../core/transactions/financeType'
import { resolveFinanceWorkflowSnapshot } from '../core/transactions/financeWorkflow'
import { OTP_DOCUMENT_TYPES, resolveSalesWorkflowSnapshot } from '../core/transactions/salesWorkflow'
import { resolveTransferWorkflowSnapshot } from '../core/transactions/transferWorkflow'
import { buildWorkflowActivityEvent } from '../core/workflows/events'
import { resolveWorkflowLanePermissions } from '../core/workflows/permissions'
import { buildTransactionStageProgressModel } from '../core/transactions/stageProgressEngine'
import { buildWorkspaceHeaderConfigForRole } from '../core/transactions/workspaceHeaderConfig'
import { normalizePortalWorkspaceCategory, resolvePortalDocumentMetadata } from '../core/documents/portalDocumentMetadata'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const PANEL_SHELL = 'rounded-[28px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]'
const PANEL_COMPACT = 'rounded-[24px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]'
const WORKSPACE_MENU_IDS = ['overview', 'onboarding', 'bond', 'documents', 'alterations', 'snags']
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
const WORKSPACE_DOCUMENT_TABS = [
  { key: 'sales', label: 'Sales Documents' },
  { key: 'fica', label: 'FICA Documents' },
  { key: 'bond', label: 'Bond' },
  { key: 'additional', label: 'Additional Requests' },
  { key: 'property', label: 'Property Documents' },
  { key: 'internal', label: 'Internal Documents' },
]

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

function normalizeDocumentVaultCategory(value) {
  const normalized = normalizePortalWorkspaceCategory(value)
  if (normalized) return normalized
  return 'additional'
}

function resolveInternalDocumentCategory(document = {}) {
  const metadata = resolvePortalDocumentMetadata(document)
  const vaultCategory = normalizeDocumentVaultCategory(metadata.portalWorkspaceCategory)
  const source = `${document?.name || ''} ${document?.category || ''} ${document?.document_type || ''}`.toLowerCase()
  const isInternalOnly = String(document?.visibility_scope || '').toLowerCase() === 'internal' || document?.is_client_visible === false
  const isInternalTagged =
    /internal|working|draft|commission|admin|backoffice|confidential|note/.test(source) &&
    !/offer to purchase|otp|reservation|proof of payment/.test(source)

  if (isInternalOnly && (vaultCategory === 'additional' || isInternalTagged)) {
    return 'internal'
  }

  return vaultCategory
}

function resolveRequirementVaultCategory(requirement = {}) {
  const metadata = resolvePortalDocumentMetadata({
    ...requirement,
    documentType: requirement?.portalDocumentType || requirement?.key,
    portalWorkspaceCategory: requirement?.portalWorkspaceCategory,
    groupKey: requirement?.groupKey,
    stageKey: requirement?.stageKey,
  })
  return normalizeDocumentVaultCategory(metadata.portalWorkspaceCategory)
}

function isInformationSheetRequirement(item = {}) {
  const key = String(item?.key || '').trim().toLowerCase()
  const label = String(item?.label || '').trim().toLowerCase()
  return key.includes('information_sheet') || label.includes('information sheet')
}

async function createWorkspaceSignedDocumentUrl(filePath, { download = false, filename = 'document' } = {}) {
  if (!filePath || !supabase || !isSupabaseConfigured) {
    return null
  }

  for (const bucketName of DOCUMENTS_BUCKET_CANDIDATES) {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(
        filePath,
        60 * 30,
        download
          ? {
              download: filename,
            }
          : undefined,
      )

    if (!error && data?.signedUrl) {
      return data.signedUrl
    }
  }

  return null
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

function formatTransactionAge(startDateLike) {
  if (!startDateLike) {
    return 'Age pending'
  }

  const startDate = new Date(startDateLike)
  if (Number.isNaN(startDate.getTime())) {
    return 'Age pending'
  }

  const now = Date.now()
  const elapsedMs = Math.max(0, now - startDate.getTime())
  const dayMs = 24 * 60 * 60 * 1000
  const elapsedDays = Math.floor(elapsedMs / dayMs)
  const label = elapsedDays === 1 ? 'day' : 'days'
  return `${elapsedDays} ${label} active`
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

function getStageSymbol(state) {
  if (state === 'complete') return '✓'
  if (state === 'current') return '●'
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

const TRANSACTION_REPORT_WORKFLOW_ROW_LIMIT = 5
const TRANSACTION_REPORT_ACTIVITY_LIMIT = 5
const TRANSACTION_REPORT_COMMENT_LIMIT = 3
const TRANSACTION_REPORT_ALERT_LIMIT = 3

const TRANSACTION_REPORT_WORKFLOW_MILESTONES = {
  finance: [
    { label: 'Application Received', keywords: ['application received', 'application'] },
    { label: 'Buyer Documents Collected', keywords: ['buyer documents', 'documents collected'] },
    { label: 'Submitted to Banks', keywords: ['submitted to banks', 'submitted'] },
    { label: 'Bond Approved', keywords: ['bond approved', 'approved'] },
    { label: 'Bond Instruction Sent to Attorneys', keywords: ['instruction sent', 'attorneys'] },
  ],
  attorney: [
    { label: 'Instruction Received', keywords: ['instruction received', 'instruction'] },
    { label: 'FICA Received', keywords: ['fica received', 'fica'] },
    { label: 'Buyer Signed Documents', keywords: ['buyer signed', 'signed documents'] },
    { label: 'Lodgement Submitted', keywords: ['lodgement submitted', 'lodgement'] },
    { label: 'Registration Confirmed', keywords: ['registration confirmed', 'registered'] },
  ],
}

function limitReportText(value, maxLength = 120) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return ''
  }
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`
}

function getDiscussionTimestamp(comment) {
  return comment?.createdAt || comment?.created_at || comment?.updatedAt || comment?.updated_at || null
}

function findWorkflowStepByKeywords(steps = [], keywords = [], usedStepIds = new Set()) {
  const normalizedKeywords = (keywords || []).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
  if (!normalizedKeywords.length) {
    return null
  }

  return (steps || []).find((step) => {
    if (usedStepIds.has(step?.id || step?.step_key || step?.step_label)) {
      return false
    }
    const haystack = `${step?.step_key || ''} ${step?.step_label || ''}`.toLowerCase()
    return normalizedKeywords.some((keyword) => haystack.includes(keyword))
  })
}

function buildWorkflowSummaryRows(process, processType) {
  const steps = [...(process?.steps || [])].sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0))
  const milestones = TRANSACTION_REPORT_WORKFLOW_MILESTONES[processType] || []
  const usedStepIds = new Set()
  const rows = []

  for (const milestone of milestones) {
    const step = findWorkflowStepByKeywords(steps, milestone.keywords, usedStepIds)
    if (!step) {
      rows.push({
        label: milestone.label,
        status: 'not_started',
        statusLabel: formatWorkflowStatusValue('not_started'),
        dateLabel: '—',
      })
      continue
    }

    const uniqueId = step?.id || step?.step_key || step?.step_label
    if (uniqueId) {
      usedStepIds.add(uniqueId)
    }
    const normalizedStatus = normalizeWorkflowStepStatus(step?.status)
    rows.push({
      label: milestone.label,
      status: normalizedStatus,
      statusLabel: formatWorkflowStatusValue(normalizedStatus),
      dateLabel: step?.completed_at || step?.updated_at ? formatDate(step?.completed_at || step?.updated_at) : '—',
    })
  }

  if (rows.length < TRANSACTION_REPORT_WORKFLOW_ROW_LIMIT) {
    for (const step of steps) {
      const uniqueId = step?.id || step?.step_key || step?.step_label
      if (uniqueId && usedStepIds.has(uniqueId)) {
        continue
      }
      const normalizedStatus = normalizeWorkflowStepStatus(step?.status)
      rows.push({
        label: step?.step_label || toTitleLabel(step?.step_key) || 'Workflow Step',
        status: normalizedStatus,
        statusLabel: formatWorkflowStatusValue(normalizedStatus),
        dateLabel: step?.completed_at || step?.updated_at ? formatDate(step?.completed_at || step?.updated_at) : '—',
      })
      if (uniqueId) {
        usedStepIds.add(uniqueId)
      }
      if (rows.length >= TRANSACTION_REPORT_WORKFLOW_ROW_LIMIT) {
        break
      }
    }
  }

  return rows.slice(0, TRANSACTION_REPORT_WORKFLOW_ROW_LIMIT)
}

function buildWorkflowSummaryMarkup(process, processType, fallbackTitle) {
  const steps = process?.steps || []
  const completedCount = steps.filter((step) => normalizeWorkflowStepStatus(step?.status) === 'completed').length
  const totalCount = steps.length
  const heading = process?.process_label || process?.name || fallbackTitle
  const rows = buildWorkflowSummaryRows(process, processType)

  const rowsMarkup = rows.length
    ? rows
        .map((row) => `
          <li class="tx-report-workflow-row">
            <span class="tx-report-workflow-step">${escapeHtml(limitReportText(row.label, 54))}</span>
            <span class="tx-report-workflow-status tx-report-workflow-status-${escapeHtml(row.status)}">${escapeHtml(row.statusLabel)}</span>
            <time class="tx-report-workflow-date">${escapeHtml(row.dateLabel)}</time>
          </li>
        `)
        .join('')
    : '<li class="tx-report-empty">No workflow steps captured yet.</li>'

  return `
    <article class="tx-report-card tx-report-workflow-card">
      <header class="tx-report-card-head">
        <h3>${escapeHtml(heading)}</h3>
        <span>${escapeHtml(`${completedCount} of ${totalCount} complete`)}</span>
      </header>
      <ol class="tx-report-workflow-list">${rowsMarkup}</ol>
    </article>
  `
}

function buildActivityTimelineItems(comments = [], { buyer, transactionParticipants } = {}) {
  const normalized = (comments || [])
    .map((comment) => {
      const body = sanitizeCommentBody(comment.commentBody || comment.commentText, comment, {
        buyer,
        transactionParticipants,
      })
      const details = buildDiscussionCardData({
        commentBody: body,
        discussionType: comment.discussionType || comment.discussion_type || comment.type,
      })
      const timestamp = getDiscussionTimestamp(comment)
      return {
        key: `${details.title}-${details.summary}-${timestamp || ''}`,
        title: details.title || 'Update',
        summary: limitReportText(details.summary || details.detail || 'No detail provided.', 118),
        timestamp,
      }
    })
    .sort((left, right) => {
      const leftDate = parseDate(left.timestamp)
      const rightDate = parseDate(right.timestamp)
      if (!leftDate && !rightDate) return 0
      if (!leftDate) return 1
      if (!rightDate) return -1
      return rightDate.getTime() - leftDate.getTime()
    })

  const deduped = []
  const seen = new Set()
  for (const item of normalized) {
    if (seen.has(item.key)) {
      continue
    }
    seen.add(item.key)
    deduped.push(item)
    if (deduped.length >= TRANSACTION_REPORT_ACTIVITY_LIMIT) {
      break
    }
  }

  return deduped
}

function buildCommentSummaryItems(comments = [], { buyer, transactionParticipants } = {}) {
  const normalized = (comments || [])
    .map((comment) => {
      const discussionType = String(comment.discussionType || comment.discussion_type || comment.type || '').trim().toLowerCase()
      const body = sanitizeCommentBody(comment.commentBody || comment.commentText, comment, {
        buyer,
        transactionParticipants,
      })
      return {
        discussionType,
        author: resolveCommentAuthorName(comment, { buyer, transactionParticipants }),
        roleLabel: comment.authorRoleLabel || TRANSACTION_ROLE_LABELS[comment.authorRole] || 'Participant',
        body: limitReportText(body || 'No detail provided.', 180),
        timestamp: getDiscussionTimestamp(comment),
      }
    })
    .sort((left, right) => {
      const leftDate = parseDate(left.timestamp)
      const rightDate = parseDate(right.timestamp)
      if (!leftDate && !rightDate) return 0
      if (!leftDate) return 1
      if (!rightDate) return -1
      return rightDate.getTime() - leftDate.getTime()
    })

  const manual = normalized.filter((item) => item.discussionType !== SYSTEM_DISCUSSION_TYPE)
  const source = manual.length ? manual : normalized
  return source.slice(0, TRANSACTION_REPORT_COMMENT_LIMIT)
}

function buildTransactionReportPrintDocument({
  header,
  overviewItems,
  stageItems,
  healthSummary,
  progressPercent,
  blockers,
  workflowCardsMarkup,
  activityItems,
  commentItems,
}) {
  const stageStepperMarkup = (stageItems || [])
    .map((item, index) => {
      const state = getProgressStageState(item.stageKey, item.currentStage)
      const symbol = getStageSymbol(state)
      return `
        <li class="tx-report-step tx-report-step-${state}">
          <div class="tx-report-step-track">
            <span class="tx-report-step-dot" aria-hidden="true">${escapeHtml(symbol)}</span>
            ${index < stageItems.length - 1 ? '<span class="tx-report-step-line" aria-hidden="true"></span>' : ''}
          </div>
          <div class="tx-report-step-copy">
            <strong>${escapeHtml(item.label)}</strong>
          </div>
        </li>
      `
    })
    .join('')

  const overviewMarkup = (overviewItems || [])
    .map(
      ([label, value]) => `
        <article class="tx-report-metric">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `,
    )
    .join('')

  const blockersMarkup =
    blockers && blockers.length
      ? `
        <section class="tx-report-card tx-report-alerts">
          <header class="tx-report-card-head">
            <h2>Key Alerts / Blockers</h2>
            <span>${escapeHtml(`${blockers.length} item${blockers.length === 1 ? '' : 's'}`)}</span>
          </header>
          <ul class="tx-report-alert-list">
            ${blockers
              .map((item) => `<li>${escapeHtml(limitReportText(item, 92))}</li>`)
              .join('')}
          </ul>
        </section>
      `
      : ''

  const activityMarkup = activityItems.length
    ? activityItems
        .map(
          (item) => `
            <li class="tx-report-activity-row">
              <time>${escapeHtml(item.timestamp ? formatDateTime(item.timestamp) : 'Timestamp unavailable')}</time>
              <div>
                <strong>${escapeHtml(limitReportText(item.title, 58))}</strong>
                <p>${escapeHtml(item.summary)}</p>
              </div>
            </li>
          `,
        )
        .join('')
    : '<li class="tx-report-empty">No updates yet. Your team will post progress here as your transaction moves forward.</li>'

  const commentsMarkup = commentItems.length
    ? commentItems
        .map(
          (item) => `
            <article class="tx-report-comment-card">
              <header>
                <strong>${escapeHtml(limitReportText(item.author, 36))}</strong>
                <span>${escapeHtml(item.roleLabel)}</span>
                <time>${escapeHtml(item.timestamp ? formatDateTime(item.timestamp) : 'Timestamp unavailable')}</time>
              </header>
              <p>${escapeHtml(item.body)}</p>
            </article>
          `,
        )
        .join('')
    : '<div class="tx-report-empty">No manual comment notes captured yet.</div>'

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(header.title)} | Transaction Report</title>
    <style>
      @page { size: A4; margin: 11mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; box-shadow: none !important; }
      html, body { margin: 0; padding: 0; background: #f5f7fb; color: #0f172a; font-family: Inter, "Segoe UI", Arial, sans-serif; }
      body { font-size: 12px; line-height: 1.4; }
      .tx-report-page { width: 100%; min-height: calc(297mm - 22mm); max-height: calc(297mm - 22mm); overflow: hidden; border: 1px solid #d6dee9; border-radius: 14px; background: #fff; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
      .tx-report-page-one { page-break-after: always; break-after: page; }
      .tx-report-page-two { page-break-after: auto; break-after: auto; }
      .tx-report-header { border: 1px solid #d9e1ec; border-radius: 12px; padding: 14px 16px; background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); }
      .tx-report-header-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
      .tx-report-kicker { margin: 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.13em; color: #5f6f82; font-weight: 700; }
      .tx-report-header h1 { margin: 8px 0 0; font-size: 22px; line-height: 1.15; letter-spacing: -0.02em; font-weight: 700; color: #0f172a; }
      .tx-report-subtitle { margin: 5px 0 0; color: #475569; font-size: 12px; }
      .tx-report-status-pill { display: inline-flex; align-items: center; border: 1px solid #1f3347; border-radius: 999px; padding: 6px 11px; font-size: 11px; font-weight: 700; color: #1f3347; background: #f8fbff; text-transform: uppercase; letter-spacing: 0.06em; }
      .tx-report-header-meta { margin-top: 11px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .tx-report-header-meta span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; }
      .tx-report-header-meta strong { display: block; margin-top: 3px; font-size: 13px; color: #0f172a; font-weight: 700; }
      .tx-report-card { border: 1px solid #d9e1ec; border-radius: 12px; background: #fff; padding: 12px 13px; page-break-inside: avoid; break-inside: avoid; }
      .tx-report-card-head { margin-bottom: 8px; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
      .tx-report-card-head h2, .tx-report-card-head h3 { margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #1f3347; font-weight: 700; }
      .tx-report-card-head span { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; font-weight: 600; }
      .tx-report-overview-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      .tx-report-metric { border: 1px solid #e3e9f2; border-radius: 10px; padding: 9px 10px; background: #f9fbff; }
      .tx-report-metric span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.09em; color: #64748b; }
      .tx-report-metric strong { display: block; margin-top: 4px; font-size: 14px; color: #0f172a; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tx-report-stepper { margin: 0; padding: 0; list-style: none; display: flex; }
      .tx-report-step { flex: 1 1 0; min-width: 0; }
      .tx-report-step-track { display: flex; align-items: center; }
      .tx-report-step-dot { width: 18px; height: 18px; border-radius: 999px; border: 1.6px solid #cbd5e1; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; color: #94a3b8; background: #fff; flex: 0 0 auto; }
      .tx-report-step-line { flex: 1 1 auto; height: 2px; background: #e2e8f0; margin-left: 6px; }
      .tx-report-step-copy { margin-top: 6px; padding-right: 6px; }
      .tx-report-step-copy strong { font-size: 10px; line-height: 1.3; color: #1e293b; font-weight: 600; }
      .tx-report-step-complete .tx-report-step-dot { border-color: #0f172a; background: #0f172a; color: #fff; }
      .tx-report-step-complete .tx-report-step-line { background: #0f172a; }
      .tx-report-step-current .tx-report-step-dot { border-color: #0f172a; color: #0f172a; background: #fff; box-shadow: 0 0 0 3px rgba(15,23,42,0.12); }
      .tx-report-health-grid { display: grid; gap: 8px; }
      .tx-report-progress-row { display: flex; align-items: center; gap: 8px; }
      .tx-report-progress-track { height: 7px; border-radius: 999px; background: #e2e8f0; flex: 1 1 auto; overflow: hidden; }
      .tx-report-progress-fill { height: 100%; background: #0f172a; border-radius: 999px; }
      .tx-report-progress-row strong { font-size: 12px; color: #0f172a; min-width: 44px; text-align: right; }
      .tx-report-health-grid h3 { margin: 0; font-size: 15px; letter-spacing: -0.01em; color: #0f172a; }
      .tx-report-health-grid p { margin: 0; font-size: 11px; color: #475569; line-height: 1.5; }
      .tx-report-alert-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
      .tx-report-alert-list li { border: 1px solid #e2e8f0; border-radius: 9px; background: #f8fafc; padding: 7px 8px; font-size: 11px; color: #1e293b; }
      .tx-report-workflow-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .tx-report-workflow-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
      .tx-report-workflow-row { display: grid; grid-template-columns: minmax(0, 1fr) 98px 70px; gap: 8px; align-items: center; border: 1px solid #e2e8f0; border-radius: 9px; padding: 7px 8px; }
      .tx-report-workflow-step { font-size: 11px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tx-report-workflow-status { border: 1px solid #d4dde8; border-radius: 999px; padding: 3px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; text-align: center; color: #334155; font-weight: 700; }
      .tx-report-workflow-status-completed { border-color: #a7c4b0; background: #eef8f0; color: #1d4f2f; }
      .tx-report-workflow-status-in_progress, .tx-report-workflow-status-blocked { border-color: #cfd8e3; background: #f8fafc; color: #334155; }
      .tx-report-workflow-status-not_started { border-color: #dce4ee; background: #fff; color: #64748b; }
      .tx-report-workflow-date { text-align: right; font-size: 10px; color: #9ca3af; white-space: nowrap; }
      .tx-report-activity-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
      .tx-report-activity-row { border: 1px solid #e2e8f0; border-radius: 9px; padding: 8px; display: grid; gap: 4px; }
      .tx-report-activity-row time { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; }
      .tx-report-activity-row strong { display: block; font-size: 11px; color: #0f172a; }
      .tx-report-activity-row p { margin: 2px 0 0; font-size: 11px; color: #475569; }
      .tx-report-comments-grid { display: grid; gap: 6px; }
      .tx-report-comment-card { border: 1px solid #e2e8f0; border-radius: 9px; padding: 8px; background: #fafcff; }
      .tx-report-comment-card header { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: baseline; }
      .tx-report-comment-card strong { font-size: 11px; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tx-report-comment-card span { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
      .tx-report-comment-card time { font-size: 9px; color: #94a3b8; white-space: nowrap; }
      .tx-report-comment-card p { margin: 5px 0 0; font-size: 11px; color: #334155; line-height: 1.45; }
      .tx-report-empty { border: 1px dashed #d3dce7; border-radius: 9px; padding: 8px; color: #64748b; font-size: 11px; list-style: none; }
      .tx-report-footer { margin-top: auto; border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; gap: 8px; color: #64748b; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; }
      .tx-report-page-two-head h2 { margin: 0; font-size: 18px; letter-spacing: -0.02em; color: #0f172a; }
      .tx-report-page-two-head p { margin: 4px 0 0; color: #475569; font-size: 11px; }
      @media print {
        html, body { background: #fff; }
        .tx-report-page { border: 0; border-radius: 0; }
      }
    </style>
  </head>
  <body>
    <section class="tx-report-page tx-report-page-one">
      <header class="tx-report-header">
        <div class="tx-report-header-top">
          <div>
            <p class="tx-report-kicker">Transaction Report</p>
            <h1>${escapeHtml(header.title)}</h1>
            <p class="tx-report-subtitle">${escapeHtml(header.subtitle)}</p>
          </div>
          <span class="tx-report-status-pill">${escapeHtml(header.statusLabel)}</span>
        </div>
        <div class="tx-report-header-meta">
          <div><span>Generated</span><strong>${escapeHtml(header.generatedAt)}</strong></div>
          <div><span>Current Stage</span><strong>${escapeHtml(header.statusLabel)}</strong></div>
        </div>
      </header>

      <section class="tx-report-card">
        <header class="tx-report-card-head"><h2>Transaction Overview</h2></header>
        <div class="tx-report-overview-grid">${overviewMarkup}</div>
      </section>

      <section class="tx-report-card">
        <header class="tx-report-card-head"><h2>Stage Stepper</h2></header>
        <ol class="tx-report-stepper">${stageStepperMarkup}</ol>
      </section>

      <section class="tx-report-card">
        <header class="tx-report-card-head"><h2>Progress + Health Summary</h2></header>
        <div class="tx-report-health-grid">
          <div class="tx-report-progress-row">
            <div class="tx-report-progress-track"><div class="tx-report-progress-fill" style="width:${Math.max(0, Math.min(100, Number(progressPercent) || 0))}%;"></div></div>
            <strong>${escapeHtml(`${Math.max(0, Math.min(100, Math.round(Number(progressPercent) || 0)))}%`)}</strong>
          </div>
          <h3>${escapeHtml(limitReportText(healthSummary.title, 48))}</h3>
          <p>${escapeHtml(limitReportText(healthSummary.detail, 140))}</p>
        </div>
      </section>

      ${blockersMarkup}

      <footer class="tx-report-footer">
        <span>Generated by Bridge</span>
        <span>Page 1 of 2</span>
      </footer>
    </section>

    <section class="tx-report-page tx-report-page-two">
      <header class="tx-report-page-two-head">
        <h2>Operational Detail</h2>
        <p>${escapeHtml(header.subtitle)} • ${escapeHtml(header.generatedAt)}</p>
      </header>

      <section class="tx-report-workflow-grid">${workflowCardsMarkup}</section>

      <section class="tx-report-card">
        <header class="tx-report-card-head"><h2>Latest Activity</h2><span>${escapeHtml(`${activityItems.length} shown`)}</span></header>
        <ol class="tx-report-activity-list">${activityMarkup}</ol>
      </section>

      <section class="tx-report-card">
        <header class="tx-report-card-head"><h2>Comments Summary</h2><span>${escapeHtml(`${commentItems.length} shown`)}</span></header>
        <div class="tx-report-comments-grid">${commentsMarkup}</div>
      </section>

      <footer class="tx-report-footer">
        <span>Generated by Bridge</span>
        <span>Page 2 of 2</span>
      </footer>
    </section>
  </body>
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
  requiredDocumentChecklist = [],
  stageProgressModel = null,
}) {
  const buyerName = buyer?.name || 'Buyer pending'
  const developmentName = unit?.development?.name || 'Development'
  const unitLabel = unit?.unit_number || 'Unit'
  const stageLabel = MAIN_STAGE_LABELS[mainStage] || mainStage || 'Available'
  const overviewItems = [
    ['Purchaser Name', buyerName],
    ['Purchaser Type', resolvedPurchaserTypeLabel || 'Not set'],
    ['Finance Type', financeLabel ? toTitleLabel(financeLabel) : 'Not set'],
    ['Purchase Price', purchasePriceLabel || 'R0'],
    ['Current Stage', stageLabel],
    ['Onboarding Status', onboardingStatus || 'Not Started'],
  ]
  const stageItems = MAIN_PROCESS_STAGES.map((stageKey) => ({
    stageKey,
    currentStage: mainStage,
    label: MAIN_STAGE_LABELS[stageKey] || stageKey,
  }))

  const financeProcess = (transactionSubprocesses || []).find((item) => item?.process_type === 'finance') || null
  const attorneyProcess = (transactionSubprocesses || []).find((item) => item?.process_type === 'attorney') || null
  const totalWorkflowSteps = [financeProcess, attorneyProcess].reduce(
    (total, process) => total + (process?.steps || []).length,
    0,
  )
  const completedWorkflowSteps = [financeProcess, attorneyProcess].reduce(
    (total, process) =>
      total +
      (process?.steps || []).filter((step) => normalizeWorkflowStepStatus(step?.status) === 'completed').length,
    0,
  )
  const workflowCardsMarkup = [
    buildWorkflowSummaryMarkup(financeProcess, 'finance', 'Finance Workflow'),
    buildWorkflowSummaryMarkup(attorneyProcess, 'attorney', 'Attorney Workflow'),
  ].join('')

  const healthSummary = getHealthSummary({
    progressPercent,
    totalSteps: totalWorkflowSteps,
    completedSteps: completedWorkflowSteps,
    currentStageLabel: stageLabel,
  })
  const missingRequiredCount = (requiredDocumentChecklist || []).filter((item) => !item?.complete).length
  const blockers = [
    ...(stageProgressModel?.currentStageBlockers || []),
    ...(missingRequiredCount > 0 ? [`${missingRequiredCount} required document${missingRequiredCount === 1 ? '' : 's'} still missing`] : []),
    ...(stageProgressModel?.isAtRisk ? ['Progress is below expected trajectory for this stage'] : []),
  ]
  const dedupedBlockers = [...new Set(blockers.map((item) => limitReportText(item, 96)).filter(Boolean))].slice(
    0,
    TRANSACTION_REPORT_ALERT_LIMIT,
  )
  const activityItems = buildActivityTimelineItems(transactionDiscussion || [], {
    buyer,
    transactionParticipants,
  })
  const commentItems = buildCommentSummaryItems(transactionDiscussion || [], {
    buyer,
    transactionParticipants,
  })

  return buildTransactionReportPrintDocument({
    header: {
      title: 'Transaction Report',
      subtitle: `${developmentName} | Unit ${unitLabel}`,
      generatedAt: formatDateTime(new Date().toISOString()),
      statusLabel: stageLabel,
    },
    overviewItems,
    stageItems,
    healthSummary,
    progressPercent,
    blockers: dedupedBlockers,
    workflowCardsMarkup,
    activityItems,
    commentItems,
  })
}

const WORKFLOW_PROCESS_LABELS = {
  finance: 'Finance Workflow',
  attorney: 'Transfer Workflow',
}

const WORKFLOW_STATUS_LABELS = {
  completed: 'Completed',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  not_started: 'Pending',
}

function buildOtpPreviewHtml({ buyer, unit, transaction, purchasePriceLabel, onboardingStatus }) {
  const buyerName = buyer?.name || 'Buyer pending'
  const unitLabel = unit?.unit_number ? `Unit ${unit.unit_number}` : 'Unit pending'
  const developmentLabel = unit?.development?.name || 'Development'
  const generatedAt = formatDateTime(new Date().toISOString())
  const stageLabel = MAIN_STAGE_LABELS[transaction?.current_main_stage] || transaction?.stage || 'Available'
  const reference = transaction?.id ? String(transaction.id).slice(0, 8).toUpperCase() : 'TBC'

  const overviewItems = [
    ['Purchaser', buyerName],
    ['Property', `${developmentLabel} • ${unitLabel}`],
    ['Purchase Price', purchasePriceLabel || 'R0'],
    ['Current Stage', stageLabel],
    ['Onboarding Status', onboardingStatus || 'Not Started'],
    ['OTP Reference', `OTP-${reference}`],
  ]

  return buildPrintDocumentHtml({
    title: 'Offer to Purchase (OTP) Preview',
    subtitle: `${developmentLabel} | ${unitLabel}`,
    statusLabel: 'Generated Draft',
    generatedAt,
    sections: [
      `
        <section class="onboarding-print-section">
          <div class="onboarding-print-section-header">
            <h2>Transaction Snapshot</h2>
            <span>Generated internally</span>
          </div>
          <div class="onboarding-print-overview">${buildPrintOverviewMarkup(overviewItems)}</div>
        </section>
      `,
      `
        <section class="onboarding-print-section">
          <div class="onboarding-print-section-header">
            <h2>Sale Terms (Preview)</h2>
            <span>Single-template draft</span>
          </div>
          <div class="onboarding-print-panel">
            <p class="onboarding-print-paragraph">
              This Offer to Purchase confirms that ${escapeHtml(buyerName)} intends purchasing ${escapeHtml(`${developmentLabel}, ${unitLabel}`)}.
              The agreed purchase price is <strong>${escapeHtml(purchasePriceLabel || 'R0')}</strong>, subject to normal suspensive conditions, finance approval where applicable, and completion of the conveyancing process.
            </p>
            <p class="onboarding-print-paragraph">
              This is a generated preview for internal approval. Once approved, it can be shared with the client for signature and uploaded back as the signed final OTP version.
            </p>
          </div>
        </section>
      `,
      `
        <section class="onboarding-print-section">
          <div class="onboarding-print-section-header">
            <h2>Signature Placeholders</h2>
            <span>To be completed after release</span>
          </div>
          <div class="onboarding-print-panel">
            <p class="onboarding-print-paragraph">Purchaser signature: ______________________________</p>
            <p class="onboarding-print-paragraph">Date: ______________________________</p>
            <p class="onboarding-print-paragraph">Witness / Agent: ______________________________</p>
          </div>
        </section>
      `,
    ],
  })
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

  if (/sales workflow updated:/i.test(compact)) {
    return {
      title: 'Sales Workflow Updated',
      summary: changedFromToMatch ? `${changedFromToMatch[1]} → ${changedFromToMatch[2]}` : compact.replace(/^sales workflow updated:\s*/i, ''),
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
  const [deferredLoading, setDeferredLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sendingOnboardingEmail, setSendingOnboardingEmail] = useState(false)
  const [deletingTransaction, setDeletingTransaction] = useState(false)
  const [deleteTransactionConfirmOpen, setDeleteTransactionConfirmOpen] = useState(false)
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
  const [activeWorkspaceDocumentsTab, setActiveWorkspaceDocumentsTab] = useState('sales')
  const [uploadingDocumentKey, setUploadingDocumentKey] = useState('')
  const [documentUploadContext, setDocumentUploadContext] = useState({
    key: '',
    category: 'General',
    requiredDocumentKey: null,
    documentType: null,
    isClientVisible: false,
    stageKey: null,
  })
  const [documentRequestForm, setDocumentRequestForm] = useState({
    title: '',
    description: '',
    assignedToRole: 'client',
  })
  const [documentRequestSaving, setDocumentRequestSaving] = useState(false)
  const [documentRequestResendingId, setDocumentRequestResendingId] = useState('')
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
  const [reservationActionLoading, setReservationActionLoading] = useState('')
  const [salesActionLoading, setSalesActionLoading] = useState('')
  const [financeActionLoading, setFinanceActionLoading] = useState('')
  const [transferActionLoading, setTransferActionLoading] = useState('')
  const [clientInfoSavedAt, setClientInfoSavedAt] = useState('')
  const purchaserTypeOptions = getPurchaserTypeOptions()
  const discussionPanelRef = useRef(null)
  const workspaceMenuRef = useRef(null)
  const workflowPanelRef = useRef(null)
  const signedOtpUploadInputRef = useRef(null)
  const contextualUploadInputRef = useRef(null)
  const loadRequestRef = useRef(0)

  const loadDetail = useCallback(async () => {
    const requestId = loadRequestRef.current + 1
    loadRequestRef.current = requestId
    const timer = createPerfTimer('ui.unitDetail.loadDetail', { unitId })

    if (!isSupabaseConfigured) {
      setLoading(false)
      setDeferredLoading(false)
      timer.end({ skipped: 'supabase_not_configured' })
      return
    }

    try {
      setError('')
      setLoading(true)
      setDeferredLoading(true)
      timer.mark('shell_query_start')
      const shellData = await fetchUnitWorkspaceShell(unitId)
      timer.mark('shell_query_end', {
        hasShell: Boolean(shellData),
        hasTransaction: Boolean(shellData?.transaction?.id),
      })
      if (requestId !== loadRequestRef.current) {
        timer.end({ staleRequest: true, phase: 'shell' })
        return
      }

      if (shellData) {
        setDetail(shellData)
        setLoading(false)
        timer.mark('shell_render_ready')
      } else {
        timer.mark('shell_empty_fallback_to_full')
      }

      const data = await fetchUnitDetail(unitId)
      timer.mark('full_query_end', {
        hasDetail: Boolean(data),
        hasTransaction: Boolean(data?.transaction?.id),
      })
      if (requestId !== loadRequestRef.current) {
        timer.end({ staleRequest: true, phase: 'full' })
        return
      }

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
      timer.end({
        hasDetail: Boolean(data),
        transactionId: data?.transaction?.id || null,
      })
    } catch (loadError) {
      if (requestId === loadRequestRef.current) {
        setError(loadError.message)
      }
      timer.end({ error: loadError?.message || 'load_failed' })
    } finally {
      if (requestId === loadRequestRef.current) {
        setLoading(false)
        setDeferredLoading(false)
      }
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
        setActiveWorkspaceDocumentsTab('property')
        return
      }

      if (actingRole === 'bond_originator') {
        setActiveWorkspaceDocumentsTab('bond')
        return
      }

      const firstMissing = (detail?.requiredDocumentChecklist || []).find((item) => !item.complete)
      const category = firstMissing ? resolveRequirementVaultCategory(firstMissing) : 'sales'
      setActiveWorkspaceDocumentsTab(category)
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

  async function handleSendReservationDepositEmail({ forceResend = false } = {}) {
    if (!detail?.transaction?.id) {
      setError('Transaction data is not available yet.')
      return
    }

    try {
      setReservationActionLoading(forceResend ? 'resend_email' : 'send_email')
      setError('')
      const result = await sendReservationDepositRequest({
        transactionId: detail.transaction.id,
        forceResend,
        source: 'workspace_reservation_deposit',
      })

      if (result?.sent === false && result?.reason) {
        if (result?.error) {
          setError(result.error)
        } else if (result.reason !== 'already_verified' && result.reason !== 'not_required') {
          setError('Reservation deposit email was not sent.')
        }
        return
      }

      await loadDetail()
    } catch (requestError) {
      const resolvedError = await parseEdgeFunctionError(
        requestError,
        'Unable to send reservation deposit instructions.',
      )
      setError(resolvedError)
    } finally {
      setReservationActionLoading('')
    }
  }

  async function handleReservationProofDecision(nextStatus) {
    if (!detail?.transaction?.id || !reservationRequirement?.key) {
      setError('Reservation proof requirement is not configured on this transaction.')
      return
    }

    try {
      setReservationActionLoading(nextStatus)
      setError('')
      let confirmationEmailError = ''
      await updateTransactionRequiredDocumentStatus({
        transactionId: detail.transaction.id,
        documentKey: reservationRequirement.key,
        status: nextStatus,
        actorRole: effectiveEditorRole,
      })

      if (nextStatus === 'accepted') {
        const actorName = resolveActingParticipantName()
        const timestampLabel = formatDateTime(new Date().toISOString())

        try {
          await postSystemDiscussionUpdates([
            `Reservation deposit updated: Payment marked received by ${actorName} at ${timestampLabel}.`,
          ])
        } catch (discussionError) {
          console.warn('Reservation payment received discussion update failed', discussionError)
        }

        if (isSupabaseConfigured && supabase) {
          try {
            const { error: invokeError } = await invokeEdgeFunction('send-email', {
              body: {
                type: 'reservation_deposit_received',
                transactionId: detail.transaction.id,
              },
            })

            if (invokeError) {
              confirmationEmailError = await parseEdgeFunctionError(
                invokeError,
                'Reservation payment confirmation email failed to send.',
              )
            }
          } catch (emailError) {
            confirmationEmailError = emailError?.message || 'Reservation payment confirmation email failed to send.'
          }
        }
      }

      await loadDetail()

      if (confirmationEmailError) {
        setError(`Payment was recorded, but client confirmation email failed: ${confirmationEmailError}`)
      }
    } catch (decisionError) {
      setError(decisionError?.message || 'Unable to update reservation proof status.')
    } finally {
      setReservationActionLoading('')
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

  function openContextualUploadPicker({
    key,
    category = 'General',
    requiredDocumentKey = null,
    documentType = null,
    isClientVisible = false,
    stageKey = null,
  } = {}) {
    setDocumentUploadContext({
      key: key || category || 'document_upload',
      category,
      requiredDocumentKey,
      documentType,
      isClientVisible,
      stageKey,
    })
    contextualUploadInputRef.current?.click()
  }

  async function handleContextualFileSelected(event) {
    const [file] = Array.from(event.target.files || [])
    event.target.value = ''
    if (!file || !detail?.transaction?.id) {
      return
    }

    const uploadKey = documentUploadContext.key || documentUploadContext.requiredDocumentKey || documentUploadContext.category || 'document_upload'

    try {
      setUploadingDocumentKey(uploadKey)
      setError('')
      await uploadDocument({
        transactionId: detail.transaction.id,
        file,
        category: documentUploadContext.category || 'General',
        isClientVisible: Boolean(documentUploadContext.isClientVisible),
        requiredDocumentKey: documentUploadContext.requiredDocumentKey || null,
        documentType: documentUploadContext.documentType || null,
        stageKey: documentUploadContext.stageKey || null,
      })
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload document.')
    } finally {
      setUploadingDocumentKey('')
    }
  }

  async function handleCreateDocumentRequest(event) {
    event.preventDefault()
    if (!detail?.transaction?.id) {
      return
    }

    const title = String(documentRequestForm.title || '').trim()
    if (!title) {
      setError('Document request title is required.')
      return
    }

    try {
      setDocumentRequestSaving(true)
      setError('')
      await createTransactionDocumentRequests({
        transactionId: detail.transaction.id,
        createdByRole: effectiveEditorRole,
        requests: [
          {
            title,
            description: String(documentRequestForm.description || '').trim(),
            category: 'Additional Requests',
            assignedToRole: documentRequestForm.assignedToRole || 'client',
            status: 'requested',
          },
        ],
      })
      setDocumentRequestForm({
        title: '',
        description: '',
        assignedToRole: 'client',
      })
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (requestError) {
      setError(requestError?.message || 'Unable to create document request.')
    } finally {
      setDocumentRequestSaving(false)
    }
  }

  async function handleResendDocumentRequest(requestId) {
    if (!requestId) {
      return
    }
    try {
      setDocumentRequestResendingId(String(requestId))
      setError('')
      await resendTransactionDocumentRequest(requestId)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (requestError) {
      setError(requestError?.message || 'Unable to resend document request.')
    } finally {
      setDocumentRequestResendingId('')
    }
  }

  async function openWorkspaceDocument(document, { download = false, filename = '' } = {}) {
    const fallbackName = String(filename || document?.name || 'document').trim() || 'document'
    const popup = window.open('', '_blank', 'noopener,noreferrer')

    try {
      let resolvedUrl = ''

      if (download) {
        resolvedUrl = (await createWorkspaceSignedDocumentUrl(document?.file_path, { download: true, filename: fallbackName })) || ''
      } else {
        resolvedUrl =
          String(document?.url || '').trim() ||
          (await createWorkspaceSignedDocumentUrl(document?.file_path, { download: false, filename: fallbackName })) ||
          ''
      }

      if (!resolvedUrl) {
        throw new Error('Document URL unavailable')
      }

      if (popup) {
        popup.location.href = resolvedUrl
      } else {
        window.open(resolvedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (documentError) {
      if (popup && !popup.closed) {
        popup.close()
      }
      setError(documentError?.message || 'Unable to open document right now.')
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
      requiredDocumentChecklist: detail.requiredDocumentChecklist || [],
      stageProgressModel,
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

  async function handleSendOnboardingEmail({ resend = false } = {}) {
    if (!transaction?.id) {
      setError('Transaction data is not available for onboarding email.')
      return
    }

    if (!buyer?.email) {
      setError('Capture buyer email before sending onboarding.')
      return
    }

    if (!supabase) {
      setError('Supabase is not configured in this environment.')
      return
    }

    try {
      setSendingOnboardingEmail(true)
      setError('')

      const { error: invokeError } = await invokeEdgeFunction('send-email', {
        body: {
          type: 'client_onboarding',
          transactionId: transaction.id,
          resend,
        },
      })

      if (invokeError) {
        throw invokeError
      }

      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (sendError) {
      const resolvedError = await parseEdgeFunctionError(sendError, 'Unable to send onboarding email right now.')
      setError(resolvedError)
    } finally {
      setSendingOnboardingEmail(false)
    }
  }

  async function handleGenerateOtpDraft() {
    if (!transaction?.id) {
      setError('Transaction data is not available for OTP generation.')
      return
    }

    try {
      setSalesActionLoading('generate_otp')
      setError('')
      const otpHtml = buildOtpPreviewHtml({
        buyer,
        unit,
        transaction,
        purchasePriceLabel: currency.format(purchasePriceValue || 0),
        onboardingStatus,
      })
      const fileName = `otp-preview-${unit?.unit_number || 'unit'}-${Date.now()}.html`
      const otpFile = new File([otpHtml], fileName, { type: 'text/html' })

      await uploadDocument({
        transactionId: transaction.id,
        file: otpFile,
        category: 'Offer to Purchase (OTP)',
        documentType: OTP_DOCUMENT_TYPES.pendingApproval,
        stageKey: 'otp_prep_signing',
        isClientVisible: false,
      })

      openPrintDocument(
        otpHtml,
        'Unable to open OTP preview. Please allow pop-ups and try again.',
      )
      await postSystemDiscussionUpdates([
        `Sales workflow updated: OTP draft generated by ${resolveActingParticipantName()} at ${formatDateTime(new Date().toISOString())}.`,
      ])
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (generationError) {
      setError(generationError?.message || 'Unable to generate OTP draft right now.')
    } finally {
      setSalesActionLoading('')
    }
  }

  async function handleApproveOtpDraft() {
    const generatedOtp = salesWorkflowSnapshot?.latestGeneratedOtpDocument
    if (!generatedOtp?.id) {
      setError('Generate an OTP draft before approval.')
      return
    }

    try {
      setSalesActionLoading('approve_otp')
      setError('')
      await updateOtpDocumentWorkflowState({
        documentId: generatedOtp.id,
        workflowState: OTP_DOCUMENT_TYPES.approved,
        isClientVisible: false,
      })
      await postSystemDiscussionUpdates([
        `Sales workflow updated: OTP approved by ${resolveActingParticipantName()} at ${formatDateTime(new Date().toISOString())}.`,
      ])
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (approveError) {
      setError(approveError?.message || 'Unable to approve OTP draft.')
    } finally {
      setSalesActionLoading('')
    }
  }

  async function handleReleaseOtpToClient() {
    const generatedOtp = salesWorkflowSnapshot?.latestGeneratedOtpDocument
    if (!generatedOtp?.id) {
      setError('Generate and approve OTP before sharing it with the client.')
      return
    }

    try {
      setSalesActionLoading('share_otp')
      setError('')
      await updateOtpDocumentWorkflowState({
        documentId: generatedOtp.id,
        workflowState: OTP_DOCUMENT_TYPES.sentToClient,
        isClientVisible: true,
      })
      await postSystemDiscussionUpdates([
        `Sales workflow updated: OTP released to client by ${resolveActingParticipantName()} at ${formatDateTime(new Date().toISOString())}.`,
      ])
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (releaseError) {
      setError(releaseError?.message || 'Unable to release OTP to client.')
    } finally {
      setSalesActionLoading('')
    }
  }

  async function handleSignedOtpSelected(event) {
    const [file] = Array.from(event?.target?.files || [])
    event.target.value = ''

    if (!file || !transaction?.id) {
      return
    }

    try {
      setSalesActionLoading('upload_signed_otp')
      setError('')
      await uploadDocument({
        transactionId: transaction.id,
        file,
        category: 'Signed OTP',
        documentType: OTP_DOCUMENT_TYPES.signedReuploaded,
        stageKey: 'otp_prep_signing',
        isClientVisible: false,
      })
      await postSystemDiscussionUpdates([
        `Sales workflow updated: Signed OTP uploaded by ${resolveActingParticipantName()} at ${formatDateTime(new Date().toISOString())}.`,
      ])
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload signed OTP.')
    } finally {
      setSalesActionLoading('')
    }
  }

  function triggerSignedOtpUpload() {
    signedOtpUploadInputRef.current?.click()
  }

  function openDocumentsWorkspace() {
    setWorkspaceMenu('documents')
    workspaceMenuRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function handleMoveToReadyForFinance() {
    if (!transaction?.id || !salesWorkflowSnapshot?.readyForFinance) {
      setError('Complete onboarding, signed OTP, and supporting documentation before moving to finance.')
      return
    }

    try {
      setSalesActionLoading('move_ready_for_finance')
      setError('')

      const result = await updateTransactionMainStage({
        transactionId: transaction.id,
        unitId: unit.id,
        mainStage: 'FIN',
        note: 'Sales workflow complete and ready for finance.',
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
      setStageForm((previous) => ({ ...previous, main_stage: 'FIN' }))

      await postSystemDiscussionUpdates([
        `Sales workflow updated: Ready for Finance confirmed by ${resolveActingParticipantName()} at ${formatDateTime(new Date().toISOString())}.`,
      ])
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (moveError) {
      setError(moveError?.message || 'Unable to move transaction to finance.')
    } finally {
      setSalesActionLoading('')
    }
  }

  async function handleAdvanceFinanceWorkflow() {
    if (!transaction?.id) {
      setError('Transaction data is not available for finance workflow progression.')
      return
    }

    if (!salesWorkflowSnapshot?.readyForFinance) {
      setError('Finance workflow is not ready yet. Complete Sales Workflow first.')
      return
    }

    const financeProcess = (detail?.transactionSubprocesses || []).find((item) => item?.process_type === 'finance') || null
    if (!financeProcess?.id) {
      setError('Finance workflow is not available for this transaction yet.')
      return
    }

    const currentStep = (financeProcess.steps || []).find(
      (step) => String(step?.id || '') === String(financeWorkflowSnapshot?.currentStepId || ''),
    )
    if (!currentStep?.id) {
      setError('No active finance stage is available to progress.')
      return
    }

    try {
      setFinanceActionLoading(currentStep.step_key || 'advance_finance')
      setError('')
      const actorName = resolveActingParticipantName()
      const timestampLabel = formatDateTime(new Date().toISOString())
      const actionLabel = financeWorkflowSnapshot?.nextActionLabel || 'Finance stage progressed'

      const updateResult = await updateTransactionSubprocessStep({
        transactionId: transaction.id,
        subprocessId: financeProcess.id,
        processType: 'finance',
        stepId: currentStep.id,
        stepLabel: currentStep.step_label,
        status: 'completed',
        comment: buildWorkflowStepComment({
          note: `${actionLabel} by ${actorName}.`,
        }),
        actorRole: effectiveEditorRole,
        allowAnyWorkflowEdit: false,
      })

      if (updateResult?.subprocesses?.length) {
        setDetail((previous) => {
          if (!previous) return previous
          return {
            ...previous,
            transactionSubprocesses: updateResult.subprocesses,
          }
        })
      }

      const financeEvent = buildWorkflowActivityEvent({
        laneLabel: 'Finance Workflow',
        stageLabel: currentStep.step_label,
        action: 'completed',
        actorName,
        occurredAt: timestampLabel,
      })
      await postSystemDiscussionUpdates([financeEvent.message])
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (financeError) {
      setError(financeError?.message || 'Unable to progress finance workflow.')
    } finally {
      setFinanceActionLoading('')
    }
  }

  async function handleMoveToReadyForTransfer() {
    if (!transaction?.id) {
      setError('Transaction data is not available yet.')
      return
    }

    if (!financeWorkflowSnapshot?.readyForTransfer) {
      setError('Complete the finance workflow before moving to transfer.')
      return
    }

    try {
      setFinanceActionLoading('move_ready_for_transfer')
      setError('')

      const result = await updateTransactionMainStage({
        transactionId: transaction.id,
        unitId: unit.id,
        mainStage: 'ATTY',
        note: 'Finance workflow complete and ready for transfer.',
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
      setStageForm((previous) => ({ ...previous, main_stage: 'ATTY' }))

      const financeHandoffEvent = buildWorkflowActivityEvent({
        laneLabel: 'Finance Workflow',
        stageLabel: 'Ready for Transfer',
        action: 'completed',
        actorName: resolveActingParticipantName(),
        occurredAt: formatDateTime(new Date().toISOString()),
      })
      await postSystemDiscussionUpdates([financeHandoffEvent.message])
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (moveError) {
      setError(moveError?.message || 'Unable to move transaction to transfer.')
    } finally {
      setFinanceActionLoading('')
    }
  }

  async function handleAdvanceTransferWorkflow() {
    if (!transaction?.id) {
      setError('Transaction data is not available for transfer workflow progression.')
      return
    }

    if (transferWorkflowSnapshot?.isLocked) {
      setError('Transfer workflow is not ready yet. Complete finance handoff first.')
      return
    }

    const transferProcess = (detail?.transactionSubprocesses || []).find((item) => item?.process_type === 'attorney') || null
    if (!transferProcess?.id) {
      setError('Transfer workflow is not available for this transaction yet.')
      return
    }

    const currentStep = (transferProcess.steps || []).find(
      (step) => String(step?.id || '') === String(transferWorkflowSnapshot?.currentStepId || ''),
    )
    if (!currentStep?.id) {
      setError('No active transfer stage is available to progress.')
      return
    }

    try {
      setTransferActionLoading(currentStep.step_key || 'advance_transfer')
      setError('')
      const actorName = resolveActingParticipantName()
      const timestampLabel = formatDateTime(new Date().toISOString())
      const actionLabel = transferWorkflowSnapshot?.nextActionLabel || 'Transfer stage progressed'

      const updateResult = await updateTransactionSubprocessStep({
        transactionId: transaction.id,
        subprocessId: transferProcess.id,
        processType: 'attorney',
        stepId: currentStep.id,
        stepLabel: currentStep.step_label,
        status: 'completed',
        comment: buildWorkflowStepComment({
          note: `${actionLabel} by ${actorName}.`,
        }),
        actorRole: effectiveEditorRole,
        allowAnyWorkflowEdit: false,
      })

      if (updateResult?.subprocesses?.length) {
        setDetail((previous) => {
          if (!previous) return previous
          return {
            ...previous,
            transactionSubprocesses: updateResult.subprocesses,
          }
        })
      }

      const transferStageEvent = buildWorkflowActivityEvent({
        laneLabel: 'Transfer Workflow',
        stageLabel: currentStep.step_label,
        action: 'completed',
        actorName,
        occurredAt: timestampLabel,
      })
      const systemNotes = [transferStageEvent.message]

      if (currentStep.step_key === 'registration_confirmed' && mainStage !== 'REG') {
        const stageResult = await updateTransactionMainStage({
          transactionId: transaction.id,
          unitId: unit.id,
          mainStage: 'REG',
          note: 'Transfer workflow completed with registration confirmed.',
          actorRole: effectiveEditorRole,
        })

        setDetail((previous) => {
          if (!previous) return previous
          return {
            ...previous,
            mainStage: stageResult.nextMainStage,
            stage: stageResult.nextStage,
            transaction: previous.transaction
              ? {
                  ...previous.transaction,
                  stage: stageResult.nextStage,
                  current_main_stage: stageResult.nextMainStage,
                  updated_at: new Date().toISOString(),
                }
              : previous.transaction,
          }
        })
        setStageForm((previous) => ({ ...previous, main_stage: 'REG' }))
        const registrationEvent = buildWorkflowActivityEvent({
          laneLabel: 'Transfer Workflow',
          stageLabel: 'Registration Confirmed',
          action: 'completed',
          actorName,
          occurredAt: formatDateTime(new Date().toISOString()),
        })
        systemNotes.push(`${registrationEvent.message} Transaction marked Registered.`)
      }

      await postSystemDiscussionUpdates(systemNotes)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (transferError) {
      setError(transferError?.message || 'Unable to progress transfer workflow.')
    } finally {
      setTransferActionLoading('')
    }
  }

  function handleOpenClientPortalLink() {
    if (!clientPortalLink?.token) {
      setError('Client portal link is not available yet for this transaction.')
      return
    }

    window.open(`/client/${clientPortalLink.token}`, '_blank', 'noopener,noreferrer')
  }

  function handleDeleteTransactionFromWorkspace() {
    if (!transaction?.id || !unit?.id) {
      setError('Transaction data is not available for deletion.')
      return
    }

    setDeleteTransactionConfirmOpen(true)
  }

  async function confirmDeleteTransactionFromWorkspace() {
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
      setDeleteTransactionConfirmOpen(false)
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
    return (
      <p className="rounded-[16px] border border-[#f3d2cc] bg-[#fef3f2] px-5 py-4 text-sm text-[#b42318]">
        {error || 'Unit not found.'}
      </p>
    )
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
    transactionEvents,
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
  const showDeferredWorkspaceLoading = deferredLoading && Boolean(detail?.__isShell)
  const onboardingEmailEvents = (transactionEvents || [])
    .filter((item) => {
      const eventType = String(item?.eventType || item?.event_type || '').trim()
      if (eventType !== 'TransactionUpdated') {
        return false
      }
      const eventData = item?.eventData && typeof item.eventData === 'object'
        ? item.eventData
        : item?.event_data && typeof item.event_data === 'object'
          ? item.event_data
          : {}
      const action = String(eventData?.action || '').trim().toLowerCase()
      const type = String(eventData?.type || '').trim().toLowerCase()
      return action === 'onboarding_email_sent' || type === 'onboarding_sent'
    })
    .sort((left, right) => {
      const leftDate = new Date(left?.createdAt || left?.created_at || 0).getTime()
      const rightDate = new Date(right?.createdAt || right?.created_at || 0).getTime()
      return rightDate - leftDate
    })
  const onboardingEmailSent = onboardingEmailEvents.length > 0
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
  const onboardingHeaderLabel = onboardingComplete
    ? 'Onboarding completed'
    : onboardingEmailSent
      ? 'Onboarding sent'
      : 'Onboarding not sent'
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
  const canEditMainStage = elevatedWorkspaceRoles.includes(effectiveEditorRole)
  const salesLanePermissions = resolveWorkflowLanePermissions('sales', {
    actorRole: effectiveEditorRole,
    canEditCoreTransaction,
    canEditFinanceWorkflow: Boolean(actingPermissions.canEditFinanceWorkflow),
    canEditAttorneyWorkflow: Boolean(actingPermissions.canEditAttorneyWorkflow),
  })
  const financeLanePermissions = resolveWorkflowLanePermissions('finance', {
    actorRole: effectiveEditorRole,
    canEditCoreTransaction,
    canEditFinanceWorkflow: Boolean(actingPermissions.canEditFinanceWorkflow),
    canEditAttorneyWorkflow: Boolean(actingPermissions.canEditAttorneyWorkflow),
    isFinanceOwner: effectiveEditorRole === 'bond_originator',
  })
  const transferLanePermissions = resolveWorkflowLanePermissions('transfer', {
    actorRole: effectiveEditorRole,
    canEditCoreTransaction,
    canEditFinanceWorkflow: Boolean(actingPermissions.canEditFinanceWorkflow),
    canEditAttorneyWorkflow: Boolean(actingPermissions.canEditAttorneyWorkflow),
  })
  const salesWorkflowSnapshot = resolveSalesWorkflowSnapshot({
    onboardingStatus,
    onboardingCompletedAt: transaction?.onboarding_completed_at || null,
    externalOnboardingSubmittedAt: transaction?.external_onboarding_submitted_at || null,
    documents: documents || [],
    requiredDocuments: requiredDocumentChecklist || [],
    permissions: salesLanePermissions,
  })
  const canEditSalesWorkflow = salesLanePermissions.canEditWorkflowLane
  const canEditFinanceWorkflowLane = financeLanePermissions.canEditWorkflowLane
  const financeWorkflowSnapshot = resolveFinanceWorkflowSnapshot({
    financeType: transaction?.finance_type || stageForm.finance_type || 'cash',
    subprocesses: transactionSubprocesses || [],
    salesReadyForFinance: salesWorkflowSnapshot.readyForFinance,
    salesBlockers: salesWorkflowSnapshot.blockers,
    permissions: financeLanePermissions,
  })
  const financeWorkflowHelperText = financeWorkflowSnapshot.isLocked
    ? financeWorkflowSnapshot.blockers[1] || 'Finance is not ready yet. Complete Sales Workflow to continue.'
    : financeWorkflowSnapshot.readyForTransfer
      ? canEditMainStage && (mainStage === 'FIN' || stageForm.main_stage === 'FIN')
        ? 'Finance is complete. Move the transaction into Transfer to unlock the next lane.'
        : 'Finance is complete and ready for transfer handoff.'
      : `Responsible role: ${financeWorkflowSnapshot.responsibleRoleLabel}.`
  const transferReady =
    salesWorkflowSnapshot.readyForFinance &&
    financeWorkflowSnapshot.readyForTransfer &&
    salesWorkflowSnapshot.signedOtpReceived
  const transferWorkflowSnapshot = resolveTransferWorkflowSnapshot({
    subprocesses: transactionSubprocesses || [],
    transferReady,
    transferBlockers: [
      !salesWorkflowSnapshot.readyForFinance ? 'Sales Workflow must be completed first.' : null,
      !financeWorkflowSnapshot.readyForTransfer ? 'Finance Workflow must be marked Ready for Transfer.' : null,
      !salesWorkflowSnapshot.signedOtpReceived ? 'Signed contract / OTP is required before transfer can start.' : null,
    ].filter(Boolean),
    permissions: transferLanePermissions,
  })
  const canEditTransferWorkflowLane = transferLanePermissions.canEditWorkflowLane
  const transferWorkflowHelperText = transferWorkflowSnapshot.isLocked
    ? transferWorkflowSnapshot.blockers[1] || 'Transfer is not ready yet. Complete finance handoff first.'
    : transferWorkflowSnapshot.registrationConfirmed
      ? 'Transfer workflow complete. Registration is confirmed.'
      : `Responsible role: ${transferWorkflowSnapshot.responsibleRoleLabel}.`
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
  const reservationRequired = Boolean(transaction?.reservation_required)
  const reservationStatusRaw = String(transaction?.reservation_status || '').trim().toLowerCase()
  const reservationStatusLabel =
    reservationStatusRaw === 'verified'
      ? 'Verified'
      : reservationStatusRaw === 'paid'
        ? 'Pending Review'
        : reservationStatusRaw === 'rejected'
          ? 'Reupload Required'
        : reservationStatusRaw === 'pending'
          ? 'Requested'
          : 'Not Required'
  const showReservationDepositOverviewCard =
    reservationRequired &&
    reservationStatusRaw !== 'verified' &&
    reservationStatusRaw !== 'not_required'
  const reservationAmountValue =
    transaction?.reservation_amount === null || transaction?.reservation_amount === undefined
      ? null
      : Number(transaction.reservation_amount)
  const reservationPaymentDetails =
    transaction?.reservation_payment_details && typeof transaction.reservation_payment_details === 'object'
      ? transaction.reservation_payment_details
      : {}
  const reservationRequirement =
    (requiredDocumentChecklist || []).find((item) => normalizeDocumentMatcher(item?.key) === 'reservation_deposit_proof') ||
    (requiredDocumentChecklist || []).find((item) =>
      /reservation/.test(`${item?.key || ''} ${item?.label || ''}`.toLowerCase()),
    ) ||
    null
  const reservationProofDocument =
    reservationRequirement?.matchedDocument ||
    (reservationRequirement?.uploadedDocumentId
      ? (documents || []).find((item) => String(item?.id || '') === String(reservationRequirement.uploadedDocumentId))
      : null) ||
    (documents || []).find((item) => /reservation/.test(`${item?.name || ''} ${item?.category || ''}`.toLowerCase())) ||
    null
  const suggestedNextActions = getSuggestedNextActions({
    onboardingMode,
    onboardingStatus: clientInfoForm.onboarding_status || onboardingStatus,
    financeType: normalizedClientFinanceType,
    missingRequiredCount: derivedRequiredDocsMissing,
  })
  const activeNextActionRecommendation = suggestedNextActions[0] || 'Ready for transfer preparation'
  const allManualSectionsCompleted = CLIENT_INFO_SECTION_KEYS.every((key) => manualSectionCompletion[key])

  const reportGeneratedAt = formatDateTime(new Date())
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
  const activeFinanceType = normalizeFinanceType(transaction?.finance_type || stageForm.finance_type || 'cash')
  const isBondOrHybridFinance = activeFinanceType === 'bond' || activeFinanceType === 'combination'
  const canViewBondWorkspaceTab = ['developer', 'agent'].includes(workspaceRole) && isBondOrHybridFinance
  const onboardingBondApplication =
    onboardingFormData?.formData?.bond_application &&
    typeof onboardingFormData.formData.bond_application === 'object' &&
    !Array.isArray(onboardingFormData.formData.bond_application)
      ? onboardingFormData.formData.bond_application
      : {}
  const bondApplicants = Array.isArray(onboardingBondApplication?.applicants)
    ? onboardingBondApplication.applicants
    : []
  const primaryBondApplicant =
    bondApplicants.find((item) => String(item?.key || '').toLowerCase() === 'primary') || bondApplicants[0] || null
  const coBondApplicant =
    bondApplicants.find((item) => String(item?.key || '').toLowerCase() === 'co_applicant') || null
  const onboardingSummary = onboardingBondApplication?.summary || {}
  const selectedBondBanks = Array.isArray(onboardingBondApplication?.selected_banks)
    ? onboardingBondApplication.selected_banks.filter(Boolean)
    : []
  const bondApplicationStatusRaw =
    onboardingBondApplication?.status ||
    (onboardingBondApplication?.submitted_at ? 'Submitted' : '')
  const bondApplicationStatus = bondApplicationStatusRaw
    ? String(bondApplicationStatusRaw)
    : 'Not Started'
  const acceptedOfferDocumentId = String(
    onboardingBondApplication?.offers?.accepted_offer_document_id ||
      onboardingBondApplication?.offers?.acceptedOfferDocumentId ||
      '',
  )
  const signedOfferDocumentId = String(
    onboardingBondApplication?.offers?.signed_offer_document_id ||
      onboardingBondApplication?.offers?.signedOfferDocumentId ||
      '',
  )
  const bondOfferDocuments = (documents || []).filter((item) => {
    const haystack = `${item?.name || ''} ${item?.category || ''}`.toLowerCase()
    return /bond/.test(haystack) && /offer|approval/.test(haystack) && !/signed|accept/.test(haystack)
  })
  const acceptedBondOfferDocument =
    (acceptedOfferDocumentId
      ? (documents || []).find((item) => String(item?.id || '') === acceptedOfferDocumentId)
      : null) || null
  const signedBondOfferDocument =
    (signedOfferDocumentId
      ? (documents || []).find((item) => String(item?.id || '') === signedOfferDocumentId)
      : null) ||
    (documents || []).find((item) => {
      const haystack = `${item?.name || ''} ${item?.category || ''}`.toLowerCase()
      return /bond/.test(haystack) && /offer/.test(haystack) && /signed|accept/.test(haystack)
    }) ||
    null
  const bondGrantDocuments = (documents || []).filter((item) => {
    const haystack = `${item?.name || ''} ${item?.category || ''}`.toLowerCase()
    return /bond/.test(haystack) && /grant|final approval|instruction/.test(haystack)
  })
  const bondEmployment = onboardingBondApplication?.employment || {}
  const bondIncome = onboardingBondApplication?.income || {}
  const bondExpenses = onboardingBondApplication?.expenses || {}
  const bondCreditHistory = onboardingBondApplication?.credit_history || {}
  const bondBankingLiabilities = onboardingBondApplication?.banking_liabilities || {}
  const bondAssets = onboardingBondApplication?.assets || {}
  const bondConsent = onboardingBondApplication?.consent || {}
  const workspaceDocuments = documents || []
  const workspaceDocumentsById = new Map(workspaceDocuments.map((item) => [String(item?.id || ''), item]))
  const visibleRequiredDocuments = (requiredDocumentChecklist || []).filter((item) => !isInformationSheetRequirement(item))
  const workspaceDocumentRequests = detail?.documentRequests || []
  const workspaceDocumentTabs = WORKSPACE_DOCUMENT_TABS.filter(
    (tab) => tab.key !== 'bond' || normalizedClientFinanceType === 'bond' || normalizedClientFinanceType === 'combination',
  )
  const activeWorkspaceDocumentsTabKey = workspaceDocumentTabs.some((tab) => tab.key === activeWorkspaceDocumentsTab)
    ? activeWorkspaceDocumentsTab
    : workspaceDocumentTabs[0]?.key || 'sales'
  const documentCategoryBuckets = {
    sales: [],
    fica: [],
    bond: [],
    additional: [],
    property: [],
    internal: [],
  }
  for (const document of workspaceDocuments) {
    const bucketKey = resolveInternalDocumentCategory(document)
    if (documentCategoryBuckets[bucketKey]) {
      documentCategoryBuckets[bucketKey].push(document)
    }
  }
  const requiredDocumentBuckets = {
    sales: [],
    fica: [],
    bond: [],
    additional: [],
    property: [],
  }
  for (const requirement of visibleRequiredDocuments) {
    const bucketKey = resolveRequirementVaultCategory(requirement)
    if (requiredDocumentBuckets[bucketKey]) {
      requiredDocumentBuckets[bucketKey].push(requirement)
    } else {
      requiredDocumentBuckets.additional.push(requirement)
    }
  }
  const additionalRequestsForClient = workspaceDocumentRequests.filter(
    (request) => String(request?.assignedToRole || '').trim().toLowerCase() === 'client',
  )
  const uploadedDocumentCount = workspaceDocuments.length
  const requiredDocumentCount = visibleRequiredDocuments.length
  const missingDocumentCount = visibleRequiredDocuments.filter((item) => !item?.complete).length
  const clientVisibleDocumentCount = workspaceDocuments.filter((item) => Boolean(item?.is_client_visible)).length
  const reservationRequirementStatus = String(reservationRequirement?.status || '').trim().toLowerCase()
  const canAccessReservationProof = Boolean(reservationProofDocument?.url || reservationProofDocument?.file_path)
  const reservationProofStatusLabel =
    reservationStatusRaw === 'verified' || reservationRequirementStatus === 'accepted'
      ? 'Payment Received'
      : reservationStatusRaw === 'rejected' || reservationRequirementStatus === 'reupload_required'
        ? 'Rejected / Needs Reupload'
        : reservationProofDocument?.id || reservationRequirementStatus === 'uploaded' || reservationRequirementStatus === 'under_review'
          ? 'Uploaded'
          : 'Awaiting Proof of Payment'
  const otpGeneratedDocument = salesWorkflowSnapshot?.latestGeneratedOtpDocument || null
  const otpStatusLabel =
    salesWorkflowSnapshot?.signedOtpReceived
      ? 'Signed / Final'
      : salesWorkflowSnapshot?.sentForSignature
        ? 'Sent for Signature'
        : salesWorkflowSnapshot?.approvedForRelease
          ? 'Approved'
          : otpGeneratedDocument
            ? 'Draft Generated'
            : 'Not Generated'
  const salesRequirementsExcludingCore = requiredDocumentBuckets.sales.filter((item) => {
    const keyToken = String(item?.key || '').toLowerCase()
    if (keyToken.includes('reservation_deposit_proof')) return false
    if (keyToken.includes('otp') || keyToken.includes('offer_to_purchase')) return false
    return true
  })
  const tabCountByKey = {
    sales:
      (reservationRequired ? 1 : 0) +
      1 +
      salesRequirementsExcludingCore.length +
      documentCategoryBuckets.sales.filter((item) => {
        const token = `${item?.document_type || ''} ${item?.name || ''}`.toLowerCase()
        return !/reservation_deposit_pop|otp|offer_to_purchase|signed_otp/.test(token)
      }).length,
    fica: requiredDocumentBuckets.fica.length + documentCategoryBuckets.fica.length,
    bond: requiredDocumentBuckets.bond.length + documentCategoryBuckets.bond.length,
    additional:
      requiredDocumentBuckets.additional.length +
      documentCategoryBuckets.additional.length +
      additionalRequestsForClient.length,
    property: requiredDocumentBuckets.property.length + documentCategoryBuckets.property.length,
    internal: documentCategoryBuckets.internal.length,
  }
  const developmentModuleState = developmentSettings?.enabledModules || {}
  const developmentTeams = developmentSettings?.stakeholderTeams || {}
  const agentOptions = developmentTeams.agents || []
  const conveyancerOptions = developmentTeams.conveyancers || []
  const bondOriginatorOptions = developmentTeams.bondOriginators || []
  const attorneyParticipant = (transactionParticipants || []).find((item) => item.roleType === 'attorney') || null
  const attorneyAccessInherited = Boolean(attorneyParticipant?.accessInherited)
  const inheritedAttorneyLabel = attorneyAccessInherited
    ? attorneyParticipant?.participantName || attorneyParticipant?.participantEmail || 'Assigned attorney'
    : ''

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
    ...(canViewBondWorkspaceTab
      ? [{ id: 'bond', label: 'Bond', meta: bondApplicationStatus }]
      : []),
    { id: 'documents', label: 'Documents', meta: `${documents?.length || 0} files` },
    { id: 'alterations', label: 'Alterations', meta: developmentSettings?.alteration_requests_enabled ? `${alterationRequests?.length || 0} requests` : 'Module off' },
    { id: 'snags', label: 'Snags', meta: developmentSettings?.snag_reporting_enabled ? `${clientIssues?.length || 0} logged` : 'Module off' },
  ]
  const activeWorkspaceMenu = workspaceMenus.some((tab) => tab.id === workspaceMenu) ? workspaceMenu : 'overview'
  const showOverviewWorkspaceHero = activeWorkspaceMenu === 'overview'
  const workspaceHeaderRole = ['developer', 'attorney', 'agent', 'bond_originator'].includes(effectiveEditorRole)
    ? effectiveEditorRole
    : 'developer'
  const workspaceHeaderConfig = buildWorkspaceHeaderConfigForRole({
    role: workspaceHeaderRole,
    title: unit.development?.name || 'Property Transaction',
    unitLabel: `Unit ${unit.unit_number}`,
    subtitle: buyer?.name ? `Buyer: ${buyer.name}` : 'Buyer: Pending assignment',
    buyerLabel: buyer?.name || '',
    currentStageLabel: mainStageLabel,
    mainStageLabel,
    onboardingLabel: onboardingHeaderLabel,
    operationalStateLabel: onboardingComplete ? 'On track' : 'Needs action',
    financeTypeLabel: financeLabel === 'n/a' ? 'Not set' : financeLabel,
    purchasePriceLabel: currency.format(purchasePriceValue || 0),
    timeInStageValue: formatTransactionAge(transaction?.created_at || transaction?.updated_at),
    timeInStageMeta: `Updated ${formatDate(transaction?.updated_at || transaction?.created_at)}`,
    unitStatusLabel: unit?.status ? toTitleLabel(unit.status) : 'Unit active',
  })
  const workspaceHeaderActions = [
    {
      id: 'print-report',
      label: 'Print Report',
      icon: 'print',
      variant: 'secondary',
      className: 'min-w-[158px]',
      onClick: handlePrintTransactionReport,
      disabled: false,
    },
    {
      id: 'client-portal',
      label: 'Client Portal',
      icon: 'portal',
      variant: 'secondary',
      className: 'min-w-[198px]',
      onClick: handleOpenClientPortalLink,
      disabled: !clientPortalLink?.token,
    },
    ...(!onboardingComplete && !onboardingEmailSent
      ? [{
          id: 'send-onboarding',
          label: sendingOnboardingEmail ? 'Sending…' : 'Send Onboarding',
          icon: 'onboarding_link',
          variant: 'primary',
          className: 'min-w-[206px]',
          onClick: () => void handleSendOnboardingEmail({ resend: false }),
          disabled: !canEditSalesWorkflow || sendingOnboardingEmail || !transaction?.id || !buyer?.email,
          hidden: !canEditSalesWorkflow,
        }]
      : []),
    ...(onboardingEmailSent && !onboardingComplete
      ? [{
          id: 'resend-onboarding',
          label: sendingOnboardingEmail ? 'Sending…' : 'Resend Onboarding',
          icon: 'onboarding_link',
          variant: 'secondary',
          className: 'min-w-[206px]',
          onClick: () => void handleSendOnboardingEmail({ resend: true }),
          disabled: !canEditSalesWorkflow || sendingOnboardingEmail || !transaction?.id || !buyer?.email,
          hidden: !canEditSalesWorkflow,
        }]
      : []),
    ...(onboardingComplete
      ? [{
          id: 'onboarding-complete',
          label: 'Onboarding Completed',
          as: 'badge',
          tone: 'success',
          hidden: !canEditSalesWorkflow,
        }]
      : []),
    ...((onboardingEmailSent || onboardingComplete)
      ? [{
          id: 'copy-onboarding-link',
          label: 'Copy Onboarding Link',
          icon: 'onboarding_link',
          variant: onboardingComplete ? 'secondary' : 'ghost',
          className: 'min-w-[206px]',
          onClick: handleCopyOnboardingLink,
          disabled: !onboarding?.token || !canEditSalesWorkflow,
          hidden: !canEditSalesWorkflow,
        }]
      : []),
    {
      id: 'delete-transaction',
      label: deletingTransaction ? 'Deleting…' : 'Delete Transaction',
      icon: 'delete',
      variant: 'ghost',
      className: 'min-w-[192px] text-[#b42318] hover:bg-[#fff1f1]',
      onClick: () => void handleDeleteTransactionFromWorkspace(),
      disabled: !transaction?.id || deletingTransaction || workspaceHeaderRole !== 'developer',
      hidden: workspaceHeaderRole !== 'developer',
    },
  ]
  const workspaceNavigationSection = (
    <div ref={workspaceMenuRef}>
      <TransactionWorkspaceMenu
        tabs={workspaceMenus}
        activeTab={activeWorkspaceMenu}
        onChange={setWorkspaceMenu}
        ariaLabel="Unit workspace tabs"
        sectionLabel="Unit Workspace"
      />
    </div>
  )

  const salesWorkflowHelperText = salesWorkflowSnapshot.readyForFinance
    ? 'Sales prerequisites complete. Finance actions are now unlocked.'
    : salesWorkflowSnapshot.blockers[0] || 'Complete the current stage action to continue.'

  const salesWorkflowActions = (() => {
    if (!canEditSalesWorkflow) {
      return []
    }

    const isBusy = Boolean(salesActionLoading)
    const generatedOtpUrl = salesWorkflowSnapshot.latestGeneratedOtpDocument?.url || ''
    const actions = []
    const addAction = (id, label, onClick, { variant = 'secondary', disabled = false } = {}) => {
      actions.push({
        id,
        label,
        onClick,
        variant,
        disabled: disabled || isBusy,
      })
    }

    switch (salesWorkflowSnapshot.nextAction) {
      case 'complete_onboarding':
        addAction(
          onboardingEmailSent ? 'resend_onboarding' : 'send_onboarding',
          sendingOnboardingEmail
            ? onboardingEmailSent
              ? 'Resending…'
              : 'Sending…'
            : onboardingEmailSent
              ? 'Resend Onboarding'
              : 'Send Onboarding',
          () => void handleSendOnboardingEmail({ resend: onboardingEmailSent }),
          {
            variant: 'primary',
            disabled: sendingOnboardingEmail || !transaction?.id || !buyer?.email,
          },
        )
        addAction('copy_onboarding_link', 'Copy Onboarding Link', handleCopyOnboardingLink, {
          disabled: !onboarding?.token,
        })
        break
      case 'generate_otp':
        addAction(
          'generate_otp',
          salesActionLoading === 'generate_otp' ? 'Generating OTP…' : 'Generate OTP',
          () => void handleGenerateOtpDraft(),
          { variant: 'primary', disabled: !transaction?.id },
        )
        break
      case 'approve_otp':
        addAction(
          'approve_otp',
          salesActionLoading === 'approve_otp' ? 'Approving…' : 'Approve OTP',
          () => void handleApproveOtpDraft(),
          {
            variant: 'primary',
            disabled: !salesWorkflowSnapshot.latestGeneratedOtpDocument?.id,
          },
        )
        if (generatedOtpUrl) {
          addAction('download_generated_otp', 'Download OTP', () => window.open(generatedOtpUrl, '_blank', 'noopener,noreferrer'))
        }
        break
      case 'share_otp':
        addAction(
          'share_otp',
          salesActionLoading === 'share_otp' ? 'Publishing…' : 'Make OTP Available',
          () => void handleReleaseOtpToClient(),
          {
            variant: 'primary',
            disabled: !salesWorkflowSnapshot.latestGeneratedOtpDocument?.id,
          },
        )
        if (generatedOtpUrl) {
          addAction('download_generated_otp', 'Download OTP', () => window.open(generatedOtpUrl, '_blank', 'noopener,noreferrer'))
        }
        break
      case 'upload_signed_otp':
        addAction(
          'upload_signed_otp',
          salesActionLoading === 'upload_signed_otp' ? 'Uploading…' : 'Upload Signed OTP',
          triggerSignedOtpUpload,
          { variant: 'primary' },
        )
        if (generatedOtpUrl) {
          addAction('download_generated_otp', 'Download OTP', () => window.open(generatedOtpUrl, '_blank', 'noopener,noreferrer'))
        }
        break
      case 'complete_supporting_documents':
        addAction('open_documents', 'Open Documents', openDocumentsWorkspace, { variant: 'primary' })
        addAction(
          'mark_supporting_docs_complete',
          'Mark Supporting Docs Complete',
          () => void handleMoveToReadyForFinance(),
          {
            disabled: !salesWorkflowSnapshot.supportingDocsComplete,
          },
        )
        addAction('copy_onboarding_link', 'Copy Onboarding Link', handleCopyOnboardingLink, {
          disabled: !onboarding?.token,
        })
        break
      default:
        addAction(
          'move_ready_for_finance',
          salesActionLoading === 'move_ready_for_finance' ? 'Moving…' : 'Move to Ready for Finance',
          () => void handleMoveToReadyForFinance(),
          {
            variant: 'primary',
            disabled: !salesWorkflowSnapshot.readyForFinance || mainStage === 'FIN' || mainStage === 'ATTY' || mainStage === 'XFER' || mainStage === 'REG',
          },
        )
        if (salesWorkflowSnapshot.latestSignedOtpDocument?.url) {
          addAction(
            'download_signed_otp',
            'Download Signed OTP',
            () => window.open(salesWorkflowSnapshot.latestSignedOtpDocument.url, '_blank', 'noopener,noreferrer'),
          )
        }
        break
    }

    return actions
  })()

  const salesWorkflowSection = (
    <div className="no-print">
      <SalesWorkflowLane
        snapshot={salesWorkflowSnapshot}
        canEdit={canEditSalesWorkflow}
        roleLabel={TRANSACTION_ROLE_LABELS[actingRole] || actingRole}
        actions={salesWorkflowActions}
        helperText={salesWorkflowHelperText}
      />
      <input
        ref={signedOtpUploadInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          void handleSignedOtpSelected(event)
        }}
      />
    </div>
  )

  const financeWorkflowActions = (() => {
    if (!canEditFinanceWorkflowLane || financeWorkflowSnapshot.isLocked) {
      return []
    }

    const actions = []
    const isBusy = Boolean(financeActionLoading)
    if (financeWorkflowSnapshot.currentStepId && financeWorkflowSnapshot.nextActionLabel) {
      actions.push({
        id: 'advance_finance_workflow',
        label: financeActionLoading ? 'Updating…' : financeWorkflowSnapshot.nextActionLabel,
        variant: 'primary',
        disabled: isBusy,
        onClick: () => void handleAdvanceFinanceWorkflow(),
      })
    }

    if (
      financeWorkflowSnapshot.readyForTransfer &&
      canEditMainStage &&
      (mainStage === 'FIN' || stageForm.main_stage === 'FIN')
    ) {
      actions.push({
        id: 'move_to_transfer',
        label: financeActionLoading === 'move_ready_for_transfer' ? 'Moving…' : 'Move to Transfer',
        variant: 'secondary',
        disabled: isBusy,
        onClick: () => void handleMoveToReadyForTransfer(),
      })
    }

    return actions
  })()

  const financeWorkflowSection = (
    <div className="no-print">
      <FinanceWorkflowLane
        snapshot={financeWorkflowSnapshot}
        canEdit={canEditFinanceWorkflowLane}
        roleLabel={TRANSACTION_ROLE_LABELS[actingRole] || actingRole}
        actions={financeWorkflowActions}
        helperText={financeWorkflowHelperText}
      />
    </div>
  )

  const transferWorkflowActions = (() => {
    if (!canEditTransferWorkflowLane || transferWorkflowSnapshot.isLocked) {
      return []
    }

    if (!transferWorkflowSnapshot.currentStepId || !transferWorkflowSnapshot.nextActionLabel) {
      return []
    }

    return [
      {
        id: 'advance_transfer_workflow',
        label: transferActionLoading ? 'Updating…' : transferWorkflowSnapshot.nextActionLabel,
        variant: 'primary',
        disabled: Boolean(transferActionLoading),
        onClick: () => void handleAdvanceTransferWorkflow(),
      },
    ]
  })()

  const transferWorkflowSection = (
    <div ref={workflowPanelRef} className="no-print">
      <TransferWorkflowLane
        snapshot={transferWorkflowSnapshot}
        canEdit={canEditTransferWorkflowLane}
        roleLabel={TRANSACTION_ROLE_LABELS[actingRole] || actingRole}
        actions={transferWorkflowActions}
        helperText={transferWorkflowHelperText}
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
      <>
      <SharedTransactionShell
      printTitle="Unit Transaction Report"
      printSubtitle={`${unit.development?.name || '-'} • Unit ${unit.unit_number}`}
      printGeneratedAt={reportGeneratedAt}
      errorMessage={error}
      toolbar={workspaceNavigationSection}
      headline={(
        <TransactionWorkspaceHeader
          contextLabel={workspaceHeaderConfig.contextLabel}
          title={workspaceHeaderConfig.title}
          unitLabel={workspaceHeaderConfig.unitLabel}
          subtitle={workspaceHeaderConfig.subtitle}
          pills={workspaceHeaderConfig.pills}
          stats={workspaceHeaderConfig.stats}
          actions={workspaceHeaderActions}
        />
      )}
    >
      <div className="space-y-4">
        {showDeferredWorkspaceLoading ? (
          <section className="rounded-[16px] border border-[#dbe7f3] bg-[#f8fbff] px-4 py-3">
            <p className="text-sm font-medium text-[#35546c]">
              Loading comments, documents, workflow details, and activity…
            </p>
          </section>
        ) : null}

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

        {activeWorkspaceMenu === 'overview' ? (
          <>
            {showReservationDepositOverviewCard ? (
              <WorkspacePanel
                title="Reservation Deposit"
                copy="Track reservation payment instructions, proof of payment, and verification in one place."
                className="no-print"
              >
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.55fr)]">
                  <section className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Deposit Amount</p>
                        <strong className="mt-1 block text-[1.02rem] font-semibold text-[#142132]">
                          {reservationAmountValue !== null ? currency.format(reservationAmountValue) : 'Amount pending'}
                        </strong>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-[#d8e6f5] bg-white px-3 py-1 text-[0.72rem] font-semibold text-[#35546c]">
                        {reservationStatusLabel}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-[#4f647a] sm:grid-cols-2">
                      <span><strong className="font-semibold text-[#1f3448]">Account Holder:</strong> {reservationPaymentDetails.account_holder_name || '—'}</span>
                      <span><strong className="font-semibold text-[#1f3448]">Bank:</strong> {reservationPaymentDetails.bank_name || '—'}</span>
                      <span><strong className="font-semibold text-[#1f3448]">Account Number:</strong> {reservationPaymentDetails.account_number || '—'}</span>
                      <span><strong className="font-semibold text-[#1f3448]">Branch Code:</strong> {reservationPaymentDetails.branch_code || '—'}</span>
                      <span><strong className="font-semibold text-[#1f3448]">Account Type:</strong> {reservationPaymentDetails.account_type || '—'}</span>
                      <span><strong className="font-semibold text-[#1f3448]">Reference:</strong> {reservationPaymentDetails.payment_reference_format || 'RES-{unit}-{txn}'}</span>
                    </div>
                    <div className="mt-3 grid gap-1 text-xs text-[#6b7d93] sm:grid-cols-2">
                      <span>Requested: {transaction?.reservation_requested_at ? formatDateTime(transaction.reservation_requested_at) : 'Not requested yet'}</span>
                      <span>Email sent: {transaction?.reservation_email_sent_at ? formatDateTime(transaction.reservation_email_sent_at) : 'Not sent yet'}</span>
                    </div>
                    {reservationPaymentDetails.payment_instructions ? (
                      <p className="mt-3 text-sm leading-6 text-[#4f647a]">
                        {reservationPaymentDetails.payment_instructions}
                      </p>
                    ) : null}
                  </section>

                  <section className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-4">
                    <div className="grid gap-2.5">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void handleSendReservationDepositEmail({ forceResend: false })}
                        disabled={!canEditCoreTransaction || reservationActionLoading === 'send_email' || reservationActionLoading === 'resend_email'}
                      >
                        {reservationActionLoading === 'send_email' ? 'Sending…' : 'Send Deposit Email'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void handleSendReservationDepositEmail({ forceResend: true })}
                        disabled={!canEditCoreTransaction || reservationActionLoading === 'send_email' || reservationActionLoading === 'resend_email'}
                      >
                        {reservationActionLoading === 'resend_email' ? 'Resending…' : 'Resend Email'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void openWorkspaceDocument(reservationProofDocument, { download: false })}
                        disabled={!canAccessReservationProof}
                      >
                        View Uploaded POP
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          void openWorkspaceDocument(reservationProofDocument, {
                            download: true,
                            filename: reservationProofDocument?.name || 'reservation-deposit-proof-of-payment',
                          })
                        }
                        disabled={!canAccessReservationProof}
                      >
                        Download POP
                      </Button>
                      {canEditCoreTransaction ? (
                        <Button
                          type="button"
                          onClick={() => void handleReservationProofDecision('accepted')}
                          disabled={!reservationRequirement?.key || reservationActionLoading === 'accepted'}
                        >
                          {reservationActionLoading === 'accepted' ? 'Marking…' : 'Payment Received'}
                        </Button>
                      ) : null}
                    </div>
                  </section>
                </div>
              </WorkspacePanel>
            ) : null}

            {salesWorkflowSection}
            {financeWorkflowSection}
            <div className="no-print">{transferWorkflowSection}</div>

            <WorkspacePanel
              title="Comments & Updates"
              copy="Shared timeline for system events and manual transaction updates."
              className="no-print"
            >
              <div
                ref={discussionPanelRef}
                className="flex h-[580px] min-h-[480px] flex-col gap-3 overflow-hidden"
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
                            ? 'border-[#cfdceb] bg-white text-[#132131] shadow-[0_5px_14px_rgba(15,23,42,0.06)]'
                            : 'border-[#e2e9f2] bg-[#f8fbff] text-[#647a93] hover:border-[#d2deea] hover:bg-white',
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
                  <div className="space-y-2.5 pb-1">
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
                            'rounded-[16px] border px-4 py-3.5 shadow-[0_6px_16px_rgba(15,23,42,0.04)]',
                            isSystemComment ? 'border-[#eadfce] bg-[#fffdf9]' : 'border-[#e3ebf4] bg-white',
                          ].join(' ')}
                        >
                          <header className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="text-[0.97rem] font-semibold tracking-[-0.02em] text-[#142132]">{cardData.title}</h4>
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

                          <p className="mt-2.5 text-sm font-semibold leading-6 text-[#24384c]">{cardData.summary}</p>
                          {cardData.detail && cardData.detail !== cardData.summary ? (
                            <p className="mt-1.5 text-sm leading-6 text-[#2a3f53]">{cardData.detail}</p>
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
                  className="shrink-0 rounded-[16px] border border-[#dee7f1] bg-white px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
                >
                  <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)_auto] md:items-end">
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

                  <div className="mt-3 rounded-[14px] border border-[#e3ebf4] bg-[#f9fbff] p-3">
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
                          {attorneyAccessInherited ? (
                            <p className="rounded-[12px] border border-[#dbe6f1] bg-[#f7fbff] px-3 py-2 text-xs leading-5 text-[#5f748b]">
                              Access inherited from development: <span className="font-medium text-[#35546c]">{inheritedAttorneyLabel}</span>. Direct assignment here is optional.
                            </p>
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

        {activeWorkspaceMenu === 'bond' ? (
          <div className="space-y-4">
            <WorkspacePanel
              title="Bond Application"
              copy="Read-only view of the client bond application, offers, and grant records."
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Application Status', bondApplicationStatus],
                  ['Finance Type', financeLabel],
                  ['Selected Banks', selectedBondBanks.length ? selectedBondBanks.join(', ') : 'Not selected'],
                  ['Submitted', formatDate(onboardingBondApplication?.submitted_at)],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                    <span className="block text-[0.76rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{label}</span>
                    <strong className="mt-2 block text-base font-semibold text-[#142132]">{formatOnboardingFieldValue(value)}</strong>
                  </article>
                ))}
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <h4 className="text-sm font-semibold text-[#142132]">Application Summary</h4>
                  <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Prefilled client details and captured bond application data.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      ['Applicant', `${onboardingSummary?.first_name || primaryBondApplicant?.first_name || ''} ${onboardingSummary?.last_name || primaryBondApplicant?.last_name || ''}`.trim()],
                      ['Co-applicant', `${coBondApplicant?.first_name || ''} ${coBondApplicant?.last_name || ''}`.trim() || 'Not provided'],
                      ['ID Number', onboardingSummary?.id_number || primaryBondApplicant?.id_number || '—'],
                      ['Email', onboardingSummary?.email || primaryBondApplicant?.email || '—'],
                      ['Phone', onboardingSummary?.phone || primaryBondApplicant?.phone || '—'],
                      ['Marital Status', onboardingSummary?.marital_status || primaryBondApplicant?.marital_status || '—'],
                      ['Purchase Price', currency.format(Number(onboardingSummary?.purchase_price || purchasePriceValue || 0))],
                      ['Deposit / Contribution', onboardingSummary?.deposit_amount || onboardingSummary?.own_contribution || '—'],
                    ].map(([label, value]) => (
                      <article key={label} className="rounded-[14px] border border-[#e5ecf4] bg-white px-3 py-2.5">
                        <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.09em] text-[#8ca0b6]">{label}</span>
                        <strong className="mt-1 block text-sm font-semibold text-[#1c2e42]">{formatOnboardingFieldValue(value)}</strong>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfcfe] p-4">
                  <h4 className="text-sm font-semibold text-[#142132]">Financial Profile</h4>
                  <p className="mt-1 text-xs leading-5 text-[#6b7d93]">Employment, affordability, liabilities, assets, and consent captured from the application.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      ['Employment Status', bondEmployment?.employment_status || '—'],
                      ['Employer', bondEmployment?.employer_name || '—'],
                      ['Occupation', bondEmployment?.occupation || '—'],
                      ['Employment Duration', bondEmployment?.employment_duration || '—'],
                      ['Salary', bondIncome?.salary || '—'],
                      ['Commission', bondIncome?.commission || '—'],
                      ['Rental Income', bondIncome?.rental_income || '—'],
                      ['Other Income', bondIncome?.other_income || '—'],
                      ['Loans', bondBankingLiabilities?.loans || '—'],
                      ['Credit Cards', bondBankingLiabilities?.credit_cards || '—'],
                      ['Property Owned', bondAssets?.property_owned || '—'],
                      ['Net Worth', bondAssets?.net_worth || '—'],
                      ['Debt Review', bondCreditHistory?.under_debt_review || '—'],
                      ['Insolvent', bondCreditHistory?.insolvent || '—'],
                      ['Judgments', bondCreditHistory?.judgments || '—'],
                      ['Consent Complete', bondConsent?.credit_check_consent && bondConsent?.declaration_accepted ? 'Yes' : 'No'],
                    ].map(([label, value]) => (
                      <article key={label} className="rounded-[14px] border border-[#e5ecf4] bg-white px-3 py-2.5">
                        <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.09em] text-[#8ca0b6]">{label}</span>
                        <strong className="mt-1 block text-sm font-semibold text-[#1c2e42]">{formatOnboardingFieldValue(value)}</strong>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </WorkspacePanel>

            <WorkspacePanel
              title="Offers"
              copy="Bank offers uploaded by the bond originator. Client can accept only one offer in the portal."
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {bondOfferDocuments.length ? (
                  bondOfferDocuments.map((document) => {
                    const isAccepted = acceptedOfferDocumentId && String(document?.id || '') === acceptedOfferDocumentId
                    return (
                      <article key={document.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                        <span className="inline-flex items-center rounded-full border border-[#dbe6f1] bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#4f647a]">
                          {isAccepted ? 'Accepted' : 'Uploaded'}
                        </span>
                        <strong className="mt-2 block text-sm font-semibold text-[#142132]">{document.name || 'Bond offer'}</strong>
                        <p className="mt-1 text-xs text-[#7c8ea4]">{document.category || 'Bond Offer'} • {formatDate(document.created_at)}</p>
                      </article>
                    )
                  })
                ) : (
                  <div className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-4 py-5 text-sm text-[#6b7d93]">
                    No bond offers uploaded yet.
                  </div>
                )}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ['Accepted Offer', acceptedBondOfferDocument?.name || 'Not selected'],
                  ['Signed Offer Upload', signedBondOfferDocument?.name || 'Not uploaded'],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-3">
                    <span className="block text-[0.7rem] font-semibold uppercase tracking-[0.09em] text-[#8ca0b6]">{label}</span>
                    <strong className="mt-1 block text-sm font-semibold text-[#1c2e42]">{value}</strong>
                  </article>
                ))}
              </div>
            </WorkspacePanel>

            <WorkspacePanel
              title="Grant"
              copy="Final bond grant and approval records for this transaction."
            >
              {bondGrantDocuments.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {bondGrantDocuments.map((document) => (
                    <article key={document.id} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                      <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Grant document'}</strong>
                      <p className="mt-1 text-xs text-[#7c8ea4]">{document.category || 'Grant'} • {formatDate(document.created_at)}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-4 py-5 text-sm text-[#6b7d93]">
                  No grant documents uploaded yet.
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
          <div className="space-y-5">
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-[1.25rem] font-semibold tracking-[-0.03em] text-[#142132]">Documents</h3>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                    Manage required documents, client uploads, signed agreements, and internal transaction files in one place.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Required', requiredDocumentCount],
                    ['Uploaded', uploadedDocumentCount],
                    ['Missing', missingDocumentCount],
                    ['Client Visible', clientVisibleDocumentCount],
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
              <div>
                <nav className="grid grid-cols-2 gap-2 rounded-[18px] border border-[#e2eaf3] bg-[#f8fbff] p-2 md:grid-cols-3 xl:grid-cols-6">
                  {workspaceDocumentTabs.map((tab) => {
                    const isActive = activeWorkspaceDocumentsTabKey === tab.key
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveWorkspaceDocumentsTab(tab.key)}
                        className={`inline-flex min-h-[44px] items-center justify-center rounded-[14px] px-4 py-2 text-sm font-semibold transition ${
                          isActive
                            ? 'border border-[#d1deeb] bg-white text-[#142132] shadow-[0_10px_22px_rgba(15,23,42,0.08)]'
                            : 'border border-transparent text-[#5f7086] hover:border-[#d8e4ef] hover:bg-white hover:text-[#142132]'
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span className="ml-2 inline-flex min-w-[22px] items-center justify-center rounded-full border border-[#dce6f0] bg-white px-1.5 py-0.5 text-[0.68rem] font-semibold text-[#5f7086]">
                          {tabCountByKey[tab.key] || 0}
                        </span>
                      </button>
                    )
                  })}
                </nav>
              </div>

              {activeWorkspaceDocumentsTabKey === 'sales' ? (
                <section className="mt-4 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Sales Documents</h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Core sale-stage documents and client proof workflows.</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                      {tabCountByKey.sales} items
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {reservationRequired ? (
                      <article className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">Reservation Deposit Proof of Payment</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                              Proof of payment uploaded by the client for the reservation deposit.
                            </p>
                            <p className="mt-2 text-xs font-medium text-[#7b8ca2]">Deposit amount: {reservationAmountValue ? currency.format(reservationAmountValue) : 'Amount pending'}</p>
                            {reservationProofDocument?.name ? (
                              <p className="mt-2 text-xs text-[#6b7d93]">File: {reservationProofDocument.name}</p>
                            ) : null}
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${
                              reservationProofStatusLabel === 'Payment Received'
                                ? 'border-[#cfe3d7] bg-[#eef8f1] text-[#2f7a51]'
                                : reservationProofStatusLabel === 'Rejected / Needs Reupload'
                                  ? 'border-[#f1d8d0] bg-[#fff5f2] text-[#b5472d]'
                                  : reservationProofStatusLabel === 'Uploaded'
                                    ? 'border-[#d8e4ef] bg-[#f4f8fc] text-[#35546c]'
                                    : 'border-[#f4d9d7] bg-[#fff5f4] text-[#b42318]'
                            }`}
                          >
                            {reservationProofStatusLabel}
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void openWorkspaceDocument(reservationProofDocument, { download: false })}
                            disabled={!canAccessReservationProof}
                          >
                            View Uploaded POP
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() =>
                              void openWorkspaceDocument(reservationProofDocument, {
                                download: true,
                                filename: reservationProofDocument?.name || 'reservation-deposit-proof-of-payment',
                              })
                            }
                            disabled={!canAccessReservationProof}
                          >
                            Download POP
                          </button>
                          {canEditCoreTransaction ? (
                            <>
                              <button
                                type="button"
                                className="inline-flex items-center rounded-full border border-[#cfe3d7] bg-[#eef8f1] px-4 py-2 text-sm font-semibold text-[#2f7a51] transition hover:bg-[#e6f4ec] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void handleReservationProofDecision('accepted')}
                                disabled={reservationActionLoading === 'accepted'}
                              >
                                {reservationActionLoading === 'accepted' ? 'Saving...' : 'Payment Received'}
                              </button>
                              <button
                                type="button"
                                className="inline-flex items-center rounded-full border border-[#f1d8d0] bg-[#fff5f2] px-4 py-2 text-sm font-semibold text-[#b5472d] transition hover:bg-[#ffede8] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void handleReservationProofDecision('reupload_required')}
                                disabled={reservationActionLoading === 'reupload_required'}
                              >
                                {reservationActionLoading === 'reupload_required' ? 'Saving...' : 'Request Reupload'}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </article>
                    ) : null}

                    <article className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="block text-sm font-semibold text-[#142132]">Offer to Purchase (OTP)</strong>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">
                            Generate, review, send, and manage the signed OTP.
                          </p>
                          {otpGeneratedDocument?.name ? (
                            <p className="mt-2 text-xs text-[#6b7d93]">Latest: {otpGeneratedDocument.name}</p>
                          ) : null}
                        </div>
                        <span className="inline-flex items-center rounded-full border border-[#d8e4ef] bg-[#f4f8fc] px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                          {otpStatusLabel}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => void handleGenerateOtpDraft()}
                          disabled={!canEditSalesWorkflow || salesActionLoading === 'generate_otp'}
                        >
                          {salesActionLoading === 'generate_otp' ? 'Generating...' : 'Generate OTP'}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => window.open(otpGeneratedDocument?.url || '', '_blank', 'noopener,noreferrer')}
                          disabled={!otpGeneratedDocument?.url}
                        >
                          Review OTP
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => void handleReleaseOtpToClient()}
                          disabled={!canEditSalesWorkflow || salesActionLoading === 'share_otp' || !otpGeneratedDocument}
                        >
                          {salesActionLoading === 'share_otp' ? 'Sharing...' : 'Send to Client'}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={triggerSignedOtpUpload}
                          disabled={!canUploadDocuments || salesActionLoading === 'upload_signed_otp'}
                        >
                          {salesActionLoading === 'upload_signed_otp' ? 'Uploading...' : 'Upload signed OTP'}
                        </button>
                      </div>
                    </article>

                    {salesRequirementsExcludingCore.map((item) => {
                      const itemStatus = String(item.status || 'missing')
                      const statusTone =
                        itemStatus === 'verified'
                          ? 'border-[#cfe3d7] bg-[#eef8f1] text-[#2f7a51]'
                          : itemStatus === 'uploaded'
                            ? 'border-[#d8e4ef] bg-[#f4f8fc] text-[#35546c]'
                            : 'border-[#f4d9d7] bg-[#fff5f4] text-[#b42318]'
                      return (
                        <article key={item.key} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <strong className="block text-sm font-semibold text-[#142132]">{item.label || 'Sales document'}</strong>
                              <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{item.description || 'Required for sale-stage progression.'}</p>
                              {item.matchedDocument?.name ? (
                                <p className="mt-2 text-xs text-[#6b7d93]">Uploaded file: {item.matchedDocument.name}</p>
                              ) : null}
                            </div>
                            <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] ${statusTone}`}>
                              {itemStatus.replaceAll('_', ' ')}
                            </span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {canUploadDocuments ? (
                              <button
                                type="button"
                                className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() =>
                                  openContextualUploadPicker({
                                    key: item.key,
                                    category: item.groupLabel || 'Sales Documents',
                                    requiredDocumentKey: item.key,
                                    documentType: item.portalDocumentType || item.key,
                                    isClientVisible: item.visibilityScope !== 'internal',
                                  })
                                }
                                disabled={uploadingDocumentKey === item.key}
                              >
                                {uploadingDocumentKey === item.key ? 'Uploading...' : item.matchedDocument?.id ? 'Replace document' : 'Upload document'}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => window.open(item.matchedDocument?.url || '', '_blank', 'noopener,noreferrer')}
                              disabled={!item.matchedDocument?.url}
                            >
                              View upload
                            </button>
                            {canEditCoreTransaction ? (
                              <>
                                <button
                                  type="button"
                                  className="inline-flex items-center rounded-full border border-[#d8e4ef] bg-[#f4f8fc] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:bg-[#eaf2fb]"
                                  onClick={() => void handleRequiredDocumentStatusChange(item, 'verified')}
                                  disabled={updatingRequiredDocumentKey === item.key}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center rounded-full border border-[#f1d8d0] bg-[#fff5f2] px-4 py-2 text-sm font-semibold text-[#b5472d] transition hover:bg-[#ffede8]"
                                  onClick={() => void handleRequiredDocumentStatusChange(item, 'missing')}
                                  disabled={updatingRequiredDocumentKey === item.key}
                                >
                                  Request Reupload
                                </button>
                              </>
                            ) : null}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
              ) : null}

              {activeWorkspaceDocumentsTabKey === 'fica' ? (
                <section className="mt-4 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">FICA Documents</h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Identity and compliance documents generated from onboarding answers.</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                      {tabCountByKey.fica} items
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {requiredDocumentBuckets.fica.map((item) => {
                      const itemStatus = String(item.status || 'missing')
                      const statusTone =
                        itemStatus === 'verified'
                          ? 'border-[#cfe3d7] bg-[#eef8f1] text-[#2f7a51]'
                          : itemStatus === 'uploaded'
                            ? 'border-[#d8e4ef] bg-[#f4f8fc] text-[#35546c]'
                            : 'border-[#f4d9d7] bg-[#fff5f4] text-[#b42318]'
                      return (
                        <article key={item.key} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <strong className="block text-sm font-semibold text-[#142132]">{item.label || 'FICA document'}</strong>
                              <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{item.description || 'Compliance document required for transaction verification.'}</p>
                              {item.matchedDocument?.name ? (
                                <p className="mt-2 text-xs text-[#6b7d93]">Uploaded file: {item.matchedDocument.name}</p>
                              ) : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] ${statusTone}`}>
                                {itemStatus.replaceAll('_', ' ')}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[#64748b]">
                                {item.visibilityScope === 'internal' ? 'Internal Only' : 'Client Visible'}
                              </span>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {canUploadDocuments ? (
                              <button
                                type="button"
                                className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() =>
                                  openContextualUploadPicker({
                                    key: item.key,
                                    category: item.groupLabel || 'FICA Documents',
                                    requiredDocumentKey: item.key,
                                    documentType: item.portalDocumentType || item.key,
                                    isClientVisible: item.visibilityScope !== 'internal',
                                  })
                                }
                                disabled={uploadingDocumentKey === item.key}
                              >
                                {uploadingDocumentKey === item.key ? 'Uploading...' : item.matchedDocument?.id ? 'Replace document' : 'Upload document'}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => window.open(item.matchedDocument?.url || '', '_blank', 'noopener,noreferrer')}
                              disabled={!item.matchedDocument?.url}
                            >
                              View upload
                            </button>
                            {canEditCoreTransaction ? (
                              <>
                                <button
                                  type="button"
                                  className="inline-flex items-center rounded-full border border-[#d8e4ef] bg-[#f4f8fc] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:bg-[#eaf2fb]"
                                  onClick={() => void handleRequiredDocumentStatusChange(item, 'verified')}
                                  disabled={updatingRequiredDocumentKey === item.key}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center rounded-full border border-[#f1d8d0] bg-[#fff5f2] px-4 py-2 text-sm font-semibold text-[#b5472d] transition hover:bg-[#ffede8]"
                                  onClick={() => void handleRequiredDocumentStatusChange(item, 'missing')}
                                  disabled={updatingRequiredDocumentKey === item.key}
                                >
                                  Reject / Reupload
                                </button>
                              </>
                            ) : null}
                          </div>
                        </article>
                      )
                    })}

                    {!requiredDocumentBuckets.fica.length && !documentCategoryBuckets.fica.length ? (
                      <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                        No FICA requirements generated for this transaction yet.
                      </div>
                    ) : null}

                    {documentCategoryBuckets.fica.map((document) => (
                      <article key={document.id} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'FICA document'}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.category || 'FICA upload'}</p>
                            <p className="mt-2 text-xs text-[#7b8ca2]">
                              Uploaded by {document.uploaded_by_role ? toTitleLabel(document.uploaded_by_role) : 'Team'} • {formatDate(document.created_at)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-full border border-[#d8e4ef] bg-[#f4f8fc] px-3 py-1.5 text-xs font-semibold text-[#35546c]">Uploaded</span>
                            <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[#64748b]">
                              {document.is_client_visible ? 'Client Visible' : 'Internal Only'}
                            </span>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => window.open(document?.url || '', '_blank', 'noopener,noreferrer')}
                            disabled={!document?.url}
                          >
                            View document
                          </button>
                          {canEditCoreTransaction ? (
                            <button
                              type="button"
                              className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                              onClick={() => void handleToggleDocumentVisibility(document.id, !document.is_client_visible)}
                            >
                              {document.is_client_visible ? 'Mark internal only' : 'Mark client visible'}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              {activeWorkspaceDocumentsTabKey === 'bond' ? (
                <section className="mt-4 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Bond</h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Finance-specific document and lender workflow documents.</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                      {tabCountByKey.bond} items
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {requiredDocumentBuckets.bond.map((item) => (
                      <article key={item.key} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{item.label || 'Bond document'}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{item.description || 'Required for finance progression.'}</p>
                            {item.matchedDocument?.name ? (
                              <p className="mt-2 text-xs text-[#6b7d93]">Uploaded file: {item.matchedDocument.name}</p>
                            ) : null}
                          </div>
                          <span className="inline-flex items-center rounded-full border border-[#d8e4ef] bg-[#f4f8fc] px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                            {String(item.status || 'missing').replaceAll('_', ' ')}
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {canUploadDocuments ? (
                            <button
                              type="button"
                              className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() =>
                                openContextualUploadPicker({
                                  key: item.key,
                                  category: item.groupLabel || 'Bond Documents',
                                  requiredDocumentKey: item.key,
                                  documentType: item.portalDocumentType || item.key,
                                  isClientVisible: item.visibilityScope !== 'internal',
                                })
                              }
                              disabled={uploadingDocumentKey === item.key}
                            >
                              {uploadingDocumentKey === item.key ? 'Uploading...' : item.matchedDocument?.id ? 'Replace document' : 'Upload document'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => window.open(item.matchedDocument?.url || '', '_blank', 'noopener,noreferrer')}
                            disabled={!item.matchedDocument?.url}
                          >
                            View upload
                          </button>
                        </div>
                      </article>
                    ))}

                    {documentCategoryBuckets.bond.map((document) => (
                      <article key={document.id} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Bond document'}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.category || 'Bond workflow document'}</p>
                          </div>
                          <span className="inline-flex items-center rounded-full border border-[#d8e4ef] bg-[#f4f8fc] px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                            Uploaded
                          </span>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => window.open(document?.url || '', '_blank', 'noopener,noreferrer')}
                            disabled={!document?.url}
                          >
                            View document
                          </button>
                        </div>
                      </article>
                    ))}

                    {!requiredDocumentBuckets.bond.length && !documentCategoryBuckets.bond.length ? (
                      <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                        No bond documents are required for this transaction right now.
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {activeWorkspaceDocumentsTabKey === 'additional' ? (
                <section className="mt-4 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Additional Requests</h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Ad hoc requests that are not part of the baseline checklist.</p>
                    </div>
                    <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                      {tabCountByKey.additional} items
                    </span>
                  </div>

                  {canEditCoreTransaction ? (
                    <form className="mt-4 rounded-[16px] border border-[#e3ebf4] bg-white p-4" onSubmit={(event) => void handleCreateDocumentRequest(event)}>
                      <div className="grid gap-3 md:grid-cols-3">
                        <Field
                          label="Document title"
                          value={documentRequestForm.title}
                          onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, title: event.target.value }))}
                          placeholder="Missing supporting statement"
                        />
                        <Field
                          as="select"
                          label="Assign to"
                          value={documentRequestForm.assignedToRole}
                          onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, assignedToRole: event.target.value }))}
                        >
                          <option value="client">Client</option>
                          <option value="agent">Agent</option>
                          <option value="attorney">Attorney</option>
                          <option value="bond_originator">Bond Originator</option>
                          <option value="developer">Developer</option>
                        </Field>
                        <Field
                          label="Description"
                          value={documentRequestForm.description}
                          onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, description: event.target.value }))}
                          placeholder="Add guidance for this request"
                        />
                      </div>
                      <div className="mt-3 flex justify-end">
                        <Button type="submit" disabled={documentRequestSaving}>
                          {documentRequestSaving ? 'Requesting...' : '+ Request Document'}
                        </Button>
                      </div>
                    </form>
                  ) : null}

                  <div className="mt-4 space-y-3">
                    {additionalRequestsForClient.map((request) => {
                      const linkedDocument = request?.requestedDocumentId
                        ? workspaceDocumentsById.get(String(request.requestedDocumentId))
                        : null
                      const statusLabel =
                        request.status === 'completed'
                          ? 'Completed'
                          : request.status === 'rejected'
                            ? 'Rejected'
                            : linkedDocument
                              ? 'Uploaded'
                              : 'Requested'
                      return (
                        <article key={request.id} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <strong className="block text-sm font-semibold text-[#142132]">{request.title || 'Additional request'}</strong>
                              <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{request.description || 'Additional supporting document requested.'}</p>
                              <p className="mt-2 text-xs text-[#7b8ca2]">
                                Requested for {toTitleLabel(request.assignedToRole || 'client')} • {formatDate(request.createdAt)}
                              </p>
                            </div>
                            <span className="inline-flex items-center rounded-full border border-[#d8e4ef] bg-[#f4f8fc] px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                              {statusLabel}
                            </span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {linkedDocument ? (
                              <button
                                type="button"
                                className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => window.open(linkedDocument?.url || '', '_blank', 'noopener,noreferrer')}
                                disabled={!linkedDocument?.url}
                              >
                                View upload
                              </button>
                            ) : null}
                            {canEditCoreTransaction && request.status !== 'completed' ? (
                              <button
                                type="button"
                                className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void handleResendDocumentRequest(request.id)}
                                disabled={documentRequestResendingId === String(request.id)}
                              >
                                {documentRequestResendingId === String(request.id) ? 'Resending...' : 'Resend Request'}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      )
                    })}

                    {requiredDocumentBuckets.additional.map((item) => (
                      <article key={item.key} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{item.label || 'Additional request'}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{item.description || 'Requested additional supporting document.'}</p>
                          </div>
                          <span className="inline-flex items-center rounded-full border border-[#d8e4ef] bg-[#f4f8fc] px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                            {String(item.status || 'missing').replaceAll('_', ' ')}
                          </span>
                        </div>
                      </article>
                    ))}

                    {documentCategoryBuckets.additional.map((document) => (
                      <article key={document.id} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Additional document'}</strong>
                            <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.category || 'Additional request upload'}</p>
                          </div>
                          <span className="inline-flex items-center rounded-full border border-[#d8e4ef] bg-[#f4f8fc] px-3 py-1.5 text-xs font-semibold text-[#35546c]">
                            Uploaded
                          </span>
                        </div>
                        <div className="mt-4">
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => window.open(document?.url || '', '_blank', 'noopener,noreferrer')}
                            disabled={!document?.url}
                          >
                            View document
                          </button>
                        </div>
                      </article>
                    ))}

                    {!additionalRequestsForClient.length &&
                    !requiredDocumentBuckets.additional.length &&
                    !documentCategoryBuckets.additional.length ? (
                      <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                        No additional document requests yet.
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {activeWorkspaceDocumentsTabKey === 'property' ? (
                <section className="mt-4 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Property Documents</h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Post-registration reference and supporting property records.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                        {tabCountByKey.property} items
                      </span>
                      {canUploadDocuments ? (
                        <button
                          type="button"
                          className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                          onClick={() =>
                            openContextualUploadPicker({
                              key: 'property_upload',
                              category: 'Property Documents',
                              documentType: 'property_document',
                              isClientVisible: true,
                            })
                          }
                        >
                          Upload Document
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {[...requiredDocumentBuckets.property, ...documentCategoryBuckets.property].map((item, index) => {
                      const isRequirement = Boolean(item?.requirementKey || item?.key)
                      const key = isRequirement ? `required-${item.key}` : `doc-${item.id || index}`
                      const linkedDocument = isRequirement ? item.matchedDocument : item
                      const title = isRequirement ? item.label : item.name
                      const description = isRequirement ? item.description : item.category
                      return (
                        <article key={key} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                          <strong className="block text-sm font-semibold text-[#142132]">{title || 'Property document'}</strong>
                          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{description || 'Property supporting document.'}</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {isRequirement && canUploadDocuments ? (
                              <button
                                type="button"
                                className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() =>
                                  openContextualUploadPicker({
                                    key: item.key,
                                    category: item.groupLabel || 'Property Documents',
                                    requiredDocumentKey: item.key,
                                    documentType: item.portalDocumentType || item.key,
                                    isClientVisible: true,
                                  })
                                }
                                disabled={uploadingDocumentKey === item.key}
                              >
                                {uploadingDocumentKey === item.key ? 'Uploading...' : linkedDocument?.id ? 'Replace' : 'Upload'}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => window.open(linkedDocument?.url || '', '_blank', 'noopener,noreferrer')}
                              disabled={!linkedDocument?.url}
                            >
                              View / Download
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                  {!requiredDocumentBuckets.property.length && !documentCategoryBuckets.property.length ? (
                    <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                      No property documents available yet.
                    </div>
                  ) : null}
                </section>
              ) : null}

              {activeWorkspaceDocumentsTabKey === 'internal' ? (
                <section className="mt-4 rounded-[22px] border border-[#dbe5ef] bg-[#fbfdff] px-5 py-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-[1.04rem] font-semibold tracking-[-0.03em] text-[#142132]">Internal Documents</h4>
                      <p className="mt-1 text-sm leading-6 text-[#6b7d93]">Internal-only files that should not be exposed to the client portal.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-3 py-1.5 text-xs font-semibold text-[#64748b]">
                        {tabCountByKey.internal} items
                      </span>
                      {canUploadDocuments ? (
                        <button
                          type="button"
                          className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                          onClick={() =>
                            openContextualUploadPicker({
                              key: 'internal_upload',
                              category: 'Internal Documents',
                              documentType: 'internal_document',
                              isClientVisible: false,
                            })
                          }
                        >
                          Upload Document
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {documentCategoryBuckets.internal.map((document) => (
                      <article key={document.id} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                        <div className="flex items-start justify-between gap-2">
                          <strong className="block text-sm font-semibold text-[#142132]">{document.name || 'Internal file'}</strong>
                          <span className="inline-flex items-center rounded-full border border-[#dde7f1] bg-white px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.06em] text-[#64748b]">
                            Internal Only
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{document.category || 'Working document'}</p>
                        <p className="mt-2 text-xs text-[#7b8ca2]">
                          Uploaded by {document.uploaded_by_role ? toTitleLabel(document.uploaded_by_role) : 'Team'} • {formatDate(document.created_at)}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => window.open(document?.url || '', '_blank', 'noopener,noreferrer')}
                            disabled={!document?.url}
                          >
                            View document
                          </button>
                          {canEditCoreTransaction && document.is_client_visible ? (
                            <button
                              type="button"
                              className="inline-flex items-center rounded-full border border-[#f1d8d0] bg-[#fff5f2] px-4 py-2 text-sm font-semibold text-[#b5472d] transition hover:bg-[#ffede8]"
                              onClick={() => void handleToggleDocumentVisibility(document.id, false)}
                            >
                              Remove client visibility
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                  {!documentCategoryBuckets.internal.length ? (
                    <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                      No internal-only documents uploaded yet.
                    </div>
                  ) : null}
                </section>
              ) : null}

              <input
                ref={contextualUploadInputRef}
                type="file"
                className="hidden"
                onChange={(event) => void handleContextualFileSelected(event)}
              />

              {activeWorkspaceDocumentsTabKey === 'bond' && !(normalizedClientFinanceType === 'bond' || normalizedClientFinanceType === 'combination') ? (
                <div className="mt-4 rounded-[18px] border border-dashed border-[#d8e2ee] bg-white px-4 py-5 text-sm text-[#6b7d93]">
                  No bond documents required for this cash transaction.
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

      </div>
    </SharedTransactionShell>
    <ConfirmDialog
      open={deleteTransactionConfirmOpen}
      title="Delete Transaction"
      description={`Are you sure you want to delete this transaction for Unit ${unit?.unit_number || 'this unit'}? This will remove linked workflow, onboarding, and transaction records, and reset the unit to Available.`}
      confirmLabel="Delete Transaction"
      cancelLabel="Cancel"
      variant="destructive"
      confirming={deletingTransaction}
      onCancel={() => !deletingTransaction && setDeleteTransactionConfirmOpen(false)}
      onConfirm={() => void confirmDeleteTransactionFromWorkspace()}
    />
    </>
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
