import {
  Activity,
  AlertTriangle,
  AtSign,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  CreditCard,
  Download,
  FileCheck2,
  FileText,
  Landmark,
  LockKeyhole,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Send,
  Smile,
  Upload,
  UserCircle,
  UsersRound,
  Workflow,
  X,
} from 'lucide-react'
import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import LoadingSkeleton from '../components/LoadingSkeleton'
import ProgressTimeline from '../components/ProgressTimeline'
import SharedTransactionShell from '../components/SharedTransactionShell'
import AttorneyAssignmentSection from '../components/attorney/assignments/AttorneyAssignmentSection'
import TransactionFinanceCommandCenter from '../components/transaction/TransactionFinanceCommandCenter'
import TransactionLifecycleProgress from '../components/TransactionLifecycleProgress'
import FinanceProgressBar from '../components/finance/FinanceProgressBar'
import FinanceReadinessDashboard from '../components/finance/FinanceReadinessDashboard'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import {
  buildBondHybridFinanceStageSteps,
  summarizeBondHybridFinanceWorkflow,
} from '../core/transactions/bondHybridFinanceWorkflow'
import { buildFinanceReadinessHandoffPacket } from '../core/finance/financeReadinessSelectors'
import { getAttorneyTransferStage, stageLabelFromAttorneyKey } from '../core/transactions/attorneySelectors'
import { isBondFinanceType, normalizeFinanceType } from '../core/transactions/financeType'
import {
  buildTransactionLifecycleSummaryFromRollup,
  formatTransactionRollupStatusLabel,
  TRANSACTION_LIFECYCLE_STAGE_LABELS,
  TRANSACTION_LIFECYCLE_STAGE_ORDER,
  USE_TRANSACTION_ROLLUP_OVERVIEW,
} from '../core/transactions/transactionLifecycle'
import { useWorkspace } from '../context/WorkspaceContext'
import useAttorneyPermissions from '../hooks/useAttorneyPermissions'
import {
  addAttorneyTransactionUpdate,
  getAttorneyWorkflowOperationsForTransaction,
  requestAttorneyWorkflowLaneDocument,
  updateAttorneyWorkflowStepStatus,
} from '../services/attorneyWorkflow/attorneyWorkflowLaneService'
import {
  addTransactionDiscussionComment,
  addBondApplication,
  addBondQuote,
  approveBondQuote,
  archiveTransactionLifecycle,
  cancelTransactionLifecycle,
  createTransactionDocumentRequests,
  declineBondQuote,
  fetchTransactionCoreById,
  fetchTransactionById,
  getCompletionBlockers,
  getFinalReportData,
  getTransactionRollup,
  getTransactionFinanceWorkflow,
  getOrCreateTransactionOnboarding,
  getRegistrationBlockers,
  markFinanceInstructionSent,
  markTransactionCompleted,
  markTransactionRegistered,
  recordBuyerOnboardingSent,
  reviewCanonicalDocumentRequirement,
  runWorkflowAction,
  saveTransactionRoleplayerSelections,
  saveTransactionRoutingProfile,
  undoTransactionRegistration,
  unarchiveTransactionLifecycle,
  updateBondApplication,
  updateBondHybridFinanceStage,
  updateTransactionStakeholderContacts,
  uploadDocument,
} from '../lib/api'
import { buildSellerClientPortalLink } from '../lib/agentListingStorage'
import { canAccessAttorneyMatter } from '../lib/attorneyPermissions'
import { parseEdgeFunctionError } from '../lib/edgeFunctions'
import { fetchPartnersSnapshot, getPartnerAssignmentOptions } from '../lib/partnersRepository'
import { MAIN_STAGE_LABELS, getMainStageFromDetailedStage } from '../lib/stages'
import { invokeEdgeFunction, isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getFinanceReadiness } from '../services/bondFinanceReadinessService'
import { getDocumentReadiness } from '../services/documentReadinessService'
import { getBankPanelForCurrentUser } from '../services/bondOriginatorBankService'
import {
  buildTransactionRoutingDiagnostics,
  getTransactionRoutingStatusLabel,
} from '../services/transactionRoutingDiagnosticsService'
import {
  buildBondApplicationPdfHtml,
  buildBondApplicationViewModel,
  getBondApplicationPdfFilename,
} from '../modules/bond/utils/bondApplicationViewModel'

const ATTORNEY_WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'parties', label: 'Parties' },
  { id: 'stakeholders', label: 'Roleplayers' },
  { id: 'documents', label: 'Documents' },
  { id: 'finance', label: 'Finance' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'activity', label: 'Activity' },
]

const AGENT_WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'documents', label: 'Documents' },
  { id: 'finance', label: 'Finance' },
  { id: 'transfer', label: 'Transfer' },
  { id: 'activity', label: 'Activity' },
  { id: 'stakeholders', label: 'Roleplayers' },
]

const BOND_ORIGINATOR_WORKSPACE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'application', label: 'Application' },
  { id: 'documents', label: 'Documents' },
  { id: 'banks_quotes', label: 'Banks & Quotes' },
  { id: 'stakeholders', label: 'Roleplayers' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'activity', label: 'Activity' },
]

const ROUTING_FINANCE_TYPE_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bond', label: 'Bond' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'developer', label: 'Developer finance' },
  { value: 'unknown', label: 'Unknown' },
]

const ROUTING_TRANSACTION_TYPE_OPTIONS = [
  { value: 'private_sale', label: 'Private sale' },
  { value: 'resale', label: 'Resale' },
  { value: 'development_sale', label: 'New development' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'unknown', label: 'Unknown' },
]

const ROUTING_TENURE_OPTIONS = [
  { value: 'freehold', label: 'Freehold' },
  { value: 'sectional_title', label: 'Sectional title' },
  { value: 'estate_hoa', label: 'Estate / HOA' },
  { value: 'share_block', label: 'Share block' },
  { value: 'unknown', label: 'Unknown' },
]

const ROUTING_ENTITY_TYPE_OPTIONS = [
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
  { value: 'trust', label: 'Trust' },
  { value: 'developer', label: 'Developer' },
  { value: 'unknown', label: 'Unknown' },
]

const ROUTING_VAT_OPTIONS = [
  { value: 'transfer_duty', label: 'Transfer duty' },
  { value: 'vat', label: 'VAT' },
  { value: 'zero_rated_going_concern', label: 'Zero-rated going concern' },
  { value: 'unknown', label: 'Unknown' },
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

function getAttorneyCategoryForRequiredDocument(requirement = {}) {
  const groupKey = String(requirement?.groupKey || requirement?.group || '').trim().toLowerCase()
  const key = String(requirement?.key || '').trim().toLowerCase()
  const visibleSection = String(requirement?.visibleSection || '').trim().toLowerCase()
  if (visibleSection === 'finance_documents' || groupKey === 'finance') {
    return 'Internal Working Documents'
  }
  if (groupKey.includes('buyer') || key.startsWith('buyer_')) return 'Buyer FICA / Compliance'
  if (groupKey.includes('seller') || key.startsWith('seller_')) return 'Seller FICA / Compliance'
  if (key.includes('guarantee')) return 'Guarantees'
  if (key.includes('clearance') || key.includes('rates') || key.includes('levy')) return 'Clearance Documents'
  if (key.includes('lodgement')) return 'Lodgement Documents'
  if (key.includes('registration')) return 'Registration / Close-Out Documents'
  if (key.includes('signed') || key.includes('signature')) return 'Signing Documents'
  if (key.includes('otp') || key.includes('instruction')) return 'Instruction / OTP Documents'
  if (key.includes('transfer')) return 'Drafting Documents'
  return 'Internal Working Documents'
}

const DOCUMENT_LIBRARY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'missing', label: 'Missing' },
  { key: 'pending_review', label: 'Pending Review' },
  { key: 'bank_requested', label: 'Bank Requested' },
  { key: 'verified', label: 'Verified' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'seller', label: 'Seller' },
  { key: 'finance', label: 'Finance' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'bond', label: 'Bond' },
  { key: 'cancellation', label: 'Cancellation' },
  { key: 'generated', label: 'Generated' },
  { key: 'internal', label: 'Internal' },
]

const DOCUMENT_LIBRARY_OPERATIONAL_FILTERS = new Set(['critical', 'missing', 'pending_review', 'bank_requested', 'verified'])

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

const DOCUMENT_VISIBILITY_OPTIONS = [
  { key: 'client_visible', label: 'Client visible' },
  { key: 'shared', label: 'Shared with roleplayers' },
  { key: 'internal', label: 'Internal only' },
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
  { value: 'shared_role_players', label: 'Shared roleplayers' },
  { value: 'internal_only', label: 'Internal only' },
]

const ADDITIONAL_DOCUMENT_PRIORITY_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent' },
]

const LEGAL_WORKFLOW_DETAIL_ROUTE_KEYS = ['transfer', 'bond-registration', 'bond-cancellation']

function inferLibraryCategoryFromTokens(tokens = '') {
  const haystack = String(tokens || '').toLowerCase()

  if (/(internal|commission|working|admin|confidential|private)/.test(haystack)) {
    return 'internal'
  }
  if (/(generated|auto[_-]?generated|draft|packet)/.test(haystack)) {
    return 'generated'
  }
  if (/(cancellation|cancel|annul)/.test(haystack)) {
    return 'cancellation'
  }
  if (/(finance|proof of funds|income|payroll|payslip|bank statement|affordability)/.test(haystack)) {
    return 'finance'
  }
  if (/(bond|guarantee|lender|approval letter|originator)/.test(haystack)) {
    return 'bond'
  }
  if (/(seller)/.test(haystack)) {
    return 'seller'
  }
  if (/(transfer|title deed|warranty|registration|property|signed|signature|executed|otp|instruction|lodgement|close.?out|handover)/.test(haystack)) {
    return 'transfer'
  }
  if (/(buyer|offer|sales|purchase agreement|reservation)/.test(haystack)) {
    return 'buyer'
  }

  return ''
}

function resolveDocumentLibraryCategory(document = {}) {
  const tokens = [
    document?.category,
    document?.portal_workspace_category,
    document?.portalWorkspaceCategory,
    document?.document_type,
    document?.documentType,
    document?.portal_document_type,
    document?.groupKey,
    document?.group_key,
    document?.name,
    document?.label,
    document?.key,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
    .join(' ')
  const byTokens = inferLibraryCategoryFromTokens(tokens)
  if (byTokens) {
    return byTokens
  }

  return 'buyer'
}

function resolveRequirementLibraryCategory(requirement = {}) {
  const requirementTokens = `${String(requirement?.key || '').trim().toLowerCase()} ${String(requirement?.label || '').trim().toLowerCase()} ${String(
    requirement?.groupKey || requirement?.group_key || requirement?.group || '',
  )
    .trim()
    .toLowerCase()} ${String(requirement?.expectedFromRole || requirement?.requiredFromRole || '').trim().toLowerCase()}`
  const byTokens = inferLibraryCategoryFromTokens(requirementTokens)
  if (byTokens) {
    return byTokens
  }
  if (String(requirement?.expectedFromRole || requirement?.requiredFromRole || '').trim().toLowerCase().includes('bond_originator')) {
    return 'bond'
  }
  if (String(requirement?.visibleSection || '').trim().toLowerCase().includes('finance')) {
    return 'finance'
  }
  if (String(requirement?.visibleSection || '').trim().toLowerCase().includes('transfer')) {
    return 'transfer'
  }
  return getAttorneyCategoryForRequiredDocument(requirement).toLowerCase().includes('seller') ? 'seller' : 'buyer'
}

function resolveDocumentLibraryVisibility(document = {}) {
  const raw = String(document?.visibility_scope || document?.visibility || '').trim().toLowerCase()
  if (raw === 'internal' || raw === 'internal_only') return 'Internal'
  if (raw === 'client_visible' || raw === 'shared' || raw === 'shared_role_players') return 'Shared'
  return 'Internal'
}

function resolveDocumentWorkflowLabel(document = {}) {
  const workflow = String(
    document?.stage_key || document?.stageKey || document?.workflow || document?.relatedWorkflow || document?.finance_lane || document?.financeLane || '',
  )
    .trim()
    .toLowerCase()
  if (!workflow) return ''
  return workflow
    .split('_')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
}

function normalizeLibraryCategory(category = '') {
  const normalized = String(category || '').trim().toLowerCase()
  if ([
    'all',
    'critical',
    'missing',
    'pending_review',
    'bank_requested',
    'verified',
    'buyer',
    'seller',
    'finance',
    'transfer',
    'bond',
    'cancellation',
    'generated',
    'internal',
  ].includes(normalized)) {
    return normalized
  }
  return ''
}

function normalizeDocumentCommandStatus(status = '', { hasDocument = false } = {}) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'expired') return 'expired'
  if (normalized === 'rejected' || normalized === 'reupload_required') return 'rejected'
  if (normalized === 'requested') return hasDocument ? 'uploaded' : 'requested'
  if (normalized === 'pending') return hasDocument ? 'uploaded' : 'missing'
  if (normalized === 'under_review' || normalized === 'reviewed' || normalized === 'pending_review') return 'pending_review'
  if (normalized === 'approved' || normalized === 'accepted' || normalized === 'completed' || normalized === 'verified') return 'verified'
  if (normalized === 'generated') return 'generated'
  if (normalized === 'uploaded') return 'uploaded'
  return hasDocument ? 'uploaded' : 'missing'
}

function getDocumentCommandStatusLabel(status = '') {
  const normalized = normalizeDocumentCommandStatus(status)
  if (normalized === 'missing') return 'Missing'
  if (normalized === 'requested') return 'Requested'
  if (normalized === 'uploaded') return 'Uploaded'
  if (normalized === 'pending_review') return 'Pending Review'
  if (normalized === 'verified') return 'Verified'
  if (normalized === 'rejected') return 'Rejected'
  if (normalized === 'expired') return 'Expired'
  if (normalized === 'generated') return 'Generated'
  return toTitle(normalized || 'Unknown')
}

function getDocumentCommandStatusTone(status = '') {
  const normalized = normalizeDocumentCommandStatus(status)
  if (normalized === 'missing' || normalized === 'rejected' || normalized === 'expired') {
    return 'border-red-100 bg-red-50 text-red-700'
  }
  if (normalized === 'requested' || normalized === 'pending_review') {
    return 'border-orange-100 bg-orange-50 text-orange-700'
  }
  if (normalized === 'verified') return 'border-emerald-100 bg-emerald-50 text-emerald-700'
  if (normalized === 'generated') return 'border-violet-100 bg-violet-50 text-violet-700'
  return 'border-blue-100 bg-blue-50 text-blue-700'
}

function getDocumentPriorityLabel(requirement = {}) {
  const raw = String(
    requirement?.priority ||
      requirement?.requirementLevel ||
      requirement?.requirement_level ||
      requirement?.priorityLevel ||
      '',
  )
    .trim()
    .toLowerCase()
  if (requirement?.isBlocking || raw === 'blocker' || raw === 'required' || raw === 'high' || raw === 'urgent') return 'High'
  if (raw === 'optional' || raw === 'low') return 'Low'
  return 'Medium'
}

function getDocumentPriorityTone(priority = '') {
  const normalized = String(priority || '').trim().toLowerCase()
  if (normalized === 'high') return 'border-red-100 bg-red-50 text-red-700'
  if (normalized === 'low') return 'border-slate-200 bg-slate-50 text-slate-600'
  return 'border-orange-100 bg-orange-50 text-orange-700'
}

function getAdditionalRequestStatusLabel(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'uploaded') return 'Uploaded'
  if (normalized === 'under_review' || normalized === 'reviewed') return 'Under Review'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'rejected') return 'Rejected'
  if (normalized === 'cancelled') return 'Cancelled'
  return 'Requested'
}

function getAdditionalRequestStatusTone(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'completed') return 'border-emerald-100 bg-emerald-50 text-emerald-700'
  if (normalized === 'uploaded' || normalized === 'under_review' || normalized === 'reviewed') return 'border-blue-100 bg-blue-50 text-blue-700'
  if (normalized === 'rejected' || normalized === 'cancelled') return 'border-red-100 bg-red-50 text-red-700'
  return 'border-orange-100 bg-orange-50 text-orange-700'
}

function getAdditionalRequestOptionLabel(options, value, fallback = '') {
  const normalized = String(value || '').trim().toLowerCase()
  const matched = options.find((option) => option.value === normalized || option.key === normalized)
  if (matched?.label) return matched.label
  return fallback || toTitle(normalized || 'not set')
}

function getDocumentCommandCategoryLabel(category = '') {
  const normalized = normalizeLibraryCategory(category)
  const labels = {
    buyer: 'Buyer',
    seller: 'Seller',
    finance: 'Finance',
    transfer: 'Transfer',
    bond: 'Bond',
    cancellation: 'Cancellation',
    generated: 'Generated',
    internal: 'Internal',
    critical: 'Critical',
    missing: 'Missing',
    pending_review: 'Pending Review',
    bank_requested: 'Bank Requested',
    verified: 'Verified',
  }
  return labels[normalized] || 'Instruction / OTP'
}

function getUploadCategoryForLibraryFilter(filterKey = '') {
  const normalized = normalizeLibraryCategory(filterKey)
  if (normalized === 'buyer') return 'Buyer FICA / Compliance'
  if (normalized === 'seller') return 'Seller FICA / Compliance'
  if (normalized === 'finance' || normalized === 'bond') return 'Guarantees'
  if (normalized === 'transfer' || normalized === 'generated') return 'Drafting Documents'
  if (normalized === 'cancellation') return 'Clearance Documents'
  if (normalized === 'internal') return 'Internal Working Documents'
  return ATTORNEY_DOCUMENT_CATEGORIES[0]
}

function isDocumentActivityEntry(entry = {}) {
  const filterKeys = new Set(Array.isArray(entry?.filterKeys) ? entry.filterKeys : [])
  const messageType = String(entry?.messageType || '').trim().toLowerCase()
  const title = String(entry?.title || '').trim().toLowerCase()
  const body = String(entry?.body || '').trim().toLowerCase()
  return filterKeys.has('documents') || messageType.includes('document') || title.includes('document') || body.includes('document') || Boolean(entry?.attachmentName)
}

function resolveUploadedByLabel(document = {}, participants = []) {
  const role = String(document?.uploaded_by_role || document?.uploadedByRole || '').trim()
  const participant = participants.find((entry) => String(entry?.roleType || '').trim().toLowerCase() === String(role).trim().toLowerCase())
  if (participant?.participantName) {
    return participant.participantName
  }
  if (role) {
    return toTitle(role)
  }
  return 'System'
}

const STAKEHOLDER_ROLE_OPTIONS = [
  { key: 'developer', label: 'Developer' },
  { key: 'agent', label: 'Agent' },
  { key: 'buyer', label: 'Buyer' },
  { key: 'seller', label: 'Seller' },
  { key: 'attorney', label: 'Attorney' },
  { key: 'bond_originator', label: 'Bond Originator' },
]

const DISCUSSION_TYPES = [
  { key: 'operational', label: 'Operational' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'document', label: 'Document' },
  { key: 'reminder', label: 'Reminder' },
  { key: 'internal_note', label: 'Internal Note' },
  { key: 'client_update', label: 'Client Update' },
]
const DISCUSSION_VISIBILITY_OPTIONS = [
  { key: 'internal', label: 'Internal Only' },
  { key: 'shared', label: 'Shared with Roleplayers' },
  { key: 'client_visible', label: 'Buyer and Seller Visible' },
]

const EMPTY_ARRAY = []
const LIFECYCLE_STATES = ['active', 'registered', 'completed', 'archived', 'cancelled']
const PLACEHOLDER_PARTY_NAMES = new Set(['buyer', 'seller', 'client', 'purchaser'])
const APPROVED_WORKFLOW_DOCUMENT_STATUSES = new Set(['approved', 'accepted', 'completed', 'verified'])
const PRESENT_WORKFLOW_DOCUMENT_STATUSES = new Set(['approved', 'accepted', 'completed', 'verified', 'uploaded', 'under_review'])

function normalizeTransactionKind(transaction) {
  const normalized = String(transaction?.transaction_type || '')
    .trim()
    .toLowerCase()
  if (['development', 'developer_sale'].includes(normalized)) return 'development'
  if (['private', 'private_property'].includes(normalized)) return 'private'
  return transaction?.development_id || transaction?.unit_id ? 'development' : 'private'
}

function cleanDetailText(value = '') {
  return String(value || '').trim()
}

function cleanDetailEmail(value = '') {
  return cleanDetailText(value).toLowerCase()
}

function buildDisplayName(...parts) {
  return parts.map((value) => cleanDetailText(value)).filter(Boolean).join(' ').trim()
}

function normalizeDetailKey(value = '') {
  return cleanDetailText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function isPlaceholderPartyName(value = '') {
  return PLACEHOLDER_PARTY_NAMES.has(normalizeDetailKey(value))
}

function resolveBuyerDisplayName({ buyer = null, transaction = null, onboardingFormData = null, participants = [] } = {}) {
  const buyerParticipant = Array.isArray(participants) ? participants.find((participant) => participant?.roleType === 'buyer') : null
  const candidateNames = [
    cleanDetailText(buyer?.name),
    cleanDetailText(buyer?.fullName),
    cleanDetailText(transaction?.buyer_name),
    cleanDetailText(transaction?.buyerName),
    cleanDetailText(onboardingFormData?.buyerFullName),
    cleanDetailText(onboardingFormData?.buyerName),
    cleanDetailText(onboardingFormData?.fullName),
    buildDisplayName(onboardingFormData?.buyerFirstName, onboardingFormData?.buyerLastName),
    buildDisplayName(onboardingFormData?.firstName, onboardingFormData?.lastName),
    cleanDetailText(buyerParticipant?.participantName),
  ].filter(Boolean)
  const resolvedName = candidateNames.find((value) => !isPlaceholderPartyName(value))
  return resolvedName || 'Buyer details pending'
}

function getRequirementPartyLabel(requirement = {}) {
  const normalized = String(requirement?.expectedFromRole || requirement?.requiredFromRole || '').trim().toLowerCase()
  if (!normalized || normalized === 'client' || normalized === 'buyer') return 'Buyer'
  if (normalized === 'seller') return 'Seller'
  if (normalized === 'agent') return 'Agent'
  if (normalized === 'bond_originator') return 'Bond originator'
  if (normalized === 'bond_attorney') return 'Bond attorney'
  if (normalized === 'cancellation_attorney') return 'Cancellation attorney'
  if (normalized === 'attorney' || normalized === 'transfer_attorney') return 'Conveyancer / Transfer Attorney'
  return toTitle(normalized.replaceAll('_', ' '))
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

function formatDate(value, fallback = 'Not set') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateTime(value, fallback = 'Not set') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeComparableContact(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeRoleplayerOptionValue(value) {
  return String(value || '').trim()
}

function normalizeRoleplayerUuidValue(value) {
  const normalized = normalizeRoleplayerOptionValue(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized) ? normalized : ''
}

function makeRoleplayerOptionKey(option = {}) {
  const normalizedOption = option || {}
  return normalizeRoleplayerOptionValue(
    normalizedOption.id ||
      normalizedOption.relationshipId ||
      normalizedOption.organisationId ||
      normalizedOption.email ||
      normalizedOption.companyName,
  )
}

function findRoleplayerOptionInList(options = [], id = '') {
  const normalizedId = normalizeRoleplayerOptionValue(id)
  if (!normalizedId) return null
  return options.find((option) => normalizeRoleplayerOptionValue(option?.id) === normalizedId) || null
}

function buildPartnerRoleplayerOption(option = {}, roleType = 'transfer_attorney') {
  const normalizedOption = option || {}
  const companyName = normalizeRoleplayerOptionValue(normalizedOption.companyName)
  const scopeLabel = normalizeRoleplayerOptionValue(normalizedOption.scopeLabel)
  const preferred = Boolean(normalizedOption.preferred || normalizedOption.relationshipType === 'preferred')
  return {
    id: makeRoleplayerOptionKey(normalizedOption),
    roleType,
    group: preferred ? 'Preferred Partners' : 'Connected Partners',
    companyName,
    contactPerson: companyName,
    email: normalizeRoleplayerOptionValue(normalizedOption.email),
    organisationId: normalizeRoleplayerOptionValue(normalizedOption.organisationId),
    relationshipId: normalizeRoleplayerUuidValue(normalizedOption.relationshipId || normalizedOption.id),
    scopeType: normalizeRoleplayerOptionValue(normalizedOption.scopeType),
    scopeId: normalizeRoleplayerOptionValue(normalizedOption.scopeId),
    scopeLabel,
    preferred,
    label: `${companyName || 'Connected partner'}${scopeLabel ? ` · ${preferred ? 'Preferred for ' : ''}${scopeLabel.replace(/^Scope:\s*/i, '')}` : ''}`,
  }
}

function buildExistingRoleplayerOption(item = {}, roleType = 'transfer_attorney') {
  const normalizedItem = item || {}
  const companyName = normalizeRoleplayerOptionValue(
    normalizedItem.partnerName || normalizedItem.partner_name || normalizedItem.organisationName || normalizedItem.companyName,
  )
  const contactPerson = normalizeRoleplayerOptionValue(
    normalizedItem.contactPerson || normalizedItem.contact_person || normalizedItem.participantName || normalizedItem.name,
  )
  const email = normalizeRoleplayerOptionValue(normalizedItem.emailAddress || normalizedItem.email_address || normalizedItem.participantEmail || normalizedItem.email)
  const label = companyName || contactPerson || email
  if (!label) return null
  return {
    id: makeRoleplayerOptionKey({
      id: normalizedItem.id,
      organisationId: normalizedItem.organisationId || normalizedItem.organisation_id,
      email,
      companyName: label,
    }),
    roleType,
    group: 'Recently Used',
    companyName: companyName || contactPerson || email,
    contactPerson: contactPerson || companyName || email,
    email,
    organisationId: normalizeRoleplayerOptionValue(normalizedItem.organisationId || normalizedItem.organisation_id),
    relationshipId: normalizeRoleplayerUuidValue(normalizedItem.partnerRelationshipId || normalizedItem.partner_relationship_id || normalizedItem.relationshipId),
    scopeLabel: normalizeRoleplayerOptionValue(normalizedItem.scopeLabel || normalizedItem.scope_label || normalizedItem.snapshot?.scopeLabel),
    preferred: false,
    label,
  }
}

function dedupeRoleplayerOptions(options = []) {
  const map = new Map()
  options.filter(Boolean).forEach((option) => {
    const key = normalizeComparableContact(option.organisationId || option.email || option.companyName || option.id)
    if (!key || map.has(key)) return
    map.set(key, option)
  })
  return [...map.values()]
}

function RoleplayerSelect({ label, value, onChange, options = [], required = false, helper = '' }) {
  const groups = ['Preferred Partners', 'Connected Partners', 'Recently Used']
  const normalizedValue = normalizeRoleplayerOptionValue(value)
  const effectiveValue = options.some((option) => normalizeRoleplayerOptionValue(option.id) === normalizedValue)
    ? normalizedValue
    : ''
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label font-semibold uppercase text-textMuted">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      <Field as="select" value={effectiveValue} onChange={(event) => onChange(event.target.value)}>
        <option value="">{required ? 'Select roleplayer' : 'No selection'}</option>
        {groups.map((group) => {
          const groupOptions = options.filter((option) => option.group === group)
          if (!groupOptions.length) return null
          return (
            <optgroup key={group} label={group}>
              {groupOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          )
        })}
        <optgroup label="Invite New Partner">
          <option value="__invite_new" disabled>
            Invite from Partners page
          </option>
        </optgroup>
      </Field>
      {helper ? <span className="text-helper leading-5 text-textMuted">{helper}</span> : null}
    </label>
  )
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

function formatRoleFriendlyReference(transaction = {}, role = '') {
  const normalizedRole = String(role || '').trim().toLowerCase()
  const rawReference = String(
    transaction?.application_reference ||
      transaction?.bond_application_reference ||
      transaction?.matter_number ||
      transaction?.transaction_reference ||
      transaction?.reference ||
      transaction?.id ||
      '',
  ).trim()
  const fallbackId = String(transaction?.id || '').trim()
  const numericPart = rawReference.match(/\d+$/)?.[0] || fallbackId.match(/\d+$/)?.[0] || fallbackId.slice(0, 8).toUpperCase()

  if (normalizedRole === 'bond_originator') {
    return `APP-${numericPart || 'PENDING'}`
  }

  if (normalizedRole === 'attorney') {
    if (/^MAT-/i.test(rawReference)) return rawReference
    return `MAT-${numericPart || 'PENDING'}`
  }

  if (rawReference) return rawReference
  return `TRX-${numericPart || 'PENDING'}`
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
  delayed: { label: 'Delayed', dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  not_started: { label: 'Not Started', dot: 'bg-slate-300', text: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200' },
}

const LEGAL_WORKFLOW_STAGE_CATALOG = {
  transfer: [
    { key: 'instruction_received', label: 'Instruction', description: 'Sale instruction and source documents received.' },
    { key: 'fica_requested', label: 'FICA Requested', description: 'Buyer and seller compliance packs requested.' },
    { key: 'fica_received', label: 'FICA Received', description: 'Required identity and authority documents received.' },
    { key: 'transfer_documents_prepared', label: 'Drafting', description: 'Transfer documents prepared for signature.' },
    { key: 'buyer_signed', label: 'Buyer Signed', description: 'Buyer transfer signing completed.' },
    { key: 'seller_signed', label: 'Seller Signed', description: 'Seller transfer signing completed.' },
    { key: 'guarantees_received', label: 'Guarantees', description: 'Guarantees or cash undertaking confirmed.', appliesWhen: ({ facts }) => !facts?.isCashDeal },
    { key: 'clearances_requested', label: 'Clearances Requested', description: 'Rates, levy, HOA, or compliance clearances requested.' },
    { key: 'clearances_received', label: 'Clearances Received', description: 'Required transfer clearances received.' },
    { key: 'lodgement_ready', label: 'Lodgement Ready', description: 'Transfer pack ready for deeds office lodgement.' },
    { key: 'lodged', label: 'Lodged', description: 'Matter lodged at deeds office.' },
    { key: 'prep', label: 'Prep', description: 'On prep for registration.' },
    { key: 'registered', label: 'Registered', description: 'Transfer registered and close-out can begin.' },
  ],
  bond: [
    { key: 'bond_instruction_received', label: 'Instruction', description: 'Bond attorney instruction received from finance.' },
    { key: 'bank_requirements_confirmed', label: 'Bank Requirements', description: 'Bank conditions and attorney requirements confirmed.' },
    { key: 'bond_documents_prepared', label: 'Bond Documents', description: 'Bond documents prepared for buyer signature.' },
    { key: 'buyer_signed_bond_documents', label: 'Buyer Signed', description: 'Buyer signed bond documents.' },
    { key: 'guarantees_issued', label: 'Guarantees Issued', description: 'Guarantees issued to the transfer attorney.' },
    { key: 'bond_lodgement_ready', label: 'Lodgement Ready', description: 'Bond pack ready to lodge with transfer.' },
    { key: 'bond_lodged', label: 'Bond Lodged', description: 'Bond lodged at deeds office.' },
    { key: 'bond_registered', label: 'Bond Registered', description: 'Bond registered.' },
  ],
  cancellation: [
    { key: 'cancellation_instruction_received', label: 'Instruction', description: 'Cancellation instruction received.' },
    { key: 'cancellation_figures_requested', label: 'Figures Requested', description: 'Settlement/cancellation figures requested from bank.' },
    { key: 'cancellation_figures_received', label: 'Figures Received', description: 'Cancellation figures received and checked.' },
    { key: 'guarantees_accepted', label: 'Guarantees Accepted', description: 'Cancellation guarantees accepted.' },
    { key: 'cancellation_documents_prepared', label: 'Documents Prepared', description: 'Cancellation documents prepared.' },
    { key: 'cancellation_lodged', label: 'Cancellation Lodged', description: 'Cancellation lodged with the linked transfer.' },
    { key: 'cancellation_registered', label: 'Cancellation Registered', description: 'Seller bond cancellation registered.' },
  ],
}

const LEGAL_WORKFLOW_REASON_LABELS = {
  cash: 'Cash',
  bond: 'Bond finance',
  hybrid: 'Hybrid finance',
  private_sale: 'Private sale',
  resale: 'Resale',
  development_sale: 'New development',
  commercial: 'Commercial',
  individual: 'Individual',
  company: 'Company',
  trust: 'Trust',
  developer: 'Developer',
  freehold: 'Freehold',
  sectional_title: 'Sectional title',
  estate_hoa: 'Estate / HOA',
  share_block: 'Share block',
  vat: 'VAT',
  transfer_duty: 'Transfer duty',
  zero_rated_going_concern: 'Zero-rated going concern',
}

const WORKFLOW_STEP_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'completed', label: 'Completed' },
]

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
  if (normalized === 'pending' || normalized === 'requested' || normalized === 'under_review') return 'waiting'
  if (normalized === 'at_risk') return 'delayed'
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

function getCurrentWorkflowStep(lane = {}) {
  const steps = Array.isArray(lane?.steps) ? lane.steps : []
  const currentKey = lane?.currentStage || lane?.summary?.currentStage
  return (
    steps.find((step) => step.stepKey === currentKey || step.step_key === currentKey) ||
    steps.find((step) => ['blocked', 'waiting', 'in_progress'].includes(normalizeWorkspaceStatus(step.status))) ||
    steps.find((step) => normalizeWorkspaceStatus(step.status) !== 'completed') ||
    steps.at(-1) ||
    null
  )
}

function getWorkflowHealthKey(lane = {}) {
  const status = normalizeWorkspaceStatus(lane?.laneStatus || lane?.summary?.status)
  if (status === 'completed' || status === 'blocked' || status === 'waiting') return status
  const dueDate = lane?.dueDate ? new Date(lane.dueDate).getTime() : null
  if (dueDate && Number.isFinite(dueDate) && dueDate < Date.now() && status !== 'completed') return 'delayed'
  return status === 'not_started' ? 'waiting' : 'in_progress'
}

function getWorkflowHealthLabel(lane = {}) {
  const key = getWorkflowHealthKey(lane)
  if (key === 'in_progress') return 'On Track'
  return WORKFLOW_STATUS_META[key]?.label || 'On Track'
}

function getWorkflowExplanation(lane = {}) {
  const currentStep = getCurrentWorkflowStep(lane)
  const status = normalizeWorkspaceStatus(currentStep?.status || lane?.laneStatus || lane?.summary?.status)
  if (currentStep?.comment) return currentStep.comment
  if (status === 'blocked') return 'Resolve the blocker or add a note so the team can move the matter forward.'
  if (status === 'waiting') return 'Capture who or what the workflow is waiting on, then follow up from the action drawer.'
  if (lane?.documentSummary?.missing) return `${lane.documentSummary.missing} required document item(s) still need attention.`
  return lane?.summary?.nextAction ? `Next action: ${lane.summary.nextAction}` : 'Keep the lane moving by updating the active step or adding a workflow note.'
}

function normalizeLegalWorkflowDetailKey(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  return LEGAL_WORKFLOW_DETAIL_ROUTE_KEYS.includes(normalized) ? normalized : ''
}

function getBondWorkflowStatusKey(workflowData = null) {
  const summary = summarizeBondHybridFinanceWorkflow(workflowData || {})
  if (summary.instructionSent || summary.status === 'completed') return 'completed'
  if (summary.currentStage) return 'in_progress'
  return 'not_started'
}

function getBondWorkflowProgressPercent(workflowData = null) {
  const steps = buildBondHybridFinanceStageSteps(workflowData || {})
  if (!steps.length) return 0
  const completedCount = steps.filter((step) => step.status === 'completed').length
  const hasCurrentStep = steps.some((step) => step.status === 'current')
  const raw = ((completedCount + (hasCurrentStep ? 0.5 : 0)) / steps.length) * 100
  return Math.max(0, Math.min(100, Math.round(raw)))
}

function getBondWorkflowNextStep(workflowData = null) {
  const steps = buildBondHybridFinanceStageSteps(workflowData || {})
  return (
    steps.find((step) => step.status === 'current')?.label ||
    steps.find((step) => step.status === 'upcoming')?.label ||
    steps.at(-1)?.label ||
    'Workflow setup pending'
  )
}

function doesWorkflowStepMatch(step = {}, keywords = []) {
  const haystack = [
    step?.stepKey,
    step?.step_key,
    step?.stepLabel,
    step?.step_label,
    step?.comment,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return keywords.some((keyword) => haystack.includes(String(keyword || '').trim().toLowerCase()))
}

function summarizeLaneMilestone(lane = {}, keywords = [], fallback = 'Not started') {
  const steps = Array.isArray(lane?.steps) ? lane.steps : []
  const matchedStep = steps.find((step) => doesWorkflowStepMatch(step, keywords))
  if (!matchedStep) return fallback

  const statusKey = normalizeWorkspaceStatus(matchedStep.status)
  if (statusKey === 'completed' && matchedStep.completedAt) {
    return `Completed ${formatShortDayMonth(matchedStep.completedAt)}`
  }

  return WORKFLOW_STATUS_META[statusKey]?.label || toTitle(statusKey)
}

function getStepClasses(step = {}, currentStep = null) {
  const status = normalizeWorkspaceStatus(step.status)
  const meta = WORKFLOW_STATUS_META[status] || WORKFLOW_STATUS_META.not_started
  const currentKey = currentStep?.stepKey || currentStep?.step_key
  const stepKey = step.stepKey || step.step_key
  const isCurrent = currentStep && (currentStep.id === step.id || currentKey === stepKey)
  const base = isCurrent ? 'border-primary bg-primarySoft shadow-[0_8px_18px_rgba(15,70,110,0.10)]' : `${meta.border} ${meta.bg}`
  const text = isCurrent ? 'text-primary' : meta.text
  return { base, text, meta, isCurrent }
}

function labelLegalWorkflowValue(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return 'Unknown'
  return LEGAL_WORKFLOW_REASON_LABELS[normalized] || toTitle(normalized)
}

function buildLegalWorkflowReasonChips(facts = {}, workflowKey = 'transfer') {
  const chips = [
    labelLegalWorkflowValue(facts.financeType),
    labelLegalWorkflowValue(facts.transactionType),
    labelLegalWorkflowValue(facts.propertyTenure),
  ]

  if (workflowKey === 'transfer') {
    chips.push(`Buyer: ${labelLegalWorkflowValue(facts.buyerEntityType)}`)
    chips.push(`Seller: ${labelLegalWorkflowValue(facts.sellerEntityType)}`)
    if (facts.hasVatTreatment) chips.push(labelLegalWorkflowValue(facts.vatTreatment))
  }

  if (workflowKey === 'bond') {
    chips.push(facts.isHybridDeal ? 'Cash + bond handoff' : 'Bond handoff')
  }

  if (workflowKey === 'cancellation') {
    chips.push(facts.requiresCancellationAttorney ? 'Seller bond cancellation' : 'No cancellation')
  }

  return [...new Set(chips.filter((chip) => chip && chip !== 'Unknown'))]
}

function getLegalWorkflowStageDefinitions(workflowKey = 'transfer', facts = {}) {
  const definitions = LEGAL_WORKFLOW_STAGE_CATALOG[workflowKey] || LEGAL_WORKFLOW_STAGE_CATALOG.transfer
  return definitions.filter((stage) => !stage.appliesWhen || stage.appliesWhen({ facts }))
}

function buildLegalWorkflowProgressSteps({ workflowKey = 'transfer', lane = null, facts = {} } = {}) {
  const laneSteps = Array.isArray(lane?.steps) ? lane.steps : []
  const laneStepMap = new Map(
    laneSteps.map((step) => [String(step.stepKey || step.step_key || '').trim(), step]),
  )
  const currentStep = lane ? getCurrentWorkflowStep(lane) : null
  const currentKey = currentStep?.stepKey || currentStep?.step_key || lane?.currentStage || lane?.summary?.currentStage || ''
  let currentIndex = -1

  const steps = getLegalWorkflowStageDefinitions(workflowKey, facts).map((definition, index) => {
    const storedStep = laneStepMap.get(definition.key)
    if (definition.key === currentKey) currentIndex = index
    return {
      ...definition,
      storedStep,
      status: normalizeWorkspaceStatus(storedStep?.status),
      completedAt: storedStep?.completedAt || storedStep?.completed_at || null,
      comment: storedStep?.comment || '',
    }
  })

  if (currentIndex < 0) {
    currentIndex = steps.findIndex((step) => !['completed'].includes(step.status))
  }

  return steps.map((step, index) => {
    let displayStatus = step.status
    if (!step.storedStep) {
      displayStatus = index < currentIndex ? 'completed' : index === currentIndex ? 'in_progress' : 'not_started'
    } else if (index === currentIndex && !['completed', 'blocked', 'waiting'].includes(displayStatus)) {
      displayStatus = 'in_progress'
    }
    return {
      ...step,
      displayStatus,
      isCurrent: index === currentIndex,
    }
  })
}

function getLegalWorkflowProgressPercent(steps = []) {
  if (!steps.length) return 0
  const completed = steps.filter((step) => step.displayStatus === 'completed').length
  const hasCurrent = steps.some((step) => step.isCurrent && step.displayStatus !== 'completed')
  return Math.max(0, Math.min(100, Math.round(((completed + (hasCurrent ? 0.5 : 0)) / steps.length) * 100)))
}

function getConditionalLegalWorkflowProgress({ workflowKey = 'transfer', lane = null, facts = {}, fallback = 0 } = {}) {
  const steps = buildLegalWorkflowProgressSteps({ workflowKey, lane, facts })
  return steps.length ? getLegalWorkflowProgressPercent(steps) : Number(fallback || 0)
}

function legalProgressIcon(status) {
  if (status === 'completed') return CheckCircle2
  if (status === 'in_progress') return Landmark
  return LockKeyhole
}

function LegalWorkflowProgressBar({ workflow = null, diagnostics = null }) {
  if (!workflow) return null
  const facts = diagnostics?.facts || {}
  const workflowKey = workflow.accentKey || workflow.key || 'transfer'
  const steps = buildLegalWorkflowProgressSteps({ workflowKey, lane: workflow.lane, facts })
  const progress = getLegalWorkflowProgressPercent(steps)
  const reasonChips = workflow.reasonChips?.length ? workflow.reasonChips : buildLegalWorkflowReasonChips(facts, workflowKey)
  const activeIndex = steps.findIndex((item) => item.isCurrent)

  return (
    <section className="rounded-[18px] border border-[#dfe7f1] bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-[-0.02em] text-[#101b2d]">Workflow Progress</h3>
          <p className="mt-1 text-sm text-[#66758b]">{workflow.summary}</p>
          {reasonChips.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {reasonChips.map((chip) => (
                <span key={chip} className="inline-flex rounded-full border border-[#dce6f2] bg-[#f8fbff] px-2.5 py-1 text-[0.68rem] font-semibold text-[#62758a]">
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <strong className="text-sm font-semibold text-[#0b57d0]">{progress}% Complete</strong>
      </div>

      <div className="mt-7 overflow-x-auto pb-2">
        <div className="relative min-w-[860px]">
          <div className="absolute left-4 right-4 top-[18px] h-px bg-[#cfd9e6]" />
          <div
            className="absolute left-4 top-[18px] h-[3px] rounded-full bg-[#155eef]"
            style={{ width: `calc(${Math.max(progress, 0)}% - 2rem)` }}
          />
          <div
            className="relative grid gap-4"
            style={{ gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, minmax(0, 1fr))` }}
          >
            {steps.map((step, index) => {
              const Icon = legalProgressIcon(step.displayStatus)
              const isCurrent = step.isCurrent && step.displayStatus !== 'completed'
              const isCompleted = step.displayStatus === 'completed'
              const isBlocked = step.displayStatus === 'blocked'
              const isWaiting = step.displayStatus === 'waiting'
              return (
                <div key={step.key} className="min-w-0 text-center">
                  <span
                    className={[
                      'mx-auto inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white shadow-[0_4px_10px_rgba(15,23,42,0.08)]',
                      isCompleted
                        ? 'border-[#0f9f68] bg-[#0f9f68] text-white'
                        : isBlocked
                          ? 'border-[#e03131] bg-[#e03131] text-white'
                          : isWaiting
                            ? 'border-[#f59f00] bg-[#f59f00] text-white'
                            : isCurrent
                              ? 'border-[#155eef] bg-[#155eef] text-white'
                              : 'border-[#d8e2ef] text-[#728198]',
                    ].join(' ')}
                  >
                    <Icon size={16} />
                  </span>
                  <span className={`mt-3 block text-xs font-semibold ${isCurrent ? 'text-[#155eef]' : isCompleted ? 'text-[#101b2d]' : 'text-[#66758b]'}`}>
                    {step.label}
                  </span>
                  <span className={`mt-1 block text-[0.72rem] ${isCurrent ? 'font-semibold text-[#155eef]' : 'text-[#728198]'}`}>
                    {isCompleted && step.completedAt
                      ? formatShortDayMonth(step.completedAt)
                      : isCurrent
                        ? WORKFLOW_STATUS_META[step.displayStatus]?.label || 'In Progress'
                        : activeIndex >= 0 && index > activeIndex ? 'Pending' : WORKFLOW_STATUS_META[step.displayStatus]?.label || ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#edf2f7]">
        <div className="h-full rounded-full bg-[#155eef]" style={{ width: `${progress}%` }} />
      </div>
    </section>
  )
}

function getRequirementStatusLabel(status) {
  const raw = String(status || '').trim().toLowerCase()
  if (raw === 'under_review') return 'Under Review'
  if (raw === 'not_applicable') return 'Not Applicable'
  return toTitle(raw || 'Pending')
}

function getRequirementDocumentId(requirement = {}) {
  return requirement?.uploadedDocumentId || requirement?.uploaded_document_id || requirement?.matchedDocument?.id || null
}

function getRequirementCanonicalId(requirement = {}) {
  return requirement?.canonicalRequirementInstanceId || requirement?.canonical_requirement_instance_id || null
}

function getDocumentCanonicalId(document = {}) {
  return document?.canonicalRequirementInstanceId || document?.canonical_requirement_instance_id || null
}

function canReviewDocumentRequirement(requirement = {}, document = {}) {
  const status = String(requirement.status || document.review_status || document.status || '').trim().toLowerCase()
  return Boolean(getRequirementCanonicalId(requirement) && ['uploaded', 'under_review'].includes(status))
}

function canReplaceDocumentRequirement(requirement = {}, document = {}) {
  const status = String(requirement.status || document.review_status || document.status || '').trim().toLowerCase()
  return Boolean(getRequirementCanonicalId(requirement) && status === 'rejected')
}

function uniqueDocumentsByRenderKey(items = []) {
  const seen = new Set()
  return items.filter((item) => {
    const key = String(item?.id || `${item?.name || ''}:${item?.file_path || ''}`)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function getParticipantDisplayName(participant) {
  return (
    participant?.organisationName ||
    participant?.firmName ||
    participant?.participantName ||
    participant?.participantEmail ||
    'Not assigned'
  )
}

const MATTER_STAGE_MILESTONES = [
  { key: 'instruction', label: 'Instruction' },
  { key: 'fica', label: 'FICA' },
  { key: 'drafting', label: 'Drafting' },
  { key: 'signing', label: 'Signing' },
  { key: 'guarantees', label: 'Guarantees' },
  { key: 'lodgement', label: 'Lodgement' },
  { key: 'registration', label: 'Registration' },
  { key: 'complete', label: 'Complete' },
]

function getMatterStageProgressIndex({ transferStageKey = '', transferStageLabel = '', lifecycleState = '' } = {}) {
  const source = `${transferStageKey} ${transferStageLabel} ${lifecycleState}`.toLowerCase()
  if (/complete|closed|final/.test(source)) return 7
  if (/registered|registration/.test(source)) return 6
  if (/lodge|lodgement/.test(source)) return 5
  if (/guarantee|bank/.test(source)) return 4
  if (/sign/.test(source)) return 3
  if (/draft|doc|prepare/.test(source)) return 2
  if (/fica|kyc|compliance/.test(source)) return 1
  return 0
}

const ACTIVITY_FILTER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'roleplayers', label: 'Roleplayers' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'bond', label: 'Bond' },
  { key: 'cancellation', label: 'Cancellation' },
  { key: 'documents', label: 'Documents' },
  { key: 'notes', label: 'Notes' },
  { key: 'internal', label: 'Internal' },
]

const ACTIVITY_CATEGORY_META = {
  transfer: {
    label: 'Transfer',
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    icon: 'bg-blue-50 text-blue-700 ring-blue-100',
    card: 'border-blue-100',
    dot: 'bg-blue-600',
    Icon: Workflow,
  },
  bond: {
    label: 'Bond',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    icon: 'bg-violet-50 text-violet-700 ring-violet-100',
    card: 'border-violet-100',
    dot: 'bg-violet-600',
    Icon: Workflow,
  },
  cancellation: {
    label: 'Cancellation',
    badge: 'border-orange-200 bg-orange-50 text-orange-700',
    icon: 'bg-orange-50 text-orange-700 ring-orange-100',
    card: 'border-orange-100',
    dot: 'bg-orange-500',
    Icon: Workflow,
  },
  documents: {
    label: 'Documents',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    card: 'border-emerald-100',
    dot: 'bg-emerald-500',
    Icon: FileText,
  },
  appointments: {
    label: 'Appointment',
    badge: 'border-sky-200 bg-sky-50 text-sky-700',
    icon: 'bg-sky-50 text-sky-700 ring-sky-100',
    card: 'border-sky-100',
    dot: 'bg-sky-500',
    Icon: CalendarDays,
  },
  notes: {
    label: 'Notes',
    badge: 'border-slate-200 bg-slate-50 text-slate-600',
    icon: 'bg-slate-50 text-slate-600 ring-slate-100',
    card: 'border-slate-100',
    dot: 'bg-slate-400',
    Icon: MessageSquarePlus,
  },
  internal: {
    label: 'Internal',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: 'bg-amber-50 text-amber-700 ring-amber-100',
    card: 'border-amber-100',
    dot: 'bg-amber-500',
    Icon: MessageSquarePlus,
  },
  system: {
    label: 'System',
    badge: 'border-borderSoft bg-mutedBg text-textMuted',
    icon: 'bg-slate-50 text-slate-500 ring-slate-100',
    card: 'border-borderSoft bg-slate-50/50',
    dot: 'bg-slate-300',
    Icon: Activity,
  },
  alert: {
    label: 'Operational Alert',
    badge: 'border-red-200 bg-red-50 text-red-700',
    icon: 'bg-red-50 text-red-700 ring-red-100',
    card: 'border-red-100',
    dot: 'bg-red-500',
    Icon: AlertTriangle,
  },
}

function getLaneCategory(laneKey) {
  const normalized = String(laneKey || '').trim().toLowerCase()
  if (normalized.includes('bond')) return 'bond'
  if (normalized.includes('cancellation')) return 'cancellation'
  if (normalized.includes('transfer')) return 'transfer'
  return ''
}

function getActivityCategoryMeta(category) {
  return ACTIVITY_CATEGORY_META[category] || ACTIVITY_CATEGORY_META.notes
}

function getActivityEventType(event = {}) {
  return String(event.eventType || event.event_type || event.type || '').trim()
}

function getActivityEventData(event = {}) {
  return event.eventData && typeof event.eventData === 'object'
    ? event.eventData
    : event.event_data && typeof event.event_data === 'object'
      ? event.event_data
      : {}
}

function buildActivityFilterKeys(category, extra = []) {
  const keys = new Set(['all', category, ...extra].filter(Boolean))
  if (['transfer', 'bond', 'cancellation'].includes(category)) keys.add(category)
  if (category === 'documents') keys.add('documents')
  if (category === 'internal' || category === 'notes') keys.add('notes')
  return [...keys]
}

function humanizeTransactionEvent(event = {}) {
  const eventType = getActivityEventType(event)
  const eventData = getActivityEventData(event)
  const laneCategory = getLaneCategory(eventData.laneKey || eventData.lane_key || eventData.workflowLane || eventData.attorneyRole)
  const lowerType = eventType.toLowerCase()
  const source = String(eventData.source || eventData.trigger || '').trim().toLowerCase()
  const isAdditionalDocumentRequest = source === 'additional_document_requested'
  const stepLabel = eventData.stepLabel || eventData.step_label || toTitle(eventData.stepKey || eventData.step_key || '')
  const laneLabel = laneCategory ? `${toTitle(laneCategory)} workflow` : 'Workflow'
  let category = laneCategory || 'system'
  let title = eventData.title || toTitle(eventType || 'Matter update')
  let detail = eventData.message || eventData.note || ''
  let attachmentName = eventData.fileName || eventData.documentName || eventData.title || ''
  const extraFilterKeys = []

  if (lowerType.includes('document') || isAdditionalDocumentRequest) {
    category = 'documents'
    title = eventData.title ? `${eventData.title} requested` : 'Document activity recorded'
    detail = eventData.requestedFrom ? `Requested from ${toTitle(eventData.requestedFrom)}` : detail || 'Document workflow updated.'
  } else if (lowerType.includes('appointment') || lowerType.includes('signing')) {
    category = 'appointments'
    title = eventData.title || 'Signing appointment scheduled'
    detail = [eventData.date, eventData.time, eventData.boardroom].filter(Boolean).join(' · ') || detail || 'Appointment details updated.'
  } else if (lowerType.includes('blocked') || lowerType.includes('overdue') || lowerType.includes('alert')) {
    category = 'alert'
    title = stepLabel ? `${laneLabel} blocked at ${stepLabel}` : 'Operational alert added'
    detail = detail || 'This matter needs attention.'
  } else if (lowerType.includes('waiting')) {
    category = laneCategory || 'alert'
    title = stepLabel ? `${laneLabel} waiting at ${stepLabel}` : 'Workflow marked as waiting'
    detail = detail || 'Waiting reason captured for the workflow.'
  } else if (lowerType.includes('stepcompleted') || lowerType.includes('completed')) {
    category = laneCategory || 'transfer'
    title = stepLabel ? `${laneLabel} moved to ${stepLabel}` : 'Workflow step completed'
    detail = detail || `Step completed${eventData.status ? ` as ${toTitle(eventData.status)}` : ''}.`
  } else if (lowerType.includes('registered')) {
    category = 'system'
    title = 'Matter registered'
    detail = eventData.registrationDate ? `Registration date set to ${formatDate(eventData.registrationDate)}` : detail || 'Registration status updated.'
  } else if (lowerType.includes('note')) {
    category = 'internal'
    title = 'Internal note added'
    detail = detail || 'A matter note was added.'
  } else if (lowerType.includes('sharedupdate')) {
    category = laneCategory || 'notes'
    title = 'Matter team update added'
    detail = detail || 'An update was shared with the matter team.'
  } else if (lowerType.includes('clientvisible')) {
    category = 'notes'
    title = 'Client update published'
    detail = detail || 'A client-visible update was published.'
  } else if (lowerType.includes('roleplayerintro')) {
    category = 'notes'
    extraFilterKeys.push('roleplayers')
    title = 'Buyer intro email sent'
    detail = eventData.recipientEmail
      ? `Roleplayer introduction sent to ${eventData.recipientEmail}.`
      : 'Roleplayer introduction sent to the buyer.'
  } else if (lowerType.includes('roleplayerhandoff')) {
    category = 'notes'
    extraFilterKeys.push('roleplayers')
    title = 'Team handoff email sent'
    const recipients = Array.isArray(eventData.recipients) ? eventData.recipients : []
    detail = recipients.length
      ? `Handoff sent to ${recipients.map((item) => item.email).filter(Boolean).join(', ')}.`
      : 'Handoff sent to the transaction roleplayers.'
  } else if (lowerType.includes('roleplayer') || lowerType.includes('attorney_assigned') || lowerType.includes('bond_originator_assigned')) {
    category = 'notes'
    extraFilterKeys.push('roleplayers')
    title = eventData.title || 'Transaction team updated'
    detail = detail || 'A transaction team assignment or visibility change was recorded.'
  }

  const meta = getActivityCategoryMeta(category)
  let messageType = 'system_update'
  if ((lowerType.includes('document') && lowerType.includes('request')) || isAdditionalDocumentRequest) messageType = 'document_request'
  else if (lowerType.includes('document') && (lowerType.includes('upload') || lowerType.includes('approved') || lowerType.includes('completed'))) messageType = 'document_uploaded'
  else if (lowerType.includes('portal') || lowerType.includes('onboarding') || lowerType.includes('intro') || lowerType.includes('handoff')) messageType = 'portal_event'
  else if (lowerType.includes('finance') || lowerType.includes('bond')) messageType = 'finance_update'
  else if (lowerType.includes('registration') || lowerType.includes('registered')) messageType = 'registration_update'
  else if (lowerType.includes('stage')) messageType = 'stage_change'
  else if (laneCategory === 'transfer' || lowerType.includes('lodg')) messageType = 'transfer_update'
  return {
    id: `event-${event.id || `${eventType}-${event.createdAt || event.created_at}`}`,
    title,
    body: normalizeRichTextToPlainText(detail) || 'Matter activity recorded.',
    createdAt: event.createdAt || event.created_at,
    kind: category === 'system' ? 'system' : 'event',
    authorName: eventData.actorName || eventData.createdByName || (category === 'system' ? 'Bridge' : 'Matter team'),
    roleLabel: toTitle(event.createdByRole || event.created_by_role || eventData.actorRole || 'system'),
    category,
    categoryLabel: meta.label,
    commentType: meta.label,
    filterKeys: buildActivityFilterKeys(category, [laneCategory, ...extraFilterKeys]),
    attachmentName: category === 'documents' ? attachmentName : '',
    meta,
    messageType,
    visibility: category === 'system' ? 'system' : 'shared',
  }
}

function humanizeDiscussionActivity(comment = {}) {
  const visibility = String(comment.visibility || 'shared').trim().toLowerCase()
  const discussionType = String(comment.discussionType || comment.discussion_type || 'operational').trim().toLowerCase()
  const body = normalizeRichTextToPlainText(comment.commentBody || comment.commentText) || 'Comment added.'
  const isInternal = visibility === 'internal' || discussionType === 'internal_note'
  const isClient = visibility === 'client_safe' || visibility === 'client_visible' || discussionType === 'client_update'
  let category = isInternal ? 'internal' : 'notes'
  if (discussionType === 'document') category = 'documents'
  if (discussionType === 'workflow') category = 'transfer'
  if (discussionType === 'reminder') category = 'alert'

  const titleByType = {
    operational: 'Matter update added',
    workflow: 'Workflow update added',
    document: 'Document update added',
    reminder: 'Reminder sent',
    internal_note: 'Internal note added',
    client_update: 'Client update published',
  }
  const meta = getActivityCategoryMeta(category)
  const messageType =
    discussionType === 'document'
      ? 'document_request'
      : discussionType === 'workflow'
        ? 'stage_change'
        : discussionType === 'reminder'
          ? 'question'
          : discussionType === 'client_update'
            ? 'feedback'
            : 'comment'
  return {
    id: `comment-${comment.id}`,
    title: isInternal ? 'Internal note added' : isClient ? 'Client update published' : titleByType[discussionType] || 'Matter update added',
    body,
    createdAt: comment.createdAt || comment.created_at,
    kind: 'comment',
    authorName: comment.authorName || 'Participant',
    roleLabel: comment.authorRoleLabel || toTitle(comment.authorRole || 'participant'),
    category,
    categoryLabel: isInternal ? 'Internal' : isClient ? 'Client Update' : meta.label,
    commentType: isInternal ? 'Internal' : isClient ? 'Client Update' : meta.label,
    filterKeys: buildActivityFilterKeys(category, [isInternal ? 'internal' : 'notes']),
    attachmentName: '',
    meta,
    messageType,
    visibility,
  }
}

function getActivityDateLabel(value) {
  const date = new Date(value || 0)
  if (!Number.isFinite(date.getTime())) return 'Earlier'
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diffDays = Math.round((startOfToday - startOfDate) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })
}

function groupActivityByDate(entries = []) {
  const groups = []
  for (const entry of entries) {
    const label = getActivityDateLabel(entry.createdAt)
    const last = groups.at(-1)
    if (last?.label === label) {
      last.items.push(entry)
    } else {
      groups.push({ label, items: [entry] })
    }
  }
  return groups
}

function normalizeWorkflowDocumentStatus(value = '') {
  const normalized = normalizeDetailKey(value)
  if (normalized === 'under_review') return 'under_review'
  if (normalized === 'reupload_required') return 'rejected'
  if (normalized === 'not_required') return 'not_applicable'
  if (normalized === 'accepted') return 'approved'
  return normalized || 'required'
}

function matchesSignalText(source = '', patterns = []) {
  const signal = String(source || '').trim().toLowerCase()
  if (!signal) return false
  return patterns.some((pattern) => {
    if (!pattern) return false
    if (pattern instanceof RegExp) return pattern.test(signal)
    return signal.includes(String(pattern).trim().toLowerCase())
  })
}

function buildEventSignal(event = {}) {
  const eventData = getActivityEventData(event)
  const parts = [getActivityEventType(event)]
  for (const value of Object.values(eventData || {})) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(String(value))
    }
  }
  return parts.join(' ').toLowerCase()
}

function hasTransactionEvent(events = [], patterns = []) {
  return (events || []).some((event) => matchesSignalText(buildEventSignal(event), patterns))
}

function getRequirementEntriesByKeywords(requirements = [], keywords = []) {
  return (requirements || []).filter((requirement) => {
    const signal = [
      requirement?.key,
      requirement?.document_key,
      requirement?.label,
      requirement?.document_label,
      requirement?.name,
      requirement?.groupKey,
      requirement?.group,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return matchesSignalText(signal, keywords)
  })
}

function hasRequirementStatus(requirements = [], keywords = [], statuses = APPROVED_WORKFLOW_DOCUMENT_STATUSES) {
  return getRequirementEntriesByKeywords(requirements, keywords).some((requirement) =>
    statuses.has(normalizeWorkflowDocumentStatus(requirement?.status || requirement?.requiredDocumentStatus)),
  )
}

function countOutstandingRequirements(requirements = [], keywords = []) {
  return getRequirementEntriesByKeywords(requirements, keywords).filter((requirement) => {
    const status = normalizeWorkflowDocumentStatus(requirement?.status || requirement?.requiredDocumentStatus)
    return !APPROVED_WORKFLOW_DOCUMENT_STATUSES.has(status) && status !== 'not_applicable'
  }).length
}

function hasDocumentWithKeywords(documents = [], keywords = [], statuses = PRESENT_WORKFLOW_DOCUMENT_STATUSES) {
  return (documents || []).some((document) => {
    const signal = [document?.name, document?.category, document?.document_type, document?.stage_key].filter(Boolean).join(' ').toLowerCase()
    if (!matchesSignalText(signal, keywords)) return false
    return statuses.has(normalizeWorkflowDocumentStatus(document?.status || document?.review_status))
  })
}

function resolveProgressBlockerReason({
  currentStage = 'confirmed',
  financeType = 'unknown',
  buyerOnboardingComplete = false,
  sellerOnboardingComplete = false,
  isPrivateMatter = false,
  otpSigned = false,
  proofOfFundsVerified = false,
  bondOfferAccepted = false,
  transferAttorneyAssigned = false,
  transferReady = false,
  registrationComplete = false,
} = {}) {
  if (currentStage === 'confirmed') {
    if (!buyerOnboardingComplete) return 'Buyer onboarding still needs to be completed.'
    if (isPrivateMatter && !sellerOnboardingComplete) return 'Seller onboarding is still outstanding.'
    return 'Accepted offer or reservation confirmation is still outstanding.'
  }
  if (currentStage === 'otp') {
    return otpSigned ? '' : 'OTP must be signed before the matter can move into finance.'
  }
  if (currentStage === 'finance') {
    if (financeType === 'cash') {
      return proofOfFundsVerified ? '' : 'Proof of funds still needs to be verified.'
    }
    if (financeType === 'bond') {
      return bondOfferAccepted ? '' : 'Bond offer acceptance is still outstanding.'
    }
    if (financeType === 'combination') {
      if (!bondOfferAccepted && !proofOfFundsVerified) return 'Bond approval and proof of funds verification are both still outstanding.'
      if (!bondOfferAccepted) return 'Bond offer acceptance is still outstanding.'
      return 'Proof of funds verification is still outstanding.'
    }
    return 'Finance readiness still needs confirmation.'
  }
  if (currentStage === 'transfer') {
    if (!transferAttorneyAssigned) return 'Transfer attorney still needs to be assigned.'
    if (!transferReady) return 'Transfer documents and lodgement readiness are still outstanding.'
    return 'Transfer workflow still needs final registration capture.'
  }
  if (currentStage === 'registration') {
    return registrationComplete ? '' : 'Registration has not been captured yet.'
  }
  return ''
}

function resolveTransactionProgress({
  transaction = null,
  requiredDocumentChecklist = [],
  documents = [],
  transactionFinanceWorkflow = null,
  transactionEvents = [],
  transferStageKey = '',
  onboardingCompleted = false,
  isPrivateMatter = false,
} = {}) {
  const financeType = normalizeFinanceType(transaction?.finance_type, { allowUnknown: true })
  const mainStage = String(transaction?.current_main_stage || '').trim().toUpperCase()
  const stageSignal = [
    transaction?.stage,
    transaction?.current_main_stage,
    transaction?.current_sub_stage_summary,
    transaction?.attorney_stage,
    transaction?.operational_state,
    transaction?.lifecycle_state,
    transaction?.finance_status,
    transferStageKey,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const reservationStatus = normalizeWorkflowDocumentStatus(transaction?.reservation_status)
  const sellerOnboardingSent = hasTransactionEvent(transactionEvents, ['seller_onboarding_sent', 'seller portal link sent'])
  const sellerOnboardingComplete = hasTransactionEvent(transactionEvents, ['seller_onboarding_completed', 'seller onboarding completed'])
  const confirmedComplete =
    Boolean(transaction?.id) &&
    (Boolean(transaction?.offer_accepted_at || transaction?.confirmed_at || transaction?.sale_date) ||
      ['reserved', 'paid', 'verified', 'accepted', 'completed'].includes(reservationStatus) ||
      !['', 'AVAIL', 'NEW'].includes(mainStage) ||
      matchesSignalText(stageSignal, ['confirmed', 'reserved', 'otp', 'finance', 'transfer', 'registration']))
  const otpSigned =
    hasTransactionEvent(transactionEvents, ['otp_signed', 'sale agreement signed', 'offer to purchase signed']) ||
    hasRequirementStatus(requiredDocumentChecklist, ['signed_otp', 'otp_signed', 'sale_agreement_signed']) ||
    hasDocumentWithKeywords(documents, ['signed otp', 'signed sale agreement', 'signed offer to purchase']) ||
    ['FIN', 'ATTY', 'XFER', 'REG', 'TRANSFER', 'REGISTRATION', 'COMPLETE'].includes(mainStage)
  const proofOfFundsVerified =
    hasRequirementStatus(requiredDocumentChecklist, ['proof_of_funds', 'proof_of_funds_cash_component'], APPROVED_WORKFLOW_DOCUMENT_STATUSES) ||
    hasDocumentWithKeywords(documents, ['proof_of_funds', 'cash proof'], APPROVED_WORKFLOW_DOCUMENT_STATUSES) ||
    hasTransactionEvent(transactionEvents, ['proof_of_funds_received', 'proof of funds verified', 'proof of funds approved', 'document_approved proof_of_funds'])
  const bondOfferAccepted =
    Boolean(transactionFinanceWorkflow?.summary?.approvedQuote || transactionFinanceWorkflow?.summary?.instructionSent) ||
    (Array.isArray(transactionFinanceWorkflow?.quotes) &&
      transactionFinanceWorkflow.quotes.some((quote) => normalizeDetailKey(quote?.quote_status) === 'approved_by_buyer')) ||
    (Array.isArray(transactionFinanceWorkflow?.applications) &&
      transactionFinanceWorkflow.applications.some((application) =>
        ['approved', 'buyer_approved'].includes(normalizeDetailKey(application?.status)),
      )) ||
    hasDocumentWithKeywords(documents, ['bond offer', 'bond grant', 'grant letter'], APPROVED_WORKFLOW_DOCUMENT_STATUSES) ||
    hasTransactionEvent(transactionEvents, ['finance_approved', 'quote_approved', 'bond offer accepted', 'bond grant accepted']) ||
    matchesSignalText(stageSignal, ['bond approved', 'finance approved', 'grant accepted'])
  const financeComplete =
    financeType === 'cash'
      ? proofOfFundsVerified
      : financeType === 'bond'
        ? bondOfferAccepted
        : financeType === 'combination'
          ? proofOfFundsVerified && bondOfferAccepted
          : proofOfFundsVerified || bondOfferAccepted
  const transferAttorneyAssigned = Boolean(transaction?.assigned_attorney_email || transaction?.attorney)
  const transferReady =
    ['ready_for_lodgement', 'lodged_at_deeds_office', 'registered'].includes(transferStageKey) ||
    matchesSignalText(stageSignal, ['ready for lodgement', 'registration preparation', 'lodgement ready']) ||
    hasTransactionEvent(transactionEvents, ['lodgement_ready', 'registration_ready', 'lodgement submitted'])
  const registrationComplete =
    Boolean(transaction?.registered_at || transaction?.registration_date || transaction?.title_deed_number) ||
    transferStageKey === 'registered' ||
    matchesSignalText(stageSignal, ['registered', 'registration confirmed']) ||
    hasTransactionEvent(transactionEvents, ['registration_completed', 'transaction registered'])

  const completedStages = []
  let currentStage = 'confirmed'

  if (confirmedComplete) {
    completedStages.push('confirmed')
    currentStage = 'otp'
  }
  if (completedStages.length === 1 && otpSigned) {
    completedStages.push('otp')
    currentStage = 'finance'
  }
  if (completedStages.length === 2 && financeComplete) {
    completedStages.push('finance')
    currentStage = 'transfer'
  }
  if (completedStages.length === 3 && transferReady) {
    completedStages.push('transfer')
    currentStage = 'registration'
  }
  if (completedStages.length === 4 && registrationComplete) {
    completedStages.push('registration')
    currentStage = 'registration'
  }

  const progressPercent =
    completedStages.length >= TRANSACTION_LIFECYCLE_STAGE_ORDER.length
      ? 100
      : Math.round((completedStages.length / TRANSACTION_LIFECYCLE_STAGE_ORDER.length) * 100)
  const nextMilestone =
    TRANSACTION_LIFECYCLE_STAGE_LABELS[currentStage] ||
    TRANSACTION_LIFECYCLE_STAGE_LABELS[TRANSACTION_LIFECYCLE_STAGE_ORDER.at(-1)] ||
    'Registration'
  const blockerReason = resolveProgressBlockerReason({
    currentStage,
    financeType,
    buyerOnboardingComplete: onboardingCompleted,
    sellerOnboardingComplete: isPrivateMatter ? sellerOnboardingComplete : true,
    isPrivateMatter,
    otpSigned,
    proofOfFundsVerified,
    bondOfferAccepted,
    transferAttorneyAssigned,
    transferReady,
    registrationComplete,
  })

  return {
    currentStage,
    completedStages,
    progressPercent,
    nextMilestone,
    blockerReason,
    lastUpdatedAt: transaction?.updated_at || transaction?.created_at || null,
    blockersByStage: {
      confirmed: confirmedComplete ? [] : [blockerReason],
      otp: otpSigned ? [] : ['OTP signature outstanding'],
      finance: financeComplete ? [] : [resolveProgressBlockerReason({ currentStage: 'finance', financeType, proofOfFundsVerified, bondOfferAccepted })],
      transfer: transferReady ? [] : [resolveProgressBlockerReason({ currentStage: 'transfer', transferAttorneyAssigned, transferReady })],
      registration: registrationComplete ? [] : ['Registration capture outstanding'],
    },
    flags: {
      financeType,
      buyerOnboardingComplete: onboardingCompleted,
      sellerOnboardingSent,
      sellerOnboardingComplete,
      confirmedComplete,
      otpSigned,
      proofOfFundsVerified,
      bondOfferAccepted,
      financeComplete,
      transferAttorneyAssigned,
      transferReady,
      registrationComplete,
      openTransferRequirementCount: countOutstandingRequirements(requiredDocumentChecklist, ['transfer_signature', 'signed_transfer', 'transfer_document']),
    },
  }
}

function resolveTransactionNextAction({
  transaction = null,
  progressState = null,
  buyerEmail = '',
  sellerEmail = '',
  onboardingCompleted = false,
  isPrivateMatter = false,
  transferAttorney = null,
  documentRequests = [],
} = {}) {
  const financeType = progressState?.flags?.financeType || normalizeFinanceType(transaction?.finance_type, { allowUnknown: true })
  const hasOpenDocumentRequest = (documentRequests || []).some((request) => {
    const status = normalizeWorkflowDocumentStatus(request?.status)
    return !['completed', 'cancelled', 'approved', 'rejected'].includes(status)
  })

  if (!onboardingCompleted) {
    return {
      title: 'Buyer onboarding pending',
      description: buyerEmail
        ? 'Buyer onboarding still needs to be completed before the matter can move forward cleanly.'
        : 'Buyer onboarding cannot be sent until a buyer email address is captured.',
      status: buyerEmail ? 'pending' : 'blocked',
      priority: 'high',
      dueDate: transaction?.updated_at || transaction?.created_at || null,
      primaryActionLabel: buyerEmail ? 'Resend Buyer Portal Link' : 'Update Buyer Email',
      primaryActionTarget: buyerEmail ? 'buyer_portal' : 'roleplayers',
      secondaryActionLabel: 'Open Documents',
      secondaryActionTarget: 'documents',
    }
  }

  if (isPrivateMatter && !progressState?.flags?.sellerOnboardingComplete) {
    return {
      title: 'Seller onboarding pending',
      description: sellerEmail
        ? 'Seller onboarding still needs attention so the transfer side can progress without gaps.'
        : 'Capture the seller email address before sending the seller portal link.',
      status: sellerEmail ? 'pending' : 'blocked',
      priority: 'high',
      dueDate: transaction?.updated_at || transaction?.created_at || null,
      primaryActionLabel: sellerEmail ? 'Send Seller Portal Link' : 'Update Seller Email',
      primaryActionTarget: sellerEmail ? 'seller_portal' : 'roleplayers',
      secondaryActionLabel: 'Open Roleplayers',
      secondaryActionTarget: 'stakeholders',
    }
  }

  if (!progressState?.flags?.otpSigned) {
    return {
      title: 'OTP signature outstanding',
      description: 'The Offer to Purchase must be signed before the matter can move into finance.',
      status: 'pending',
      priority: 'high',
      dueDate: transaction?.expected_transfer_date || transaction?.target_registration_date || null,
      primaryActionLabel: 'Open Documents',
      primaryActionTarget: 'documents',
      secondaryActionLabel: 'Generate Sales Agreement',
      secondaryActionTarget: 'sales_agreement',
    }
  }

  if (!progressState?.flags?.financeComplete) {
    const cashOrHybridNeedsProof = ['cash', 'combination'].includes(financeType) && !progressState?.flags?.proofOfFundsVerified
    if (cashOrHybridNeedsProof) {
      return {
        title: 'Proof of funds required',
        description: 'Finance cannot complete until proof of funds has been uploaded and verified.',
        status: 'pending',
        priority: 'high',
        dueDate: transaction?.finance_due_at || transaction?.expected_transfer_date || null,
        primaryActionLabel: hasOpenDocumentRequest ? 'Open Documents' : 'Request Documents',
        primaryActionTarget: 'documents',
        secondaryActionLabel: 'Open Finance',
        secondaryActionTarget: 'finance',
      }
    }

    return {
      title: 'Bond offer acceptance pending',
      description: 'The matter stays in finance until the bond offer has been accepted.',
      status: 'pending',
      priority: 'high',
      dueDate: transaction?.finance_due_at || transaction?.expected_transfer_date || null,
      primaryActionLabel: 'Open Finance',
      primaryActionTarget: 'finance',
      secondaryActionLabel: 'Open Documents',
      secondaryActionTarget: 'documents',
    }
  }

  if (!progressState?.flags?.transferAttorneyAssigned && !transferAttorney) {
    return {
      title: 'Transfer attorney not assigned',
      description: 'Assign the transfer attorney so the transfer workflow can move past finance.',
      status: 'blocked',
      priority: 'high',
      dueDate: transaction?.expected_transfer_date || transaction?.target_registration_date || null,
      primaryActionLabel: 'Assign Roleplayer',
      primaryActionTarget: 'stakeholders',
      secondaryActionLabel: 'Open Transfer',
      secondaryActionTarget: 'transfer',
    }
  }

  if (!progressState?.flags?.transferReady) {
    return {
      title: 'Transfer documents outstanding',
      description: 'The transfer pack is not ready for lodgement yet.',
      status: 'pending',
      priority: progressState?.flags?.openTransferRequirementCount ? 'high' : 'normal',
      dueDate: transaction?.expected_transfer_date || transaction?.target_registration_date || null,
      primaryActionLabel: progressState?.flags?.openTransferRequirementCount ? 'Open Documents' : 'Open Transfer',
      primaryActionTarget: progressState?.flags?.openTransferRequirementCount ? 'documents' : 'transfer',
      secondaryActionLabel: 'Add Note',
      secondaryActionTarget: 'activity',
    }
  }

  if (!progressState?.flags?.registrationComplete) {
    return {
      title: 'Ready for registration',
      description: 'The matter is ready for final registration capture and close-out follow-through.',
      status: 'ready',
      priority: 'normal',
      dueDate: transaction?.target_registration_date || transaction?.expected_transfer_date || null,
      primaryActionLabel: 'Open Transfer',
      primaryActionTarget: 'transfer',
      secondaryActionLabel: 'View Summary',
      secondaryActionTarget: 'overview',
    }
  }

  return {
    title: 'Transaction registered',
    description: 'Registration has been captured and the transaction is in close-out.',
    status: 'complete',
    priority: 'informational',
    dueDate: transaction?.registered_at || transaction?.registration_date || null,
    primaryActionLabel: 'View Summary',
    primaryActionTarget: 'overview',
    secondaryActionLabel: 'Open Activity',
    secondaryActionTarget: 'activity',
  }
}

function getRollupOverviewTarget(action = {}, rollup = null) {
  const actionKey = normalizeDetailKey(action?.actionKey)
  if (actionKey === 'move_to_finance') return 'documents'
  if (actionKey === 'move_to_transfer') return 'finance'
  if (actionKey === 'mark_ready_for_registration' || actionKey === 'mark_registered') return 'transfer'

  const workflowKey = normalizeDetailKey(action?.workflowKey || rollup?.activeWorkflowKey)
  if (workflowKey === 'sales_otp') return 'documents'
  if (workflowKey.startsWith('finance')) return 'finance'
  if (
    workflowKey === 'registration' ||
    workflowKey.includes('transfer') ||
    workflowKey.includes('attorney') ||
    workflowKey.includes('cancellation')
  ) {
    return 'transfer'
  }
  return 'overview'
}

function getRollupNextActionStatus(parentStatus = '') {
  const normalized = normalizeDetailKey(parentStatus)
  if (normalized === 'blocked') return 'blocked'
  if (normalized === 'complete') return 'complete'
  if (normalized === 'ready_for_handoff') return 'ready'
  return 'pending'
}

function getRollupHealthLabel(parentStatus = '') {
  const normalized = normalizeDetailKey(parentStatus)
  if (normalized === 'blocked') return 'Blocked'
  if (normalized === 'ready_for_handoff') return 'Ready'
  if (normalized === 'complete') return 'Complete'
  if (normalized === 'not_started') return 'Waiting'
  return 'In Progress'
}

function getRollupLifecycleStatusClasses(parentStatus = '') {
  const normalized = normalizeDetailKey(parentStatus)
  if (normalized === 'blocked') return 'border-[#f5c7c7] bg-[#fff1f1] text-[#b42318]'
  if (normalized === 'ready_for_handoff' || normalized === 'complete') {
    return 'border-[#cfe8d8] bg-[#effaf3] text-[#197a45]'
  }
  if (normalized === 'not_started') return 'border-borderDefault bg-surfaceAlt text-textMuted'
  return 'border-[#d7e5f3] bg-[#eef5fb] text-[#35546c]'
}

function buildOverviewPrimaryNextActionFromRollup({ rollup = null, transaction = null } = {}) {
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
        : 'Review the current workflow progress.'),
    status: getRollupNextActionStatus(rollup?.parentStatus),
    priority: normalizeDetailKey(rollup?.parentStatus) === 'blocked' ? 'high' : 'normal',
    dueDate: rollup?.derivedAt || transaction?.updated_at || transaction?.created_at || null,
    primaryActionLabel: primaryAction?.label || '',
    primaryActionTarget: getRollupOverviewTarget(primaryAction, rollup),
    primaryActionKey: primaryAction?.actionKey || '',
    primaryActionEnabled: primaryAction?.enabled !== false,
    secondaryActionLabel: rollup?.blockers?.length ? 'View Transfer Workflow' : 'Open Activity',
    secondaryActionTarget: rollup?.blockers?.length ? 'transfer' : 'activity',
  }
}

function getRollupHeaderActionVariant(action = {}) {
  const groupKey = normalizeDetailKey(action?.groupKey)
  if (groupKey === 'stage' || groupKey === 'finance' || groupKey === 'attorney') {
    return 'primary'
  }
  return 'secondary'
}

function getConversationVisibilityLabel(value = '') {
  const normalized = normalizeDetailKey(value)
  if (normalized === 'internal') return 'Internal only'
  if (normalized === 'client_visible' || normalized === 'client_safe') return 'Buyer and seller visible'
  if (normalized === 'system') return 'System'
  return 'Shared with roleplayers'
}

function getConversationVisibilityClasses(value = '') {
  const normalized = normalizeDetailKey(value)
  if (normalized === 'internal') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (normalized === 'client_visible' || normalized === 'client_safe') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (normalized === 'system') return 'border-borderSoft bg-surfaceAlt text-textMuted'
  return 'border-sky-200 bg-sky-50 text-sky-700'
}

function getConversationTypeLabel(value = '') {
  const normalized = normalizeDetailKey(value)
  if (normalized === 'document_request') return 'Document request'
  if (normalized === 'document_uploaded') return 'Document uploaded'
  if (normalized === 'portal_event') return 'Portal event'
  if (normalized === 'finance_update') return 'Finance update'
  if (normalized === 'transfer_update') return 'Transfer update'
  if (normalized === 'registration_update') return 'Registration update'
  if (normalized === 'stage_change') return 'Stage change'
  if (normalized === 'feedback') return 'Feedback'
  if (normalized === 'question') return 'Question'
  return 'Comment'
}

function getNextActionStatusClasses(status = '') {
  const normalized = normalizeDetailKey(status)
  if (normalized === 'blocked') return 'border-danger/20 bg-dangerSoft text-danger'
  if (normalized === 'ready') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (normalized === 'complete') return 'border-borderSoft bg-surfaceAlt text-textMuted'
  return 'border-warning/25 bg-warningSoft text-warning'
}

function buildMatterPreviewShell(matterPreview, transactionId) {
  if (!matterPreview || !transactionId || matterPreview.matterId !== transactionId) {
    return null
  }

  return {
    transaction: {
      id: matterPreview.matterId,
      matter_number: matterPreview.matterReference || `MAT-${String(transactionId).slice(0, 8).toUpperCase()}`,
      transaction_reference: matterPreview.matterReference || `Matter ${String(transactionId).slice(0, 8)}`,
      finance_type: matterPreview.financeType || 'cash',
      purchase_price: matterPreview.purchasePrice || 0,
      sales_price: matterPreview.purchasePrice || 0,
      seller_name: matterPreview.sellerName || '',
      seller_has_existing_bond: matterPreview.sellerHasExistingBond || false,
      current_bond_bank: matterPreview.currentBondBank || '',
      estimated_settlement_amount: matterPreview.estimatedSettlementAmount || 0,
      property_description: matterPreview.propertyLabel || '',
      lifecycle_state: matterPreview.lifecycleState || 'active',
      current_main_stage: matterPreview.currentStage || '',
      stage: matterPreview.currentStage || '',
      registration_date: matterPreview.registrationDate || null,
      updated_at: matterPreview.lastUpdated || new Date().toISOString(),
      created_at: matterPreview.lastUpdated || new Date().toISOString(),
      is_active: true,
    },
    buyer: matterPreview.buyerName || matterPreview.clientName
      ? {
          id: null,
          name: matterPreview.buyerName || matterPreview.clientName,
          email: '',
          phone: '',
        }
      : null,
    development: matterPreview.developmentName
      ? {
          id: null,
          name: matterPreview.developmentName,
          location: '',
        }
      : null,
    unit: null,
    documents: [],
    requiredDocumentChecklist: [],
    transactionDiscussion: [],
    transactionEvents: [],
    transactionParticipants: [],
    appointments: [],
    documentRequests: [],
    documentRequestSummary: {
      total: 0,
      pending: 0,
      uploaded: 0,
      approved: 0,
      rejected: 0,
    },
    transactionChecklistItems: [],
    checklistSummary: {
      total: 0,
      completed: 0,
      open: 0,
      blocked: 0,
    },
    stage: matterPreview.currentStage || '',
    mainStage: matterPreview.currentStage || '',
    __isNavigationPreview: true,
    __loadedAt: new Date().toISOString(),
  }
}

function MatterWorkspaceTabs({ tabs = [], activeTab = '', onChange, premium = false, spread = false }) {
  const iconByTab = {
    overview: Workflow,
    application: FileText,
    banks_quotes: Landmark,
    transfer: Workflow,
    parties: UsersRound,
    stakeholders: UsersRound,
    documents: FileText,
    finance: CircleDollarSign,
    tasks: Clock3,
    activity: Activity,
  }

  return (
    <nav
      className={`${premium ? 'rounded-[22px] p-2 shadow-[0_14px_32px_rgba(15,23,42,0.055)]' : 'rounded-[16px] px-2 py-2 shadow-[0_10px_22px_rgba(15,23,42,0.04)]'} no-print w-full border border-borderDefault bg-white`}
      aria-label="Transaction workspace tabs"
    >
      <div
        className={
          premium
            ? 'flex min-w-0 gap-2 overflow-x-auto xl:grid xl:grid-cols-6'
            : spread
              ? 'flex min-w-0 gap-2 overflow-x-auto xl:grid xl:overflow-visible'
              : 'flex min-w-0 gap-1 overflow-x-auto'
        }
        style={spread ? { gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` } : undefined}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          const Icon = iconByTab[tab.id] || FileText
          return (
            <button
              key={tab.id}
              type="button"
              className={`${premium ? 'min-h-[46px] flex-1 justify-center rounded-[15px] px-4' : spread ? 'min-h-[46px] min-w-[150px] flex-1 justify-center rounded-[15px] px-3 xl:min-w-0' : 'min-h-[38px] shrink-0 rounded-[11px] px-3'} inline-flex items-center gap-2 border text-sm font-semibold transition ${
                active
                  ? premium
                    ? 'border-primary bg-primary text-white shadow-[0_10px_20px_rgba(15,70,110,0.16)]'
                    : 'border-primary/15 bg-primarySoft text-primary shadow-[0_4px_12px_rgba(15,70,110,0.08)]'
                  : 'border-transparent text-textMuted hover:border-borderSoft hover:bg-surfaceAlt hover:text-textStrong'
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

function BondApplicationHeader({
  reference = '',
  buyerName = '',
  propertyLabel = '',
  purchasePrice = '',
  ageLabel = '',
  consultant = '',
  owner = '',
  statusLabel = '',
}) {
  return (
    <section className="rounded-[18px] border border-borderDefault bg-white px-5 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-textMuted">
            <span>Applications</span>
            <ChevronRight size={14} />
            <strong className="text-textStrong">{reference}</strong>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-[-0.03em] text-textStrong">{buyerName || 'Bond Applicant'}</h1>
            {statusLabel ? (
              <span className="inline-flex rounded-full border border-success/25 bg-successSoft px-3 py-1 text-xs font-semibold text-success">
                {statusLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-base text-[#243b5a]">{[propertyLabel, purchasePrice].filter(Boolean).join(' • ')}</p>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
            <Button type="button" size="sm">
              <Plus size={14} />
              Create
            </Button>
            <Button type="button" variant="secondary" size="sm">
              <Search size={14} />
              Search
            </Button>
            <button type="button" className="ui-icon-button" aria-label="Notifications"><Bell size={16} /></button>
            <button type="button" className="ui-icon-button" aria-label="Profile"><UserCircle size={17} /></button>
            <button type="button" className="ui-icon-button" aria-label="More actions"><MoreHorizontal size={17} /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ['Application Age', ageLabel],
              ['Consultant', consultant],
              ['Owner', owner],
              ['Status', statusLabel],
            ].map(([label, value]) => (
              <article key={label} className="min-w-0 border-l border-borderSoft pl-4 first:border-l-0 first:pl-0">
                <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{label}</span>
                <strong className="mt-1 block truncate text-sm font-semibold text-textStrong">{value || 'Not assigned'}</strong>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function formatSla(row = {}) {
  const days = Number(row?.slaDays || row?.sla_days || 0)
  if (!Number.isFinite(days) || days <= 0) return '-'
  return days === 1 ? '1 day' : `${Math.max(days - 1, 1)}-${days} days`
}

function calculateDaysWaiting(submittedAt, status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (!submittedAt || ['approved', 'declined', 'expired', 'buyer_approved'].includes(normalized)) return '-'
  return daysBetween(submittedAt)
}

function getBankSubmissionStatusLabel(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (!normalized || normalized === 'pending') return 'Not Submitted'
  if (normalized === 'submitted') return 'Awaiting Response'
  if (normalized === 'feedback_received') return 'Submitted'
  if (normalized === 'additional_documents_required') return 'Docs Requested'
  if (normalized === 'buyer_approved') return 'Approved'
  return toTitle(normalized)
}

function getBankSubmissionTone(status = '') {
  const normalized = String(status || '').trim().toLowerCase()
  if (['approved', 'buyer_approved'].includes(normalized)) return 'border-success/25 bg-successSoft text-success'
  if (normalized === 'additional_documents_required') return 'border-warning/25 bg-warningSoft text-warning'
  if (['declined', 'expired'].includes(normalized)) return 'border-danger/25 bg-dangerSoft text-danger'
  if (normalized === 'submitted') return 'border-[#ffd6a7] bg-[#fff7ed] text-[#c2410c]'
  return 'border-borderSoft bg-surfaceAlt text-textMuted'
}

function buildConfiguredBankRows({ workflowData = null, bankPanel = [] } = {}) {
  const applications = Array.isArray(workflowData?.applications) ? workflowData.applications : []
  const configured = (bankPanel || []).map((row) => ({
    key: row.bankId || row.bank_id || row.bankName || row.bank_name,
    bankName: row.bankName || row.bank_name || row.shortName || row.name,
    sla: formatSla(row),
  }))
  const byBank = new Map()
  for (const row of [...configured, ...applications.map((application) => ({ key: application.bankName, bankName: application.bankName, sla: '-' }))]) {
    const key = String(row.key || row.bankName || '').trim().toLowerCase()
    if (key && !byBank.has(key)) byBank.set(key, row)
  }
  return [...byBank.values()].map((bank) => {
    const application = applications.find((item) => String(item.bankName || '').trim().toLowerCase() === String(bank.bankName || '').trim().toLowerCase()) || null
    const status = application?.status || 'pending'
    return {
      bankName: bank.bankName,
      status,
      statusLabel: getBankSubmissionStatusLabel(status),
      submittedAt: application?.submittedAt || application?.submitted_at || '',
      sla: bank.sla || '-',
      daysWaiting: calculateDaysWaiting(application?.submittedAt || application?.submitted_at, status),
      lastUpdate: application?.updatedAt || application?.updated_at || application?.feedbackReceivedAt || application?.feedback_received_at || application?.submittedAt || application?.submitted_at || '',
    }
  })
}

function BankSubmissionTracker({ rows = [], onViewAll }) {
  return (
    <section className="rounded-[18px] border border-borderDefault bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
      <h3 className="text-base font-semibold tracking-[-0.02em] text-textStrong">Bank Submission Tracker</h3>
      {rows.length ? (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[720px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-borderSoft text-left text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">
                <th className="py-2.5 pr-3">Bank</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Submitted</th>
                <th className="px-3 py-2.5">Response Time (SLA)</th>
                <th className="px-3 py-2.5">Days Waiting</th>
                <th className="py-2.5 pl-3">Last Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderSoft">
              {rows.map((row) => (
                <tr key={row.bankName}>
                  <td className="py-3 pr-3 font-semibold text-textStrong">{row.bankName}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${getBankSubmissionTone(row.status)}`}>
                      {row.statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-textBody">{formatDate(row.submittedAt, '-')}</td>
                  <td className="px-3 py-3 text-textBody">{row.sla || '-'}</td>
                  <td className="px-3 py-3 text-textBody">{row.daysWaiting}</td>
                  <td className="py-3 pl-3 text-textBody">{formatDateTime(row.lastUpdate, '-')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-5 rounded-[14px] border border-dashed border-borderDefault bg-surfaceAlt px-4 py-6 text-sm text-textMuted">
          No bank submissions yet. Submit this application to one or more banks to start tracking responses.
        </p>
      )}
      <button type="button" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primaryDark" onClick={onViewAll}>
        View all bank submissions
        <ChevronRight size={14} />
      </button>
    </section>
  )
}

function getBestQuote(quotes = []) {
  return [...(quotes || [])]
    .filter((quote) => Number.isFinite(Number(quote.interestRate || quote.interest_rate)) || Number.isFinite(Number(quote.monthlyRepayment || quote.monthly_repayment)))
    .sort((left, right) => {
      const leftRate = Number(left.interestRate || left.interest_rate || Number.POSITIVE_INFINITY)
      const rightRate = Number(right.interestRate || right.interest_rate || Number.POSITIVE_INFINITY)
      if (leftRate !== rightRate) return leftRate - rightRate
      return Number(left.monthlyRepayment || left.monthly_repayment || Number.POSITIVE_INFINITY) - Number(right.monthlyRepayment || right.monthly_repayment || Number.POSITIVE_INFINITY)
    })[0] || null
}

function BestQuoteSummary({ quote = null, quotes = [], onAccept, onViewAll, loading = false }) {
  const nextBest = quotes.filter((item) => item.id !== quote?.id).sort((left, right) => Number(left.monthlyRepayment || 0) - Number(right.monthlyRepayment || 0))[0] || null
  const saving = quote && nextBest ? Math.max(0, Number(nextBest.monthlyRepayment || 0) - Number(quote.monthlyRepayment || 0)) * Number(quote.termMonths || 240) : 0

  return (
    <section className="rounded-[18px] border border-borderDefault bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold tracking-[-0.02em] text-textStrong">Best Quote Summary</h3>
        {quote ? <span className="rounded-full border border-success/25 bg-successSoft px-3 py-1 text-xs font-semibold text-success">Recommended</span> : null}
      </div>
      {quote ? (
        <div className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <article>
              <span className="text-label font-semibold uppercase text-textMuted">Bank</span>
              <strong className="mt-1 block text-xl text-textStrong">{quote.bankName}</strong>
            </article>
            <article>
              <span className="text-label font-semibold uppercase text-textMuted">Interest Rate</span>
              <strong className="mt-1 block text-xl text-textStrong">{quote.interestRate ? `${quote.interestRate}%` : quote.interestRateDisplay || 'Pending'}</strong>
            </article>
            <article>
              <span className="text-label font-semibold uppercase text-textMuted">Est. Monthly Repayment</span>
              <strong className="mt-1 block text-xl text-textStrong">{formatCurrencyValue(quote.monthlyRepayment, '-')}</strong>
            </article>
          </div>
          <div className="grid gap-3 border-t border-borderSoft pt-5 sm:grid-cols-4">
            {[
              ['Lifetime Saving', saving ? formatCurrencyValue(saving, '-') : '-'],
              ['Term', quote.termMonths ? `${Math.round(Number(quote.termMonths) / 12)} years` : '-'],
              ['Approval Amount', formatCurrencyValue(quote.quotedAmount, '-')],
              ['Fees', formatCurrencyValue(quote.fees || quote.feeAmount, 'R0')],
              ['Status', quote.quoteStatusLabel || toTitle(quote.quoteStatus || 'Received')],
            ].map(([label, value]) => (
              <article key={label} className="min-w-0">
                <span className="text-label font-semibold uppercase text-textMuted">{label}</span>
                <strong className="mt-1 block truncate text-sm text-textStrong">{value}</strong>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" disabled={loading || ['accepted', 'approved_by_buyer'].includes(String(quote.quoteStatus || '').toLowerCase())} onClick={() => onAccept?.(quote.id)}>
              Accept Quote
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onViewAll}>
              View All Quotes
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-5 rounded-[14px] border border-dashed border-borderDefault bg-surfaceAlt px-4 py-6 text-sm leading-6 text-textMuted">
          No quotes received yet. Quotes will appear here once banks respond to the submitted application.
        </p>
      )}
    </section>
  )
}

function getQuoteBankName(quote = {}) {
  return String(quote.bankName || quote.bank_name || '').trim()
}

function getQuoteRate(quote = {}) {
  const rate = Number(quote.interestRate ?? quote.interest_rate)
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

function getQuoteRepayment(quote = {}) {
  const repayment = Number(quote.monthlyRepayment ?? quote.monthly_repayment)
  return Number.isFinite(repayment) && repayment > 0 ? repayment : null
}

function getQuoteApprovalAmount(quote = {}) {
  const amount = Number(quote.quotedAmount ?? quote.quoted_amount ?? quote.approvalAmount ?? quote.approval_amount)
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

function getQuoteFees(quote = {}) {
  const fees = Number(quote.fees ?? quote.feeAmount ?? quote.fee_amount ?? 0)
  return Number.isFinite(fees) ? fees : 0
}

function getQuoteStatusLabel(quote = {}) {
  const status = quote.quoteStatus || quote.quote_status || quote.status || 'received'
  if (String(status).toLowerCase() === 'approved_by_buyer') return 'Accepted'
  return quote.quoteStatusLabel || toTitle(status)
}

function getRelativeUpdateLabel(value = '') {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const diffDays = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000))
  if (diffDays === 0) return `Today, ${date.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}`
  return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`
}

function getRecommendationContext(quotes = []) {
  const usableQuotes = (quotes || []).filter((quote) => getQuoteBankName(quote))
  if (!usableQuotes.length) return { recommended: null, rows: [] }

  const rates = usableQuotes.map(getQuoteRate).filter((value) => value !== null)
  const repayments = usableQuotes.map(getQuoteRepayment).filter((value) => value !== null)
  const approvals = usableQuotes.map(getQuoteApprovalAmount).filter((value) => value !== null)
  const minRate = rates.length ? Math.min(...rates) : null
  const maxRate = rates.length ? Math.max(...rates) : null
  const minRepayment = repayments.length ? Math.min(...repayments) : null
  const maxRepayment = repayments.length ? Math.max(...repayments) : null
  const minApproval = approvals.length ? Math.min(...approvals) : null
  const maxApproval = approvals.length ? Math.max(...approvals) : null

  const scoreRows = usableQuotes.map((quote) => {
    const rate = getQuoteRate(quote)
    const repayment = getQuoteRepayment(quote)
    const approval = getQuoteApprovalAmount(quote)
    const rateScore = rate !== null && maxRate !== minRate ? (maxRate - rate) / (maxRate - minRate) : rate !== null ? 1 : 0
    const repaymentScore = repayment !== null && maxRepayment !== minRepayment ? (maxRepayment - repayment) / (maxRepayment - minRepayment) : repayment !== null ? 1 : 0
    const approvalScore = approval !== null && maxApproval !== minApproval ? (approval - minApproval) / (maxApproval - minApproval) : approval !== null ? 1 : 0
    return {
      quote,
      score: repaymentScore * 0.45 + rateScore * 0.35 + approvalScore * 0.2,
      rate,
      repayment,
      approval,
    }
  })
  const recommended = [...scoreRows].sort((left, right) => right.score - left.score)[0]?.quote || null
  return { recommended, rows: scoreRows }
}

function buildBankCommandRows({ submissionRows = [], workflowData = null } = {}) {
  const quotes = Array.isArray(workflowData?.quotes) ? workflowData.quotes : Array.isArray(workflowData?.offers) ? workflowData.offers : []
  const quoteByBank = new Map()
  for (const quote of quotes) {
    const key = getQuoteBankName(quote).toLowerCase()
    if (!key) continue
    const existing = quoteByBank.get(key)
    const quoteDate = new Date(quote.quoteReceivedAt || quote.quote_received_at || quote.updatedAt || quote.updated_at || quote.createdAt || quote.created_at || 0).getTime()
    const existingDate = new Date(existing?.quoteReceivedAt || existing?.quote_received_at || existing?.updatedAt || existing?.updated_at || existing?.createdAt || existing?.created_at || 0).getTime()
    if (!existing || quoteDate >= existingDate) quoteByBank.set(key, quote)
  }

  return (submissionRows || []).map((row) => {
    const quote = quoteByBank.get(String(row.bankName || '').trim().toLowerCase()) || null
    const lastUpdate = [row.lastUpdate, quote?.quoteReceivedAt, quote?.quote_received_at, quote?.updatedAt, quote?.updated_at, quote?.createdAt, quote?.created_at]
      .filter(Boolean)
      .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || ''
    return {
      ...row,
      quote,
      quoteReceived: Boolean(quote),
      rate: getQuoteRate(quote || {}),
      approvalAmount: getQuoteApprovalAmount(quote || {}),
      lastUpdate,
    }
  })
}

function getBankRowActionLabel(row = {}) {
  const status = String(row.status || '').toLowerCase()
  if (!row.submittedAt && ['pending', 'not_submitted', ''].includes(status)) return 'Submit'
  if (status === 'additional_documents_required') return 'Upload Docs'
  if (row.quoteReceived) return 'View Quote'
  return 'View'
}

function BondBankSubmissionCommandCenter({
  rows = [],
  loadingAction = '',
  onSubmitBank,
  onUploadDocs,
  onViewQuote,
}) {
  const [submitOpen, setSubmitOpen] = useState(false)
  const [selectedBank, setSelectedBank] = useState('')
  const [submittedAt, setSubmittedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const notSubmittedRows = rows.filter((row) => !row.submittedAt && ['pending', 'not_submitted', ''].includes(String(row.status || '').toLowerCase()))
  const selectedBankName = selectedBank || notSubmittedRows[0]?.bankName || ''

  function submitBank(event) {
    event.preventDefault()
    if (!selectedBankName) return
    onSubmitBank?.({
      bankName: selectedBankName,
      status: 'submitted',
      submittedAt,
      notes: 'Submitted from Banks & Quotes command centre.',
    })
    setSubmitOpen(false)
  }

  return (
    <section className="rounded-[18px] border border-borderDefault bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold tracking-[-0.02em] text-textStrong">Bank Submission Tracker</h3>
          <p className="mt-1 text-sm text-textMuted">Track all banks this application has been submitted to and their responses.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => setSubmitOpen((value) => !value)} disabled={!notSubmittedRows.length || Boolean(loadingAction)}>
          <Send size={14} />
          Submit To More Banks
        </Button>
      </div>

      {submitOpen ? (
        <form onSubmit={submitBank} className="mt-5 grid gap-3 rounded-[14px] border border-borderSoft bg-surfaceAlt p-4 md:grid-cols-[minmax(0,1fr)_220px_auto]">
          <Field as="select" value={selectedBankName} onChange={(event) => setSelectedBank(event.target.value)} required>
            {notSubmittedRows.map((row) => (
              <option key={row.bankName} value={row.bankName}>{row.bankName}</option>
            ))}
          </Field>
          <Field type="date" value={submittedAt} onChange={(event) => setSubmittedAt(event.target.value)} />
          <Button type="submit" disabled={Boolean(loadingAction)}>Submit Bank</Button>
        </form>
      ) : null}

      {rows.length ? (
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[1060px] w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-borderSoft text-left text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">
                <th className="py-3 pr-4">Bank</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Quote Received</th>
                <th className="px-4 py-3">Rate</th>
                <th className="px-4 py-3">Approval Amount</th>
                <th className="px-4 py-3">Last Update</th>
                <th className="py-3 pl-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderSoft">
              {rows.map((row) => {
                const actionLabel = getBankRowActionLabel(row)
                return (
                  <tr key={row.bankName} className="align-middle">
                    <td className="py-4 pr-4 font-semibold text-textStrong">{row.bankName}</td>
                    <td className="px-4 py-4">
                      <strong className={row.submittedAt ? 'block text-xs text-success' : 'block text-xs text-danger'}>{row.submittedAt ? 'Yes' : 'No'}</strong>
                      <span className="mt-1 block text-xs text-textMuted">{formatDate(row.submittedAt, row.submittedAt ? '-' : 'Not submitted')}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${getBankSubmissionTone(row.status)}`}>
                        {row.statusLabel}
                      </span>
                      <span className="mt-1 block text-xs text-textMuted">{row.daysWaiting && row.daysWaiting !== '-' ? `Waiting ${row.daysWaiting}` : row.sla ? `SLA: ${row.sla}` : ''}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={row.quoteReceived ? 'font-semibold text-success' : 'font-semibold text-danger'}>{row.quoteReceived ? 'Yes' : 'No'}</span>
                    </td>
                    <td className="px-4 py-4 font-semibold text-textStrong">{row.rate ? `${row.rate}%` : '-'}</td>
                    <td className="px-4 py-4 font-semibold text-textStrong">{row.approvalAmount ? formatCurrencyValue(row.approvalAmount, '-') : '-'}</td>
                    <td className="px-4 py-4 text-textBody">{getRelativeUpdateLabel(row.lastUpdate)}</td>
                    <td className="py-4 pl-4">
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={Boolean(loadingAction)}
                          onClick={() => {
                            if (actionLabel === 'Submit') {
                              onSubmitBank?.({ bankName: row.bankName, status: 'submitted', submittedAt: new Date().toISOString().slice(0, 10) })
                            } else if (actionLabel === 'Upload Docs') {
                              onUploadDocs?.()
                            } else if (actionLabel === 'View Quote') {
                              onViewQuote?.(row.quote)
                            }
                          }}
                        >
                          {actionLabel}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-5 rounded-[14px] border border-dashed border-borderDefault bg-surfaceAlt px-4 py-6 text-sm text-textMuted">
          No bank submissions yet. Submit this application to one or more banks to start tracking responses.
        </p>
      )}
    </section>
  )
}

function QuoteComparisonCommandCenter({ quotes = [], recommendedQuote = null, loadingAction = '', onAcceptQuote, onRequestRevision, onDeclineAll, onViewAll }) {
  if (!quotes.length) {
    return (
      <section className="rounded-[18px] border border-borderDefault bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
        <h3 className="text-base font-semibold tracking-[-0.02em] text-textStrong">Quote Comparison</h3>
        <p className="mt-1 text-sm text-textMuted">Compare quotes from responding banks.</p>
        <p className="mt-5 rounded-[14px] border border-dashed border-borderDefault bg-surfaceAlt px-4 py-6 text-sm leading-6 text-textMuted">
          No quotes received yet. Quotes will appear once banks return offers.
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-[18px] border border-borderDefault bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-[-0.02em] text-textStrong">Quote Comparison</h3>
          <p className="mt-1 text-sm text-textMuted">Compare quotes from responding banks.</p>
        </div>
        {recommendedQuote ? (
          <span className="rounded-full border border-success/25 bg-successSoft px-3 py-1 text-xs font-semibold text-success">
            {getQuoteBankName(recommendedQuote)} Offer Recommended
          </span>
        ) : null}
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-[860px] w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-borderSoft text-left text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">
              <th className="py-3 pr-4">Bank</th>
              <th className="px-4 py-3">Interest Rate</th>
              <th className="px-4 py-3">Est. Monthly Repayment</th>
              <th className="px-4 py-3">Approval Amount</th>
              <th className="px-4 py-3">Fees</th>
              <th className="py-3 pl-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borderSoft">
            {quotes.map((quote) => {
              const recommended = String(quote.id || '') === String(recommendedQuote?.id || '')
              return (
                <tr key={quote.id || getQuoteBankName(quote)} className="align-middle">
                  <td className="py-4 pr-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="font-semibold text-textStrong">{getQuoteBankName(quote)}</strong>
                      {recommended ? <span className="rounded-full bg-successSoft px-2 py-0.5 text-[0.68rem] font-semibold text-success">Recommended</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-semibold text-textStrong">{getQuoteRate(quote) ? `${getQuoteRate(quote)}%` : quote.interestRateDisplay || quote.interest_rate_display || '-'}</td>
                  <td className="px-4 py-4 font-semibold text-textStrong">{formatCurrencyValue(getQuoteRepayment(quote), '-')}</td>
                  <td className="px-4 py-4 font-semibold text-textStrong">{formatCurrencyValue(getQuoteApprovalAmount(quote), '-')}</td>
                  <td className="px-4 py-4 font-semibold text-textStrong">{formatCurrencyValue(getQuoteFees(quote), 'R0')}</td>
                  <td className="py-4 pl-4">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${getBankSubmissionTone(quote.quoteStatus || quote.quote_status || quote.status)}`}>
                      {getQuoteStatusLabel(quote)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!recommendedQuote || Boolean(loadingAction)} onClick={() => onAcceptQuote?.(recommendedQuote)}>
            Accept {recommendedQuote ? getQuoteBankName(recommendedQuote) : ''} Quote
          </Button>
          <Button type="button" variant="secondary" disabled={!recommendedQuote} onClick={() => onRequestRevision?.(recommendedQuote)}>
            Request Revision
          </Button>
          <Button type="button" variant="secondary" disabled={Boolean(loadingAction)} onClick={onDeclineAll}>
            <X size={14} />
            Decline All Quotes
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onViewAll}>
          View all quotes
          <ChevronRight size={14} />
        </Button>
      </div>
    </section>
  )
}

function BuyerDecisionPanel({ acceptedQuote = null, quotes = [], onRecordDecision, onAddNote }) {
  const latestQuote = acceptedQuote || quotes[0] || null
  const decisionStatus = acceptedQuote
    ? 'Accepted'
    : quotes.some((quote) => String(quote.quoteStatus || quote.quote_status || '').toLowerCase() === 'declined')
      ? 'Declined'
      : quotes.some((quote) => String(quote.quoteStatus || quote.quote_status || '').toLowerCase() === 'expired')
        ? 'Expired'
        : 'Pending Decision'

  return (
    <aside className="rounded-[18px] border border-borderDefault bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
      <h3 className="text-base font-semibold tracking-[-0.02em] text-textStrong">Buyer Decision</h3>
      <p className="mt-1 text-sm leading-6 text-textMuted">Track the buyer's decision on the selected quote.</p>
      <div className="mt-5 divide-y divide-borderSoft">
        {[
          ['Status', decisionStatus],
          ['Selected Quote', acceptedQuote ? getQuoteBankName(acceptedQuote) : 'Not selected'],
          ['Decision Date', acceptedQuote?.approvedAt || acceptedQuote?.approved_at ? formatDate(acceptedQuote.approvedAt || acceptedQuote.approved_at) : '-'],
          ['Notes', acceptedQuote ? 'Buyer accepted this quote.' : 'Buyer has not accepted or declined any quotes yet.'],
        ].map(([label, value]) => (
          <article key={label} className="py-3 first:pt-0 last:pb-0">
            <span className="block text-label font-semibold uppercase text-textMuted">{label}</span>
            <strong className="mt-1 block text-sm font-semibold text-textStrong">{value}</strong>
          </article>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={!latestQuote || Boolean(acceptedQuote)} onClick={() => onRecordDecision?.(latestQuote)}>
          Record Decision
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onAddNote}>
          Add Note
        </Button>
      </div>
    </aside>
  )
}

function BondMatterConversationPanel({
  discussionBody = '',
  setDiscussionBody,
  handleAddDiscussion,
  discussionType = '',
  setDiscussionType,
  discussionVisibility = '',
  setDiscussionVisibility,
  availableDiscussionVisibilityOptions = [],
  overviewConversationEntries = [],
  saving = false,
  canPostInternalDiscussion = false,
  canPostSharedDiscussion = false,
  canPublishClientVisibleDiscussion = false,
  onAttachDocument,
  onViewActivity,
}) {
  return (
    <section className="grid gap-6 rounded-[18px] border border-borderDefault bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)] xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.7fr)]">
      <form onSubmit={handleAddDiscussion} className="min-w-0">
        <h3 className="text-base font-semibold tracking-[-0.02em] text-textStrong">Matter Conversation</h3>
        <p className="mt-1 text-sm text-textMuted">Internal updates, bank updates, document requests, notes, and system events.</p>
        <div className="mt-5 flex gap-2 border-b border-borderSoft">
          <button type="button" className="border-b-2 border-primary px-3 py-2 text-sm font-semibold text-primary">Updates</button>
          <button type="button" className="px-3 py-2 text-sm font-semibold text-textMuted">Notes</button>
        </div>
        <Field
          as="textarea"
          rows={4}
          value={discussionBody}
          onChange={(event) => setDiscussionBody(event.target.value)}
          placeholder="Write an update, note, or @mention someone..."
          className="mt-4"
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">
            Update Type
            <Field as="select" value={discussionType} onChange={(event) => setDiscussionType(event.target.value)} className="mt-1 min-h-9 text-xs">
              {DISCUSSION_TYPES.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </Field>
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">
            Visibility
            <Field as="select" value={discussionVisibility} onChange={(event) => setDiscussionVisibility(event.target.value)} className="mt-1 min-h-9 text-xs">
              {availableDiscussionVisibilityOptions.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </Field>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onAttachDocument}>
            <Paperclip size={14} />
            Attach Document
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={
              saving ||
              !discussionBody.trim() ||
              (discussionVisibility === 'internal' && !canPostInternalDiscussion) ||
              (discussionVisibility === 'shared' && !canPostSharedDiscussion) ||
              (discussionVisibility === 'client_visible' && !canPublishClientVisibleDiscussion)
            }
          >
            <Send size={14} />
            {saving ? 'Posting...' : 'Post Update'}
          </Button>
        </div>
      </form>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-textStrong">Recent Activity</h4>
          <Button type="button" variant="ghost" size="sm" onClick={onViewActivity}>View all activity</Button>
        </div>
        <div className="mt-4 space-y-3">
          {overviewConversationEntries.slice(0, 4).map((entry) => {
            const meta = entry.meta || getActivityCategoryMeta(entry.category)
            return (
              <article key={entry.id} className="rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[12px] ring-1 ${meta.icon}`}>
                    {createElement(meta.Icon, { size: 16 })}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm text-textStrong">{entry.authorName}</strong>
                      <span className="text-xs text-textMuted">{formatDateTime(entry.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-textBody">{entry.body || entry.title}</p>
                  </div>
                </div>
              </article>
            )
          })}
          {!overviewConversationEntries.length ? (
            <p className="rounded-[14px] border border-dashed border-borderDefault bg-surfaceAlt px-4 py-6 text-sm text-textMuted">
              No activity yet. Updates, notes and system events will appear here.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function MatterOverviewHeader({
  title,
  statusLabel,
  statusClassName,
  propertyLabel,
  subtitle,
  clientTitle = '',
  transactionStageLabel = '',
  transaction = null,
  mainStage = '',
  buyerName,
  sellerName,
  agentName,
  assignedFirms = [],
  metrics = [],
  progressIndex = 0,
  matterHealthLabel = 'On Track',
  daysActiveLabel = '',
  updatedLabel = '',
  actionButtons = [],
  isAgentView = false,
  lifecycleProgress = null,
}) {
  const currentStage = MATTER_STAGE_MILESTONES[Math.min(progressIndex, MATTER_STAGE_MILESTONES.length - 1)] || MATTER_STAGE_MILESTONES[0]

  if (isAgentView) {
    const metricGridClass =
      metrics.length >= 5
        ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-5'
        : metrics.length === 4
          ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-4'
          : metrics.length === 3
            ? 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3'
            : 'grid gap-3 sm:grid-cols-2'

    return (
      <div className="space-y-4">
        <section className="rounded-[26px] border border-borderDefault bg-white px-6 py-6 shadow-[0_18px_42px_rgba(15,23,42,0.065)] lg:px-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[2rem] font-bold tracking-[-0.04em] text-textStrong md:text-[2.45rem]">
                {clientTitle || buyerName || 'Buyer details pending'}
              </h1>
              <p className="mt-1.5 max-w-4xl text-base leading-7 text-textMuted">
                {propertyLabel || subtitle || 'Property details pending'}
              </p>
              {daysActiveLabel || updatedLabel ? (
                <p className="mt-3 text-sm text-textMuted">
                  {[daysActiveLabel || '', updatedLabel ? `Updated ${updatedLabel}` : ''].filter(Boolean).join(' • ')}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 xl:justify-end">
              {actionButtons.map((action) => {
                const button = (
                  <Button type="button" variant={action.variant || 'secondary'} onClick={action.onClick} disabled={action.disabled}>
                    {action.icon ? createElement(action.icon, { size: 14 }) : null}
                    {action.busy ? action.busyLabel || 'Preparing...' : action.label}
                  </Button>
                )

                if (!action.reason) {
                  return <span key={action.actionKey || action.label}>{button}</span>
                }

                return (
                  <span key={action.actionKey || action.label} title={action.reason}>
                    {button}
                  </span>
                )
              })}
            </div>
          </div>
        </section>

        <section className={metricGridClass}>
          {metrics.map((item) => {
            const Icon = item.icon || FileText
            return (
              <article key={item.label} className="flex min-h-[118px] min-w-0 items-center gap-3 rounded-[18px] border border-borderDefault bg-white px-4 py-3.5 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-[12px] ${item.tone || 'bg-primarySoft text-primary'}`}>
                  {createElement(Icon, { size: 16 })}
                </span>
                <div className="min-w-0">
                  <span className="block text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-textMuted">{item.label}</span>
                  <strong className="mt-1.5 block truncate text-[0.98rem] font-bold text-textStrong">{item.value || 'Not captured'}</strong>
                </div>
              </article>
            )
          })}
        </section>

        <section className="rounded-[22px] border border-borderDefault bg-white px-4 py-4 shadow-[0_12px_26px_rgba(15,23,42,0.04)] md:px-5">
          <ProgressTimeline
            currentStage={lifecycleProgress?.currentStage || 'confirmed'}
            stages={TRANSACTION_LIFECYCLE_STAGE_ORDER}
            stageLabelMap={TRANSACTION_LIFECYCLE_STAGE_LABELS}
            framed={false}
            compact
            premium
            showCurrentSummary={false}
            progressPercent={lifecycleProgress?.progressPercent ?? 0}
            blockersByStage={lifecycleProgress?.blockersByStage || null}
            helperText={
              lifecycleProgress?.blockerReason
                ? lifecycleProgress.blockerReason
                : `Next milestone: ${lifecycleProgress?.nextMilestone || transactionStageLabel || currentStage.label}`
            }
            lastUpdatedLabel={
              lifecycleProgress?.lastUpdatedAt
                ? `Updated ${new Date(lifecycleProgress.lastUpdatedAt).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })}`
                : ''
            }
          />
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-borderDefault bg-white px-5 py-6 shadow-[0_14px_34px_rgba(15,23,42,0.06)] md:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full border border-borderDefault bg-surfaceAlt px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-textMuted">
                Transaction Command Center
              </span>
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${statusClassName}`}>
                {statusLabel}
              </span>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h1 className="truncate text-2xl font-bold tracking-[-0.03em] text-textStrong md:text-3xl">{title}</h1>
              <span className="inline-flex items-center rounded-full border border-success/30 bg-successSoft px-3 py-1 text-xs font-semibold text-success">
                {matterHealthLabel}
              </span>
            </div>
            <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-textBody">
              {propertyLabel}
            </p>
            {subtitle ? <p className="mt-1 text-sm text-textMuted">{subtitle}</p> : null}

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {[
                ['Buyer', buyerName || 'Buyer pending'],
                ['Seller', sellerName || 'Seller pending'],
                ['Assigned Agent', agentName || 'Not assigned'],
                ...assignedFirms.map((item) => [item.label, item.value]),
              ].map(([label, value]) => (
                <article key={label} className="min-w-0 rounded-[14px] border border-borderSoft bg-surfaceAlt px-3 py-3">
                  <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{label}</span>
                  <strong className="mt-1 block truncate text-sm font-semibold text-textStrong">{value || 'Not assigned'}</strong>
                </article>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <div className="min-w-[170px] rounded-[16px] border border-borderSoft bg-surfaceAlt px-4 py-3">
              <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">Health Summary</span>
              <strong className="mt-1 block text-sm text-textStrong">{matterHealthLabel}</strong>
              <span className="mt-1 block text-xs text-textMuted">{daysActiveLabel}{updatedLabel ? ` • Updated ${updatedLabel}` : ''}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((item) => {
          const Icon = item.icon || FileText
          return (
            <article key={item.label} className="flex min-h-[104px] min-w-0 items-center gap-3 rounded-[18px] border border-borderDefault bg-white px-4 py-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
              <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-[13px] ${item.tone || 'bg-primarySoft text-primary'}`}>
                {createElement(Icon, { size: 18 })}
              </span>
              <div className="min-w-0">
                <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{item.label}</span>
                <strong className="mt-1 block truncate text-base font-bold text-textStrong">{item.value || 'Not captured'}</strong>
              </div>
            </article>
          )
        })}
      </section>

      <TransactionLifecycleProgress
        transaction={transaction}
        mainStage={mainStage}
        framed
        compact
        helperText={`Transfer status: ${transactionStageLabel || currentStage.label}`}
      />
    </div>
  )
}
function LegalWorkflowHubCard({ workflow, onOpen }) {
  const accent = LANE_ACCENTS[workflow?.accentKey] || LANE_ACCENTS.transfer
  const statusMeta = WORKFLOW_STATUS_META[workflow?.statusKey] || WORKFLOW_STATUS_META.not_started

  return (
    <article className={`flex h-full min-w-0 flex-col overflow-hidden rounded-[18px] border border-borderDefault border-l-4 bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)] sm:p-5 ${accent.ring}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex size-10 items-center justify-center rounded-[12px] ring-1 ${accent.icon}`}>
              <Workflow size={17} />
            </span>
            <h3 className="min-w-0 text-base font-semibold text-textStrong">{workflow.title}</h3>
          </div>
          <p className="mt-3 min-h-[3rem] max-w-3xl text-sm leading-6 text-textMuted">{workflow.summary}</p>
        </div>
        <span className={`inline-flex w-fit shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusMeta.border} ${statusMeta.bg} ${statusMeta.text}`}>
          <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
          {workflow.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          ['Status', workflow.statusLabel],
          ['Progress', `${workflow.progressPercent}%`],
          ['Next Step', workflow.nextStep || 'Pending'],
          [workflow.assignedLabel, workflow.assignedDisplay],
        ].map(([label, value]) => (
          <article key={`${workflow.key}-${label}`} className="min-h-[5.25rem] min-w-0 rounded-[14px] border border-borderSoft bg-surfaceAlt px-3 py-3">
            <span className="block break-words text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{label}</span>
            <strong className="mt-1 block break-words text-sm text-textStrong">{value || 'Not assigned'}</strong>
          </article>
        ))}
      </div>

      <div className="mt-4 min-h-[3.5rem]">
        {workflow.blockers.length ? (
          <div className="rounded-[14px] border border-warning/30 bg-warningSoft px-3 py-3 text-sm text-warning">
            {workflow.blockers[0]}
          </div>
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
        <span className="text-xs font-medium text-textMuted">
          {workflow.activityCount} legal update{workflow.activityCount === 1 ? '' : 's'}
        </span>
        <Button type="button" size="sm" onClick={onOpen}>
          Open Workflow
          <ChevronRight size={14} />
        </Button>
      </div>
    </article>
  )
}

function LegalActivityList({ title, items = [], emptyLabel = 'No legal workflow activity yet.' }) {
  return (
    <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
      <h3 className="text-sm font-semibold text-textStrong">{title}</h3>
      <div className="mt-3 space-y-2">
        {items.length ? (
          items.map((item) => (
            <article key={item.id} className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block truncate text-sm text-textStrong">{item.title}</strong>
                  <p className="mt-1 line-clamp-3 text-xs leading-5 text-textMuted">{item.body}</p>
                </div>
                <span className="shrink-0 text-xs text-textMuted">{formatShortDayMonth(item.createdAt)}</span>
              </div>
            </article>
          ))
        ) : (
          <p className="rounded-[12px] border border-dashed border-borderSoft bg-surfaceAlt px-3 py-4 text-sm text-textMuted">
            {emptyLabel}
          </p>
        )}
      </div>
    </section>
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

function TransactionRoutingSummaryCard({ diagnostics = null, canEdit = false, onEdit = null }) {
  if (!diagnostics) return null
  const statusClasses = diagnostics.status === 'needs_attention'
    ? 'border-warning/30 bg-warningSoft text-warning'
    : diagnostics.status === 'ready'
      ? 'border-success/30 bg-successSoft text-success'
      : 'border-borderDefault bg-mutedBg text-textMuted'
  return (
    <OverviewSidePanel title="Routing Profile">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusClasses}`}>
          {getTransactionRoutingStatusLabel(diagnostics.status)}
        </span>
        <span className="inline-flex rounded-full border border-borderSoft bg-surfaceAlt px-2.5 py-1 text-[0.68rem] font-semibold text-textMuted">
          {diagnostics.source === 'persisted' ? 'Persisted' : 'Computed'}
        </span>
        </div>
        {canEdit ? (
          <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
        ) : null}
      </div>
      <p className="mt-3 text-sm font-semibold leading-5 text-textStrong">{diagnostics.summary}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {diagnostics.decisions.map((item) => (
          <div key={item.key} className="min-w-0 rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2">
            <span className="block text-[0.66rem] font-semibold uppercase text-textMuted">{item.label}</span>
            <strong className="mt-1 block truncate text-xs text-textStrong">{item.value}</strong>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <span className="block text-[0.66rem] font-semibold uppercase text-textMuted">Workflow route</span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {diagnostics.requiredWorkflowLabels.map((label) => (
            <span key={label} className="inline-flex rounded-full border border-borderSoft bg-white px-2 py-1 text-[0.68rem] font-semibold text-textMuted">
              {label}
            </span>
          ))}
        </div>
      </div>
      {diagnostics.missingFieldLabels.length ? (
        <div className="mt-3 rounded-[12px] border border-warning/25 bg-warningSoft px-3 py-2 text-xs leading-5 text-warning">
          <strong className="block text-[0.7rem] uppercase">Missing facts</strong>
          <span>{diagnostics.missingFieldLabels.join(', ')}</span>
        </div>
      ) : null}
    </OverviewSidePanel>
  )
}

function LegalWorkflowRoutingPanel({ diagnostics = null, workflows = [], canEdit = false, onEdit = null }) {
  if (!diagnostics) return null
  const statusClasses = diagnostics.status === 'needs_attention'
    ? 'border-warning/30 bg-warningSoft text-warning'
    : diagnostics.status === 'ready'
      ? 'border-success/30 bg-successSoft text-success'
      : 'border-borderDefault bg-mutedBg text-textMuted'
  const activeWorkflows = workflows.filter((workflow) => workflow.required)

  return (
    <section className="rounded-[18px] border border-borderDefault bg-white p-5 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusClasses}`}>
              {getTransactionRoutingStatusLabel(diagnostics.status)}
            </span>
            <span className="inline-flex rounded-full border border-borderSoft bg-surfaceAlt px-2.5 py-1 text-[0.68rem] font-semibold text-textMuted">
              {diagnostics.source === 'persisted' ? 'Persisted route' : 'Computed route'}
            </span>
          </div>
          <h3 className="mt-3 text-base font-semibold text-textStrong">{diagnostics.summary}</h3>
          <p className="mt-1 text-sm leading-6 text-textMuted">
            Legal lanes and document requirements are derived from finance type, party type, property tenure, VAT treatment, and seller bond cancellation.
          </p>
        </div>
        {canEdit ? (
          <Button type="button" variant="secondary" size="sm" onClick={onEdit}>
            Edit Routing
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {diagnostics.decisions.map((item) => (
            <article key={item.key} className="min-w-0 rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2.5">
              <span className="block text-[0.66rem] font-semibold uppercase text-textMuted">{item.label}</span>
              <strong className="mt-1 block truncate text-sm text-textStrong">{item.value}</strong>
            </article>
          ))}
        </div>
        <div className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2.5">
          <span className="block text-[0.66rem] font-semibold uppercase text-textMuted">Active legal workflows</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {activeWorkflows.map((workflow) => (
              <span key={workflow.key} className="inline-flex rounded-full border border-borderSoft bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-textMuted">
                {workflow.title}
              </span>
            ))}
          </div>
        </div>
      </div>

      {diagnostics.missingFieldLabels.length ? (
        <div className="mt-4 rounded-[12px] border border-warning/25 bg-warningSoft px-3 py-2 text-xs leading-5 text-warning">
          <strong className="block text-[0.7rem] uppercase">Missing routing facts</strong>
          <span>{diagnostics.missingFieldLabels.join(', ')}</span>
        </div>
      ) : null}
    </section>
  )
}

function buildRoutingProfileDraft(transaction = {}, diagnostics = {}) {
  const facts = diagnostics?.facts || {}
  const profile = diagnostics?.profile || {}
  const boolString = (value) => (value ? 'true' : 'false')
  return {
    financeType: facts.financeType || profile.financeType || transaction?.finance_type || 'unknown',
    transactionType: facts.transactionType || profile.transactionType || transaction?.transaction_type || 'unknown',
    propertyType: transaction?.property_type || transaction?.propertyType || '',
    propertyTenure: facts.propertyTenure || profile.propertyTenure || transaction?.property_tenure || 'unknown',
    purchaserType: facts.buyerEntityType || profile.buyerEntityType || transaction?.purchaser_type || 'unknown',
    sellerType: facts.sellerEntityType || profile.sellerEntityType || transaction?.seller_type || 'unknown',
    sellerHasExistingBond: boolString(facts.sellerHasExistingBond || profile.sellerHasExistingBond || transaction?.seller_has_existing_bond),
    cancellationRequired: boolString(facts.cancellationRequired || profile.cancellationRequired || transaction?.cancellation_required),
    vatTreatment: facts.vatTreatment || profile.vatTreatment || transaction?.vat_treatment || 'unknown',
    reason: '',
  }
}

function WorkflowDetailsDrawer({
  lane,
  open,
  saving = false,
  stepDraft,
  noteDraft,
  documentDraft,
  onClose,
  onSelectStepStatus,
  onStepDraftChange,
  onSubmitStep,
  onNoteDraftChange,
  onSubmitNote,
  onDocumentDraftChange,
  onSubmitDocument,
  onUploadDocument,
  onScheduleSigning,
}) {
  if (!open || !lane) return null
  const steps = Array.isArray(lane.steps) ? lane.steps : []
  const currentStep = getCurrentWorkflowStep(lane)
  const progress = Number(lane?.summary?.completionPercent || 0)
  const healthKey = getWorkflowHealthKey(lane)
  const healthMeta = WORKFLOW_STATUS_META[healthKey] || WORKFLOW_STATUS_META.not_started
  const laneActivity = lane.timeline || lane.updates || []

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/28 no-print" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <aside className="flex h-full w-full max-w-[720px] flex-col overflow-hidden border-l border-borderDefault bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
        <header className="border-b border-borderSoft px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-textStrong">Workflow Details</h2>
                <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${healthMeta.border} ${healthMeta.bg} ${healthMeta.text}`}>
                  <span className={`h-2 w-2 rounded-full ${healthMeta.dot}`} />
                  {getWorkflowHealthLabel(lane)}
                </span>
              </div>
              <p className="mt-1 text-sm text-textMuted">
                {getWorkflowLaneTitle(lane)} — {getAssignedFirmLabel(lane)}
              </p>
            </div>
            <button type="button" className="ui-icon-button h-10 w-10" onClick={onClose} aria-label="Close workflow details">
              <X size={16} />
            </button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <article className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">Progress</span>
              <strong className="mt-1 block text-sm text-textStrong">{progress}%</strong>
            </article>
            <article className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">Current Step</span>
              <strong className="mt-1 block truncate text-sm text-textStrong">{currentStep ? getWorkflowStepLabel(currentStep) : 'Not started'}</strong>
            </article>
            <article className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2">
              <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">Documents</span>
              <strong className="mt-1 block text-sm text-textStrong">
                {lane.documentSummary?.missing || 0} missing
              </strong>
            </article>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-textStrong">Steps</h3>
                <p className="mt-1 text-xs text-textMuted">Phase 1 allows assigned matter users to update every active workflow.</p>
              </div>
              {currentStep ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" onClick={() => onSelectStepStatus?.(lane, currentStep, 'completed')}>
                    Mark Complete
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => onSelectStepStatus?.(lane, currentStep, 'waiting')}>
                    Set Waiting
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => onSelectStepStatus?.(lane, currentStep, 'blocked')}>
                    Block Step
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              {steps.map((step) => {
                const classes = getStepClasses(step, currentStep)
                return (
                  <article key={step.id || step.stepKey} className={`rounded-[12px] border px-3 py-3 ${classes.base}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${classes.meta.dot}`} />
                          <strong className="text-sm text-textStrong">{getWorkflowStepLabel(step)}</strong>
                          {classes.isCurrent ? <span className="rounded-full bg-white px-2 py-0.5 text-[0.65rem] font-bold uppercase text-primary">Current</span> : null}
                        </div>
                        <p className={`mt-1 text-xs font-medium ${classes.text}`}>
                          {step.completedAt ? `Completed ${formatShortDayMonth(step.completedAt)}` : classes.meta.label}
                        </p>
                        {step.comment ? <p className="mt-1 text-xs leading-5 text-textMuted">{step.comment}</p> : null}
                      </div>
                      <div className="flex max-w-full gap-1 overflow-x-auto pb-1">
                        {WORKFLOW_STEP_STATUS_OPTIONS.map((option) => {
                          const active = normalizeWorkspaceStatus(step.status) === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold transition ${
                                active ? 'border-primary bg-primary text-white' : 'border-borderSoft bg-white text-textMuted hover:border-primary/40 hover:text-textStrong'
                              }`}
                              onClick={() => onSelectStepStatus?.(lane, step, option.value)}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            {stepDraft ? (
              <form onSubmit={onSubmitStep} className="mt-4 rounded-[14px] border border-primary/20 bg-primarySoft p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-textStrong">
                    Set {getWorkflowStepLabel(stepDraft.step)} to {toTitle(stepDraft.status)}
                  </strong>
                  <span className="text-xs font-semibold text-primary">{getWorkflowLaneTitle(lane)}</span>
                </div>
                <label className="mt-3 grid gap-1.5 text-sm font-medium text-textStrong">
                  {stepDraft.status === 'blocked' ? 'Blocker reason' : stepDraft.status === 'waiting' ? 'Waiting reason / party' : 'Note'}
                  <Field
                    as="textarea"
                    rows={3}
                    value={stepDraft.note}
                    onChange={(event) => onStepDraftChange?.({ ...stepDraft, note: event.target.value })}
                    placeholder={stepDraft.status === 'blocked' ? 'What is blocking this step?' : stepDraft.status === 'waiting' ? 'Who or what are we waiting on?' : 'Optional context for this update'}
                  />
                </label>
                <div className="mt-3 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => onStepDraftChange?.(null)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={saving || (['blocked', 'waiting'].includes(stepDraft.status) && !stepDraft.note.trim())}>
                    {saving ? 'Saving…' : 'Save Step'}
                  </Button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="mt-4 rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-textStrong">Actions</h3>
                <p className="mt-1 text-xs text-textMuted">Notes, documents, reminders, and scheduling from the workflow context.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => onNoteDraftChange?.({ laneKey: lane.laneKey, message: '', visibility: 'internal' })}>
                  Add Note
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => onDocumentDraftChange?.({ laneKey: lane.laneKey, title: '', description: '', requestedFrom: 'client' })}>
                  Request Document
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={onUploadDocument}>
                  Upload Document
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={onScheduleSigning}>
                  Schedule Signing
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => onNoteDraftChange?.({ laneKey: lane.laneKey, message: `Reminder sent for ${currentStep ? getWorkflowStepLabel(currentStep) : getWorkflowLaneTitle(lane)}.`, visibility: 'professional_shared' })}>
                  Send Reminder
                </Button>
              </div>
            </div>

            {noteDraft ? (
              <form onSubmit={onSubmitNote} className="mt-4 rounded-[14px] border border-borderSoft bg-surfaceAlt p-4">
                <label className="grid gap-1.5 text-sm font-medium text-textStrong">
                  Note visibility
                  <Field as="select" value={noteDraft.visibility} onChange={(event) => onNoteDraftChange?.({ ...noteDraft, visibility: event.target.value })}>
                    <option value="internal">Internal</option>
                    <option value="professional_shared">Professional Shared</option>
                    <option value="client_visible">Client Visible</option>
                  </Field>
                </label>
                <label className="mt-3 grid gap-1.5 text-sm font-medium text-textStrong">
                  Note
                  <Field as="textarea" rows={4} value={noteDraft.message} onChange={(event) => onNoteDraftChange?.({ ...noteDraft, message: event.target.value })} />
                </label>
                <div className="mt-3 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => onNoteDraftChange?.(null)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={saving || !noteDraft.message.trim()}>
                    {saving ? 'Saving…' : 'Save Note'}
                  </Button>
                </div>
              </form>
            ) : null}

            {documentDraft ? (
              <form onSubmit={onSubmitDocument} className="mt-4 rounded-[14px] border border-borderSoft bg-surfaceAlt p-4">
                <label className="grid gap-1.5 text-sm font-medium text-textStrong">
                  Document name
                  <Field value={documentDraft.title} onChange={(event) => onDocumentDraftChange?.({ ...documentDraft, title: event.target.value })} />
                </label>
                <label className="mt-3 grid gap-1.5 text-sm font-medium text-textStrong">
                  Requested from
                  <Field as="select" value={documentDraft.requestedFrom} onChange={(event) => onDocumentDraftChange?.({ ...documentDraft, requestedFrom: event.target.value })}>
                    <option value="client">Client</option>
                    <option value="buyer">Buyer</option>
                    <option value="seller">Seller</option>
                    <option value="attorney">Attorney Team</option>
                    <option value="agent">Agent</option>
                    <option value="bank">Bank</option>
                  </Field>
                </label>
                <label className="mt-3 grid gap-1.5 text-sm font-medium text-textStrong">
                  Description
                  <Field as="textarea" rows={3} value={documentDraft.description} onChange={(event) => onDocumentDraftChange?.({ ...documentDraft, description: event.target.value })} />
                </label>
                <div className="mt-3 flex justify-end gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => onDocumentDraftChange?.(null)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={saving || !documentDraft.title.trim()}>
                    {saving ? 'Requesting…' : 'Request Document'}
                  </Button>
                </div>
              </form>
            ) : null}
          </section>

          <section className="mt-4 rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
            <h3 className="text-sm font-semibold text-textStrong">Required Documents</h3>
            <div className="mt-3 space-y-2">
              {(lane.documentRequirements || []).slice(0, 8).map((item) => {
                const status = normalizeWorkspaceStatus(item.status)
                const meta = WORKFLOW_STATUS_META[status] || WORKFLOW_STATUS_META.not_started
                return (
                  <div key={item.id} className="flex items-start justify-between gap-3 rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm text-textStrong">{item.label}</strong>
                      <p className="mt-1 text-xs text-textMuted">{toTitle(item.category)} • {toTitle(item.requiredFrom)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${meta.border} ${meta.bg} ${meta.text}`}>
                      {toTitle(item.status || 'missing')}
                    </span>
                  </div>
                )
              })}
              {!(lane.documentRequirements || []).length ? <p className="text-sm text-textMuted">No required documents are configured for this lane.</p> : null}
            </div>
          </section>

          <section className="mt-4 rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
            <h3 className="text-sm font-semibold text-textStrong">Workflow Activity</h3>
            <div className="mt-3 space-y-2">
              {laneActivity.slice(0, 8).map((item) => (
                <article key={item.id} className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm text-textStrong">{item.title || toTitle(item.updateType || item.type || 'Workflow update')}</strong>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-textMuted">{item.message || item.body || 'Workflow update recorded.'}</p>
                    </div>
                    <span className="shrink-0 text-xs text-textMuted">{formatShortDayMonth(item.timestamp || item.createdAt)}</span>
                  </div>
                </article>
              ))}
              {!laneActivity.length ? <p className="text-sm text-textMuted">Workflow activity will appear here as the lane changes.</p> : null}
            </div>
          </section>
        </div>
      </aside>
    </div>
  )
}

function AttorneyTransactionDetail() {
  const { transactionId, workflowDetailKey } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, role: workspaceRole, workspace, workspaceType, currentMembership } = useWorkspace()
  const attorneyPermissionState = useAttorneyPermissions()
  const navigationPreviewData = useMemo(
    () => buildMatterPreviewShell(location.state?.matterPreview, transactionId),
    [location.state?.matterPreview, transactionId],
  )
  const [data, setData] = useState(() => navigationPreviewData)
  const [loading, setLoading] = useState(() => !navigationPreviewData)
  const [error, setError] = useState('')
  const [matterAccessChecked, setMatterAccessChecked] = useState(workspaceRole !== 'attorney')
  const [matterAccessAllowed, setMatterAccessAllowed] = useState(workspaceRole !== 'attorney')
  const [saving, setSaving] = useState(false)
  const [workspaceMenu, setWorkspaceMenu] = useState('overview')
  const [discussionBody, setDiscussionBody] = useState('')
  const [discussionType, setDiscussionType] = useState('operational')
  const [discussionVisibility, setDiscussionVisibility] = useState('shared')
  const [activeDocumentLibraryCategory, setActiveDocumentLibraryCategory] = useState('all')
  const [documentLibrarySearch, setDocumentLibrarySearch] = useState('')
  const [showAllRequiredDocuments, setShowAllRequiredDocuments] = useState(false)
  const [uploadInputVersion, setUploadInputVersion] = useState(0)
  const [uploadDocumentModalOpen, setUploadDocumentModalOpen] = useState(false)
  const [requestDocumentModalOpen, setRequestDocumentModalOpen] = useState(false)
  const [documentRequestSaving, setDocumentRequestSaving] = useState(false)
  const [documentRequestForm, setDocumentRequestForm] = useState({
    title: '',
    requestedFrom: 'buyer',
    visibility: 'client_visible',
    notes: '',
    priority: 'normal',
    dueDate: '',
  })
  const [documentUploadForm, setDocumentUploadForm] = useState({
    file: null,
    fileName: '',
    category: ATTORNEY_DOCUMENT_CATEGORIES[0],
    documentType: '',
    visibility: 'client_visible',
    relatedWorkflow: '',
    satisfiesRequiredDocument: 'yes',
    requiredDocumentKey: '',
    requiredDocumentId: '',
    canonicalRequirementInstanceId: '',
    documentRequestId: '',
    notes: '',
    requestTitle: '',
  })
  const [routingProfileModalOpen, setRoutingProfileModalOpen] = useState(false)
  const [routingProfileSaving, setRoutingProfileSaving] = useState(false)
  const [routingProfileError, setRoutingProfileError] = useState('')
  const [routingProfileDraft, setRoutingProfileDraft] = useState(() => buildRoutingProfileDraft())
  const uploadDraft = documentUploadForm
  const setUploadDraft = setDocumentUploadForm
  const [reviewActionDraft, setReviewActionDraft] = useState({
    open: false,
    action: '',
    document: null,
    requirement: null,
    reason: '',
  })
  const [_stakeholderMessage, setStakeholderMessage] = useState('')
  const [_inviteLinkResult, setInviteLinkResult] = useState('')
  const [roleplayerIntroBusy, setRoleplayerIntroBusy] = useState(false)
  const [roleplayerHandoffBusy, setRoleplayerHandoffBusy] = useState(false)
  const [roleplayerForm, setRoleplayerForm] = useState({
    buyerName: '',
    buyerEmail: '',
    buyerPhone: '',
    sellerName: '',
    sellerEmail: '',
    sellerPhone: '',
    agentName: '',
    agentEmail: '',
    attorneyName: '',
    attorneyEmail: '',
    bondOriginatorName: '',
    bondOriginatorEmail: '',
    matterOwner: '',
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
  const [sellerPortalBusy, setSellerPortalBusy] = useState(false)
  const [roleplayerConfirmOpen, setRoleplayerConfirmOpen] = useState(false)
  const [roleplayerConfirmError, setRoleplayerConfirmError] = useState('')
  const [roleplayerConfirmDraft, setRoleplayerConfirmDraft] = useState({
    transferAttorney: '',
    bondOriginator: '',
    bondAttorney: '',
    cancellationAttorney: '',
  })
  const [partnerSnapshot, setPartnerSnapshot] = useState(null)
  const [partnerOptionsLoading, setPartnerOptionsLoading] = useState(false)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [detailPanelKey, setDetailPanelKey] = useState('matter')
  const [hydratingDetail, setHydratingDetail] = useState(false)
  const [workflowOperations, setWorkflowOperations] = useState(null)
  const [, setWorkflowLoading] = useState(false)
  const [, setWorkflowError] = useState('')
  const [transactionRollup, setTransactionRollup] = useState(null)
  const [transactionRollupError, setTransactionRollupError] = useState('')
  const [workflowDrawerLaneKey, setWorkflowDrawerLaneKey] = useState('')
  const [workflowStepDraft, setWorkflowStepDraft] = useState(null)
  const [workflowNoteDraft, setWorkflowNoteDraft] = useState(null)
  const [workflowDocumentDraft, setWorkflowDocumentDraft] = useState(null)
  const [workflowSaving, setWorkflowSaving] = useState(false)
  const [bondHybridFinanceActionLoading, setBondHybridFinanceActionLoading] = useState('')
  const [bondApplicationPdfBusy, setBondApplicationPdfBusy] = useState(false)
  const [activityFilter, setActivityFilter] = useState('all')

  const loadData = useCallback(async ({ background = false } = {}) => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }

    const startedAt = Date.now()
    let hasCoreData = Boolean(navigationPreviewData?.transaction)
    try {
      if (!background && !hasCoreData) {
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
        if (!background) {
          setLoading(false)
        }
      }
    } catch (coreError) {
      if (hasCoreData) {
        if (!background) {
          setLoading(false)
        }
      } else {
        console.warn('[transaction-workspace] core data load deferred to full detail', {
          transactionId,
          message: coreError?.message || 'Core transaction fetch failed.',
        })
      }
    }

    try {
      setHydratingDetail(true)
      const detail = await fetchTransactionById(transactionId)
      if (detail) {
        setData(detail)
        setError('')
        console.log('[perf][transaction-workspace] full data loaded', {
          transactionId,
          durationMs: Date.now() - startedAt,
        })
      } else if (!hasCoreData) {
        setData(null)
        setError('Transaction not found.')
      }
    } catch (loadError) {
      if (!hasCoreData) {
        setError(loadError.message || 'Unable to load transaction.')
      }
    } finally {
      setHydratingDetail(false)
      setLoading(false)
    }
  }, [navigationPreviewData?.transaction, transactionId])

  useEffect(() => {
    setData(navigationPreviewData)
    setError('')
    setHydratingDetail(false)
    setWorkflowOperations(null)
    setWorkflowError('')
    setWorkflowDrawerLaneKey('')
    setLoading(!navigationPreviewData)
  }, [navigationPreviewData, transactionId])

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
  const routingDiagnostics = useMemo(
    () => (transaction ? buildTransactionRoutingDiagnostics(transaction) : null),
    [transaction],
  )
  const canEditRoutingProfile = ['attorney', 'developer', 'internal_admin', 'admin', 'agent', 'bond_originator'].includes(
    String(workspaceRole || '').trim().toLowerCase(),
  )
  const requiredDocumentChecklist = useMemo(() => data?.requiredDocumentChecklist || EMPTY_ARRAY, [data?.requiredDocumentChecklist])
  const requiredDocumentsByDocumentId = useMemo(() => {
    const map = new Map()
    for (const requirement of requiredDocumentChecklist) {
      const documentId = getRequirementDocumentId(requirement)
      if (documentId) map.set(String(documentId), requirement)
    }
    return map
  }, [requiredDocumentChecklist])
  const requiredDocumentsByCanonicalId = useMemo(() => {
    const map = new Map()
    for (const requirement of requiredDocumentChecklist) {
      const canonicalId = getRequirementCanonicalId(requirement)
      if (canonicalId) map.set(String(canonicalId), requirement)
    }
    return map
  }, [requiredDocumentChecklist])
  const getLinkedRequirementForDocument = useCallback(
    (document = {}) => {
      const canonicalId = getDocumentCanonicalId(document)
      if (canonicalId && requiredDocumentsByCanonicalId.has(String(canonicalId))) {
        return requiredDocumentsByCanonicalId.get(String(canonicalId))
      }
      if (document?.id && requiredDocumentsByDocumentId.has(String(document.id))) {
        return requiredDocumentsByDocumentId.get(String(document.id))
      }
      return null
    },
    [requiredDocumentsByCanonicalId, requiredDocumentsByDocumentId],
  )
  const transactionDiscussion = data?.transactionDiscussion ?? EMPTY_ARRAY
  const canViewInternalDiscussion =
    workspaceRole !== 'attorney' || attorneyPermissionState.hasPermission('can_view_internal_comments')
  const canPostSharedDiscussion =
    workspaceRole !== 'attorney' || attorneyPermissionState.hasPermission('can_comment_shared')
  const canPostInternalDiscussion =
    workspaceRole !== 'attorney' || attorneyPermissionState.hasPermission('can_comment_internal')
  const canPublishClientVisibleDiscussion =
    workspaceRole !== 'attorney' || attorneyPermissionState.hasPermission('can_publish_client_visible_updates')
  const availableDiscussionVisibilityOptions = useMemo(
    () =>
      DISCUSSION_VISIBILITY_OPTIONS.filter((item) => {
        if (item.key === 'internal') return canPostInternalDiscussion
        if (item.key === 'shared') return canPostSharedDiscussion
        if (item.key === 'client_visible') return canPublishClientVisibleDiscussion
        return true
      }),
    [canPostInternalDiscussion, canPostSharedDiscussion, canPublishClientVisibleDiscussion],
  )
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
  const documentRequests = data?.documentRequests ?? EMPTY_ARRAY
  const additionalDocumentRequests = useMemo(
    () =>
      (documentRequests || []).filter((request) => {
        const category = String(request?.category || '').trim().toLowerCase()
        return request?.requestType === 'additional_document_request' || category === 'additional requests'
      }),
    [documentRequests],
  )
  const transactionFinanceWorkflow = data?.transactionFinanceWorkflow || null
  const transactionParticipants = data?.transactionParticipants ?? EMPTY_ARRAY
  const rawTransactionRolePlayers = data?.transactionRolePlayers || data?.rolePlayers || data?.transaction_role_players
  const transactionRolePlayers = Array.isArray(rawTransactionRolePlayers) ? rawTransactionRolePlayers.filter(Boolean) : EMPTY_ARRAY
  const isAgentTransactionView = workspaceRole === 'agent'
  const workspaceOrganisationId =
    workspace?.id ||
    currentMembership?.workspaceId ||
    currentMembership?.organisationId ||
    currentMembership?.organisation_id ||
    transaction?.organisation_id ||
    ''
  const partnerAccessContext = useMemo(
    () => ({
      organisationId: workspaceOrganisationId,
      role: workspaceRole,
      profile,
      currentMembership,
    }),
    [currentMembership, profile, workspaceOrganisationId, workspaceRole],
  )
  const activeLegalWorkflowDetailKey = normalizeLegalWorkflowDetailKey(workflowDetailKey)
  const canManageTransactionRoleplayers = ['agent', 'agency_admin', 'principal', 'admin', 'internal_admin', 'developer'].includes(String(workspaceRole || '').toLowerCase())
  const canRequestTransactionDocuments =
    workspaceRole === 'bond_originator' ||
    workspaceRole === 'attorney' ||
    canPostSharedDiscussion ||
    canManageTransactionRoleplayers
  const requestedWorkspaceMenu = useMemo(() => {
    if (activeLegalWorkflowDetailKey) return 'transfer'
    if (workspaceRole === 'bond_originator' && (workspaceMenu === 'finance' || workspaceMenu === 'bond')) return 'banks_quotes'
    if (workspaceMenu === 'financials' || workspaceMenu === 'bond') return 'finance'
    if (workspaceMenu === 'cancellation') return 'transfer'
    if (isAgentTransactionView && (workspaceMenu === 'parties' || workspaceMenu === 'tasks' || workspaceMenu === 'buyer' || workspaceMenu === 'seller')) {
      return 'overview'
    }
    return workspaceMenu
  }, [activeLegalWorkflowDetailKey, isAgentTransactionView, workspaceMenu, workspaceRole])
  const availableWorkspaceTabs = workspaceRole === 'bond_originator'
    ? BOND_ORIGINATOR_WORKSPACE_TABS
    : isAgentTransactionView
      ? AGENT_WORKSPACE_TABS
      : ATTORNEY_WORKSPACE_TABS
  const activeWorkspaceMenu = availableWorkspaceTabs.some((tab) => tab.id === requestedWorkspaceMenu) ? requestedWorkspaceMenu : 'overview'

  useEffect(() => {
    let active = true

    async function loadTransactionRollupState() {
      if (!USE_TRANSACTION_ROLLUP_OVERVIEW || !transaction?.id) {
        if (!active) return
        setTransactionRollup(null)
        setTransactionRollupError('')
        return
      }

      try {
        const rollup = await getTransactionRollup(transaction.id, { actorRole: workspaceRole })
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
  }, [transaction?.current_main_stage, transaction?.id, transaction?.stage, transaction?.updated_at, workspaceRole])

  useEffect(() => {
    if (!availableDiscussionVisibilityOptions.length) return
    if (availableDiscussionVisibilityOptions.some((item) => item.key === discussionVisibility)) return
    setDiscussionVisibility(availableDiscussionVisibilityOptions[0].key)
  }, [availableDiscussionVisibilityOptions, discussionVisibility])

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

  useEffect(() => {
    if (!isAgentTransactionView || !workspaceOrganisationId) {
      setPartnerSnapshot(null)
      return
    }

    let active = true
    async function loadPartnerDefaults() {
      try {
        setPartnerOptionsLoading(true)
        const snapshot = await fetchPartnersSnapshot({
          organisationId: workspaceOrganisationId,
          workspaceType: workspaceType || workspaceRole,
          accessContext: partnerAccessContext,
        })
        if (active) setPartnerSnapshot(snapshot)
      } catch (partnerLoadError) {
        console.warn('[AttorneyTransactionDetail] scoped partner defaults unavailable', partnerLoadError)
      } finally {
        if (active) setPartnerOptionsLoading(false)
      }
    }

    void loadPartnerDefaults()
    return () => {
      active = false
    }
  }, [isAgentTransactionView, partnerAccessContext, workspaceOrganisationId, workspaceRole, workspaceType])

  const mainStage = useMemo(
    () => data?.mainStage || getMainStageFromDetailedStage(transaction?.stage || 'Available'),
    [data?.mainStage, transaction?.stage],
  )
  const transactionKind = normalizeTransactionKind(transaction)
  const isPrivateMatter = transactionKind === 'private'
  const buyerDisplayName = useMemo(
    () => resolveBuyerDisplayName({
      buyer,
      transaction,
      onboardingFormData: data?.onboardingFormData || null,
      participants: transactionParticipants,
    }),
    [buyer, data?.onboardingFormData, transaction, transactionParticipants],
  )
  const buyerEmail = useMemo(() => {
    const buyerParticipant = transactionParticipants.find((participant) => participant?.roleType === 'buyer')
    return cleanDetailEmail(
      buyer?.email ||
      roleplayerForm.buyerEmail ||
      transaction?.buyer_email ||
      transaction?.client_email ||
      data?.onboardingFormData?.buyerEmail ||
      data?.onboardingFormData?.email ||
      buyerParticipant?.participantEmail ||
      '',
    )
  }, [buyer?.email, data?.onboardingFormData, roleplayerForm.buyerEmail, transaction?.buyer_email, transaction?.client_email, transactionParticipants])
  const sellerDisplayName = useMemo(() => {
    const sellerParticipant = transactionParticipants.find((participant) => participant?.roleType === 'seller')
    return (
      cleanDetailText(transaction?.seller_name) ||
      cleanDetailText(roleplayerForm.sellerName) ||
      cleanDetailText(sellerParticipant?.participantName) ||
      'Seller details pending'
    )
  }, [roleplayerForm.sellerName, transaction?.seller_name, transactionParticipants])
  const sellerEmail = useMemo(() => {
    const sellerParticipant = transactionParticipants.find((participant) => participant?.roleType === 'seller')
    return cleanDetailEmail(
      transaction?.seller_email ||
      roleplayerForm.sellerEmail ||
      sellerParticipant?.participantEmail ||
      '',
    )
  }, [roleplayerForm.sellerEmail, transaction?.seller_email, transactionParticipants])
  const mainStageLabel = MAIN_STAGE_LABELS[mainStage] || toTitle(transaction?.stage || 'Available')
  const matterTypeLabel = isPrivateMatter ? 'Private Matter' : 'Development Matter'
  const onboardingLifecycleStatus = String(transaction?.onboarding_status || '').trim().toLowerCase()
  const onboardingRecordStatus = String(data?.onboarding?.status || '').trim().toLowerCase()
  const onboardingCompleted =
    onboardingLifecycleStatus === 'client_onboarding_complete' ||
    Boolean(transaction?.onboarding_completed_at) ||
    ['submitted', 'reviewed', 'approved', 'completed'].includes(onboardingRecordStatus)
  const normalizedFinanceType = normalizeFinanceType(transaction?.finance_type, { allowUnknown: true })
  const hasCapturedFinancials =
    onboardingCompleted ||
    Boolean(
      transaction?.purchase_price ||
      transaction?.sales_price ||
      transaction?.bond_amount ||
      transaction?.deposit_amount ||
      transaction?.reservation_amount ||
      transaction?.reservation_deposit_amount ||
      transaction?.target_registration_date ||
      transaction?.expected_transfer_date ||
      normalizedFinanceType !== 'unknown',
    )
  const shouldShowDepositCard = useMemo(() => {
    const reservationAmount = Number(
      transaction?.reservation_amount ||
      transaction?.reservation_deposit_amount ||
      transaction?.deposit_amount ||
      0,
    )
    const reservationRequired = Boolean(
      transaction?.reservation_required ||
      transaction?.reservation_deposit_required ||
      transaction?.deposit_required,
    )
    return transactionKind === 'development' && (reservationRequired || reservationAmount > 0)
  }, [
    transaction?.deposit_amount,
    transaction?.deposit_required,
    transaction?.reservation_amount,
    transaction?.reservation_deposit_amount,
    transaction?.reservation_deposit_required,
    transaction?.reservation_required,
    transactionKind,
  ])
  const hasCapturedFinanceType = hasCapturedFinancials && normalizedFinanceType !== 'unknown'
  const financeTypeLabel = hasCapturedFinanceType ? toTitle(normalizedFinanceType) : 'Not captured'
  const isBondOrHybridFinance = hasCapturedFinanceType && isBondFinanceType(normalizedFinanceType)
  const financeRequiresBondSupport = hasCapturedFinanceType && isBondOrHybridFinance
  const displayPurchasePriceValue = hasCapturedFinancials ? Number(transaction?.purchase_price || transaction?.sales_price || 0) : 0
  const bondAmountFallback = hasCapturedFinanceType ? (financeRequiresBondSupport ? 'Pending' : 'N/A') : 'Not captured'
  const propertyAddress = buildPropertyAddress(transaction)
  const matterHeadline = !isPrivateMatter
    ? `${development?.name || 'Development'}${unit?.unit_number ? ` • Unit ${unit.unit_number}` : ''}`
    : transaction?.property_description || transaction?.property_address_line_1 || 'Private Property Transaction'
  const workspaceReference = formatRoleFriendlyReference(transaction, workspaceRole)
  const workspaceBackPath = workspaceRole === 'bond_originator' ? '/bond/applications' : '/transactions'
  const workspaceBackLabel = workspaceRole === 'bond_originator' ? 'Back to Applications' : 'Back to Transactions'
  const transactionWorkspaceBasePath = location.pathname.startsWith('/bond/files/')
    ? `/bond/files/${transactionId}`
    : `/transactions/${transactionId}`
  const transferStageKey = getAttorneyTransferStage({ transaction, stage: transaction?.stage, unit, development })
  const transferStageLabel = stageLabelFromAttorneyKey(transferStageKey)
  const lifecycleState = normalizeLifecycleState(
    transaction?.lifecycle_state || (transferStageKey === 'registered' ? 'registered' : 'active'),
  )
  const lifecycleLabel = getLifecycleStateLabel(lifecycleState)
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
  const financeReadinessHandoff = useMemo(
    () =>
      buildFinanceReadinessHandoffPacket({
        transaction,
        onboardingFormData: data?.onboardingFormData || {},
        documentSummary: {
          totalRequired: requiredDocumentChecklist.length,
          uploadedCount: documents.length,
        },
      }),
    [data?.onboardingFormData, documents.length, requiredDocumentChecklist.length, transaction],
  )
  const financeReadinessDashboard = useMemo(
    () =>
      getFinanceReadiness(transaction?.id || workspaceReference, {
        transaction,
        onboardingFormData: data?.onboardingFormData || {},
        documents,
        requiredDocumentChecklist,
        documentSummary: {
          totalRequired: requiredDocumentChecklist.length,
          uploadedCount: documents.length,
        },
      }),
    [data?.onboardingFormData, documents, requiredDocumentChecklist, transaction, workspaceReference],
  )
  const workspaceMenuTabs = availableWorkspaceTabs.map((tab) => {
    if (tab.id === 'parties') {
      return { ...tab, meta: `${transactionParticipants.length} parties` }
    }
    if (tab.id === 'documents') {
      return { ...tab, meta: `${documents.length} files` }
    }
    if (tab.id === 'application') {
      return { ...tab, meta: onboardingCompleted ? 'Onboarding complete' : 'Review' }
    }
    if (tab.id === 'banks_quotes') {
      return { ...tab, meta: `${transactionFinanceWorkflow?.applications?.length || 0} banks` }
    }
    if (tab.id === 'finance') {
      return { ...tab, meta: financeTypeLabel }
    }
    if (tab.id === 'tasks') {
      return { ...tab, meta: 'Action hub' }
    }
    if (tab.id === 'activity') {
      return { ...tab, meta: `${visibleTransactionDiscussion.length + transactionEvents.length} updates` }
    }
    if (tab.id === 'transfer') {
      return { ...tab, meta: transferStageLabel }
    }
    return { ...tab, meta: transferStageLabel }
  })

  const groupedDocuments = useMemo(() => {
    const groups = ATTORNEY_DOCUMENT_GROUPS.reduce((accumulator, group) => {
      accumulator[group.key] = []
      return accumulator
    }, {})
    const seenDocumentIds = new Set()

    for (const document of documents) {
      const linkedRequirement = getLinkedRequirementForDocument(document)
      const currentRequirementDocumentId = linkedRequirement ? getRequirementDocumentId(linkedRequirement) : null
      if (currentRequirementDocumentId && document?.id && String(currentRequirementDocumentId) !== String(document.id)) {
        continue
      }
      const category = ATTORNEY_DOCUMENT_CATEGORIES.includes(document?.category)
        ? document.category
        : linkedRequirement
          ? getAttorneyCategoryForRequiredDocument(linkedRequirement)
          : 'Internal Working Documents'
      const groupKey = getAttorneyDocumentGroupKey(category)
      const normalizedDocument = { ...document, normalizedCategory: category, linkedRequirement }
      const documentKey = String(document?.id || `${document?.name || ''}:${document?.file_path || ''}`)
      if (seenDocumentIds.has(documentKey)) continue
      seenDocumentIds.add(documentKey)
      groups.all_documents.push(normalizedDocument)
      groups[groupKey].push(normalizedDocument)
    }

    return groups
  }, [documents, getLinkedRequirementForDocument])
  const requirementDocumentLookup = useMemo(() => {
    const byCanonicalId = new Map()
    const byDocumentId = new Map()
    for (const document of documents) {
      const linkedRequirement = getLinkedRequirementForDocument(document)
      const canonicalId = getRequirementCanonicalId(linkedRequirement)
      if (canonicalId && !byCanonicalId.has(String(canonicalId))) {
        byCanonicalId.set(String(canonicalId), document)
      }
      if (document?.id && !byDocumentId.has(String(document.id))) {
        byDocumentId.set(String(document.id), document)
      }
    }
    return { byCanonicalId, byDocumentId }
  }, [documents, getLinkedRequirementForDocument])
  const requiredDocumentRows = useMemo(
    () =>
      requiredDocumentChecklist.map((requirement) => {
        const canonicalId = getRequirementCanonicalId(requirement)
        const uploadedDocumentId = getRequirementDocumentId(requirement)
        const linkedDocument =
          (canonicalId ? requirementDocumentLookup.byCanonicalId.get(String(canonicalId)) : null) ||
          (uploadedDocumentId ? requirementDocumentLookup.byDocumentId.get(String(uploadedDocumentId)) : null) ||
          requirement?.matchedDocument ||
          null
        const status = normalizeDocumentCommandStatus(requirement?.status || linkedDocument?.review_status || linkedDocument?.status, {
          hasDocument: Boolean(linkedDocument || uploadedDocumentId),
        })
        const category = resolveRequirementLibraryCategory(requirement)
        const priority = getDocumentPriorityLabel(requirement)

        return {
          id: String(canonicalId || requirement?.id || requirement?.key || requirement?.documentKey || requirement?.document_key),
          transactionId: transaction?.id || requirement?.transactionId || requirement?.transaction_id || '',
          displayName: requirement?.label || requirement?.documentLabel || requirement?.document_label || requirement?.key || 'Document requirement',
          category,
          categoryLabel: getDocumentCommandCategoryLabel(category),
          status,
          statusLabel: getDocumentCommandStatusLabel(status),
          priority,
          blocksStage: Boolean(requirement?.isBlocking || requirement?.blocksStage || requirement?.blocks_stage),
          requiredParty: getRequirementPartyLabel(requirement),
          relatedWorkflow: requirement?.owningWorkflow || requirement?.workflow || requirement?.visibleSection || '',
          requiredDocumentId: requirement?.id || null,
          requiredDocumentKey: requirement?.key || requirement?.documentKey || requirement?.document_key || '',
          canonicalRequirementInstanceId: canonicalId || '',
          fileUrl: linkedDocument?.url || '',
          requirement,
          linkedDocument,
          source: 'transaction_required_documents',
          satisfiesRequirement: Boolean(linkedDocument || uploadedDocumentId),
        }
      }),
    [requiredDocumentChecklist, requirementDocumentLookup, transaction?.id],
  )
  const displayedRequiredDocumentRows = useMemo(
    () => (showAllRequiredDocuments ? requiredDocumentRows : requiredDocumentRows.slice(0, 5)),
    [requiredDocumentRows, showAllRequiredDocuments],
  )
  const documentHealthSummary = useMemo(() => {
    const totalRequired = requiredDocumentRows.length
    const received = requiredDocumentRows.filter((row) => ['uploaded', 'pending_review', 'verified', 'generated'].includes(row.status)).length
    const missing = requiredDocumentRows.filter((row) => ['missing', 'requested', 'rejected', 'expired'].includes(row.status)).length
    const pendingReview = requiredDocumentRows.filter((row) => row.status === 'pending_review').length
    return { totalRequired, received, missing, pendingReview }
  }, [requiredDocumentRows])
  const allDocumentLibraryRows = useMemo(
    () =>
      uniqueDocumentsByRenderKey(documents)
        .filter((document) => !document?.archived_at)
        .map((document) => {
          const linkedRequirement = getLinkedRequirementForDocument(document)
          const category = resolveDocumentLibraryCategory({ ...document, linkedRequirement })
          const rawStatus =
            document?.source === 'generated' || category === 'generated'
              ? 'generated'
              : document?.review_status || document?.status || linkedRequirement?.status || 'uploaded'

          return {
            id: String(document?.id || `${document?.name || ''}:${document?.file_path || ''}`),
            transactionId: transaction?.id || document?.transaction_id || document?.transactionId || '',
            displayName: document?.name || document?.displayName || 'Untitled document',
            category,
            categoryLabel: getDocumentCommandCategoryLabel(category),
            status: normalizeDocumentCommandStatus(rawStatus, { hasDocument: true }),
            visibility: resolveDocumentLibraryVisibility(document),
            requiredParty: linkedRequirement ? getRequirementPartyLabel(linkedRequirement) : '',
            uploadedBy: resolveUploadedByLabel(document, transactionParticipants),
            uploadedAt: document?.created_at || document?.uploaded_at || document?.uploadedAt || '',
            updatedAt: document?.updated_at || document?.updatedAt || document?.created_at || '',
            source: document?.source || (category === 'generated' ? 'generated' : 'documents'),
            fileUrl: document?.url || '',
            relatedWorkflow: resolveDocumentWorkflowLabel(document),
            requiredDocumentId: linkedRequirement?.id || null,
            requiredDocumentKey: linkedRequirement?.key || document?.document_type || '',
            requiredDocument: linkedRequirement,
            requiredDocumentStatus: linkedRequirement?.status || '',
            requiredDocumentCanonicalId: getRequirementCanonicalId(linkedRequirement) || getDocumentCanonicalId(document) || '',
            documentRequestId: document?.document_request_id || document?.documentRequestId || '',
            satisfiesRequirement: Boolean(linkedRequirement),
            priority: linkedRequirement ? getDocumentPriorityLabel(linkedRequirement) : '',
            blocksStage: Boolean(linkedRequirement?.isBlocking || linkedRequirement?.blocksStage || linkedRequirement?.blocks_stage),
            raw: document,
          }
        }),
    [documents, getLinkedRequirementForDocument, transaction?.id, transactionParticipants],
  )
  const activeStakeholders = useMemo(
    () => transactionParticipants.filter((item) => item?.stakeholderStatus !== 'removed'),
    [transactionParticipants],
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
  const assignedAgent = useMemo(
    () => activeStakeholders.find((item) => item?.roleType === 'agent') || null,
    [activeStakeholders],
  )
  const assignedBondOriginator = useMemo(
    () => activeStakeholders.find((item) => item?.roleType === 'bond_originator') || null,
    [activeStakeholders],
  )
  const savedTransferRoleplayer = useMemo(
    () => transactionRolePlayers.find((item) => item?.roleType === 'transfer_attorney' || item?.role_type === 'transfer_attorney') || null,
    [transactionRolePlayers],
  )
  const savedBondOriginatorRoleplayer = useMemo(
    () => transactionRolePlayers.find((item) => item?.roleType === 'bond_originator' || item?.role_type === 'bond_originator') || null,
    [transactionRolePlayers],
  )
  const savedBondAttorneyRoleplayer = useMemo(
    () => transactionRolePlayers.find((item) => item?.roleType === 'bond_attorney' || item?.role_type === 'bond_attorney') || null,
    [transactionRolePlayers],
  )
  const attorneyPartnerOptions = useMemo(
    () =>
      getPartnerAssignmentOptions(partnerSnapshot || {}, 'transfer_attorney', partnerAccessContext)
        .map((option) => buildPartnerRoleplayerOption(option, 'transfer_attorney')),
    [partnerAccessContext, partnerSnapshot],
  )
  const bondOriginatorPartnerOptions = useMemo(
    () =>
      getPartnerAssignmentOptions(partnerSnapshot || {}, 'bond_originator', partnerAccessContext)
        .map((option) => buildPartnerRoleplayerOption(option, 'bond_originator')),
    [partnerAccessContext, partnerSnapshot],
  )
  const transferAttorneyOptions = useMemo(
    () =>
      dedupeRoleplayerOptions([
        buildExistingRoleplayerOption(savedTransferRoleplayer, 'transfer_attorney'),
        buildExistingRoleplayerOption(transferAttorney, 'transfer_attorney'),
        transaction?.attorney || transaction?.assigned_attorney_email
          ? buildExistingRoleplayerOption(
              {
                partnerName: transaction?.attorney,
                emailAddress: transaction?.assigned_attorney_email,
              },
              'transfer_attorney',
            )
          : null,
        ...attorneyPartnerOptions,
      ]),
    [attorneyPartnerOptions, savedTransferRoleplayer, transaction?.assigned_attorney_email, transaction?.attorney, transferAttorney],
  )
  const bondOriginatorOptions = useMemo(
    () =>
      dedupeRoleplayerOptions([
        buildExistingRoleplayerOption(savedBondOriginatorRoleplayer, 'bond_originator'),
        buildExistingRoleplayerOption(assignedBondOriginator, 'bond_originator'),
        transaction?.bond_originator || transaction?.assigned_bond_originator_email
          ? buildExistingRoleplayerOption(
              {
                partnerName: transaction?.bond_originator,
                emailAddress: transaction?.assigned_bond_originator_email,
              },
              'bond_originator',
            )
          : null,
        ...bondOriginatorPartnerOptions,
      ]),
    [assignedBondOriginator, bondOriginatorPartnerOptions, savedBondOriginatorRoleplayer, transaction?.assigned_bond_originator_email, transaction?.bond_originator],
  )
  const bondAttorneyOptions = useMemo(
    () =>
      dedupeRoleplayerOptions([
        buildExistingRoleplayerOption(savedBondAttorneyRoleplayer, 'bond_attorney'),
        buildExistingRoleplayerOption(bondAttorney, 'bond_attorney'),
        ...attorneyPartnerOptions.map((option) => ({ ...option, roleType: 'bond_attorney' })),
      ]),
    [attorneyPartnerOptions, bondAttorney, savedBondAttorneyRoleplayer],
  )
  const cancellationAttorneyOptions = useMemo(
    () =>
      dedupeRoleplayerOptions([
        buildExistingRoleplayerOption(cancellationAttorney, 'cancellation_attorney'),
        ...attorneyPartnerOptions.map((option) => ({ ...option, roleType: 'cancellation_attorney' })),
      ]),
    [attorneyPartnerOptions, cancellationAttorney],
  )
  const activityFeed = useMemo(
    () =>
      [
        ...transactionEvents.map((event) => humanizeTransactionEvent(event)),
        ...visibleTransactionDiscussion.map((comment) => humanizeDiscussionActivity(comment)),
      ].sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()),
    [transactionEvents, visibleTransactionDiscussion],
  )
  const documentRecentActivity = useMemo(
    () => activityFeed.filter((entry) => isDocumentActivityEntry(entry)).slice(0, 4),
    [activityFeed],
  )
  const overviewConversationEntries = useMemo(() => activityFeed.slice(0, 8), [activityFeed])
  const lifecycleProgressState = useMemo(
    () =>
      resolveTransactionProgress({
        transaction,
        requiredDocumentChecklist,
        documents,
        transactionFinanceWorkflow,
        transactionEvents,
        transferStageKey,
        onboardingCompleted,
        isPrivateMatter,
      }),
    [
      documents,
      isPrivateMatter,
      onboardingCompleted,
      requiredDocumentChecklist,
      transaction,
      transactionEvents,
      transactionFinanceWorkflow,
      transferStageKey,
    ],
  )
  const overviewPrimaryNextAction = useMemo(
    () =>
      USE_TRANSACTION_ROLLUP_OVERVIEW && transactionRollup
        ? buildOverviewPrimaryNextActionFromRollup({
            rollup: transactionRollup,
            transaction,
          })
        : resolveTransactionNextAction({
            transaction,
            progressState: lifecycleProgressState,
            buyerEmail,
            sellerEmail,
            onboardingCompleted,
            isPrivateMatter,
            transferAttorney,
            documentRequests,
          }),
    [
      buyerEmail,
      documentRequests,
      isPrivateMatter,
      lifecycleProgressState,
      onboardingCompleted,
      sellerEmail,
      transactionRollup,
      transaction,
      transferAttorney,
    ],
  )
  const roleplayerIntroEvents = useMemo(
    () =>
      [...transactionEvents]
        .filter((event) => String(event?.eventType || event?.event_type || '').toLowerCase() === 'roleplayerintroemailsent')
        .sort((left, right) => new Date(right?.createdAt || right?.created_at || 0).getTime() - new Date(left?.createdAt || left?.created_at || 0).getTime()),
    [transactionEvents],
  )
  const latestRoleplayerIntroEvent = roleplayerIntroEvents[0] || null
  const roleplayerHandoffEvents = useMemo(
    () =>
      [...transactionEvents]
        .filter((event) => String(event?.eventType || event?.event_type || '').toLowerCase() === 'roleplayerhandoffemailsent')
        .sort((left, right) => new Date(right?.createdAt || right?.created_at || 0).getTime() - new Date(left?.createdAt || left?.created_at || 0).getTime()),
    [transactionEvents],
  )
  const latestRoleplayerHandoffEvent = roleplayerHandoffEvents[0] || null
  const roleplayerReadiness = useMemo(() => {
    const hasBuyerEmail = Boolean(roleplayerForm.buyerEmail.trim())
    const hasBuyerName = Boolean(roleplayerForm.buyerName.trim())
    const hasAgentContact = Boolean(roleplayerForm.agentName.trim() || roleplayerForm.agentEmail.trim() || assignedAgent)
    const hasTransferAttorney = Boolean(roleplayerForm.attorneyName.trim() || roleplayerForm.attorneyEmail.trim() || transferAttorney)
    const hasTransferAttorneyEmail = Boolean(roleplayerForm.attorneyEmail.trim() || transferAttorney?.participantEmail)
    const hasBondOriginator = Boolean(roleplayerForm.bondOriginatorName.trim() || roleplayerForm.bondOriginatorEmail.trim() || assignedBondOriginator)
    const hasBondOriginatorEmail = Boolean(roleplayerForm.bondOriginatorEmail.trim() || assignedBondOriginator?.participantEmail)
    const hasCancellationAttorney = Boolean(cancellationAttorney)
    const currentTransferAttorneyName = roleplayerForm.attorneyName.trim() || transferAttorney?.participantName || ''
    const currentTransferAttorneyEmail = roleplayerForm.attorneyEmail.trim() || transferAttorney?.participantEmail || ''
    const currentBondOriginatorName = roleplayerForm.bondOriginatorName.trim() || assignedBondOriginator?.participantName || ''
    const currentBondOriginatorEmail = roleplayerForm.bondOriginatorEmail.trim() || assignedBondOriginator?.participantEmail || ''
    const currentAgentName = roleplayerForm.agentName.trim() || assignedAgent?.participantName || ''
    const currentAgentEmail = roleplayerForm.agentEmail.trim() || assignedAgent?.participantEmail || ''
    const latestIntroData = latestRoleplayerIntroEvent ? getActivityEventData(latestRoleplayerIntroEvent) : {}
    const latestHandoffData = latestRoleplayerHandoffEvent ? getActivityEventData(latestRoleplayerHandoffEvent) : {}
    const handoffRecipients = Array.isArray(latestHandoffData.recipients) ? latestHandoffData.recipients : []
    const handoffTransferEmail = latestHandoffData.transferAttorneyEmail ||
      handoffRecipients.find((item) => item?.role === 'transfer_attorney')?.email ||
      ''
    const handoffBondEmail = latestHandoffData.bondOriginatorEmail ||
      handoffRecipients.find((item) => item?.role === 'bond_originator')?.email ||
      ''
    const introOutdated = Boolean(
      latestRoleplayerIntroEvent &&
        [
          [latestIntroData.transferAttorneyName, currentTransferAttorneyName],
          [latestIntroData.transferAttorneyEmail, currentTransferAttorneyEmail],
          [latestIntroData.bondOriginatorName, currentBondOriginatorName],
          [latestIntroData.bondOriginatorEmail, currentBondOriginatorEmail],
          [latestIntroData.agentName, currentAgentName],
          [latestIntroData.agentEmail, currentAgentEmail],
        ].some(([previous, current]) => normalizeComparableContact(previous) !== normalizeComparableContact(current)),
    )
    const handoffOutdated = Boolean(
      latestRoleplayerHandoffEvent &&
        [
          [latestHandoffData.transferAttorneyName, currentTransferAttorneyName],
          [handoffTransferEmail, currentTransferAttorneyEmail],
          [latestHandoffData.bondOriginatorName, currentBondOriginatorName],
          [handoffBondEmail, currentBondOriginatorEmail],
          [latestHandoffData.agentName, currentAgentName],
          [latestHandoffData.agentEmail, currentAgentEmail],
        ].some(([previous, current]) => normalizeComparableContact(previous) !== normalizeComparableContact(current)),
    )
    const items = [
      {
        key: 'buyer_email',
        label: 'Buyer email captured',
        description: 'Required before Bridge can send the introduction email.',
        complete: hasBuyerEmail,
        required: true,
      },
      {
        key: 'transfer_attorney',
        label: 'Transfer attorney selected',
        description: 'Required because every sale needs a clear transfer owner.',
        complete: hasTransferAttorney,
        required: true,
      },
      financeRequiresBondSupport
        ? {
            key: 'bond_originator',
            label: 'Bond originator selected',
            description: 'Required because this buyer is using bond or hybrid finance support.',
            complete: hasBondOriginator,
            required: true,
          }
        : {
            key: 'cash_finance',
            label: 'Finance path noted',
            description: 'Cash transactions do not need a bond originator before the buyer intro.',
            complete: true,
            required: false,
          },
      transaction?.seller_has_existing_bond
        ? {
            key: 'cancellation_attorney',
            label: 'Cancellation attorney assigned',
            description: 'Required before transfer handoff because the seller has an existing bond.',
            complete: hasCancellationAttorney,
            required: true,
          }
        : {
            key: 'cancellation_not_required',
            label: 'Cancellation attorney not required yet',
            description: 'Only needed if an existing seller bond is confirmed.',
            complete: true,
            required: false,
          },
      {
        key: 'agent_contact',
        label: 'Agent contact available',
        description: 'Recommended so the buyer knows who coordinates sale-related questions.',
        complete: hasAgentContact,
        required: false,
      },
      {
        key: 'buyer_name',
        label: 'Buyer name captured',
        description: 'Recommended for a warmer email greeting and cleaner transaction record.',
        complete: hasBuyerName,
        required: false,
      },
      {
        key: 'buyer_intro_sent',
        label: introOutdated ? 'Buyer intro needs resend' : 'Buyer intro sent',
        description: introOutdated
          ? 'Roleplayer details changed after the buyer introduction was sent.'
          : 'Shows whether the transaction team has already been introduced to the buyer.',
        complete: Boolean(latestRoleplayerIntroEvent) && !introOutdated,
        required: false,
      },
      {
        key: 'team_handoff_sent',
        label: handoffOutdated ? 'Team handoff needs resend' : 'Team handoff sent',
        description: handoffOutdated
          ? 'Provider details changed after the team handoff was sent.'
          : 'Shows whether the transfer and finance roleplayers have received the transaction context.',
        complete: Boolean(latestRoleplayerHandoffEvent) && !handoffOutdated,
        required: false,
      },
    ].filter(Boolean)
    const requiredItems = items.filter((item) => item.required)
    const completedRequired = requiredItems.filter((item) => item.complete).length
    const completedAll = items.filter((item) => item.complete).length
    const percent = items.length ? Math.round((completedAll / items.length) * 100) : 100
    const blockers = requiredItems.filter((item) => !item.complete)
    const recommended = items.filter((item) => !item.required && !item.complete)
    const canSendIntro = blockers.length === 0
    const teamHandoffBlockers = [
      !hasTransferAttorneyEmail ? 'Transfer attorney email' : '',
      financeRequiresBondSupport && !hasBondOriginatorEmail ? 'Bond originator email' : '',
    ].filter(Boolean)
    const canSendTeamHandoff = teamHandoffBlockers.length === 0
    return {
      items,
      blockers,
      recommended,
      teamHandoffBlockers,
      percent,
      completedRequired,
      requiredCount: requiredItems.length,
      canSendIntro,
      canSendTeamHandoff,
      introOutdated,
      handoffOutdated,
      statusLabel: blockers.length ? 'Needs attention' : introOutdated || handoffOutdated ? 'Needs resend' : latestRoleplayerIntroEvent ? 'Intro sent' : 'Ready to send',
    }
  }, [
    assignedAgent,
    assignedBondOriginator,
    cancellationAttorney,
    financeRequiresBondSupport,
    latestRoleplayerHandoffEvent,
    latestRoleplayerIntroEvent,
    roleplayerForm.agentEmail,
    roleplayerForm.agentName,
    roleplayerForm.attorneyEmail,
    roleplayerForm.attorneyName,
    roleplayerForm.bondOriginatorEmail,
    roleplayerForm.bondOriginatorName,
    roleplayerForm.buyerEmail,
    roleplayerForm.buyerName,
    transaction?.seller_has_existing_bond,
    transferAttorney,
  ])
  const workflowLanes = useMemo(
    () => (Array.isArray(workflowOperations?.lanes) ? workflowOperations.lanes : EMPTY_ARRAY),
    [workflowOperations?.lanes],
  )
  const workflowBlockedCount = workflowLanes.filter((lane) => getWorkflowHealthKey(lane) === 'blocked').length
  const workflowWaitingCount = workflowLanes.filter((lane) => getWorkflowHealthKey(lane) === 'waiting').length
  const workflowDelayedCount = workflowLanes.filter((lane) => getWorkflowHealthKey(lane) === 'delayed').length
  const matterHealthLabel = workflowBlockedCount ? 'Blocked' : workflowDelayedCount ? 'Attention' : workflowWaitingCount ? 'Waiting' : 'On Track'
  const matterHealthMeta = matterHealthLabel === 'Blocked'
    ? WORKFLOW_STATUS_META.blocked
    : matterHealthLabel === 'Attention'
      ? WORKFLOW_STATUS_META.delayed
      : matterHealthLabel === 'Waiting'
        ? WORKFLOW_STATUS_META.waiting
        : WORKFLOW_STATUS_META.in_progress
  const canEditBondHybridFinanceWorkflow = ['bond_originator', 'internal_admin', 'admin'].includes(
    String(workspaceRole || '').toLowerCase(),
  )
  const configuredOriginatorBanks = useMemo(
    () =>
      workspaceRole === 'bond_originator'
        ? getBankPanelForCurrentUser(
            { workspace, currentWorkspace: workspace, currentMembership, profile, workspaceId: workspaceOrganisationId },
            { workspaceId: workspaceOrganisationId },
          )
        : [],
    [currentMembership, profile, workspace, workspaceOrganisationId, workspaceRole],
  )
  const bondSubmissionRows = useMemo(
    () => buildConfiguredBankRows({ workflowData: transactionFinanceWorkflow, bankPanel: configuredOriginatorBanks }),
    [configuredOriginatorBanks, transactionFinanceWorkflow],
  )
  const documentReadiness = useMemo(
    () =>
      getDocumentReadiness({
        applicationId: transaction?.bond_application_id || transaction?.bondApplicationId || transaction?.id || null,
        requiredDocumentRows,
        documentRequests: additionalDocumentRequests,
        documentLibraryRows: allDocumentLibraryRows,
        configuredBanks: configuredOriginatorBanks,
        workflowData: transactionFinanceWorkflow,
      }),
    [
      additionalDocumentRequests,
      allDocumentLibraryRows,
      configuredOriginatorBanks,
      requiredDocumentRows,
      transaction?.bondApplicationId,
      transaction?.bond_application_id,
      transaction?.id,
      transactionFinanceWorkflow,
    ],
  )
  const documentLibraryRows = useMemo(() => {
    const activeFilter = String(activeDocumentLibraryCategory || 'all').trim().toLowerCase()
    const search = String(documentLibrarySearch || '').trim().toLowerCase()
    const criticalIds = new Set((documentReadiness.criticalDocuments || []).map((row) => String(row.id || '')))
    const bankRequestIds = new Set(
      (documentReadiness.bankRequestedDocuments || [])
        .flatMap((group) => group.items || [])
        .map((row) => String(row.id || '')),
    )

    const mapRequirementAsLibraryRow = (row, suffix = 'requirement') => ({
      id: `${suffix}-${row.id || row.displayName}`,
      transactionId: row.transactionId || transaction?.id || '',
      displayName: row.displayName || row.title || 'Document requirement',
      category: row.category || 'finance',
      categoryLabel: row.categoryLabel || getDocumentCommandCategoryLabel(row.category || 'finance'),
      status: row.status || 'missing',
      visibility: 'Client visible',
      requiredParty: row.requiredParty || 'Buyer',
      uploadedBy: row.requiredParty || 'Buyer',
      uploadedAt: row.linkedDocument?.created_at || row.linkedDocument?.uploaded_at || row.updatedAt || '',
      updatedAt: row.linkedDocument?.updated_at || row.updatedAt || '',
      source: 'requirement',
      fileUrl: row.fileUrl || row.linkedDocument?.url || '',
      relatedWorkflow: row.relatedWorkflow || '',
      requiredDocumentId: row.requiredDocumentId || '',
      requiredDocumentKey: row.requiredDocumentKey || '',
      requiredDocument: row.requirement || row.requiredDocument || null,
      requiredDocumentStatus: row.status || '',
      requiredDocumentCanonicalId: row.canonicalRequirementInstanceId || row.id || '',
      documentRequestId: '',
      satisfiesRequirement: row.satisfiesRequirement,
      priority: row.priority || '',
      blocksStage: row.blocksStage,
      raw: row.linkedDocument || null,
    })

    const mapRequestAsLibraryRow = (request, bankName = '') => ({
      id: `request-${request.id || request.title}`,
      transactionId: request.transactionId || transaction?.id || '',
      displayName: request.title || request.documentType || 'Bank requested document',
      category: 'bank_requested',
      categoryLabel: bankName || 'Bank Requested',
      status: request.status || 'missing',
      visibility: request.clientVisible ? 'Client visible' : 'Shared',
      requiredParty: getAdditionalRequestOptionLabel(ADDITIONAL_DOCUMENT_REQUESTED_FROM_OPTIONS, request.requestedFrom, 'Buyer'),
      uploadedBy: bankName || 'Bank request',
      uploadedAt: request.createdAt || '',
      updatedAt: request.updatedAt || request.createdAt || '',
      source: 'document_request',
      fileUrl: '',
      relatedWorkflow: 'bank requested',
      requiredDocumentId: '',
      requiredDocumentKey: request.documentType || request.title || '',
      requiredDocument: null,
      requiredDocumentStatus: request.status || '',
      requiredDocumentCanonicalId: '',
      documentRequestId: request.id || '',
      satisfiesRequirement: false,
      priority: getAdditionalRequestOptionLabel(ADDITIONAL_DOCUMENT_PRIORITY_OPTIONS, request.additionalPriority || request.priority, 'Normal'),
      blocksStage: true,
      raw: null,
    })

    let rows = allDocumentLibraryRows

    if (activeFilter === 'critical') {
      rows = [
        ...allDocumentLibraryRows.filter((row) => criticalIds.has(String(row.requiredDocumentCanonicalId || row.requiredDocumentId || row.requiredDocumentKey || row.id))),
        ...(documentReadiness.criticalDocuments || [])
          .filter((row) => !row.fileUrl)
          .map((row) => mapRequirementAsLibraryRow(row, 'critical')),
      ]
    } else if (activeFilter === 'missing') {
      rows = (documentReadiness.missingDocuments || []).map((row) => mapRequirementAsLibraryRow(row, 'missing'))
    } else if (activeFilter === 'pending_review') {
      rows = [
        ...allDocumentLibraryRows.filter((row) => row.status === 'pending_review'),
        ...requiredDocumentRows
          .filter((row) => row.status === 'pending_review' && !row.fileUrl)
          .map((row) => mapRequirementAsLibraryRow(row, 'pending')),
      ]
    } else if (activeFilter === 'verified') {
      rows = allDocumentLibraryRows.filter((row) => row.status === 'verified')
    } else if (activeFilter === 'bank_requested') {
      rows = (documentReadiness.bankRequestedDocuments || []).flatMap((group) =>
        (group.items || [])
          .filter((request) => !bankRequestIds.size || bankRequestIds.has(String(request.id || '')))
          .map((request) => mapRequestAsLibraryRow(request, group.bankName)),
      )
    } else if (activeFilter !== 'all') {
      rows = allDocumentLibraryRows.filter((row) => row.category === activeFilter)
    }

    const deduped = []
    const seen = new Set()
    for (const row of rows) {
      const key = String(row.id || `${row.displayName}:${row.source}`)
      if (seen.has(key)) continue
      seen.add(key)
      deduped.push(row)
    }

    if (!search) return deduped
    return deduped.filter((row) =>
      [
        row.displayName,
        row.categoryLabel,
        row.uploadedBy,
        row.status,
        row.requiredParty,
      ].map((value) => String(value || '').toLowerCase()).join(' ').includes(search),
    )
  }, [
    activeDocumentLibraryCategory,
    additionalDocumentRequests,
    allDocumentLibraryRows,
    documentLibrarySearch,
    documentReadiness,
    requiredDocumentRows,
    transaction?.id,
  ])
  const bestBondQuote = useMemo(
    () => getBestQuote(transactionFinanceWorkflow?.quotes || transactionFinanceWorkflow?.offers || []),
    [transactionFinanceWorkflow],
  )
  const bondQuoteRows = useMemo(
    () => transactionFinanceWorkflow?.quotes || transactionFinanceWorkflow?.offers || [],
    [transactionFinanceWorkflow],
  )
  const bondQuoteRecommendation = useMemo(() => getRecommendationContext(bondQuoteRows), [bondQuoteRows])
  const recommendedBondQuote = bondQuoteRecommendation.recommended || bestBondQuote
  const sortedBondQuoteRows = useMemo(
    () =>
      [...bondQuoteRows].sort((left, right) => {
        if (String(left.id || '') === String(recommendedBondQuote?.id || '')) return -1
        if (String(right.id || '') === String(recommendedBondQuote?.id || '')) return 1
        return (getQuoteRepayment(left) || Number.POSITIVE_INFINITY) - (getQuoteRepayment(right) || Number.POSITIVE_INFINITY)
      }),
    [bondQuoteRows, recommendedBondQuote],
  )
  const bondBankCommandRows = useMemo(
    () => buildBankCommandRows({ submissionRows: bondSubmissionRows, workflowData: transactionFinanceWorkflow }),
    [bondSubmissionRows, transactionFinanceWorkflow],
  )
  const acceptedBondQuote = useMemo(
    () =>
      transactionFinanceWorkflow?.acceptedOffer ||
      transactionFinanceWorkflow?.acceptedQuote ||
      bondQuoteRows.find((quote) => ['approved_by_buyer', 'accepted'].includes(String(quote.quoteStatus || quote.quote_status || '').toLowerCase())) ||
      null,
    [bondQuoteRows, transactionFinanceWorkflow],
  )
  async function handleDownloadBondApplicationForm() {
    if (typeof window === 'undefined' || typeof window.document === 'undefined') return

    setBondApplicationPdfBusy(true)
    let pdfContainer = null
    try {
      const { default: html2pdf } = await import('html2pdf.js')
      const pdfDocument = new window.DOMParser().parseFromString(
        buildBondApplicationPdfHtml(bondApplicationViewModel, new Date().toISOString()),
        'text/html',
      )
      const container = window.document.createElement('div')
      pdfContainer = container
      const style = pdfDocument.head.querySelector('style')
      const page = pdfDocument.body.firstElementChild
      if (style) container.appendChild(style.cloneNode(true))
      if (page) container.appendChild(page.cloneNode(true))
      container.style.position = 'fixed'
      container.style.left = '-10000px'
      container.style.top = '0'
      container.style.width = '980px'
      window.document.body.appendChild(container)
      await html2pdf()
        .set({
          margin: 0,
          filename: getBondApplicationPdfFilename(bondApplicationViewModel),
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        })
        .from(container)
        .save()
    } finally {
      pdfContainer?.remove()
      setBondApplicationPdfBusy(false)
    }
  }
  async function handleShareBondApplication() {
    if (typeof window === 'undefined') return
    const shareUrl = window.location.href
    const shareTitle = `Bond application ${bondApplicationViewModel.application.id}`
    try {
      if (window.navigator?.share) {
        await window.navigator.share({
          title: shareTitle,
          text: bondApplicationViewModel.applicant.fullName,
          url: shareUrl,
        })
        return
      }
      await window.navigator?.clipboard?.writeText(shareUrl)
      setOnboardingActionMessage('Application link copied to clipboard.')
    } catch (shareError) {
      if (shareError?.name !== 'AbortError') setError('Unable to share this application link.')
    }
  }
  function handleOpenFinanceDocument(document = {}) {
    const url = document?.url || document?.publicUrl || document?.downloadUrl || ''
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }
  const financeCommandCenterPanel = (
    <TransactionFinanceCommandCenter
      transaction={transaction || {}}
      workflowData={transactionFinanceWorkflow}
      requiredDocumentChecklist={requiredDocumentChecklist}
      documents={documents}
      financeReadinessHandoff={financeReadinessHandoff}
      viewerRole={workspaceRole}
      activeViewerPermissions={{ canEditFinanceWorkflow: canEditBondHybridFinanceWorkflow }}
      loadingAction={bondHybridFinanceActionLoading}
      onSubmitBankApplication={(payload) => void handleAddBondHybridApplication(payload)}
      onUpdateBankApplication={(application, payload) => void handleUpdateBondHybridApplication(application.id, payload)}
      onCaptureBondOffer={(payload) => void handleAddBondHybridQuote(payload)}
      onAcceptOffer={(offer) => void handleApproveBondHybridQuote(offer.id)}
      onMarkInstructionSent={() => void handleMarkBondHybridInstructionSent()}
      onOpenDocument={handleOpenFinanceDocument}
    />
  )
  const activeWorkflowLane = useMemo(
    () => workflowLanes.find((lane) => lane.laneKey === workflowDrawerLaneKey) || null,
    [workflowDrawerLaneKey, workflowLanes],
  )

  async function refreshWorkflowAfterChange(nextOperations = null) {
    if (nextOperations) {
      setWorkflowOperations(nextOperations)
    } else if (transaction?.id) {
      const operations = await getAttorneyWorkflowOperationsForTransaction(transaction.id)
      setWorkflowOperations(operations)
    }
    await loadData({ background: true })
  }

  function openRoutingProfileModal() {
    setRoutingProfileDraft(buildRoutingProfileDraft(transaction || {}, routingDiagnostics || {}))
    setRoutingProfileError('')
    setRoutingProfileModalOpen(true)
  }

  async function handleSaveRoutingProfile(event) {
    event?.preventDefault?.()
    if (!transaction?.id) {
      setRoutingProfileError('Transaction data is not available.')
      return
    }

    try {
      setRoutingProfileSaving(true)
      setRoutingProfileError('')
      const nextDetail = await saveTransactionRoutingProfile({
        transactionId: transaction.id,
        financeType: routingProfileDraft.financeType,
        transactionType: routingProfileDraft.transactionType,
        propertyType: routingProfileDraft.propertyType,
        propertyTenure: routingProfileDraft.propertyTenure,
        purchaserType: routingProfileDraft.purchaserType,
        sellerType: routingProfileDraft.sellerType,
        sellerHasExistingBond: routingProfileDraft.sellerHasExistingBond === 'true',
        cancellationRequired: routingProfileDraft.cancellationRequired === 'true',
        vatTreatment: routingProfileDraft.vatTreatment,
        reason: routingProfileDraft.reason,
        actorRole: workspaceRole,
      })
      if (nextDetail) {
        setData(nextDetail)
      }
      setRoutingProfileModalOpen(false)
      await refreshWorkflowAfterChange()
    } catch (routingError) {
      setRoutingProfileError(routingError?.message || 'Unable to update routing profile.')
    } finally {
      setRoutingProfileSaving(false)
    }
  }

  async function refreshBondHybridFinanceWorkflow(nextWorkflow = null) {
    if (nextWorkflow) {
      setData((previous) => previous ? { ...previous, transactionFinanceWorkflow: nextWorkflow } : previous)
      return nextWorkflow
    }
    if (!transaction?.id) return null
    const workflow = await getTransactionFinanceWorkflow(transaction.id, { createIfMissing: true })
    setData((previous) => previous ? { ...previous, transactionFinanceWorkflow: workflow } : previous)
    return workflow
  }

  async function handleBondHybridFinanceStage(stageKey) {
    if (!transaction?.id) {
      setError('Transaction data is not available for bond finance workflow updates.')
      return
    }

    try {
      setBondHybridFinanceActionLoading(stageKey)
      setError('')
      const result = await updateBondHybridFinanceStage(transaction.id, stageKey, { actorRole: workspaceRole })
      await refreshBondHybridFinanceWorkflow(result)
      await loadData({ background: true })
    } catch (workflowActionError) {
      setError(workflowActionError?.message || 'Unable to update bond finance workflow.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleAddBondHybridApplication(payload) {
    if (!transaction?.id) {
      setError('Transaction data is not available for bond applications.')
      return
    }

    try {
      setBondHybridFinanceActionLoading('add_application')
      setError('')
      const result = await addBondApplication(transaction.id, payload, { actorRole: workspaceRole })
      await refreshBondHybridFinanceWorkflow(result)
      await loadData({ background: true })
    } catch (workflowActionError) {
      setError(workflowActionError?.message || 'Unable to add bank/lender application.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleUpdateBondHybridApplication(applicationId, payload) {
    try {
      setBondHybridFinanceActionLoading(applicationId)
      setError('')
      const result = await updateBondApplication(applicationId, payload, { actorRole: workspaceRole })
      await refreshBondHybridFinanceWorkflow(result)
      await loadData({ background: true })
    } catch (workflowActionError) {
      setError(workflowActionError?.message || 'Unable to update bank/lender application.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleAddBondHybridQuote(payload) {
    if (!transaction?.id) {
      setError('Transaction data is not available for bond quotes.')
      return
    }

    try {
      setBondHybridFinanceActionLoading('add_quote')
      setError('')
      const result = await addBondQuote(transaction.id, payload, { actorRole: workspaceRole })
      await refreshBondHybridFinanceWorkflow(result)
      await loadData({ background: true })
    } catch (workflowActionError) {
      setError(workflowActionError?.message || 'Unable to add finance quote.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleApproveBondHybridQuote(quoteId) {
    try {
      setBondHybridFinanceActionLoading(quoteId)
      setError('')
      const result = await approveBondQuote(quoteId, { actorRole: workspaceRole })
      await refreshBondHybridFinanceWorkflow(result)
      await loadData({ background: true })
    } catch (workflowActionError) {
      setError(workflowActionError?.message || 'Unable to approve finance quote.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleDeclineBondHybridQuote(quoteId) {
    try {
      setBondHybridFinanceActionLoading(quoteId)
      setError('')
      const result = await declineBondQuote(quoteId, { actorRole: workspaceRole })
      await refreshBondHybridFinanceWorkflow(result)
      await loadData({ background: true })
    } catch (workflowActionError) {
      setError(workflowActionError?.message || 'Unable to decline finance quote.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  async function handleDeclineAllBondHybridQuotes() {
    const declineableQuotes = bondQuoteRows.filter((quote) => {
      const status = String(quote.quoteStatus || quote.quote_status || '').toLowerCase()
      return quote.id && !['declined', 'expired', 'not_selected', 'approved_by_buyer', 'accepted'].includes(status)
    })
    if (!declineableQuotes.length) return

    try {
      setBondHybridFinanceActionLoading('decline_all_quotes')
      setError('')
      let latestResult = null
      for (const quote of declineableQuotes) {
        latestResult = await declineBondQuote(quote.id, { actorRole: workspaceRole })
      }
      if (latestResult) await refreshBondHybridFinanceWorkflow(latestResult)
      await loadData({ background: true })
    } catch (workflowActionError) {
      setError(workflowActionError?.message || 'Unable to decline finance quotes.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  function handleRequestBondQuoteRevision(quote = null) {
    const bankName = getQuoteBankName(quote)
    setDiscussionType('workflow')
    setDiscussionVisibility('shared')
    setDiscussionBody(bankName ? `Requesting a revised quote from ${bankName}.` : 'Requesting a revised bond quote.')
  }

  async function handleMarkBondHybridInstructionSent() {
    if (!transaction?.id) {
      setError('Transaction data is not available for instruction updates.')
      return
    }

    try {
      setBondHybridFinanceActionLoading('instruction_sent')
      setError('')
      const result = await markFinanceInstructionSent(transaction.id, { actorRole: workspaceRole })
      await refreshBondHybridFinanceWorkflow(result)
      await loadData({ background: true })
    } catch (workflowActionError) {
      setError(workflowActionError?.message || 'Unable to mark finance instruction sent.')
    } finally {
      setBondHybridFinanceActionLoading('')
    }
  }

  function openWorkflowDrawer(lane) {
    setWorkflowDrawerLaneKey(lane?.laneKey || '')
    setWorkflowStepDraft(null)
    setWorkflowNoteDraft(null)
    setWorkflowDocumentDraft(null)
  }

  function handleSelectWorkflowStepStatus(lane, step, status) {
    setWorkflowDrawerLaneKey(lane?.laneKey || workflowDrawerLaneKey)
    setWorkflowStepDraft({ laneKey: lane?.laneKey || workflowDrawerLaneKey, step, status, note: step?.comment || '' })
  }

  async function handleWorkflowStepSubmit(event) {
    event.preventDefault()
    if (!workflowStepDraft || !transaction?.id) return
    setWorkflowSaving(true)
    setWorkflowError('')
    try {
      const next = await updateAttorneyWorkflowStepStatus({
        transactionId: transaction.id,
        laneKey: workflowStepDraft.laneKey,
        stepId: workflowStepDraft.step?.id,
        stepKey: workflowStepDraft.step?.stepKey || workflowStepDraft.step?.step_key,
        status: workflowStepDraft.status,
        note: workflowStepDraft.note,
        visibility: 'internal',
      })
      setWorkflowStepDraft(null)
      await refreshWorkflowAfterChange(next)
    } catch (stepError) {
      setWorkflowError(stepError?.message || 'Unable to update workflow step.')
    } finally {
      setWorkflowSaving(false)
    }
  }

  async function handleWorkflowNoteSubmit(event) {
    event.preventDefault()
    if (!workflowNoteDraft || !transaction?.id) return
    setWorkflowSaving(true)
    setWorkflowError('')
    try {
      const next = await addAttorneyTransactionUpdate({
        transactionId: transaction.id,
        laneKey: workflowNoteDraft.laneKey,
        updateType: 'internal_note',
        visibility: workflowNoteDraft.visibility || 'internal',
        message: workflowNoteDraft.message,
      })
      setWorkflowNoteDraft(null)
      await refreshWorkflowAfterChange(next)
    } catch (noteError) {
      setWorkflowError(noteError?.message || 'Unable to save workflow note.')
    } finally {
      setWorkflowSaving(false)
    }
  }

  async function handleWorkflowDocumentSubmit(event) {
    event.preventDefault()
    if (!workflowDocumentDraft || !transaction?.id) return
    setWorkflowSaving(true)
    setWorkflowError('')
    try {
      const next = await requestAttorneyWorkflowLaneDocument({
        transactionId: transaction.id,
        laneKey: workflowDocumentDraft.laneKey,
        title: workflowDocumentDraft.title,
        description: workflowDocumentDraft.description,
        requestedFrom: workflowDocumentDraft.requestedFrom,
      })
      setWorkflowDocumentDraft(null)
      await refreshWorkflowAfterChange(next)
    } catch (documentError) {
      setWorkflowError(documentError?.message || 'Unable to request workflow document.')
    } finally {
      setWorkflowSaving(false)
    }
  }

  const handleQuickRequestDocuments = useCallback(() => {
    setWorkspaceMenu('documents')
    setRequestDocumentModalOpen(true)
  }, [])

  async function handleCreateDocumentRequest(event) {
    event.preventDefault()
    if (!transaction?.id) {
      setError('Transaction data is not available.')
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
        transactionId: transaction.id,
        createdByRole: workspaceRole,
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
      setRequestDocumentModalOpen(false)
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadData({ background: true })
    } catch (requestError) {
      setError(requestError?.message || 'Unable to request this document.')
    } finally {
      setDocumentRequestSaving(false)
    }
  }

  const handleQuickAddWorkflowNote = useCallback(() => {
    const lane = workflowLanes[0]
    if (!lane) {
      setWorkspaceMenu('activity')
      return
    }
    openWorkflowDrawer(lane)
    setWorkflowNoteDraft({
      laneKey: lane.laneKey,
      visibility: 'internal',
      message: '',
    })
  }, [workflowLanes])

  const handleQuickScheduleSigning = useCallback(() => {
    const lane = workflowLanes.find((item) => item.laneKey === 'transfer') || workflowLanes[0]
    if (!lane) {
      setWorkspaceMenu('activity')
      return
    }
    openWorkflowDrawer(lane)
    setWorkflowNoteDraft({
      laneKey: lane.laneKey,
      visibility: 'internal',
      message: 'Signing appointment to be scheduled.',
    })
  }, [workflowLanes])

  const openAgentSalesAgreementWorkspace = useCallback(() => {
    if (!transaction?.id) {
      setError('Transaction data is not available for sales agreement generation.')
      return
    }

    const params = new URLSearchParams()
    params.set('mode', 'generate')
    params.set('returnTo', `${location.pathname}${location.search || ''}`)
    navigate(`/transactions/${transaction.id}/legal/otp?${params.toString()}`)
  }, [location.pathname, location.search, navigate, transaction?.id])

  const openWorkspaceMenu = useCallback((nextMenu) => {
    setWorkspaceMenu(nextMenu)
    if (activeLegalWorkflowDetailKey && nextMenu !== 'transfer') {
      navigate(transactionWorkspaceBasePath)
    }
  }, [activeLegalWorkflowDetailKey, navigate, transactionWorkspaceBasePath])

  const openLegalWorkflowDetail = useCallback((detailKey) => {
    const normalized = normalizeLegalWorkflowDetailKey(detailKey)
    if (!normalized) return
    setWorkspaceMenu('transfer')
    navigate(`${transactionWorkspaceBasePath}/transfer/${normalized}`)
  }, [navigate, transactionWorkspaceBasePath])

  const closeLegalWorkflowDetail = useCallback(() => {
    setWorkspaceMenu('transfer')
    navigate(transactionWorkspaceBasePath)
  }, [navigate, transactionWorkspaceBasePath])

  function handleOverviewActionTarget(target = 'overview') {
    const normalizedTarget = normalizeDetailKey(target)
    if (normalizedTarget === 'buyer_portal') {
      void handleAgentHeaderOnboardingAction()
      return
    }
    if (normalizedTarget === 'seller_portal') {
      void handleSendSellerPortalLink()
      return
    }
    if (normalizedTarget === 'sales_agreement') {
      openAgentSalesAgreementWorkspace()
      return
    }
    if (normalizedTarget === 'documents') {
      setWorkspaceMenu('documents')
      return
    }
    if (normalizedTarget === 'finance') {
      setWorkspaceMenu(workspaceRole === 'bond_originator' ? 'banks_quotes' : 'finance')
      return
    }
    if (normalizedTarget === 'activity') {
      setWorkspaceMenu('activity')
      return
    }
    if (normalizedTarget === 'stakeholders' || normalizedTarget === 'roleplayers') {
      setWorkspaceMenu('stakeholders')
      return
    }
    if (normalizedTarget === 'overview') {
      setWorkspaceMenu('overview')
      return
    }
    setWorkspaceMenu('transfer')
  }

  async function handleOverviewWorkflowAction(action = null) {
    if (!transaction?.id || !action?.actionKey) return

    if (action.actionKey === 'MARK_REGISTERED') {
      setRegistrationModalOpen(true)
      return
    }

    try {
      setSaving(true)
      setError('')
      const result = await runWorkflowAction({
        transactionId: transaction.id,
        actionKey: action.actionKey,
        payload: { source: 'rollup_overview' },
        actorRole: workspaceRole,
      })
      if (!result?.allowed) {
        throw new Error((result?.blockers || []).map((item) => item.message).filter(Boolean).join(' • ') || 'Workflow action is blocked.')
      }
      window.dispatchEvent(new Event('itg:transaction-updated'))
      await loadData({ background: true })
      if (USE_TRANSACTION_ROLLUP_OVERVIEW) {
        try {
          const refreshedRollup = await getTransactionRollup(transaction.id, { actorRole: workspaceRole })
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

  const matterHeaderMetrics = useMemo(
    () => {
      const metrics = [
        { label: 'Purchase Price', value: formatCurrencyValue(displayPurchasePriceValue, 'Not captured'), icon: CircleDollarSign, tone: 'bg-emerald-50 text-emerald-700' },
        { label: 'Finance Type', value: financeTypeLabel, icon: FileText, tone: 'bg-blue-50 text-blue-700' },
        { label: 'Bond Amount', value: formatCurrencyValue(hasCapturedFinancials ? transaction?.bond_amount : 0, bondAmountFallback), icon: Building2, tone: 'bg-violet-50 text-violet-700' },
        { label: 'Target Registration', value: formatDate(transaction?.target_registration_date || transaction?.expected_transfer_date), icon: CalendarDays, tone: 'bg-sky-50 text-sky-700' },
      ]
      if (shouldShowDepositCard) {
        metrics.splice(3, 0, {
          label: 'Deposit',
          value: formatCurrencyValue(
            hasCapturedFinancials
              ? transaction?.reservation_amount || transaction?.reservation_deposit_amount || transaction?.deposit_amount
              : 0,
            'Not captured',
          ),
          icon: CircleDollarSign,
          tone: 'bg-amber-50 text-amber-700',
        })
      }
      return metrics
    },
    [
      bondAmountFallback,
      displayPurchasePriceValue,
      financeTypeLabel,
      hasCapturedFinancials,
      shouldShowDepositCard,
      transaction?.bond_amount,
      transaction?.deposit_amount,
      transaction?.expected_transfer_date,
      transaction?.reservation_amount,
      transaction?.reservation_deposit_amount,
      transaction?.target_registration_date,
    ],
  )
  const matterAssignedFirms = useMemo(
    () => [
      { label: 'Transfer Attorney', value: getParticipantDisplayName(transferAttorney) },
      { label: 'Bond Attorney', value: getParticipantDisplayName(bondAttorney) },
    ],
    [bondAttorney, transferAttorney],
  )
  const matterProgressIndex = useMemo(
    () => getMatterStageProgressIndex({ transferStageKey, transferStageLabel, lifecycleState }),
    [lifecycleState, transferStageKey, transferStageLabel],
  )
  const matterSubtitle = [
    development?.name || null,
    propertyAddress || null,
  ].filter(Boolean).join(' • ')
  const rollupLifecycleSummary = useMemo(
    () =>
      buildTransactionLifecycleSummaryFromRollup(transactionRollup, {
        transactionId: transaction?.id,
        fallbackUpdatedAt: transaction?.updated_at || transaction?.created_at || null,
      }),
    [transaction?.created_at, transaction?.id, transaction?.updated_at, transactionRollup],
  )
  const usingTransactionRollupOverview = USE_TRANSACTION_ROLLUP_OVERVIEW && Boolean(rollupLifecycleSummary)
  const displayedLifecycleProgress = usingTransactionRollupOverview
    ? {
        ...rollupLifecycleSummary,
        blockerReason:
          transactionRollup?.blockers?.[0]?.message ||
          transactionRollup?.nextAction?.label ||
          '',
        nextMilestone: String(transactionRollup?.parentStage || 'workflow').replaceAll('_', ' '),
      }
    : lifecycleProgressState
  const displayedLifecycleLabel = usingTransactionRollupOverview
    ? formatTransactionRollupStatusLabel(transactionRollup?.parentStatus)
    : lifecycleLabel
  const displayedLifecycleStatusClassName = usingTransactionRollupOverview
    ? getRollupLifecycleStatusClasses(transactionRollup?.parentStatus)
    : getLifecycleStateClasses(lifecycleState)
  const bondApplicationViewModel = useMemo(
    () =>
      buildBondApplicationViewModel({
        transaction,
        buyer,
        development,
        unit,
        onboarding: data?.onboarding || {},
        onboardingFormData: data?.onboardingFormData || {},
        documentRows: allDocumentLibraryRows,
        requiredDocumentRows,
        documentReadiness,
        activityFeed,
        reference: workspaceReference,
        statusLabel: displayedLifecycleLabel,
        assignedConsultant:
          transaction?.bond_originator ||
          transaction?.assigned_bond_originator_name ||
          getParticipantDisplayName(assignedBondOriginator) ||
          'Unassigned',
      }),
    [
      activityFeed,
      allDocumentLibraryRows,
      assignedBondOriginator,
      buyer,
      data?.onboarding,
      data?.onboardingFormData,
      development,
      displayedLifecycleLabel,
      documentReadiness,
      requiredDocumentRows,
      transaction,
      unit,
      workspaceReference,
    ],
  )
  const bondApplicationOutstandingCount = bondApplicationViewModel.readinessItems.filter((item) => !item.complete).length
  const bondApplicationUploadedCount = bondApplicationViewModel.documents.reduce((total, item) => total + (item.uploadedCount || 0), 0)
  const displayedMatterHealthLabel = usingTransactionRollupOverview
    ? getRollupHealthLabel(transactionRollup?.parentStatus)
    : matterHealthLabel
  const displayedUpdatedLabel = usingTransactionRollupOverview
    ? formatShortDayMonth(
        transactionRollup?.derivedAt ||
          transactionRollup?.lastWorkflowUpdatedAt ||
          transaction?.updated_at ||
          transaction?.created_at,
      )
    : formatShortDayMonth(transaction?.updated_at || transaction?.created_at)
  const headerWorkflowActionButtons = (() => {
    if (!isAgentTransactionView) return []
    if (!usingTransactionRollupOverview) {
      return [
        {
          label: 'Resend Buyer Portal Link',
          busyLabel: 'Sending buyer portal link...',
          busy: onboardingActionBusy,
          disabled: onboardingActionBusy || !buyerEmail,
          onClick: () => void handleAgentHeaderOnboardingAction(),
          icon: Send,
        },
        {
          label: 'Send Seller Portal Link',
          busyLabel: 'Sending seller portal link...',
          busy: sellerPortalBusy,
          disabled: sellerPortalBusy || !sellerEmail,
          onClick: () => void handleSendSellerPortalLink(),
          icon: Send,
          variant: 'secondary',
        },
      ]
    }

    return (transactionRollup?.availableActions || [])
      .filter((action) =>
        ['request_buyer_details', 'request_seller_details', 'move_to_finance', 'move_to_transfer', 'mark_ready_for_registration', 'mark_registered']
          .includes(normalizeDetailKey(action?.actionKey)),
      )
      .map((action) => {
        const actionKey = normalizeDetailKey(action?.actionKey)
        const busy =
          (actionKey === 'request_buyer_details' && onboardingActionBusy) ||
          (actionKey === 'request_seller_details' && sellerPortalBusy)
        let onClick = () => void handleOverviewWorkflowAction(action)
        if (actionKey === 'request_buyer_details') {
          onClick = () => void handleAgentHeaderOnboardingAction()
        } else if (actionKey === 'request_seller_details') {
          onClick = () => void handleSendSellerPortalLink()
        }

        return {
          actionKey: action.actionKey,
          label: action.label,
          busyLabel:
            actionKey === 'request_buyer_details'
              ? 'Sending buyer details request...'
              : actionKey === 'request_seller_details'
                ? 'Sending seller details request...'
                : undefined,
          busy,
          disabled: busy || action?.enabled === false,
          reason: action?.reason || '',
          onClick,
          icon: actionKey.startsWith('request_') ? Send : undefined,
          variant: getRollupHeaderActionVariant(action),
        }
      })
  })()
  const overviewNextActions = useMemo(() => {
    return [
      {
        title: overviewPrimaryNextAction.title,
        description: overviewPrimaryNextAction.description,
        dueDate: overviewPrimaryNextAction.dueDate,
        workflow: TRANSACTION_LIFECYCLE_STAGE_LABELS[displayedLifecycleProgress.currentStage] || 'Overview',
        action: overviewPrimaryNextAction.primaryActionLabel || 'Open',
        actionTarget: overviewPrimaryNextAction.primaryActionTarget || 'overview',
        secondaryAction: overviewPrimaryNextAction.secondaryActionLabel || '',
        secondaryActionTarget: overviewPrimaryNextAction.secondaryActionTarget || 'overview',
        priority: overviewPrimaryNextAction.priority || 'normal',
        status: overviewPrimaryNextAction.status || 'pending',
      },
    ]
  }, [displayedLifecycleProgress.currentStage, overviewPrimaryNextAction])
  const getWorkspaceMenuForTask = useCallback((item) => {
    const target = normalizeDetailKey(item?.actionTarget || item?.primaryActionTarget || item?.secondaryActionTarget)
    if (target === 'documents' || target === 'sales_agreement') return 'documents'
    if (target === 'finance') return 'finance'
    if (target === 'activity') return 'activity'
    if (target === 'stakeholders' || target === 'roleplayers') return 'stakeholders'
    if (target === 'overview' || target === 'buyer_portal' || target === 'seller_portal') return 'overview'
    return 'transfer'
  }, [])
  const overviewQuickActions = useMemo(() => {
    const actions = [
      { label: 'Request Documents', icon: FileText, onClick: handleQuickRequestDocuments },
      { label: 'Upload Document', icon: Upload, onClick: () => setWorkspaceMenu('documents') },
      { label: 'Add Note', icon: MessageSquarePlus, onClick: handleQuickAddWorkflowNote },
    ]

    if (!lifecycleProgressState?.flags?.registrationComplete) {
      actions.push({ label: 'Schedule Signing', icon: CalendarDays, onClick: handleQuickScheduleSigning })
    }
    if (!lifecycleProgressState?.flags?.otpSigned) {
      actions.push({ label: 'Generate Sales Agreement', icon: FileText, onClick: openAgentSalesAgreementWorkspace })
    }

    return actions
  }, [
    lifecycleProgressState?.flags?.otpSigned,
    lifecycleProgressState?.flags?.registrationComplete,
    openAgentSalesAgreementWorkspace,
    handleQuickAddWorkflowNote,
    handleQuickRequestDocuments,
    handleQuickScheduleSigning,
  ])
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
          ['Purchase Price', formatCurrencyValue(displayPurchasePriceValue, 'Not captured')],
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
      displayPurchasePriceValue,
      onboardingCompleted,
      propertyAddress,
      transaction,
      transferAttorney,
      unit?.unit_number,
    ],
  )
  const bondHybridFinanceSummary = transactionFinanceWorkflow?.summary || null
  const requiresBondOriginatorCard = financeRequiresBondSupport
  const requiresBondAttorneyCard = Boolean(
    isBondOrHybridFinance &&
    (
      bondAttorney ||
      bondHybridFinanceSummary?.approvedQuote ||
      bondHybridFinanceSummary?.acceptedOffer ||
      transactionFinanceWorkflow?.acceptedOffer ||
      transaction?.bond_registered ||
      transaction?.bond_registered_at ||
      bondHybridFinanceSummary?.instructionSent
    ),
  )
  const requiresCancellationAttorneyCard = Boolean(
    cancellationAttorney ||
    transaction?.seller_has_existing_bond ||
    transaction?.transaction_requires_cancellation,
  )
  const transactionTeamCards = [
    {
      key: 'transfer_attorney',
      label: 'Transfer Attorney',
      visible: true,
      assigned: transferAttorney,
      company: transferAttorney?.organisationName || transferAttorney?.firmName || transaction?.attorney || 'Not assigned',
      contact: transferAttorney?.participantName || transferAttorney?.participantEmail || transaction?.attorney || 'Not assigned',
      email: transferAttorney?.participantEmail || transaction?.assigned_attorney_email || 'Not captured',
      status: transferAttorney ? 'Assigned' : 'Not assigned',
      actionLabel: transferAttorney ? 'Change Assignment' : 'Assign Transfer Attorney',
    },
    {
      key: 'bond_originator',
      label: 'Bond Originator',
      visible: requiresBondOriginatorCard,
      assigned: assignedBondOriginator,
      company: assignedBondOriginator?.organisationName || transaction?.bond_originator || 'Not assigned',
      contact: assignedBondOriginator?.participantName || transaction?.bond_originator || assignedBondOriginator?.participantEmail || 'Not assigned',
      email: assignedBondOriginator?.participantEmail || transaction?.assigned_bond_originator_email || 'Not captured',
      status: assignedBondOriginator ? 'Assigned' : 'Not assigned',
      actionLabel: assignedBondOriginator ? 'Change Assignment' : 'Assign Bond Originator',
    },
    {
      key: 'bond_attorney',
      label: 'Bond Attorney',
      visible: requiresBondAttorneyCard,
      assigned: bondAttorney,
      company: bondAttorney?.organisationName || bondAttorney?.firmName || 'Not assigned',
      contact: bondAttorney?.participantName || bondAttorney?.participantEmail || 'Not assigned',
      email: bondAttorney?.participantEmail || 'Not captured',
      status: bondAttorney ? 'Assigned' : 'Not assigned',
      actionLabel: bondAttorney ? 'Change Assignment' : 'Assign Bond Attorney',
    },
    {
      key: 'cancellation_attorney',
      label: 'Cancellation Attorney',
      visible: requiresCancellationAttorneyCard,
      assigned: cancellationAttorney,
      company: cancellationAttorney?.organisationName || cancellationAttorney?.firmName || 'Not assigned',
      contact: cancellationAttorney?.participantName || cancellationAttorney?.participantEmail || 'Not assigned',
      email: cancellationAttorney?.participantEmail || 'Not captured',
      status: cancellationAttorney ? 'Assigned' : 'Not assigned',
      actionLabel: cancellationAttorney ? 'Change Assignment' : 'Assign Cancellation Attorney',
    },
  ].filter((item) => item.visible)
  const transferWorkflowLane = useMemo(
    () => workflowLanes.find((lane) => String(lane?.laneKey || '').trim().toLowerCase() === 'transfer') || null,
    [workflowLanes],
  )
  const cancellationWorkflowLane = useMemo(
    () => workflowLanes.find((lane) => String(lane?.laneKey || '').trim().toLowerCase() === 'cancellation') || null,
    [workflowLanes],
  )
  const bondAttorneyWorkflowLane = useMemo(
    () => workflowLanes.find((lane) => String(lane?.laneKey || '').trim().toLowerCase() === 'bond') || null,
    [workflowLanes],
  )
  const bondWorkflowSummary = useMemo(
    () => summarizeBondHybridFinanceWorkflow(transactionFinanceWorkflow || {}),
    [transactionFinanceWorkflow],
  )
  const requiresBondRegistrationWorkflow = isBondOrHybridFinance
  const requiresCancellationWorkflow = Boolean(
    transaction?.seller_has_existing_bond || transaction?.transaction_requires_cancellation,
  )
  const roleplayerStripItems = [
    {
      key: 'transfer-attorney',
      label: 'Transfer Attorney',
      value: transferAttorney?.organisationName || transferAttorney?.participantName || transferAttorney?.participantEmail || transaction?.attorney || 'Not assigned',
      subtext: transferAttorney?.participantEmail || transaction?.assigned_attorney_email || 'Assignment pending',
    },
    {
      key: 'bond-originator',
      label: 'Bond Originator',
      value: assignedBondOriginator?.organisationName || assignedBondOriginator?.participantName || assignedBondOriginator?.participantEmail || transaction?.bond_originator || (
        requiresBondRegistrationWorkflow ? 'Not assigned' : 'Not required'
      ),
      subtext: assignedBondOriginator?.participantEmail || (
        requiresBondRegistrationWorkflow ? 'Assignment pending' : 'No bond workflow required'
      ),
    },
    {
      key: 'bond-attorney',
      label: 'Bond Attorney',
      value: bondAttorney?.organisationName || bondAttorney?.participantName || bondAttorney?.participantEmail || (
        requiresBondRegistrationWorkflow ? 'Not assigned' : 'Not required'
      ),
      subtext: bondAttorney?.participantEmail || (
        requiresBondRegistrationWorkflow ? 'Assignment pending' : 'No bond workflow required'
      ),
    },
    {
      key: 'cancellation-attorney',
      label: 'Cancellation Attorney',
      value: cancellationAttorney?.organisationName || cancellationAttorney?.participantName || cancellationAttorney?.participantEmail || (
        requiresCancellationWorkflow ? 'Not assigned' : 'Not required'
      ),
      subtext: cancellationAttorney?.participantEmail || (
        requiresCancellationWorkflow ? 'Assignment pending' : 'No cancellation workflow required'
      ),
    },
  ]
  const legalWorkflowModels = useMemo(() => {
    const routingFacts = routingDiagnostics?.facts || {}
    const transferWorkflow = {
      key: 'transfer',
      detailKey: 'transfer',
      accentKey: 'transfer',
      title: 'Transfer Attorney',
      summary: transferWorkflowLane
        ? getWorkflowExplanation(transferWorkflowLane)
        : 'Transfer workflow is always required for this transaction.',
      required: true,
      statusKey: transferWorkflowLane ? getWorkflowHealthKey(transferWorkflowLane) : 'not_started',
      statusLabel: transferWorkflowLane ? getWorkflowHealthLabel(transferWorkflowLane) : 'Not Started',
      progressPercent: getConditionalLegalWorkflowProgress({
        workflowKey: 'transfer',
        lane: transferWorkflowLane,
        facts: routingFacts,
        fallback: transferWorkflowLane?.summary?.completionPercent,
      }),
      nextStep: transferWorkflowLane
        ? (getCurrentWorkflowStep(transferWorkflowLane) ? getWorkflowStepLabel(getCurrentWorkflowStep(transferWorkflowLane)) : transferWorkflowLane?.summary?.nextAction || 'Workflow review')
        : 'Assign transfer attorney',
      assignedLabel: 'Assigned Attorney',
      assignedDisplay: transferAttorney?.organisationName || transferAttorney?.participantName || transferAttorney?.participantEmail || transaction?.attorney || 'Not assigned',
      assignedOrganisation: transferAttorney?.organisationName || transaction?.attorney || 'Not assigned',
      assignedContact: transferAttorney?.participantName || transferAttorney?.participantEmail || transaction?.assigned_attorney_email || 'Not assigned',
      route: `${transactionWorkspaceBasePath}/transfer/transfer`,
      activityCount: activityFeed.filter((entry) => (entry?.filterKeys || []).includes('transfer')).length,
      reasonChips: buildLegalWorkflowReasonChips(routingFacts, 'transfer'),
      blockers: [
        !transferAttorney && !transaction?.attorney ? 'Transfer attorney still needs to be assigned.' : '',
        ...(Array.isArray(transferWorkflowLane?.summary?.blockers) ? transferWorkflowLane.summary.blockers : []),
      ].filter(Boolean),
      lane: transferWorkflowLane,
    }

    const items = [transferWorkflow]

    items.push({
      key: 'bond_registration',
      detailKey: 'bond-registration',
      accentKey: 'bond',
      title: 'Bond Registration',
      summary: requiresBondRegistrationWorkflow
        ? (bondAttorneyWorkflowLane ? getWorkflowExplanation(bondAttorneyWorkflowLane) : 'Bond registration is active for this bond or hybrid transaction.')
        : 'No bond registration workflow is required for this transaction.',
      required: requiresBondRegistrationWorkflow,
      statusKey: requiresBondRegistrationWorkflow
        ? (bondAttorneyWorkflowLane ? getWorkflowHealthKey(bondAttorneyWorkflowLane) : getBondWorkflowStatusKey(transactionFinanceWorkflow))
        : 'not_started',
      statusLabel: requiresBondRegistrationWorkflow
        ? (bondAttorneyWorkflowLane ? getWorkflowHealthLabel(bondAttorneyWorkflowLane) : WORKFLOW_STATUS_META[getBondWorkflowStatusKey(transactionFinanceWorkflow)]?.label || 'Not Started')
        : 'Not Required',
      progressPercent: requiresBondRegistrationWorkflow
        ? getConditionalLegalWorkflowProgress({
            workflowKey: 'bond',
            lane: bondAttorneyWorkflowLane,
            facts: routingFacts,
            fallback: bondAttorneyWorkflowLane?.summary?.completionPercent ?? getBondWorkflowProgressPercent(transactionFinanceWorkflow),
          })
        : 0,
      nextStep: requiresBondRegistrationWorkflow
        ? (bondAttorneyWorkflowLane
            ? (getCurrentWorkflowStep(bondAttorneyWorkflowLane)
                ? getWorkflowStepLabel(getCurrentWorkflowStep(bondAttorneyWorkflowLane))
                : bondAttorneyWorkflowLane?.summary?.nextAction || 'Workflow review')
            : getBondWorkflowNextStep(transactionFinanceWorkflow))
        : 'Not required',
      assignedLabel: 'Assigned Bond Attorney',
      assignedDisplay: bondAttorney?.organisationName || bondAttorney?.participantName || bondAttorney?.participantEmail || 'Not assigned',
      assignedOrganisation: bondAttorney?.organisationName || bondAttorney?.firmName || 'Not assigned',
      assignedContact: bondAttorney?.participantName || bondAttorney?.participantEmail || 'Not assigned',
      route: `${transactionWorkspaceBasePath}/transfer/bond-registration`,
      activityCount: activityFeed.filter((entry) => (entry?.filterKeys || []).includes('bond')).length,
      reasonChips: buildLegalWorkflowReasonChips(routingFacts, 'bond'),
      blockers: requiresBondRegistrationWorkflow
        ? [
            !bondAttorney ? 'Bond attorney still needs to be assigned.' : '',
            ...(Array.isArray(bondAttorneyWorkflowLane?.summary?.blockers) ? bondAttorneyWorkflowLane.summary.blockers : []),
          ].filter(Boolean)
        : [],
      lane: bondAttorneyWorkflowLane,
    })

    items.push({
      key: 'bond_cancellation',
      detailKey: 'bond-cancellation',
      accentKey: 'cancellation',
      title: 'Bond Cancellation',
      summary: requiresCancellationWorkflow
        ? (cancellationWorkflowLane ? getWorkflowExplanation(cancellationWorkflowLane) : 'Bond cancellation is required for this seller transaction.')
        : 'No bond cancellation workflow is required for this transaction.',
      required: requiresCancellationWorkflow,
      statusKey: requiresCancellationWorkflow
        ? (cancellationWorkflowLane ? getWorkflowHealthKey(cancellationWorkflowLane) : 'not_started')
        : 'not_started',
      statusLabel: requiresCancellationWorkflow
        ? (cancellationWorkflowLane ? getWorkflowHealthLabel(cancellationWorkflowLane) : 'Not Started')
        : 'Not Required',
      progressPercent: requiresCancellationWorkflow
        ? getConditionalLegalWorkflowProgress({
            workflowKey: 'cancellation',
            lane: cancellationWorkflowLane,
            facts: routingFacts,
            fallback: cancellationWorkflowLane?.summary?.completionPercent,
          })
        : 0,
      nextStep: requiresCancellationWorkflow
        ? (cancellationWorkflowLane
            ? (getCurrentWorkflowStep(cancellationWorkflowLane)
                ? getWorkflowStepLabel(getCurrentWorkflowStep(cancellationWorkflowLane))
                : cancellationWorkflowLane?.summary?.nextAction || 'Workflow review')
            : 'Assign cancellation attorney')
        : 'Not required',
      assignedLabel: 'Assigned Cancellation Attorney',
      assignedDisplay: cancellationAttorney?.organisationName || cancellationAttorney?.participantName || cancellationAttorney?.participantEmail || 'Not assigned',
      assignedOrganisation: cancellationAttorney?.organisationName || cancellationAttorney?.firmName || 'Not assigned',
      assignedContact: cancellationAttorney?.participantName || cancellationAttorney?.participantEmail || 'Not assigned',
      route: `${transactionWorkspaceBasePath}/transfer/bond-cancellation`,
      activityCount: activityFeed.filter((entry) => (entry?.filterKeys || []).includes('cancellation')).length,
      reasonChips: buildLegalWorkflowReasonChips(routingFacts, 'cancellation'),
      blockers: requiresCancellationWorkflow
        ? [
            !cancellationAttorney ? 'Cancellation attorney still needs to be assigned.' : '',
            ...(Array.isArray(cancellationWorkflowLane?.summary?.blockers) ? cancellationWorkflowLane.summary.blockers : []),
          ].filter(Boolean)
        : [],
      lane: cancellationWorkflowLane,
    })

    return items
  }, [
    activityFeed,
    bondAttorney,
    bondAttorneyWorkflowLane,
    cancellationAttorney,
    cancellationWorkflowLane,
    requiresBondRegistrationWorkflow,
    requiresCancellationWorkflow,
    routingDiagnostics,
    transaction?.assigned_attorney_email,
    transaction?.attorney,
    transactionFinanceWorkflow,
    transactionWorkspaceBasePath,
    transferAttorney,
    transferWorkflowLane,
  ])
  const transferHubWorkflows = useMemo(
    () => legalWorkflowModels.filter((item) => item.required),
    [legalWorkflowModels],
  )
  const activeLegalWorkflowModel = useMemo(
    () => legalWorkflowModels.find((item) => item.detailKey === activeLegalWorkflowDetailKey) || null,
    [activeLegalWorkflowDetailKey, legalWorkflowModels],
  )
  const transactionContactRows = [
    {
      key: 'buyer',
      role: 'Buyer',
      contact: roleplayerForm.buyerName || buyer?.name || 'Not assigned',
      company: 'Client',
      email: roleplayerForm.buyerEmail || buyer?.email || 'Not captured',
      phone: roleplayerForm.buyerPhone || buyer?.phone || 'Not captured',
      status: roleplayerForm.buyerEmail || buyer?.email ? 'Active' : 'Pending',
    },
    {
      key: 'seller',
      role: 'Seller',
      contact: roleplayerForm.sellerName || transaction?.seller_name || 'Not assigned',
      company: 'Client',
      email: roleplayerForm.sellerEmail || transaction?.seller_email || 'Not captured',
      phone: roleplayerForm.sellerPhone || transaction?.seller_phone || 'Not captured',
      status: roleplayerForm.sellerEmail || transaction?.seller_email ? 'Active' : 'Pending',
    },
    {
      key: 'agent',
      role: 'Agent',
      contact: roleplayerForm.agentName || assignedAgent?.participantName || transaction?.assigned_agent || 'Not assigned',
      company: assignedAgent?.organisationName || development?.name || 'Sales Team',
      email: roleplayerForm.agentEmail || assignedAgent?.participantEmail || transaction?.assigned_agent_email || 'Not captured',
      phone: assignedAgent?.participantPhone || 'Not captured',
      status: roleplayerForm.agentEmail || assignedAgent?.participantEmail || transaction?.assigned_agent_email ? 'Active' : 'Pending',
    },
    {
      key: 'transfer_attorney',
      role: 'Transfer Attorney',
      contact: transferAttorney?.participantName || transaction?.attorney || transferAttorney?.participantEmail || 'Not assigned',
      company: transferAttorney?.organisationName || transferAttorney?.firmName || transaction?.attorney || 'Not assigned',
      email: transferAttorney?.participantEmail || transaction?.assigned_attorney_email || 'Not captured',
      phone: transferAttorney?.participantPhone || 'Not captured',
      status: transferAttorney ? 'Assigned' : 'Not assigned',
      visible: true,
    },
    {
      key: 'bond_originator',
      role: 'Bond Originator',
      contact: assignedBondOriginator?.participantName || transaction?.bond_originator || assignedBondOriginator?.participantEmail || 'Not assigned',
      company: assignedBondOriginator?.organisationName || transaction?.bond_originator || 'Not assigned',
      email: assignedBondOriginator?.participantEmail || transaction?.assigned_bond_originator_email || 'Not captured',
      phone: assignedBondOriginator?.participantPhone || 'Not captured',
      status: assignedBondOriginator ? 'Assigned' : 'Not assigned',
      visible: requiresBondOriginatorCard,
    },
    {
      key: 'bond_attorney',
      role: 'Bond Attorney',
      contact: bondAttorney?.participantName || bondAttorney?.participantEmail || 'Not assigned',
      company: bondAttorney?.organisationName || bondAttorney?.firmName || 'Not assigned',
      email: bondAttorney?.participantEmail || 'Not captured',
      phone: bondAttorney?.participantPhone || 'Not captured',
      status: bondAttorney ? 'Assigned' : 'Not assigned',
      visible: requiresBondAttorneyCard,
    },
    {
      key: 'cancellation_attorney',
      role: 'Cancellation Attorney',
      contact: cancellationAttorney?.participantName || cancellationAttorney?.participantEmail || 'Not assigned',
      company: cancellationAttorney?.organisationName || cancellationAttorney?.firmName || 'Not assigned',
      email: cancellationAttorney?.participantEmail || 'Not captured',
      phone: cancellationAttorney?.participantPhone || 'Not captured',
      status: cancellationAttorney ? 'Assigned' : 'Not assigned',
      visible: requiresCancellationAttorneyCard,
    },
  ].filter((item) => item.visible !== false)
  const filteredActivityFeed = useMemo(
    () =>
      activityFeed.filter((entry) => {
        if (activityFilter === 'all') return true
        return (entry.filterKeys || []).includes(activityFilter)
      }),
    [activityFeed, activityFilter],
  )
  const groupedActivityFeed = useMemo(() => groupActivityByDate(filteredActivityFeed), [filteredActivityFeed])
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
        canSend: Boolean(row.email),
      }
    })
  }, [activeStakeholders, buyer?.email, buyer?.name, isPrivateMatter, onboardingCompleted, transaction?.seller_email, transaction?.seller_name])

  const detailPanelSections = useMemo(
    () => ({
      matter: {
        title: workspaceRole === 'bond_originator' ? 'Application Details' : 'Matter Details',
        subtitle: workspaceRole === 'bond_originator'
          ? 'Reference and application metadata relevant to bond execution.'
          : 'Reference and transaction metadata relevant to legal execution.',
        summary: `${transferStageLabel} • ${workspaceReference}`,
        items: [
          { label: workspaceRole === 'bond_originator' ? 'Application ID' : 'Matter Number', value: workspaceReference },
          { label: 'Development', value: development?.name || 'Standalone matter' },
          { label: 'Unit', value: unit?.unit_number ? `Unit ${unit.unit_number}` : 'Not linked' },
          { label: 'Property Address', value: propertyAddress || transaction?.property_description || 'Not set' },
          { label: workspaceRole === 'bond_originator' ? 'Application Type' : 'Transaction Type', value: matterTypeLabel },
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
      workspaceReference,
      workspaceRole,
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
    setRoleplayerForm({
      buyerName: buyer?.name || '',
      buyerEmail: buyer?.email || '',
      buyerPhone: buyer?.phone || '',
      sellerName: transaction?.seller_name || '',
      sellerEmail: transaction?.seller_email || '',
      sellerPhone: transaction?.seller_phone || '',
      agentName: transaction?.assigned_agent || '',
      agentEmail: transaction?.assigned_agent_email || '',
      attorneyName: transaction?.attorney || transferAttorney?.participantName || '',
      attorneyEmail: transaction?.assigned_attorney_email || transferAttorney?.participantEmail || '',
      bondOriginatorName: transaction?.bond_originator || '',
      bondOriginatorEmail: transaction?.assigned_bond_originator_email || '',
      matterOwner: transaction?.matter_owner || '',
    })
  }, [
    buyer?.email,
    buyer?.name,
    buyer?.phone,
    transaction,
    transferAttorney?.participantEmail,
    transferAttorney?.participantName,
  ])

  useEffect(() => {
    if (!isAgentTransactionView || roleplayerConfirmOpen) return
    setRoleplayerConfirmDraft({
      transferAttorney: transferAttorneyOptions[0]?.id || '',
      bondOriginator: bondOriginatorOptions[0]?.id || '',
      bondAttorney: bondAttorneyOptions[0]?.id || '',
      cancellationAttorney: cancellationAttorneyOptions[0]?.id || '',
    })
  }, [bondAttorneyOptions, bondOriginatorOptions, cancellationAttorneyOptions, isAgentTransactionView, roleplayerConfirmOpen, transferAttorneyOptions])

  useEffect(() => {
    if (!isAgentTransactionView || !roleplayerConfirmOpen) return
    setRoleplayerConfirmDraft((previous) => ({
      transferAttorney: findRoleplayerOptionInList(transferAttorneyOptions, previous.transferAttorney)?.id || transferAttorneyOptions[0]?.id || '',
      bondOriginator: findRoleplayerOptionInList(bondOriginatorOptions, previous.bondOriginator)?.id || bondOriginatorOptions[0]?.id || '',
      bondAttorney: findRoleplayerOptionInList(bondAttorneyOptions, previous.bondAttorney)?.id || bondAttorneyOptions[0]?.id || '',
      cancellationAttorney:
        findRoleplayerOptionInList(cancellationAttorneyOptions, previous.cancellationAttorney)?.id ||
        cancellationAttorneyOptions[0]?.id ||
        '',
    }))
  }, [bondAttorneyOptions, bondOriginatorOptions, cancellationAttorneyOptions, isAgentTransactionView, roleplayerConfirmOpen, transferAttorneyOptions])

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

  async function resolveSellerPortalInviteContext() {
    if (!transaction?.id) {
      throw new Error('Seller portal link could not be generated.')
    }
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Seller portal link could not be generated.')
    }

    let resolvedSellerEmail = sellerEmail
    let resolvedSellerName = sellerDisplayName === 'Seller details pending' ? '' : sellerDisplayName
    let sellerWorkspaceToken = ''
    let listingId = ''

    const contextQuery = await supabase
      .from('client_portal_contexts')
      .select('seller_workspace_token, client_email, listing_id, status, updated_at')
      .eq('transaction_id', transaction.id)
      .eq('context_type', 'selling')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (contextQuery.error && String(contextQuery.error?.code || '') !== '42P01') {
      throw new Error('Seller portal link could not be generated.')
    }

    const contextRow = contextQuery.data || null
    sellerWorkspaceToken = cleanDetailText(contextRow?.seller_workspace_token)
    resolvedSellerEmail = resolvedSellerEmail || cleanDetailEmail(contextRow?.client_email)
    listingId = cleanDetailText(contextRow?.listing_id)

    if ((!sellerWorkspaceToken || !resolvedSellerEmail) && listingId) {
      const onboardingQuery = await supabase
        .from('private_listing_seller_onboarding')
        .select('token, form_data, updated_at')
        .eq('private_listing_id', listingId)
        .maybeSingle()

      if (onboardingQuery.error && String(onboardingQuery.error?.code || '') !== '42P01') {
        throw new Error('Seller portal link could not be generated.')
      }

      const onboardingRow = onboardingQuery.data || null
      const formData = onboardingRow?.form_data && typeof onboardingRow.form_data === 'object' ? onboardingRow.form_data : {}
      sellerWorkspaceToken = sellerWorkspaceToken || cleanDetailText(onboardingRow?.token)
      resolvedSellerEmail = resolvedSellerEmail || cleanDetailEmail(formData.sellerEmail || formData.email || formData.contactEmail)
      resolvedSellerName =
        resolvedSellerName ||
        cleanDetailText(
          buildDisplayName(formData.sellerFirstName || formData.firstName, formData.sellerSurname || formData.lastName) ||
          formData.sellerName ||
          formData.fullName,
        )
    }

    if (!resolvedSellerEmail) {
      throw new Error('Seller email is missing.')
    }

    const onboardingLink = buildSellerClientPortalLink(sellerWorkspaceToken)
    if (!onboardingLink) {
      throw new Error('Seller portal link could not be generated.')
    }

    return {
      sellerEmail: resolvedSellerEmail,
      sellerName: resolvedSellerName || 'Seller',
      onboardingLink,
    }
  }

  async function sendBuyerOnboardingViaResend({ resend = false, source = 'agent_transaction_workspace' } = {}) {
    if (!transaction?.id) {
      throw new Error('Transaction data is not available for buyer onboarding.')
    }
    if (!isSupabaseConfigured) {
      throw new Error('Supabase is not configured in this environment.')
    }

    const response = await invokeEdgeFunction('send-email', {
      body: {
        type: 'client_onboarding',
        transactionId: transaction.id,
        resend,
        source,
      },
    })
    const responseError = response?.error || response?.data?.error
    if (responseError) {
      const parsedMessage = response?.error
        ? await parseEdgeFunctionError(response.error, 'Unable to send buyer onboarding right now.')
        : typeof responseError === 'string'
          ? responseError
          : responseError?.message || 'Unable to send buyer onboarding right now.'
      throw new Error(parsedMessage)
    }
    return response?.data || {}
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
    if (recipient.key !== 'buyer') {
      setOnboardingActionMessage('Resend delivery is available for buyer onboarding. Copy the link for this recipient instead.')
      return
    }

    try {
      setOnboardingActionBusy(true)
      setError('')
      const result = await sendBuyerOnboardingViaResend({
        resend: onboardingCompleted,
        source: 'transaction_workspace_recipient_action',
      })
      setOnboardingActionMessage(`Buyer onboarding sent to ${result?.recipientEmail || recipient.email}.`)
      await loadData({ background: true })
      window.dispatchEvent(new Event('itg:transaction-updated'))
    } catch (sendError) {
      setError(sendError?.message || 'Unable to send buyer onboarding right now.')
    } finally {
      setOnboardingActionBusy(false)
    }
  }

  function findRoleplayerOption(roleType, id) {
    const options =
      roleType === 'bond_originator'
        ? bondOriginatorOptions
        : roleType === 'bond_attorney'
          ? bondAttorneyOptions
          : transferAttorneyOptions
    const normalizedId = normalizeRoleplayerOptionValue(id)
    if (!normalizedId) return null
    return options.find((option) => normalizeRoleplayerOptionValue(option.id) === normalizedId) || null
  }

  function updateRoleplayerConfirmDraft(field, value) {
    setRoleplayerConfirmError('')
    setRoleplayerConfirmDraft((previous) => ({ ...previous, [field]: value }))
  }

  function buildRoleplayerSelection(roleType, option) {
    if (!option) return null
    return {
      roleType,
      organisationId: option.organisationId,
      relationshipId: option.relationshipId,
      companyName: option.companyName,
      contactPerson: option.contactPerson || option.companyName,
      email: option.email,
      scopeType: option.scopeType,
      scopeId: option.scopeId,
      scopeLabel: option.scopeLabel,
      preferred: option.preferred,
      selectionSource: option.preferred ? 'preferred_partner' : option.group === 'Recently Used' ? 'recently_used' : 'connected_partner',
      assignmentStatus: 'selected',
      activationTrigger:
        roleType === 'bond_originator'
          ? 'buyer_selects_bond_or_hybrid'
          : roleType === 'bond_attorney'
            ? 'bond_approved'
            : 'attorney_instruction_stage',
    }
  }

  function openRoleplayerConfirmation() {
    if (!canManageTransactionRoleplayers) {
      setError('You do not have permission to manage transaction roleplayers.')
      return
    }
    setRoleplayerConfirmError('')
    setOnboardingActionMessage('')
    setRoleplayerConfirmDraft({
      transferAttorney: findRoleplayerOptionInList(transferAttorneyOptions, roleplayerConfirmDraft.transferAttorney)?.id || transferAttorneyOptions[0]?.id || '',
      bondOriginator: findRoleplayerOptionInList(bondOriginatorOptions, roleplayerConfirmDraft.bondOriginator)?.id || bondOriginatorOptions[0]?.id || '',
      bondAttorney: findRoleplayerOptionInList(bondAttorneyOptions, roleplayerConfirmDraft.bondAttorney)?.id || bondAttorneyOptions[0]?.id || '',
      cancellationAttorney:
        findRoleplayerOptionInList(cancellationAttorneyOptions, roleplayerConfirmDraft.cancellationAttorney)?.id ||
        cancellationAttorneyOptions[0]?.id ||
        '',
    })
    setRoleplayerConfirmOpen(true)
  }

  async function handleCopyBuyerOnboardingLinkFromConfirmation() {
    try {
      setOnboardingActionBusy(true)
      setRoleplayerConfirmError('')
      const linkUrl = await getOnboardingLinkUrl()
      await navigator.clipboard.writeText(linkUrl)
      setOnboardingActionMessage('Buyer onboarding link copied. The agent can paste it into WhatsApp, SMS, or a manual email.')
    } catch (copyError) {
      setRoleplayerConfirmError(copyError?.message || 'Unable to copy the buyer onboarding link right now.')
    } finally {
      setOnboardingActionBusy(false)
    }
  }

  async function handleAgentHeaderOnboardingAction() {
    const recipient = {
      roleLabel: onboardingCompleted ? 'Client portal' : 'Buyer',
      name: buyerDisplayName || 'Buyer',
      email: buyerEmail,
    }

    if (!recipient.email) {
      setOnboardingActionMessage('Buyer email is missing.')
      setOnboardingModalOpen(true)
      return
    }

    if (!onboardingCompleted) {
      openRoleplayerConfirmation()
      return
    }

    try {
      setOnboardingActionBusy(true)
      setError('')
      setOnboardingActionMessage('')
      await sendBuyerOnboardingViaResend({
        resend: onboardingCompleted,
        source: onboardingCompleted ? 'agent_transaction_header_client_portal_resend' : 'agent_transaction_header_buyer_onboarding',
      })
      setOnboardingActionMessage('Buyer portal link sent.')
      await loadData({ background: true })
      window.dispatchEvent(new Event('itg:transaction-updated'))
    } catch (sendError) {
      setOnboardingActionMessage(sendError?.message || 'Could not send buyer portal link.')
    } finally {
      setOnboardingActionBusy(false)
    }
  }

  async function handleSendSellerPortalLink() {
    if (!sellerEmail) {
      setOnboardingActionMessage('Seller email is missing.')
      return
    }

    try {
      setSellerPortalBusy(true)
      setError('')
      setOnboardingActionMessage('')

      const inviteContext = await resolveSellerPortalInviteContext()
      const response = await invokeEdgeFunction('send-email', {
        body: {
          type: 'seller_onboarding_link',
          to: inviteContext.sellerEmail,
          organisationId: cleanDetailText(workspaceOrganisationId),
          sellerName: inviteContext.sellerName,
          propertyTitle: cleanDetailText(propertyAddress || matterHeadline || 'your property'),
          onboardingLink: inviteContext.onboardingLink,
          agentName: cleanDetailText(transaction?.assigned_agent || profile?.fullName || profile?.name || profile?.email || 'Bridge'),
        },
      })
      const responseError = response?.error || response?.data?.error
      if (responseError) {
        const parsedMessage = response?.error
          ? await parseEdgeFunctionError(response.error, 'Could not send seller portal link.')
          : typeof responseError === 'string'
            ? responseError
            : responseError?.message || 'Could not send seller portal link.'
        throw new Error(parsedMessage)
      }

      setOnboardingActionMessage('Seller portal link sent.')
    } catch (sendError) {
      setOnboardingActionMessage(sendError?.message || 'Could not send seller portal link. Try again.')
    } finally {
      setSellerPortalBusy(false)
    }
  }

  async function handleConfirmRoleplayersAndSendOnboarding({ allowMissingBondOriginator = false } = {}) {
    const recipient = {
      roleLabel: 'Buyer',
      name: buyer?.name || 'Buyer',
      email: buyer?.email || roleplayerForm.buyerEmail || '',
    }
    const transferOption =
      findRoleplayerOption('transfer_attorney', roleplayerConfirmDraft.transferAttorney) ||
      buildExistingRoleplayerOption(savedTransferRoleplayer, 'transfer_attorney') ||
      buildExistingRoleplayerOption(transferAttorney, 'transfer_attorney') ||
      (transaction?.attorney || transaction?.assigned_attorney_email
        ? buildExistingRoleplayerOption(
            {
              partnerName: transaction?.attorney,
              emailAddress: transaction?.assigned_attorney_email,
            },
            'transfer_attorney',
          )
        : null) ||
      transferAttorneyOptions[0] ||
      null
    const bondOriginatorOption = findRoleplayerOption('bond_originator', roleplayerConfirmDraft.bondOriginator)
    const bondAttorneyOption = findRoleplayerOption('bond_attorney', roleplayerConfirmDraft.bondAttorney)
    const cancellationAttorneyOption = findRoleplayerOption('cancellation_attorney', roleplayerConfirmDraft.cancellationAttorney)

    if (!transferOption) {
      setRoleplayerConfirmError('Transfer Attorney is required before buyer onboarding can be sent.')
      return
    }
    if (!bondOriginatorOption && !allowMissingBondOriginator) {
      setRoleplayerConfirmError('No bond originator selected. If the buyer chooses bond finance, no originator will be notified automatically.')
      return
    }

    const selections = [
      buildRoleplayerSelection('transfer_attorney', transferOption),
      buildRoleplayerSelection('bond_originator', bondOriginatorOption),
      buildRoleplayerSelection('bond_attorney', bondAttorneyOption),
      buildRoleplayerSelection('cancellation_attorney', cancellationAttorneyOption),
    ].filter(Boolean)

    try {
      setOnboardingActionBusy(true)
      setRoleplayerConfirmError('')
      setError('')
      const refreshed = await saveTransactionRoleplayerSelections({
        transactionId: transaction.id,
        roleplayers: selections,
        actorRole: workspaceRole,
      })
      if (refreshed) {
        setData(refreshed)
      }
      const sendResult = await sendBuyerOnboardingViaResend({
        resend: false,
        source: 'buyer_onboarding_roleplayer_confirmation',
      })
      await recordBuyerOnboardingSent({
        transactionId: transaction.id,
        actorRole: workspaceRole,
        recipientEmail: recipient.email,
        roleplayers: selections,
      })
      setRoleplayerConfirmOpen(false)
      setOnboardingActionMessage(`Buyer onboarding sent to ${sendResult?.recipientEmail || recipient.email} after confirming roleplayers.`)
      await loadData({ background: true })
      window.dispatchEvent(new Event('itg:transaction-updated'))
    } catch (sendError) {
      setRoleplayerConfirmError(sendError?.message || 'Unable to confirm roleplayers and prepare the buyer onboarding link.')
    } finally {
      setOnboardingActionBusy(false)
    }
  }

  async function persistRoleplayerContacts() {
    if (!transaction?.id) return

    const refreshed = await updateTransactionStakeholderContacts({
      transactionId: transaction.id,
      buyerName: roleplayerForm.buyerName,
      buyerEmail: roleplayerForm.buyerEmail,
      buyerPhone: roleplayerForm.buyerPhone,
      sellerName: roleplayerForm.sellerName,
      sellerEmail: roleplayerForm.sellerEmail,
      sellerPhone: roleplayerForm.sellerPhone,
      agentName: roleplayerForm.agentName,
      agentEmail: roleplayerForm.agentEmail,
      attorneyName: roleplayerForm.attorneyName,
      attorneyEmail: roleplayerForm.attorneyEmail,
      bondOriginatorName: roleplayerForm.bondOriginatorName,
      bondOriginatorEmail: roleplayerForm.bondOriginatorEmail,
      matterOwner: roleplayerForm.matterOwner,
      actorRole: workspaceRole,
    })
    if (refreshed) {
      setData(refreshed)
    } else {
      await loadData()
    }
    window.dispatchEvent(new Event('itg:transaction-updated'))
    return refreshed
  }

  async function handleSendRoleplayerIntro() {
    if (!transaction?.id) return
    if (!roleplayerForm.buyerEmail.trim()) {
      setError('Buyer email is required before sending the roleplayer introduction.')
      return
    }
    if (!roleplayerForm.attorneyName.trim() && !roleplayerForm.attorneyEmail.trim()) {
      setError('Capture the transfer attorney before sending the roleplayer introduction.')
      return
    }
    if (financeRequiresBondSupport && !roleplayerForm.bondOriginatorName.trim() && !roleplayerForm.bondOriginatorEmail.trim()) {
      setError('Capture the bond originator before sending the roleplayer introduction for this finance transaction.')
      return
    }
    if (!roleplayerReadiness.canSendIntro) {
      setError((roleplayerReadiness.blockers || []).map((item) => item.label).join(' • ') || 'Complete the required handoff items before sending the roleplayer introduction.')
      return
    }

    try {
      setRoleplayerIntroBusy(true)
      setError('')
      setStakeholderMessage('')
      setInviteLinkResult('')
      await persistRoleplayerContacts()
      const response = await invokeEdgeFunction('send-email', {
        body: {
          type: 'transaction_roleplayer_intro',
          transactionId: transaction.id,
          to: roleplayerForm.buyerEmail,
          recipientName: roleplayerForm.buyerName,
          resend: true,
        },
      })
      const responseError = response?.error || response?.data?.error
      if (responseError) {
        const parsedMessage = response?.error
          ? await parseEdgeFunctionError(response.error, 'Unable to send roleplayer introduction.')
          : typeof responseError === 'string'
            ? responseError
            : responseError?.message || 'Unable to send roleplayer introduction.'
        throw new Error(parsedMessage)
      }
      setStakeholderMessage(`Roleplayer introduction sent to ${roleplayerForm.buyerEmail}.`)
      await loadData({ background: true })
    } catch (introError) {
      setError(introError.message || 'Unable to send roleplayer introduction.')
    } finally {
      setRoleplayerIntroBusy(false)
    }
  }

  async function handleSendRoleplayerHandoff() {
    if (!transaction?.id) return
    if (!roleplayerReadiness.canSendTeamHandoff) {
      setError(`${roleplayerReadiness.teamHandoffBlockers.join(' and ')} required before sending the team handoff.`)
      return
    }

    try {
      setRoleplayerHandoffBusy(true)
      setError('')
      setStakeholderMessage('')
      setInviteLinkResult('')
      await persistRoleplayerContacts()
      const response = await invokeEdgeFunction('send-email', {
        body: {
          type: 'transaction_roleplayer_handoff',
          transactionId: transaction.id,
          resend: true,
        },
      })
      const responseError = response?.error || response?.data?.error
      if (responseError) {
        const parsedMessage = response?.error
          ? await parseEdgeFunctionError(response.error, 'Unable to send team handoff.')
          : typeof responseError === 'string'
            ? responseError
            : responseError?.message || 'Unable to send team handoff.'
        throw new Error(parsedMessage)
      }
      const sentCount = Array.isArray(response?.data?.sentRecipients) ? response.data.sentRecipients.length : 0
      setStakeholderMessage(`Team handoff sent to ${sentCount || 'the'} roleplayer${sentCount === 1 ? '' : 's'}.`)
      await loadData({ background: true })
    } catch (handoffError) {
      setError(handoffError.message || 'Unable to send team handoff.')
    } finally {
      setRoleplayerHandoffBusy(false)
    }
  }

  function openRoleplayerActivityFeed() {
    setWorkspaceMenu('activity')
    setActivityFilter('roleplayers')
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

  function openDocumentUploadModal({ requirement = null, category = '' } = {}) {
    const canonicalRequirementInstanceId = requirement ? getRequirementCanonicalId(requirement) || requirement.canonicalRequirementInstanceId || '' : ''
    const requiredDocumentKey = requirement?.key || requirement?.documentKey || requirement?.document_key || ''
    const selectedCategory = requirement
      ? getAttorneyCategoryForRequiredDocument(requirement)
      : category
        ? getUploadCategoryForLibraryFilter(category)
        : getUploadCategoryForLibraryFilter(activeDocumentLibraryCategory)

    setUploadDraft((previous) => ({
      ...previous,
      file: null,
      fileName: '',
      category: selectedCategory,
      documentType: requiredDocumentKey || previous.documentType || '',
      visibility: previous.visibility || 'client_visible',
      relatedWorkflow: requirement?.owningWorkflow || requirement?.visibleSection || previous.relatedWorkflow || '',
      satisfiesRequiredDocument: requirement ? 'yes' : 'no',
      requiredDocumentKey,
      requiredDocumentId: requirement?.id || '',
      canonicalRequirementInstanceId,
      documentRequestId: requirement?.documentRequestId || requirement?.document_request_id || '',
      notes: '',
      requestTitle: requirement?.label || requirement?.documentLabel || requirement?.document_label || '',
    }))
    setUploadInputVersion((previous) => previous + 1)
    setUploadDocumentModalOpen(true)
  }

  async function handleUploadDocument(event) {
    event.preventDefault()
    if (!transaction?.id || !uploadDraft.file) {
      return
    }

    const linkedRequirement =
      uploadDraft.satisfiesRequiredDocument === 'yes'
        ? requiredDocumentChecklist.find((item) => {
            const canonicalId = getRequirementCanonicalId(item)
            return (
              (uploadDraft.canonicalRequirementInstanceId && String(canonicalId || '') === String(uploadDraft.canonicalRequirementInstanceId)) ||
              (uploadDraft.requiredDocumentId && String(item?.id || '') === String(uploadDraft.requiredDocumentId)) ||
              (uploadDraft.requiredDocumentKey && String(item?.key || item?.documentKey || item?.document_key || '') === String(uploadDraft.requiredDocumentKey))
            )
          }) || null
        : null
    const selectedVisibility = String(uploadDraft.visibility || 'client_visible').trim().toLowerCase()
    const visibilityScope = selectedVisibility === 'internal' ? 'internal' : 'shared'

    try {
      setSaving(true)
      setError('')
      await uploadDocument({
        transactionId: transaction.id,
        file: uploadDraft.file,
        category: uploadDraft.category,
        isClientVisible: visibilityScope !== 'internal',
        visibilityScope,
        stageKey: uploadDraft.relatedWorkflow || transferStageKey,
        requiredDocumentKey: linkedRequirement ? (uploadDraft.requiredDocumentKey || linkedRequirement?.key || null) : null,
        documentType: uploadDraft.documentType || uploadDraft.requiredDocumentKey || null,
        canonicalRequirementInstanceId: linkedRequirement ? (uploadDraft.canonicalRequirementInstanceId || null) : null,
        documentRequestId: uploadDraft.documentRequestId || null,
      })
      setUploadDraft((previous) => ({
        ...previous,
        file: null,
        fileName: '',
        notes: '',
        satisfiesRequiredDocument: 'no',
        requiredDocumentKey: '',
        requiredDocumentId: '',
        canonicalRequirementInstanceId: '',
        documentRequestId: '',
        requestTitle: '',
      }))
      setUploadInputVersion((previous) => previous + 1)
      setUploadDocumentModalOpen(false)
      await loadData()
    } catch (uploadError) {
      setError(uploadError.message || 'Unable to upload document.')
    } finally {
      setSaving(false)
    }
  }

  function openReviewAction(action, document, requirement) {
    setReviewActionDraft({
      open: true,
      action,
      document,
      requirement,
      reason: '',
    })
  }

  function handleReplaceDocument(document, requirement) {
    const canonicalRequirementInstanceId = getRequirementCanonicalId(requirement) || getDocumentCanonicalId(document)
    setUploadDraft((previous) => ({
      ...previous,
      canonicalRequirementInstanceId: canonicalRequirementInstanceId || '',
      requiredDocumentKey: requirement?.key || document?.document_type || '',
      category: requirement ? getAttorneyCategoryForRequiredDocument(requirement) : previous.category,
      visibility: document?.visibility_scope === 'internal' ? 'internal' : previous.visibility,
    }))
    setWorkspaceMenu('documents')
    setUploadDocumentModalOpen(true)
    setUploadInputVersion((previous) => previous + 1)
  }

  function openDocumentRequestUploadModal(row = {}) {
    setUploadDraft((previous) => ({
      ...previous,
      file: null,
      fileName: '',
      category: getUploadCategoryForLibraryFilter(row.category || 'finance'),
      documentType: row.requiredDocumentKey || row.displayName || previous.documentType || '',
      visibility: previous.visibility || 'client_visible',
      relatedWorkflow: row.relatedWorkflow || previous.relatedWorkflow || 'finance',
      satisfiesRequiredDocument: 'no',
      requiredDocumentKey: '',
      requiredDocumentId: '',
      canonicalRequirementInstanceId: '',
      documentRequestId: row.documentRequestId || '',
      notes: '',
      requestTitle: row.displayName || '',
    }))
    setUploadInputVersion((previous) => previous + 1)
    setUploadDocumentModalOpen(true)
  }

  async function handleSubmitReviewAction() {
    const requirement = reviewActionDraft.requirement || null
    const document = reviewActionDraft.document || null
    const action = reviewActionDraft.action
    const requirementInstanceId = getRequirementCanonicalId(requirement) || getDocumentCanonicalId(document)
    if (!requirementInstanceId || !action) return

    try {
      setSaving(true)
      setError('')
      await reviewCanonicalDocumentRequirement({
        requirementInstanceId,
        documentId: document?.id || getRequirementDocumentId(requirement),
        action,
        reason: reviewActionDraft.reason,
      })
      setReviewActionDraft({ open: false, action: '', document: null, requirement: null, reason: '' })
      await loadData()
    } catch (reviewError) {
      setError(reviewError.message || 'Unable to update canonical document review.')
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
        authorName: profile?.fullName || profile?.email || 'Bridge Conveyancing',
        authorRole: 'attorney',
        commentText: prefixedDiscussion,
        unitId: unit?.id || null,
      })
      setDiscussionBody('')
      setDiscussionType('operational')
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
          <Link
            to={workspaceBackPath}
            className="no-print inline-flex w-fit items-center gap-2 rounded-[12px] border border-borderDefault bg-white px-3.5 py-2 text-sm font-semibold text-textBody shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:border-borderStrong hover:bg-surfaceAlt hover:text-textStrong"
          >
            <ChevronRight size={15} className="rotate-180" />
            {workspaceBackLabel}
          </Link>
            {workspaceRole === 'bond_originator' ? (
              <BondApplicationHeader
                reference={workspaceReference}
                buyerName={buyerDisplayName}
                propertyLabel={matterHeadline}
                purchasePrice={formatCurrencyValue(transaction?.purchase_price || transaction?.sales_price, '')}
                ageLabel={daysBetween(transaction?.created_at)}
                consultant={transaction?.bond_originator || transaction?.assigned_bond_originator_name || getParticipantDisplayName(assignedBondOriginator) || 'Unassigned'}
                owner={transaction?.bond_originator || transaction?.assigned_bond_processor_name || transaction?.processor_name || 'Unassigned'}
                statusLabel={hydratingDetail ? 'Refreshing' : displayedLifecycleLabel}
              />
            ) : (
              <MatterOverviewHeader
                title={workspaceReference}
                clientTitle={buyerDisplayName}
                transactionStageLabel={transferStageLabel}
                transaction={transaction}
                mainStage={mainStage}
                statusLabel={hydratingDetail ? 'Refreshing' : displayedLifecycleLabel}
                statusClassName={displayedLifecycleStatusClassName}
                propertyLabel={isAgentTransactionView ? (propertyAddress || matterHeadline) : matterHeadline}
                subtitle={matterSubtitle}
                buyerName={buyerDisplayName}
                sellerName={sellerDisplayName}
                agentName={transaction?.assigned_agent || getParticipantDisplayName(assignedAgent)}
                assignedFirms={matterAssignedFirms}
                metrics={matterHeaderMetrics}
                progressIndex={matterProgressIndex}
                matterHealthLabel={displayedMatterHealthLabel}
                daysActiveLabel={daysBetween(transaction?.created_at)}
                updatedLabel={displayedUpdatedLabel}
                lifecycleProgress={displayedLifecycleProgress}
                actionButtons={headerWorkflowActionButtons}
                isAgentView={isAgentTransactionView}
              />
            )}
          <MatterWorkspaceTabs
            tabs={workspaceMenuTabs}
            activeTab={activeWorkspaceMenu}
            onChange={openWorkspaceMenu}
            premium={isAgentTransactionView}
            spread={workspaceRole === 'bond_originator'}
          />
          {onboardingActionMessage ? (
            <p className="rounded-[14px] border border-borderDefault bg-surfaceAlt px-4 py-2.5 text-helper text-textMuted">
              {onboardingActionMessage}
            </p>
          ) : null}
        </div>
      )}
    >
      <div className="space-y-6">
        {workspaceRole === 'bond_originator' && activeWorkspaceMenu === 'overview' ? (
          <section className="space-y-7">
            <FinanceProgressBar
              workflowData={transactionFinanceWorkflow}
              mode="editable"
              viewerRole={workspaceRole}
              loadingStage={bondHybridFinanceActionLoading}
              onStageChange={(stageKey) => void handleBondHybridFinanceStage(stageKey)}
            />

            <FinanceReadinessDashboard
              readiness={financeReadinessDashboard}
              onViewIssues={() => openWorkspaceMenu('documents')}
              onViewActionPlan={() => openWorkspaceMenu('tasks')}
            />

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
              <BankSubmissionTracker rows={bondSubmissionRows} onViewAll={() => setWorkspaceMenu('banks_quotes')} />
              <BestQuoteSummary
                quote={bestBondQuote}
                quotes={transactionFinanceWorkflow?.quotes || transactionFinanceWorkflow?.offers || []}
                loading={Boolean(bondHybridFinanceActionLoading)}
                onAccept={(quoteId) => void handleApproveBondHybridQuote(quoteId)}
                onViewAll={() => setWorkspaceMenu('banks_quotes')}
              />
            </section>

            <section className="rounded-[18px] border border-borderDefault bg-white p-6 shadow-[0_12px_28px_rgba(15,23,42,0.045)]">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold tracking-[-0.02em] text-textStrong">Matter Conversation</h3>
                  <p className="mt-1 text-sm text-textMuted">Updates, notes, roleplayer visibility, and system activity for this application.</p>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => openWorkspaceMenu('activity')}>
                  View all activity
                </Button>
              </div>
              <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.7fr)]">
                <form onSubmit={handleAddDiscussion} className="rounded-[14px] border border-borderSoft bg-surfaceAlt p-4">
                  <div className="mb-3 flex gap-2 border-b border-borderSoft">
                    <button type="button" className="border-b-2 border-primary px-3 py-2 text-sm font-semibold text-primary">Updates</button>
                    <button type="button" className="px-3 py-2 text-sm font-semibold text-textMuted">Notes</button>
                  </div>
                  <Field
                    as="textarea"
                    rows={4}
                    value={discussionBody}
                    onChange={(event) => setDiscussionBody(event.target.value)}
                    placeholder="Write an update, note, or @mention someone..."
                  />
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">
                      Update Type
                      <Field as="select" value={discussionType} onChange={(event) => setDiscussionType(event.target.value)} className="mt-1 min-h-9 text-xs">
                        {DISCUSSION_TYPES.map((item) => (
                          <option key={item.key} value={item.key}>{item.label}</option>
                        ))}
                      </Field>
                    </label>
                    <label className="text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">
                      Visibility
                      <Field as="select" value={discussionVisibility} onChange={(event) => setDiscussionVisibility(event.target.value)} className="mt-1 min-h-9 text-xs">
                        {availableDiscussionVisibilityOptions.map((item) => (
                          <option key={item.key} value={item.key}>{item.label}</option>
                        ))}
                      </Field>
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => openWorkspaceMenu('documents')}>
                      <Paperclip size={14} />
                      Attach Document
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        saving ||
                        !discussionBody.trim() ||
                        (discussionVisibility === 'internal' && !canPostInternalDiscussion) ||
                        (discussionVisibility === 'shared' && !canPostSharedDiscussion) ||
                        (discussionVisibility === 'client_visible' && !canPublishClientVisibleDiscussion)
                      }
                    >
                      <Send size={14} />
                      {saving ? 'Posting...' : 'Post Update'}
                    </Button>
                  </div>
                </form>

                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-textStrong">Recent Activity</h4>
                  <div className="mt-3 space-y-3">
                    {overviewConversationEntries.slice(0, 4).map((entry) => (
                      <article key={entry.id} className="rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <strong className="block truncate text-sm text-textStrong">{entry.authorName}</strong>
                            <p className="mt-1 line-clamp-2 text-sm leading-5 text-textMuted">{entry.body || entry.title}</p>
                          </div>
                          <span className="shrink-0 text-xs text-textMuted">{formatDateTime(entry.createdAt)}</span>
                        </div>
                      </article>
                    ))}
                    {!overviewConversationEntries.length ? (
                      <p className="rounded-[14px] border border-dashed border-borderDefault bg-surfaceAlt px-4 py-6 text-sm text-textMuted">
                        No activity yet. Updates, notes and system events will appear here.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          </section>
        ) : null}

        {workspaceRole !== 'bond_originator' && ['overview', 'transfer'].includes(activeWorkspaceMenu) ? (
          <>
            <section className={activeWorkspaceMenu === 'overview' ? 'grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]' : 'space-y-5'}>
              <div className="space-y-4">
                {activeWorkspaceMenu !== 'overview' ? (
                  activeLegalWorkflowDetailKey ? (
                    (() => {
                      const workflow = activeLegalWorkflowModel
                      const statusMeta = WORKFLOW_STATUS_META[workflow?.statusKey] || WORKFLOW_STATUS_META.not_started
                      const lane = workflow?.lane || null

                      if (!workflow) {
                        return (
                          <section className="rounded-[18px] border border-dashed border-borderDefault bg-white px-5 py-6 text-sm text-textMuted">
                            This workflow route is not available for the current transaction.
                          </section>
                        )
                      }

                      return (
                        <>
                          <section className="rounded-[18px] border border-borderDefault bg-white p-5 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div>
                                <Button type="button" variant="ghost" size="sm" onClick={closeLegalWorkflowDetail}>
                                  Back to Transfer Hub
                                </Button>
                                <h2 className="mt-3 text-[1.2rem] font-semibold tracking-[-0.03em] text-textStrong">{workflow.title}</h2>
                                <p className="mt-1 text-sm leading-6 text-textMuted">
                                  {activeLegalWorkflowDetailKey === 'bond-registration'
                                    ? 'Manage the bond registration workflow for this transaction.'
                                    : activeLegalWorkflowDetailKey === 'bond-cancellation'
                                      ? 'Manage the bond cancellation workflow for this transaction.'
                                      : 'Manage the transfer workflow for this transaction.'}
                                </p>
                              </div>
                              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${statusMeta.border} ${statusMeta.bg} ${statusMeta.text}`}>
                                <span className={`h-2 w-2 rounded-full ${statusMeta.dot}`} />
                                {workflow.statusLabel}
                              </span>
                            </div>

                            <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] gap-3">
                              {[
                                ['Status', workflow.statusLabel],
                                ['Progress', `${workflow.progressPercent}%`],
                                ['Next Step', workflow.nextStep || 'Pending'],
                                [workflow.assignedLabel, workflow.assignedDisplay || 'Not assigned'],
                              ].map(([label, value]) => (
                                <article key={`${workflow.key}-${label}`} className="min-w-0 rounded-[14px] border border-borderSoft bg-surfaceAlt px-3 py-3">
                                  <span className="block break-words text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{label}</span>
                                  <strong className="mt-1 block break-words text-sm text-textStrong">{value}</strong>
                                </article>
                              ))}
                            </div>
                          </section>

                          <LegalWorkflowProgressBar workflow={workflow} diagnostics={routingDiagnostics} />

                          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.55fr)]">
                            <section className="rounded-[18px] border border-borderDefault bg-white p-5 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <h3 className="text-sm font-semibold text-textStrong">Required Documents</h3>
                                  <p className="mt-1 text-sm text-textMuted">Conditional requirements for this routed legal workflow.</p>
                                </div>
                                <span className="inline-flex rounded-full border border-borderSoft bg-surfaceAlt px-3 py-1 text-xs font-semibold text-textMuted">
                                  {(lane?.documentRequirements || []).length} item{(lane?.documentRequirements || []).length === 1 ? '' : 's'}
                                </span>
                              </div>
                              <div className="mt-4 grid gap-2 md:grid-cols-2">
                                {(lane?.documentRequirements || []).length ? (
                                  lane.documentRequirements.map((item) => {
                                    const statusKey = normalizeWorkspaceStatus(item.status)
                                    const statusMeta = WORKFLOW_STATUS_META[statusKey] || WORKFLOW_STATUS_META.not_started
                                    return (
                                      <article key={item.id || item.key} className="rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-3">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <strong className="block text-sm text-textStrong">{item.label}</strong>
                                            <p className="mt-1 text-xs leading-5 text-textMuted">
                                              {toTitle(item.category)} • {item.reason || 'Required for this route.'}
                                            </p>
                                          </div>
                                          <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusMeta.border} ${statusMeta.bg} ${statusMeta.text}`}>
                                            {toTitle(item.status || 'missing')}
                                          </span>
                                        </div>
                                      </article>
                                    )
                                  })
                                ) : (
                                  <p className="rounded-[12px] border border-dashed border-borderSoft bg-surfaceAlt px-3 py-4 text-sm text-textMuted md:col-span-2">
                                    No required documents are configured for this workflow yet.
                                  </p>
                                )}
                              </div>
                            </section>

                            <section className="rounded-[18px] border border-borderDefault bg-white p-5 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                              <h3 className="text-sm font-semibold text-textStrong">Workflow Snapshot</h3>
                              <div className="mt-3 grid gap-2">
                                {(activeLegalWorkflowDetailKey === 'bond-registration'
                                  ? [
                                      ['Bank Requirements', summarizeLaneMilestone(lane, ['bank_requirements', 'requirements'])],
                                      ['Bond Documents', summarizeLaneMilestone(lane, ['bond_documents', 'documents'])],
                                      ['Guarantees', summarizeLaneMilestone(lane, ['guarantee'])],
                                      ['Finance Instruction', bondWorkflowSummary.instructionSent ? 'Sent' : 'Pending'],
                                    ]
                                  : activeLegalWorkflowDetailKey === 'bond-cancellation'
                                    ? [
                                        ['Instruction', summarizeLaneMilestone(lane, ['instruction'])],
                                        ['Figures', summarizeLaneMilestone(lane, ['figures'])],
                                        ['Guarantees', summarizeLaneMilestone(lane, ['guarantee'])],
                                        ['Registration', summarizeLaneMilestone(lane, ['registered'])],
                                      ]
                                    : [
                                        ['FICA', summarizeLaneMilestone(lane, ['fica'])],
                                        ['Signing', summarizeLaneMilestone(lane, ['signed', 'signing'])],
                                        ['Clearances', summarizeLaneMilestone(lane, ['clearance'])],
                                        ['Registration', summarizeLaneMilestone(lane, ['registered'])],
                                      ]).map(([label, value]) => (
                                  <div key={label} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2.5">
                                    <span className="break-words text-sm text-textMuted">{label}</span>
                                    <strong className="break-words text-sm text-textStrong">{value}</strong>
                                  </div>
                                ))}
                              </div>
                            </section>
                          </section>
                        </>
                      )
                    })()
                  ) : (
                    <>
                      <section className="rounded-[18px] border border-borderDefault bg-white p-5 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                        <h2 className="text-[1.2rem] font-semibold tracking-[-0.03em] text-textStrong">Transfer</h2>
                        <p className="mt-1 text-sm leading-6 text-textMuted">Manage the legal workflows for this transaction.</p>
                      </section>

                      <LegalWorkflowRoutingPanel
                        diagnostics={routingDiagnostics}
                        workflows={legalWorkflowModels}
                        canEdit={canEditRoutingProfile}
                        onEdit={openRoutingProfileModal}
                      />

                      <section className="rounded-[18px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)] sm:p-5">
                        <div className="grid items-stretch gap-4 lg:grid-cols-2">
                          {transferHubWorkflows.map((workflow) => (
                            <LegalWorkflowHubCard
                              key={workflow.key}
                              workflow={workflow}
                              onOpen={() => openLegalWorkflowDetail(workflow.detailKey)}
                            />
                          ))}
                        </div>
                      </section>

                      <section className="rounded-[18px] border border-borderDefault bg-white p-5 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-textStrong">Assigned Roleplayers</h3>
                            <p className="mt-1 text-sm leading-6 text-textMuted">Current legal roleplayers for transfer, finance, and cancellation.</p>
                          </div>
                          <Button type="button" variant="secondary" size="sm" onClick={() => openWorkspaceMenu('stakeholders')}>
                            Manage Roleplayers
                          </Button>
                        </div>
                        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
                          {roleplayerStripItems.map((item) => (
                            <article key={item.key} className="min-w-0 rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3">
                              <span className="block break-words text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">{item.label}</span>
                              <strong className="mt-2 block break-words text-sm text-textStrong">{item.value}</strong>
                              <p className="mt-1 break-words text-xs text-textMuted">{item.subtext}</p>
                            </article>
                          ))}
                        </div>
                      </section>
                    </>
                  )
                ) : null}

                {activeWorkspaceMenu === 'overview' ? (
                  <section className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-textStrong">{isAgentTransactionView ? 'Transaction Conversation' : 'Matter Conversation'}</h3>
                        <p className="mt-1 text-sm text-textMuted">
                          {isAgentTransactionView
                            ? 'System updates, document flow, portal events, finance movement, and human collaboration in one workspace thread.'
                            : 'Collaborative matter updates, notes, documents, and workflow movement.'}
                        </p>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => openWorkspaceMenu('activity')}>
                        View all activity
                      </Button>
                    </div>
                    <div className="max-h-[540px] space-y-3 overflow-y-auto rounded-[14px] border border-borderSoft bg-surfaceAlt p-3 pr-2">
                      {overviewConversationEntries.slice().reverse().map((entry) => {
                        const meta = entry.meta || getActivityCategoryMeta(entry.category)
                        const isSystemEntry = entry.kind === 'system'
                        const isManualEntry = entry.kind === 'comment'
                        return (
                          <div key={entry.id} className={`flex ${isManualEntry ? 'justify-end' : 'justify-start'}`}>
                            <article
                              className={`max-w-[min(100%,46rem)] rounded-[15px] border px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.035)] ${
                                isSystemEntry
                                  ? 'border-borderSoft bg-white/80'
                                  : isManualEntry
                                    ? 'border-primary/20 bg-primarySoft'
                                    : `${meta.card} bg-white`
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <span className={`mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[12px] ring-1 ${meta.icon}`}>
                                  {createElement(meta.Icon, { size: 16 })}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <strong className="truncate text-sm text-textStrong">{entry.authorName}</strong>
                                        <span className="text-xs text-textMuted">{entry.roleLabel}</span>
                                      </div>
                                      <p className="mt-1 text-sm font-semibold text-textStrong">{entry.title}</p>
                                      <p className="mt-1 text-[0.72rem] text-textMuted">{formatDateTime(entry.createdAt)}</p>
                                    </div>
                                    <div className="flex shrink-0 flex-wrap gap-2">
                                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${meta.badge}`}>
                                        {getConversationTypeLabel(entry.messageType)}
                                      </span>
                                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${getConversationVisibilityClasses(entry.visibility)}`}>
                                        {getConversationVisibilityLabel(entry.visibility)}
                                      </span>
                                    </div>
                                  </div>
                                  <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${isSystemEntry ? 'text-textMuted' : 'text-textBody'}`}>
                                    {entry.body}
                                  </p>
                                  {entry.attachmentName ? (
                                    <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-[10px] border border-borderSoft bg-white/70 px-3 py-2 text-xs font-semibold text-textStrong">
                                      <Paperclip size={13} className="shrink-0 text-textMuted" />
                                      <span className="truncate">{entry.attachmentName}</span>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </article>
                          </div>
                        )
                      })}
                      {!overviewConversationEntries.length ? (
                        <p className="rounded-[14px] border border-dashed border-borderDefault bg-white px-4 py-6 text-sm text-textMuted">
                          Conversation updates will appear here as the transaction progresses.
                        </p>
                      ) : null}
                    </div>
                    <form onSubmit={handleAddDiscussion} className="mt-4 rounded-[14px] border border-borderSoft bg-white p-3">
                      <Field
                        as="textarea"
                        rows={3}
                        value={discussionBody}
                        onChange={(event) => setDiscussionBody(event.target.value)}
                        placeholder="Write a message or update..."
                      />
                      <div className="mt-3 flex flex-wrap items-end gap-2">
                        <label className="min-w-[160px] flex-1 text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">
                          Update Type
                          <Field as="select" value={discussionType} onChange={(event) => setDiscussionType(event.target.value)} className="mt-1 min-h-9 text-xs">
                            {DISCUSSION_TYPES.map((item) => (
                              <option key={item.key} value={item.key}>{item.label}</option>
                            ))}
                          </Field>
                        </label>
                        <label className="min-w-[200px] flex-1 text-xs font-semibold uppercase tracking-[0.08em] text-textMuted">
                          Visibility
                          <Field as="select" value={discussionVisibility} onChange={(event) => setDiscussionVisibility(event.target.value)} className="mt-1 min-h-9 text-xs">
                            {availableDiscussionVisibilityOptions.map((item) => (
                              <option key={item.key} value={item.key}>
                                {item.label}
                              </option>
                            ))}
                          </Field>
                        </label>
                        <Button type="button" variant="secondary" size="sm" onClick={() => openWorkspaceMenu('documents')}>
                          <Paperclip size={14} />
                          Upload Document
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          disabled={
                            saving ||
                            !discussionBody.trim() ||
                            (discussionVisibility === 'internal' && !canPostInternalDiscussion) ||
                            (discussionVisibility === 'shared' && !canPostSharedDiscussion) ||
                            (discussionVisibility === 'client_visible' && !canPublishClientVisibleDiscussion)
                          }
                        >
                          <Send size={14} />
                          {saving ? 'Sending...' : 'Send'}
                        </Button>
                      </div>
                    </form>
                  </section>
                ) : null}
              </div>

              {activeWorkspaceMenu === 'overview' ? (
                <aside className="space-y-4 xl:sticky xl:top-4">
                  <OverviewSidePanel title="Quick Actions">
                    <div className="grid gap-2">
                      {overviewQuickActions.map((action) => (
                        <Button key={action.label} type="button" variant="secondary" size="sm" className="justify-start" onClick={action.onClick}>
                          {createElement(action.icon, { size: 14 })}
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </OverviewSidePanel>
                  <TransactionRoutingSummaryCard
                    diagnostics={routingDiagnostics}
                    canEdit={canEditRoutingProfile}
                    onEdit={openRoutingProfileModal}
                  />
                </aside>
              ) : null}
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
            <section className="rounded-[18px] border border-[#dde4ee] bg-white p-6 shadow-[0_16px_34px_rgba(15,23,42,0.055)]">
              <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)_minmax(360px,0.9fr)] xl:items-center">
                <div className="flex items-center justify-center">
                  <div
                    className="relative flex size-40 items-center justify-center rounded-full"
                    style={{
                      background: `conic-gradient(${documentReadiness.score >= 61 ? '#2fb344' : documentReadiness.score >= 31 ? '#f59f00' : '#e03131'} ${documentReadiness.score}%, #edf2f7 0)`,
                    }}
                  >
                    <div className="flex size-28 flex-col items-center justify-center rounded-full bg-white shadow-inner">
                      <strong className="text-3xl font-semibold text-[#142132]">{documentReadiness.score}%</strong>
                      <span className="mt-1 text-xs font-semibold text-[#60758d]">{documentReadiness.scoreLabel}</span>
                    </div>
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#71839a]">Document Readiness</p>
                  <h3 className="mt-2 text-xl font-semibold text-[#142132]">{documentReadiness.summaryText}</h3>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-[#60758d]">
                    {documentReadiness.submissionReady
                      ? 'All critical documents are received. This application can move toward bank submission once the consultant is satisfied.'
                      : 'Complete the missing or rejected critical items before submitting this application to banks.'}
                  </p>
                  <div className={`mt-4 inline-flex max-w-full items-start gap-3 rounded-[14px] border px-4 py-3 text-sm ${
                    documentReadiness.submissionReady
                      ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                      : 'border-orange-100 bg-orange-50 text-orange-800'
                  }`}>
                    {documentReadiness.submissionReady ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
                    <div>
                      <strong className="block">{documentReadiness.submissionReady ? 'Ready For Submission' : 'Not Ready For Submission'}</strong>
                      <span className="mt-1 block text-xs leading-5">
                        {documentReadiness.submissionReady ? 'All critical documents received.' : `${documentReadiness.blockerCount} critical item${documentReadiness.blockerCount === 1 ? '' : 's'} missing or rejected.`}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Required', documentReadiness.kpis.required, FileText, 'text-blue-700 bg-blue-50'],
                    ['Received', documentReadiness.kpis.received, Upload, 'text-emerald-700 bg-emerald-50'],
                    ['Missing', documentReadiness.kpis.missing, AlertTriangle, 'text-red-700 bg-red-50'],
                    ['Verified', documentReadiness.kpis.verified, FileCheck2, 'text-emerald-700 bg-emerald-50'],
                    ['Pending Review', documentReadiness.kpis.pendingReview, Clock3, 'text-orange-700 bg-orange-50'],
                    ['Rejected', documentReadiness.kpis.rejected, X, 'text-red-700 bg-red-50'],
                  ].map(([label, value, Icon, tone]) => (
                    <article key={label} className="flex items-center gap-3 rounded-[14px] border border-[#e6edf5] bg-white px-4 py-3">
                      <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] ${tone}`}>
                        {createElement(Icon, { size: 18 })}
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate text-xs font-medium text-[#60758d]">{label}</span>
                        <strong className="mt-1 block text-lg font-semibold text-[#142132]">{value}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid items-stretch gap-5 xl:grid-cols-2">
              <section className="min-w-0 rounded-[12px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[#142132]">Critical Documents</h3>
                    <p className="mt-1 text-sm text-[#60758d]">Required for bank submission.</p>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-semibold text-primary hover:text-primaryDark"
                    onClick={() => setActiveDocumentLibraryCategory('critical')}
                  >
                    View all requirements
                  </button>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[640px] w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-[#dde4ee] text-left text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#71839a]">
                        <th className="py-2.5 pr-4">Document</th>
                        <th className="px-4 py-2.5">Owner</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Last Updated</th>
                        <th className="py-2.5 pl-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documentReadiness.criticalDocuments.length ? (
                        documentReadiness.criticalDocuments.slice(0, 5).map((row) => {
                          const document = row.linkedDocument || {}
                          const showReviewActions = canReviewDocumentRequirement(row.requirement, document)
                          const showReplaceAction = canReplaceDocumentRequirement(row.requirement, document)
                          const lastUpdatedAt = row.linkedDocument?.updated_at || row.linkedDocument?.created_at || row.requirement?.updated_at || row.requirement?.created_at || ''
                          return (
                            <tr key={row.id} className="border-b border-[#edf2f7] last:border-0">
                              <td className="max-w-[280px] py-3 pr-4 font-medium text-[#142132]">
                                <span className="block truncate">{row.displayName}</span>
                              </td>
                              <td className="px-4 py-3 text-[#52677f]">{row.requiredParty || 'Buyer'}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getDocumentCommandStatusTone(row.status)}`}>
                                  {row.statusLabel}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-[#52677f]">{lastUpdatedAt ? formatShortDayMonth(lastUpdatedAt) : '-'}</td>
                              <td className="py-3 pl-4">
                                <div className="flex items-center justify-end gap-2">
                                  {row.fileUrl ? (
                                    <a href={row.fileUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-[8px] border border-[#d8e4f0] px-3 text-xs font-semibold text-primary">
                                      View
                                    </a>
                                  ) : null}
                                  {!row.fileUrl || row.status === 'missing' || row.status === 'requested' ? (
                                    <Button type="button" variant="secondary" size="sm" onClick={() => openDocumentUploadModal({ requirement: row.requirement })}>
                                      Upload
                                    </Button>
                                  ) : null}
                                  {showReplaceAction ? (
                                    <Button type="button" variant="secondary" size="sm" onClick={() => handleReplaceDocument(document, row.requirement)} disabled={saving}>
                                      Replace
                                    </Button>
                                  ) : null}
                                  {row.fileUrl && !showReplaceAction ? (
                                    <Button type="button" variant="secondary" size="sm" onClick={() => handleReplaceDocument(document, row.requirement)} disabled={saving}>
                                      Replace
                                    </Button>
                                  ) : null}
                                  {showReviewActions ? (
                                    <>
                                      <Button type="button" variant="secondary" size="sm" onClick={() => openReviewAction('approve', document, row.requirement)} disabled={saving}>
                                        Approve
                                      </Button>
                                      <Button type="button" variant="ghost" size="sm" onClick={() => openReviewAction('reject', document, row.requirement)} disabled={saving}>
                                        Reject
                                      </Button>
                                    </>
                                  ) : null}
                                  <button type="button" className="ui-icon-button h-8 w-8" aria-label={`More actions for ${row.displayName}`}>
                                    <MoreHorizontal size={15} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td colSpan="5" className="py-8 text-center text-sm text-[#60758d]">
                            No critical document requirements are blocking bank submission.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="min-w-0 rounded-[12px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[#142132]">Documents Requested By Banks</h3>
                    <p className="mt-1 text-sm text-[#60758d]">Operational requests received from lenders.</p>
                  </div>
                  <button
                    type="button"
                    className="text-sm font-semibold text-primary hover:text-primaryDark"
                    onClick={() => setActiveDocumentLibraryCategory('bank_requested')}
                  >
                    View all requests
                  </button>
                </div>
                <div className="mt-4 overflow-hidden rounded-[12px] border border-[#e6edf5]">
                  {documentReadiness.bankRequestedDocuments.length ? (
                    <div className="divide-y divide-[#edf2f7]">
                      {documentReadiness.bankRequestedDocuments.slice(0, 4).map((group) => (
                        <article key={group.bankName} className="grid gap-4 bg-white px-4 py-4 md:grid-cols-[190px_minmax(0,1fr)]">
                          <div className="min-w-0">
                            <div className="flex items-center gap-3">
                              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-primary">
                                <Landmark size={18} />
                              </span>
                              <div className="min-w-0">
                                <strong className="block truncate text-sm text-[#142132]">{group.bankName}</strong>
                                <p className="mt-1 text-xs text-[#60758d]">{group.requestedAt ? `Requested on ${formatShortDayMonth(group.requestedAt)}` : 'Request date pending'}</p>
                              </div>
                            </div>
                          </div>
                          <div className="min-w-0 divide-y divide-[#edf2f7]">
                            {(group.items || []).slice(0, 4).map((request) => (
                              <div key={request.id || request.title} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                                <span className="min-w-0 truncate text-sm font-medium text-[#142132]">{request.title || request.documentType || 'Requested document'}</span>
                                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${getAdditionalRequestStatusTone(request.status)}`}>
                                  {getAdditionalRequestStatusLabel(request.status)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-[#f8fbff] px-4 py-8 text-sm text-[#60758d]">
                      No bank document requests yet. Requests from ABSA, FNB, Nedbank, Investec, and other configured banks will appear here.
                    </div>
                  )}
                </div>
              </section>
            </section>

            <section className="grid items-stretch gap-5 xl:grid-cols-2">
              <section className="rounded-[12px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[#142132]">Missing Documents</h3>
                    <p className="mt-1 text-sm text-[#60758d]">Top priority items blocking progress.</p>
                  </div>
                  <button type="button" className="text-sm font-semibold text-primary hover:text-primaryDark" onClick={() => setActiveDocumentLibraryCategory('missing')}>
                    View all missing
                  </button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {documentReadiness.missingDocuments.length ? (
                    documentReadiness.missingDocuments.map((row) => (
                      <article key={row.id} className="flex items-center justify-between gap-3 rounded-[12px] border border-[#e6edf5] bg-white px-4 py-3">
                        <div className="min-w-0">
                          <strong className="block truncate text-sm text-[#142132]">{row.displayName}</strong>
                          <p className="mt-1 text-xs text-[#60758d]">{row.requiredParty || 'Buyer'}</p>
                          <span className="mt-2 inline-flex rounded-full border border-red-100 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                            High Priority
                          </span>
                        </div>
                        <Button type="button" variant="secondary" size="sm" onClick={() => openDocumentUploadModal({ requirement: row.requirement })}>
                          <Upload size={14} />
                          Upload
                        </Button>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-[12px] border border-dashed border-[#dbe5ef] bg-[#f8fbff] px-4 py-6 text-sm text-[#60758d] md:col-span-2">
                      No critical missing documents. Keep reviewing new uploads and bank conditions.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-[12px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-[#142132]">Recent Uploads</h3>
                    <p className="mt-1 text-sm text-[#60758d]">Latest files added to the application.</p>
                  </div>
                  <button type="button" className="text-sm font-semibold text-primary hover:text-primaryDark" onClick={() => setActiveDocumentLibraryCategory('all')}>
                    View all uploads
                  </button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {documentReadiness.recentUploads.length ? (
                    documentReadiness.recentUploads.map((row) => (
                      <article key={row.id} className="min-w-0 rounded-[12px] border border-[#e6edf5] bg-white px-3 py-3">
                        <div className="flex items-start gap-3">
                          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-emerald-50 text-emerald-700">
                            <FileText size={16} />
                          </span>
                          <div className="min-w-0">
                            <strong className="block truncate text-sm text-[#142132]">{row.displayName}</strong>
                            <p className="mt-1 text-xs text-[#60758d]">{formatShortDayMonth(row.uploadedAt || row.updatedAt)}</p>
                            <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${getDocumentCommandStatusTone(row.status)}`}>
                              {getDocumentCommandStatusLabel(row.status)}
                            </span>
                          </div>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="rounded-[12px] border border-dashed border-[#dbe5ef] bg-[#f8fbff] px-4 py-6 text-sm text-[#60758d] sm:col-span-2 xl:col-span-4">
                      No uploads yet. Uploaded buyer and bank documents will appear here.
                    </p>
                  )}
                </div>
              </section>
            </section>

            <section className="rounded-[12px] border border-[#dde4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-[#142132]">Document Library</h3>
                  <p className="mt-1 text-sm text-[#60758d]">All uploaded and generated documents.</p>
                </div>
                <div className="flex max-w-5xl flex-1 flex-wrap justify-end gap-2">
                  {DOCUMENT_LIBRARY_FILTERS.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        activeDocumentLibraryCategory === filter.key
                          ? 'border-primary bg-primarySoft text-primary'
                          : 'border-[#dbe5ef] bg-white text-[#52677f] hover:border-primary/40 hover:text-primary'
                      }`}
                      onClick={() => setActiveDocumentLibraryCategory(filter.key)}
                    >
                      {filter.label}
                    </button>
                  ))}
                  <label className="relative min-w-[220px] flex-1 sm:max-w-[280px]">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8aa0b8]" />
                    <Field
                      value={documentLibrarySearch}
                      onChange={(event) => setDocumentLibrarySearch(event.target.value)}
                      placeholder="Search documents..."
                      className="h-9 pl-9 text-sm"
                    />
                  </label>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[820px] w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[#dde4ee] text-left text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#71839a]">
                      <th className="py-2.5 pr-4">Name</th>
                      <th className="px-4 py-2.5">Category</th>
                      <th className="px-4 py-2.5">Uploaded By</th>
                      <th className="px-4 py-2.5">Date</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="py-2.5 pl-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentLibraryRows.length ? (
                      documentLibraryRows.map((row) => {
                        const document = row.raw || {}
                        const canUploadRequirementRow = !row.fileUrl && row.source === 'requirement' && row.requiredDocument
                        const canUploadRequestRow = !row.fileUrl && row.source === 'document_request'
                        return (
                          <tr key={row.id} className="border-b border-[#edf2f7] last:border-0">
                            <td className="max-w-[260px] py-3 pr-4 font-medium text-[#142132]">
                              <span className="block truncate">{row.displayName}</span>
                            </td>
                            <td className="px-4 py-3 text-[#52677f]">{row.categoryLabel}</td>
                            <td className="px-4 py-3 text-[#52677f]">{row.uploadedBy}</td>
                            <td className="px-4 py-3 text-[#52677f]">{formatDateTime(row.uploadedAt)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getDocumentCommandStatusTone(row.status)}`}>
                                {getDocumentCommandStatusLabel(row.status)}
                              </span>
                            </td>
                            <td className="py-3 pl-4">
                              <div className="flex items-center justify-end gap-2">
                                {row.fileUrl ? (
                                  <>
                                    <a href={row.fileUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-[8px] border border-[#d8e4f0] px-3 text-xs font-semibold text-primary">
                                      View
                                    </a>
                                    <a href={row.fileUrl} download className="inline-flex h-8 items-center rounded-[8px] border border-[#d8e4f0] px-3 text-xs font-semibold text-[#35546c]">
                                      Download
                                    </a>
                                  </>
                                ) : null}
                                {canUploadRequirementRow ? (
                                  <Button type="button" variant="secondary" size="sm" onClick={() => openDocumentUploadModal({ requirement: row.requiredDocument })} disabled={saving}>
                                    Upload
                                  </Button>
                                ) : null}
                                {canUploadRequestRow ? (
                                  <Button type="button" variant="secondary" size="sm" onClick={() => openDocumentRequestUploadModal(row)} disabled={saving}>
                                    Upload
                                  </Button>
                                ) : null}
                                {row.fileUrl ? (
                                  <Button type="button" variant="secondary" size="sm" onClick={() => handleReplaceDocument(document, row.requiredDocument)} disabled={saving}>
                                    Replace
                                  </Button>
                                ) : null}
                                <button type="button" className="ui-icon-button h-8 w-8" aria-label={`More actions for ${row.displayName}`}>
                                  <MoreHorizontal size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan="6" className="py-8 text-center text-sm text-[#60758d]">
                          No uploaded or generated documents match this filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-[#60758d]">
                Showing {documentLibraryRows.length} document{documentLibraryRows.length === 1 ? '' : 's'}
              </p>
            </section>

            <Modal
              open={requestDocumentModalOpen}
              onClose={documentRequestSaving ? undefined : () => setRequestDocumentModalOpen(false)}
              title="Request Document"
              subtitle="Ask a buyer, seller, or roleplayer for an additional document."
              className="max-w-2xl"
              footer={(
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <Button type="button" variant="secondary" onClick={() => setRequestDocumentModalOpen(false)} disabled={documentRequestSaving}>
                    Cancel
                  </Button>
                  <Button type="submit" form="transaction-document-request-form" disabled={documentRequestSaving}>
                    <Send size={14} />
                    {documentRequestSaving ? 'Requesting...' : 'Request Document'}
                  </Button>
                </div>
              )}
            >
              <form id="transaction-document-request-form" onSubmit={handleCreateDocumentRequest} className="grid gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-label font-semibold uppercase text-textMuted">Document requested</span>
                  <Field
                    value={documentRequestForm.title}
                    onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, title: event.target.value }))}
                    placeholder="e.g. Latest 3 months bank statements"
                    autoFocus
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Requested from</span>
                    <Field
                      as="select"
                      value={documentRequestForm.requestedFrom}
                      onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, requestedFrom: event.target.value }))}
                    >
                      {ADDITIONAL_DOCUMENT_REQUESTED_FROM_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Field>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Visibility</span>
                    <Field
                      as="select"
                      value={documentRequestForm.visibility}
                      onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, visibility: event.target.value }))}
                    >
                      {ADDITIONAL_DOCUMENT_VISIBILITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Field>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Priority</span>
                    <Field
                      as="select"
                      value={documentRequestForm.priority}
                      onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, priority: event.target.value }))}
                    >
                      {ADDITIONAL_DOCUMENT_PRIORITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </Field>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Due date</span>
                    <Field
                      type="date"
                      value={documentRequestForm.dueDate}
                      onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, dueDate: event.target.value }))}
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-label font-semibold uppercase text-textMuted">Notes</span>
                  <Field
                    as="textarea"
                    rows={4}
                    value={documentRequestForm.notes}
                    onChange={(event) => setDocumentRequestForm((previous) => ({ ...previous, notes: event.target.value }))}
                    placeholder="Add context for the buyer or roleplayer..."
                  />
                </label>
                <p className="rounded-[12px] border border-[#dbe8f7] bg-[#f7fbff] px-3 py-2 text-xs leading-5 text-[#60758d]">
                  Buyer-visible requests are shown in the client portal, logged as a system update, and emailed to the buyer or seller when contact details are available.
                </p>
              </form>
            </Modal>

            <Modal
              open={uploadDocumentModalOpen}
              onClose={() => setUploadDocumentModalOpen(false)}
              title="Upload Document"
              subtitle="Add a file to the canonical transaction document system."
              className="max-w-2xl"
            >
              <form onSubmit={handleUploadDocument} className="grid gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-label font-semibold uppercase text-textMuted">File</span>
                  <Field
                    key={`upload-input-${uploadInputVersion}`}
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null
                      setUploadDraft((previous) => ({ ...previous, file, fileName: file?.name || '' }))
                    }}
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Document type</span>
                    <Field
                      value={uploadDraft.documentType}
                      onChange={(event) => setUploadDraft((previous) => ({ ...previous, documentType: event.target.value }))}
                      placeholder="e.g. buyer_id"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Category</span>
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
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Visibility</span>
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
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Related workflow</span>
                    <Field
                      as="select"
                      value={uploadDraft.relatedWorkflow}
                      onChange={(event) => setUploadDraft((previous) => ({ ...previous, relatedWorkflow: event.target.value }))}
                    >
                      {DOCUMENT_RELATED_WORKFLOW_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Field>
                  </label>
                </div>
                <label className="flex flex-col gap-1.5">
                  <span className="text-label font-semibold uppercase text-textMuted">Satisfies required document?</span>
                  <Field
                    as="select"
                    value={uploadDraft.satisfiesRequiredDocument}
                    onChange={(event) => setUploadDraft((previous) => ({ ...previous, satisfiesRequiredDocument: event.target.value }))}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </Field>
                </label>
                {uploadDraft.satisfiesRequiredDocument === 'yes' ? (
                  <label className="flex flex-col gap-1.5">
                    <span className="text-label font-semibold uppercase text-textMuted">Required document</span>
                    <Field
                      as="select"
                      value={uploadDraft.canonicalRequirementInstanceId || ''}
                      onChange={(event) => {
                        const canonicalRequirementInstanceId = event.target.value
                        const requirement = requiredDocumentChecklist.find((item) =>
                          String(getRequirementCanonicalId(item) || '') === canonicalRequirementInstanceId
                        )
                        setUploadDraft((previous) => ({
                          ...previous,
                          canonicalRequirementInstanceId,
                          requiredDocumentId: requirement?.id || '',
                          requiredDocumentKey: requirement?.key || '',
                          documentType: requirement?.key || previous.documentType,
                          category: requirement ? getAttorneyCategoryForRequiredDocument(requirement) : previous.category,
                          requestTitle: requirement?.label || requirement?.documentLabel || requirement?.document_label || '',
                        }))
                      }}
                    >
                      <option value="">Select required document</option>
                      {requiredDocumentChecklist
                        .filter((item) => getRequirementCanonicalId(item))
                        .map((item) => {
                          const canonicalId = getRequirementCanonicalId(item)
                          return (
                            <option key={`${item.key}:${canonicalId}`} value={canonicalId}>
                              {item.label || item.key} · {getRequirementStatusLabel(item.status || 'missing')}
                            </option>
                          )
                        })}
                    </Field>
                  </label>
                ) : null}
                <label className="flex flex-col gap-1.5">
                  <span className="text-label font-semibold uppercase text-textMuted">Notes</span>
                  <Field
                    as="textarea"
                    rows={3}
                    value={uploadDraft.notes}
                    onChange={(event) => setUploadDraft((previous) => ({ ...previous, notes: event.target.value }))}
                    placeholder="Optional upload note"
                  />
                </label>
                <div className="flex flex-wrap justify-end gap-3 border-t border-borderSoft pt-4">
                  <Button type="button" variant="secondary" onClick={() => setUploadDocumentModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving || !uploadDraft.file}>
                    {saving ? 'Uploading...' : 'Upload Document'}
                  </Button>
                </div>
              </form>
            </Modal>
          </section>
        ) : null}

        {workspaceRole === 'bond_originator' && activeWorkspaceMenu === 'application' ? (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-section-title font-semibold text-textStrong">Application Review Workspace</h3>
                <p className="mt-1 text-secondary text-textMuted">
                  Buyer onboarding remains the source of truth. This workspace reviews the live application data without recapturing it.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={handleDownloadBondApplicationForm} disabled={bondApplicationPdfBusy}>
                  <Download size={14} />
                  {bondApplicationPdfBusy ? 'Preparing PDF...' : 'Download Form'}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => void handleShareBondApplication()}>
                  <Send size={14} />
                  Share Application
                </Button>
              </div>
            </div>

            <section className="grid gap-4 md:grid-cols-3">
              {[
                {
                  label: 'Application Completion',
                  value: `${bondApplicationViewModel.application.completionPercent}%`,
                  helper: bondApplicationOutstandingCount ? 'Nearly there! Just a few things left.' : 'Application is complete.',
                  icon: CheckCircle2,
                  tone: bondApplicationViewModel.application.completionPercent >= 85 ? 'emerald' : bondApplicationViewModel.application.completionPercent >= 65 ? 'amber' : 'slate',
                },
                {
                  label: bondApplicationViewModel.application.onboardingStatus,
                  value: 'Onboarding Status',
                  helper: bondApplicationOutstandingCount ? 'Complete outstanding items to proceed.' : 'Ready for the next workflow step.',
                  icon: Clock3,
                  tone: bondApplicationOutstandingCount ? 'amber' : 'emerald',
                },
                {
                  label: bondApplicationViewModel.risk.level,
                  value: 'Risk Status',
                  helper: bondApplicationViewModel.risk.factors[0] || 'Risk view pending.',
                  icon: AlertTriangle,
                  tone: bondApplicationViewModel.risk.tone === 'success' ? 'emerald' : bondApplicationViewModel.risk.tone === 'danger' ? 'red' : bondApplicationViewModel.risk.tone === 'warning' ? 'amber' : 'slate',
                },
              ].map((item) => {
                const Icon = item.icon
                const toneClass = item.tone === 'emerald'
                  ? 'border-emerald-200 bg-emerald-50/70 text-emerald-700'
                  : item.tone === 'amber'
                    ? 'border-amber-200 bg-amber-50/75 text-amber-700'
                    : item.tone === 'red'
                      ? 'border-red-200 bg-red-50/75 text-red-700'
                      : 'border-borderDefault bg-white text-textMuted'
                return (
                  <article key={`${item.label}-${item.value}`} className={`rounded-[18px] border p-4 shadow-[0_16px_45px_rgba(15,23,42,0.06)] ${toneClass}`}>
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-current/15 bg-white/70">
                        <Icon size={20} />
                      </span>
                      <div className="min-w-0">
                        <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.14em]">{item.value}</span>
                        <strong className="mt-1 block truncate text-sm font-semibold text-textStrong">{item.label}</strong>
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-5 text-textMuted">{item.helper}</p>
                  </article>
                )
              })}
            </section>

            <section className="rounded-[22px] border border-borderDefault bg-white p-5 shadow-surface">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(260px,0.7fr)_minmax(260px,0.95fr)]">
                <div className="flex min-w-0 items-center gap-4">
                  <span className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full bg-slate-100 text-3xl font-semibold text-textStrong">
                    {bondApplicationViewModel.applicant.initials}
                    <span className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border-4 border-white bg-emerald-600 text-white">
                      <UserCircle size={16} />
                    </span>
                  </span>
                  <div className="min-w-0">
                    <h4 className="truncate text-[1.65rem] font-semibold leading-tight tracking-[-0.035em] text-textStrong">
                      {bondApplicationViewModel.applicant.fullName}
                    </h4>
                    <p className="mt-1 text-lg font-semibold text-success">{bondApplicationViewModel.financials.purchasePrice.display} Purchase</p>
                    <p className="mt-1 truncate text-sm font-semibold text-textMuted">{bondApplicationViewModel.property.label}</p>
                    <span className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-borderSoft bg-white px-3 py-1.5 text-xs font-semibold text-textBody">
                      Application ID: <span className="truncate text-textStrong">{bondApplicationViewModel.application.id}</span>
                      <Copy size={13} className="text-textMuted" />
                    </span>
                  </div>
                </div>

                <div className="min-h-[150px] overflow-hidden rounded-[18px] border border-borderSoft bg-slate-100">
                  {bondApplicationViewModel.property.imageUrl ? (
                    <img
                      src={bondApplicationViewModel.property.imageUrl}
                      alt={bondApplicationViewModel.property.label}
                      className="h-full min-h-[150px] w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full min-h-[150px] place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(47,179,68,0.22),transparent_34%),linear-gradient(135deg,#ecfdf3,#e8f0f7)] p-4 text-center">
                      <div>
                        <Building2 size={28} className="mx-auto text-success" />
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.12em] text-textMuted">Property image pending</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {[
                    ['Property / Unit', bondApplicationViewModel.property.label, Building2],
                    ['Stage', bondApplicationViewModel.application.stage, Workflow],
                    ['Application Date', bondApplicationViewModel.application.createdAtDisplay, CalendarDays],
                    ['Last Updated', bondApplicationViewModel.application.updatedAtDisplay, Clock3],
                    ['Assigned Consultant', bondApplicationViewModel.consultant, UserCircle],
                  ].map(([label, value, Icon]) => (
                    <div key={label} className="flex min-w-0 items-start gap-3">
                      {createElement(Icon, { size: 15, className: 'mt-0.5 shrink-0 text-textMuted' })}
                      <div className="min-w-0">
                        <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-textMuted">{label}</span>
                        <strong className="mt-0.5 block truncate text-sm font-semibold text-textStrong">{value || 'Pending'}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-3 rounded-[18px] border border-borderDefault bg-white p-4 shadow-surface md:grid-cols-2 xl:grid-cols-5">
              {[
                ['Purchase Price', bondApplicationViewModel.financials.purchasePrice.display, '', CircleDollarSign, 'bg-emerald-600 text-white'],
                ['Deposit', bondApplicationViewModel.financials.deposit.display, bondApplicationViewModel.financials.deposit.secondary, FileCheck2, 'bg-blue-600 text-white'],
                ['Monthly Income', bondApplicationViewModel.financials.grossIncome.display, '', Landmark, 'bg-violet-600 text-white'],
                ['Monthly Expenses', bondApplicationViewModel.financials.monthlyExpenses.display, bondApplicationViewModel.financials.monthlyExpenses.secondary, CreditCard, 'bg-orange-500 text-white'],
                ['Bond Amount Required', bondApplicationViewModel.financials.bondAmountRequired.display, '', Building2, 'bg-green-600 text-white'],
              ].map(([label, value, secondary, Icon, tone]) => (
                <article key={label} className="flex min-w-0 items-center gap-3 border-borderSoft px-2 py-2 xl:border-r last:xl:border-r-0">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] ${tone}`}>
                    {createElement(Icon, { size: 18 })}
                  </span>
                  <div className="min-w-0">
                    <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-textMuted">{label}</span>
                    <strong className="mt-1 block truncate text-sm font-semibold text-textStrong">{value}</strong>
                    {secondary ? <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[0.68rem] font-semibold text-success">{secondary}</span> : null}
                  </div>
                </article>
              ))}
            </section>

            <section className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,0.68fr)_minmax(360px,0.32fr)]">
              <div className="space-y-5">
                <section className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
                  <article className="flex h-full min-h-[430px] flex-col rounded-[18px] border border-borderDefault bg-white p-5 shadow-surface">
                    <h4 className="text-lg font-semibold tracking-[-0.025em] text-textStrong">Application Overview</h4>
                    <div className="mt-4 divide-y divide-borderSoft">
                      {[
                        ['Applicant', bondApplicationViewModel.applicant.fullName, UserCircle],
                        ['Email', bondApplicationViewModel.applicant.email, AtSign],
                        ['Phone', bondApplicationViewModel.applicant.phone, Bell],
                        ['Employment', bondApplicationViewModel.applicant.employmentStatus, Building2],
                        ['Gross Income', bondApplicationViewModel.financials.grossIncome.display, CircleDollarSign],
                        ['Monthly Expenses', bondApplicationViewModel.financials.monthlyExpenses.display, CreditCard],
                        ['Existing Debt', bondApplicationViewModel.financials.existingDebt.display, Landmark],
                        ['Property / Unit', bondApplicationViewModel.property.label, Building2],
                        ['Affordability / Risk', bondApplicationViewModel.risk.level, AlertTriangle],
                        ['Consent Status', bondApplicationViewModel.readinessItems.find((item) => item.key === 'consent')?.complete ? 'Captured' : 'Not captured', FileCheck2],
                      ].map(([label, value, Icon]) => (
                        <div key={label} className="grid grid-cols-[22px_minmax(106px,0.42fr)_minmax(0,1fr)] items-center gap-3 py-2">
                          {createElement(Icon, { size: 15, className: 'text-textMuted' })}
                          <span className="text-xs font-semibold text-textMuted">{label}</span>
                          <strong className="min-w-0 truncate text-right text-sm font-semibold text-textStrong">{value || 'Not captured'}</strong>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="mt-auto flex w-full items-center justify-between border-t border-borderSoft pt-4 text-sm font-semibold text-success" onClick={() => openWorkspaceMenu('overview')}>
                      View Full Details
                      <ChevronRight size={16} />
                    </button>
                  </article>

                  <article className="flex h-full min-h-[430px] flex-col rounded-[18px] border border-borderDefault bg-white p-5 shadow-surface">
                    <h4 className="text-lg font-semibold tracking-[-0.025em] text-textStrong">Submission Readiness</h4>
                    <div className="mt-5 grid items-start gap-4 md:grid-cols-[132px_minmax(0,1fr)]">
                      <div
                        className="mx-auto grid h-32 w-32 place-items-center rounded-full"
                        style={{ background: `conic-gradient(#2fb344 ${bondApplicationViewModel.application.readinessPercent}%, #edf2f7 0)` }}
                      >
                        <div className="grid h-[88px] w-[88px] place-items-center rounded-full bg-white text-center shadow-inner">
                          <div>
                            <strong className="block text-[1.7rem] font-semibold leading-none text-textStrong">{bondApplicationViewModel.application.readinessPercent}%</strong>
                            <span className="mt-1 block text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-success">
                              {bondApplicationOutstandingCount ? 'In Review' : 'Ready'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-textMuted">Required before submission</span>
                        {bondApplicationViewModel.readinessItems.map((item) => (
                          <div key={item.key} className="flex items-center gap-2 text-[0.84rem] leading-5">
                            {item.complete ? <CheckCircle2 size={13} className="shrink-0 text-success" /> : <AlertTriangle size={13} className="shrink-0 text-warning" />}
                            <span className={item.complete ? 'min-w-0 truncate text-textBody' : 'min-w-0 truncate font-semibold text-textStrong'}>{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className={`mt-auto flex items-center justify-between rounded-[14px] border px-4 py-3 ${bondApplicationOutstandingCount ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-success'}`}>
                      <div className="flex items-center gap-3">
                        {bondApplicationOutstandingCount ? <Clock3 size={18} /> : <CheckCircle2 size={18} />}
                        <div>
                          <strong className="block text-sm font-semibold">{bondApplicationViewModel.application.readinessLabel}</strong>
                          <span className="text-xs">{bondApplicationOutstandingCount ? `${bondApplicationOutstandingCount} item${bondApplicationOutstandingCount === 1 ? '' : 's'} outstanding before submission` : 'No outstanding required items'}</span>
                        </div>
                      </div>
                    </div>
                  </article>
                </section>

                <article className="rounded-[18px] border border-borderDefault bg-white p-5 shadow-surface">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-semibold tracking-[-0.025em] text-textStrong">Uploaded Documents</h4>
                      <p className="mt-1 text-sm text-textMuted">Documents uploaded through onboarding and the transaction document centre.</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-success">
                      {bondApplicationUploadedCount} uploaded
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {bondApplicationViewModel.documents.map((document) => (
                      <article key={document.key} className="rounded-[14px] border border-borderSoft bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] ${document.isUploaded ? 'bg-emerald-50 text-success' : 'bg-orange-50 text-warning'}`}>
                            <FileText size={17} />
                          </span>
                          {document.isUploaded ? <CheckCircle2 size={15} className="text-success" /> : <AlertTriangle size={15} className="text-warning" />}
                        </div>
                        <strong className="mt-3 block truncate text-sm font-semibold text-textStrong">{document.label}</strong>
                        <p className={`mt-2 text-xs font-semibold ${document.isUploaded ? 'text-success' : 'text-textMuted'}`}>{document.status}</p>
                      </article>
                    ))}
                  </div>
                  <button type="button" className="mt-4 flex w-full items-center justify-between border-t border-borderSoft pt-4 text-sm font-semibold text-success" onClick={() => openWorkspaceMenu('documents')}>
                    View Document Centre
                    <ChevronRight size={16} />
                  </button>
                </article>
              </div>

              <aside className="grid gap-5 xl:h-full xl:grid-rows-[auto_minmax(0,1fr)_auto]">
                <article className="flex min-h-[220px] flex-col rounded-[18px] border border-borderDefault bg-white p-5 shadow-surface">
                  <h4 className="text-lg font-semibold tracking-[-0.025em] text-textStrong">Action Centre</h4>
                  <div className="mt-4 space-y-3">
                    {bondApplicationViewModel.actions.length ? bondApplicationViewModel.actions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-3 rounded-[14px] border border-borderSoft bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-surface"
                        onClick={() => openWorkspaceMenu(action.target || 'tasks')}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[12px] ${action.priority === 'High' ? 'bg-red-50 text-red-600' : action.priority === 'Medium' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-textMuted'}`}>
                            <FileText size={17} />
                          </span>
                          <span className="min-w-0">
                            <strong className="block truncate text-sm font-semibold text-textStrong">{action.title}</strong>
                            <span className="mt-0.5 block truncate text-xs text-textMuted">{action.description}</span>
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[0.68rem] font-semibold ${action.priority === 'High' ? 'bg-red-50 text-red-600' : action.priority === 'Medium' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-textMuted'}`}>
                          {action.priority}
                        </span>
                      </button>
                    )) : (
                      <div className="rounded-[14px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-success">
                        <strong className="block font-semibold">No outstanding actions</strong>
                        <span>Application is ready for the next step.</span>
                      </div>
                    )}
                  </div>
                  <button type="button" className="mt-auto flex w-full items-center justify-between border-t border-borderSoft pt-4 text-sm font-semibold text-success" onClick={() => openWorkspaceMenu('tasks')}>
                    View All Tasks ({bondApplicationViewModel.actions.length})
                    <ChevronRight size={16} />
                  </button>
                </article>

                <article className="flex min-h-[320px] flex-col rounded-[18px] border border-borderDefault bg-white p-5 shadow-surface">
                  <h4 className="text-lg font-semibold tracking-[-0.025em] text-textStrong">Recent Activity</h4>
                  <div className="mt-4 flex-1 space-y-4">
                    {bondApplicationViewModel.activity.length ? bondApplicationViewModel.activity.map((entry, index) => (
                      <div key={entry.id || index} className="flex gap-3">
                        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-success">
                          <Activity size={16} />
                        </span>
                        <div className="min-w-0">
                          <strong className="block truncate text-sm font-semibold text-textStrong">{entry.title}</strong>
                          <span className="text-xs text-textMuted">{entry.displayDate}</span>
                        </div>
                      </div>
                    )) : (
                      <p className="rounded-[14px] border border-dashed border-borderDefault bg-slate-50 px-4 py-6 text-sm text-textMuted">No recent activity yet</p>
                    )}
                  </div>
                  <button type="button" className="mt-auto flex w-full items-center justify-between border-t border-borderSoft pt-4 text-sm font-semibold text-success" onClick={() => openWorkspaceMenu('activity')}>
                    View All Activity
                    <ChevronRight size={16} />
                  </button>
                </article>

                <article className="rounded-[18px] border border-borderDefault bg-white p-5 shadow-surface">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-lg font-semibold tracking-[-0.025em] text-textStrong">Risk Assessment</h4>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-textMuted">{bondApplicationViewModel.risk.scoreLabel}</p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-[132px_minmax(0,1fr)] xl:grid-cols-1">
                    <div
                      className="grid h-32 w-32 place-items-center rounded-full"
                      style={{
                        background: `conic-gradient(${bondApplicationViewModel.risk.tone === 'success' ? '#2fb344' : bondApplicationViewModel.risk.tone === 'danger' ? '#e03131' : '#f59f00'} ${bondApplicationViewModel.risk.score}%, #e5f1e8 0)`,
                      }}
                    >
                      <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center shadow-inner">
                        <div>
                          <strong className="block text-3xl font-semibold text-textStrong">{bondApplicationViewModel.risk.score}</strong>
                          <span className="text-xs font-semibold text-textMuted">/100</span>
                          <span className={`mt-1 block text-xs font-semibold uppercase tracking-[0.12em] ${bondApplicationViewModel.risk.tone === 'danger' ? 'text-red-600' : bondApplicationViewModel.risk.tone === 'success' ? 'text-success' : 'text-warning'}`}>
                            {bondApplicationViewModel.risk.level}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-textStrong">Key Risk Factors</span>
                      <ul className="mt-2 space-y-1.5 text-sm text-textMuted">
                        {bondApplicationViewModel.risk.factors.map((factor) => (
                          <li key={factor} className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                            <span>{factor}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 border-t border-borderSoft pt-3">
                        <span className="text-xs font-semibold text-textStrong">Recommendation</span>
                        <p className="mt-1 text-sm leading-5 text-textMuted">{bondApplicationViewModel.risk.recommendation}</p>
                      </div>
                    </div>
                  </div>
                </article>
              </aside>
            </section>
          </section>
        ) : null}

        {workspaceRole === 'bond_originator' && activeWorkspaceMenu === 'banks_quotes' ? (
          <section className="space-y-7">
            <BondBankSubmissionCommandCenter
              rows={bondBankCommandRows}
              loadingAction={bondHybridFinanceActionLoading}
              onSubmitBank={(payload) => void handleAddBondHybridApplication(payload)}
              onUploadDocs={() => openWorkspaceMenu('documents')}
              onViewQuote={(quote) => handleOpenFinanceDocument(quote)}
            />

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <QuoteComparisonCommandCenter
                quotes={sortedBondQuoteRows}
                recommendedQuote={recommendedBondQuote}
                loadingAction={bondHybridFinanceActionLoading}
                onAcceptQuote={(quote) => quote?.id ? void handleApproveBondHybridQuote(quote.id) : null}
                onRequestRevision={handleRequestBondQuoteRevision}
                onDeclineAll={() => void handleDeclineAllBondHybridQuotes()}
                onViewAll={() => openWorkspaceMenu('banks_quotes')}
              />
              <BuyerDecisionPanel
                acceptedQuote={acceptedBondQuote}
                quotes={sortedBondQuoteRows}
                onRecordDecision={(quote) => quote?.id ? void handleApproveBondHybridQuote(quote.id) : null}
                onAddNote={() => {
                  setDiscussionType('internal_note')
                  setDiscussionVisibility('shared')
                  setDiscussionBody('Buyer decision note: ')
                }}
              />
            </section>

            <BondMatterConversationPanel
              discussionBody={discussionBody}
              setDiscussionBody={setDiscussionBody}
              handleAddDiscussion={handleAddDiscussion}
              discussionType={discussionType}
              setDiscussionType={setDiscussionType}
              discussionVisibility={discussionVisibility}
              setDiscussionVisibility={setDiscussionVisibility}
              availableDiscussionVisibilityOptions={availableDiscussionVisibilityOptions}
              overviewConversationEntries={overviewConversationEntries}
              saving={saving}
              canPostInternalDiscussion={canPostInternalDiscussion}
              canPostSharedDiscussion={canPostSharedDiscussion}
              canPublishClientVisibleDiscussion={canPublishClientVisibleDiscussion}
              onAttachDocument={() => openWorkspaceMenu('documents')}
              onViewActivity={() => openWorkspaceMenu('activity')}
            />
          </section>
        ) : null}

        {activeWorkspaceMenu === 'finance' ? (
          financeCommandCenterPanel
        ) : null}

        {workspaceRole === 'bond_originator' && activeWorkspaceMenu === 'tasks' ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="rounded-[18px] border border-borderDefault bg-surface p-6 shadow-surface">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Next Actions</h3>
                  <p className="mt-1 text-secondary text-textMuted">Bond application tasks, bank follow-ups, document requests, and consultant ownership.</p>
                </div>
                <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
                  {overviewNextActions.length} actions
                </span>
              </div>
              <div className="mt-5 divide-y divide-borderSoft overflow-hidden rounded-[16px] border border-borderDefault bg-white">
                {overviewNextActions.map((item) => (
                  <article key={`${item.title}-${item.workflow}`} className="px-4 py-4 transition hover:bg-primarySoft/40">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <strong className="text-sm font-semibold text-textStrong">{item.title}</strong>
                        <p className="mt-1 max-w-3xl text-sm leading-6 text-textMuted">{item.description}</p>
                      </div>
                      <Button type="button" size="sm" variant="secondary" className="shrink-0 justify-center" onClick={() => handleOverviewActionTarget(item.actionTarget)}>
                        {item.action}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <aside className="space-y-4 xl:sticky xl:top-4">
              <OverviewSidePanel title="Quick Actions">
                <div className="grid gap-2">
                  {[
                    ['Request Documents', FileText, handleQuickRequestDocuments],
                    ['Submit to Banks', Landmark, () => setWorkspaceMenu('banks_quotes')],
                    ['Compare Quotes', CircleDollarSign, () => setWorkspaceMenu('banks_quotes')],
                    ['Assign Consultant', UsersRound, () => setWorkspaceMenu('stakeholders')],
                    ['Add Note', MessageSquarePlus, () => setWorkspaceMenu('activity')],
                  ].map(([label, Icon, action]) => (
                    <Button key={label} type="button" variant="secondary" size="sm" className="justify-start" onClick={action}>
                      {createElement(Icon, { size: 14 })}
                      {label}
                    </Button>
                  ))}
                </div>
              </OverviewSidePanel>
            </aside>
          </section>
        ) : null}

        {workspaceRole !== 'bond_originator' && activeWorkspaceMenu === 'tasks' ? (
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="rounded-[18px] border border-borderDefault bg-surface p-5 shadow-surface">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Tasks</h3>
                  <p className="mt-1 text-secondary text-textMuted">Outstanding actions, due dates, responsible parties, priority, and linked workflow areas.</p>
                </div>
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-helper font-semibold ${matterHealthMeta.border} ${matterHealthMeta.bg} ${matterHealthMeta.text}`}>
                  <span className={`h-2 w-2 rounded-full ${matterHealthMeta.dot}`} />
                  {matterHealthLabel}
                </span>
              </div>

              <div className="mt-5 divide-y divide-borderSoft overflow-hidden rounded-[16px] border border-borderDefault bg-white">
                {overviewNextActions.map((item) => {
                  const targetMenu = getWorkspaceMenuForTask(item)
                  const priority = toTitle(item.priority || 'normal')
                  const responsibleParty = targetMenu === 'finance'
                    ? getParticipantDisplayName(bondAttorney) || 'Finance team'
                    : targetMenu === 'documents'
                      ? buyer?.name || transaction?.seller_name || 'Matter team'
                      : targetMenu === 'activity'
                        ? profile?.fullName || profile?.email || 'Matter team'
                        : getParticipantDisplayName(transferAttorney) || getParticipantDisplayName(assignedAgent) || 'Matter team'

                  return (
                    <article key={`${item.title}-${item.workflow}`} className="px-4 py-4 transition hover:bg-primarySoft/40">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <strong className="text-sm font-semibold text-textStrong">{item.title}</strong>
                            <span className="rounded-full border border-borderSoft bg-surfaceAlt px-2 py-0.5 text-[0.68rem] font-semibold text-textMuted">
                              {item.workflow}
                            </span>
                          </div>
                          <p className="mt-1 max-w-3xl text-sm leading-6 text-textMuted">{item.description}</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="shrink-0 justify-center"
                          onClick={() => handleOverviewActionTarget(item.actionTarget)}
                        >
                          {item.action}
                        </Button>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                        {[
                          ['Due', formatDate(item.dueDate)],
                          ['Responsible', responsibleParty],
                          ['Priority', priority],
                          ['Area', toTitle(targetMenu)],
                        ].map(([label, value]) => (
                          <div key={label} className="min-w-0 rounded-[10px] border border-borderSoft bg-surfaceAlt px-3 py-2">
                            <span className="block font-semibold uppercase tracking-[0.08em] text-textMuted">{label}</span>
                            <strong className="mt-1 block truncate text-textStrong">{value}</strong>
                          </div>
                        ))}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

            <aside className="space-y-4 xl:sticky xl:top-4">
              <OverviewSidePanel title="Quick Actions">
                <div className="grid gap-2">
                  {[
                    ['Upload Document', Upload, () => setWorkspaceMenu('documents')],
                    ['Request Document', FileText, handleQuickRequestDocuments],
                    ['Add Note', MessageSquarePlus, handleQuickAddWorkflowNote],
                    ['Schedule Signing', CalendarDays, handleQuickScheduleSigning],
                    ['Message Parties', Send, () => setWorkspaceMenu('activity')],
                  ].map(([label, Icon, action]) => (
                    <Button key={label} type="button" variant="secondary" size="sm" className="justify-start" onClick={action}>
                      {createElement(Icon, { size: 14 })}
                      {label}
                    </Button>
                  ))}
                </div>
              </OverviewSidePanel>

              <OverviewSidePanel title="Linked Areas">
                <div className="space-y-2">
                  {[
                    ['Documents', documents.length, 'documents'],
                    ['Finance', financeTypeLabel, 'finance'],
                    ['Transfer', transferStageLabel, 'transfer'],
                    ['Activity', `${activityFeed.length} updates`, 'activity'],
                  ].map(([label, value, target]) => (
                    <button
                      key={label}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2 text-left transition hover:border-primary/30 hover:bg-primarySoft"
                      onClick={() => setWorkspaceMenu(target)}
                    >
                      <span className="text-sm font-semibold text-textStrong">{label}</span>
                      <span className="truncate text-right text-xs font-medium text-textMuted">{value}</span>
                    </button>
                  ))}
                </div>
              </OverviewSidePanel>
            </aside>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'activity' ? (
          <section className="space-y-5">
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="rounded-[16px] border border-borderDefault bg-white shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                <div className="border-b border-borderSoft px-4 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-textStrong">{isAgentTransactionView ? 'Transaction Conversation' : 'Matter Conversation'}</h3>
                      <p className="mt-1 text-sm text-textMuted">Human updates, workflow movement, documents, and operational alerts in one place.</p>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {ACTIVITY_FILTER_OPTIONS.map((filter) => (
                        <button
                          key={filter.key}
                          type="button"
                          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                            activityFilter === filter.key
                              ? 'bg-primary text-white shadow-[0_5px_14px_rgba(15,70,110,0.18)]'
                              : 'bg-surfaceAlt text-textMuted hover:bg-primarySoft hover:text-primary'
                          }`}
                          onClick={() => setActivityFilter(filter.key)}
                        >
                          {filter.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="px-4 py-5">
                  {groupedActivityFeed.map((group) => (
                    <div key={group.label} className="mb-6 last:mb-0">
                      <div className="mb-4 flex items-center gap-3">
                        <span className="h-px flex-1 bg-borderSoft" />
                        <span className="rounded-full border border-borderSoft bg-surfaceAlt px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-textMuted">
                          {group.label}
                        </span>
                        <span className="h-px flex-1 bg-borderSoft" />
                      </div>

                      <div className="relative space-y-4 before:absolute before:left-[18px] before:top-0 before:h-full before:w-px before:bg-borderSoft">
                        {group.items.map((entry) => {
                          const meta = entry.meta || getActivityCategoryMeta(entry.category)
                          return (
                            <article key={entry.id} className="relative pl-11">
                              <span className={`absolute left-[13px] top-5 z-10 h-2.5 w-2.5 rounded-full ring-4 ring-white ${meta.dot}`} />
                              <div className={`rounded-[15px] border bg-white px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.035)] ${meta.card}`}>
                                <div className="flex items-start gap-3">
                                  <span className={`mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[12px] ring-1 ${meta.icon}`}>
                                    {createElement(meta.Icon, { size: 16 })}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <h4 className="text-sm font-semibold text-textStrong">{entry.title}</h4>
                                        <p className="mt-1 text-xs text-textMuted">
                                          {entry.kind === 'system' ? 'Recorded by' : 'Posted by'} {entry.authorName}
                                          {entry.roleLabel ? ` · ${entry.roleLabel}` : ''}
                                        </p>
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        <span className="text-xs text-textMuted">{formatDateTime(entry.createdAt)}</span>
                                        <button type="button" className="ui-icon-button h-7 w-7" aria-label="Activity actions">
                                          <MoreHorizontal size={14} />
                                        </button>
                                      </div>
                                    </div>
                                    <p className={`mt-2 whitespace-pre-wrap text-sm leading-6 ${entry.kind === 'system' ? 'text-textMuted' : 'text-textBody'}`}>
                                      {entry.body}
                                    </p>
                                    {entry.attachmentName ? (
                                      <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-[10px] border border-borderSoft bg-surfaceAlt px-3 py-2 text-xs font-semibold text-textStrong">
                                        <Paperclip size={13} className="shrink-0 text-textMuted" />
                                        <span className="truncate">{entry.attachmentName}</span>
                                      </div>
                                    ) : null}
                                    <span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${meta.badge}`}>
                                      {entry.categoryLabel || meta.label}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </article>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  {!filteredActivityFeed.length ? (
                    <div className="rounded-[14px] border border-dashed border-borderDefault bg-surfaceAlt px-4 py-8 text-center">
                      <MessageSquarePlus size={22} className="mx-auto text-textMuted" />
                      <h4 className="mt-3 text-sm font-semibold text-textStrong">No activity matches this filter</h4>
                      <p className="mt-1 text-sm text-textMuted">Updates will appear here as the matter team collaborates.</p>
                    </div>
                  ) : null}
                </div>
              </section>

              <aside className="space-y-4">
                <form onSubmit={handleAddDiscussion} className="rounded-[16px] border border-borderDefault bg-white p-4 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
                  <h3 className="text-sm font-semibold text-textStrong">Add Update</h3>
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
                        {availableDiscussionVisibilityOptions.map((item) => (
                          <option key={item.key} value={item.key}>
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
                      placeholder="Share a matter update..."
                    />
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex gap-1">
                        {[
                          ['Attach file', Paperclip],
                          ['Mention person', AtSign],
                          ['Add reaction', Smile],
                        ].map(([label, Icon]) => (
                          <button key={label} type="button" className="ui-icon-button h-8 w-8" aria-label={label} title={label}>
                            {createElement(Icon, { size: 14 })}
                          </button>
                        ))}
                      </div>
                      <Button
                        type="submit"
                        disabled={
                          saving ||
                          !discussionBody.trim() ||
                          (discussionVisibility === 'internal' && !canPostInternalDiscussion) ||
                          (discussionVisibility === 'shared' && !canPostSharedDiscussion) ||
                          (discussionVisibility === 'client_visible' && !canPublishClientVisibleDiscussion)
                        }
                      >
                        <Send size={14} />
                        {saving ? 'Posting...' : 'Post Update'}
                      </Button>
                    </div>
                  </div>
                </form>

                <OverviewSidePanel title="Quick Actions">
                  <div className="grid gap-2">
                    {[
                      ['Request Documents', FileText, handleQuickRequestDocuments],
                      ['Upload Document', Upload, () => setWorkspaceMenu('documents')],
                      ['Schedule Appointment', CalendarDays, handleQuickScheduleSigning],
                      ['Generate Sales Agreement', FileText, openAgentSalesAgreementWorkspace],
                      ['Add Internal Note', MessageSquarePlus, () => {
                        setDiscussionType('internal_note')
                        setDiscussionVisibility('internal')
                      }],
                    ].map(([label, Icon, action]) => (
                      <button
                        key={label}
                        type="button"
                        className="flex items-center justify-between gap-3 rounded-[12px] border border-borderSoft bg-surfaceAlt px-3 py-2 text-left text-sm font-semibold text-textStrong transition hover:border-primary/30 hover:bg-primarySoft hover:text-primary"
                        onClick={action}
                      >
                        <span className="inline-flex min-w-0 items-center gap-2">
                          {createElement(Icon, { size: 14 })}
                          <span className="truncate">{label}</span>
                        </span>
                        <ChevronRight size={14} className="shrink-0" />
                      </button>
                    ))}
                  </div>
                </OverviewSidePanel>

                <OverviewSidePanel title="Matter Health">
                  {(() => {
                    const blockedCount = workflowLanes.filter((lane) => getWorkflowHealthKey(lane) === 'blocked').length
                    const waitingCount = workflowLanes.filter((lane) => getWorkflowHealthKey(lane) === 'waiting').length
                    const delayedCount = workflowLanes.filter((lane) => getWorkflowHealthKey(lane) === 'delayed').length
                    const healthLabel = blockedCount ? 'Blocked' : delayedCount ? 'Delayed' : waitingCount ? 'At Risk' : 'On Track'
                    const healthMeta = healthLabel === 'Blocked'
                      ? WORKFLOW_STATUS_META.blocked
                      : healthLabel === 'Delayed'
                        ? WORKFLOW_STATUS_META.delayed
                        : healthLabel === 'At Risk'
                          ? WORKFLOW_STATUS_META.waiting
                          : WORKFLOW_STATUS_META.in_progress
                    return (
                      <div className="space-y-3">
                        <div className={`rounded-[14px] border px-3 py-3 ${healthMeta.border} ${healthMeta.bg}`}>
                          <div className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${healthMeta.dot}`} />
                            <strong className={`text-sm ${healthMeta.text}`}>{healthLabel}</strong>
                          </div>
                          <p className="mt-2 text-sm leading-5 text-textMuted">
                            {blockedCount
                              ? `${blockedCount} workflow lane(s) have active blockers.`
                              : delayedCount
                                ? `${delayedCount} workflow lane(s) appear delayed.`
                                : waitingCount
                                  ? `${waitingCount} workflow lane(s) are waiting on a party or document.`
                                  : 'No active workflow blockers are visible right now.'}
                          </p>
                        </div>
                        <Button type="button" variant="secondary" size="sm" className="w-full justify-center" onClick={() => setWorkspaceMenu('overview')}>
                          View Workflows
                        </Button>
                      </div>
                    )
                  })()}
                </OverviewSidePanel>
              </aside>
            </section>
          </section>
        ) : null}

        {activeWorkspaceMenu === 'stakeholders' ? (
          <section className="space-y-6">
            <section className="rounded-[18px] border border-borderDefault bg-surface p-6 shadow-surface">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Transaction Team</h3>
                  <p className="mt-1 max-w-3xl text-secondary text-textMuted">
                    See who is assigned, which firms are involved, and how to contact each roleplayer without the workflow administration noise.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
                    {financeTypeLabel}
                  </span>
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-helper font-semibold ${
                    transactionTeamCards.every((card) => card.assigned)
                      ? 'border-success/30 bg-successSoft text-success'
                      : 'border-warning/30 bg-warningSoft text-warning'
                  }`}>
                    {transactionTeamCards.filter((card) => card.assigned).length}/{transactionTeamCards.length} assigned
                  </span>
                </div>
              </div>

              <div className="mt-6 grid max-w-5xl gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {transactionTeamCards.map((card) => {
                  const isAssigned = Boolean(card.assigned)
                  return (
                    <article key={card.key} className="flex min-h-[230px] min-w-0 flex-col rounded-[14px] border border-borderSoft bg-surfaceAlt p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="block max-w-[180px] text-label font-semibold uppercase text-textMuted">{card.label}</span>
                          <strong className="mt-2 block break-words text-body font-semibold leading-6 text-textStrong">{card.company}</strong>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${
                          isAssigned
                            ? 'border-success/30 bg-successSoft text-success'
                            : 'border-warning/30 bg-warningSoft text-warning'
                        }`}>
                          {card.status}
                        </span>
                      </div>
                      <div className="mt-4 space-y-2 text-helper leading-5 text-textMuted">
                        <div className="flex min-w-0 items-center gap-2">
                          <UsersRound size={14} className="shrink-0" />
                          <span className="min-w-0 truncate">{card.contact}</span>
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                          <AtSign size={14} className="shrink-0" />
                          <span className="min-w-0 truncate">{card.email}</span>
                        </div>
                      </div>
                      <div className="mt-auto pt-5">
                        <span className="block text-helper leading-5 text-textMuted">
                          {isAssigned ? 'Ready for communication' : 'Assignment still needed'}
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="mt-3 w-full justify-center whitespace-normal text-center leading-5"
                          onClick={openRoleplayerConfirmation}
                          disabled={!canManageTransactionRoleplayers || partnerOptionsLoading}
                        >
                          {card.actionLabel}
                        </Button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="rounded-[18px] border border-borderDefault bg-surface p-6 shadow-surface">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-section-title font-semibold text-textStrong">Transaction Contacts</h3>
                  <p className="mt-1 text-secondary text-textMuted">
                    Relevant people, organisations, and contact details in one premium workspace.
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-helper font-semibold text-textMuted">
                  {transactionContactRows.length} contact{transactionContactRows.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="mt-5 overflow-hidden rounded-[16px] border border-borderSoft">
                <div className="hidden grid-cols-[minmax(120px,0.8fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(180px,1fr)_minmax(140px,0.9fr)_110px] gap-3 border-b border-borderSoft bg-surfaceAlt px-4 py-3 text-label font-semibold uppercase text-textMuted md:grid">
                  <span>Role</span>
                  <span>Contact</span>
                  <span>Company</span>
                  <span>Email</span>
                  <span>Phone</span>
                  <span>Status</span>
                </div>
                <div className="divide-y divide-borderSoft">
                  {transactionContactRows.map((row) => {
                    const isAssigned = row.status === 'Assigned' || row.status === 'Active'
                    return (
                      <div key={row.key} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(120px,0.8fr)_minmax(160px,1fr)_minmax(160px,1fr)_minmax(180px,1fr)_minmax(140px,0.9fr)_110px] md:items-center">
                        <div>
                          <span className="text-label font-semibold uppercase text-textMuted md:hidden">Role</span>
                          <p className="text-body font-semibold text-textStrong">{row.role}</p>
                        </div>
                        <div>
                          <span className="text-label font-semibold uppercase text-textMuted md:hidden">Contact</span>
                          <p className="text-secondary text-textStrong">{row.contact}</p>
                        </div>
                        <div>
                          <span className="text-label font-semibold uppercase text-textMuted md:hidden">Company</span>
                          <p className="text-secondary text-textMuted">{row.company}</p>
                        </div>
                        <div className="min-w-0">
                          <span className="text-label font-semibold uppercase text-textMuted md:hidden">Email</span>
                          <p className="truncate text-secondary text-textMuted">{row.email}</p>
                        </div>
                        <div>
                          <span className="text-label font-semibold uppercase text-textMuted md:hidden">Phone</span>
                          <p className="text-secondary text-textMuted">{row.phone}</p>
                        </div>
                        <div>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${
                            isAssigned
                              ? 'border-success/30 bg-successSoft text-success'
                              : 'border-warning/30 bg-warningSoft text-warning'
                          }`}>
                            {row.status}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>

            <section className="rounded-[18px] border border-borderDefault bg-surface p-6 shadow-surface">
              <div>
                <h3 className="text-section-title font-semibold text-textStrong">Team Actions</h3>
                <p className="mt-1 text-secondary text-textMuted">
                  The most useful roleplayer actions stay visible here: communicate, re-introduce, and inspect roleplayer activity.
                </p>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                <article className="flex min-h-[250px] flex-col rounded-[14px] border border-borderSoft bg-surfaceAlt p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="text-body font-semibold text-textStrong">Send Buyer Introduction</strong>
                      <p className="mt-2 text-helper leading-5 text-textMuted">
                        Introduce the buyer to the assigned agent, transfer attorney, and bond originator when required.
                      </p>
                    </div>
                    <Send size={16} className="text-textMuted" />
                  </div>
                  <p className="mt-4 text-helper text-textMuted">
                    {latestRoleplayerIntroEvent
                      ? `Last sent ${formatDateTime(latestRoleplayerIntroEvent.createdAt || latestRoleplayerIntroEvent.created_at)}.`
                      : 'No buyer introduction has been sent yet.'}
                  </p>
                  <div className="mt-auto pt-4">
                    <Button
                      type="button"
                      className="w-full justify-center"
                      onClick={() => void handleSendRoleplayerIntro()}
                      disabled={saving || roleplayerIntroBusy || roleplayerHandoffBusy || hydratingDetail || !roleplayerReadiness.canSendIntro}
                    >
                      {roleplayerIntroBusy ? 'Sending...' : roleplayerReadiness.introOutdated ? 'Resend Buyer Introduction' : 'Send Buyer Introduction'}
                    </Button>
                  </div>
                </article>

                <article className="flex min-h-[250px] flex-col rounded-[14px] border border-borderSoft bg-surfaceAlt p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="text-body font-semibold text-textStrong">Send Team Introduction</strong>
                      <p className="mt-2 text-helper leading-5 text-textMuted">
                        Share the transaction summary with assigned attorneys, the originator, and other active service providers.
                      </p>
                    </div>
                    <Building2 size={16} className="text-textMuted" />
                  </div>
                  <p className="mt-4 text-helper text-textMuted">
                    {latestRoleplayerHandoffEvent
                      ? `Last sent ${formatDateTime(latestRoleplayerHandoffEvent.createdAt || latestRoleplayerHandoffEvent.created_at)}.`
                      : 'No team introduction has been sent yet.'}
                  </p>
                  <div className="mt-auto pt-4">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full justify-center"
                      onClick={() => void handleSendRoleplayerHandoff()}
                      disabled={saving || roleplayerIntroBusy || roleplayerHandoffBusy || hydratingDetail || !roleplayerReadiness.canSendTeamHandoff}
                    >
                      {roleplayerHandoffBusy ? 'Sending...' : roleplayerReadiness.handoffOutdated ? 'Resend Team Introduction' : 'Send Team Introduction'}
                    </Button>
                  </div>
                </article>

                <article className="flex min-h-[250px] flex-col rounded-[14px] border border-borderSoft bg-surfaceAlt p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <strong className="text-body font-semibold text-textStrong">View Activity</strong>
                      <p className="mt-2 text-helper leading-5 text-textMuted">
                        Jump into the activity feed filtered to roleplayer assignments, introductions, and team communication.
                      </p>
                    </div>
                    <Activity size={16} className="text-textMuted" />
                  </div>
                  <p className="mt-4 text-helper text-textMuted">
                    Includes assignment changes, intro sends, and invitation response events.
                  </p>
                  <div className="mt-auto pt-4">
                    <Button type="button" variant="secondary" className="w-full justify-center" onClick={openRoleplayerActivityFeed}>
                      Open Roleplayer Activity
                    </Button>
                  </div>
                </article>
              </div>
            </section>

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

      <WorkflowDetailsDrawer
        lane={activeWorkflowLane}
        open={Boolean(activeWorkflowLane)}
        saving={workflowSaving}
        stepDraft={workflowStepDraft}
        noteDraft={workflowNoteDraft}
        documentDraft={workflowDocumentDraft}
        onClose={() => {
          setWorkflowDrawerLaneKey('')
          setWorkflowStepDraft(null)
          setWorkflowNoteDraft(null)
          setWorkflowDocumentDraft(null)
        }}
        onSelectStepStatus={handleSelectWorkflowStepStatus}
        onStepDraftChange={setWorkflowStepDraft}
        onSubmitStep={handleWorkflowStepSubmit}
        onNoteDraftChange={setWorkflowNoteDraft}
        onSubmitNote={handleWorkflowNoteSubmit}
        onDocumentDraftChange={setWorkflowDocumentDraft}
        onSubmitDocument={handleWorkflowDocumentSubmit}
        onUploadDocument={() => {
          setWorkspaceMenu('documents')
          setWorkflowDrawerLaneKey('')
        }}
        onScheduleSigning={handleQuickScheduleSigning}
      />

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
        open={roleplayerConfirmOpen}
        onClose={onboardingActionBusy ? undefined : () => setRoleplayerConfirmOpen(false)}
        title="Confirm Roleplayers"
        subtitle="Select the trusted roleplayers for this transaction before sending buyer onboarding."
        footer={(
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {!roleplayerConfirmDraft.bondOriginator ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-textMuted underline-offset-4 hover:text-textStrong hover:underline"
                  onClick={() => void handleConfirmRoleplayersAndSendOnboarding({ allowMissingBondOriginator: true })}
                  disabled={onboardingActionBusy}
                >
                  Send without bond originator
                </button>
              ) : null}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setRoleplayerConfirmOpen(false)} disabled={onboardingActionBusy}>
                Cancel
              </Button>
              <Button type="button" variant="secondary" onClick={() => void handleCopyBuyerOnboardingLinkFromConfirmation()} disabled={onboardingActionBusy}>
                <Copy size={14} />
                Copy Link
              </Button>
              <Button type="button" onClick={() => void handleConfirmRoleplayersAndSendOnboarding()} disabled={onboardingActionBusy || partnerOptionsLoading}>
                <Send size={14} />
                {onboardingActionBusy ? 'Preparing...' : 'Confirm & Send Onboarding'}
              </Button>
            </div>
          </div>
        )}
      >
        <div className="space-y-4">
          <p className="rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3 text-secondary text-textMuted">
            The bond originator will only be notified if the buyer selects Bond or Hybrid finance.
          </p>
          {partnerOptionsLoading ? (
            <p className="rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3 text-sm font-semibold text-textMuted">
              Loading scoped partner defaults...
            </p>
          ) : null}
          <div className="grid gap-4">
            <RoleplayerSelect
              label="Transfer Attorney"
              required
              value={roleplayerConfirmDraft.transferAttorney}
              onChange={(value) => updateRoleplayerConfirmDraft('transferAttorney', value)}
              options={transferAttorneyOptions}
              helper="Required. Defaults follow branch, region, organisation, then existing transaction context."
            />
            <RoleplayerSelect
              label="Bond Originator"
              value={roleplayerConfirmDraft.bondOriginator}
              onChange={(value) => updateRoleplayerConfirmDraft('bondOriginator', value)}
              options={bondOriginatorOptions}
              helper="Optional. Activation waits until the buyer chooses Bond or Hybrid finance."
            />
            {!roleplayerConfirmDraft.bondOriginator ? (
              <p className="rounded-[14px] border border-warning/30 bg-warningSoft px-4 py-3 text-sm font-semibold text-warning">
                No bond originator selected. If the buyer chooses bond finance, no originator will be notified automatically.
              </p>
            ) : null}
            <RoleplayerSelect
              label="Bond Attorney"
              value={roleplayerConfirmDraft.bondAttorney}
              onChange={(value) => updateRoleplayerConfirmDraft('bondAttorney', value)}
              options={bondAttorneyOptions}
              helper="Optional. Usually activated after bond approval or bank instruction."
            />
            <RoleplayerSelect
              label="Cancellation Attorney"
              value={roleplayerConfirmDraft.cancellationAttorney}
              onChange={(value) => updateRoleplayerConfirmDraft('cancellationAttorney', value)}
              options={cancellationAttorneyOptions}
              helper="Optional. Use when the seller bond cancellation leg needs its own attorney."
            />
          </div>
          <div className="rounded-[14px] border border-borderSoft bg-surfaceAlt px-4 py-3 text-helper leading-5 text-textMuted">
            Need someone else? Add or invite a partner from <Link to="/partners" className="font-semibold text-primary hover:underline">Partners</Link>, then reopen this confirmation.
          </div>
          {roleplayerConfirmError ? (
            <p className="rounded-[14px] border border-danger/30 bg-dangerSoft px-4 py-3 text-sm font-semibold text-danger">
              {roleplayerConfirmError}
            </p>
          ) : null}
          {onboardingActionMessage ? (
            <p className="rounded-[14px] border border-borderDefault bg-surfaceAlt px-4 py-2.5 text-helper text-textMuted">{onboardingActionMessage}</p>
          ) : null}
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
            Choose a recipient below and either copy the onboarding link or send buyer onboarding through Resend.
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

      <Modal
        open={routingProfileModalOpen}
        onClose={routingProfileSaving ? undefined : () => setRoutingProfileModalOpen(false)}
        title="Edit Routing Profile"
        subtitle="Update the facts that decide finance, transfer, bond, cancellation, and document routing."
        className="max-w-2xl"
        footer={(
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setRoutingProfileModalOpen(false)}
              disabled={routingProfileSaving}
            >
              Cancel
            </Button>
            <Button type="submit" form="transaction-routing-profile-form" disabled={routingProfileSaving}>
              {routingProfileSaving ? 'Saving...' : 'Save Routing'}
            </Button>
          </div>
        )}
      >
        <form id="transaction-routing-profile-form" onSubmit={handleSaveRoutingProfile} className="grid gap-4">
          {routingProfileError ? (
            <p className="rounded-[12px] border border-danger/25 bg-dangerSoft px-3 py-2 text-sm text-danger">
              {routingProfileError}
            </p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-semibold uppercase text-textMuted">Finance type</span>
              <Field
                as="select"
                value={routingProfileDraft.financeType}
                onChange={(event) => setRoutingProfileDraft((previous) => ({ ...previous, financeType: event.target.value }))}
              >
                {ROUTING_FINANCE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-semibold uppercase text-textMuted">Transaction type</span>
              <Field
                as="select"
                value={routingProfileDraft.transactionType}
                onChange={(event) => setRoutingProfileDraft((previous) => ({ ...previous, transactionType: event.target.value }))}
              >
                {ROUTING_TRANSACTION_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-semibold uppercase text-textMuted">Property type</span>
              <Field
                value={routingProfileDraft.propertyType}
                onChange={(event) => setRoutingProfileDraft((previous) => ({ ...previous, propertyType: event.target.value }))}
                placeholder="e.g. Sectional title apartment"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-semibold uppercase text-textMuted">Property tenure</span>
              <Field
                as="select"
                value={routingProfileDraft.propertyTenure}
                onChange={(event) => setRoutingProfileDraft((previous) => ({ ...previous, propertyTenure: event.target.value }))}
              >
                {ROUTING_TENURE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-semibold uppercase text-textMuted">Purchaser type</span>
              <Field
                as="select"
                value={routingProfileDraft.purchaserType}
                onChange={(event) => setRoutingProfileDraft((previous) => ({ ...previous, purchaserType: event.target.value }))}
              >
                {ROUTING_ENTITY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-semibold uppercase text-textMuted">Seller type</span>
              <Field
                as="select"
                value={routingProfileDraft.sellerType}
                onChange={(event) => setRoutingProfileDraft((previous) => ({ ...previous, sellerType: event.target.value }))}
              >
                {ROUTING_ENTITY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-semibold uppercase text-textMuted">Seller existing bond</span>
              <Field
                as="select"
                value={routingProfileDraft.sellerHasExistingBond}
                onChange={(event) =>
                  setRoutingProfileDraft((previous) => ({
                    ...previous,
                    sellerHasExistingBond: event.target.value,
                    cancellationRequired: event.target.value === 'true' ? 'true' : previous.cancellationRequired,
                  }))
                }
              >
                <option value="false">No</option>
                <option value="true">Yes</option>
              </Field>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-label font-semibold uppercase text-textMuted">Cancellation required</span>
              <Field
                as="select"
                value={routingProfileDraft.cancellationRequired}
                onChange={(event) => setRoutingProfileDraft((previous) => ({ ...previous, cancellationRequired: event.target.value }))}
              >
                <option value="false">No</option>
                <option value="true">Yes</option>
              </Field>
            </label>
            <label className="flex flex-col gap-1.5 md:col-span-2">
              <span className="text-label font-semibold uppercase text-textMuted">VAT / transfer duty</span>
              <Field
                as="select"
                value={routingProfileDraft.vatTreatment}
                onChange={(event) => setRoutingProfileDraft((previous) => ({ ...previous, vatTreatment: event.target.value }))}
              >
                {ROUTING_VAT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Field>
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-label font-semibold uppercase text-textMuted">Note</span>
            <Field
              as="textarea"
              rows={3}
              value={routingProfileDraft.reason}
              onChange={(event) => setRoutingProfileDraft((previous) => ({ ...previous, reason: event.target.value }))}
              placeholder="Optional context for this routing change"
            />
          </label>
        </form>
      </Modal>

      <Modal
        open={reviewActionDraft.open}
        onClose={saving ? undefined : () => setReviewActionDraft({ open: false, action: '', document: null, requirement: null, reason: '' })}
        title={
          reviewActionDraft.action === 'approve'
            ? 'Approve Document'
            : reviewActionDraft.action === 'waive'
              ? 'Waive Requirement'
              : 'Reject Document'
        }
        subtitle={reviewActionDraft.requirement?.label || reviewActionDraft.requirement?.key || reviewActionDraft.document?.name || ''}
        footer={(
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReviewActionDraft({ open: false, action: '', document: null, requirement: null, reason: '' })}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={reviewActionDraft.action === 'reject' ? 'bg-danger text-textInverse hover:brightness-95' : ''}
              onClick={() => void handleSubmitReviewAction()}
              disabled={saving || (['reject', 'waive'].includes(reviewActionDraft.action) && !reviewActionDraft.reason.trim())}
            >
              {saving
                ? 'Saving…'
                : reviewActionDraft.action === 'approve'
                  ? 'Approve'
                  : reviewActionDraft.action === 'waive'
                    ? 'Waive'
                    : 'Reject'}
            </Button>
          </div>
        )}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-label font-semibold uppercase text-textMuted">
            {reviewActionDraft.action === 'approve' ? 'Review note (optional)' : 'Reason (required)'}
          </span>
          <Field
            as="textarea"
            rows={4}
            value={reviewActionDraft.reason}
            onChange={(event) => setReviewActionDraft((previous) => ({ ...previous, reason: event.target.value }))}
            placeholder={
              reviewActionDraft.action === 'approve'
                ? 'Add an optional note for the approval event...'
                : 'Add the reason that should appear on the document card...'
            }
          />
        </label>
      </Modal>

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
