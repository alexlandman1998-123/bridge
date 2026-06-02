import { Component, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BadgeDollarSign,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FilePlus2,
  HeartPulse,
  Landmark,
  MessageSquare,
  MoreHorizontal,
  PhoneCall,
  Scale,
  Send,
  StickyNote,
  UploadCloud,
  UserRound,
} from 'lucide-react'
import AlterationRequestsPanel from '../components/AlterationRequestsPanel'
import AttorneyCloseoutPanel from '../components/AttorneyCloseoutPanel'
import BondWorkflowLane from '../components/BondWorkflowLane'
import ClientIssuesPanel from '../components/ClientIssuesPanel'
import FinanceWorkflowLane from '../components/FinanceWorkflowLane'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ProgressTimeline from '../components/ProgressTimeline'
import SalesWorkflowLane from '../components/SalesWorkflowLane'
import SharedTransactionShell from '../components/SharedTransactionShell'
import StageAgingChip from '../components/StageAgingChip'
import TransactionLifecycleProgress from '../components/TransactionLifecycleProgress'
import TransactionWorkspaceHeader from '../components/TransactionWorkspaceHeader'
import TransactionWorkspaceMenu from '../components/TransactionWorkspaceMenu'
import TransactionFinanceCommandCenter from '../components/transaction/TransactionFinanceCommandCenter'
import TransferWorkflowLane from '../components/TransferWorkflowLane'
import LegalDocumentWorkspace from '../components/documents/LegalDocumentWorkspace'
import Button from '../components/ui/Button'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import DocumentPacketWorkflowPanel from '../components/documents/DocumentPacketWorkflowPanel'
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
  updateTransactionDocumentRequestStatus,
  buildWorkflowStepComment,
  getTransactionRollup,
  fetchUnitDetail,
  fetchUnitWorkspaceShell,
  parseWorkflowStepComment,
  getOrCreateTransactionOnboarding,
  getOrCreateClientPortalLink,
  archiveTransactionLifecycle,
  saveTransaction,
  saveTransactionClientInformation,
  sendReservationDepositRequest,
  signOffClientIssue,
  runWorkflowAction,
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
import { getRequiredBuyerDocuments } from '../lib/buyerRequirementEngine'
import { normalizeFinanceType } from '../core/transactions/financeType'
import {
  acceptBondOffer,
  captureBondOffer,
  declineBondOffer,
  markBondInstructionSent,
  reviewFinanceDocuments,
  submitBankApplication,
  updateBankApplication as updateFinanceBankApplication,
  updateFinanceBlockerStatus,
  uploadFinanceDocument,
  verifyFinanceProofOfFunds,
} from '../services/transactionFinanceService'
import { resolveFinanceWorkflowSnapshot } from '../core/transactions/financeWorkflow'
import {
  buildTransactionLifecycleSummaryFromRollup,
  formatTransactionRollupStatusLabel,
  USE_TRANSACTION_ROLLUP_OVERVIEW,
} from '../core/transactions/transactionLifecycle'
import {
  getDocumentStatusLabel,
  getDocumentStatusTone,
  normalizeDocumentStatus,
} from '../lib/clientPortalDocumentStatus'
import { OTP_DOCUMENT_TYPES, resolveSalesWorkflowSnapshot } from '../core/transactions/salesWorkflow'
import { resolveBondWorkflowSnapshot } from '../core/transactions/bondWorkflow'
import { resolveTransferWorkflowSnapshot } from '../core/transactions/transferWorkflow'
import { buildWorkflowActivityEvent } from '../core/workflows/events'
import { resolveWorkflowLanePermissions } from '../core/workflows/permissions'
import { buildTransactionStageProgressModel } from '../core/transactions/stageProgressEngine'
import { buildWorkspaceHeaderConfigForRole } from '../core/transactions/workspaceHeaderConfig'
import { normalizePortalWorkspaceCategory, resolvePortalDocumentMetadata } from '../core/documents/portalDocumentMetadata'
import { generatePacketVersion, listPacketTemplates } from '../core/documents/packetService'
import { resolveDocumentPacketActionState, resolveDocumentPacketStatus } from '../core/documents/packetStatusResolver'
import { createDocumentPacket, listDocumentPackets } from '../lib/documentPacketsApi'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const PANEL_SHELL = 'rounded-[28px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-6 shadow-[0_18px_36px_rgba(15,23,42,0.06)]'
const PANEL_COMPACT = 'rounded-[24px] border border-[#dbe5ef] bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[0_16px_34px_rgba(15,23,42,0.05)]'
const WORKSPACE_MENU_IDS = ['overview', 'transfer', 'bond', 'cancellation', 'onboarding', 'documents', 'financials', 'tasks', 'activity', 'alterations', 'snags']
const FINANCE_TYPE_SELECT_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bond', label: 'Bond' },
  { value: 'combination', label: 'Hybrid' },
]
const ONBOARDING_MODE_OPTIONS = [
  { value: 'client_portal', label: 'Client Portal' },
  { value: 'manual', label: 'Manual (Internal)' },
]

function mapLegacyMainStageToWorkflowAction(mainStage = '') {
  const normalized = String(mainStage || '').trim().toUpperCase()

  switch (normalized) {
    case 'FIN':
    case 'FINANCE':
      return 'MOVE_TO_FINANCE'
    case 'ATTY':
    case 'XFER':
    case 'TRANSFER':
      return 'MOVE_TO_TRANSFER'
    case 'REG':
    case 'REGISTRATION':
      return 'MARK_READY_FOR_REGISTRATION'
    case 'COMPLETE':
    case 'REGISTERED':
      return 'MARK_REGISTERED'
    case 'CANCELLED':
    case 'ARCHIVED':
      return 'CANCEL_TRANSACTION'
    default:
      throw new Error(`Direct stage updates are deprecated. Unsupported workflow stage target: ${mainStage}`)
  }
}
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

async function copyTextToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through to the textarea fallback for browsers that block async clipboard writes.
    }
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)

  if (!copied) {
    throw new Error('Unable to copy onboarding link. Please copy it manually from your browser.')
  }
}

const DOCUMENT_LIBRARY_FILTERS = [
  { key: 'all', label: 'All Documents' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'seller', label: 'Seller' },
  { key: 'finance', label: 'Finance' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'bond', label: 'Bond' },
  { key: 'cancellation', label: 'Cancellation' },
  { key: 'signed', label: 'Signed' },
  { key: 'generated', label: 'Generated' },
  { key: 'internal', label: 'Internal' },
]
const DOCUMENT_LIBRARY_STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'required', label: 'Required' },
  { key: 'missing', label: 'Missing' },
  { key: 'pending_review', label: 'Pending Review' },
  { key: 'approved', label: 'Approved' },
]
const DOCUMENT_UPLOAD_VISIBILITY_OPTIONS = [
  { value: 'client_visible', label: 'Client visible' },
  { value: 'shared_role_players', label: 'Shared' },
  { value: 'internal_only', label: 'Internal only' },
]
const DOCUMENT_RELATED_WORKFLOW_OPTIONS = [
  { value: '', label: 'Select workflow' },
  { value: 'sales', label: 'Sales' },
  { value: 'finance', label: 'Finance' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'bond', label: 'Bond' },
  { value: 'cancellation', label: 'Cancellation' },
  { value: 'signed', label: 'Signed document' },
  { value: 'generated', label: 'Generated document' },
  { value: 'other', label: 'Other' },
]
const ADDITIONAL_DOCUMENT_REQUESTED_FROM_OPTIONS = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'buyer_and_seller', label: 'Both Buyer and Seller' },
  { value: 'agent', label: 'Agent' },
  { value: 'developer', label: 'Developer' },
  { value: 'attorney', label: 'Attorney' },
  { value: 'bond_originator', label: 'Bond Originator' },
  { value: 'other', label: 'Other' },
]
const ADDITIONAL_DOCUMENT_VISIBILITY_OPTIONS = [
  { value: 'client_visible', label: 'Client visible' },
  { value: 'internal_only', label: 'Internal only' },
  { value: 'shared_role_players', label: 'Shared role players' },
]
const ADDITIONAL_DOCUMENT_PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent' },
]
const SYSTEM_DISCUSSION_TYPE = 'system'

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
  if (normalized === 'accepted' || normalized === 'approved' || normalized === 'completed') return 'verified'
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

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeDisplayName(value) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return ''
  }

  const lowered = normalized.toLowerCase()
  if (['buyer', 'buyer pending'].includes(lowered)) {
    return ''
  }

  return toTitleLabel(normalized)
}

function isDevelopmentTransactionWorkspace(transaction = {}, unit = {}) {
  const normalizedType = normalizeText(transaction?.transaction_type).toLowerCase()

  if (normalizedType === 'private' || normalizedType === 'private_property') {
    return false
  }

  if (normalizedType === 'development' || normalizedType === 'developer_sale' || normalizedType === 'developer') {
    return true
  }

  return Boolean(transaction?.development_id || transaction?.developmentId || unit?.development_id || unit?.development?.id)
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function normalizeDocumentVaultCategory(value) {
  const normalized = normalizePortalWorkspaceCategory(value)
  if (normalized) return normalized
  return 'additional'
}

function buildWorkspaceDocumentText(document = {}) {
  return `${String(document?.category || '').trim().toLowerCase()} ${String(document?.name || document?.label || '').trim().toLowerCase()} ${String(
    document?.document_type || document?.portal_document_type || document?.portalDocumentType || document?.documentType || '',
  ).trim().toLowerCase()} ${String(document?.stage_key || document?.stageKey || '').trim().toLowerCase()} ${String(
    document?.groupKey || document?.group_key || '',
  ).trim().toLowerCase()}`.trim()
}

function resolveDocumentVisibilityFromSource(source = {}) {
  const scope = String(
    source?.visibility_scope || source?.visibility || source?.visibilityScope || (source?.is_client_visible === false ? 'internal' : source?.is_client_visible === true ? 'client_visible' : ''),
  )
    .trim()
    .toLowerCase()
  if (scope.includes('internal')) {
    return 'Internal'
  }
  if (scope === 'client_visible' || scope === 'shared_role_players') {
    return 'Shared'
  }
  if (scope === 'shared' || scope === '') {
    return 'Shared'
  }
  return 'Internal'
}

function inferLibraryCategoryFromTokens(tokens = '') {
  const haystack = String(tokens || '')
    .toLowerCase()

  if (/signed|signature|executed|registrat/.test(haystack)) {
    return 'signed'
  }
  if (/generated|packet|auto[-_ ]?generated|draft/.test(haystack)) {
    return 'generated'
  }
  if (/cancellation|cancel/.test(haystack)) {
    return 'cancellation'
  }
  if (/seller/.test(haystack)) {
    return 'seller'
  }
  if (/bond|lender|finance|tax|bank|statement|income|affordability|proof of funds|paystub|salary|credit|proof/.test(haystack)) {
    return 'finance'
  }
  if (/transfer|title deed|warranty|registration|handover|lodge|occupation/.test(haystack)) {
    return 'transfer'
  }
  if (/otp|offer|reservation|reservation_deposit|signed otp|sale|sales|instruction/.test(haystack)) {
    return 'buyer'
  }
  if (/internal|commission|working|admin|confidential|private/.test(haystack)) {
    return 'internal'
  }

  return ''
}

function resolveDocumentLibraryCategory(document = {}) {
  const metadata = resolvePortalDocumentMetadata({
    ...document,
    portal_workspace_category: document?.portal_workspace_category || document?.portalWorkspaceCategory,
    document_type: document?.document_type || document?.portal_document_type || document?.portalDocumentType || document?.documentType,
    stage_key: document?.stage_key || document?.stageKey,
    category: document?.category,
    name: document?.name || document?.label,
    groupKey: document?.group_key || document?.groupKey,
    key: document?.document_type || document?.portalDocumentType || document?.documentType || document?.key,
  })
  const tokens = buildWorkspaceDocumentText({
    ...document,
    document_type: metadata.portalDocumentType,
    portalWorkspaceCategory: metadata.portalWorkspaceCategory,
  })
  const categoryFromTokens = inferLibraryCategoryFromTokens(tokens)
  if (categoryFromTokens) {
    return categoryFromTokens
  }

  const sourceCategory = normalizePortalWorkspaceCategory(metadata?.portalWorkspaceCategory)
  if (sourceCategory === 'sales') return 'buyer'
  if (sourceCategory === 'fica') return 'buyer'
  if (sourceCategory === 'bond') return 'finance'
  if (sourceCategory === 'property') return 'transfer'
  if (sourceCategory === 'additional') return 'generated'

  return 'buyer'
}

function resolveRequirementLibraryCategory(requirement = {}) {
  const requirementTokens = `${String(requirement?.key || '').trim().toLowerCase()} ${String(requirement?.label || '').trim().toLowerCase()} ${String(
    requirement?.groupKey || requirement?.group_key || '',
  )
    .trim()
    .toLowerCase()} ${String(requirement?.expectedFromRole || requirement?.required_from_role || '').trim().toLowerCase()}`
  const byTokens = inferLibraryCategoryFromTokens(requirementTokens)
  if (byTokens) {
    return byTokens
  }

  const groupKey = String(requirement?.groupKey || requirement?.group_key || '').trim().toLowerCase()
  if (groupKey.includes('finance') || requirement?.required_from_role === 'bond_originator' || requirement?.expectedFromRole === 'bond_originator') {
    return 'finance'
  }
  if (groupKey.includes('finance')) {
    return 'finance'
  }
  if (groupKey.includes('transfer')) {
    return 'transfer'
  }
  if (groupKey.includes('cancellation')) {
    return 'cancellation'
  }
  if (/seller/.test(String(requirement?.expectedFromRole || '').toLowerCase())) {
    return 'seller'
  }
  return 'buyer'
}

function resolveDocumentLibraryVisibility(document = {}) {
  return resolveDocumentVisibilityFromSource(document)
}

function normalizeLibraryCategory(category = '') {
  const normalized = String(category || '').trim().toLowerCase()
  if (['all', 'buyer', 'seller', 'finance', 'transfer', 'bond', 'cancellation', 'signed', 'generated', 'internal'].includes(normalized)) {
    return normalized
  }
  return ''
}

function normalizeLibraryStatus(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (!normalized) {
    return 'uploaded'
  }
  if (normalized === 'required' || normalized === 'missing') {
    return 'missing'
  }
  if (normalized === 'requested') {
    return 'requested'
  }
  if (normalized === 'reviewed' || normalized === 'under_review' || normalized === 'pending_review') {
    return 'under_review'
  }
  if (normalized === 'verified' || normalized === 'accepted' || normalized === 'approved' || normalized === 'completed') {
    return 'approved'
  }
  if (normalized === 'rejected' || normalized === 'reupload_required') {
    return 'rejected'
  }
  if (normalized === 'superseded') {
    return 'superseded'
  }
  return normalized
}

function getLibraryStatusTone(status = '') {
  const normalized = normalizeLibraryStatus(status)
  if (normalized === 'missing' || normalized === 'requested') {
    return 'border-[#f1ddd0] bg-[#fff8f3] text-[#a15b31]'
  }
  if (normalized === 'under_review') {
    return 'border-[#d8e4ef] bg-[#f4f8fc] text-[#35546c]'
  }
  if (normalized === 'approved') {
    return 'border-[#cfe3d7] bg-[#eef8f1] text-[#2f7a51]'
  }
  if (normalized === 'rejected') {
    return 'border-[#f1cbc7] bg-[#fff5f4] text-[#b42318]'
  }
  if (normalized === 'superseded') {
    return 'border-[#f7eadb] bg-[#fff9f0] text-[#8a5511]'
  }
  return 'border-[#dde7f1] bg-[#f8fbff] text-[#64748b]'
}

function formatLibraryStatusLabel(status = '') {
  const normalized = normalizeLibraryStatus(status)
  if (normalized === 'missing') return 'Missing'
  if (normalized === 'requested') return 'Requested'
  if (normalized === 'uploaded') return 'Uploaded'
  if (normalized === 'under_review') return 'Pending Review'
  if (normalized === 'approved') return 'Approved'
  if (normalized === 'rejected') return 'Rejected'
  if (normalized === 'superseded') return 'Superseded'
  return toTitleLabel(normalized || 'Unknown')
}

function resolveRequiredPartyLabel(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) {
    return 'Internal'
  }
  if (normalized.includes('bond')) return 'Bond'
  if (normalized.includes('seller')) return 'Seller'
  if (normalized.includes('attorney')) return 'Attorney'
  if (normalized.includes('agent')) return 'Agent'
  if (normalized.includes('buyer')) return 'Buyer'
  return toTitleLabel(normalized)
}

function resolveUploadedByLabel(document = {}, participants = []) {
  const role = String(document?.uploaded_by_role || '').trim()
  const participant =
    participants.find((entry) => String(entry?.roleType || '').trim().toLowerCase() === String(role).trim().toLowerCase()) || null
  if (participant?.participantName) {
    return participant.participantName
  }
  if (role) {
    return toTitleLabel(role)
  }
  return 'System'
}

function resolveDocumentRequestLibraryCategory(documentRequest = {}) {
  const requestedFrom = String(documentRequest?.requestedFrom || documentRequest?.requested_from || documentRequest?.audience || '').trim().toLowerCase()
  if (requestedFrom.includes('seller')) return 'seller'
  if (requestedFrom.includes('attorney') || requestedFrom.includes('conveyancer') || requestedFrom.includes('lawyer')) return 'transfer'
  if (requestedFrom.includes('bond') || requestedFrom.includes('finance') || requestedFrom.includes('lender') || requestedFrom.includes('originator')) {
    return 'finance'
  }
  if (requestedFrom.includes('internal') || requestedFrom.includes('agent') || requestedFrom.includes('developer')) {
    return 'internal'
  }
  return 'buyer'
}

function resolveDocumentRequestVisibilityLabel(documentRequest = {}) {
  const visibility = String(documentRequest?.visibility || '').trim().toLowerCase()
  if (visibility === 'internal_only') return 'Internal'
  if (visibility === 'client_visible' || visibility === 'shared' || visibility === 'shared_role_players') {
    return 'Shared'
  }
  return 'Internal'
}

function resolveLibraryUploadVisibilityScope(selection = 'client_visible') {
  const normalized = String(selection || 'client_visible').trim().toLowerCase()
  if (normalized === 'internal_only') return 'internal'
  if (normalized === 'shared_role_players') return 'shared'
  return 'shared'
}

function resolveDocumentWorkflowLabel(document = {}) {
  const workflow = String(
    document?.stage_key ||
      document?.stageKey ||
      document?.workflow ||
      document?.relatedWorkflow ||
      document?.finance_lane ||
      document?.financeLane ||
      '',
  )
    .trim()
    .toLowerCase()

  if (!workflow) {
    return ''
  }

  return workflow
    .split('_')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
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

function resolveWorkspaceModeFromAction(actionKey = '') {
  const normalized = String(actionKey || '').trim().toLowerCase()
  if (normalized === 'generate') return 'generate'
  if (normalized === 'edit') return 'edit'
  if (normalized === 'send') return 'send'
  if (normalized === 'view_signed') return 'signed'
  return 'view'
}

function buildDynamicRequiredDocuments({
  purchaserType,
  financeType,
  requirementProfile = null,
  requiredChecklist = [],
  statusOverrides = {},
}) {
  const profileRules = getRequiredBuyerDocuments(requirementProfile).map((item) => ({
    key: item.key,
    label: item.label,
    matchers: [item.key, item.label],
    requirementLevel: item.requirementLevel || 'required',
    groupKey: item.groupKey || null,
  }))
  const rules = profileRules.length ? profileRules : getRequiredDocs(purchaserType, financeType)
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

function parseDate(dateLike) {
  if (!dateLike) {
    return null
  }
  const date = new Date(dateLike)
  return Number.isNaN(date.getTime()) ? null : date
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

function getAdditionalRequestStatusLabel(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'under_review' || normalized === 'reviewed') return 'Under Review'
  if (normalized === 'uploaded') return 'Uploaded'
  if (normalized === 'rejected') return 'Rejected'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'cancelled') return 'Cancelled'
  return 'Requested'
}

function getAdditionalRequestStatusClasses(status) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'completed') return 'border-[#cde8d5] bg-[#effaf3] text-[#157347]'
  if (normalized === 'rejected') return 'border-[#f4c9c4] bg-[#fef3f2] text-[#b42318]'
  if (normalized === 'cancelled') return 'border-[#e2e8f0] bg-[#f8fafc] text-[#475467]'
  if (normalized === 'uploaded') return 'border-[#d7e5f5] bg-[#f5f9ff] text-[#35546c]'
  if (normalized === 'under_review' || normalized === 'reviewed') return 'border-[#d7e5f5] bg-[#f0f7ff] text-[#1d4f91]'
  return 'border-[#d8e4ef] bg-[#f4f8fc] text-[#35546c]'
}

