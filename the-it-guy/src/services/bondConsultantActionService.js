export const BOND_CONSULTANT_ACTION_PARAM = 'action'
export const BOND_CONSULTANT_TAB_PARAM = 'tab'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

const PROGRESS_STAGE_LABELS = {
  documents_received: 'Documents Received',
  documents_reviewed: 'Documents Reviewed',
  ready_for_review: 'Ready For Review',
  applications_submitted: 'Applications Submitted',
  quotes_received: 'Quotes Received',
  quote_approved: 'Quote Approved',
  bond_approved: 'Bond Approved',
  grant_received: 'Grant Received',
  grant_signed: 'Grant Signed',
  grant_submitted: 'Grant Submitted',
  instruction_sent: 'Instruction Sent',
  registered: 'Registered',
  declined: 'Declined',
}

export const APPLICATION_PROGRESS_STAGE_OPTIONS = [
  { key: 'all', label: 'All stages' },
  { key: 'documents_received', label: PROGRESS_STAGE_LABELS.documents_received },
  { key: 'documents_reviewed', label: PROGRESS_STAGE_LABELS.documents_reviewed },
  { key: 'ready_for_review', label: PROGRESS_STAGE_LABELS.ready_for_review },
  { key: 'applications_submitted', label: PROGRESS_STAGE_LABELS.applications_submitted },
  { key: 'quotes_received', label: PROGRESS_STAGE_LABELS.quotes_received },
  { key: 'quote_approved', label: PROGRESS_STAGE_LABELS.quote_approved },
  { key: 'bond_approved', label: PROGRESS_STAGE_LABELS.bond_approved },
  { key: 'grant_received', label: PROGRESS_STAGE_LABELS.grant_received },
  { key: 'grant_signed', label: PROGRESS_STAGE_LABELS.grant_signed },
  { key: 'grant_submitted', label: PROGRESS_STAGE_LABELS.grant_submitted },
  { key: 'instruction_sent', label: PROGRESS_STAGE_LABELS.instruction_sent },
  { key: 'registered', label: PROGRESS_STAGE_LABELS.registered },
  { key: 'declined', label: PROGRESS_STAGE_LABELS.declined },
]

export const BOND_CONSULTANT_ACTIONS = Object.freeze({
  reviewApplication: {
    key: 'review-application',
    label: 'Review application',
    reason: 'Confirm captured buyer finance details before document review.',
    targetWorkspaceTab: 'application',
    targetAction: 'review-application',
    requiredInputs: ['Buyer application data'],
  },
  requestDocuments: {
    key: 'request-docs',
    label: 'Request docs',
    reason: 'Ask the buyer or roleplayer for missing finance documents.',
    targetWorkspaceTab: 'documents',
    targetAction: 'request-docs',
    requiredInputs: ['Outstanding document list'],
  },
  reviewDocuments: {
    key: 'review-docs',
    label: 'Review docs',
    reason: 'Check uploaded finance documents before bank submission.',
    targetWorkspaceTab: 'documents',
    targetAction: 'review-docs',
    requiredInputs: ['Uploaded finance documents'],
  },
  submitBank: {
    key: 'submit-bank',
    label: 'Submit to banks',
    reason: 'Send the application to one or more configured banks.',
    targetWorkspaceTab: 'workflow',
    targetAction: 'submit-bank',
    requiredInputs: ['Bank name', 'Submission date'],
  },
  updateBankFeedback: {
    key: 'update-bank-feedback',
    label: 'Update bank feedback',
    reason: 'Record lender feedback, status changes, or document queries.',
    targetWorkspaceTab: 'workflow',
    targetAction: 'update-bank-feedback',
    requiredInputs: ['Bank status'],
  },
  captureOffer: {
    key: 'capture-offer',
    label: 'Capture offer',
    reason: 'Capture the bank quote so the buyer can decide.',
    targetWorkspaceTab: 'workflow',
    targetAction: 'capture-offer',
    requiredInputs: ['Bank', 'Offer amount', 'Rate'],
  },
  recordBuyerDecision: {
    key: 'record-buyer-decision',
    label: 'Record decision',
    reason: 'Record the buyer decision against the preferred offer.',
    targetWorkspaceTab: 'workflow',
    targetAction: 'record-buyer-decision',
    requiredInputs: ['Selected quote'],
  },
  recordGrantReceived: {
    key: 'record-grant-received',
    label: 'Record grant',
    reason: 'Upload or link the lender grant and move the file forward.',
    targetWorkspaceTab: 'workflow',
    targetAction: 'record-grant-received',
    requiredInputs: ['Bond grant document'],
  },
  recordGrantSigned: {
    key: 'record-grant-signed',
    label: 'Record signed grant',
    reason: 'Upload or link the signed grant returned by the buyer.',
    targetWorkspaceTab: 'workflow',
    targetAction: 'record-grant-signed',
    requiredInputs: ['Signed bond grant'],
  },
  submitGrant: {
    key: 'submit-grant',
    label: 'Submit grant',
    reason: 'Mark the signed grant as submitted for attorney instruction.',
    targetWorkspaceTab: 'workflow',
    targetAction: 'submit-grant',
    requiredInputs: ['Signed grant confirmation'],
  },
  sendAttorneyInstruction: {
    key: 'send-attorney-instruction',
    label: 'Send instruction',
    reason: 'Issue the bond instruction handoff to the attorney workflow.',
    targetWorkspaceTab: 'workflow',
    targetAction: 'send-attorney-instruction',
    requiredInputs: ['Attorney instruction document'],
  },
  monitorRegistration: {
    key: 'monitor-registration',
    label: 'Monitor transfer',
    reason: 'Watch attorney registration progress after instruction.',
    targetWorkspaceTab: 'activity',
    targetAction: 'monitor-registration',
    requiredInputs: [],
  },
  reviewOutcome: {
    key: 'review-outcome',
    label: 'Review outcome',
    reason: 'Review the declined, cancelled, or completed application outcome.',
    targetWorkspaceTab: 'activity',
    targetAction: 'review-outcome',
    requiredInputs: [],
  },
})

