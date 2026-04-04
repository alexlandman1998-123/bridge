import {
  ChevronDown,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import ProgressTimeline from '../components/ProgressTimeline'
import TransactionProgressPanel from '../components/TransactionProgressPanel'
import { financeTypeShortLabel, normalizeFinanceType } from '../core/transactions/financeType'
import { MAIN_STAGE_LABELS, STAGES, getClientStageExplainer, getMainStageFromDetailedStage } from '../core/transactions/stageConfig'
import { getTransactionRoleLabel } from '../core/transactions/roleConfig'
import { buildClientSafeExternalWorkspace, getExternalRolePresentation } from '../core/transactions/externalWorkspaceAdapter'
import { DOCUMENT_VAULT_GROUP_DEFINITIONS, getGroupByKey, inferGroupKeyFromDocument } from '../core/documents/documentVaultArchitecture'
import {
  fetchExternalTransactionPortal,
  updateExternalTransactionWorkflowStep,
  updateExternalTransactionWorkspace,
  uploadExternalDocument,
} from '../lib/api'

const UPDATE_TYPE_META = {
  operational: { label: 'Operational', tone: 'neutral' },
  document: { label: 'Document', tone: 'info' },
  blocker: { label: 'Blocker', tone: 'danger' },
  decision: { label: 'Decision', tone: 'success' },
  client: { label: 'Client', tone: 'info' },
  finance: { label: 'Finance', tone: 'accent' },
  legal: { label: 'Legal', tone: 'accent' },
}

const EXTERNAL_PRIMARY_TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'progress', label: 'Progress' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'documents', label: 'Document Vault' },
  { key: 'alterations', label: 'Alterations' },
  { key: 'handover', label: 'Handover / Snags' },
]

const ONBOARDING_FIELD_LABELS = {
  first_name: 'First Name',
  last_name: 'Surname',
  full_name: 'Full Names',
  email: 'Email Address',
  phone: 'Telephone Number',
  cellphone: 'Cell',
  identity_number: 'ID Number / Passport Number',
  id_number: 'ID Number / Passport Number',
  passport_number: 'ID Number / Passport Number (If Foreigner)',
  residential_address: 'Residential Address',
  postal_address: 'Postal Address',
  nationality: 'Nationality',
  employed_by: 'Employed By',
  income_tax_number: 'Income Tax Number',
  marital_status: 'Married',
  marriage_structure: 'Marriage Structure',
  source_of_funds: 'Source of Funds for Transaction',
  politically_exposed_person: 'Politically Exposed Person (PEP)',
  prominent_influential_person: 'Prominent Influential Person',
  pep_job_title: 'If Yes – Job Title',
  spouse_full_name: 'Joint Purchaser Full Names',
  spouse_id_number: 'Joint Purchaser ID Number',
  spouse_phone: 'Joint Purchaser Telephone Number',
  spouse_email: 'Joint Purchaser Email Address',
  purchaser_type: 'Purchaser Structure',
  purchase_finance_type: 'Finance Type',
  purchase_price: 'Purchase Price',
  cash_amount: 'Cash Contribution',
  bond_amount: 'Bond Amount Requested',
  deposit_amount: 'Estimated Deposit Amount',
  reservation_required: 'Reservation Deposit Required',
  reservation_amount: 'Reservation Deposit Amount',
  reservation_status: 'Reservation Deposit Status',
  reservation_paid_date: 'Reservation Paid Date',
  signature_name: 'Signature of Purchaser/s',
  signature_date: 'Date',
}

const FINANCIAL_WORKFLOW_VARIANTS = {
  cash: [
    {
      key: 'application_received',
      title: 'Cash Structure Confirmed',
      description: 'The transaction has been set up as a cash purchase.',
    },
    {
      key: 'buyer_documents_collected',
      title: 'Proof of Funds Collected',
      description: 'Proof of funds and payment support documents have been received.',
    },
    {
      key: 'bank_feedback_received',
      title: 'Funds Reviewed',
      description: 'The team is reviewing the cash funding position and any outstanding confirmations.',
    },
    {
      key: 'bond_instruction_sent_to_attorneys',
      title: 'Cleared for Attorneys',
      description: 'The finance lane is complete and the transaction can move into transfer preparation.',
    },
  ],
  bond: [
    {
      key: 'application_received',
      title: 'Application Received',
      description: 'Finance lane opened and buyer profile captured.',
    },
    {
      key: 'buyer_documents_collected',
      title: 'Buyer Documents Collected',
      description: 'Core financial documents have been collected.',
    },
    {
      key: 'submitted_to_banks',
      title: 'Submitted to Banks',
      description: 'Application submitted for lender review.',
    },
    {
      key: 'bank_feedback_received',
      title: 'Bank Feedback Received',
      description: 'The finance team is processing bank feedback.',
    },
    {
      key: 'bond_approved',
      title: 'Bond Approved',
      description: 'Funding has been approved by the lender.',
    },
    {
      key: 'grant_signed',
      title: 'Grant Signed',
      description: 'Final finance acceptance and grant processing completed.',
    },
    {
      key: 'bond_instruction_sent_to_attorneys',
      title: 'Instruction Sent to Attorneys',
      description: 'Finance lane has handed over to the transfer team.',
    },
  ],
  combination: [
    {
      key: 'application_received',
      title: 'Finance Structure Confirmed',
      description: 'The split between cash contribution and bond finance has been confirmed.',
    },
    {
      key: 'buyer_documents_collected',
      title: 'Buyer Documents Collected',
      description: 'Cash contribution evidence and bond application documents have been collected.',
    },
    {
      key: 'submitted_to_banks',
      title: 'Bond Portion Submitted',
      description: 'The bond portion of the transaction has been submitted for bank review.',
    },
    {
      key: 'bank_feedback_received',
      title: 'Bank Feedback Received',
      description: 'The finance team is working through lender feedback and conditions.',
    },
    {
      key: 'bond_approved',
      title: 'Bond Approved',
      description: 'The mortgage finance portion has been approved.',
    },
    {
      key: 'grant_signed',
      title: 'Cash Contribution Verified',
      description: 'The cash contribution and final finance acceptance have been confirmed.',
    },
    {
      key: 'bond_instruction_sent_to_attorneys',
      title: 'Instruction Sent to Attorneys',
      description: 'Finance is complete and the transaction is ready for transfer preparation.',
    },
  ],
}

