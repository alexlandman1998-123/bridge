export const BOND_PIPELINE_VIEW_PARAM = 'view'
export const BOND_TRANSACTION_VIEW_PARAM = 'view'

export const bondViews = {
  pipeline: {
    title: 'Pipeline',
    description: 'Incoming bond requests, incomplete files, and applications preparing for submission.',
    primaryActionLabel: '+ Create Application',
    secondaryActionLabel: 'Export Pipeline',
    basePath: '/bond/pipeline',
    legacyPath: '/applications',
    tabs: [
      { key: 'all', label: 'All', filters: { queue: 'all', stage: 'all' } },
      { key: 'new', label: 'New', filters: { queue: 'new_applications', stage: 'all' } },
      { key: 'awaiting-docs', label: 'Awaiting Docs', filters: { queue: 'missing_documents', stage: 'all' }, aliases: ['awaiting-documents'] },
      { key: 'ready-for-submission', label: 'Ready for Submission', filters: { queue: 'submission_readiness', stage: 'all' } },
      { key: 'submitted', label: 'Submitted', filters: { queue: 'submitted', stage: 'all' } },
      { key: 'stalled', label: 'Stalled', filters: { queue: 'overdue_applications', stage: 'all' } },
      { key: 'declined', label: 'Declined', filters: { queue: 'all', stage: 'declined' } },
    ],
    emptyTitle: 'No incoming applications found.',
    emptyDescription: 'New bond requests will appear here once a buyer selects bond finance or submits onboarding.',
  },
  transactions: {
    title: 'Transactions',
    description: 'Active bond files moving through approval, instruction, and registration.',
    primaryActionLabel: '+ Create Transaction',
    secondaryActionLabel: 'Export Transactions',
    basePath: '/bond/transactions',
    legacyPath: '/transactions',
    tabs: [
      { key: 'all', label: 'All', status: 'all' },
      { key: 'active', label: 'Active', status: 'active' },
      { key: 'bond-approved', label: 'Bond Approved', status: 'bond_approved' },
      { key: 'grant-signed', label: 'Grant Signed', status: 'grant_signed' },
      { key: 'instruction-sent', label: 'Instruction Sent', status: 'instruction_sent' },
      { key: 'attorney-stage', label: 'Attorney Stage', status: 'attorney_stage' },
      { key: 'registered', label: 'Registered', status: 'registered' },
      { key: 'at-risk', label: 'At Risk', status: 'at_risk' },
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
