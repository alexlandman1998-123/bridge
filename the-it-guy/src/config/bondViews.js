export const BOND_PIPELINE_VIEW_PARAM = 'view'
export const BOND_TRANSACTION_VIEW_PARAM = 'view'

export const bondViews = {
  pipeline: {
    title: 'Pipeline',
    description: 'Incoming bond requests and incomplete files before they are ready for review.',
    primaryActionLabel: '+ Create Application',
    secondaryActionLabel: 'Export Pipeline',
    basePath: '/bond/pipeline',
    legacyPath: '/applications',
    tabs: [
      { key: 'all', label: 'All', filters: { queue: 'all', stage: 'all' } },
      { key: 'awaiting-otp', label: 'Awaiting OTP', filters: { queue: 'awaiting_otp', stage: 'all' }, aliases: ['new'] },
      { key: 'ready-to-start', label: 'Ready To Start', filters: { queue: 'ready_to_start', stage: 'all' } },
      { key: 'in-progress', label: 'In Progress', filters: { queue: 'application_in_progress', stage: 'all' }, aliases: ['awaiting-docs', 'awaiting-documents'] },
      { key: 'submitted', label: 'Application Submitted', filters: { queue: 'application_submitted', stage: 'all' }, aliases: ['ready-for-submission'] },
      { key: 'ready-for-review', label: 'Ready For Review', filters: { queue: 'ready_for_review', stage: 'all' }, aliases: ['review-ready'] },
      { key: 'stalled', label: 'Stalled', filters: { queue: 'overdue_applications', stage: 'all' } },
      { key: 'declined', label: 'Declined', filters: { queue: 'all', stage: 'declined' } },
    ],
    emptyTitle: 'No incoming applications found.',
    emptyDescription: 'Bond requests will appear here once buyer onboarding is submitted and will move to Applications when ready for review.',
  },
  transactions: {
    title: 'Applications',
    description: 'Active bond applications being managed through approval, instruction, and registration.',
    primaryActionLabel: '+ Create Application',
    secondaryActionLabel: 'Export Applications',
    basePath: '/bond/applications',
    legacyPath: '/bond/transactions',
    tabs: [
      { key: 'all', label: 'All', status: 'all' },
      { key: 'active', label: 'Active', status: 'active' },
      { key: 'awaiting-bank-feedback', label: 'Awaiting Bank', status: 'awaiting_bank_feedback' },
      { key: 'additional-documents', label: 'Additional Docs', status: 'additional_documents_required' },
      { key: 'buyer-reupload', label: 'Buyer Re-upload', status: 'awaiting_buyer_reupload' },
      { key: 'bond-approved', label: 'Bond Approved', status: 'bond_approved' },
      { key: 'awaiting-grant', label: 'Awaiting Grant', status: 'awaiting_grant_document' },
      { key: 'grant-received', label: 'Grant Received', status: 'grant_received' },
      { key: 'awaiting-signed-grant', label: 'Awaiting Signed Grant', status: 'awaiting_signed_grant' },
      { key: 'grant-signed', label: 'Grant Signed', status: 'grant_signed' },
      { key: 'grant-submitted', label: 'Grant Submitted', status: 'grant_submitted' },
      { key: 'instruction-sent', label: 'Instruction Sent', status: 'instruction_sent' },
      { key: 'attorney-acceptance', label: 'Attorney Acceptance', status: 'instruction_sent_awaiting_attorney_acceptance' },
      { key: 'review-required', label: 'Review Required', status: 'active_review_required' },
      { key: 'attorney-stage', label: 'Attorney Stage', status: 'attorney_stage' },
      { key: 'registered', label: 'Registered', status: 'registered' },
      { key: 'at-risk', label: 'At Risk', status: 'at_risk' },
      { key: 'declined', label: 'Declined', status: 'cancelled' },
    ],
  },
}

export function getBondPipelineView(viewKey = 'all') {
  const normalized = String(viewKey || 'all')
  return bondViews.pipeline.tabs.find((tab) => tab.key === normalized || tab.aliases?.includes(normalized)) || bondViews.pipeline.tabs[0]
}

export function getBondPipelineViewFromFilters(filters = {}) {
  const queue = String(filters.queue || 'all')
  const stage = String(filters.stage || 'all')
  return (
    bondViews.pipeline.tabs.find((tab) => {
      const tabQueue = String(tab.filters?.queue || 'all')
      const tabStage = String(tab.filters?.stage || 'all')
      return tabQueue === queue && tabStage === stage
    }) || bondViews.pipeline.tabs[0]
  )
}

export function getBondTransactionView(viewKey = 'all') {
  return bondViews.transactions.tabs.find((tab) => tab.key === viewKey) || bondViews.transactions.tabs[0]
}

export function getBondTransactionViewFromStatus(status = 'all') {
  return bondViews.transactions.tabs.find((tab) => tab.status === status) || bondViews.transactions.tabs[0]
}
