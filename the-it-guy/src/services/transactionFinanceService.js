import {
  addBondApplication,
  addBondQuote,
  approveBondQuote,
  declineBondQuote,
  markFinanceDocumentsReviewed,
  markFinanceInstructionSent,
  recordBondOfferDecision,
  updateBondApplication,
  updateBondQuote,
  updateTransactionFinanceBlockerStatus,
  uploadClientPortalFinanceDocument,
  uploadTransactionFinanceDocument,
  verifyProofOfFunds,
} from '../lib/api'
import {
  BOND_HYBRID_FINANCE_STAGE_LABELS,
  buildBondHybridFinanceStageSteps,
  normalizeBondHybridFinanceStage,
  summarizeBondHybridFinanceWorkflow,
} from '../core/transactions/bondHybridFinanceWorkflow'
import {
  financeTypeShortLabel,
  normalizeFinanceType,
} from '../core/transactions/financeType'

const currency = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const BOND_DOCUMENT_MATCHERS = [
  'id document',
  'identity document',
  'id copy',
  'payslip',
  'bank statement',
  'proof of residence',
  'marriage',
  'anc',
  'credit check',
  'income and expenses',
  'bond',
  'home loan',
  'mortgage',
]

const CASH_PROOF_MATCHERS = [
  'proof of funds',
  'bank confirmation',
  'cash proof',
  'deposit proof',
  'source of funds',
]

const GUARANTEE_MATCHERS = [
  'guarantee',
  'guarantees',
  'grant',
]

const DEVELOPER_MATCHERS = [
  'developer finance',
  'developer',
  'payment schedule',
  'terms signed',
  'signed terms',
]

const CASH_STAGE_LABELS = {
  proof_of_funds_required: 'Proof Of Funds Required',
  proof_uploaded: 'Proof Uploaded',
  attorney_verified: 'Attorney Verified',
  guarantees_secured: 'Guarantees / Funds Secured',
  ready_for_transfer: 'Ready For Transfer',
}

const DEVELOPER_STAGE_LABELS = {
  application_submitted: 'Application Submitted',
  deposit_paid: 'Deposit Paid',
  finance_approved: 'Finance Approved',
  terms_signed: 'Terms Signed',
  ready_for_transfer: 'Ready For Transfer',
}