function getAdditionalRequestPriorityLabel(priority) {
  const normalized = String(priority || '').trim().toLowerCase()
  if (normalized === 'urgent' || normalized === 'required') return 'Urgent'
  return 'Normal'
}

function getAdditionalRequestRequestedFromLabel(requestedFrom) {
  const normalized = String(requestedFrom || '').trim().toLowerCase()
  const matched = ADDITIONAL_DOCUMENT_REQUESTED_FROM_OPTIONS.find((option) => option.value === normalized)
  if (matched?.label) return matched.label
  return toTitleLabel(normalized || 'buyer')
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

function getRollupHealthLabel(parentStatus = '') {
  const normalized = String(parentStatus || '').trim().toLowerCase()
  if (normalized === 'blocked') return 'Blocked'
  if (normalized === 'ready_for_handoff') return 'Ready'
  if (normalized === 'complete') return 'Complete'
  if (normalized === 'not_started') return 'Waiting'
  return 'In Progress'
}

function getRollupMatterHealthTone(parentStatus = '') {
  const normalized = String(parentStatus || '').trim().toLowerCase()
  if (normalized === 'blocked') return 'border-[#f5d7bc] bg-[#fff7ed] text-[#b85d12]'
  if (normalized === 'ready_for_handoff' || normalized === 'complete') {
    return 'border-[#cfe8d8] bg-[#effaf3] text-[#197a45]'
  }
  if (normalized === 'not_started') return 'border-[#d9e3ee] bg-[#f7fafc] text-[#60758c]'
  return 'border-[#d9e3ee] bg-[#f7fafc] text-[#35546c]'
}

function getRollupOverviewTarget(action = {}, rollup = null) {
  const actionKey = String(action?.actionKey || '').trim().toLowerCase()
  if (actionKey === 'move_to_finance') return 'documents'
  if (actionKey === 'move_to_transfer') return 'financials'
  if (actionKey === 'mark_ready_for_registration' || actionKey === 'mark_registered') return 'transfer'

  const workflowKey = String(action?.workflowKey || rollup?.activeWorkflowKey || '').trim().toLowerCase()
  if (workflowKey === 'sales_otp') return 'documents'
  if (workflowKey.startsWith('finance')) return 'financials'
  if (workflowKey === 'registration') return 'transfer'
  if (workflowKey.includes('transfer') || workflowKey.includes('attorney') || workflowKey.includes('cancellation')) {
    return 'transfer'
  }
  return 'overview'
}

function buildOverviewActionFromRollup(rollup = null, transaction = null) {
  const primaryAction =
    (rollup?.availableActions || []).find((item) => item?.enabled) ||
    (rollup?.availableActions || [])[0] ||
    null

  return {
    title:
      primaryAction?.label ||
      rollup?.nextAction?.label ||
      `Review ${String(rollup?.parentStage || 'workflow').replaceAll('_', ' ')}`,
    description:
      primaryAction?.reason ||
      rollup?.blockers?.[0]?.message ||
      (rollup?.nextAction?.label
        ? `Current workflow: ${rollup.nextAction.label}.`
        : 'Review transaction progress.'),
    dueLabel:
      transaction?.expected_transfer_date ||
      transaction?.target_registration_date ||
      rollup?.derivedAt ||
      transaction?.updated_at ||
      transaction?.created_at ||
      null,
    priority: String(rollup?.parentStatus || '').trim().toLowerCase() === 'blocked' ? 'High' : 'Normal',
    statusLabel: formatTransactionRollupStatusLabel(rollup?.parentStatus),
    primaryAction,
  }
}

function getRollupHeaderActionVariant(action = {}) {
  const groupKey = String(action?.groupKey || '').trim().toLowerCase()
  if (groupKey === 'stage' || groupKey === 'finance' || groupKey === 'attorney') {
    return 'primary'
  }
  return 'secondary'
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
  transfer: [
    { label: 'Instruction Received', keywords: ['instruction received', 'instruction'] },
    { label: 'FICA Reviewed', keywords: ['fica reviewed', 'fica'] },
    { label: 'Buyer Signed Transfer Documents', keywords: ['buyer signed transfer documents', 'buyer signed'] },
    { label: 'Lodgement Submitted', keywords: ['lodgement submitted', 'lodgement'] },
    { label: 'Registration Confirmed', keywords: ['registration confirmed', 'registered'] },
  ],
  attorney: [
    { label: 'Instruction Received', keywords: ['instruction received', 'instruction'] },
    { label: 'FICA Reviewed', keywords: ['fica reviewed', 'fica'] },
    { label: 'Buyer Signed Transfer Documents', keywords: ['buyer signed transfer documents', 'buyer signed'] },
    { label: 'Lodgement Submitted', keywords: ['lodgement submitted', 'lodgement'] },
    { label: 'Registration Confirmed', keywords: ['registration confirmed', 'registered'] },
  ],
  bond: [
    { label: 'Bond Instruction Received', keywords: ['bond instruction received', 'bond instruction'] },
    { label: 'Bank Conditions Reviewed', keywords: ['bank conditions reviewed', 'conditions reviewed'] },
    { label: 'Buyer Signed Bond Documents', keywords: ['buyer signed bond documents', 'bond documents signed'] },
    { label: 'Bond Lodgement Submitted', keywords: ['bond lodgement submitted', 'bond lodged'] },
    { label: 'Bond Registration Confirmed', keywords: ['bond registration confirmed', 'bond registered'] },
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
  const transferProcess =
    (transactionSubprocesses || []).find((item) => item?.process_type === 'transfer') ||
    (transactionSubprocesses || []).find((item) => item?.process_type === 'attorney') ||
    null
  const bondProcess = (transactionSubprocesses || []).find((item) => item?.process_type === 'bond') || null
  const totalWorkflowSteps = [financeProcess, transferProcess, bondProcess].reduce(
    (total, process) => total + (process?.steps || []).length,
    0,
  )
  const completedWorkflowSteps = [financeProcess, transferProcess, bondProcess].reduce(
    (total, process) =>
      total +
      (process?.steps || []).filter((step) => normalizeWorkflowStepStatus(step?.status) === 'completed').length,
    0,
  )
  const workflowCardsMarkup = [
    buildWorkflowSummaryMarkup(financeProcess, 'finance', 'Finance Workflow'),
    buildWorkflowSummaryMarkup(transferProcess, 'transfer', 'Transfer Workflow'),
    buildWorkflowSummaryMarkup(bondProcess, 'bond', 'Bond Registration'),
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
  transfer: 'Transfer Workflow',
  attorney: 'Transfer Workflow',
  bond: 'Bond Registration',
}

const WORKFLOW_STATUS_LABELS = {
  completed: 'Completed',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  not_started: 'Pending',
}

function _buildOtpPreviewHtml({ buyer, unit, transaction, purchasePriceLabel, onboardingStatus, specialConditions = '' }) {
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
  const normalizedSpecialConditions = String(specialConditions || '').trim()

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
      normalizedSpecialConditions
        ? `
        <section class="onboarding-print-section">
          <div class="onboarding-print-section-header">
            <h2>Special Conditions</h2>
            <span>Added from generation modal</span>
          </div>
          <div class="onboarding-print-panel">
            <p class="onboarding-print-paragraph">${escapeHtml(normalizedSpecialConditions)}</p>
          </div>
        </section>
      `
        : '',
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
      title: 'Transfer Workflow Updated',
      summary: changedFromToMatch ? `${changedFromToMatch[1]} → ${changedFromToMatch[2]}` : compact.replace(/^attorney workflow updated:\s*/i, ''),
      detail: compact,
    }
  }

  if (/transfer workflow updated:/i.test(compact)) {
    return {
      title: 'Transfer Workflow Updated',
      summary: changedFromToMatch ? `${changedFromToMatch[1]} → ${changedFromToMatch[2]}` : compact.replace(/^transfer workflow updated:\s*/i, ''),
      detail: compact,
    }
  }

  if (/bond workflow updated:/i.test(compact)) {
    return {
      title: 'Bond Workflow Updated',
      summary: changedFromToMatch ? `${changedFromToMatch[1]} → ${changedFromToMatch[2]}` : compact.replace(/^bond workflow updated:\s*/i, ''),
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
  const location = useLocation()
  const { unitId } = useParams()
  const [searchParams] = useSearchParams()
  const { role: workspaceRole } = useWorkspace()
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deferredLoading, setDeferredLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sendingOnboardingEmail, setSendingOnboardingEmail] = useState(false)
  const [sendingClientPortalLink, setSendingClientPortalLink] = useState(false)
  const [onboardingLinkCopied, setOnboardingLinkCopied] = useState(false)
  const [clientPortalLinkCopied, setClientPortalLinkCopied] = useState(false)
  const [transactionRollup, setTransactionRollup] = useState(null)
  const [transactionRollupError, setTransactionRollupError] = useState('')
  const [deletingTransaction, setDeletingTransaction] = useState(false)
  const [deleteTransactionConfirmOpen, setDeleteTransactionConfirmOpen] = useState(false)
  const [archivingTransaction, setArchivingTransaction] = useState(false)
  const [archiveTransactionConfirmOpen, setArchiveTransactionConfirmOpen] = useState(false)
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
  const [activeDocumentLibraryCategory, setActiveDocumentLibraryCategory] = useState('all')
  const [activeDocumentLibraryStatus, setActiveDocumentLibraryStatus] = useState('all')
  const [uploadDocumentModalOpen, setUploadDocumentModalOpen] = useState(false)
  const [documentUploadForm, setDocumentUploadForm] = useState({
    file: null,
    fileName: '',
    category: '',
    documentType: '',
    visibility: 'client_visible',
    relatedWorkflow: '',
    satisfiesRequiredDocument: 'yes',
    notes: '',
    requiredDocumentId: '',
    documentRequestId: '',
    requestTitle: '',
  })
  const [uploadingDocumentKey, setUploadingDocumentKey] = useState('')
  const [documentRequestForm, setDocumentRequestForm] = useState({
    title: '',
    requestedFrom: 'buyer',
    visibility: 'client_visible',
    notes: '',
    priority: 'normal',
    dueDate: '',
  })
  const [documentRequestSaving, setDocumentRequestSaving] = useState(false)
  const [documentRequestResendingId, setDocumentRequestResendingId] = useState('')
  const [documentRequestStatusUpdatingId, setDocumentRequestStatusUpdatingId] = useState('')
  const [showAdditionalRequestForm, setShowAdditionalRequestForm] = useState(false)
  const [otpModalOpen, setOtpModalOpen] = useState(false)
  const [otpSpecialConditions, setOtpSpecialConditions] = useState('')
  const [otpModalMessage, setOtpModalMessage] = useState('')
  const [otpPacketId, setOtpPacketId] = useState('')
  const [otpPacketTemplates, setOtpPacketTemplates] = useState([])
  const [legalWorkspaceOpen, setLegalWorkspaceOpen] = useState(false)
  const [legalWorkspaceMode] = useState('view')
  const [otpPacketStatusLoading, setOtpPacketStatusLoading] = useState(false)
  const [otpPacketStatus, setOtpPacketStatus] = useState(() => ({
    packetType: 'otp',
    state: 'NO_PACKET',
    packet: null,
    versions: [],
    signingSummary: null,
    warnings: [],
    actionHint: 'No packet record was found for this context.',
  }))
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
  const [bondActionLoading, setBondActionLoading] = useState('')
  const [bondHybridFinanceActionLoading, setBondHybridFinanceActionLoading] = useState('')
  const [clientInfoSavedAt, setClientInfoSavedAt] = useState('')
  const purchaserTypeOptions = getPurchaserTypeOptions()
  const discussionPanelRef = useRef(null)
  const workspaceMenuRef = useRef(null)
  const workflowPanelRef = useRef(null)
  const signedOtpUploadInputRef = useRef(null)
  const uploadDocumentFileInputRef = useRef(null)
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
    let active = true

    async function loadTransactionRollupState() {
      const transactionId = String(detail?.transaction?.id || '').trim()
      if (!USE_TRANSACTION_ROLLUP_OVERVIEW || !transactionId) {
        if (!active) return
        setTransactionRollup(null)
        setTransactionRollupError('')
        return
      }

      try {
        const rollup = await getTransactionRollup(transactionId, { actorRole: actingRole })
        if (!active) return
        setTransactionRollup(rollup)
        setTransactionRollupError('')
      } catch (rollupError) {
        if (!active) return
        setTransactionRollup(null)
        setTransactionRollupError(rollupError?.message || 'Unable to load transaction roll-up.')
      }
    }

    void loadTransactionRollupState()
    return () => {
      active = false
    }
  }, [actingRole, detail?.transaction?.current_main_stage, detail?.transaction?.id, detail?.transaction?.stage, detail?.transaction?.updated_at])

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
    let active = true
    const transactionId = String(detail?.transaction?.id || '').trim()
    if (!transactionId) {
      setOtpPacketStatus({
        packetType: 'otp',
        state: 'NO_PACKET',
        packet: null,
        versions: [],
        signingSummary: null,
        warnings: [],
        actionHint: 'No packet record was found for this context.',
      })
      setOtpPacketStatusLoading(false)
      return () => {
        active = false
      }
    }

    const loadPacketStatus = async () => {
      setOtpPacketStatusLoading(true)
      try {
        const resolved = await resolveDocumentPacketStatus({
          packetType: 'otp',
          transactionId,
          organisationId: detail?.transaction?.organisation_id || null,
        })
        if (!active) return
        setOtpPacketStatus(resolved)
      } catch (statusError) {
        if (!active) return
        setOtpPacketStatus({
          packetType: 'otp',
          state: 'UNKNOWN',
          packet: null,
          versions: [],
          signingSummary: null,
          warnings: [String(statusError?.message || 'Unable to resolve OTP packet status.')],
          actionHint: 'Packet status resolver failed. Use existing action flow as fallback.',
        })
      } finally {
        if (active) setOtpPacketStatusLoading(false)
      }
    }

    void loadPacketStatus()
    return () => {
      active = false
    }
  }, [detail?.transaction?.id, detail?.transaction?.organisation_id])

  useEffect(() => {
    function scrollToSection(ref) {
      ref?.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }

    function setUploadCategoryForRoleFromQuickAction() {
      if (actingRole === 'attorney') {
        setActiveDocumentLibraryCategory('transfer')
        setActiveDocumentLibraryStatus('missing')
        return
      }

      if (actingRole === 'bond_originator') {
        setActiveDocumentLibraryCategory('finance')
        setActiveDocumentLibraryStatus('missing')
        return
      }

      const firstMissing = (detail?.requiredDocumentChecklist || []).find((item) => {
        const status = String(item?.status || item?.requirementStatus || '').trim().toLowerCase()
        return status === 'missing' || status === 'requested' || !item?.complete
      })
      const category = firstMissing ? normalizeLibraryCategory(resolveRequirementLibraryCategory(firstMissing)) : 'all'
      setActiveDocumentLibraryCategory(category || 'all')
      setActiveDocumentLibraryStatus('missing')
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

  async function handleOverviewWorkflowAction(action = null) {
    const actionKey = String(action?.actionKey || '').trim()
    if (!detail?.transaction?.id || !actionKey) return

    try {
      setSaving(true)
      setError('')
      const result = await runWorkflowAction({
        transactionId: detail.transaction.id,
        actionKey,
        payload: { source: 'rollup_overview' },
        actorRole: actingRole,
      })
      if (!result?.allowed) {
        throw new Error((result?.blockers || []).map((item) => item.message).filter(Boolean).join(' • ') || 'Workflow action is blocked.')
      }
      await loadDetail()
      if (USE_TRANSACTION_ROLLUP_OVERVIEW) {
        try {
          const refreshedRollup = await getTransactionRollup(detail.transaction.id, { actorRole: actingRole })
          setTransactionRollup(refreshedRollup)
          setTransactionRollupError('')
        } catch (rollupError) {
          setTransactionRollup(null)
          setTransactionRollupError(rollupError?.message || 'Unable to load transaction roll-up.')
        }
      }
    } catch (actionError) {
      setError(actionError?.message || 'Unable to run workflow action.')
    } finally {
      setSaving(false)
    }
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

  function _openStageEditor(targetStage) {
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

      const actionKey = mapLegacyMainStageToWorkflowAction(nextMainStage)
      const result = await runWorkflowAction({
        transactionId: detail.transaction.id,
        actionKey,
        actorRole: effectiveEditorRole,
        payload: {
          note,
          reason: actionKey === 'CANCEL_TRANSACTION' ? note : null,
          source: 'unit_detail_stage_editor',
        },
      })
      const nextStage =
        result?.compatibility?.stage ||
        result?.rollup?.parentStage ||
        previousMainStage
      const nextCompatibilityMainStage =
        result?.compatibility?.current_main_stage ||
        previousMainStage

      setDetail((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          mainStage: nextCompatibilityMainStage,
          stage: nextStage,
          transaction: previous.transaction
            ? {
                ...previous.transaction,
                stage: nextStage,
                current_main_stage: nextCompatibilityMainStage,
                updated_at: new Date().toISOString(),
              }
            : previous.transaction,
        }
      })
      setStageForm((previous) => ({ ...previous, main_stage: nextCompatibilityMainStage }))

      const fromLabel = MAIN_STAGE_LABELS[previousMainStage] || previousMainStage
      const toLabel = MAIN_STAGE_LABELS[nextCompatibilityMainStage] || nextCompatibilityMainStage
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

  function openUploadDocumentModal({
    category = 'General',
    documentType = '',
    visibility = 'client_visible',
    relatedWorkflow = '',
    satisfiesRequiredDocument = 'yes',
    requiredDocumentId = '',
    documentRequestId = '',
    requestTitle = '',
  } = {}) {
    setDocumentUploadForm((previous) => ({
      ...previous,
      file: null,
      fileName: '',
      category: String(category || 'General').trim(),
      documentType: String(documentType || '').trim(),
      visibility: String(visibility || 'client_visible').trim(),
      relatedWorkflow: String(relatedWorkflow || '').trim(),
      satisfiesRequiredDocument,
      notes: String(previous.notes || '').trim(),
      requiredDocumentId: String(requiredDocumentId || '').trim(),
      documentRequestId: String(documentRequestId || '').trim(),
      requestTitle: String(requestTitle || '').trim(),
    }))
    setUploadDocumentModalOpen(true)
  }

  function closeUploadDocumentModal() {
    setUploadDocumentModalOpen(false)
    setDocumentUploadForm((previous) => ({
      ...previous,
      file: null,
      fileName: '',
      requiredDocumentId: '',
      documentRequestId: '',
      requestTitle: '',
    }))
  }

  function resolveLibraryUploadVisibilityFromLabel(value = '') {
    const normalized = String(value || '').trim().toLowerCase()
    if (normalized === 'internal') {
      return 'internal_only'
    }
    if (normalized === 'shared') {
      return 'shared_role_players'
    }
    return 'client_visible'
  }

  function openUploadFromLibraryRow(row = {}) {
    openUploadDocumentModal({
      category: String(row?.category || row?.document?.category || 'General').trim() || 'General',
      documentType: String(row?.document?.document_type || row?.document?.documentType || row?.documentType || row?.category || '').trim(),
      visibility: resolveLibraryUploadVisibilityFromLabel(row?.visibility || ''),
      relatedWorkflow: String(row?.relatedWorkflow || '').trim(),
      satisfiesRequiredDocument: row?.source === 'required' ? 'yes' : 'no',
      requiredDocumentId: String(row?.requiredDocumentId || '').trim(),
      documentRequestId: String(row?.documentRequestId || '').trim(),
      requestTitle: String(row?.name || '').trim(),
    })
  }

  function handleDocumentUploadFileSelect(event) {
    const [file] = Array.from(event.target.files || [])
    if (!file) {
      return
    }

    setDocumentUploadForm((previous) => ({
      ...previous,
      file,
      fileName: file.name || '',
    }))
  }

  async function handleUploadDocumentSubmit(event) {
    event.preventDefault()
    if (!detail?.transaction?.id) {
      return
    }

    if (!documentUploadForm.file) {
      setError('Select a file to upload.')
      return
    }

    const file = documentUploadForm.file
    const category = String(documentUploadForm.category || 'General').trim()
    const documentType = String(documentUploadForm.documentType || '').trim()
    const relatedWorkflow = String(documentUploadForm.relatedWorkflow || '').trim()
    const satisfiesRequiredDocument =
      String(documentUploadForm.satisfiesRequiredDocument || 'no').trim().toLowerCase() === 'yes'
    const requiredDocumentId = satisfiesRequiredDocument ? String(documentUploadForm.requiredDocumentId || '').trim() : ''
    const documentRequestId = String(documentUploadForm.documentRequestId || '').trim()
    const visibility = String(documentUploadForm.visibility || 'client_visible').trim()
    const uploadKey = documentRequestId || requiredDocumentId || category || 'document_upload'

    try {
      setUploadingDocumentKey(uploadKey)
      setError('')
      await uploadDocument({
        transactionId: detail.transaction.id,
        file,
        category,
        isClientVisible: visibility !== 'internal_only',
        visibilityScope: resolveLibraryUploadVisibilityScope(visibility),
        requiredDocumentKey: requiredDocumentId || null,
        documentRequestId: documentRequestId || null,
        documentType: documentType || null,
        stageKey: relatedWorkflow || null,
      })
      setUploadDocumentModalOpen(false)
      closeUploadDocumentModal()
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload document.')
    } finally {
      setUploadingDocumentKey('')
    }
  }

  function resolveDocumentRequestPartyForUpload(row = {}) {
    const sourceParty = String(row?.requiredParty || '').trim().toLowerCase()
    if (sourceParty.includes('buyer')) return 'buyer'
    if (sourceParty.includes('seller')) return 'seller'
    if (sourceParty.includes('attorney')) return 'attorney'
    if (sourceParty.includes('bond') || sourceParty.includes('finance')) return 'bond_originator'
    if (sourceParty.includes('agent')) return 'agent'
    return 'buyer'
  }

  async function handleRequestDocumentFromLibraryRow(row = {}) {
    if (!row?.requiredDocumentId || !detail?.transaction?.id) {
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
            title: row.name || 'Required document',
            notes: `Requested via document library for ${row.name || 'required document'}.`,
            category: 'Additional Requests',
            requestedFrom: resolveDocumentRequestPartyForUpload(row),
            visibility: 'client_visible',
            priority: 'normal',
            dueDate: null,
            status: 'requested',
          },
        ],
      })
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (requestError) {
      setError(requestError?.message || 'Unable to request this document.')
    } finally {
      setDocumentRequestSaving(false)
    }
  }

  async function handleApproveLibraryDocument(row = {}) {
    if (!detail?.transaction?.id) {
      return
    }

    try {
      setDocumentRequestStatusUpdatingId(String(row?.documentRequestId || row?.requiredDocumentId || ''))
      setError('')
      if (row?.requiredDocumentId) {
        await updateTransactionRequiredDocumentStatus({
          transactionId: detail.transaction.id,
          documentKey: row.requiredDocumentId,
          status: 'accepted',
          actorRole: effectiveEditorRole,
        })
      } else if (row?.documentRequestId) {
        await updateTransactionDocumentRequestStatus({
          requestId: row.documentRequestId,
          status: 'completed',
        })
      }
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (approveError) {
      setError(approveError?.message || 'Unable to approve this document.')
    } finally {
      setDocumentRequestStatusUpdatingId('')
    }
  }

  async function handleRejectLibraryDocument(row = {}) {
    if (!detail?.transaction?.id) {
      return
    }

    try {
      const requestId = String(row?.documentRequestId || '').trim()
      const reason = window.prompt('Add rejection reason', '') || ''
      setDocumentRequestStatusUpdatingId(String(row?.requiredDocumentId || requestId || ''))
      setError('')
      if (row?.requiredDocumentId) {
        await updateTransactionRequiredDocumentStatus({
          transactionId: detail.transaction.id,
          documentKey: row.requiredDocumentId,
          status: 'rejected',
          actorRole: effectiveEditorRole,
        })
      } else if (requestId) {
        await updateTransactionDocumentRequestStatus({
          requestId,
          status: 'rejected',
        })
      }
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
      if (reason) {
        setError('')
      }
    } catch (rejectError) {
      setError(rejectError?.message || 'Unable to reject this document.')
    } finally {
      setDocumentRequestStatusUpdatingId('')
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
            notes: String(documentRequestForm.notes || '').trim(),
            category: 'Additional Requests',
            requestedFrom: documentRequestForm.requestedFrom || 'buyer',
            visibility: documentRequestForm.visibility || 'client_visible',
            priority: documentRequestForm.priority || 'normal',
            dueDate: documentRequestForm.dueDate || null,
            status: 'requested',
          },
        ],
      })
      setDocumentRequestForm({
        title: '',
        requestedFrom: 'buyer',
        visibility: 'client_visible',
        notes: '',
        priority: 'normal',
        dueDate: '',
      })
      setShowAdditionalRequestForm(false)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (requestError) {
      setError(requestError?.message || 'Unable to create document request.')
    } finally {
      setDocumentRequestSaving(false)
    }
  }

  async function handleUpdateDocumentRequestStatus(requestId, nextStatus) {
    if (!requestId || !nextStatus) {
      return
    }

    const normalizedStatus = String(nextStatus || '').trim().toLowerCase()
    const rejectedReason = normalizedStatus === 'rejected'
      ? window.prompt('Add rejection reason', '') || ''
      : ''

    try {
      setDocumentRequestStatusUpdatingId(String(requestId))
      setError('')
      await updateTransactionDocumentRequestStatus({
        requestId,
        status: normalizedStatus,
        rejectedReason: normalizedStatus === 'rejected' ? rejectedReason : null,
      })
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (statusError) {
      setError(statusError?.message || 'Unable to update document request status.')
    } finally {
      setDocumentRequestStatusUpdatingId('')
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

  async function _handleSubprocessStepSave(payload) {
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

  async function _handleMarkAllWorkflowComplete({ processId, processType, processLabel, incompleteCount }) {
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
      setError('')
      const record = detail?.onboarding?.token ? detail.onboarding : await ensureOnboardingToken()
      const url = `${window.location.origin}/client/onboarding/${record.token}`
      await copyTextToClipboard(url)
      setOnboardingLinkCopied(true)
      window.setTimeout(() => setOnboardingLinkCopied(false), 1400)
    } catch (copyError) {
      setError(copyError?.message || 'Unable to copy onboarding link. Please copy it manually from your browser.')
    }
  }

  async function ensureClientPortalLink() {
    if (clientPortalLink?.token) {
      return clientPortalLink
    }

    if (!detail?.transaction?.id) {
      throw new Error('Transaction data is missing.')
    }

    const record = await getOrCreateClientPortalLink({
      developmentId: detail.transaction.development_id || detail.unit?.development_id || detail.unit?.development?.id || '',
      unitId: detail.transaction.unit_id || detail.unit?.id || '',
      transactionId: detail.transaction.id,
      buyerId: detail.transaction.buyer_id || detail.buyer?.id || null,
    })

    if (record?.token) {
      setClientPortalLink(record)
      return record
    }

    throw new Error('Unable to generate client portal link right now.')
  }

  async function handleCopyClientPortalLink() {
    try {
      setError('')
      const record = await ensureClientPortalLink()
      const url = `${window.location.origin}/client/${record.token}`
      await copyTextToClipboard(url)
      setClientPortalLinkCopied(true)
      window.setTimeout(() => setClientPortalLinkCopied(false), 1400)
    } catch (copyError) {
      setError(copyError?.message || 'Unable to copy client portal link. Please copy it manually from your browser.')
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

  async function handleSendClientPortalLinkEmail() {
    if (!transaction?.id) {
      setError('Transaction data is not available for client portal email.')
      return
    }

    if (!buyer?.email) {
      setError('Capture buyer email before sending the client portal link.')
      return
    }

    if (!supabase) {
      setError('Supabase is not configured in this environment.')
      return
    }

    try {
      setSendingClientPortalLink(true)
      setError('')
      await ensureClientPortalLink()

      const result = await invokeEdgeFunction('send-email', {
        body: {
          type: 'client_portal_link',
          transactionId: transaction.id,
          resend: true,
        },
      })

      if (result.error || result.data?.error) {
        throw result.error || result.data?.error
      }

      if (result.data?.sent === false) {
        throw new Error(result.data?.error || 'Client portal link email could not be sent.')
      }

      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (sendError) {
      const resolvedError = await parseEdgeFunctionError(sendError, 'Unable to send client portal link right now.')
      setError(resolvedError)
    } finally {
      setSendingClientPortalLink(false)
    }
  }

  async function _openOtpGenerateModal() {
    if (!transaction?.id) {
      setError('Transaction data is not available for OTP generation.')
      return
    }
    setOtpModalMessage('')
    try {
      const templates = await listPacketTemplates({
        packetType: 'otp',
        moduleType: 'agency',
        includeInactive: false,
        organisationId: transaction?.organisation_id || null,
      })
      setOtpPacketTemplates(templates || [])
    } catch (templateError) {
      console.error('[Packet Templates][OTP]', templateError)
      setOtpPacketTemplates([])
    }
    setOtpModalOpen(true)
  }

  function openOtpDocumentUrl(url = '') {
    const targetUrl = String(url || '').trim()
    if (!targetUrl) return
    const opened = window.open(targetUrl, '_blank', 'noopener,noreferrer')
    if (!opened) window.location.href = targetUrl
  }

  function buildOtpLegalWorkspacePath(mode = 'view') {
    const resolvedTransactionId = String(transaction?.id || '').trim()
    if (!resolvedTransactionId) return ''
    const params = new URLSearchParams()
    params.set('mode', resolveWorkspaceModeFromAction(mode))
    params.set('returnTo', `${location.pathname}${location.search}`)
    const resolvedPacketId = String(otpPacketStatus?.packet?.id || otpPacketId || '').trim()
    if (resolvedPacketId) params.set('packetId', resolvedPacketId)
    return `/transactions/${resolvedTransactionId}/legal/otp?${params.toString()}`
  }

  function openOtpLegalWorkspace(mode = 'view') {
    const path = buildOtpLegalWorkspacePath(mode)
    if (!path) {
      setError('Transaction data is not available for the legal document workspace.')
      return
    }
    navigate(path)
  }

  function handleOtpPrimaryAction() {
    const actionKey = String(otpPacketActionState?.actionKey || '').trim().toLowerCase()
    openOtpLegalWorkspace(actionKey)
  }

  function handleWorkspaceViewOtp() {
    if (!otpGeneratedDocument?.url) {
      setError('OTP preview is not available yet. Generate a draft first.')
      return
    }
    openOtpDocumentUrl(otpGeneratedDocument.url)
  }

  function handleWorkspaceViewSignedOtp() {
    if (!otpSignedDocument?.url) {
      setError('Signed OTP is not available yet. Upload or finalize the signed copy first.')
      return
    }
    openOtpDocumentUrl(otpSignedDocument.url)
  }

  function closeOtpGenerateModal() {
    if (salesActionLoading === 'generate_otp') {
      return
    }
    setOtpModalOpen(false)
    setOtpModalMessage('')
  }

  function handleSaveOtpDraftModal() {
    setOtpModalMessage('Draft saved locally. Backend save hook will be wired next.')
  }

  async function handleGenerateOtpDraft({ specialConditions = '', onProgress } = {}) {
    if (!transaction?.id) {
      setError('Transaction data is not available for OTP generation.')
      return false
    }

    try {
      setSalesActionLoading('generate_otp')
      setError('')
      onProgress?.('Preparing template…')
      const templates = await listPacketTemplates({
        packetType: 'otp',
        moduleType: 'agency',
        includeInactive: false,
        organisationId: transaction?.organisation_id || null,
      })
      const template = Array.isArray(templates) ? templates[0] : null
      if (!template?.id) {
        throw new Error('No active template is configured for this document type.')
      }

      const existingStatus = await resolveDocumentPacketStatus({
        packetType: 'otp',
        packetId: normalizeText(otpPacketStatus?.packet?.id || otpPacketId),
        transactionId: normalizeText(transaction?.id),
        organisationId: transaction?.organisation_id || null,
      })
      if (['sent', 'partially_signed', 'signed', 'archived'].includes(normalizeText(existingStatus?.state).toLowerCase())) {
        throw new Error('This OTP is already sent or signed. Open the current document instead of generating a new draft.')
      }

      let packet = existingStatus?.packet || null
      if (!packet?.id) {
        const existingPackets = await listDocumentPackets({
          organisationId: transaction?.organisation_id || null,
          packetType: 'otp',
          transactionId: transaction.id,
          limit: 5,
        })
        packet = Array.isArray(existingPackets) ? (existingPackets[0] || null) : null
      }

      if (!packet?.id) {
        packet = await createDocumentPacket({
          organisationId: transaction?.organisation_id || null,
          packetType: 'otp',
          title: `OTP - ${unit?.unit_number ? `Unit ${unit.unit_number}` : 'Transaction'}`,
          transactionId: transaction.id,
          dealId: transaction.id,
          status: 'ready_for_generation',
          templateId: normalizeText(template?.id),
          templateKeySnapshot: normalizeText(template?.template_key || template?.templateKey || template?.key || 'otp_default'),
          templateLabelSnapshot: normalizeText(template?.template_label || template?.templateLabel || template?.label || 'Offer to Purchase'),
          assignedAgentId: isUuidLike(transaction?.assigned_user_id) ? transaction.assigned_user_id : null,
          sourceContextJson: {
            transactionId: normalizeText(transaction?.id),
            unitId: normalizeText(unit?.id),
            developmentId: normalizeText(unit?.development_id || unit?.development?.id),
            workflow: 'sales',
          },
        })
      }

      setOtpPacketId(normalizeText(packet?.id))
      onProgress?.('Merging transaction details…')
      await generatePacketVersion({
        packetId: packet.id,
        packetType: 'otp',
        template,
        allowWarnings: true,
        forceGenerate: true,
        context: {
          transaction,
          transactionId: transaction.id,
          unit,
          buyer,
          onboardingFormData: onboardingFormData?.formData || {},
          generatedByRole: effectiveEditorRole || workspaceRole || 'agent',
          generatedByUserId: normalizeText(transaction?.assigned_user_id || transaction?.owner_user_id || ''),
          generatedByUserEmail: normalizeText(transaction?.assigned_agent_email || ''),
          specialConditions: normalizeText(specialConditions),
          purchasePriceLabel: currency.format(purchasePriceValue || 0),
          onboardingStatus: clientInfoForm.onboarding_status || onboardingStatus,
        },
      })

      onProgress?.('Preparing preview…')
      await postSystemDiscussionUpdates([
        `Sales workflow updated: OTP packet draft generated by ${resolveActingParticipantName()} at ${formatDateTime(new Date().toISOString())}.${String(specialConditions || '').trim() ? ` Special conditions captured: ${String(specialConditions || '').trim()}` : ''}`,
      ])
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
      return true
    } catch (generationError) {
      setError(generationError?.message || 'Unable to generate OTP draft right now.')
      throw generationError
    } finally {
      setSalesActionLoading('')
    }
  }

  async function handleWorkspaceGenerateOtp({ onProgress } = {}) {
    const generated = await handleGenerateOtpDraft({
      specialConditions: otpSpecialConditions,
      onProgress,
    })
    if (!generated) {
      throw new Error('Unable to generate OTP draft right now.')
    }
    return generated
  }

  async function _handleGenerateOtpFromModal() {
    const generated = await handleGenerateOtpDraft({ specialConditions: otpSpecialConditions })
    if (generated) {
      closeOtpGenerateModal()
    }
  }

  async function _handleGenerateOtpAndSendFromModal() {
    const generated = await handleGenerateOtpDraft({ specialConditions: otpSpecialConditions })
    if (!generated) {
      return
    }
    setOtpModalMessage('OTP draft generated. Send automation will be wired once backend send flow is enabled.')
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

      const result = await runWorkflowAction({
        transactionId: transaction.id,
        actorRole: effectiveEditorRole,
        actionKey: 'MOVE_TO_FINANCE',
        payload: {
          note: 'Sales workflow complete and ready for finance.',
          source: 'workspace_button',
        },
      })

      if (!result?.allowed) {
        throw new Error((result?.blockers || []).map((item) => item.message).filter(Boolean).join(' • ') || 'Unable to move transaction to finance.')
      }

      setDetail((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          mainStage: result.compatibility?.current_main_stage || previous.mainStage,
          stage: result.compatibility?.stage || previous.stage,
          transaction: previous.transaction
            ? {
                ...previous.transaction,
                stage: result.compatibility?.stage || previous.transaction.stage,
                current_main_stage: result.compatibility?.current_main_stage || previous.transaction.current_main_stage,
                updated_at: new Date().toISOString(),
              }
            : previous.transaction,
        }
      })
      setStageForm((previous) => ({ ...previous, main_stage: result.compatibility?.current_main_stage || 'FIN' }))

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

      const result = await runWorkflowAction({
        transactionId: transaction.id,
        actorRole: effectiveEditorRole,
        actionKey: 'MOVE_TO_TRANSFER',
        payload: {
          note: 'Finance workflow complete and ready for transfer.',
          source: 'workspace_button',
        },
      })

      if (!result?.allowed) {
        throw new Error((result?.blockers || []).map((item) => item.message).filter(Boolean).join(' • ') || 'Unable to move transaction to transfer.')
      }

      setDetail((previous) => {
        if (!previous) return previous
        return {
          ...previous,
          mainStage: result.compatibility?.current_main_stage || previous.mainStage,
          stage: result.compatibility?.stage || previous.stage,
          transaction: previous.transaction
            ? {
                ...previous.transaction,
                stage: result.compatibility?.stage || previous.transaction.stage,
                current_main_stage: result.compatibility?.current_main_stage || previous.transaction.current_main_stage,
                updated_at: new Date().toISOString(),
              }
            : previous.transaction,
        }
      })
      setStageForm((previous) => ({ ...previous, main_stage: result.compatibility?.current_main_stage || 'TRANSFER' }))

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

    const transferProcess =
      (detail?.transactionSubprocesses || []).find((item) => item?.process_type === 'transfer') ||
      (detail?.transactionSubprocesses || []).find((item) => item?.process_type === 'attorney') ||
      null
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
        processType: transferProcess.process_type || 'transfer',
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

      if (currentStep.step_key === 'registration_confirmed' && !['REG', 'REGISTRATION', 'COMPLETE'].includes(mainStage)) {
        const stageResult = await runWorkflowAction({
          transactionId: transaction.id,
          actionKey: 'MARK_REGISTERED',
          actorRole: effectiveEditorRole,
          payload: {
            note: 'Transfer workflow completed with registration confirmed.',
            source: 'transfer_registration_completion',
          },
        })
        const nextStage = stageResult?.compatibility?.stage || 'REGISTRATION'
        const nextMainStage = stageResult?.compatibility?.current_main_stage || 'COMPLETE'

        setDetail((previous) => {
          if (!previous) return previous
          return {
            ...previous,
            mainStage: nextMainStage,
            stage: nextStage,
            transaction: previous.transaction
              ? {
                  ...previous.transaction,
                  stage: nextStage,
                  current_main_stage: nextMainStage,
                  updated_at: new Date().toISOString(),
                }
              : previous.transaction,
          }
        })
        setStageForm((previous) => ({ ...previous, main_stage: nextMainStage }))
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

  async function handleAdvanceBondWorkflow() {
    if (!transaction?.id) {
      setError('Transaction data is not available for bond workflow progression.')
      return
    }

    if (bondWorkflowSnapshot?.isLocked) {
      setError('Bond workflow is not ready yet. Complete finance-to-bond handoff first.')
      return
    }

    const bondProcess = (detail?.transactionSubprocesses || []).find((item) => item?.process_type === 'bond') || null
    if (!bondProcess?.id) {
      setError('Bond workflow is not available for this transaction yet.')
      return
    }

    const currentStep = (bondProcess.steps || []).find(
      (step) => String(step?.id || '') === String(bondWorkflowSnapshot?.currentStepId || ''),
    )
    if (!currentStep?.id) {
      setError('No active bond stage is available to progress.')
      return
    }

    try {
      setBondActionLoading(currentStep.step_key || 'advance_bond')
      setError('')
      const actorName = resolveActingParticipantName()
      const timestampLabel = formatDateTime(new Date().toISOString())
      const actionLabel = bondWorkflowSnapshot?.nextActionLabel || 'Bond stage progressed'

      const updateResult = await updateTransactionSubprocessStep({
        transactionId: transaction.id,
        subprocessId: bondProcess.id,
        processType: 'bond',
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

      const bondStageEvent = buildWorkflowActivityEvent({
        laneLabel: 'Bond Workflow',
        stageLabel: currentStep.step_label,
        action: 'completed',
        actorName,
        occurredAt: timestampLabel,
      })

      await postSystemDiscussionUpdates([bondStageEvent.message])
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (bondError) {
      setError(bondError?.message || 'Unable to progress bond workflow.')
    } finally {
      setBondActionLoading('')
    }
  }

  async function handleSubmitFinanceBankApplication(payload) {
    if (!transaction?.id) {
      setError('Transaction data is not available for bond applications.')
      return
    }

    try {
      setBondHybridFinanceActionLoading('add_application')
      setError('')
      const result = await submitBankApplication(transaction.id, payload, {
        actorRole: effectiveEditorRole,
      })
      setDetail((previous) => previous ? { ...previous, transactionFinanceWorkflow: result } : previous)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (applicationError) {
      setError(applicationError?.message || 'Unable to add bank application.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleUpdateFinanceBankApplication(application, payload) {
    if (!application?.id) return

    try {
      setBondHybridFinanceActionLoading(`application_${application.id}`)
      setError('')
      const result = await updateFinanceBankApplication(application.id, payload, {
        actorRole: effectiveEditorRole,
      })
      setDetail((previous) => previous ? { ...previous, transactionFinanceWorkflow: result } : previous)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (applicationError) {
      setError(applicationError?.message || 'Unable to update bank application.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleCaptureFinanceBondOffer(payload) {
    if (!transaction?.id) {
      setError('Transaction data is not available for bond quotes.')
      return
    }

    try {
      setBondHybridFinanceActionLoading('add_quote')
      setError('')
      const result = await captureBondOffer(transaction.id, payload, {
        actorRole: effectiveEditorRole,
      })
      setDetail((previous) => previous ? { ...previous, transactionFinanceWorkflow: result } : previous)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (quoteError) {
      setError(quoteError?.message || 'Unable to add bond quote.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleAcceptFinanceBondOffer(offer) {
    if (!offer?.id) return

    try {
      setBondHybridFinanceActionLoading(`quote_${offer.id}`)
      setError('')
      const result = await acceptBondOffer(offer.id, {
        actorRole: effectiveEditorRole,
      })
      setDetail((previous) => previous ? { ...previous, transactionFinanceWorkflow: result } : previous)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (quoteError) {
      setError(quoteError?.message || 'Unable to accept the selected bond quote.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleDeclineFinanceBondOffer(offer) {
    if (!offer?.id) return

    try {
      setBondHybridFinanceActionLoading(`decline_${offer.id}`)
      setError('')
      const result = await declineBondOffer(offer.id, {
        actorRole: effectiveEditorRole,
      })
      setDetail((previous) => previous ? { ...previous, transactionFinanceWorkflow: result } : previous)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (quoteError) {
      setError(quoteError?.message || 'Unable to decline the selected bond quote.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleMarkFinanceDocumentsReviewed() {
    if (!transaction?.id) {
      setError('Transaction data is not available for finance document review.')
      return
    }

    try {
      setBondHybridFinanceActionLoading('documents_reviewed')
      setError('')
      const result = await reviewFinanceDocuments(transaction.id, {
        actorRole: effectiveEditorRole,
      })
      setDetail((previous) => previous ? { ...previous, transactionFinanceWorkflow: result } : previous)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (reviewError) {
      setError(reviewError?.message || 'Unable to mark finance documents as reviewed.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleVerifyCashProofOfFunds() {
    if (!transaction?.id) {
      setError('Transaction data is not available for proof of funds verification.')
      return
    }

    try {
      setBondHybridFinanceActionLoading('proof_of_funds_verified')
      setError('')
      await verifyFinanceProofOfFunds(transaction.id, {
        actorRole: effectiveEditorRole,
      })
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (verificationError) {
      setError(verificationError?.message || 'Unable to verify proof of funds.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleUploadFinanceWorkspaceDocument(payload) {
    if (!transaction?.id) {
      setError('Transaction data is not available for finance document uploads.')
      return
    }

    try {
      setBondHybridFinanceActionLoading('finance_upload')
      setError('')
      await uploadFinanceDocument({
        transactionId: transaction.id,
        ...payload,
      })
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (uploadError) {
      setError(uploadError?.message || 'Unable to upload the finance document.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleMarkFinanceInstructionFromCommandCentre(payload = {}) {
    if (!transaction?.id) {
      setError('Transaction data is not available for finance instruction.')
      return
    }

    try {
      setBondHybridFinanceActionLoading('instruction_sent')
      setError('')
      const result = await markBondInstructionSent(transaction.id, payload, {
        actorRole: effectiveEditorRole,
      })
      setDetail((previous) => previous ? { ...previous, transactionFinanceWorkflow: result } : previous)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (instructionError) {
      setError(instructionError?.message || 'Unable to mark finance instruction sent.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleUpdateFinanceCommand(payload = {}) {
    if (!transaction?.id) {
      setError('Transaction data is not available for finance blocker updates.')
      return
    }

    try {
      setBondHybridFinanceActionLoading('finance_command')
      setError('')
      const result = await updateFinanceBlockerStatus(transaction.id, payload)
      setDetail((previous) => previous ? { ...previous, transactionFinanceWorkflow: result } : previous)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (commandError) {
      setError(commandError?.message || 'Unable to update the finance command centre state.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  function handleOpenFinanceDocument(document) {
    if (!document?.url) return
    window.open(document.url, '_blank', 'noopener,noreferrer')
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

  function handleArchiveTransactionFromWorkspace() {
    if (!transaction?.id) {
      setError('Transaction data is not available for archiving.')
      return
    }

    setArchiveTransactionConfirmOpen(true)
  }

  async function confirmArchiveTransactionFromWorkspace() {
    try {
      setError('')
      setArchivingTransaction(true)
      await archiveTransactionLifecycle(transaction.id)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadDetail()
    } catch (archiveError) {
      setError(archiveError.message || 'Unable to archive this transaction.')
    } finally {
      setArchivingTransaction(false)
      setArchiveTransactionConfirmOpen(false)
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
    transactionFinanceWorkflow,
    mainStage,
    onboarding,
    purchaserTypeLabel,
    transactionParticipants,
    activeViewerPermissions,
    transactionDiscussion,
    transactionEvents,
    onboardingFormData,
  } = detail

  const isRegisteredUnit = ['REG', 'REGISTRATION', 'COMPLETE'].includes(mainStage) || /registered|complete/i.test(String(stage || ''))
  const elevatedWorkspaceRoles = ['developer', 'internal_admin', 'agent', 'attorney']
  const hasWorkspaceEditOverride = elevatedWorkspaceRoles.includes(workspaceRole)
  const effectiveEditorRole = hasWorkspaceEditOverride ? workspaceRole : actingRole

  const isAttorneyLens = workspaceRole === 'attorney' || actingRole === 'attorney'
  const canSeeAttorneyCloseout = ['developer', 'internal_admin', 'attorney'].includes(effectiveEditorRole)
  const purchasePriceValue = Number(transaction?.purchase_price || transaction?.sales_price || unit?.price || 0)
  const financeLabel = transaction?.finance_type ? normalizeFinanceType(transaction.finance_type, { allowUnknown: true }) : 'unknown'
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
  const hasCapturedFinancials = onboardingComplete
  const hasCapturedFinanceType = hasCapturedFinancials && financeLabel !== 'unknown'
  const displayPurchasePriceValue = hasCapturedFinancials ? Number(transaction?.purchase_price || transaction?.sales_price || 0) : 0
  const displayPurchasePriceLabel = displayPurchasePriceValue ? currency.format(displayPurchasePriceValue) : 'Not captured'
  const displayFinanceTypeLabel = hasCapturedFinanceType ? toTitleLabel(financeLabel) : 'Not captured'
  const onboardingHeaderLabel = onboardingComplete
    ? 'Onboarding completed'
    : onboardingEmailSent
      ? 'Onboarding sent'
      : 'Onboarding not sent'
  const alterationTotalAmount = (alterationRequests || []).reduce((sum, request) => sum + (Number(request.amount_inc_vat) || 0), 0)
  const rollupLifecycleSummary = buildTransactionLifecycleSummaryFromRollup(transactionRollup, {
    transactionId: transaction?.id,
    fallbackUpdatedAt: transaction?.updated_at || transaction?.created_at || null,
  })
  const usingTransactionRollupOverview = USE_TRANSACTION_ROLLUP_OVERVIEW && Boolean(rollupLifecycleSummary)

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
        canRequestAdditionalDocuments: actingParticipant.canRequestAdditionalDocuments,
      }
    : activeViewerPermissions || {
        canView: true,
        canComment: true,
        canUploadDocuments: true,
        canEditFinanceWorkflow: true,
        canEditAttorneyWorkflow: true,
        canEditCoreTransaction: true,
        canRequestAdditionalDocuments: true,
      }
  const canCommentInWorkspace = Boolean(actingPermissions.canComment)
  const canUploadDocuments = Boolean(actingPermissions.canUploadDocuments)
  const canEditCoreTransaction = Boolean(actingPermissions.canEditCoreTransaction)
  const canRequestAdditionalDocuments =
    Boolean(actingPermissions.canRequestAdditionalDocuments) ||
    ['developer', 'agent', 'attorney', 'bond_originator', 'internal_admin'].includes(effectiveEditorRole)
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
  const bondLanePermissions = resolveWorkflowLanePermissions('bond', {
    actorRole: effectiveEditorRole,
    canEditCoreTransaction,
    canEditFinanceWorkflow: Boolean(actingPermissions.canEditFinanceWorkflow),
    canEditAttorneyWorkflow: Boolean(actingPermissions.canEditAttorneyWorkflow),
    isFinanceOwner: effectiveEditorRole === 'bond_originator',
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
  const bondLaneActive = (transactionSubprocesses || []).some((item) => item?.process_type === 'bond')
  const bondWorkflowSnapshot = resolveBondWorkflowSnapshot({
    subprocesses: transactionSubprocesses || [],
    bondReady: financeWorkflowSnapshot.readyForTransfer,
    bondBlockers: [
      !salesWorkflowSnapshot.readyForFinance ? 'Sales Workflow must be completed first.' : null,
      !financeWorkflowSnapshot.readyForTransfer ? 'Finance Workflow must reach bond-approved / transfer-ready handoff.' : null,
    ].filter(Boolean),
    permissions: bondLanePermissions,
  })
  const canEditBondWorkflowLane = bondLanePermissions.canEditWorkflowLane
  const bondWorkflowHelperText = bondWorkflowSnapshot.isLocked
    ? bondWorkflowSnapshot.blockers[1] || 'Bond workflow is waiting for finance handoff.'
    : bondWorkflowSnapshot.bondRegistered
      ? 'Bond workflow complete. Bond registration is confirmed.'
      : `Responsible role: ${bondWorkflowSnapshot.responsibleRoleLabel}.`
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
    requirementProfile: detail?.buyerRequirementProfile || null,
    requiredChecklist: requiredDocumentChecklist || [],
    statusOverrides: manualDocumentStatusOverrides,
  })
  const completedDerivedRequiredDocs = dynamicRequiredDocuments.filter((item) => item.status !== 'missing').length
  const derivedRequiredDocsTotal = dynamicRequiredDocuments.length
  const derivedRequiredDocsMissing = Math.max(derivedRequiredDocsTotal - completedDerivedRequiredDocs, 0)
  const derivedRequiredDocsProgressPercent = derivedRequiredDocsTotal
    ? Math.round((completedDerivedRequiredDocs / derivedRequiredDocsTotal) * 100)
    : 0
  const buyerRequirementSummary = detail?.buyerRequirementSummary || null
  const buyerRequirementActions = Array.isArray(detail?.requiredTransactionActions)
    ? detail.requiredTransactionActions.filter((action) => action && String(action.severity || '').toLowerCase() === 'critical')
    : []
  const isDevelopmentTransaction = isDevelopmentTransactionWorkspace(transaction, unit)
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
    isDevelopmentTransaction &&
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
  const _financeStatusLabel = (() => {
    if (financeLabel === 'cash') {
      return 'Cash Purchase'
    }
    if (['ATTY', 'XFER', 'REG', 'TRANSFER', 'REGISTRATION', 'COMPLETE'].includes(mainStage) || stage === 'Bond Approved / Proof of Funds') {
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
  const activeFinanceType = hasCapturedFinanceType
    ? normalizeFinanceType(transaction?.finance_type || stageForm.finance_type, { allowUnknown: true })
    : 'unknown'
  const isBondOrHybridFinance = activeFinanceType === 'bond' || activeFinanceType === 'combination'
  const canViewBondWorkspaceTab = ['developer', 'agent'].includes(workspaceRole) && isBondOrHybridFinance
  const bondHybridFinanceSummary = transactionFinanceWorkflow?.summary || null
  const financeCommandCenterPanel = (
    <TransactionFinanceCommandCenter
      transaction={transaction}
      workflowData={transactionFinanceWorkflow}
      requiredDocumentChecklist={requiredDocumentChecklist || []}
      documents={documents || []}
      viewerRole={effectiveEditorRole}
      activeViewerPermissions={actingPermissions}
      loadingAction={bondHybridFinanceActionLoading}
      onUploadDocument={(payload) => void handleUploadFinanceWorkspaceDocument(payload)}
      onSubmitBankApplication={(payload) => void handleSubmitFinanceBankApplication(payload)}
      onUpdateBankApplication={(application, payload) => void handleUpdateFinanceBankApplication(application, payload)}
      onCaptureBondOffer={(payload) => void handleCaptureFinanceBondOffer(payload)}
      onAcceptOffer={(offer) => void handleAcceptFinanceBondOffer(offer)}
      onDeclineOffer={(offer) => void handleDeclineFinanceBondOffer(offer)}
      onMarkInstructionSent={(payload) => void handleMarkFinanceInstructionFromCommandCentre(payload)}
      onReviewDocuments={() => void handleMarkFinanceDocumentsReviewed()}
      onVerifyProofOfFunds={() => void handleVerifyCashProofOfFunds()}
      onUpdateBlockers={(payload) => void handleUpdateFinanceCommand(payload)}
      onOpenDocument={handleOpenFinanceDocument}
    />
  )
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
  const _bondExpenses = onboardingBondApplication?.expenses || {}
  const bondCreditHistory = onboardingBondApplication?.credit_history || {}
  const bondBankingLiabilities = onboardingBondApplication?.banking_liabilities || {}
  const bondAssets = onboardingBondApplication?.assets || {}
  const bondConsent = onboardingBondApplication?.consent || {}
  const workspaceDocuments = documents || []
  const workspaceDocumentsById = new Map(workspaceDocuments.map((item) => [String(item?.id || ''), item]))
  const workspaceDocumentRequests = Array.isArray(detail?.documentRequests) ? detail.documentRequests : []
  const visibleRequiredDocuments = (requiredDocumentChecklist || []).filter((item) => !isInformationSheetRequirement(item))
  const requiredMatchedDocumentIds = new Set()
  const requestedDocumentIds = new Set()
  const requiredDocumentRows = []
  const requestRows = []

  visibleRequiredDocuments.forEach((requirement, index) => {
    const requirementKey = String(requirement?.key || requirement?.requirementKey || '').trim()
    const matchedDocument = requirement?.matchedDocument
      || (requirement?.uploadedDocumentId ? workspaceDocumentsById.get(String(requirement.uploadedDocumentId)) : null)
      || null
    if (matchedDocument?.id) {
      requiredMatchedDocumentIds.add(String(matchedDocument.id))
    }
    const rawStatus = String(requirement?.status || requirement?.requirementStatus || '').trim() || (requirement?.complete ? 'uploaded' : 'missing')
    const rowStatus = normalizeLibraryStatus(rawStatus)
    const category = normalizeLibraryCategory(resolveRequirementLibraryCategory(requirement)) || 'buyer'
    requiredDocumentRows.push({
      id: `required-${requirementKey || index}`,
      transactionId: String(transaction?.id || ''),
      name: String(requirement?.label || requirement?.name || 'Required document').trim(),
      category,
      requiredParty: resolveRequiredPartyLabel(requirement?.required_from_role || requirement?.expectedFromRole || ''),
      status: rowStatus,
      visibility: matchedDocument ? resolveDocumentLibraryVisibility(matchedDocument) : 'Internal',
      uploadedBy: matchedDocument ? resolveUploadedByLabel(matchedDocument, transactionParticipants) : 'System',
      uploadedAt: matchedDocument?.created_at || requirement?.created_at || requirement?.createdAt || '',
      updatedAt: matchedDocument?.updated_at || requirement?.updated_at || requirement?.updatedAt || requirement?.created_at || '',
      relatedWorkflow: requirement?.groupLabel || requirement?.group_key || requirement?.groupKey || '',
      source: 'required',
      requiredDocumentId: requirementKey,
      documentRequestId: '',
      blocksStage: requirement?.blocksStage || '',
      fileUrl: matchedDocument?.url || '',
      documentId: matchedDocument?.id || '',
      document: matchedDocument || null,
    })
  })

  workspaceDocumentRequests.forEach((request, index) => {
    const requestId = String(request?.id || '').trim()
    const linkedDocument = request?.requestedDocumentId ? workspaceDocumentsById.get(String(request.requestedDocumentId)) : null
    if (linkedDocument?.id) {
      requestedDocumentIds.add(String(linkedDocument.id))
    }
    const requestStatus = normalizeLibraryStatus(request?.status || 'requested')
    const category = resolveDocumentRequestLibraryCategory(request)
    requestRows.push({
      id: `request-${requestId || index}`,
      transactionId: String(transaction?.id || ''),
      name: String(request?.title || request?.name || request?.documentName || 'Document request').trim(),
      category,
      requiredParty: resolveRequiredPartyLabel(request?.requestedFrom || request?.requested_from || ''),
      status: requestStatus,
      visibility: resolveDocumentRequestVisibilityLabel(request),
      uploadedBy: request?.createdByRole ? toTitleLabel(request.createdByRole) : 'Team',
      uploadedAt: request?.createdAt || request?.created_at || '',
      updatedAt: request?.updatedAt || request?.updated_at || request?.createdAt || request?.created_at || '',
      relatedWorkflow: request?.category || request?.workflow || '',
      source: 'request',
      requiredDocumentId: '',
      documentRequestId: requestId,
      blocksStage: '',
      fileUrl: linkedDocument?.url || '',
      documentId: linkedDocument?.id || '',
      document: linkedDocument || null,
    })
  })

  const documentLibraryRows = [
    ...requiredDocumentRows,
    ...requestRows,
    ...workspaceDocuments
      .filter((item) => {
        const itemId = String(item?.id || '').trim()
        if (itemId && (requiredMatchedDocumentIds.has(itemId) || requestedDocumentIds.has(itemId))) {
          return false
        }
        return true
      })
      .map((document) => {
        const status = normalizeLibraryStatus(document?.status || 'uploaded')
        return {
          id: String(document?.id || ''),
          transactionId: String(transaction?.id || ''),
          name: String(document?.name || 'Document').trim(),
          category: normalizeLibraryCategory(resolveDocumentLibraryCategory(document)) || 'generated',
          requiredParty: '',
          status,
          visibility: resolveDocumentLibraryVisibility(document),
          uploadedBy: resolveUploadedByLabel(document, transactionParticipants),
          uploadedAt: document?.created_at || '',
          updatedAt: document?.updated_at || document?.created_at || '',
          relatedWorkflow: resolveDocumentWorkflowLabel(document),
          source: 'document',
          requiredDocumentId: '',
          documentRequestId: '',
          blocksStage: '',
          fileUrl: document?.url || '',
          documentId: String(document?.id || ''),
          document,
        }
      }),
  ]

  const activeDocumentLibraryCategoryKey = normalizeLibraryCategory(activeDocumentLibraryCategory)
  const activeDocumentLibraryStatusKey = String(activeDocumentLibraryStatus || 'all').trim().toLowerCase()
  const activeDocumentLibraryStatusTone = String(activeDocumentLibraryStatusKey || 'all').trim().toLowerCase()
  const documentLibraryRowsFiltered = documentLibraryRows.filter((row) => {
    if (activeDocumentLibraryCategoryKey && activeDocumentLibraryCategoryKey !== 'all' && row.category !== activeDocumentLibraryCategoryKey) {
      return false
    }

    if (activeDocumentLibraryStatusKey === 'required') {
      return row.source === 'required'
    }
    if (activeDocumentLibraryStatusKey === 'missing') {
      return row.status === 'missing'
    }
    if (activeDocumentLibraryStatusKey === 'pending_review') {
      return row.status === 'under_review'
    }
    if (activeDocumentLibraryStatusKey === 'approved') {
      return row.status === 'approved'
    }

    return true
  })
  const documentLibrarySummary = {
    all: documentLibraryRows.length,
    required: documentLibraryRows.filter((row) => row.source === 'required').length,
    missing: documentLibraryRows.filter((row) => row.status === 'missing').length,
    pending_review: documentLibraryRows.filter((row) => row.status === 'under_review').length,
    approved: documentLibraryRows.filter((row) => row.status === 'approved').length,
  }
  const documentLibraryStatusCards = DOCUMENT_LIBRARY_STATUS_FILTERS.map((statusFilter) => ({
    key: statusFilter.key,
    label: statusFilter.label,
    value: documentLibrarySummary[statusFilter.key] || 0,
  }))
  const documentLibraryActiveCategoryLabel =
    DOCUMENT_LIBRARY_FILTERS.find((filter) => filter.key === activeDocumentLibraryCategoryKey)?.label || 'All Documents'
  const documentLibraryEmptyState = (() => {
    if (documentLibraryRowsFiltered.length > 0) {
      return ''
    }
    if (activeDocumentLibraryStatusKey === 'missing') {
      return 'No missing documents. Everything required is currently complete.'
    }
    if (activeDocumentLibraryCategoryKey === 'all') {
      return 'No documents have been uploaded or requested yet.'
    }
    if (activeDocumentLibraryCategoryKey === 'finance') {
      return 'No finance documents yet.'
    }
    if (activeDocumentLibraryCategoryKey === 'transfer') {
      return 'No transfer documents yet.'
    }
    if (activeDocumentLibraryStatusKey === 'required') {
      return 'No required documents for this filter.'
    }
    if (activeDocumentLibraryCategoryKey) {
      return `No ${documentLibraryActiveCategoryLabel.toLowerCase()} documents yet.`
    }
    return 'No documents for this filter.'
  })()
  const isUploadingDocumentInModal = Boolean(uploadingDocumentKey)
  const attorneyParticipant = (transactionParticipants || []).find((item) => item.roleType === 'attorney') || null
  const reservationRequirementStatus = String(reservationRequirement?.status || '').trim().toLowerCase()
  const canAccessReservationProof = Boolean(reservationProofDocument?.url || reservationProofDocument?.file_path)
  const purchaserNameForOtp =
    `${String(clientInfoForm.buyer_first_name || '').trim()} ${String(clientInfoForm.buyer_last_name || '').trim()}`.trim() ||
    buyer?.name ||
    'Not captured'
  const purchaserEmailForOtp = clientInfoForm.buyer_email || buyer?.email || 'Not captured'
  const purchaserPhoneForOtp = clientInfoForm.buyer_phone || buyer?.phone || 'Not captured'
  const purchaserTypeForOtp = getPurchaserTypeLabel(stageForm.purchaser_type || transaction?.purchaser_type || 'individual')
  const propertyAddressForOtp =
    [
      unit?.address_line1,
      unit?.suburb,
      unit?.city,
      unit?.province,
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(', ') || 'Not captured'
  const conveyancerNameForOtp =
    stageForm.attorney ||
    transaction?.attorney ||
    attorneyParticipant?.participantName ||
    'Not assigned'
  const conveyancerEmailForOtp =
    stageForm.assigned_attorney_email ||
    transaction?.assigned_attorney_email ||
    attorneyParticipant?.participantEmail ||
    'Not captured'
  const reservationProofStatusLabel =
    reservationStatusRaw === 'verified' || reservationRequirementStatus === 'accepted'
      ? 'Payment Received'
      : reservationStatusRaw === 'rejected' || reservationRequirementStatus === 'reupload_required'
        ? 'Rejected / Needs Reupload'
        : reservationProofDocument?.id || reservationRequirementStatus === 'uploaded' || reservationRequirementStatus === 'under_review'
          ? 'Uploaded'
          : 'Awaiting Proof of Payment'
  const otpGeneratedDocument = salesWorkflowSnapshot?.latestGeneratedOtpDocument || null
  const otpSignedDocument = salesWorkflowSnapshot?.latestSignedOtpDocument || null
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
  const otpPacketActionState = resolveDocumentPacketActionState({
    packetType: 'otp',
    state: otpPacketStatus?.state,
    isBusy: otpPacketStatusLoading || salesActionLoading === 'generate_otp' || salesActionLoading === 'share_otp',
    warningCount: Array.isArray(otpPacketStatus?.warnings) ? otpPacketStatus.warnings.length : 0,
  })
  const otpPrimaryActionLabel = (() => {
    if (otpPacketStatusLoading) return 'Checking…'
    if (salesActionLoading === 'generate_otp') return 'Generating...'
    if (salesActionLoading === 'share_otp') return 'Sending...'
    return otpPacketActionState.label
  })()
  const developmentModuleState = developmentSettings?.enabledModules || {}
  const developmentTeams = developmentSettings?.stakeholderTeams || {}
  const agentOptions = developmentTeams.agents || []
  const conveyancerOptions = developmentTeams.conveyancers || []
  const bondOriginatorOptions = developmentTeams.bondOriginators || []
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

  const isAgentWorkspace = workspaceRole === 'agent'
  const transactionReference =
    transaction?.transaction_reference ||
    transaction?.matter_number ||
    (transaction?.id ? `TX-${String(transaction.id).slice(0, 8).toUpperCase()}` : `Unit ${unit.unit_number}`)
  const propertyIdentityTitle = propertyAddressForOtp !== 'Not captured'
    ? propertyAddressForOtp
    : [unit.development?.name, unit?.unit_number ? `Unit ${unit.unit_number}` : null].filter(Boolean).join(' • ') || 'Property address pending'
  const sellerDisplayName = transaction?.seller_name || transaction?.seller || 'Seller pending'
  const assignedAgentDisplayName =
    stageForm.assigned_agent ||
    transaction?.assigned_agent ||
    transactionParticipants?.find((item) => item.roleType === 'agent')?.participantName ||
    'Not assigned'
  const transferAttorneyDisplayName =
    stageForm.attorney ||
    transaction?.attorney ||
    attorneyParticipant?.participantName ||
    'Not assigned'
  const bondAttorneyDisplayName =
    stageForm.bond_originator ||
    transaction?.bond_originator ||
    transactionParticipants?.find((item) => item.roleType === 'bond_attorney')?.participantName ||
    'Not assigned'
  const targetRegistrationLabel =
    formatDate(transaction?.expected_transfer_date || transaction?.registration_date || transaction?.registered_at || transaction?.completed_at)
  const bondAmountLabel = hasCapturedFinancials && transaction?.bond_amount ? currency.format(Number(transaction.bond_amount || 0)) : 'Not captured'
  const depositAmountLabel = hasCapturedFinancials && transaction?.deposit_amount ? currency.format(Number(transaction.deposit_amount || 0)) : 'Not captured'
      const matterHealthLabel = stageProgressModel.currentStageBlockers.length
    ? 'Attention'
    : documentLibrarySummary.missing > 0
      ? 'Waiting'
      : 'On Track'
  const matterHealthTone =
    matterHealthLabel === 'Attention'
      ? 'border-[#f5d7bc] bg-[#fff7ed] text-[#b85d12]'
      : matterHealthLabel === 'Waiting'
        ? 'border-[#d9e3ee] bg-[#f7fafc] text-[#60758c]'
        : 'border-[#cfe8d8] bg-[#effaf3] text-[#197a45]'
  const latestUpdatedLabel = formatDateTime(transaction?.updated_at || transaction?.created_at)
  const nextActionTitle = activeNextActionRecommendation || transaction?.next_action || 'Review transaction progress'
  const nextActionDescription =
    stageProgressModel.currentStageBlockers[0] ||
    transaction?.next_action ||
    (onboardingComplete ? 'Review the active workflow and keep parties aligned.' : 'Complete the buyer onboarding and supporting document steps.')
  const nextActionDueLabel = transaction?.expected_transfer_date
    ? formatDate(transaction.expected_transfer_date)
    : targetRegistrationLabel !== 'Not set'
      ? targetRegistrationLabel
      : 'No due date'
  const nextActionPriority = matterHealthLabel === 'Attention' ? 'High' : matterHealthLabel === 'Waiting' ? 'Medium' : 'Normal'
  const rollupOverviewAction = usingTransactionRollupOverview
    ? buildOverviewActionFromRollup(transactionRollup, transaction)
    : null
  const displayedMatterHealthLabel = usingTransactionRollupOverview
    ? getRollupHealthLabel(transactionRollup?.parentStatus)
    : matterHealthLabel
  const displayedMatterHealthTone = usingTransactionRollupOverview
    ? getRollupMatterHealthTone(transactionRollup?.parentStatus)
    : matterHealthTone
  const displayedLatestUpdatedLabel = usingTransactionRollupOverview
    ? formatDateTime(
        transactionRollup?.derivedAt ||
          transactionRollup?.lastWorkflowUpdatedAt ||
          transaction?.updated_at ||
          transaction?.created_at,
      )
    : latestUpdatedLabel
  const displayedNextActionTitle = usingTransactionRollupOverview
    ? rollupOverviewAction?.title || nextActionTitle
    : nextActionTitle
  const displayedNextActionDescription = usingTransactionRollupOverview
    ? rollupOverviewAction?.description || nextActionDescription
    : nextActionDescription
  const displayedNextActionDueLabel = usingTransactionRollupOverview
    ? formatDate(rollupOverviewAction?.dueLabel)
    : nextActionDueLabel
  const displayedNextActionPriority = usingTransactionRollupOverview
    ? rollupOverviewAction?.priority || nextActionPriority
    : nextActionPriority
  const displayedNextActionStatus = usingTransactionRollupOverview
    ? rollupOverviewAction?.statusLabel || displayedMatterHealthLabel
    : displayedMatterHealthLabel
  const workflowHeaderActions = usingTransactionRollupOverview
    ? (transactionRollup?.availableActions || [])
      .filter((action) =>
        ['request_buyer_details', 'move_to_finance', 'move_to_transfer', 'mark_ready_for_registration', 'mark_registered']
          .includes(String(action?.actionKey || '').trim().toLowerCase()),
      )
      .map((action) => {
        const actionKey = String(action?.actionKey || '').trim().toLowerCase()
        const busy =
          actionKey === 'request_buyer_details'
            ? sendingOnboardingEmail
            : false
        let onClick = () => void handleOverviewWorkflowAction(action)
        if (actionKey === 'request_buyer_details') {
          onClick = () => void handleSendOnboardingEmail({ resend: onboardingEmailSent })
        }

        return {
          id: `workflow-${action.actionKey}`,
          label: action.label,
          variant: getRollupHeaderActionVariant(action),
          disabled: busy || action?.enabled === false,
          reason: action?.reason || '',
          onClick,
          busy,
          busyLabel: actionKey === 'request_buyer_details' ? 'Sending buyer details request...' : undefined,
        }
      })
    : []
  const agentMetricCards = isBondOrHybridFinance
    ? [
        { label: 'Finance Type', value: activeFinanceType === 'combination' ? 'Hybrid' : 'Bond', subtext: 'Bond / Hybrid', icon: Landmark },
        { label: 'Finance Stage', value: bondHybridFinanceSummary?.currentStageLabel || 'Not started', subtext: 'Shared workflow', icon: UploadCloud },
        { label: 'Bond Originator', value: stageForm.bond_originator || transaction?.bond_originator || 'Not assigned', subtext: stageForm.assigned_bond_originator_email || transaction?.assigned_bond_originator_email || 'No email', icon: UserRound },
        { label: 'Submitted Banks', value: String(bondHybridFinanceSummary?.submittedBanksCount ?? 0), subtext: 'Applications captured', icon: Landmark },
        { label: 'Quotes Received', value: String(bondHybridFinanceSummary?.quotesReceivedCount ?? 0), subtext: 'Feedback and quotes', icon: BadgeDollarSign },
        { label: 'Approved Bank', value: bondHybridFinanceSummary?.approvedBank || 'Not approved yet', subtext: 'Buyer-selected quote', icon: CheckCircle2 },
        { label: 'Instruction Sent', value: bondHybridFinanceSummary?.instructionSent ? 'Yes' : 'No', subtext: bondHybridFinanceSummary?.instructionSent ? 'Ready for attorney workflow' : 'Pending instruction', icon: Send },
      ]
      : [
        { label: 'Purchase Price', value: displayPurchasePriceLabel, subtext: hasCapturedFinancials ? 'Transaction value' : 'Awaiting onboarding', icon: CircleDollarSign },
        { label: 'Finance Type', value: displayFinanceTypeLabel, subtext: hasCapturedFinanceType && stageForm.finance_managed_by ? toTitleLabel(stageForm.finance_managed_by) : 'Awaiting onboarding', icon: Landmark },
        { label: 'Bond Amount', value: bondAmountLabel, subtext: hasCapturedFinanceType && activeFinanceType === 'cash' ? 'Cash transaction' : 'Awaiting onboarding', icon: BadgeDollarSign },
        ...(isDevelopmentTransaction
          ? [{ label: 'Deposit', value: depositAmountLabel, subtext: hasCapturedFinancials && reservationRequired ? reservationStatusLabel : 'Awaiting onboarding', icon: Building2 }]
          : []),
        { label: 'Target Registration', value: targetRegistrationLabel, subtext: formatTransactionAge(transaction?.created_at || transaction?.updated_at), icon: CalendarClock },
      ]
  const agentQuickActions = [
    {
      label: 'Request Documents',
      icon: FilePlus2,
      onClick: () => {
        setActiveDocumentLibraryCategory('all')
        setActiveDocumentLibraryStatus('required')
        openDocumentsWorkspace()
      },
      disabled: !canRequestAdditionalDocuments,
    },
    {
      label: 'Upload Documents',
      icon: UploadCloud,
      onClick: () => {
        setActiveDocumentLibraryCategory('all')
        setActiveDocumentLibraryStatus('all')
        openUploadDocumentModal({
          category: '',
          documentType: '',
          visibility: 'client_visible',
          relatedWorkflow: '',
          satisfiesRequiredDocument: 'no',
        })
      },
    },
    {
      label: 'Schedule Signing',
      icon: CalendarClock,
      onClick: () => {
        setWorkspaceMenu('transfer')
        setDiscussionType('operational')
        setDiscussionBody((previous) => previous || '[signing] Signing appointment to be scheduled: ')
      },
    },
    {
      label: 'Schedule Client Call',
      icon: PhoneCall,
      onClick: () => {
        setWorkspaceMenu('activity')
        setDiscussionType('client')
        setDiscussionBody((previous) => previous || '[client] Client call to be scheduled: ')
      },
    },
    {
      label: 'Generate Document',
      icon: FilePlus2,
      onClick: () => {
        setActiveDocumentLibraryCategory('generated')
        setActiveDocumentLibraryStatus('all')
        openDocumentsWorkspace()
      },
    },
    {
      label: 'Assign Roleplayer',
      icon: UserRound,
      onClick: () => {
        setWorkspaceMenu('onboarding')
      },
    },
    {
      label: 'Add Note',
      icon: StickyNote,
      onClick: () => {
        setWorkspaceMenu('activity')
        setDiscussionType('operational')
      },
      disabled: !canCommentInWorkspace,
    },
    {
      label: 'Send Reminder',
      icon: MessageSquare,
      onClick: () => {
        setWorkspaceMenu('activity')
        setDiscussionType('client')
        setDiscussionBody((previous) => previous || '[reminder] Reminder sent: ')
      },
      disabled: !canCommentInWorkspace,
    },
    {
      label: 'Message Parties',
      icon: MessageSquare,
      onClick: handleOpenClientPortalLink,
      disabled: !clientPortalLink?.token,
    },
  ]
  const agentUpcomingActions = suggestedNextActions.slice(0, 3)
  while (agentUpcomingActions.length < 3) {
    agentUpcomingActions.push(['Awaiting bond approval', 'Prepare transfer documents', 'Review latest activity'][agentUpcomingActions.length])
  }
  const agentKeyDates = [
    ['Offer Accepted', formatDate(transaction?.sale_date || transaction?.created_at)],
    ['Mandate Signed', formatDate(transaction?.mandate_signed_at || transaction?.created_at)],
    ['FICA Completed', onboardingComplete ? formatDate(transaction?.onboarding_completed_at || transaction?.updated_at) : 'Pending'],
    ['Target Registration', targetRegistrationLabel],
  ]

  const workspaceMenus = isAgentWorkspace
    ? [
        { id: 'overview', label: 'Overview' },
        { id: 'onboarding', label: 'Parties', meta: onboardingStatus },
        { id: 'documents', label: 'Documents', meta: `${documents?.length || 0}` },
        { id: 'financials', label: 'Finance', meta: hasCapturedFinanceType ? financeLabel : 'Not set' },
        { id: 'transfer', label: 'Transfer', meta: mainStageLabel },
        { id: 'tasks', label: 'Next Actions', meta: `${agentUpcomingActions.length}` },
        { id: 'activity', label: 'Activity', meta: `${(transactionDiscussion || []).length}` },
        ...(developmentSettings?.alteration_requests_enabled
          ? [{ id: 'alterations', label: 'Alterations', meta: `${alterationRequests?.length || 0}` }]
          : []),
        ...(developmentSettings?.snag_reporting_enabled
          ? [{ id: 'snags', label: 'Snags', meta: `${clientIssues?.length || 0}` }]
          : []),
      ]
    : [
        { id: 'overview', label: 'Overview', meta: isRegisteredUnit ? 'Unit summary' : 'Transaction summary' },
        { id: 'onboarding', label: 'Client Information', meta: onboardingStatus },
        ...(canViewBondWorkspaceTab
          ? [{ id: 'bond', label: 'Bond', meta: bondApplicationStatus }]
          : []),
        { id: 'documents', label: 'Documents', meta: `${documents?.length || 0} files` },
        { id: 'alterations', label: 'Alterations', meta: developmentSettings?.alteration_requests_enabled ? `${alterationRequests?.length || 0} requests` : 'Module off' },
        { id: 'snags', label: 'Snags', meta: developmentSettings?.snag_reporting_enabled ? `${clientIssues?.length || 0} logged` : 'Module off' },
      ]
  const requestedWorkspaceMenu = isAgentWorkspace && workspaceMenu === 'bond'
    ? 'financials'
    : isAgentWorkspace && workspaceMenu === 'cancellation'
      ? 'transfer'
      : workspaceMenu
  const activeWorkspaceMenu = workspaceMenus.some((tab) => tab.id === requestedWorkspaceMenu) ? requestedWorkspaceMenu : 'overview'
  const showOverviewWorkspaceHero = activeWorkspaceMenu === 'overview'
  const workspaceHeaderRole = ['developer', 'attorney', 'agent', 'bond_originator'].includes(effectiveEditorRole)
    ? effectiveEditorRole
    : 'developer'
  const resolvedBuyerDisplayName = normalizeDisplayName(buyer?.name)
  const resolvedDevelopmentName = normalizeDisplayName(unit?.development?.name)
  const workspaceHeaderConfig = buildWorkspaceHeaderConfigForRole({
    role: workspaceHeaderRole,
    title: resolvedDevelopmentName || resolvedBuyerDisplayName || 'Property Transaction',
    unitLabel: `Unit ${unit.unit_number}`,
    subtitle: resolvedBuyerDisplayName ? `Buyer: ${resolvedBuyerDisplayName}` : 'Buyer: Pending assignment',
    buyerLabel: resolvedBuyerDisplayName,
    currentStageLabel: mainStageLabel,
    mainStageLabel,
    onboardingLabel: onboardingHeaderLabel,
    operationalStateLabel: onboardingComplete ? 'On track' : 'Needs action',
    financeTypeLabel: hasCapturedFinanceType ? financeLabel : 'Not set',
    purchasePriceLabel: currency.format(purchasePriceValue || 0),
    timeInStageValue: formatTransactionAge(transaction?.created_at || transaction?.updated_at),
    timeInStageMeta: `Updated ${formatDate(transaction?.updated_at || transaction?.created_at)}`,
    unitStatusLabel: unit?.status ? toTitleLabel(unit.status) : 'Unit active',
  })
  const workspaceTransactionLifecycleState = String(transaction?.lifecycle_state || '').toLowerCase()
  const canArchiveTransaction = ['registered', 'completed'].includes(workspaceTransactionLifecycleState)
  const workspaceHeaderActionItems = [
    {
      id: 'print-report',
      label: 'Print Report',
      icon: 'print',
      onClick: handlePrintTransactionReport,
      disabled: false,
    },
    {
      id: 'client-portal',
      label: 'Client Portal',
      icon: 'portal',
      onClick: handleOpenClientPortalLink,
      disabled: !clientPortalLink?.token,
    },
    {
      id: 'copy-client-portal-link',
      label: clientPortalLinkCopied ? 'Copied Portal Link' : 'Copy Portal Link',
      icon: 'portal',
      onClick: handleCopyClientPortalLink,
      disabled: !transaction?.id || !canEditSalesWorkflow,
      hidden: !canEditSalesWorkflow,
    },
  ]

  if (!onboardingComplete && !onboardingEmailSent) {
    workspaceHeaderActionItems.push({
      id: 'send-onboarding',
      label: sendingOnboardingEmail ? 'Sending…' : 'Send Onboarding',
      icon: 'onboarding_link',
      variant: 'primary',
      onClick: () => void handleSendOnboardingEmail({ resend: false }),
      disabled: !canEditSalesWorkflow || sendingOnboardingEmail || !transaction?.id || !buyer?.email,
      hidden: !canEditSalesWorkflow,
    })
  } else if (onboardingEmailSent && !onboardingComplete) {
    workspaceHeaderActionItems.push({
      id: 'resend-onboarding',
      label: sendingOnboardingEmail ? 'Sending…' : 'Resend Onboarding',
      icon: 'onboarding_link',
      variant: 'secondary',
      onClick: () => void handleSendOnboardingEmail({ resend: true }),
      disabled: !canEditSalesWorkflow || sendingOnboardingEmail || !transaction?.id || !buyer?.email,
      hidden: !canEditSalesWorkflow,
    })
  }

  if (onboardingComplete) {
    workspaceHeaderActionItems.push({
      id: 'resend-client-portal-link',
      label: sendingClientPortalLink ? 'Sending…' : 'Resend Portal Link',
      icon: 'portal',
      variant: 'primary',
      onClick: () => void handleSendClientPortalLinkEmail(),
      disabled: !canEditSalesWorkflow || sendingClientPortalLink || !transaction?.id || !buyer?.email,
      hidden: !canEditSalesWorkflow,
    })
  } else if (onboardingEmailSent) {
    workspaceHeaderActionItems.push({
      id: 'copy-onboarding-link',
      label: onboardingLinkCopied ? 'Copied Onboarding Link' : 'Copy Onboarding Link',
      icon: 'onboarding_link',
      variant: 'ghost',
      onClick: handleCopyOnboardingLink,
      disabled: !transaction?.id || !canEditSalesWorkflow,
      hidden: !canEditSalesWorkflow,
    })
  }

  if (workspaceHeaderRole === 'developer') {
    workspaceHeaderActionItems.push({
      id: 'archive-transaction',
      label: archivingTransaction ? 'Archiving…' : 'Archive Transaction',
      icon: 'archive',
      variant: 'destructive',
      tone: 'danger',
      onClick: () => void handleArchiveTransactionFromWorkspace(),
      disabled: !transaction?.id || archivingTransaction || !canArchiveTransaction,
      hidden: false,
    })

    workspaceHeaderActionItems.push({
      id: 'delete-transaction',
      label: deletingTransaction ? 'Deleting…' : 'Delete Transaction',
      icon: 'delete',
      tone: 'danger',
      variant: 'destructive',
      onClick: () => void handleDeleteTransactionFromWorkspace(),
      disabled: !transaction?.id || deletingTransaction,
      hidden: false,
    })
  }

  const filteredWorkspaceHeaderActionItems = usingTransactionRollupOverview
    ? workspaceHeaderActionItems.filter(
        (item) =>
          !['send-onboarding', 'resend-onboarding', 'resend-client-portal-link', 'copy-onboarding-link'].includes(item?.id),
      )
    : workspaceHeaderActionItems

  const workspaceHeaderActions = [
    ...(onboardingComplete
      ? [{
          id: 'onboarding-complete',
          label: 'Onboarding Completed',
          as: 'badge',
          tone: 'success',
          hidden: !canEditSalesWorkflow,
        }]
      : []),
    {
      id: 'workspace-actions',
      label: 'Actions',
      icon: 'menu',
      type: 'menu',
      className: 'min-w-[156px]',
      items: filteredWorkspaceHeaderActionItems.filter((item) => item && !item.hidden),
    },
  ]
  const visibleWorkspaceHeaderActions = workspaceHeaderActions.filter((action) => action && !action.hidden)
  const agentBackLink = isAgentWorkspace ? (
    <Link
      to="/transactions"
      className="no-print inline-flex w-fit items-center gap-2 rounded-[12px] border border-[#d9e3ee] bg-white px-3.5 py-2 text-sm font-semibold text-[#4f647a] shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:border-[#cbd8e6] hover:bg-[#f8fbfd] hover:text-[#142132]"
    >
      <ArrowLeft size={16} />
      Back to Transactions
    </Link>
  ) : null
  const agentHeroHeader = isAgentWorkspace ? (
    <section className="rounded-[26px] border border-[#dbe5ef] bg-white p-5 shadow-[0_18px_38px_rgba(15,23,42,0.06)] md:p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center rounded-full border border-[#d9e3ee] bg-[#f8fbfd] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[#65798f]">
              Transaction Command Center
            </span>
            <span className="inline-flex items-center rounded-full border border-[#cfe1d8] bg-[#effaf3] px-3 py-1 text-xs font-semibold text-[#197a45]">
              {usingTransactionRollupOverview ? formatTransactionRollupStatusLabel(transactionRollup?.parentStatus) : (mainStageLabel || 'Active')}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <h1 className="text-[2rem] font-semibold leading-none tracking-[-0.05em] text-[#142132] md:text-[2.35rem]">
              {transactionReference}
            </h1>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${displayedMatterHealthTone}`}>
              <HeartPulse size={13} />
              {displayedMatterHealthLabel}
            </span>
          </div>

          <p className="mt-3 max-w-4xl text-[1.02rem] font-medium leading-7 text-[#294158]">
            {propertyIdentityTitle}
          </p>

          <div className="mt-5 grid gap-3 text-sm md:grid-cols-2 2xl:grid-cols-3">
            {[
              { label: 'Buyer', value: buyer?.name || 'Buyer pending', icon: UserRound },
              { label: 'Seller', value: sellerDisplayName, icon: UserRound },
              { label: 'Assigned Agent', value: assignedAgentDisplayName, icon: Building2 },
              { label: 'Transfer Attorney', value: transferAttorneyDisplayName, icon: Scale },
              { label: 'Bond Attorney', value: bondAttorneyDisplayName, icon: Landmark },
              { label: 'Last Updated', value: displayedLatestUpdatedLabel, icon: Clock3 },
            ].map((item) => {
              const Icon = item.icon
              return (
                <div key={item.label} className="flex min-w-0 items-start gap-2.5 rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2.5">
                  <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-[#edf4fb] text-[#35546c]">
                    <Icon size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8496ab]">{item.label}</span>
                    <strong className="mt-0.5 block truncate text-sm font-semibold text-[#1d3144]">{item.value}</strong>
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        <aside className="rounded-[20px] border border-[#dfe8f2] bg-[#f8fbfd] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7c8ea4]">Matter Health</span>
              <strong className="mt-1.5 block text-[1.35rem] font-semibold tracking-[-0.035em] text-[#142132]">{displayedMatterHealthLabel}</strong>
              <p className="mt-1 text-xs leading-5 text-[#6b7d93]">
                {formatTransactionAge(transaction?.created_at || transaction?.updated_at)} • Updated {formatDate(transactionRollup?.derivedAt || transaction?.updated_at || transaction?.created_at)}
              </p>
            </div>
            <span className={`inline-flex h-10 w-10 items-center justify-center rounded-[14px] border ${displayedMatterHealthTone}`}>
              <HeartPulse size={18} />
            </span>
          </div>

          {workflowHeaderActions.length ? (
            <div className="mt-4 grid gap-2">
              {workflowHeaderActions.map((action) => {
                const button = (
                  <Button
                    type="button"
                    variant={action.variant || 'secondary'}
                    size="sm"
                    className="w-full rounded-[12px]"
                    onClick={action.onClick}
                    disabled={Boolean(action.disabled)}
                  >
                    {action.busy ? action.busyLabel || 'Processing...' : action.label}
                  </Button>
                )

                return action.reason ? (
                  <span key={action.id || action.label} title={action.reason}>
                    {button}
                  </span>
                ) : (
                  <span key={action.id || action.label}>{button}</span>
                )
              })}
            </div>
          ) : null}

          {visibleWorkspaceHeaderActions.length ? (
            <div className="mt-4 grid gap-2">
              {visibleWorkspaceHeaderActions.map((action) => {
                if (action.as === 'badge') {
                  return (
                    <span
                      key={action.id || action.label}
                      className="inline-flex min-h-[38px] items-center justify-center rounded-[12px] border border-[#cfe8d8] bg-[#effaf3] px-3 py-2 text-sm font-semibold text-[#197a45]"
                    >
                      {action.label}
                    </span>
                  )
                }

                const button = (
                  <Button
                    type="button"
                    variant={action.variant || 'secondary'}
                    size="sm"
                    className="w-full rounded-[12px]"
                    onClick={action.onClick}
                    disabled={Boolean(action.disabled)}
                  >
                    {action.label}
                  </Button>
                )

                return action.reason ? (
                  <span key={action.id || action.label} title={action.reason}>
                    {button}
                  </span>
                ) : (
                  <span key={action.id || action.label}>{button}</span>
                )
              })}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  ) : null
  const agentMetricSection = isAgentWorkspace ? (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {agentMetricCards.map((card) => {
        const Icon = card.icon
        return (
          <article key={card.label} className="rounded-[18px] border border-[#dfe8f2] bg-white px-4 py-3.5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8496ab]">{card.label}</span>
                <strong className="mt-1.5 block truncate text-[1.02rem] font-semibold tracking-[-0.02em] text-[#142132]">{card.value}</strong>
                <span className="mt-1 block truncate text-xs text-[#7a8fa6]">{card.subtext}</span>
              </div>
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-[#edf4fb] text-[#35546c]">
                <Icon size={15} />
              </span>
            </div>
          </article>
        )
      })}
    </section>
  ) : null
  const workspaceNavigationSection = (
    <div ref={workspaceMenuRef}>
      <TransactionWorkspaceMenu
        tabs={workspaceMenus}
        activeTab={activeWorkspaceMenu}
        onChange={setWorkspaceMenu}
        ariaLabel="Unit workspace tabs"
        sectionLabel="Unit Workspace"
        compact={isAgentWorkspace}
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
        addAction(
          'copy_client_portal_link',
          clientPortalLinkCopied ? 'Copied Portal Link' : 'Copy Portal Link',
          handleCopyClientPortalLink,
          {
            disabled: !transaction?.id,
          },
        )
        break
      case 'generate_otp':
        addAction(
          'generate_otp',
          salesActionLoading === 'generate_otp' ? 'Generating OTP…' : otpPacketActionState.label,
          handleOtpPrimaryAction,
          {
            variant: 'primary',
            disabled: !transaction?.id || otpPacketStatusLoading,
          },
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
          addAction('view_generated_otp', 'View OTP', () => openOtpLegalWorkspace('view'))
        }
        break
      case 'share_otp':
        addAction(
          'share_otp',
          salesActionLoading === 'share_otp' ? 'Publishing…' : 'Make OTP Available',
          () => openOtpLegalWorkspace('send'),
          {
            variant: 'primary',
            disabled: !salesWorkflowSnapshot.latestGeneratedOtpDocument?.id,
          },
        )
        if (generatedOtpUrl) {
          addAction('view_generated_otp', 'View OTP', () => openOtpLegalWorkspace('view'))
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
          addAction('view_generated_otp', 'View OTP', () => openOtpLegalWorkspace('view'))
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
        addAction(
          'copy_onboarding_link',
          onboardingLinkCopied ? 'Copied Onboarding Link' : 'Copy Onboarding Link',
          handleCopyOnboardingLink,
          {
            disabled: !transaction?.id,
          },
        )
        break
      default:
        addAction(
          'move_ready_for_finance',
          salesActionLoading === 'move_ready_for_finance' ? 'Moving…' : 'Move to Ready for Finance',
          () => void handleMoveToReadyForFinance(),
          {
            variant: 'primary',
            disabled:
              !salesWorkflowSnapshot.readyForFinance ||
              ['FIN', 'ATTY', 'XFER', 'REG', 'TRANSFER', 'REGISTRATION', 'COMPLETE'].includes(mainStage),
          },
        )
        if (salesWorkflowSnapshot.latestSignedOtpDocument?.url) {
          addAction(
            'view_signed_otp',
            'View Signed OTP',
            () => openOtpLegalWorkspace('signed'),
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

  const bondWorkflowActions = (() => {
    if (!bondLaneActive || !canEditBondWorkflowLane || bondWorkflowSnapshot.isLocked) {
      return []
    }

    if (!bondWorkflowSnapshot.currentStepId || !bondWorkflowSnapshot.nextActionLabel) {
      return []
    }

    return [
      {
        id: 'advance_bond_workflow',
        label: bondActionLoading ? 'Updating…' : bondWorkflowSnapshot.nextActionLabel,
        variant: 'primary',
        disabled: Boolean(bondActionLoading),
        onClick: () => void handleAdvanceBondWorkflow(),
      },
    ]
  })()

  const bondWorkflowSection = bondLaneActive ? (
    <div className="no-print">
      <BondWorkflowLane
        snapshot={bondWorkflowSnapshot}
        canEdit={canEditBondWorkflowLane}
        roleLabel={TRANSACTION_ROLE_LABELS[actingRole] || actingRole}
        actions={bondWorkflowActions}
        helperText={bondWorkflowHelperText}
      />
    </div>
  ) : null

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
              ['Purchase Price', displayPurchasePriceLabel],
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
            ['Finance Type', hasCapturedFinanceType ? financeLabel : 'Not captured'],
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
      toolbar={isAgentWorkspace ? agentBackLink : workspaceNavigationSection}
      headline={isAgentWorkspace ? agentHeroHeader : (
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

        {isAgentWorkspace ? (
          <>
            {agentMetricSection}
            {workspaceNavigationSection}
            <TransactionLifecycleProgress
              summary={usingTransactionRollupOverview ? rollupLifecycleSummary : null}
              transaction={transaction}
              mainStage={mainStage}
              subprocesses={transactionSubprocesses || []}
              framed
              compact
              premium
              helperText={
                usingTransactionRollupOverview
                  ? transactionRollup?.blockers?.[0]?.message ||
                    transactionRollup?.nextAction?.label ||
                    `${displayedMatterHealthLabel} workflow status from the backend roll-up.`
                  : stageProgressModel.currentStageBlockers.length
                  ? `Blockers: ${stageProgressModel.currentStageBlockers.slice(0, 2).join(' • ')}`
                  : `${mainStageLabel} is currently healthy.`
              }
            />
          </>
        ) : null}

        {!isAgentWorkspace && showOverviewWorkspaceHero ? (
          <section className="rounded-[28px] border border-[#e5e7eb] bg-[#f7f8fa] p-6 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
            <div>
              <div className="rounded-[24px] border border-[#e5e7eb] bg-white px-4 py-5 shadow-[0_8px_18px_rgba(15,23,42,0.04)] md:px-5">
                <TransactionLifecycleProgress
                  summary={usingTransactionRollupOverview ? rollupLifecycleSummary : null}
                  transaction={transaction}
                  mainStage={mainStage}
                  subprocesses={transactionSubprocesses || []}
                  framed={false}
                  helperText={
                    usingTransactionRollupOverview
                      ? transactionRollup?.blockers?.[0]?.message ||
                        transactionRollup?.nextAction?.label ||
                        `${displayedMatterHealthLabel} workflow status from the backend roll-up.`
                      : stageProgressModel.currentStageBlockers.length
                      ? `Blockers: ${stageProgressModel.currentStageBlockers.slice(0, 2).join(' • ')}`
                      : `${mainStageLabel} is currently healthy.`
                  }
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
                {usingTransactionRollupOverview && transactionRollup?.blockers?.length ? (
                  <div className="mt-4 rounded-[14px] border border-[#f5d7bc] bg-[#fff7ed] px-4 py-3">
                    <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#b85d12]">Workflow blockers</span>
                    <ul className="mt-2 space-y-1 text-sm text-[#8a4b16]">
                      {transactionRollup.blockers.slice(0, 3).map((blocker, index) => (
                        <li key={`${blocker.code || blocker.stepKey || 'blocker'}-${index}`}>{blocker.message}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {import.meta.env.DEV && USE_TRANSACTION_ROLLUP_OVERVIEW ? (
                  <div className="mt-4 rounded-[14px] border border-[#e5e7eb] bg-[#f8fafc] px-4 py-3 text-xs text-[#64748b]">
                    <div>Legacy stage: {mainStageLabel}</div>
                    <div>Roll-up stage: {transactionRollup?.parentStage || 'Unavailable'}</div>
                    <div>Legacy progress: {stageProgressModel.totalProgressPercent || 0}%</div>
                    <div>Roll-up progress: {transactionRollup?.progressPercent ?? 0}%</div>
                    <div>Used fallback: {usingTransactionRollupOverview ? 'false' : 'true'}</div>
                    {transactionRollupError ? <div>Roll-up warning: {transactionRollupError}</div> : null}
                  </div>
                ) : null}
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
          isAgentWorkspace ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
              <main className="min-w-0 space-y-4">
                <section className="rounded-[22px] border border-[#dfe8f2] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8496ab]">Next Action</span>
                      <h3 className="mt-2 text-[1.24rem] font-semibold tracking-[-0.035em] text-[#142132]">{displayedNextActionTitle}</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#63758a]">{displayedNextActionDescription}</p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${displayedMatterHealthTone}`}>
                      {displayedNextActionStatus}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {[
                      ['Due Date', displayedNextActionDueLabel],
                      ['Priority', displayedNextActionPriority],
                      ['Status', displayedNextActionStatus],
                    ].map(([label, value]) => (
                      <article key={label} className="rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2.5">
                        <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-[#8496ab]">{label}</span>
                        <strong className="mt-1 block text-sm font-semibold text-[#1d3144]">{value}</strong>
                      </article>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={saving || (usingTransactionRollupOverview && rollupOverviewAction?.primaryAction?.enabled === false)}
                      onClick={() => (
                        usingTransactionRollupOverview && rollupOverviewAction?.primaryAction?.actionKey
                          ? void handleOverviewWorkflowAction(rollupOverviewAction.primaryAction)
                          : setWorkspaceMenu('transfer')
                      )}
                    >
                      {usingTransactionRollupOverview
                        ? rollupOverviewAction?.primaryAction?.label || 'Open Workflow'
                        : 'View Action'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => (
                        usingTransactionRollupOverview
                          ? setWorkspaceMenu(getRollupOverviewTarget(rollupOverviewAction?.primaryAction, transactionRollup))
                          : openDocumentsWorkspace()
                      )}
                    >
                      {usingTransactionRollupOverview ? 'Open Workflow' : 'Open Documents'}
                    </Button>
                  </div>
                </section>

                <section ref={discussionPanelRef} className="rounded-[22px] border border-[#dfe8f2] bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.04)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8496ab]">Matter Feed</span>
                      <h3 className="mt-1 text-[1.08rem] font-semibold tracking-[-0.025em] text-[#142132]">Latest Updates</h3>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-[12px] border border-[#dce6f0] bg-white px-3 py-2 text-xs font-semibold text-[#4f647a] transition hover:bg-[#f8fbfd]"
                      onClick={() => setWorkspaceMenu('activity')}
                    >
                      View all activity
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {visibleDiscussionItems.slice(0, 5).map((comment) => {
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
                        <article key={comment.id} className="rounded-[16px] border border-[#edf2f7] bg-[#fbfdff] px-4 py-3">
                          <div className="flex items-start gap-3">
                            <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${isSystemComment ? 'bg-[#d97706]' : 'bg-[#35546c]'}`} />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <strong className="truncate text-sm font-semibold text-[#142132]">{cardData.title}</strong>
                                <span className="text-xs text-[#8496ab]">{formatDateTime(comment.createdAt)}</span>
                              </div>
                              <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#52677d]">{cardData.summary}</p>
                              <span className="mt-1 block text-xs text-[#8496ab]">{commentAuthorName} • {toTitleLabel(commentType)}</span>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                    {!visibleDiscussionItems.length ? (
                      <p className="rounded-[16px] border border-dashed border-[#d8e2ee] bg-[#fbfdff] px-4 py-5 text-sm text-[#6b7d93]">
                        No updates yet.
                      </p>
                    ) : null}
                  </div>
                </section>
              </main>

              <aside className="space-y-4 xl:sticky xl:top-4">
                <section className="rounded-[22px] border border-[#dfe8f2] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.04)]">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">Next Actions</h3>
                    <MoreHorizontal size={18} className="text-[#8ca0b6]" />
                  </div>
                  <div className="mt-3 space-y-2">
                    {agentUpcomingActions.map((action, index) => (
                      <button
                        key={`${action}-${index}`}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2.5 text-left transition hover:border-[#d7e4f0] hover:bg-white"
                        onClick={() => setWorkspaceMenu(index === 1 ? 'financials' : index === 2 ? 'transfer' : 'documents')}
                      >
                        <span className="min-w-0">
                          <strong className="block truncate text-sm font-semibold text-[#1d3144]">{action}</strong>
                          <span className="mt-0.5 block text-xs text-[#8496ab]">{index === 0 ? nextActionDueLabel : 'Upcoming'}</span>
                        </span>
                        <ChevronRight size={15} className="shrink-0 text-[#8ca0b6]" />
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-[22px] border border-[#dfe8f2] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.04)]">
                  <h3 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">Quick Actions</h3>
                  <div className="mt-3 grid gap-2">
                    {agentQuickActions.map((action) => {
                      const Icon = action.icon
                      return (
                        <button
                          key={action.label}
                          type="button"
                          className="inline-flex min-h-[38px] items-center justify-start gap-2 rounded-[12px] border border-[#dce6f0] bg-white px-3 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#cbd8e6] hover:bg-[#f8fbfd] disabled:cursor-not-allowed disabled:opacity-55"
                          onClick={action.onClick}
                          disabled={Boolean(action.disabled)}
                        >
                          <Icon size={15} />
                          {action.label}
                        </button>
                      )
                    })}
                  </div>
                </section>

                <section className="rounded-[22px] border border-[#dfe8f2] bg-white p-4 shadow-[0_12px_26px_rgba(15,23,42,0.04)]">
                  <h3 className="text-[1rem] font-semibold tracking-[-0.02em] text-[#142132]">Key Dates</h3>
                  <dl className="mt-3 space-y-2.5">
                    {agentKeyDates.map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-3 border-b border-[#edf2f7] pb-2.5 last:border-b-0 last:pb-0">
                        <dt className="text-sm text-[#63758a]">{label}</dt>
                        <dd className="text-right text-sm font-semibold text-[#1d3144]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </aside>
            </div>
          ) : (
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
            {bondWorkflowSection}

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
          )
        ) : null}

        {activeWorkspaceMenu === 'transfer' ? (
          <div className="space-y-4">
            <WorkspacePanel
              title="Transfer"
              copy="Transfer workflow status, blockers, and the next operational handoff."
            >
              {transferWorkflowSection}
            </WorkspacePanel>
            <WorkspacePanel
              title="Transfer Summary"
              copy="Compact view of transfer ownership and registration timing."
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Transfer Attorney', transferAttorneyDisplayName],
                  ['Current Stage', mainStageLabel],
                  ['Target Registration', targetRegistrationLabel],
                  ['Matter Health', matterHealthLabel],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-3">
                    <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.09em] text-[#8ca0b6]">{label}</span>
                    <strong className="mt-1.5 block text-sm font-semibold text-[#1c2e42]">{value}</strong>
                  </article>
                ))}
              </div>
            </WorkspacePanel>
            <WorkspacePanel
              title="Cancellation"
              copy="Cancellation status is included here when a transaction cancellation workflow is active."
            >
              <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
                No cancellation workflow is active for this transaction.
              </div>
            </WorkspacePanel>
          </div>
        ) : null}

        {activeWorkspaceMenu === 'cancellation' ? (
          <WorkspacePanel
            title="Cancellation"
            copy="Cancellation status is shown here when a transaction cancellation workflow is active."
          >
            <div className="rounded-[18px] border border-dashed border-[#d8e2ee] bg-[#fbfcfe] px-5 py-6 text-sm text-[#6b7d93]">
              No cancellation workflow is active for this transaction.
            </div>
          </WorkspacePanel>
        ) : null}

        {activeWorkspaceMenu === 'financials' ? (
          <div className="space-y-4">
            {showReservationDepositOverviewCard ? (
              <WorkspacePanel
                title="Reservation Deposit"
                copy="Track reservation payment instructions, proof of payment, and verification."
              >
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px]">
                  <section className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfcfe] px-4 py-4">
                    <strong className="block text-sm font-semibold text-[#142132]">
                      {reservationAmountValue !== null ? currency.format(reservationAmountValue) : 'Amount pending'}
                    </strong>
                    <p className="mt-2 text-sm leading-6 text-[#6b7d93]">{reservationPaymentDetails.payment_instructions || 'Reservation payment instructions are not captured yet.'}</p>
                  </section>
                  <section className="rounded-[16px] border border-[#e3ebf4] bg-white px-4 py-4">
                    <span className="inline-flex rounded-full border border-[#d8e6f5] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#35546c]">{reservationStatusLabel}</span>
                    <p className="mt-3 text-xs leading-5 text-[#6b7d93]">Requested: {transaction?.reservation_requested_at ? formatDateTime(transaction.reservation_requested_at) : 'Not requested yet'}</p>
                  </section>
                </div>
              </WorkspacePanel>
            ) : null}
            {financeCommandCenterPanel}
          </div>
        ) : null}

        {activeWorkspaceMenu === 'tasks' ? (
          <WorkspacePanel
            title="Next Actions"
            copy="Outstanding items, follow-ups, due dates, responsible parties, priority, and linked operational areas."
            className="no-print"
          >
            <div className="divide-y divide-[#e6edf5] overflow-hidden rounded-[18px] border border-[#dfe8f2] bg-white">
              {agentUpcomingActions.map((action, index) => {
                const targetMenu = index === 1 ? 'financials' : index === 2 ? 'transfer' : 'documents'
                const responsibleParty = targetMenu === 'financials'
                  ? bondAttorneyDisplayName || 'Finance team'
                  : targetMenu === 'transfer'
                    ? transferAttorneyDisplayName || 'Transfer team'
                    : buyer?.name || 'Matter team'

                return (
                  <article key={`${action}-${index}`} className="px-4 py-4 transition hover:bg-[#f8fbfd]">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm font-semibold text-[#142132]">{action}</strong>
                          <span className="rounded-full border border-[#dce6f0] bg-[#f8fbfd] px-2.5 py-0.5 text-[0.68rem] font-semibold text-[#6b7d93]">
                            {targetMenu === 'financials' ? 'Finance' : toTitleLabel(targetMenu)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-[#63758a]">
                          {index === 0 ? nextActionDescription : 'Upcoming operational action for this transaction.'}
                        </p>
                      </div>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setWorkspaceMenu(targetMenu)}>
                        Open
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                      {[
                        ['Due', index === 0 ? nextActionDueLabel : 'Upcoming'],
                        ['Responsible', responsibleParty],
                        ['Priority', index === 0 ? nextActionPriority : 'Normal'],
                        ['Status', matterHealthLabel],
                      ].map(([label, value]) => (
                        <div key={label} className="min-w-0 rounded-[12px] border border-[#edf2f7] bg-[#fbfdff] px-3 py-2">
                          <span className="block font-semibold uppercase tracking-[0.08em] text-[#8496ab]">{label}</span>
                          <strong className="mt-1 block truncate text-[#1d3144]">{value}</strong>
                        </div>
                      ))}
                    </div>
                  </article>
                )
              })}
            </div>
          </WorkspacePanel>
        ) : null}

        {activeWorkspaceMenu === 'activity' ? (
          <WorkspacePanel
            title="Activity"
            copy="Collaborative updates, document events, workflow movement, and agent notes."
            className="no-print"
          >
            <div ref={discussionPanelRef} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="max-h-[620px] overflow-y-auto pr-1">
                <div className="space-y-2.5">
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
                          <span className="text-xs text-[#7c8ea4]">{formatDateTime(comment.createdAt)}</span>
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
                className="h-fit rounded-[18px] border border-[#dee7f1] bg-white px-4 py-4 shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
              >
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
                <div className="mt-3 rounded-[14px] border border-[#e3ebf4] bg-[#f9fbff] p-3">
                  <Field
                    as="textarea"
                    rows={5}
                    value={discussionBody}
                    onChange={(event) => setDiscussionBody(event.target.value)}
                    placeholder="Write a concise update for the activity feed..."
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <Button type="submit" disabled={saving || !discussionBody.trim() || !canCommentInWorkspace}>
                    Post Update
                  </Button>
                </div>
                {!canCommentInWorkspace ? <p className="mt-3 text-sm text-[#6b7d93]">Your current role can view updates but cannot post comments.</p> : null}
              </form>
            </div>
          </WorkspacePanel>
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
                  {buyerRequirementSummary ? (
                    <div className="rounded-[16px] border border-[#dbe5ef] bg-white px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="text-sm font-semibold text-[#142132]">Buyer Requirement Summary</strong>
                          <p className="mt-1 text-xs text-[#6b7d93]">
                            {buyerRequirementSummary.buyerTypeLabel || getPurchaserTypeLabel(normalizedPurchaserType)} buyer •{' '}
                            {buyerRequirementSummary.financeTypeLabel || toTitleLabel(normalizedClientFinanceType)}
                          </p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.72rem] font-semibold ${
                          Number(buyerRequirementSummary.missingRequiredCount || 0) > 0
                            ? 'border-[#f4d9d7] bg-[#fff5f4] text-[#b42318]'
                            : 'border-[#d5e8dd] bg-[#eef9f3] text-[#1c7d45]'
                        }`}>
                          {Number(buyerRequirementSummary.missingRequiredCount || 0) > 0
                            ? `${buyerRequirementSummary.missingRequiredCount} blocker${buyerRequirementSummary.missingRequiredCount === 1 ? '' : 's'}`
                            : 'No critical blockers'}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        {[
                          ['Required', buyerRequirementSummary.totalRequiredCount || 0],
                          ['Missing', buyerRequirementSummary.missingCount || 0],
                          ['Critical Missing', buyerRequirementSummary.missingRequiredCount || 0],
                          ['Completed', Math.max(Number(buyerRequirementSummary.totalRequiredCount || 0) - Number(buyerRequirementSummary.missingCount || 0), 0)],
                        ].map(([label, value]) => (
                          <article key={label} className="rounded-[12px] border border-[#e5ecf4] bg-[#fbfcfe] px-3 py-2">
                            <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#8ca0b6]">{label}</span>
                            <strong className="mt-1 block text-sm font-semibold text-[#1c2e42]">{value}</strong>
                          </article>
                        ))}
                      </div>
                      {buyerRequirementActions.length ? (
                        <ul className="mt-3 space-y-1 text-xs text-[#b5472d]">
                          {buyerRequirementActions.slice(0, 3).map((action) => (
                            <li key={action.key}>• {action.title}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

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

        {activeWorkspaceMenu === 'bond' || (isAgentWorkspace && activeWorkspaceMenu === 'financials' && canViewBondWorkspaceTab) ? (
          <div className="space-y-4">
            {activeWorkspaceMenu === 'bond' ? financeCommandCenterPanel : null}
            <WorkspacePanel
              title="Bond Application"
              copy="Read-only view of the client bond application, offers, and grant records."
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ['Application Status', bondApplicationStatus],
                  ['Finance Type', hasCapturedFinanceType ? financeLabel : 'Not captured'],
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
          <section className="space-y-5">
            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-[1.25rem] font-semibold tracking-[-0.03em] text-[#142132]">Documents</h3>
                  <p className="mt-1 text-sm leading-6 text-[#6b7d93]">View, upload, and manage all transaction documents in one place.</p>
                </div>
                <button
                  type="button"
                  className="inline-flex min-h-[42px] items-center justify-center rounded-[14px] border border-[#1f4f73] bg-[#1f4f73] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#183f5d]"
                  onClick={() => void openUploadDocumentModal({})}
                >
                  <UploadCloud size={15} />
                  <span className="ml-2">Upload Document</span>
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                {documentLibraryStatusCards.map((item) => {
                  const isActive = activeDocumentLibraryStatusTone === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`rounded-[16px] border px-4 py-3 text-left transition ${
                        isActive
                          ? 'border-[#1f4f73] bg-[#f4f8ff] text-[#142132]'
                          : 'border-[#dde4ee] bg-[#fbfdff] text-[#3d536a] hover:border-[#c8d7e9] hover:bg-white'
                      }`}
                      onClick={() => setActiveDocumentLibraryStatus(item.key)}
                    >
                      <span className="block text-[0.72rem] uppercase tracking-[0.1em] text-[#7b8ca2]">{item.label}</span>
                      <strong className="mt-2 block text-sm font-semibold text-[#142132]">{item.value}</strong>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="rounded-[24px] border border-[#dde4ee] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
              <nav className="grid gap-2 rounded-[18px] border border-[#e2eaf3] bg-[#f8fbff] p-2 md:grid-cols-2 xl:grid-cols-5 2xl:grid-cols-6">
                {DOCUMENT_LIBRARY_FILTERS.map((filter) => {
                  const isActive = activeDocumentLibraryCategoryKey === filter.key
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      className={`inline-flex min-h-[42px] items-center justify-center rounded-[12px] px-3 py-2 text-sm font-semibold transition ${
                        isActive
                          ? 'border border-[#d1deeb] bg-white text-[#142132] shadow-[0_10px_22px_rgba(15,23,42,0.08)]'
                          : 'border border-transparent text-[#5f7086] hover:border-[#d8e4ef] hover:bg-white hover:text-[#142132]'
                      }`}
                      onClick={() => setActiveDocumentLibraryCategory(filter.key)}
                    >
                      {filter.label}
                    </button>
                  )
                })}
              </nav>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full table-fixed text-left">
                  <thead>
                    <tr className="border-b border-[#dde7f1] text-xs uppercase tracking-wide text-[#60768d]">
                      <th className="min-w-[260px] py-3 pr-3 font-semibold">Document</th>
                      <th className="min-w-[95px] py-3 pr-3 font-semibold">Category</th>
                      <th className="min-w-[95px] py-3 pr-3 font-semibold">Required Party</th>
                      <th className="min-w-[105px] py-3 pr-3 font-semibold">Status</th>
                      <th className="min-w-[95px] py-3 pr-3 font-semibold">Visibility</th>
                      <th className="min-w-[130px] py-3 pr-3 font-semibold">Uploaded By</th>
                      <th className="min-w-[125px] py-3 pr-3 font-semibold">Last Updated</th>
                      <th className="min-w-[120px] py-3 pr-3 font-semibold">Related Workflow</th>
                      <th className="min-w-[170px] py-3 pr-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentLibraryRowsFiltered.length ? (
                      documentLibraryRowsFiltered.map((row) => {
                        const normalizedStatus = normalizeLibraryStatus(row.status)
                        const statusTone = getLibraryStatusTone(normalizedStatus)
                        const rowDocument = row?.document || { id: row.documentId || row.id, name: row.name, url: row.fileUrl || '' }
                        const canOpenRow = Boolean(row.fileUrl || rowDocument?.file_path || rowDocument?.url)
                        const hasReplacement = canUploadDocuments && Boolean(row.fileUrl)
                        const canApprove = canEditCoreTransaction && ['required', 'request'].includes(row.source) && ['requested', 'under_review'].includes(
                          normalizedStatus,
                        )
                        const canReject = canEditCoreTransaction && ['required', 'request'].includes(row.source) && ['requested', 'under_review', 'approved', 'missing'].includes(
                          normalizedStatus,
                        )
                        const showUploadAction = row.source === 'required' && normalizedStatus === 'missing'
                        return (
                          <tr key={row.id} className="border-b border-[#eaf0f6]">
                            <td className="py-4 pr-3 text-sm">
                              <strong className="block text-sm font-semibold text-[#142132]">{row.name || 'Document'}</strong>
                              <p className="mt-1 text-xs text-[#7b8ca2]">Category: {toTitleLabel(row.category || 'Buyer')}</p>
                              <p className="mt-0.5 text-xs text-[#7b8ca2]">Blocks: {row.blocksStage || '—'}</p>
                            </td>
                            <td className="py-4 pr-3 text-sm text-[#44566a]">{toTitleLabel(row.category || 'buyer')}</td>
                            <td className="py-4 pr-3 text-sm text-[#44566a]">{row.requiredParty || 'Internal'}</td>
                            <td className="py-4 pr-3 text-sm">
                              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusTone}`}>
                                {formatLibraryStatusLabel(normalizedStatus)}
                              </span>
                            </td>
                            <td className="py-4 pr-3 text-sm text-[#44566a]">{row.visibility || 'Client Visible'}</td>
                            <td className="py-4 pr-3 text-sm text-[#44566a]">{row.uploadedBy || 'System'}</td>
                            <td className="py-4 pr-3 text-sm text-[#44566a]">{formatDate(row.updatedAt || row.updated_at)}</td>
                            <td className="py-4 pr-3 text-sm text-[#44566a]">{row.relatedWorkflow || '—'}</td>
                            <td className="py-4 pr-3 text-sm">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() => canOpenRow && void openWorkspaceDocument(rowDocument, { download: false, filename: rowDocument.name || row.name })}
                                  disabled={!canOpenRow}
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() =>
                                    canOpenRow && void openWorkspaceDocument(rowDocument, { download: true, filename: `${rowDocument.name || row.name || 'document'}.pdf` })
                                  }
                                  disabled={!canOpenRow}
                                >
                                  Download
                                </button>
                                {hasReplacement ? (
                                  <button
                                    type="button"
                                    className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={() => openUploadFromLibraryRow(row)}
                                  >
                                    Replace
                                  </button>
                                ) : null}
                                {showUploadAction ? (
                                  <button
                                    type="button"
                                    className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={() => openUploadFromLibraryRow(row)}
                                  >
                                    Upload
                                  </button>
                                ) : null}
                                {showUploadAction && canRequestAdditionalDocuments ? (
                                  <button
                                    type="button"
                                    className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={() => void handleRequestDocumentFromLibraryRow(row)}
                                  >
                                    Request
                                  </button>
                                ) : null}
                                {canApprove ? (
                                  <button
                                    type="button"
                                    className="inline-flex items-center rounded-full border border-[#cfe3d7] bg-[#eef8f1] px-3 py-1.5 text-xs font-semibold text-[#2f7a51] transition hover:bg-[#e6f4ec] disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={() => void handleApproveLibraryDocument(row)}
                                    disabled={documentRequestStatusUpdatingId === row.requiredDocumentId || documentRequestStatusUpdatingId === row.documentRequestId}
                                  >
                                    Approve
                                  </button>
                                ) : null}
                                {canReject ? (
                                  <button
                                    type="button"
                                    className="inline-flex items-center rounded-full border border-[#f1d8d0] bg-[#fff5f2] px-3 py-1.5 text-xs font-semibold text-[#b5472d] transition hover:bg-[#ffede8] disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={() => void handleRejectLibraryDocument(row)}
                                    disabled={documentRequestStatusUpdatingId === row.requiredDocumentId || documentRequestStatusUpdatingId === row.documentRequestId}
                                  >
                                    Reject
                                  </button>
                                ) : null}
                                <details className="inline-flex">
                                  <summary className="inline-flex cursor-pointer rounded-full border border-[#dde7f3] bg-[#f7fbff] px-3 py-1.5 text-xs font-semibold text-[#3b556f]">
                                    More options
                                  </summary>
                                  <div className="mt-2 rounded-[12px] border border-[#dce7f3] bg-white p-2 text-xs shadow-[0_8px_20px_rgba(15,23,42,0.08)]">
                                    <button
                                      type="button"
                                      className="w-full rounded-[10px] px-2 py-1.5 text-left transition hover:bg-[#f7fbff]"
                                      onClick={() => openUploadFromLibraryRow({ ...row, satisfiesRequiredDocument: row.source === 'required' ? 'yes' : 'no' })}
                                    >
                                      Duplicate Upload Preset
                                    </button>
                                  </div>
                                </details>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td className="py-8 text-center text-sm text-[#6b7d93]" colSpan={9}>
                          {documentLibraryEmptyState}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            </section>
          ) : null}

        {/* Legacy Documents tabbed view intentionally removed in favor of the unified document library.
        {activeWorkspaceMenu === 'documents' ? (
          <div className="space-y-5">
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

                  {canRequestAdditionalDocuments ? (
                    <div className="mt-4">
                      {!showAdditionalRequestForm ? (
                        <div className="flex justify-end">
                          <Button type="button" onClick={() => setShowAdditionalRequestForm(true)}>
                            + Additional Document Request
                          </Button>
                        </div>
                      ) : (
                        <form className="rounded-[16px] border border-[#e3ebf4] bg-white p-4" onSubmit={(event) => void handleCreateDocumentRequest(event)}>
                          <div className="grid gap-3 md:grid-cols-2">
                            <Field
                              label="Document Name"
                              value={documentRequestForm.title}
                              onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, title: event.target.value }))}
                              placeholder="Updated proof of address"
                            />
                            <Field
                              as="select"
                              label="Requested From"
                              value={documentRequestForm.requestedFrom}
                              onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, requestedFrom: event.target.value }))}
                            >
                              {ADDITIONAL_DOCUMENT_REQUESTED_FROM_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Field>
                            <Field
                              as="select"
                              label="Visibility / Audience"
                              value={documentRequestForm.visibility}
                              onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, visibility: event.target.value }))}
                            >
                              {ADDITIONAL_DOCUMENT_VISIBILITY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Field>
                            <Field
                              as="select"
                              label="Priority"
                              value={documentRequestForm.priority}
                              onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, priority: event.target.value }))}
                            >
                              {ADDITIONAL_DOCUMENT_PRIORITY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Field>
                            <Field
                              type="date"
                              label="Due Date (Optional)"
                              value={documentRequestForm.dueDate}
                              onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, dueDate: event.target.value }))}
                            />
                            <Field
                              label="Notes / Reason"
                              value={documentRequestForm.notes}
                              onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, notes: event.target.value }))}
                              placeholder="Attorney requires this document before lodgement."
                            />
                          </div>
                          <div className="mt-3 flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setShowAdditionalRequestForm(false)
                                setDocumentRequestForm({
                                  title: '',
                                  requestedFrom: 'buyer',
                                  visibility: 'client_visible',
                                  notes: '',
                                  priority: 'normal',
                                  dueDate: '',
                                })
                              }}
                              disabled={documentRequestSaving}
                            >
                              Cancel
                            </Button>
                            <Button type="submit" disabled={documentRequestSaving}>
                              {documentRequestSaving ? 'Requesting...' : 'Request Additional Document'}
                            </Button>
                          </div>
                        </form>
                      )}
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-3">
                    {additionalDocumentRequests.map((request) => {
                      const linkedDocument = request?.requestedDocumentId
                        ? workspaceDocumentsById.get(String(request.requestedDocumentId))
                        : null
                      const statusLabel = getAdditionalRequestStatusLabel(
                        request.status === 'requested' && linkedDocument ? 'uploaded' : request.status,
                      )
                      const statusClasses = getAdditionalRequestStatusClasses(request.status)
                      const isStatusActionBusy = documentRequestStatusUpdatingId === String(request.id)
                      return (
                        <article key={request.id} className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <strong className="block text-sm font-semibold text-[#142132]">{request.title || 'Additional request'}</strong>
                              <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{request.notes || request.description || 'Additional supporting document requested.'}</p>
                              <p className="mt-2 text-xs text-[#7b8ca2]">
                                Requested from {getAdditionalRequestRequestedFromLabel(request.requestedFrom)} • {formatDate(request.createdAt)}
                              </p>
                              <p className="mt-1 text-xs text-[#7b8ca2]">
                                Requested by {toTitleLabel(request.createdByRole || 'team')} • Priority {getAdditionalRequestPriorityLabel(request.additionalPriority || request.priority)}
                                {request.dueDate ? ` • Due ${formatDate(request.dueDate)}` : ''}
                              </p>
                            </div>
                            <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClasses}`}>
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
                            {canRequestAdditionalDocuments && request.status !== 'completed' && request.status !== 'cancelled' ? (
                              <button
                                type="button"
                                className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void handleResendDocumentRequest(request.id)}
                                disabled={documentRequestResendingId === String(request.id)}
                              >
                                {documentRequestResendingId === String(request.id) ? 'Resending...' : 'Resend Request'}
                              </button>
                            ) : null}
                            {canRequestAdditionalDocuments && request.status !== 'uploaded' && request.status !== 'under_review' && request.status !== 'completed' && request.status !== 'cancelled' ? (
                              <button
                                type="button"
                                className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void handleUpdateDocumentRequestStatus(request.id, 'uploaded')}
                                disabled={isStatusActionBusy}
                              >
                                {isStatusActionBusy ? 'Updating...' : 'Mark Uploaded'}
                              </button>
                            ) : null}
                            {canRequestAdditionalDocuments && request.status === 'uploaded' ? (
                              <button
                                type="button"
                                className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void handleUpdateDocumentRequestStatus(request.id, 'under_review')}
                                disabled={isStatusActionBusy}
                              >
                                {isStatusActionBusy ? 'Updating...' : 'Mark Under Review'}
                              </button>
                            ) : null}
                            {canRequestAdditionalDocuments && request.status !== 'completed' && request.status !== 'cancelled' ? (
                              <button
                                type="button"
                                className="inline-flex items-center rounded-full border border-[#cde8d5] bg-[#effaf3] px-4 py-2 text-sm font-semibold text-[#157347] transition hover:bg-[#e5f5eb] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void handleUpdateDocumentRequestStatus(request.id, 'completed')}
                                disabled={isStatusActionBusy}
                              >
                                {isStatusActionBusy ? 'Updating...' : 'Mark Completed'}
                              </button>
                            ) : null}
                            {canRequestAdditionalDocuments && request.status !== 'completed' && request.status !== 'cancelled' ? (
                              <button
                                type="button"
                                className="inline-flex items-center rounded-full border border-[#f4c9c4] bg-[#fef3f2] px-4 py-2 text-sm font-semibold text-[#b42318] transition hover:bg-[#fee9e7] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void handleUpdateDocumentRequestStatus(request.id, 'rejected')}
                                disabled={isStatusActionBusy}
                              >
                                {isStatusActionBusy ? 'Updating...' : 'Reject'}
                              </button>
                            ) : null}
                            {canRequestAdditionalDocuments && request.status !== 'cancelled' && request.status !== 'completed' ? (
                              <button
                                type="button"
                                className="inline-flex items-center rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-4 py-2 text-sm font-semibold text-[#475467] transition hover:bg-[#eff3f8] disabled:cursor-not-allowed disabled:opacity-60"
                                onClick={() => void handleUpdateDocumentRequestStatus(request.id, 'cancelled')}
                                disabled={isStatusActionBusy}
                              >
                                {isStatusActionBusy ? 'Updating...' : 'Cancel Request'}
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

                    {!additionalDocumentRequests.length &&
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
            */}

      </div>
    </SharedTransactionShell>
    <LegalDocumentWorkspace
      open={legalWorkspaceOpen}
      onClose={() => setLegalWorkspaceOpen(false)}
      transactionId={String(transaction?.id || '').trim()}
      transactionReference={
        [
          String(unit?.unit_number ? `Unit ${unit.unit_number}` : '').trim(),
          String(unit?.development?.name || '').trim(),
        ].filter(Boolean).join(' · ') || 'Transaction document context'
      }
      packetType="otp"
      packetId={String(otpPacketStatus?.packet?.id || otpPacketId || '').trim()}
      mode={legalWorkspaceMode}
      initialStatus={otpPacketStatus}
      organisationId={transaction?.organisation_id || null}
      onGenerate={handleWorkspaceGenerateOtp}
      onEdit={handleSaveOtpDraftModal}
      onSend={handleReleaseOtpToClient}
      onView={handleWorkspaceViewOtp}
      onViewSigned={handleWorkspaceViewSignedOtp}
      onRefreshContext={loadDetail}
    />
    <Modal
      open={otpModalOpen}
      onClose={closeOtpGenerateModal}
      title="Generate Offer to Purchase (OTP)"
      subtitle="Run packet validation, generate preview versions, and prepare the OTP packet for sending."
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={closeOtpGenerateModal} disabled={salesActionLoading === 'generate_otp'}>
            Cancel
          </Button>
        </div>
      )}
      className="max-w-[1320px]"
    >
      <div className="space-y-4">
        {otpModalMessage ? (
          <div className="rounded-[12px] border border-[#d8e4ef] bg-[#f4f8fc] px-3 py-2 text-xs font-medium text-[#35546c]">
            {otpModalMessage}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
            <h4 className="text-sm font-semibold text-[#142132]">Purchaser Details</h4>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#6b7d93]">Name</dt>
                <dd className="text-right font-medium text-[#142132]">{purchaserNameForOtp}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#6b7d93]">Email</dt>
                <dd className="text-right font-medium text-[#142132]">{purchaserEmailForOtp}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#6b7d93]">Phone</dt>
                <dd className="text-right font-medium text-[#142132]">{purchaserPhoneForOtp}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#6b7d93]">Purchaser Type</dt>
                <dd className="text-right font-medium text-[#142132]">{purchaserTypeForOtp}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
            <h4 className="text-sm font-semibold text-[#142132]">Property Details</h4>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#6b7d93]">Development</dt>
                <dd className="text-right font-medium text-[#142132]">{unit?.development?.name || 'Not captured'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#6b7d93]">Unit</dt>
                <dd className="text-right font-medium text-[#142132]">{unit?.unit_number ? `Unit ${unit.unit_number}` : 'Not captured'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#6b7d93]">Property Type</dt>
                <dd className="text-right font-medium text-[#142132]">{unit?.property_type || 'Not captured'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#6b7d93]">Address</dt>
                <dd className="max-w-[68%] text-right font-medium text-[#142132]">{propertyAddressForOtp}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
            <h4 className="text-sm font-semibold text-[#142132]">Purchase Details</h4>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#6b7d93]">Purchase Price</dt>
                <dd className="text-right font-medium text-[#142132]">{currency.format(purchasePriceValue || 0)}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#6b7d93]">Deposit Amount</dt>
                <dd className="text-right font-medium text-[#142132]">{transaction?.deposit_amount ? currency.format(transaction.deposit_amount) : 'Not captured'}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#6b7d93]">Finance Type</dt>
                <dd className="text-right font-medium text-[#142132]">{normalizeFinanceType(transaction?.finance_type || 'cash') === 'combination' ? 'Hybrid' : toTitleLabel(normalizeFinanceType(transaction?.finance_type || 'cash'))}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#6b7d93]">Current Stage</dt>
                <dd className="text-right font-medium text-[#142132]">{MAIN_STAGE_LABELS[transaction?.current_main_stage] || transaction?.stage || 'Available'}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
            <h4 className="text-sm font-semibold text-[#142132]">Conveyancer Details</h4>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#6b7d93]">Firm / Name</dt>
                <dd className="text-right font-medium text-[#142132]">{conveyancerNameForOtp}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[#6b7d93]">Email</dt>
                <dd className="text-right font-medium text-[#142132]">{conveyancerEmailForOtp}</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
          <label className="block text-sm font-semibold text-[#142132]" htmlFor="otp-special-conditions">
            Special Conditions
          </label>
          <textarea
            id="otp-special-conditions"
            value={otpSpecialConditions}
            onChange={(event) => setOtpSpecialConditions(event.target.value)}
            rows={4}
            className="mt-2 w-full rounded-[12px] border border-[#d9e4ef] bg-white px-3 py-2 text-sm text-[#142132] outline-none transition focus:border-[#84a8cc] focus:ring-2 focus:ring-[#84a8cc]/20"
            placeholder="Add any special clauses or terms to include in the OTP draft."
          />
        </section>

        <DocumentPacketWorkflowPanel
          packetType="otp"
          heading="Offer to Purchase Packet"
          packetId={otpPacketId}
          onPacketIdChange={setOtpPacketId}
          templates={otpPacketTemplates}
          context={{
            organisationId: transaction?.organisation_id || null,
            transaction,
            unit,
            buyer,
            onboardingFormData: onboardingFormData?.formData || {},
            specialConditions: otpSpecialConditions,
            generatedByRole: effectiveEditorRole,
            generatedByUserId: transaction?.assigned_user_id || transaction?.owner_user_id || null,
          }}
          onPacketGenerated={async () => {
            setOtpModalMessage('Packet version generated. OTP workflow has been updated.')
            window.dispatchEvent(new Event('itg:transaction-updated'))
            await loadDetail()
          }}
        />
      </div>
    </Modal>
    <Modal
      open={uploadDocumentModalOpen}
      onClose={closeUploadDocumentModal}
      title="Upload Transaction Document"
      subtitle="Upload directly into the canonical transaction document library."
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={closeUploadDocumentModal} disabled={isUploadingDocumentInModal}>
            Cancel
          </Button>
          <Button type="submit" form="transaction-upload-form" disabled={isUploadingDocumentInModal}>
            {isUploadingDocumentInModal ? 'Uploading...' : 'Upload Document'}
          </Button>
        </div>
      )}
      className="max-w-[760px]"
    >
      <form id="transaction-upload-form" onSubmit={handleUploadDocumentSubmit} className="space-y-4">
        <div className="rounded-[12px] border border-[#e1eaf4] bg-[#fbfdff] p-3 text-sm text-[#2f4358]">
          {documentUploadForm.requestTitle ? `Linked request: ${documentUploadForm.requestTitle}` : 'Upload a file and complete the metadata for this document.'}
        </div>

        <Field
          label="File"
          type="file"
          onChange={handleDocumentUploadFileSelect}
          inputClassName="cursor-pointer"
        />
        {documentUploadForm.fileName ? (
          <p className="text-xs text-[#6b7ca0]">Selected file: {documentUploadForm.fileName}</p>
        ) : null}

        <Field
          label="Document type"
          value={documentUploadForm.documentType}
          onChange={(event) => setDocumentUploadForm((previous) => ({ ...previous, documentType: event.target.value }))}
          placeholder="e.g. proof_of_funds"
        />
        <Field
          label="Category"
          value={documentUploadForm.category}
          onChange={(event) => setDocumentUploadForm((previous) => ({ ...previous, category: event.target.value }))}
          placeholder="e.g. Finance / Proof of Funds"
        />
        <Field
          as="select"
          label="Visibility"
          value={documentUploadForm.visibility}
          onChange={(event) => setDocumentUploadForm((previous) => ({ ...previous, visibility: event.target.value }))}
        >
          {DOCUMENT_UPLOAD_VISIBILITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Field>
        <Field
          as="select"
          label="Related workflow"
          value={documentUploadForm.relatedWorkflow}
          onChange={(event) => setDocumentUploadForm((previous) => ({ ...previous, relatedWorkflow: event.target.value }))}
        >
          {DOCUMENT_RELATED_WORKFLOW_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Field>
        <Field
          as="select"
          label="Satisfies required document?"
          value={documentUploadForm.satisfiesRequiredDocument}
          onChange={(event) => setDocumentUploadForm((previous) => ({ ...previous, satisfiesRequiredDocument: event.target.value }))}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Field>
        <Field
          label="Notes"
          as="textarea"
          value={documentUploadForm.notes}
          onChange={(event) => setDocumentUploadForm((previous) => ({ ...previous, notes: event.target.value }))}
          placeholder="Any notes for this upload"
          rows={4}
        />
      </form>
    </Modal>
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
    <ConfirmDialog
      open={archiveTransactionConfirmOpen}
      title="Archive Transaction"
      description={`Are you sure you want to archive this transaction for Unit ${unit?.unit_number || 'this unit'}?`
        + ' It will be marked as archived and removed from active workflow lists.'}
      confirmLabel="Archive Transaction"
      cancelLabel="Cancel"
      variant="destructive"
      confirming={archivingTransaction}
      onCancel={() => !archivingTransaction && setArchiveTransactionConfirmOpen(false)}
      onConfirm={() => void confirmArchiveTransactionFromWorkspace()}
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
