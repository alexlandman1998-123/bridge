export const BOND_HYBRID_FINANCE_WORKFLOW_TYPE = 'bond_hybrid'

export const BOND_HYBRID_FINANCE_STAGES = [
  'intake',
  'documents',
  'submitted_to_banks',
  'bank_review',
  'quote_received',
  'quote_accepted',
  'bond_approved',
  'grant_received',
  'grant_signed',
  'grant_submitted',
  'instruction_sent',
  'complete',
]

export const BOND_HYBRID_FINANCE_STAGE_LABELS = {
  intake: 'Intake',
  documents: 'Documents',
  submitted_to_banks: 'Submitted to Banks',
  bank_review: 'Bank Review',
  quote_received: 'Quote Received',
  quote_accepted: 'Quote Accepted',
  bond_approved: 'Bond Approved',
  grant_received: 'Grant Received',
  grant_signed: 'Grant Signed',
  grant_submitted: 'Grant Submitted',
  instruction_sent: 'Instruction Issued',
  complete: 'Complete',
}

export const BOND_HYBRID_FINANCE_STAGE_DESCRIPTIONS = {
  intake: 'The bond application intake is open.',
  documents: 'Buyer finance documents are being collected and reviewed.',
  submitted_to_banks: 'Applications have been submitted to one or more banks or lenders.',
  bank_review: 'Banks are reviewing the application or requesting additional documents.',
  quote_received: 'Bank feedback or finance quotes have been received.',
  quote_accepted: 'The buyer has accepted one finance quote.',
  bond_approved: 'The bond approval is confirmed and ready for grant processing.',
  grant_received: 'The formal bond grant has been received from the lender.',
  grant_signed: 'The buyer has signed the bond grant.',
  grant_submitted: 'The signed bond grant has been submitted for instruction.',
  instruction_sent: 'Finance instruction has been issued to the attorney workflow.',
  complete: 'Finance workflow is complete.',
}

export const BOND_HYBRID_FINANCE_STAGE_ALIASES = {
  buyer_onboarding_started: 'intake',
  intake_started: 'intake',
  documents_requested: 'documents',
  documents_pending: 'documents',
  documents_received: 'documents',
  documents_reviewed: 'documents',
  documents_verified: 'documents',
  applications_submitted: 'submitted_to_banks',
  submitted: 'submitted_to_banks',
  bank_feedback: 'bank_review',
  bank_feedback_pending: 'bank_review',
  quotes_received: 'quote_received',
  quote_approved: 'quote_accepted',
  approved_by_buyer: 'quote_accepted',
  accepted: 'quote_accepted',
  approved: 'bond_approved',
  bond_approved: 'bond_approved',
  approval_granted: 'bond_approved',
  grant_received: 'grant_received',
  bond_grant_received: 'grant_received',
  grant_signed: 'grant_signed',
  bond_grant_signed: 'grant_signed',
  grant_submitted: 'grant_submitted',
  bond_grant_submitted: 'grant_submitted',
  instruction_issued: 'instruction_sent',
  bond_instruction_sent: 'instruction_sent',
  registered: 'complete',
  completed: 'complete',
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
  'bond_approved',
  'grant_received',
  'grant_signed',
  'grant_submitted',
  'instruction_sent',
]

export function normalizeBondHybridFinanceStage(value, fallback = 'intake') {
  const normalized = String(value || '').trim().toLowerCase()
  if (BOND_HYBRID_FINANCE_STAGE_ALIASES[normalized]) return BOND_HYBRID_FINANCE_STAGE_ALIASES[normalized]
  return BOND_HYBRID_FINANCE_STAGES.includes(normalized) ? normalized : fallback
}

export function getBondHybridFinanceStageLabel(stage) {
  const normalized = normalizeBondHybridFinanceStage(stage)
  return BOND_HYBRID_FINANCE_STAGE_LABELS[normalized] || BOND_HYBRID_FINANCE_STAGE_LABELS.intake
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
  const stage = normalizeBondHybridFinanceStage(workflow?.currentStage || workflow?.current_stage)
  return workflow?.status === 'completed' || stage === 'complete'
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
    bondApproved: Boolean(approvedQuote),
    grantReceived: Boolean(instruction?.grantReceived || instruction?.grant_received || instruction?.grantDocumentId || instruction?.grant_document_id),
    grantSigned: Boolean(instruction?.grantSigned || instruction?.grant_signed || instruction?.signedGrantDocumentId || instruction?.signed_grant_document_id),
    grantSubmitted: Boolean(instruction?.grantSubmitted || instruction?.grant_submitted),
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

export function getBondHybridFinanceProgressPercent(stage, status = 'active') {
  if (status === 'completed') return 100
  const index = getBondHybridFinanceStageIndex(stage)
  if (index < 0) return 0
  return Math.min(100, Math.round((index / Math.max(BOND_HYBRID_FINANCE_STAGES.length - 1, 1)) * 100))
}