const ACTION_ALIASES = {
  request_documents: 'request-docs',
  request_document: 'request-docs',
  documents: 'request-docs',
  review_documents: 'review-docs',
  submit_to_banks: 'submit-bank',
  bank_submission: 'submit-bank',
  update_bank: 'update-bank-feedback',
  bank_feedback: 'update-bank-feedback',
  capture_quote: 'capture-offer',
  capture_offer: 'capture-offer',
  quote: 'capture-offer',
  offer: 'capture-offer',
  buyer_decision: 'record-buyer-decision',
  grant_received: 'record-grant-received',
  record_grant: 'record-grant-received',
  grant_signed: 'record-grant-signed',
  signed_grant: 'record-grant-signed',
  grant_submitted: 'submit-grant',
  instruction: 'send-attorney-instruction',
  instruction_sent: 'send-attorney-instruction',
  attorney_instruction: 'send-attorney-instruction',
}

export function normalizeBondConsultantActionKey(value = '') {
  const normalized = normalizeKey(value)
  const hyphenated = normalized.replace(/_/g, '-')
  if (Object.values(BOND_CONSULTANT_ACTIONS).some((action) => action.key === hyphenated)) return hyphenated
  return ACTION_ALIASES[normalized] || hyphenated
}

export function resolveBondProgressStage(row = {}) {
  const normalized = {
    financeKey: normalizeKey(row?.financeStageKey),
    financeLabel: normalizeText(row?.financeStageLabel).toLowerCase(),
    transferKey: normalizeKey(row?.transferStageKey),
    transferLabel: normalizeText(row?.transferStageLabel).toLowerCase(),
    status: normalizeKey(row?.status),
    risk: normalizeText(row?.riskStatus).toLowerCase(),
    nextAction: normalizeText(row?.nextAction).toLowerCase(),
  }

  if (normalized.status === 'cancelled') return 'declined'
  if (normalized.financeKey === 'ready_for_review' || normalized.financeLabel === 'ready for review') return 'ready_for_review'
  if (normalized.status === 'registered' || normalized.transferKey === 'registered') return 'registered'
  if (['bond_instruction_sent', 'instruction_sent'].includes(normalized.financeKey)) return 'instruction_sent'
  if (['bond_approved', 'bond_approved_', 'approval_granted'].includes(normalized.financeKey)) return 'bond_approved'
  if (normalized.financeKey === 'grant_received') return 'grant_received'
  if (normalized.financeKey === 'grant_signed') return 'grant_signed'
  if (normalized.financeKey === 'grant_submitted') return 'grant_submitted'
  if (['bond_application_open', 'pre_approval', 'docs_collection', 'finance_requested'].includes(normalized.financeKey)) {
    return normalized.financeKey === 'pre_approval' ? 'documents_reviewed' : 'documents_received'
  }
  if (normalized.financeKey === 'submitted_to_banks' || normalized.financeLabel.includes('submitted')) return 'applications_submitted'
  if (
    normalized.financeKey === 'bank_feedback'
    || normalized.status === 'bank_feedback'
    || normalized.risk.includes('bank feedback')
    || /(bank|lender).*(feedback|query|response)|respond.*(bank|lender)/.test(normalized.nextAction)
  ) {
    return 'quotes_received'
  }
  if (normalized.financeLabel.includes('grant submitted')) return 'grant_submitted'
  if (normalized.financeLabel.includes('grant signed')) return 'grant_signed'
  if (normalized.financeLabel.includes('grant received')) return 'grant_received'
  if (normalized.financeLabel.includes('bond approved')) return 'bond_approved'
  if (normalized.status === 'approved' || normalized.financeLabel.includes('approved') || normalized.financeLabel.includes('quote')) return 'quote_approved'
  if (normalized.transferKey === 'lodgement' || normalized.transferLabel.includes('lodgement') || normalized.transferLabel.includes('registered')) return 'instruction_sent'

  return 'documents_received'
}

