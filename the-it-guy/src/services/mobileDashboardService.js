import { getAgentDemoTransactionRowsFromStorage } from '../lib/agentDemoTransactionStorage'
import { resolveMobileRoleCategory } from '../config/mobileShell'

const DEFAULT_EMPTY = Object.freeze([])

function getDisplayName(workspace = {}) {
  const profile = workspace.profile || {}
  return profile.firstName || String(profile.fullName || '').split(' ').filter(Boolean)[0] || 'there'
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 18) return 'Good Afternoon'
  return 'Good Evening'
}

function normalizeText(value = '', fallback = '') {
  const text = String(value || '').trim()
  return text || fallback
}

function formatCurrencyShort(value = 0) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R0'
  if (amount >= 1000000) return `R${(amount / 1000000).toFixed(amount >= 10000000 ? 0 : 1)}m`
  if (amount >= 1000) return `R${Math.round(amount / 1000)}k`
  return `R${Math.round(amount)}`
}

function getDaysSince(value = null) {
  if (!value) return 0
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 0
  return Math.max(Math.floor((Date.now() - timestamp) / 86400000), 0)
}

function getAgentRows() {
  return getAgentDemoTransactionRowsFromStorage().filter((row) => {
    const stage = String(row?.stage || row?.transaction?.stage || '').toLowerCase()
    return !stage.includes('registered') && !row?.transaction?.registered_at
  })
}

function buildAgentActiveWork(rows = []) {
  return rows.slice(0, 5).map((row, index) => {
    const transaction = row.transaction || row
    const unit = row.unit || {}
    const buyer = row.buyer || transaction.buyer || {}
    const address = normalizeText(
      transaction.property_address_line_1 ||
        transaction.propertyAddress ||
        unit.address ||
        unit.name ||
        row.property ||
        row.address,
      `Transaction ${index + 1}`,
    )
    const stage = normalizeText(transaction.current_main_stage || transaction.stage || row.stage, 'In progress')
    const updatedAt = transaction.updated_at || transaction.last_meaningful_activity_at || row.updated_at || row.created_at
    const price = Number(transaction.sales_price || transaction.purchase_price || unit.price || 0)
    return {
      id: transaction.id || row.id || `agent-work-${index}`,
      title: address,
      eyebrow: normalizeText(buyer.fullName || buyer.name || transaction.buyer_name, 'Buyer pending'),
      stage,
      status: normalizeText(transaction.next_action || transaction.status, 'Moving'),
      progress: Math.min(90, Math.max(18, 20 + index * 14)),
      meta: `${getDaysSince(updatedAt)} days in stage`,
      value: price ? formatCurrencyShort(price) : '',
      to: transaction.id ? `/mobile/transaction/${transaction.id}` : '/mobile/transactions',
    }
  })
}

function buildRecentActivity(rows = [], label = 'Workspace update') {
  return rows.slice(0, 10).map((row, index) => {
    const transaction = row.transaction || row
    return {
      id: transaction.id ? `${transaction.id}-activity` : `activity-${index}`,
      title: normalizeText(transaction.next_action || transaction.current_sub_stage_summary || transaction.stage, label),
      body: normalizeText(transaction.property_address_line_1 || row.property || row.address, 'Workspace item updated'),
      time: index === 0 ? 'Now' : `${index + 1}h ago`,
    }
  })
}

const ROLE_COPY = {
  agent: {
    workloadLabel: 'Active Transactions',
    workTitle: 'My Active Work',
    workEmptyTitle: 'No active transactions yet.',
    workEmptyBody: 'Create a lead or open transactions when work starts moving.',
    taskEmptyTitle: 'No tasks due today.',
    taskEmptyBody: 'Time-sensitive transaction work will appear here.',
    activityEmptyTitle: 'No recent activity yet.',
    activityEmptyBody: 'Updates will appear as transactions move.',
    quickActions: [
      { key: 'create_lead', label: 'Create Lead', to: '/mobile/leads' },
      { key: 'create_listing', label: 'Create Listing', to: '/mobile/listings' },
      { key: 'open_transactions', label: 'Open Transactions', to: '/mobile/transactions' },
      { key: 'upload_document', label: 'Upload Document', to: '/mobile/documents' },
      { key: 'send_onboarding', label: 'Send Onboarding', to: '/mobile/leads' },
    ],
  },
  principal: {
    workloadLabel: 'Active Transactions',
    workTitle: 'Team Snapshot',
    workEmptyTitle: 'No team movement yet.',
    workEmptyBody: 'Top agents will appear once activity is available.',
    taskEmptyTitle: 'No management tasks due today.',
    taskEmptyBody: 'Agency follow-ups will appear here.',
    activityEmptyTitle: 'No agency activity yet.',
    activityEmptyBody: 'Recent team updates will appear here.',
    quickActions: [
      { key: 'view_agency', label: 'View Agency', to: '/mobile/home' },
      { key: 'view_transactions', label: 'View Transactions', to: '/mobile/transactions' },
      { key: 'view_leads', label: 'View Leads', to: '/mobile/leads' },
      { key: 'view_reports', label: 'View Reports', to: '/mobile/reports' },
    ],
  },
  attorney: {
    workloadLabel: 'Active Matters',
    workTitle: 'Active Matters',
    workEmptyTitle: 'No active matters yet.',
    workEmptyBody: 'Assigned matters will appear here once available.',
    taskEmptyTitle: 'No legal tasks due today.',
    taskEmptyBody: 'Document and milestone work will appear here.',
    activityEmptyTitle: 'No matter activity yet.',
    activityEmptyBody: 'Matter updates will appear as work moves.',
    quickActions: [
      { key: 'upload_document', label: 'Upload Document', to: '/mobile/documents' },
      { key: 'update_milestone', label: 'Update Milestone', to: '/mobile/matters' },
      { key: 'open_matters', label: 'Open Matters', to: '/mobile/matters' },
      { key: 'view_tasks', label: 'View Tasks', to: '/mobile/home' },
    ],
  },
  bond_originator: {
    workloadLabel: 'Active Applications',
    workTitle: 'Active Applications',
    workEmptyTitle: 'No active applications yet.',
    workEmptyBody: 'Bond applications will appear here once created.',
    taskEmptyTitle: 'No application tasks due today.',
    taskEmptyBody: 'Bank and document follow-ups will appear here.',
    activityEmptyTitle: 'No application activity yet.',
    activityEmptyBody: 'Bank responses and uploads will appear here.',
    quickActions: [
      { key: 'create_application', label: 'Create Application', to: '/mobile/applications' },
      { key: 'upload_document', label: 'Upload Document', to: '/mobile/documents' },
      { key: 'view_applications', label: 'View Applications', to: '/mobile/applications' },
      { key: 'view_tasks', label: 'View Tasks', to: '/mobile/home' },
    ],
  },
  commercial: {
    workloadLabel: 'Active Deals',
    workTitle: 'Active Deals',
    workEmptyTitle: 'No active deals yet.',
    workEmptyBody: 'Sales and leasing deals will appear here once active.',
    taskEmptyTitle: 'No commercial tasks due today.',
    taskEmptyBody: 'Requirements and deal follow-ups will appear here.',
    activityEmptyTitle: 'No commercial activity yet.',
    activityEmptyBody: 'Pipeline, listing, and deal updates will appear here.',
    quickActions: [
      { key: 'create_lead', label: 'Create Lead', to: '/mobile/pipeline' },
      { key: 'create_deal', label: 'Create Deal', to: '/mobile/deals' },
      { key: 'create_listing', label: 'Create Listing', to: '/mobile/listings' },
      { key: 'open_pipeline', label: 'Open Pipeline', to: '/mobile/pipeline' },
    ],
  },
}

