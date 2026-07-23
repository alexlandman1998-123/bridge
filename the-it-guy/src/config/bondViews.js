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
      { key: 'incoming', label: 'Incoming', status: 'all', aliases: ['all', 'new'] },
      { key: 'processing', label: 'Processing', status: 'all', aliases: ['active', 'bond-approved', 'grant-signed', 'instruction-sent', 'attorney-stage', 'at-risk'] },
      { key: 'registered', label: 'Registered', status: 'registered' },
      { key: 'declined', label: 'Declined', status: 'cancelled', aliases: ['cancelled', 'declined'] },
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

export function getBondTransactionView(viewKey = 'incoming') {
  const normalized = String(viewKey || 'incoming')
  return bondViews.transactions.tabs.find((tab) => tab.key === normalized || tab.aliases?.includes(normalized)) || bondViews.transactions.tabs[0]
}

export function getBondTransactionViewFromStatus(status = 'all') {
  const normalized = String(status || 'all')
  return bondViews.transactions.tabs.find((tab) => tab.status === normalized || tab.aliases?.includes(normalized)) || bondViews.transactions.tabs[0]
}