const TRANSFER_WORKFLOW_TEMPLATE = [
  {
    key: 'instruction_received',
    title: 'Instruction Received',
    description: 'Attorneys have opened the transfer file.',
  },
  {
    key: 'fica_received',
    title: 'FICA Received',
    description: 'Compliance and identity checks are in progress.',
  },
  {
    key: 'transfer_documents_prepared',
    title: 'Transfer Documents Prepared',
    description: 'The legal transfer document set is being prepared.',
  },
  {
    key: 'buyer_signed_documents',
    title: 'Buyer Signed Documents',
    description: 'Buyer signatures and confirmations recorded.',
  },
  {
    key: 'seller_signed_documents',
    title: 'Seller Signed Documents',
    description: 'Seller side signatures and confirmations recorded.',
  },
  {
    key: 'guarantees_received',
    title: 'Guarantees Received',
    description: 'Required guarantees and supporting confirmations received.',
  },
  {
    key: 'lodgement_submitted',
    title: 'Lodgement Submitted',
    description: 'The transfer file has been lodged at the deeds office.',
  },
  {
    key: 'registration_confirmed',
    title: 'Registration Confirmed',
    description: 'Registration has been completed and confirmed.',
  },
]

function toDateInput(value) {
  if (!value) {
    return ''
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return parsed.toISOString().slice(0, 10)
}

function formatDateTime(value) {
  if (!value) {
    return 'Not available'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Not available'
  }

  return parsed.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatShortDate(value) {
  if (!value) {
    return 'Not set'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Not set'
  }

  return parsed.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatCurrency(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    return '—'
  }

  return amount.toLocaleString('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  })
}

function formatReservationStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (normalized === 'pending') return 'Payment Pending'
  if (normalized === 'paid') return 'Paid'
  if (normalized === 'verified') return 'Verified'
  return 'Not Required'
}

function formatLastSynced(value) {
  if (!value) {
    return 'just now'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'just now'
  }

  return parsed.toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function isTemplateDocument(name = '') {
  return /(template|blank|draft|unsigned)/i.test(String(name))
}

function isSignedDocument(name = '') {
  return /(signed|executed|final)/i.test(String(name))
}

function latestByCreatedAt(list = []) {
  return [...list].sort((left, right) => {
    const leftDate = new Date(left.created_at || 0).getTime()
    const rightDate = new Date(right.created_at || 0).getTime()
    return rightDate - leftDate
  })[0]
}

function resolveDocumentPair(documents, categoryLabel) {
  const normalized = String(categoryLabel || '').toLowerCase()
  const matching = (documents || []).filter((item) =>
    String(item.category || 'general').trim().toLowerCase().includes(normalized),
  )

  const template = latestByCreatedAt(matching.filter((item) => isTemplateDocument(item.name)))
  const signed = latestByCreatedAt(matching.filter((item) => isSignedDocument(item.name)))
  const latest = latestByCreatedAt(matching)

  return { template, signed, latest }
}

function getRequiredDocHint(label = '') {
  const normalized = String(label).toLowerCase()

  if (/(id|proof of address|income|bank statement|marriage|trust deed|registration)/i.test(normalized)) {
    return {
      owner: 'Client / Buyer',
      reason: 'Needed to verify purchaser identity and compliance requirements.',
    }
  }

  if (/(bond|bank|approval|grant|finance)/i.test(normalized)) {
    return {
      owner: 'Bond Originator',
      reason: 'Required to complete funding checks and finance progression.',
    }
  }

  if (/(attorney|transfer|guarantee|fica|lodgement|registration)/i.test(normalized)) {
    return {
      owner: 'Attorney',
      reason: 'Required for transfer preparation and conveyancing progression.',
    }
  }

  return {
    owner: 'Shared Team',
    reason: 'Required to keep the transaction file complete and unblocked.',
  }
}

function getRequirementLevelMeta(level = 'required') {
  const normalized = String(level || 'required').trim().toLowerCase()

  if (normalized === 'optional_required') {
    return {
      label: 'Recommended',
      helper: 'Useful for a faster finance review, but not a hard blocker.',
      tone: 'optional',
    }
  }

  return {
    label: 'Required',
    helper: 'Needed before this requirement is treated as complete.',
    tone: 'required',
  }
}

function classifyDocumentGroup(document = {}, requiredLabelToGroupKey = new Map()) {
  const name = String(document.name || '').toLowerCase()
  const category = String(document.category || '').toLowerCase()
  const type = String(document.document_type || '').toLowerCase()
  const combined = `${name} ${category} ${type}`
  const exactCategoryMatch = requiredLabelToGroupKey.get(category)

  if (exactCategoryMatch) {
    return exactCategoryMatch
  }

  const inferredByType = inferGroupKeyFromDocument({
    key: String(document.document_type || document.category || '')
      .trim()
      .toLowerCase()
      .replaceAll(/\s+/g, '_'),
    label: document.name,
    group: document.category,
  })

  if (inferredByType) {
    return inferredByType
  }

  if (/(handover|snag|warranty|occupation)/i.test(combined)) {
    return 'handover'
  }

  return 'buyer_fica'
}

function parseUpdate(comment = '') {
  const source = typeof comment === 'object' && comment !== null ? comment : { commentBody: comment }
  const explicitType = String(source.discussionType || '')
    .trim()
    .toLowerCase()
  const initialBody = String(source.commentBody || source.commentText || '').trim()

  if (UPDATE_TYPE_META[explicitType]) {
    return {
      type: explicitType,
      body: initialBody,
    }
  }

  let raw = initialBody
  let parsedType = 'operational'
  let guard = 0

  while (guard < 4) {
    const match = raw.match(/^\[([a-z_ ]+)\]\s*/i)
    if (!match) {
      break
    }

    guard += 1
    const tag = match[1].trim().toLowerCase().replaceAll(' ', '_')
    if (UPDATE_TYPE_META[tag]) {
      parsedType = tag
    }

    raw = raw.slice(match[0].length).trimStart()
  }

  return {
    type: parsedType,
    body: raw || initialBody,
  }
}

function scoreRequiredDoc(item, roleKey) {
  const label = String(item.label || '').toLowerCase()
  let score = 0

  if (item.status === 'missing') {
    score += 400
  } else if (item.status === 'uploaded') {
    score += 280
  } else {
    score += 120
  }

  if (roleKey === 'attorney' && /(attorney|transfer|guarantee|fica|lodgement|registration)/i.test(label)) {
    score += 90
  }

  if (roleKey === 'bond_originator' && /(bond|bank|finance|grant|approval|proof of funds)/i.test(label)) {
    score += 90
  }

  if (/(id|proof of address|income|marriage|trust deed|registration)/i.test(label)) {
    score += 28
  }

  if (item.latestSigned?.created_at) {
    score -= 30
  }

  return score
}

function getStatusMeta(status) {
  if (status === 'accepted') {
    return { label: 'Accepted', tone: 'accepted' }
  }

  if (status === 'under_review') {
    return { label: 'Under Review', tone: 'uploaded' }
  }

  if (status === 'uploaded') {
    return { label: 'Uploaded', tone: 'uploaded' }
  }

  if (status === 'reupload_required') {
    return { label: 'Re-upload Required', tone: 'missing' }
  }

  if (status === 'not_required') {
    return { label: 'Not Required', tone: 'accepted' }
  }

  return { label: 'Missing', tone: 'missing' }
}

function formatExpectedRole(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (!normalized) {
    return 'Shared Team'
  }

  if (normalized === 'client') return 'Client / Buyer'
  if (normalized === 'attorney') return 'Attorney'
  if (normalized === 'bond_originator') return 'Bond Originator'
  if (normalized === 'agent') return 'Agent'
  if (normalized === 'developer') return 'Developer'

  return getTransactionRoleLabel(normalized)
}

function toDisplayLabel(key = '') {
  const normalized = String(key || '')
    .trim()
    .toLowerCase()
  if (ONBOARDING_FIELD_LABELS[normalized]) {
    return ONBOARDING_FIELD_LABELS[normalized]
  }

  return String(key || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function isFilledValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some((item) => isFilledValue(item))
  if (typeof value === 'object') return Object.values(value).some((item) => isFilledValue(item))
  return false
}

function formatFieldValue(value) {
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (Array.isArray(value)) {
    const primitiveValues = value.filter((item) => ['string', 'number', 'boolean'].includes(typeof item))
    if (primitiveValues.length) {
      return primitiveValues.map((item) => formatFieldValue(item)).join(', ')
    }

    return JSON.stringify(value)
  }

  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  }

  if (typeof value === 'number') {
    return value.toLocaleString('en-ZA')
  }

  return String(value || '—')
}

function toClientSafeUpdateMessage(body = '') {
  const normalized = String(body || '').trim()
  if (!normalized) {
    return 'Update posted to the shared workspace.'
  }

  const lower = normalized.toLowerCase()
  if (lower.includes('rates_clearance_requested')) {
    return 'The attorneys have requested the municipal clearance certificates.'
  }
  if (lower.includes('proceeds_received')) {
    return 'The attorneys have received the bank proceeds.'
  }
  if (lower.includes('transfer_documents_prepared')) {
    return 'The transfer documents are being prepared.'
  }
  if (lower.includes('bond_approved')) {
    return 'Your bond has been approved by the bank.'
  }

  return normalized.replace(/^progress label:\s*/i, '').trim()
}

function parseWorkflowStepComment(comment) {
  const text = String(comment || '')
  if (!text.startsWith('::bridge-meta ')) {
    return {
      metadata: null,
      note: text.trim(),
    }
  }

  const [metaLine, ...rest] = text.split('\n')
  const jsonPayload = metaLine.replace('::bridge-meta ', '').trim()

  try {
    return {
      metadata: JSON.parse(jsonPayload),
      note: rest.join('\n').trim(),
    }
  } catch {
    return {
      metadata: null,
      note: text.trim(),
    }
  }
}

function mapWorkflowDisplayState(rawStatus, isFirstPending) {
  if (rawStatus === 'completed') {
    return { status: 'completed', statusLabel: 'Completed' }
  }

  if (rawStatus === 'blocked') {
    return { status: 'blocked', statusLabel: 'Blocked' }
  }

  if (rawStatus === 'in_progress') {
    return { status: 'current', statusLabel: 'In Progress' }
  }

  if (isFirstPending) {
    return { status: 'current', statusLabel: 'Current' }
  }

  return { status: 'upcoming', statusLabel: 'Upcoming' }
}

function buildWorkflowSteps(process, definitions = []) {
  const steps = process?.steps || []
  const stepMap = new Map(steps.map((step) => [step.step_key, step]))
  const firstPendingKey =
    definitions.find((definition) => (stepMap.get(definition.key)?.status || 'not_started') !== 'completed')?.key || null

  return definitions.map((definition) => {
    const source = stepMap.get(definition.key) || null
    const parsedComment = parseWorkflowStepComment(source?.comment)
    const rawStatus = String(source?.status || 'not_started').toLowerCase()

    return {
      ...definition,
      id: source?.id || null,
      rawStatus,
      completedAt: source?.completed_at || null,
      updatedAt: source?.updated_at || null,
      comment: parsedComment.note,
      metadata: parsedComment.metadata,
      ownerType: source?.owner_type || process?.owner_type || 'shared',
      ...mapWorkflowDisplayState(rawStatus, definition.key === firstPendingKey),
    }
  })
}

function getFinancialWorkflowDefinitions(financeType) {
  return FINANCIAL_WORKFLOW_VARIANTS[financeType] || FINANCIAL_WORKFLOW_VARIANTS.cash
}

function getWorkflowSummary(activeWorkflowView, financeType) {
  if (activeWorkflowView === 'financial') {
    if (financeType === 'cash') {
      return 'Track proof-of-funds and cash readiness with steps tailored to a cash transaction.'
    }

    if (financeType === 'combination') {
      return 'Track both the cash contribution and the bond portion in one combined finance workflow.'
    }

    return 'Track bond and finance progression in client-safe milestones.'
  }

  return 'Track legal transfer progression toward lodgement and registration.'
}

function ExternalTransactionPortal() {
  const { accessToken = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTransactionId = searchParams.get('tx') || ''

  const [portal, setPortal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [isLiveRefreshing, setIsLiveRefreshing] = useState(false)
  const [workspaceDirty, setWorkspaceDirty] = useState(false)
  const [activeView, setActiveView] = useState('dashboard')
  const [activeWorkflowView, setActiveWorkflowView] = useState('transfer')
  const [expandedWorkflowStepKey, setExpandedWorkflowStepKey] = useState('')
  const [workflowDrafts, setWorkflowDrafts] = useState({})
  const [activeDocumentGroup, setActiveDocumentGroup] = useState('sale')
  const [category, setCategory] = useState('Supporting Document')
  const [uploadingChecklistKey, setUploadingChecklistKey] = useState('')
  const [workspaceUpdateType, setWorkspaceUpdateType] = useState('operational')
  const checklistUploadInputs = useRef({})
  const [workspaceForm, setWorkspaceForm] = useState({
    stage: 'Reserved',
    nextAction: '',
    attorney: '',
    bondOriginator: '',
    expectedTransferDate: '',
    comment: '',
  })

  const loadPortal = useCallback(async (options = {}) => {
    const { silent = false, preserveWorkspaceForm = false, preserveCategory = false } = options

    if (!accessToken) {
      setLoading(false)
      setError('Missing access token.')
      return
    }

    try {
      if (!silent) {
        setLoading(true)
        setError('')
      }
      const data = await fetchExternalTransactionPortal(accessToken, {
        transactionId: activeTransactionId || null,
      })
      setPortal(data)

      const preferredCategory =
        data.requiredDocumentChecklist?.find((item) => !item.complete)?.label || 'Supporting Document'
      if (!preserveCategory) {
        setCategory(preferredCategory)
      }

      if (!preserveWorkspaceForm) {
        setWorkspaceForm({
          stage: data.stage || 'Reserved',
          nextAction: data.transaction?.next_action || '',
          attorney: data.transaction?.attorney || '',
          bondOriginator: data.transaction?.bond_originator || '',
          expectedTransferDate: toDateInput(data.transaction?.expected_transfer_date),
          comment: '',
        })
        setWorkspaceDirty(false)
      }

      setLastSyncedAt(new Date().toISOString())
    } catch (loadError) {
      if (!silent) {
        setError(loadError.message)
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [accessToken, activeTransactionId])

  useEffect(() => {
    void loadPortal()
  }, [loadPortal])

  useEffect(() => {
    if (!accessToken) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      if (saving) {
        return
      }

      setIsLiveRefreshing(true)
      void loadPortal({
        silent: true,
        preserveWorkspaceForm: workspaceDirty,
        preserveCategory: true,
      }).finally(() => setIsLiveRefreshing(false))
    }, 15000)

    return () => window.clearInterval(intervalId)
  }, [accessToken, loadPortal, saving, workspaceDirty])

  const uploadCategoryOptions = useMemo(() => {
    const required = (portal?.requiredDocumentChecklist || []).map((item) => item.label).filter(Boolean)
    return [...new Set(['Supporting Document', ...required])]
  }, [portal?.requiredDocumentChecklist])

  const safePortal = useMemo(() => (portal ? buildClientSafeExternalWorkspace(portal) : null), [portal])

  async function uploadForCategory(file, uploadCategory, requiredDocumentKey = null) {
    if (!file || !accessToken) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await uploadExternalDocument({
        accessToken,
        transactionId: portal?.selectedTransactionId || null,
        file,
        category: uploadCategory || 'Supporting Document',
        requiredDocumentKey,
      })
      await loadPortal({ preserveWorkspaceForm: true, preserveCategory: true })
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleUpload(event) {
    event.preventDefault()
    const file = event.currentTarget.file.files?.[0]
    await uploadForCategory(file, category)
    event.currentTarget.reset()
  }

  async function handleChecklistUpload(item, event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setUploadingChecklistKey(item.key)
    await uploadForCategory(file, item.label, item.key)
    setUploadingChecklistKey('')
    event.target.value = ''
  }

  async function handleWorkspaceMetaSave(event) {
    event.preventDefault()
    if (!accessToken) {
      return
    }

    try {
      setSaving(true)
      setError('')

      await updateExternalTransactionWorkspace({
        accessToken,
        transactionId: portal?.selectedTransactionId || null,
        stage: workspaceForm.stage,
        nextAction: workspaceForm.nextAction,
        attorney: workspaceForm.attorney,
        bondOriginator: workspaceForm.bondOriginator,
        expectedTransferDate: workspaceForm.expectedTransferDate,
        comment: '',
      })
      setWorkspaceDirty(false)
      await loadPortal()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleWorkspaceCommentSubmit(event) {
    event.preventDefault()
    if (!accessToken) {
      return
    }

    const cleanComment = workspaceForm.comment.trim()
    if (!cleanComment) {
      return
    }

    try {
      setSaving(true)
      setError('')
      const prefixedComment = `[${workspaceUpdateType}] ${cleanComment}`

      await updateExternalTransactionWorkspace({
        accessToken,
        transactionId: portal?.selectedTransactionId || null,
        stage: workspaceForm.stage,
        nextAction: workspaceForm.nextAction,
        attorney: workspaceForm.attorney,
        bondOriginator: workspaceForm.bondOriginator,
        expectedTransferDate: workspaceForm.expectedTransferDate,
        comment: prefixedComment,
      })

      setWorkspaceForm((previous) => ({ ...previous, comment: '' }))
      setWorkspaceDirty(false)
      await loadPortal({ preserveCategory: true })
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  function handleMentionInsert() {
    setWorkspaceDirty(true)
    setWorkspaceForm((previous) => ({
      ...previous,
      comment: previous.comment ? `${previous.comment} @team ` : '@team ',
    }))
  }

  function handleWorkflowDraftChange(formKey, value) {
    setWorkflowDrafts((previous) => ({
      ...previous,
      [formKey]: value,
    }))
  }

  async function handleWorkflowStepUpdate(step, processType, options = {}) {
    if (!accessToken || !step?.key) {
      return
    }

    const { markComplete = false } = options
    const formKey = `${processType}:${step.key}`
    const note = String(workflowDrafts[formKey] || '').trim()
    const nextStatus = markComplete ? 'completed' : step.rawStatus === 'not_started' ? 'in_progress' : step.rawStatus

    if (!markComplete && !note) {
      return
    }

    try {
      setSaving(true)
      setError('')
      await updateExternalTransactionWorkflowStep({
        accessToken,
        transactionId: portal?.selectedTransactionId || null,
        processType,
        stepKey: step.key,
        status: nextStatus,
        actionType: markComplete ? 'completed' : 'updated',
        comment: note,
      })
      setWorkflowDrafts((previous) => ({
        ...previous,
        [formKey]: '',
      }))
      await loadPortal({ preserveWorkspaceForm: true, preserveCategory: true })
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="status-message portal-shell">Loading transaction portal...</p>
  }

  if (!safePortal) {
    return (
      <main className="portal-shell external-guided-shell">
        <section className="panel portal-panel external-guided-panel">
          <h1>Transaction Workspace</h1>
          <p className="status-message error">{error || 'Unable to load portal.'}</p>
        </section>
      </main>
    )
  }

  const roleKey = String(safePortal.access?.role || '').toLowerCase()
  const roleLabel = getTransactionRoleLabel(safePortal.access?.role)
  const { roleEmphasis, roleFocus } = getExternalRolePresentation(roleKey)
  const canEditWorkspaceFields = roleKey !== 'client'
  const mainStage = safePortal.presentation.mainStage || getMainStageFromDetailedStage(safePortal.stage)
  const stageLabel = safePortal.presentation.stageLabel || MAIN_STAGE_LABELS[mainStage] || mainStage
  const stageExplainer = safePortal.presentation.stageExplainer || getClientStageExplainer(mainStage)

  const completeCount = safePortal.presentation.completeCount
  const totalRequired = safePortal.presentation.totalRequired
  const missingRequiredCount = safePortal.presentation.missingRequiredCount
  const completion = safePortal.presentation.completion

  const latestUpdate = safePortal.presentation.latestUpdate
  const latestCommentTime = latestUpdate?.createdAt ? formatDateTime(latestUpdate.createdAt) : 'Not yet'
  const latestDocument = safePortal.presentation.latestDocument
  const purchasePrice =
    safePortal.transaction?.purchase_price ?? safePortal.transaction?.sales_price ?? safePortal.unit?.price ?? null
  const financeType = normalizeFinanceType(safePortal.transaction?.finance_type || 'cash')
  const cashAmount = safePortal.transaction?.cash_amount ?? null
  const bondAmount = safePortal.transaction?.bond_amount ?? null
  const reservationAmount = safePortal.transaction?.reservation_amount ?? null
  const reservationStatus = safePortal.transaction?.reservation_status || 'not_required'
  const reservationRequired = Boolean(safePortal.transaction?.reservation_required)

  const enrichedRequiredChecklist = safePortal.requiredDocumentChecklist
    .map((item) => {
      const pair = resolveDocumentPair(safePortal.documents, item.label)
      const latestSigned = pair.signed || (item.complete ? item.matchedDocument : null)
      const latest = pair.latest || item.matchedDocument || null
      const status = item.status || (latestSigned ? 'accepted' : latest ? 'uploaded' : 'missing')
      const guidance = getRequiredDocHint(item.label)
      const inferredGroupKey = item.groupKey || inferGroupKeyFromDocument({ key: item.key, label: item.label, group: item.group })
      const groupMeta = getGroupByKey(inferredGroupKey)

      return {
        ...item,
        pair,
        latest,
        latestSigned,
        status,
        groupKey: inferredGroupKey,
        groupLabel: item.groupLabel || groupMeta.label,
        owner: guidance.owner,
        reason: guidance.reason,
      }
    })
    .sort((left, right) => scoreRequiredDoc(right, roleKey) - scoreRequiredDoc(left, roleKey))

  const needsAttentionItems = [
    ...(safePortal.transaction?.next_action
      ? [{ label: 'Next Action', value: safePortal.transaction.next_action, owner: 'Shared Team' }]
      : []),
    ...enrichedRequiredChecklist
      .filter((item) => item.status === 'missing')
      .slice(0, 6)
      .map((item) => ({
        label: item.label,
        value: 'Required document still outstanding',
        owner: item.owner,
      })),
  ]

  const requiredLabelToGroupKey = new Map(
    enrichedRequiredChecklist.map((item) => [String(item.label || '').trim().toLowerCase(), item.groupKey]),
  )
  const groupedDocuments = DOCUMENT_VAULT_GROUP_DEFINITIONS.map((group) => ({
    ...group,
    items: (safePortal.documents || []).filter(
      (document) => classifyDocumentGroup(document, requiredLabelToGroupKey) === group.key,
    ),
  })).filter((group) => group.items.length > 0)

  const requiredDocsByGroup = DOCUMENT_VAULT_GROUP_DEFINITIONS.map((group) => {
    const items = enrichedRequiredChecklist.filter((item) => item.groupKey === group.key)
    const completed = items.filter((item) => ['accepted', 'uploaded', 'under_review'].includes(String(item.status || '').toLowerCase())).length
    return {
      ...group,
      items,
      completed,
      total: items.length,
    }
  })

  const activeRequiredGroupKey = requiredDocsByGroup.some((group) => group.key === activeDocumentGroup)
    ? activeDocumentGroup
    : (requiredDocsByGroup[0]?.key ?? 'sale')
  const activeRequiredGroup = requiredDocsByGroup.find((group) => group.key === activeRequiredGroupKey) || requiredDocsByGroup[0]

  const outstandingByOwner = needsAttentionItems.reduce((accumulator, item) => {
    const key = item.owner || 'Shared Team'
    accumulator[key] = (accumulator[key] || 0) + 1
    return accumulator
  }, {})

  const latestUpdates = (safePortal.discussion || []).slice(0, 40)
  const recentUpdates = latestUpdates.slice(0, 8)
  const checklistAttentionItems = enrichedRequiredChecklist.filter((item) => item.status !== 'accepted').slice(0, 5)
  const financeProcess = (safePortal.subprocesses || []).find((item) => item.process_type === 'finance') || null
  const attorneyProcess = (safePortal.subprocesses || []).find((item) => item.process_type === 'attorney') || null
  const financialWorkflowSteps = buildWorkflowSteps(financeProcess, getFinancialWorkflowDefinitions(financeType))
  const transferWorkflowSteps = buildWorkflowSteps(attorneyProcess, TRANSFER_WORKFLOW_TEMPLATE)
  const selectedWorkflow = activeWorkflowView === 'financial' ? financialWorkflowSteps : transferWorkflowSteps
  const selectedWorkflowLabel = activeWorkflowView === 'financial' ? 'Financial Workflow' : 'Transfer Workflow'
  const selectedWorkflowSummary = getWorkflowSummary(activeWorkflowView, financeType)
  const tabMeta = {
    dashboard: `${checklistAttentionItems.length} outstanding`,
    onboarding: safePortal.onboardingFormData?.updatedAt ? 'Client form submitted' : 'Awaiting submission',
    documents: `${safePortal.documents?.length || 0} files`,
    alterations: 'Module',
    handover: String(safePortal.handover?.status || 'In progress').replaceAll('_', ' '),
  }
  const onboardingFormValues = safePortal.onboardingFormData?.formData || {}
  const onboardingLastUpdated = safePortal.onboardingFormData?.updatedAt || safePortal.onboardingFormData?.createdAt || null
  const onboardingFieldEntries = Object.entries(onboardingFormValues)
    .filter(([key, value]) => key !== 'funding_sources' && isFilledValue(value))
    .map(([key, value]) => ({
      key,
      label: toDisplayLabel(key),
      value: formatFieldValue(value),
    }))
  const fundingSources = Array.isArray(onboardingFormValues.funding_sources)
    ? onboardingFormValues.funding_sources.filter((entry) => isFilledValue(entry))
    : []

  function handleTransactionSwitch(event) {
    const nextTransactionId = event.target.value
    if (!nextTransactionId) {
      setSearchParams({})
      return
    }

    setSearchParams({ tx: nextTransactionId })
  }

  return (
    <main className="portal-shell external-guided-shell">
      <section className={`panel portal-panel external-guided-panel role-${roleKey}`}>
        <header className="external-client-hero">
          <div className="external-client-hero-main">
            <div className="external-guided-badges">
              <span className={`external-role-pill role-${roleKey}`}>{roleLabel}</span>
              <span className="external-verified-pill">
                <ShieldCheck size={13} />
                Verified Workspace
              </span>
              <span className={`portal-live-indicator ${isLiveRefreshing ? 'refreshing' : ''}`}>
                {isLiveRefreshing ? 'Syncing…' : 'Live transaction view'}
              </span>
            </div>

            <h1>
              {safePortal.unit?.development?.name} • Unit {safePortal.unit?.unit_number}
            </h1>
            <p className="external-guided-subtitle">{roleEmphasis}</p>

            <div className="external-client-summary-chips">
              <span>Buyer: {safePortal.buyer?.name || 'Unassigned'}</span>
              <span>Purchase Price: {formatCurrency(purchasePrice)}</span>
              <span>Finance: {financeTypeShortLabel(financeType)}</span>
              <span>Current Stage: {stageLabel}</span>
              <span>{safePortal.transaction?.days_in_stage || 0}d in stage</span>
            </div>
          </div>

          <aside className="external-client-hero-side">
            <article>
              <span>Required Docs</span>
              <strong>
                {completeCount}/{totalRequired}
              </strong>
              <em>{completion}% complete</em>
            </article>
            <article>
              <span>Latest Update</span>
              <strong>{latestCommentTime}</strong>
              <em>{latestUpdate?.authorRoleLabel || 'No updates yet'}</em>
            </article>
            <article>
              <span>Target Milestone</span>
              <strong>{formatShortDate(safePortal.transaction?.expected_transfer_date)}</strong>
              <em>Estimated transfer date</em>
            </article>
            {safePortal.accessibleTransactions?.length > 1 ? (
              <label className="external-transaction-switch">
                <span>Workspace Transaction</span>
                <select value={safePortal.selectedTransactionId || ''} onChange={handleTransactionSwitch}>
                  {safePortal.accessibleTransactions.map((item) => (
                    <option value={item.transactionId} key={item.transactionId}>
                      {item.developmentName} • Unit {item.unitNumber} • {item.stage}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </aside>
        </header>

        <section className="panel-section external-client-primary-nav">
          <div className="external-client-primary-tabs" role="tablist" aria-label="External workspace sections">
            {EXTERNAL_PRIMARY_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeView === tab.key}
                className={activeView === tab.key ? 'active' : ''}
                onClick={() => setActiveView(tab.key)}
              >
                {tab.label}
                <em>{tabMeta[tab.key]}</em>
              </button>
            ))}
          </div>
        </section>

        <section className="panel-section external-guided-progress">
          <div className="section-header">
            <div className="section-header-copy">
              <h3>Master Transaction Progress</h3>
              <p>One timeline everyone can trust, from reservation to registration.</p>
            </div>
          </div>
          <ProgressTimeline stage={safePortal.stage} />
        </section>

        {error ? <p className="status-message error">{error}</p> : null}

        {activeView === 'dashboard' ? (
          <section className="panel-section external-client-dashboard">
            <div className="external-client-dashboard-grid">
              <div className="external-client-dashboard-left">
                <article className="external-client-block">
                  <h3>Checklist / Anything Outstanding?</h3>
                  {checklistAttentionItems.length ? (
                    <ul className="external-client-checklist-list">
                      {checklistAttentionItems.map((item) => {
                        const status = getStatusMeta(item.status)
                        return (
                          <li key={item.key}>
                            <div>
                              <strong>{item.label}</strong>
                              <p>{item.reason}</p>
                            </div>
                            <span className={`external-status-pill ${status.tone}`}>{status.label}</span>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <div className="external-client-empty-state">
                      <CheckCircle2 size={16} />
                      <p>There is nothing required from you right now.</p>
                    </div>
                  )}
                  <button type="button" className="ghost-button" onClick={() => setActiveView('documents')}>
                    Open Document Vault
                  </button>
                </article>

                <article className="external-client-block external-client-step-highlight">
                  <h3>Current Step / Next Step</h3>
                  <div className="external-client-step-card">
                    <span>Current Step</span>
                    <strong>{stageExplainer.clientLabel}</strong>
                    <p>{stageExplainer.shortExplainer}</p>
                  </div>
                  <div className="external-client-step-card">
                    <span>Next Step</span>
                    <strong>What happens after this</strong>
                    <p>{stageExplainer.nextStepText}</p>
                  </div>
                </article>

                <article className="external-client-block">
                  <h3>Shared Workspace</h3>
                  <p className="external-client-block-copy">Recent updates from the transaction team.</p>
                  <div className="external-client-updates-list">
                    {recentUpdates.map((note) => {
                      const parsed = parseUpdate(note)
                      return (
                        <article key={note.id} className="external-client-update-card">
                          <header>
                            <strong>{note.authorName || note.authorRoleLabel || 'Bridge Workspace'}</strong>
                            <span>{formatShortDate(note.createdAt)}</span>
                          </header>
                          <p>{toClientSafeUpdateMessage(parsed.body)}</p>
                        </article>
                      )
                    })}
                    {!recentUpdates.length ? <p className="empty-text">No updates have been posted yet.</p> : null}
                  </div>
                </article>

                <form className="external-client-block external-client-comment-box" onSubmit={handleWorkspaceCommentSubmit}>
                  <h3>Comment / Question</h3>
                  <p className="external-client-block-copy">Ask a question or post an update about this transaction.</p>
                  <label>
                    Message Type
                    <select value={workspaceUpdateType} onChange={(event) => setWorkspaceUpdateType(event.target.value)}>
                      <option value="client">Question</option>
                      <option value="operational">Update</option>
                      <option value="document">Document</option>
                      <option value="finance">Finance</option>
                      <option value="legal">Transfer</option>
                    </select>
                  </label>
                  <textarea
                    value={workspaceForm.comment}
                    onChange={(event) => {
                      setWorkspaceDirty(true)
                      setWorkspaceForm((previous) => ({ ...previous, comment: event.target.value }))
                    }}
                    rows={5}
                    placeholder="Type your comment or question..."
                  />
                  <div className="external-client-comment-actions">
                    <button type="button" className="ghost-button" onClick={handleMentionInsert}>
                      Mention
                    </button>
                    <button type="submit" disabled={saving || !workspaceForm.comment.trim()}>
                      Comment
                    </button>
                  </div>
                </form>
              </div>

              <aside className="external-client-dashboard-right">
                <article className="external-client-block external-client-workflows">
                  <h3>Workflows</h3>
                  <p className="external-client-block-copy">{selectedWorkflowSummary}</p>

                  <div className="external-client-workflow-toggle" role="tablist" aria-label="Workflow toggles">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeWorkflowView === 'financial'}
                      className={activeWorkflowView === 'financial' ? 'active' : ''}
                      onClick={() => setActiveWorkflowView('financial')}
                    >
                      Financial
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeWorkflowView === 'transfer'}
                      className={activeWorkflowView === 'transfer' ? 'active' : ''}
                      onClick={() => setActiveWorkflowView('transfer')}
                    >
                      Transfer
                    </button>
                  </div>

                  <div className="external-client-workflow-rail-wrap">
                    <h4>{selectedWorkflowLabel}</h4>
                    <ol className="external-client-workflow-rail">
                      {selectedWorkflow.map((step) => {
                        const processType = activeWorkflowView === 'financial' ? 'finance' : 'attorney'
                        const formKey = `${processType}:${step.key}`
                        const isExpanded = expandedWorkflowStepKey === formKey
                        const draftValue = workflowDrafts[formKey] ?? ''

                        return (
                          <li key={step.key} className={`is-${step.status} ${isExpanded ? 'is-expanded' : ''}`}>
                            <span className="external-client-workflow-dot" aria-hidden="true" />
                            <div className="external-client-workflow-step-shell">
                              <div className="external-client-workflow-step-head">
                                <button
                                  type="button"
                                  className="external-client-workflow-step-toggle"
                                  onClick={() => setExpandedWorkflowStepKey((previous) => (previous === formKey ? '' : formKey))}
                                  aria-expanded={isExpanded}
                                >
                                  <article className="external-client-workflow-step-card">
                                    <header>
                                      <strong>{step.title}</strong>
                                      <span className={`external-client-workflow-state ${step.status}`}>{step.statusLabel}</span>
                                    </header>
                                    <p>{step.description}</p>
                                    <div className="external-client-workflow-meta">
                                      {step.metadata?.actorName ? (
                                        <span>
                                          {step.metadata.action === 'completed' ? 'Completed by' : 'Updated by'} {step.metadata.actorName}
                                        </span>
                                      ) : null}
                                      {step.completedAt ? <span>{formatDateTime(step.completedAt)}</span> : null}
                                    </div>
                                  </article>
                                </button>
                                <button
                                  type="button"
                                  className={`external-client-workflow-chevron ${isExpanded ? 'open' : ''}`}
                                  aria-hidden="true"
                                  onClick={() => setExpandedWorkflowStepKey((previous) => (previous === formKey ? '' : formKey))}
                                >
                                  <ChevronDown size={16} />
                                </button>
                              </div>

                              {isExpanded ? (
                                <div className="external-client-workflow-step-details">
                                  <div className="external-client-workflow-step-detail-grid">
                                    <div>
                                      <span>Last Update</span>
                                      <strong>
                                        {step.metadata?.actorName
                                          ? `${step.metadata.action === 'completed' ? 'Completed' : 'Updated'} by ${step.metadata.actorName}`
                                          : 'No update recorded yet'}
                                      </strong>
                                      <p>{formatDateTime(step.metadata?.occurredAt || step.updatedAt || step.completedAt)}</p>
                                    </div>
                                    <div>
                                      <span>Status</span>
                                      <strong>{step.statusLabel}</strong>
                                      <p>{step.completedAt ? `Completed at ${formatDateTime(step.completedAt)}` : 'Open workflow step'}</p>
                                    </div>
                                  </div>

                                  {step.comment ? (
                                    <div className="external-client-workflow-existing-note">
                                      <span>Latest Comment</span>
                                      <p>{step.comment}</p>
                                    </div>
                                  ) : null}

                                  <label className="external-client-workflow-note-field">
                                    <span>Comment</span>
                                    <textarea
                                      rows={3}
                                      value={draftValue}
                                      onClick={(event) => event.stopPropagation()}
                                      onChange={(event) => handleWorkflowDraftChange(formKey, event.target.value)}
                                      placeholder="Add a short update or context for this step..."
                                    />
                                  </label>

                                  <div className="external-client-workflow-step-actions">
                                    <button
                                      type="button"
                                      className="ghost-button"
                                      disabled={saving || !draftValue.trim()}
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        void handleWorkflowStepUpdate(step, processType)
                                      }}
                                    >
                                      Save Comment
                                    </button>
                                    <button
                                      type="button"
                                      disabled={saving || step.rawStatus === 'completed'}
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        void handleWorkflowStepUpdate(step, processType, { markComplete: true })
                                      }}
                                    >
                                      {step.rawStatus === 'completed' ? 'Completed' : 'Mark Complete'}
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                  </div>
                </article>
              </aside>
            </div>
          </section>
        ) : null}

        {activeView === 'progress' ? (
          <TransactionProgressPanel
            variant="external"
            title="Transaction Progress"
            subtitle="A client-friendly view of the major journey and the latest workspace updates."
            mainStage={mainStage}
            subprocesses={safePortal.subprocesses || []}
            comments={recentUpdates.map((note) => {
              const parsed = parseUpdate(note)
              return {
                id: note.id,
                authorName: note.authorName || note.authorRoleLabel || 'Bridge Workspace',
                authorRoleLabel: note.authorRoleLabel,
                commentBody: toClientSafeUpdateMessage(parsed.body),
                createdAt: note.createdAt,
                discussionType: 'client',
              }
            })}
          />
        ) : null}

        {activeView === 'onboarding' ? (
          <section className="panel-section external-client-secondary-view">
            <article className="external-client-block">
              <div className="sub-panel-head">
                <h4>Client Information Form</h4>
                <span>{onboardingLastUpdated ? `Updated ${formatDateTime(onboardingLastUpdated)}` : 'No submission yet'}</span>
              </div>
              <p className="external-client-block-copy">
                This is the submitted onboarding information captured from the client form.
              </p>

              {onboardingFieldEntries.length ? (
                <div className="external-onboarding-readonly-grid">
                  {onboardingFieldEntries.map((item) => (
                    <article key={item.key} className="external-onboarding-field-card">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="external-client-empty-state">
                  <Clock3 size={16} />
                  <p>No onboarding fields have been submitted yet.</p>
                </div>
              )}

              {fundingSources.length ? (
                <div className="external-onboarding-funding">
                  <h5>Funding Sources</h5>
                  <div className="external-onboarding-readonly-grid">
                    {fundingSources.map((source, index) => (
                      <article key={`${source.source_type || source.sourceType || 'source'}-${index}`} className="external-onboarding-field-card">
                        <span>{toDisplayLabel(source.source_type || source.sourceType || `Source ${index + 1}`)}</span>
                        <strong>{formatCurrency(source.amount)}</strong>
                        {source.status ? <em>Status: {toDisplayLabel(source.status)}</em> : null}
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          </section>
        ) : null}

        {activeView === 'documents' ? (
          <section className="panel-section external-client-secondary-view">
            <article className="external-client-block">
              <div className="sub-panel-head">
                <h4>Required Documents</h4>
                <span>{completion}% complete</span>
              </div>
              <div className="card-progress-track checklist-track">
                <div className="card-progress-fill" style={{ width: `${completion}%` }} />
              </div>

              <div className="external-document-vault-tabs" role="tablist" aria-label="Document vault groups">
                {requiredDocsByGroup.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    role="tab"
                    aria-selected={activeRequiredGroupKey === group.key}
                    className={activeRequiredGroupKey === group.key ? 'active' : ''}
                    onClick={() => setActiveDocumentGroup(group.key)}
                  >
                    {group.label}
                    <em>
                      {group.completed}/{group.total || 0}
                    </em>
                  </button>
                ))}
              </div>

              <p className="external-document-vault-group-description">
                {activeRequiredGroup?.description || 'Structured required documents for this transaction stage.'}
              </p>

              <ul className="external-required-doc-grid">
                {(activeRequiredGroup?.items || []).map((item) => {
                  const statusMeta = getStatusMeta(item.status)
                  const requirementMeta = getRequirementLevelMeta(item.requirementLevel)
                  return (
                    <li key={item.key} className={`external-required-doc-card ${statusMeta.tone}`}>
                      <div className="external-required-doc-main">
                        <div className="external-required-doc-headline">
                          <div className="external-required-doc-title-wrap">
                            <strong>{item.label}</strong>
                            <span className={`requirement-level-pill ${requirementMeta.tone}`}>{requirementMeta.label}</span>
                          </div>
                          <span className={`external-status-pill ${statusMeta.tone}`}>{statusMeta.label}</span>
                        </div>
                        <p>{item.reason}</p>
                        <div className="external-doc-meta-row">
                          <span>{requirementMeta.helper}</span>
                          <span>Expected from: {formatExpectedRole(item.expectedFromRole || item.owner)}</span>
                          <span>
                            {item.latest
                              ? `Latest: ${formatDateTime(item.latest.created_at)} by ${item.latest.uploaded_by_role || 'external'}`
                              : 'No upload received yet'}
                          </span>
                        </div>
                      </div>

                      <div className="external-required-doc-actions">
                        {item.latestSigned?.url ? (
                          <a
                            href={item.latestSigned.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ghost-button checklist-upload-button"
                            download={item.latestSigned.name || `${item.label}.pdf`}
                          >
                            <Download size={13} />
                            Download Signed
                          </a>
                        ) : null}

                        {item.pair.template?.url ? (
                          <a
                            href={item.pair.template.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ghost-button checklist-upload-button"
                            download={item.pair.template.name || `${item.label}-template.pdf`}
                          >
                            <Download size={13} />
                            Download Template
                          </a>
                        ) : null}

                        <button
                          type="button"
                          className="ghost-button checklist-upload-button"
                          onClick={() => checklistUploadInputs.current[item.key]?.click()}
                          disabled={saving}
                        >
                          {uploadingChecklistKey === item.key ? 'Uploading…' : item.status === 'missing' ? 'Upload' : 'Replace'}
                        </button>
                        <input
                          type="file"
                          className="checklist-upload-input"
                          ref={(node) => {
                            checklistUploadInputs.current[item.key] = node
                          }}
                          onChange={(event) => void handleChecklistUpload(item, event)}
                        />
                      </div>
                    </li>
                  )
                })}
                {!(activeRequiredGroup?.items || []).length ? (
                  <li className="external-client-empty-card">
                    No required documents in this group for the current purchaser and finance structure.
                  </li>
                ) : null}
              </ul>
            </article>

            <article className="external-client-block">
              <div className="sub-panel-head">
                <h4>Upload to Document Vault</h4>
                <span>{safePortal.documents.length} files</span>
              </div>

              <form onSubmit={handleUpload} className="upload-form external-vault-upload">
                <label className="file-input-wrap">
                  <span>
                    <Upload size={14} />
                    Choose file
                  </span>
                  <input type="file" name="file" />
                </label>

                <label className="upload-category-field">
                  Document Category
                  <select value={category} onChange={(event) => setCategory(event.target.value)}>
                    {uploadCategoryOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <button type="submit" disabled={saving}>
                  Upload
                </button>
              </form>

              <div className="external-document-groups">
                {groupedDocuments.map((group) => (
                  <section key={group.key} className="external-document-group">
                    <header>
                      <h5>{group.label}</h5>
                      <span>{group.items.length}</span>
                    </header>
                    <ul className="document-list">
                      {group.items.map((document) => (
                        <li key={document.id} className="document-row external-document-card">
                          <div className="document-meta">
                            <strong>{document.name}</strong>
                            <p>{document.category || 'General'}</p>
                            <span>
                              {formatDateTime(document.created_at)} • {document.uploaded_by_role || 'external'}
                            </span>
                          </div>
                          <div className="document-actions">
                            {document.url ? (
                              <a
                                href={document.url}
                                target="_blank"
                                rel="noreferrer"
                                className="ghost-button checklist-upload-button"
                                aria-label={`View ${document.name}`}
                              >
                                <ExternalLink size={13} />
                                View
                              </a>
                            ) : null}
                            {document.url ? (
                              <a
                                href={document.url}
                                target="_blank"
                                rel="noreferrer"
                                className="ghost-button checklist-upload-button"
                                aria-label={`Download ${document.name}`}
                                download={document.name}
                              >
                                <Download size={13} />
                                Download
                              </a>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {!groupedDocuments.length ? <p className="empty-text">No documents uploaded yet.</p> : null}
              </div>
            </article>
          </section>
        ) : null}

        {activeView === 'alterations' ? (
          <section className="panel-section external-client-placeholder-view">
            <article className="external-client-block">
              <h3>Alterations</h3>
              <p className="external-client-block-copy">
                Alteration requests will appear here as a structured queue with status, approvals, and owner updates.
              </p>
              <div className="external-client-empty-state">
                <Clock3 size={16} />
                <p>No alteration requests have been logged yet.</p>
              </div>
            </article>
          </section>
        ) : null}

        {activeView === 'handover' ? (
          <section className="panel-section external-client-secondary-view">
            <article className="external-client-block">
              <h3>Handover / Snags</h3>
              <p className="external-client-block-copy">
                Track handover completion and post-handover support milestones in one place.
              </p>
              <div className="external-client-summary-grid">
                <div>
                  <span>Handover Status</span>
                  <strong>{String(safePortal.handover?.status || 'not_started').replaceAll('_', ' ')}</strong>
                </div>
                <div>
                  <span>Handover Date</span>
                  <strong>{formatShortDate(safePortal.handover?.handoverDate)}</strong>
                </div>
                <div>
                  <span>Electricity Meter</span>
                  <strong>{safePortal.handover?.electricityMeterReading || 'Not captured'}</strong>
                </div>
                <div>
                  <span>Water Meter</span>
                  <strong>{safePortal.handover?.waterMeterReading || 'Not captured'}</strong>
                </div>
              </div>
            </article>

            <article className="external-client-block">
              <h3>Snags</h3>
              <p className="external-client-block-copy">
                Snag capture and resolution tracking will appear here once handover moves into homeowner support.
              </p>
              <div className="external-client-empty-state">
                <CheckCircle2 size={16} />
                <p>No snags logged for this unit yet.</p>
              </div>
            </article>
          </section>
        ) : null}
      </section>
    </main>
  )
}

export default ExternalTransactionPortal