function buildSummaryCards({ category, activeCount, pipelineValue }) {
  if (category === 'principal') {
    return [
      { key: 'active', label: 'Active Transactions', value: activeCount, tone: 'green' },
      { key: 'listings', label: 'Active Listings', value: 0, tone: 'blue' },
      { key: 'pipeline', label: 'Pipeline Value', value: formatCurrencyShort(pipelineValue), tone: 'navy' },
      { key: 'tasks', label: 'Tasks Due', value: 0, tone: 'amber' },
    ]
  }
  if (category === 'bond_originator') {
    return [
      { key: 'active', label: 'Active Applications', value: activeCount, tone: 'green' },
      { key: 'bank_responses', label: 'Bank Responses Pending', value: 0, tone: 'blue' },
      { key: 'tasks', label: 'Tasks Due', value: 0, tone: 'amber' },
      { key: 'notifications', label: 'Notifications', value: 0, tone: 'navy' },
    ]
  }
  if (category === 'commercial') {
    return [
      { key: 'active', label: 'Active Deals', value: activeCount, tone: 'green' },
      { key: 'vacancies', label: 'Vacancies', value: 0, tone: 'blue' },
      { key: 'requirements', label: 'Requirements', value: 0, tone: 'navy' },
      { key: 'tasks', label: 'Tasks Due', value: 0, tone: 'amber' },
    ]
  }
  const label = ROLE_COPY[category]?.workloadLabel || ROLE_COPY.agent.workloadLabel
  return [
    { key: 'active', label, value: activeCount, tone: 'green' },
    { key: 'tasks', label: 'Tasks Due Today', value: 0, tone: 'amber' },
    { key: 'documents', label: category === 'attorney' ? 'Documents Pending' : 'Documents Awaiting Review', value: 0, tone: 'blue' },
    { key: 'notifications', label: 'Unread Notifications', value: 0, tone: 'navy' },
  ]
}

export function getMobileDashboardSnapshot({ workspace = {} } = {}) {
  const category = resolveMobileRoleCategory(workspace)
  const copy = ROLE_COPY[category] || ROLE_COPY.agent
  const agentRows = category === 'agent' || category === 'principal' ? getAgentRows() : DEFAULT_EMPTY
  const activeWork = category === 'agent' ? buildAgentActiveWork(agentRows) : DEFAULT_EMPTY
  const pipelineValue = agentRows.reduce((sum, row) => {
    const transaction = row.transaction || row
    const value = Number(transaction.sales_price || transaction.purchase_price || row.unit?.price || 0)
    return Number.isFinite(value) ? sum + value : sum
  }, 0)

  return {
    category,
    displayName: getDisplayName(workspace),
    greeting: getGreeting(),
    generatedAt: new Date().toISOString(),
    summaryCards: buildSummaryCards({ category, activeCount: activeWork.length, pipelineValue }),
    activeWork,
    tasks: DEFAULT_EMPTY,
    recentActivity: buildRecentActivity(agentRows, `${copy.workloadLabel} updated`),
    quickActions: copy.quickActions,
    insight: category === 'agent' && pipelineValue > 0
      ? { label: 'Commission Pipeline', value: `${formatCurrencyShort(pipelineValue)} Pipeline`, body: 'Estimated transaction value currently moving.' }
      : null,
    copy,
    notifications: { unreadCount: 0 },
  }
}