function pickActionForExplicitNextAction(nextAction = '') {
  const normalized = normalizeText(nextAction).toLowerCase()
  if (!normalized || normalized === 'no next action set') return null
  if (/(request|missing|outstanding|fica|statement|pay\s*slip|payslip|document|upload|doc)/.test(normalized)) return BOND_CONSULTANT_ACTIONS.requestDocuments
  if (/(submit).*(bank|lender)|bank submission|send.*bank/.test(normalized)) return BOND_CONSULTANT_ACTIONS.submitBank
  if (/(feedback|query|respond|lender response|bank response)/.test(normalized)) return BOND_CONSULTANT_ACTIONS.updateBankFeedback
  if (/(quote|offer)/.test(normalized) && /(capture|record|received|compare)/.test(normalized)) return BOND_CONSULTANT_ACTIONS.captureOffer
  if (/(decision|accept|approve).*(quote|offer)|buyer.*decision/.test(normalized)) return BOND_CONSULTANT_ACTIONS.recordBuyerDecision
  if (/signed grant/.test(normalized)) return BOND_CONSULTANT_ACTIONS.recordGrantSigned
  if (/grant.*submit|submit.*grant/.test(normalized)) return BOND_CONSULTANT_ACTIONS.submitGrant
  if (/grant/.test(normalized)) return BOND_CONSULTANT_ACTIONS.recordGrantReceived
  if (/instruction|attorney/.test(normalized)) return BOND_CONSULTANT_ACTIONS.sendAttorneyInstruction
  return null
}

function getStageAction(stage = '') {
  const actionsByStage = {
    documents_received: BOND_CONSULTANT_ACTIONS.reviewApplication,
    documents_reviewed: BOND_CONSULTANT_ACTIONS.reviewDocuments,
    ready_for_review: BOND_CONSULTANT_ACTIONS.submitBank,
    applications_submitted: BOND_CONSULTANT_ACTIONS.updateBankFeedback,
    quotes_received: BOND_CONSULTANT_ACTIONS.captureOffer,
    quote_approved: BOND_CONSULTANT_ACTIONS.recordBuyerDecision,
    bond_approved: BOND_CONSULTANT_ACTIONS.recordGrantReceived,
    grant_received: BOND_CONSULTANT_ACTIONS.recordGrantSigned,
    grant_signed: BOND_CONSULTANT_ACTIONS.submitGrant,
    grant_submitted: BOND_CONSULTANT_ACTIONS.sendAttorneyInstruction,
    instruction_sent: BOND_CONSULTANT_ACTIONS.monitorRegistration,
    registered: BOND_CONSULTANT_ACTIONS.reviewOutcome,
    declined: BOND_CONSULTANT_ACTIONS.reviewOutcome,
  }
  return actionsByStage[stage] || BOND_CONSULTANT_ACTIONS.reviewApplication
}

export function resolveBondConsultantAction(row = {}) {
  const stage = resolveBondProgressStage(row)
  const explicitAction = pickActionForExplicitNextAction(row.nextAction)
  const action = explicitAction || getStageAction(stage)
  const blockers = []
  if (action.key === 'submit-bank' && Number(row.missingDocuments ?? row.documentSummary?.missingCount ?? 0) > 0) {
    blockers.push('Outstanding documents')
  }
  if (action.key === 'send-attorney-instruction' && !row.acceptedOffer && !row.acceptedQuote) {
    blockers.push('Accepted quote')
  }

  return {
    ...action,
    stage,
    stageLabel: PROGRESS_STAGE_LABELS[stage] || 'In progress',
    blockers,
    secondaryActions: [
      BOND_CONSULTANT_ACTIONS.requestDocuments,
      BOND_CONSULTANT_ACTIONS.captureOffer,
      BOND_CONSULTANT_ACTIONS.monitorRegistration,
    ].filter((item) => item.key !== action.key),
  }
}

export function getBondConsultantActionDeepLinkState(actionKey = '') {
  const normalized = normalizeBondConsultantActionKey(actionKey)
  const action = Object.values(BOND_CONSULTANT_ACTIONS).find((item) => item.key === normalized) || null
  if (!action) return { actionKey: normalized, targetWorkspaceTab: 'overview', targetAction: normalized }
  return {
    actionKey: action.key,
    targetWorkspaceTab: action.targetWorkspaceTab,
    targetAction: action.targetAction,
  }
}

export function buildBondConsultantActionHref(rowOrTransactionId = {}, actionOverride = null) {
  const transactionId = normalizeText(
    typeof rowOrTransactionId === 'string'
      ? rowOrTransactionId
      : rowOrTransactionId.transactionId || rowOrTransactionId.transaction_id || rowOrTransactionId.id,
  )
  if (!transactionId) return '/bond/pipeline?view=all'
  const action = actionOverride || resolveBondConsultantAction(rowOrTransactionId)
  const params = new URLSearchParams()
  params.set(BOND_CONSULTANT_TAB_PARAM, action.targetWorkspaceTab || 'overview')
  params.set(BOND_CONSULTANT_ACTION_PARAM, action.targetAction || action.key)
  return `/bond/files/${encodeURIComponent(transactionId)}?${params.toString()}`
}
