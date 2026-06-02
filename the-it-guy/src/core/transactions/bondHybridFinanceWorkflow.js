export const BOND_HYBRID_FINANCE_WORKFLOW_TYPE = 'bond_hybrid'

export const BOND_HYBRID_FINANCE_STAGES = [
  'documents_received',
  'documents_reviewed',
  'applications_submitted',
  'quotes_received',
  'quote_approved',
  'instruction_sent',
]

export const BOND_HYBRID_FINANCE_STAGE_LABELS = {
  documents_received: 'Documents Received',
  documents_reviewed: 'Documents Reviewed',
  applications_submitted: 'Applications Submitted',
  quotes_received: 'Quotes Received',
  quote_approved: 'Quote Approved',
  instruction_sent: 'Instruction Sent',
}

export const BOND_HYBRID_FINANCE_STAGE_DESCRIPTIONS = {
  documents_received: 'Buyer finance documents have been received.',
  documents_reviewed: 'Buyer finance documents have been reviewed by the bond originator.',
  applications_submitted: 'Applications have been submitted to one or more banks or lenders.',
  quotes_received: 'Bank feedback or finance quotes have been received.',
  quote_approved: 'The buyer has approved one finance quote.',
  instruction_sent: 'Finance instruction has been sent and the finance workflow is complete.',
}

export const BOND_HYBRID_APPLICATION_STATUSES = [
  'pending',
  'submitted',
  'feedback_received',
  'quote_received',
  'additional_documents_required',
  'declined',
  'approved',
  'buyer_approved',
  'expired',
]

export const BOND_HYBRID_APPLICATION_STATUS_LABELS = {
  pending: 'Pending',
  submitted: 'Submitted',
  feedback_received: 'Feedback Received',
  quote_received: 'Quote Received',
  additional_documents_required: 'Additional Documents Required',
  declined: 'Declined',
  approved: 'Approved',
  buyer_approved: 'Buyer Approved',
  expired: 'Expired',
}

export const BOND_HYBRID_QUOTE_STATUSES = [
  'received',
  'accepted',
  'declined',
  'not_selected',
  'approved_by_buyer',
  'declined_by_buyer',
  'expired',
]

export const BOND_HYBRID_QUOTE_STATUS_LABELS = {
  received: 'Received',
  accepted: 'Accepted',
  declined: 'Declined',
  not_selected: 'Not Selected',
  approved_by_buyer: 'Approved By Buyer',
  declined_by_buyer: 'Declined By Buyer',
  expired: 'Expired',
}

export const BOND_HYBRID_WORKFLOW_EVENT_TYPES = [
  'stage_changed',
  'note_added',
  'bank_submission_added',
  'bank_feedback_added',
  'quote_added',
  'quote_approved',
  'instruction_sent',
]

export function normalizeBondHybridFinanceStage(value, fallback = 'documents_received') {
  const normalized = String(value || '').trim().toLowerCase()
  return BOND_HYBRID_FINANCE_STAGES.includes(normalized) ? normalized : fallback
}

export function getBondHybridFinanceStageLabel(stage) {
  const normalized = normalizeBondHybridFinanceStage(stage)
  return BOND_HYBRID_FINANCE_STAGE_LABELS[normalized] || BOND_HYBRID_FINANCE_STAGE_LABELS.documents_received
}

export function getBondHybridFinanceStageIndex(stage) {
  return BOND_HYBRID_FINANCE_STAGES.indexOf(normalizeBondHybridFinanceStage(stage))
}

export function normalizeBondHybridApplicationStatus(value, fallback = 'pending') {
  const normalized = String(value || '').trim().toLowerCase()
  return BOND_HYBRID_APPLICATION_STATUSES.includes(normalized) ? normalized : fallback
}

export function normalizeBondHybridQuoteStatus(value, fallback = 'received') {
  const normalized = String(value || '').trim().toLowerCase()
  return BOND_HYBRID_QUOTE_STATUSES.includes(normalized) ? normalized : fallback
}

export function isBondHybridFinanceWorkflowComplete(workflow = {}) {
  return workflow?.status === 'completed' || workflow?.currentStage === 'instruction_sent' || workflow?.current_stage === 'instruction_sent'
}

export function summarizeBondHybridFinanceWorkflow(workflowData = {}) {
  const workflow = workflowData.workflow || workflowData || null
  const applications = Array.isArray(workflowData.applications) ? workflowData.applications : []
  const quotes = Array.isArray(workflowData.quotes) ? workflowData.quotes : []
  const instruction = workflowData?.instruction || null
  const approvedQuote = quotes.find((quote) =>
    ['approved_by_buyer', 'accepted'].includes(quote.quoteStatus || quote.quote_status),
  ) || null
  const submittedApplications = applications.filter((application) =>
    ['submitted', 'in_review', 'feedback_received', 'quote_received', 'additional_documents_required', 'declined', 'approved', 'buyer_approved'].includes(
      application.status,
    ),
  )
  const quoteCount = quotes.filter((quote) => ['received', 'approved_by_buyer', 'accepted', 'declined', 'not_selected'].includes(quote.quoteStatus || quote.quote_status)).length

  return {
    currentStage: workflow?.currentStage || workflow?.current_stage || null,
    currentStageLabel: workflow?.currentStageLabel || getBondHybridFinanceStageLabel(workflow?.currentStage || workflow?.current_stage),
    status: workflow?.status || 'active',
    submittedBanksCount: submittedApplications.length,
    quotesReceivedCount: quoteCount,
    approvedBank: approvedQuote?.bankName || approvedQuote?.bank_name || null,
    approvedQuote,
    instructionSent: Boolean(instruction?.instructionSent || instruction?.instruction_sent) || isBondHybridFinanceWorkflowComplete(workflow),
  }
}

export function buildBondHybridFinanceStageSteps(workflowData = {}) {
  const workflow = workflowData.workflow || workflowData || null
  const currentStage = normalizeBondHybridFinanceStage(workflow?.currentStage || workflow?.current_stage)
  const currentIndex = getBondHybridFinanceStageIndex(currentStage)
  const status = workflow?.status || 'active'

  return BOND_HYBRID_FINANCE_STAGES.map((stage, index) => {
    let stepStatus = 'upcoming'
    if (status === 'completed' || index < currentIndex) stepStatus = 'completed'
    else if (index === currentIndex) stepStatus = 'current'

    return {
      key: stage,
      label: BOND_HYBRID_FINANCE_STAGE_LABELS[stage],
      description: BOND_HYBRID_FINANCE_STAGE_DESCRIPTIONS[stage],
      status: stepStatus,
    }
  })
}