function text(value) {
  return String(value || '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function number(value, fallback = null) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function title(value) {
  return text(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function formatCurrency(value, fallback = 'Not captured') {
  const parsed = number(value)
  return parsed || parsed === 0 ? currency.format(parsed) : fallback
}

function formatDate(value, fallback = 'Not set') {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return fallback
  return parsed.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function normalizeRole(value = '') {
  const normalized = lower(value)
  if (['client', 'buyer', 'principal'].includes(normalized)) return 'buyer'
  if (normalized === 'internal_admin') return 'admin'
  if (normalized === 'developer_contact') return 'developer'
  if (normalized === 'transfer_attorney') return 'attorney'
  return normalized
}

export function normalizeTransactionFinanceType(value, { allowUnknown = true } = {}) {
  const raw = lower(value)
  if (raw.includes('developer')) return 'developer'
  return normalizeFinanceType(value, { allowUnknown })
}

function hasAnyMatch(value, patterns = []) {
  const haystack = lower(value)
  return patterns.some((pattern) => haystack.includes(lower(pattern)))
}

function getRequirementBlob(item = {}) {
  return [
    item?.key,
    item?.label,
    item?.description,
    item?.group_key,
    item?.group_label,
    item?.document_key,
    item?.document_label,
    item?.required_from_role,
  ].filter(Boolean).join(' ')
}

function getDocumentBlob(item = {}) {
  return [
    item?.name,
    item?.category,
    item?.document_type,
    item?.source,
    item?.bucket_key,
    item?.uploaded_by_party,
    item?.finance_lane,
    item?.related_entity_type,
  ].filter(Boolean).join(' ')
}

function normalizeRequiredDocumentStatus(item = {}) {
  const status = lower(item?.status)
  if (item?.complete || ['accepted', 'approved', 'verified', 'completed'].includes(status)) {
    return 'approved'
  }
  if (status === 'rejected') return 'rejected'
  if (['uploaded', 'under_review', 'pending_review', 'reviewed'].includes(status)) return 'uploaded'
  if (item?.matchedDocument || item?.uploadedDocumentId || item?.uploaded_document_id) return 'uploaded'
  return 'missing'
}

function buildRequiredDocumentRow(item = {}) {
  const status = normalizeRequiredDocumentStatus(item)
  return {
    id: item?.id || item?.key || item?.document_key || item?.label || Math.random().toString(36).slice(2),
    key: item?.key || item?.document_key || '',
    label: item?.label || item?.document_label || title(item?.key || item?.document_key || 'Required document'),
    requiredParty: title(item?.required_from_role || item?.requested_from || item?.expectedFromRole || 'buyer'),
    status,
    statusLabel:
      status === 'approved'
        ? 'Approved'
        : status === 'rejected'
          ? 'Rejected'
          : status === 'uploaded'
            ? 'Pending Review'
            : 'Missing',
    uploadedAt:
      item?.uploadedAt ||
      item?.uploaded_at ||
      item?.matchedDocument?.created_at ||
      item?.matchedDocument?.updated_at ||
      null,
    matchedDocument: item?.matchedDocument || null,
    canonicalRequirementInstanceId: item?.canonical_requirement_instance_id || item?.canonicalRequirementInstanceId || null,
  }
}

function filterRequiredDocuments(requiredDocumentChecklist = [], matchers = []) {
  return (requiredDocumentChecklist || [])
    .filter((item) => hasAnyMatch(getRequirementBlob(item), matchers))
    .map((item) => buildRequiredDocumentRow(item))
}

function filterDocuments(documents = [], { lane = '', matchers = [], relatedEntityType = '' } = {}) {
  return (documents || []).filter((item) => {
    if (lane && lower(item?.finance_lane) === lower(lane)) {
      if (!relatedEntityType) return true
      return lower(item?.related_entity_type) === lower(relatedEntityType)
    }
    if (relatedEntityType && lower(item?.related_entity_type) === lower(relatedEntityType)) return true
    return hasAnyMatch(getDocumentBlob(item), matchers)
  })
}

function buildDocumentRow(item = {}) {
  return {
    id: item?.id || '',
    name: item?.name || 'Finance document',
    category: item?.category || item?.document_type || 'Finance',
    uploadedAt: item?.created_at || item?.updated_at || null,
    uploadedByRole: item?.uploaded_by_role || item?.uploaded_by_party || null,
    url: item?.url || '',
    financeLane: item?.finance_lane || null,
    relatedEntityType: item?.related_entity_type || null,
    relatedEntityId: item?.related_entity_id || null,
    documentType: item?.document_type || null,
  }
}

function resolveBondApplications(workflowData = {}) {
  return Array.isArray(workflowData?.applications) ? workflowData.applications : []
}

function resolveBondOffers(workflowData = {}) {
  return Array.isArray(workflowData?.offers) ? workflowData.offers : Array.isArray(workflowData?.quotes) ? workflowData.quotes : []
}

function deriveBondStage(workflowData = {}, buyerDocumentRows = []) {
  const workflow = workflowData?.workflow || {}
  const summary = summarizeBondHybridFinanceWorkflow(workflowData)
  const applications = resolveBondApplications(workflowData)
  const offers = resolveBondOffers(workflowData)
  const instructionSent = Boolean(workflowData?.instruction?.instructionSent || workflowData?.instruction?.instruction_sent || summary.instructionSent)
  const hasAcceptedOffer = Boolean(summary.approvedQuote || workflowData?.acceptedOffer)
  const hasOffers = offers.length > 0
  const hasApplications = applications.length > 0
  const hasReviewedDocs =
    ['documents', 'submitted_to_banks', 'bank_review', 'quote_received', 'quote_accepted', 'instruction_sent', 'complete'].includes(
      normalizeBondHybridFinanceStage(workflow?.currentStage || workflow?.current_stage),
    )
  const uploadedBuyerDocs = buyerDocumentRows.filter((item) => item.status !== 'missing').length > 0

  if (normalizeBondHybridFinanceStage(workflow?.currentStage || workflow?.current_stage) === 'complete') return 'complete'
  if (instructionSent) return 'instruction_sent'
  if (hasAcceptedOffer) return 'quote_accepted'
  if (hasOffers) return 'quote_received'
  if (applications.some((item) => ['feedback_received', 'additional_documents_required', 'declined', 'approved', 'buyer_approved', 'quote_received'].includes(lower(item.status)))) return 'bank_review'
  if (hasApplications) return 'submitted_to_banks'
  if (hasReviewedDocs || uploadedBuyerDocs) return 'documents'
  return normalizeBondHybridFinanceStage(workflow?.currentStage || workflow?.current_stage || 'intake')
}

function deriveCashStatus({ transaction = {}, documents = [], requiredDocumentChecklist = [] } = {}) {
  const proofRows = filterRequiredDocuments(requiredDocumentChecklist, CASH_PROOF_MATCHERS)
  const proofDocuments = filterDocuments(documents, {
    lane: 'cash',
    matchers: CASH_PROOF_MATCHERS,
  }).map((item) => buildDocumentRow(item))
  const guaranteeDocuments = filterDocuments(documents, {
    lane: 'cash',
    matchers: GUARANTEE_MATCHERS,
  }).map((item) => buildDocumentRow(item))
  const depositDocuments = filterDocuments(documents, {
    lane: 'cash',
    matchers: ['deposit', 'proof of payment', 'reservation'],
  }).map((item) => buildDocumentRow(item))

  const proofUploaded = proofRows.some((item) => item.status !== 'missing') || proofDocuments.length > 0
  const attorneyVerified = proofRows.some((item) => item.status === 'approved') || hasAnyMatch(transaction?.next_action, ['proof verified', 'attorney verified'])
  const guaranteesRequired = Boolean(number(transaction?.guarantees) || number(transaction?.guarantee_amount))
  const guaranteesSecured =
    guaranteeDocuments.length > 0 ||
    hasAnyMatch(transaction?.stage, GUARANTEE_MATCHERS) ||
    hasAnyMatch(transaction?.next_action, ['guarantees secured', 'funds secured'])
  const stage =
    !proofUploaded
      ? 'proof_of_funds_required'
      : !attorneyVerified
        ? 'proof_uploaded'
        : guaranteesRequired && !guaranteesSecured
          ? 'attorney_verified'
          : guaranteesRequired || proofUploaded
            ? (guaranteesSecured ? 'ready_for_transfer' : 'guarantees_secured')
            : 'proof_of_funds_required'

  const steps = [
    { key: 'proof_of_funds_required', label: CASH_STAGE_LABELS.proof_of_funds_required, completed: proofUploaded || attorneyVerified || guaranteesSecured, current: stage === 'proof_of_funds_required' },
    { key: 'proof_uploaded', label: CASH_STAGE_LABELS.proof_uploaded, completed: attorneyVerified || guaranteesSecured, current: stage === 'proof_uploaded' },
    { key: 'attorney_verified', label: CASH_STAGE_LABELS.attorney_verified, completed: guaranteesSecured, current: stage === 'attorney_verified' },
    { key: 'guarantees_secured', label: CASH_STAGE_LABELS.guarantees_secured, completed: stage === 'ready_for_transfer', current: stage === 'guarantees_secured' },
    { key: 'ready_for_transfer', label: CASH_STAGE_LABELS.ready_for_transfer, completed: stage === 'ready_for_transfer', current: stage === 'ready_for_transfer' },
  ].map((item) => ({
    key: item.key,
    label: item.label,
    status: item.completed ? 'completed' : item.current ? 'current' : 'upcoming',
  }))

  return {
    stage,
    stageLabel: CASH_STAGE_LABELS[stage] || title(stage),
    proofRows,
    proofDocuments,
    guaranteeDocuments,
    depositDocuments,
    proofUploaded,
    attorneyVerified,
    guaranteesRequired,
    guaranteesSecured,
    readyForTransfer: stage === 'ready_for_transfer',
    steps,
  }
}

function deriveDeveloperStatus({ transaction = {}, documents = [] } = {}) {
  const applicationDocuments = filterDocuments(documents, {
    lane: 'developer',
    matchers: ['application', 'developer finance'],
  }).map((item) => buildDocumentRow(item))
  const depositDocuments = filterDocuments(documents, {
    lane: 'developer',
    matchers: ['deposit', 'proof of payment'],
  }).map((item) => buildDocumentRow(item))
  const approvalDocuments = filterDocuments(documents, {
    lane: 'developer',
    matchers: ['approval', 'approved'],
  }).map((item) => buildDocumentRow(item))
  const signedTermsDocuments = filterDocuments(documents, {
    lane: 'developer',
    matchers: ['signed terms', 'terms signed', 'terms'],
  }).map((item) => buildDocumentRow(item))
  const paymentScheduleDocuments = filterDocuments(documents, {
    lane: 'developer',
    matchers: ['payment schedule', 'schedule'],
  }).map((item) => buildDocumentRow(item))

  const applicationSubmitted = applicationDocuments.length > 0 || hasAnyMatch(transaction?.next_action, ['application submitted'])
  const depositPaid = depositDocuments.length > 0 || hasAnyMatch(transaction?.next_action, ['deposit paid'])
  const financeApproved = approvalDocuments.length > 0 || hasAnyMatch(transaction?.stage, ['approved']) || hasAnyMatch(transaction?.next_action, ['finance approved'])
  const termsSigned = signedTermsDocuments.length > 0 || hasAnyMatch(transaction?.next_action, ['terms signed'])

  const stage =
    !applicationSubmitted
      ? 'application_submitted'
      : !depositPaid
        ? 'deposit_paid'
        : !financeApproved
          ? 'finance_approved'
          : !termsSigned
            ? 'terms_signed'
            : 'ready_for_transfer'

  const steps = [
    { key: 'application_submitted', label: DEVELOPER_STAGE_LABELS.application_submitted, completed: applicationSubmitted && stage !== 'application_submitted', current: stage === 'application_submitted' },
    { key: 'deposit_paid', label: DEVELOPER_STAGE_LABELS.deposit_paid, completed: depositPaid && !['application_submitted', 'deposit_paid'].includes(stage), current: stage === 'deposit_paid' },
    { key: 'finance_approved', label: DEVELOPER_STAGE_LABELS.finance_approved, completed: financeApproved && !['application_submitted', 'deposit_paid', 'finance_approved'].includes(stage), current: stage === 'finance_approved' },
    { key: 'terms_signed', label: DEVELOPER_STAGE_LABELS.terms_signed, completed: termsSigned && stage === 'ready_for_transfer', current: stage === 'terms_signed' },
    { key: 'ready_for_transfer', label: DEVELOPER_STAGE_LABELS.ready_for_transfer, completed: stage === 'ready_for_transfer', current: stage === 'ready_for_transfer' },
  ].map((item) => ({
    key: item.key,
    label: item.label,
    status: item.completed ? 'completed' : item.current ? 'current' : 'upcoming',
  }))

  return {
    stage,
    stageLabel: DEVELOPER_STAGE_LABELS[stage] || title(stage),
    applicationDocuments,
    depositDocuments,
    approvalDocuments,
    signedTermsDocuments,
    paymentScheduleDocuments,
    readyForTransfer: stage === 'ready_for_transfer',
    steps,
  }
}

function buildRailGroup({ key, label, steps = [] }) {
  return {
    key,
    label,
    steps: (steps || []).map((item) => ({
      ...item,
      label: item?.label || title(item?.key || ''),
      status: item?.status || 'upcoming',
    })),
  }
}

function getLatestDate(values = []) {
  return values
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => right.getTime() - left.getTime())[0]?.toISOString() || null
}

function findStageEvent(workflowData = {}, stage = '') {
  return (workflowData?.events || [])
    .filter((event) => lower(event?.toStage || event?.to_stage) === lower(stage))
    .sort((left, right) => new Date(right?.createdAt || right?.created_at || 0).getTime() - new Date(left?.createdAt || left?.created_at || 0).getTime())[0] || null
}

function enrichBondRailSteps(steps = [], workflowData = {}, buyerDocumentRows = []) {
  const applications = resolveBondApplications(workflowData)
  const offers = resolveBondOffers(workflowData)
  const acceptedOffer = workflowData?.acceptedOffer || summarizeBondHybridFinanceWorkflow(workflowData || {}).approvedQuote || null
  const instruction = workflowData?.instruction || null
  const roleByStage = {
    intake: 'Bond Originator',
    documents: 'Buyer / Bond Originator',
    submitted_to_banks: 'Bond Originator',
    bank_review: 'Banks / Originator',
    quote_received: 'Banks / Originator',
    quote_accepted: 'Buyer',
    instruction_sent: 'Bond Originator',
    complete: 'Bond Originator',
  }

  return (steps || []).map((step) => {
    const event = findStageEvent(workflowData, step.key)
    let completedAt = event?.createdAt || event?.created_at || null
    let responsibleRole = event?.createdByName || null

    if (step.key === 'documents') {
      completedAt ||= getLatestDate(buyerDocumentRows.map((item) => item.uploadedAt))
    } else if (step.key === 'submitted_to_banks') {
      completedAt ||= getLatestDate(applications.map((item) => item.submittedAt || item.submitted_at || item.createdAt || item.created_at))
      responsibleRole ||= applications.find((item) => item.submittedByName || item.createdByName)?.submittedByName || applications.find((item) => item.submittedByName || item.createdByName)?.createdByName || null
    } else if (step.key === 'bank_review') {
      completedAt ||= getLatestDate(applications.map((item) => item.feedbackReceivedAt || item.feedback_received_at || item.updatedAt || item.updated_at))
    } else if (step.key === 'quote_received') {
      completedAt ||= getLatestDate(offers.map((item) => item.quoteReceivedAt || item.quote_received_at || item.createdAt || item.created_at))
      responsibleRole ||= offers.find((item) => item.uploadedByName || item.createdByName)?.uploadedByName || offers.find((item) => item.uploadedByName || item.createdByName)?.createdByName || null
    } else if (step.key === 'quote_accepted') {
      completedAt ||= acceptedOffer?.decisionAt || acceptedOffer?.approvedAt || acceptedOffer?.approved_at || null
      responsibleRole ||= 'Buyer'
    } else if (step.key === 'instruction_sent') {
      completedAt ||= instruction?.instructionSentAt || instruction?.instruction_sent_at || null
      responsibleRole ||= instruction?.instructionSentByName || null
    } else if (step.key === 'complete') {
      completedAt ||= workflowData?.workflow?.completedAt || workflowData?.workflow?.completed_at || null
    }

    return {
      ...step,
      completedAt: step.status === 'completed' || step.status === 'current' ? completedAt : null,
      responsibleRole: responsibleRole || roleByStage[step.key] || 'Finance team',
    }
  })
}

function enrichGenericRailSteps(steps = [], roleByStage = {}) {
  return (steps || []).map((step) => ({
    ...step,
    responsibleRole: roleByStage[step.key] || 'Finance team',
  }))
}

export function resolveTransactionFinancePermissions({
  viewerRole = '',
  activeViewerPermissions = null,
} = {}) {
  const role = normalizeRole(viewerRole)
  const canEditFinanceWorkflow =
    Boolean(activeViewerPermissions?.canEditFinanceWorkflow) &&
    ['bond_originator', 'admin'].includes(role)
  const canProxyFinanceWorkflow =
    Boolean(activeViewerPermissions?.canProxyFinanceWorkflow) &&
    ['agent', 'admin', 'internal_admin'].includes(role)
  const canUploadFromPermissions = Boolean(activeViewerPermissions?.canUploadDocuments)

  return {
    role,
    canUploadDocuments: canUploadFromPermissions || ['developer', 'admin', 'bond_originator', 'buyer'].includes(role),
    canReviewDocuments: canEditFinanceWorkflow || ['developer', 'admin', 'bond_originator'].includes(role),
    canManageApplications: canEditFinanceWorkflow || ['developer', 'admin', 'bond_originator'].includes(role),
    canManageOffers: canEditFinanceWorkflow || ['developer', 'admin', 'bond_originator'].includes(role),
    canAcceptOffer: ['developer', 'admin', 'buyer'].includes(role),
    canMarkInstructionSent: canEditFinanceWorkflow || ['developer', 'admin', 'bond_originator'].includes(role),
    canVerifyProofOfFunds: canEditFinanceWorkflow || ['developer', 'admin'].includes(role),
    canUpdateBlockers: canEditFinanceWorkflow || ['developer', 'admin', 'bond_originator'].includes(role),
    canProxyFinanceWorkflow,
  }
}

function deriveSummary({
  financeType,
  transaction = {},
  workflowData = {},
  bondStage,
  buyerDocumentRows = [],
  cashStatus,
  developerStatus,
}) {
  const workflow = workflowData?.workflow || {}
  const rawOwner = workflow?.financeOwner || workflow?.finance_owner || transaction?.finance_managed_by || transaction?.finance_owner || ''
  const ownerLabel =
    rawOwner
      ? title(rawOwner)
      : financeType === 'bond' || financeType === 'combination'
        ? 'Bond Originator'
        : financeType === 'developer'
          ? 'Developer'
          : 'Buyer / Attorney'

  let stageLabel = 'Not Started'
  let nextAction = text(workflow?.nextAction || workflow?.next_action || transaction?.next_action)
  let blockerStatus = text(workflow?.blockerStatus || workflow?.blocker_status)

  if (financeType === 'bond') {
    stageLabel = BOND_HYBRID_FINANCE_STAGE_LABELS[bondStage] || title(bondStage)
    if (!nextAction) {
      if (buyerDocumentRows.every((item) => item.status === 'missing')) nextAction = 'Request buyer finance documents'
      else if (!resolveBondApplications(workflowData).length) nextAction = 'Submit first bank application'
      else if (!resolveBondOffers(workflowData).length) nextAction = 'Capture first bank offer'
      else if (!workflowData?.acceptedOffer) nextAction = 'Await buyer quote decision'
      else if (!(workflowData?.instruction?.instructionSent || workflowData?.instruction?.instruction_sent)) nextAction = 'Send instruction to attorney'
      else nextAction = 'Finance workflow complete'
    }
    if (!blockerStatus) {
      blockerStatus =
        buyerDocumentRows.some((item) => item.status === 'missing')
          ? 'Missing documents'
          : !resolveBondOffers(workflowData).length && resolveBondApplications(workflowData).length
            ? 'Awaiting quotes'
            : 'No blockers'
    }
  } else if (financeType === 'combination') {
    stageLabel = `Bond: ${BOND_HYBRID_FINANCE_STAGE_LABELS[bondStage] || title(bondStage)} / Cash: ${cashStatus.stageLabel}`
    if (!nextAction) {
      nextAction = workflowData?.acceptedOffer && cashStatus.readyForTransfer
        ? 'Prepare finance handoff for transfer'
        : !workflowData?.acceptedOffer
          ? 'Await buyer bond decision'
          : !cashStatus.proofUploaded
            ? 'Upload proof of funds for cash portion'
            : !cashStatus.attorneyVerified
              ? 'Attorney to verify proof of funds'
              : 'Complete outstanding finance lane'
    }
    if (!blockerStatus) {
      blockerStatus = cashStatus.readyForTransfer && workflowData?.acceptedOffer
        ? 'No blockers'
        : 'Awaiting parallel finance completion'
    }
  } else if (financeType === 'developer') {
    stageLabel = developerStatus.stageLabel
    if (!nextAction) {
      nextAction =
        !developerStatus.applicationDocuments.length
          ? 'Upload developer finance application'
          : !developerStatus.depositDocuments.length
            ? 'Upload deposit proof'
            : !developerStatus.approvalDocuments.length
              ? 'Await developer finance approval'
              : !developerStatus.signedTermsDocuments.length
                ? 'Upload signed finance terms'
                : 'Finance workflow complete'
    }
    if (!blockerStatus) {
      blockerStatus = developerStatus.readyForTransfer ? 'No blockers' : 'Finance conditions outstanding'
    }
  } else {
    stageLabel = cashStatus.stageLabel
    if (!nextAction) {
      nextAction =
        !cashStatus.proofUploaded
          ? 'Upload proof of funds'
          : !cashStatus.attorneyVerified
            ? 'Attorney to verify proof of funds'
            : !cashStatus.guaranteesSecured && cashStatus.guaranteesRequired
              ? 'Secure guarantees / funds'
              : 'Finance workflow complete'
    }
    if (!blockerStatus) {
      blockerStatus =
        !cashStatus.proofUploaded
          ? 'Missing proof of funds'
          : !cashStatus.attorneyVerified
            ? 'Awaiting verification'
            : !cashStatus.guaranteesSecured && cashStatus.guaranteesRequired
              ? 'Awaiting guarantees'
              : 'No blockers'
    }
  }

  return {
    financeOwner: ownerLabel,
    currentStageLabel: stageLabel,
    nextAction: nextAction || 'Review finance workflow',
    blockerStatus: blockerStatus || 'No blockers',
  }
}

export function buildTransactionFinanceWorkspace({
  transaction = {},
  workflowData = null,
  requiredDocumentChecklist = [],
  documents = [],
  viewerRole = '',
  activeViewerPermissions = null,
} = {}) {
  const financeType = normalizeTransactionFinanceType(transaction?.finance_type, { allowUnknown: true })
  const permissions = resolveTransactionFinancePermissions({ viewerRole, activeViewerPermissions })
  const buyerDocumentRows = filterRequiredDocuments(requiredDocumentChecklist, BOND_DOCUMENT_MATCHERS)
  const bondApplications = resolveBondApplications(workflowData)
  const bondOffers = resolveBondOffers(workflowData)
  const bondInstruction = workflowData?.instruction || null
  const latestDecision = Array.isArray(workflowData?.decisions)
    ? [...workflowData.decisions].sort((left, right) => new Date(right?.decisionAt || right?.decision_at || 0).getTime() - new Date(left?.decisionAt || left?.decision_at || 0).getTime())[0] || null
    : null
  const bondStage = deriveBondStage(workflowData || {}, buyerDocumentRows)
  const cashStatus = deriveCashStatus({ transaction, documents, requiredDocumentChecklist })
  const developerStatus = deriveDeveloperStatus({ transaction, documents })
  const summary = deriveSummary({
    financeType,
    transaction,
    workflowData,
    bondStage,
    buyerDocumentRows,
    cashStatus,
    developerStatus,
  })

  const railGroups = []
  if (financeType === 'bond') {
    railGroups.push(
      buildRailGroup({
        key: 'bond',
        label: 'Bond Finance',
        steps: enrichBondRailSteps(
          buildBondHybridFinanceStageSteps({
            ...(workflowData || {}),
            workflow: {
              ...(workflowData?.workflow || {}),
              currentStage: bondStage,
            },
          }),
          workflowData || {},
          buyerDocumentRows,
        ),
      }),
    )
  } else if (financeType === 'combination') {
    railGroups.push(
      buildRailGroup({
        key: 'bond',
        label: 'Bond Portion',
        steps: enrichBondRailSteps(
          buildBondHybridFinanceStageSteps({
            ...(workflowData || {}),
            workflow: {
              ...(workflowData?.workflow || {}),
              currentStage: bondStage,
            },
          }),
          workflowData || {},
          buyerDocumentRows,
        ),
      }),
    )
    railGroups.push(buildRailGroup({ key: 'cash', label: 'Cash Portion', steps: enrichGenericRailSteps(cashStatus.steps, {
      proof_of_funds_required: 'Buyer',
      proof_uploaded: 'Buyer',
      attorney_verified: 'Attorney',
      guarantees_secured: 'Attorney',
      ready_for_transfer: 'Attorney',
    }) }))
  } else if (financeType === 'developer') {
    railGroups.push(buildRailGroup({ key: 'developer', label: 'Developer Finance', steps: enrichGenericRailSteps(developerStatus.steps, {
      application_submitted: 'Buyer / Developer',
      deposit_paid: 'Buyer',
      finance_approved: 'Developer',
      terms_signed: 'Buyer / Developer',
      ready_for_transfer: 'Developer',
    }) }))
  } else {
    railGroups.push(buildRailGroup({ key: 'cash', label: 'Cash Finance', steps: enrichGenericRailSteps(cashStatus.steps, {
      proof_of_funds_required: 'Buyer',
      proof_uploaded: 'Buyer',
      attorney_verified: 'Attorney',
      guarantees_secured: 'Attorney',
      ready_for_transfer: 'Attorney',
    }) }))
  }

  const bondQuoteDocuments = filterDocuments(documents, {
    lane: 'bond',
    matchers: ['quote', 'offer', 'approval letter', 'bond offer'],
    relatedEntityType: 'bond_offer',
  }).map((item) => buildDocumentRow(item))
  const instructionDocuments = filterDocuments(documents, {
    lane: 'bond',
    matchers: ['instruction'],
    relatedEntityType: 'bond_instruction',
  }).map((item) => buildDocumentRow(item))
  const bondSupportingDocuments = filterDocuments(documents, {
    lane: 'bond',
    matchers: BOND_DOCUMENT_MATCHERS,
  }).map((item) => buildDocumentRow(item))

  return {
    financeType,
    financeTypeLabel: financeTypeShortLabel(financeType === 'unknown' ? transaction?.finance_type : financeType),
    permissions,
    summaryBlocks: [
      {
        key: 'finance_type',
        label: 'Finance Type',
        value: financeType === 'unknown' ? 'Not captured' : title(financeType === 'combination' ? 'hybrid' : financeType),
        subtext: financeType === 'bond' ? 'Buyer using bond finance' : financeType === 'combination' ? 'Bond plus cash component' : financeType === 'developer' ? 'Developer finance route' : 'Cash / proof of funds route',
      },
      {
        key: 'finance_owner',
        label: 'Finance Owner',
        value: summary.financeOwner,
        subtext: financeType === 'bond' || financeType === 'combination' ? 'Bond Originator' : financeType === 'developer' ? 'Developer' : 'Buyer / Attorney',
      },
      {
        key: 'current_stage',
        label: 'Current Stage',
        value: summary.currentStageLabel,
        subtext: formatDate(workflowData?.workflow?.lastUpdatedAt || workflowData?.workflow?.last_updated_at || transaction?.updated_at, 'Not updated yet'),
      },
      {
        key: 'next_action',
        label: 'Next Action',
        value: summary.nextAction,
        subtext: summary.financeOwner,
      },
      {
        key: 'blocker_status',
        label: 'Blocker Status',
        value: summary.blockerStatus,
        subtext: summary.blockerStatus === 'No blockers' ? 'On track' : 'Needs attention',
      },
    ],
    railGroups,
    bond: {
      stage: bondStage,
      stageLabel: BOND_HYBRID_FINANCE_STAGE_LABELS[bondStage] || title(bondStage),
      buyerDocuments: buyerDocumentRows,
      applications: bondApplications,
      offers: bondOffers,
      offerDocuments: bondQuoteDocuments,
      latestDecision,
      acceptedOffer: workflowData?.acceptedOffer || summarizeBondHybridFinanceWorkflow(workflowData || {}).approvedQuote || null,
      instruction: bondInstruction,
      instructionDocuments,
      supportingDocuments: bondSupportingDocuments,
    },
    cash: cashStatus,
    developer: developerStatus,
    amounts: {
      purchasePrice: formatCurrency(transaction?.purchase_price || transaction?.sales_price || transaction?.price),
      deposit: formatCurrency(transaction?.deposit || transaction?.deposit_amount),
      cashPortion: formatCurrency(transaction?.cash_portion || transaction?.cash_contribution),
      bondAmount: formatCurrency(transaction?.bond_amount),
      transferFees: formatCurrency(transaction?.transfer_fees),
      bondRegistrationFees: formatCurrency(transaction?.bond_registration_fees),
      commission: formatCurrency(transaction?.commission),
    },
  }
}

export async function uploadFinanceDocument({
  transactionId = null,
  token = '',
  file,
  category,
  documentType = null,
  requiredDocumentKey = null,
  canonicalRequirementInstanceId = null,
  financeLane = null,
  relatedEntityType = null,
  relatedEntityId = null,
  isClientVisible = true,
  uploadedByParty = null,
}) {
  if (token) {
    return uploadClientPortalFinanceDocument({
      token,
      file,
      category,
      documentType,
      requiredDocumentKey,
      canonicalRequirementInstanceId,
      financeLane,
      relatedEntityType,
      relatedEntityId,
      uploadedByParty,
    })
  }

  return uploadTransactionFinanceDocument({
    transactionId,
    file,
    category,
    documentType,
    requiredDocumentKey,
    canonicalRequirementInstanceId,
    financeLane,
    relatedEntityType,
    relatedEntityId,
    isClientVisible,
    uploadedByParty,
  })
}

export async function submitBankApplication(transactionId, payload, options = {}) {
  return addBondApplication(transactionId, payload, options)
}

export async function updateBankApplication(applicationId, payload, options = {}) {
  return updateBondApplication(applicationId, payload, options)
}

export async function captureBondOffer(transactionId, payload = {}, options = {}) {
  const {
    file = null,
    quoteDocumentFile = null,
    quoteDocumentCategory = '',
    token = '',
    ...quotePayload
  } = payload || {}

  let uploaded = null
  const financeFile = file || quoteDocumentFile
  if (financeFile) {
    uploaded = await uploadFinanceDocument({
      transactionId,
      token,
      file: financeFile,
      category: quoteDocumentCategory || `Bond Quote - ${quotePayload.bankName || 'Bank'}`,
      documentType: 'bond_quote',
      financeLane: 'bond',
      relatedEntityType: 'bond_offer',
      uploadedByParty: token ? 'buyer' : 'bond_originator',
      isClientVisible: true,
    })
  }

  return addBondQuote(transactionId, {
    ...quotePayload,
    quoteDocumentId: uploaded?.id || quotePayload.quoteDocumentId || quotePayload.quote_document_id || null,
  }, options)
}

export async function uploadBondOfferDocument({
  transactionId,
  quoteId = '',
  token = '',
  file,
  bankName = '',
  category = '',
}) {
  return uploadFinanceDocument({
    transactionId,
    token,
    file,
    category: category || `Bond Quote - ${bankName || 'Bank'}`,
    documentType: 'bond_quote',
    financeLane: 'bond',
    relatedEntityType: 'bond_offer',
    relatedEntityId: quoteId || null,
    uploadedByParty: token ? 'buyer' : 'bond_originator',
    isClientVisible: true,
  })
}

export async function acceptBondOffer(quoteId, options = {}) {
  if (options?.token) {
    return recordBondOfferDecision(quoteId, {
      ...options,
      decision: 'accepted',
    })
  }
  return approveBondQuote(quoteId, options)
}

export async function declineBondOffer(quoteId, options = {}) {
  return declineBondQuote(quoteId, options)
}

export async function markBondInstructionSent(transactionId, payload = {}, options = {}) {
  const {
    file = null,
    token = '',
    category = '',
    ...instructionPayload
  } = payload || {}

  let uploaded = null
  if (file) {
    uploaded = await uploadFinanceDocument({
      transactionId,
      token,
      file,
      category: category || 'Finance Instruction',
      documentType: 'finance_instruction',
      financeLane: 'bond',
      relatedEntityType: 'bond_instruction',
      uploadedByParty: token ? 'buyer' : 'bond_originator',
      isClientVisible: true,
    })
  }

  return markFinanceInstructionSent(transactionId, {
    ...options,
    ...instructionPayload,
    instructionDocumentId: uploaded?.id || instructionPayload.instructionDocumentId || instructionPayload.instruction_document_id || null,
  })
}

export async function reviewFinanceDocuments(transactionId, options = {}) {
  return markFinanceDocumentsReviewed(transactionId, options)
}

export async function verifyFinanceProofOfFunds(transactionId, options = {}) {
  return verifyProofOfFunds(transactionId, options)
}

export async function updateFinanceBlockerStatus(transactionId, payload = {}) {
  return updateTransactionFinanceBlockerStatus(transactionId, payload)
}

export async function updateCapturedBondOffer(quoteId, payload = {}, options = {}) {
  return updateBondQuote(quoteId, payload, options)
}
