import { MAIN_STAGE_LABELS, getMainStageFromDetailedStage } from './stages'
import { normalizeFinanceType } from '../core/transactions/financeType'

export const currencyFormatter = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

export const integerFormatter = new Intl.NumberFormat('en-ZA')

export const executiveTransactionStages = [
  { key: 'RESERVED', label: 'Reserved', raw: ['AVAIL', 'DEP'] },
  { key: 'SIGNED', label: 'Signed', raw: ['OTP'] },
  { key: 'BOND', label: 'Bond', raw: ['FIN'] },
  { key: 'LEGAL', label: 'Legal', raw: ['ATTY'] },
  { key: 'REGISTRATION', label: 'Registration', raw: ['XFER'] },
  { key: 'COMPLETE', label: 'Complete', raw: ['REG'] },
]

export function formatRelativeTimestamp(value) {
  if (!value) return 'No recent update'

  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'No recent update'

  const delta = Date.now() - timestamp
  if (!Number.isFinite(delta) || delta < 0) return 'Updated just now'

  const minutes = Math.floor(delta / (1000 * 60))
  if (minutes < 1) return 'Updated just now'
  if (minutes < 60) return `Updated ${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Updated ${hours}h ago`
  if (hours < 48) return 'Updated yesterday'

  const days = Math.floor(hours / 24)
  if (days < 7) return `Updated ${days}d ago`

  return `Updated ${new Date(value).toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
  })}`
}

export function formatCompactDateTime(value) {
  if (!value) return 'Not available'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'

  return date.toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatPercent(value) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed)) return '0%'
  return `${Math.round(parsed)}%`
}

export function getRowUpdatedAt(row) {
  return row?.transaction?.updated_at || row?.transaction?.created_at || row?.unit?.updated_at || row?.unit?.created_at || null
}

export function getLatestTimestamp(rows = []) {
  return rows.reduce((latest, row) => {
    const candidate = getRowUpdatedAt(row)
    if (!candidate) return latest
    if (!latest) return candidate
    return new Date(candidate) > new Date(latest) ? candidate : latest
  }, null)
}

export function getLatestMovementSummary(rows = []) {
  const sorted = [...rows]
    .filter((row) => row?.transaction)
    .sort((left, right) => new Date(getRowUpdatedAt(right) || 0) - new Date(getRowUpdatedAt(left) || 0))

  if (!sorted.length) {
    return 'No recent movement yet'
  }

  const latest = sorted[0]
  return (
    latest?.report?.latestOperationalNote ||
    latest?.transaction?.comment ||
    latest?.transaction?.next_action ||
    latest?.stage ||
    'No recent movement yet'
  )
}

export function getDevelopmentProgressBuckets(rows = []) {
  const buckets = { completed: 0, inProgress: 0, notStarted: 0 }

  for (const row of rows) {
    const mainStage = String(row?.mainStage || row?.transaction?.current_main_stage || getMainStageFromDetailedStage(row?.stage || row?.transaction?.stage || 'Available')).toUpperCase()

    if (mainStage === 'REG') {
      buckets.completed += 1
    } else if (mainStage === 'AVAIL') {
      buckets.notStarted += 1
    } else {
      buckets.inProgress += 1
    }
  }

  return buckets
}

export function getFinanceMixBuckets(rows = []) {
  const buckets = {
    cash: 0,
    bond: 0,
    combination: 0,
    unknown: 0,
  }

  for (const row of rows) {
    if (!row?.transaction) continue
    const normalized = normalizeFinanceType(row.transaction.finance_type, { allowUnknown: true })
    if (normalized === 'cash' || normalized === 'bond' || normalized === 'combination') {
      buckets[normalized] += 1
    } else {
      buckets.unknown += 1
    }
  }

  return buckets
}

export function formatFinanceMixLabel(mix) {
  if (mix.combination > 0) return `${mix.cash} cash • ${mix.bond} bond • ${mix.combination} hybrid`
  return `${mix.cash} cash • ${mix.bond} bond`
}

export function mapMainStageToExecutive(mainStage) {
  const normalized = String(mainStage || '').toUpperCase()
  return executiveTransactionStages.find((stage) => stage.raw.includes(normalized))?.key || 'RESERVED'
}

export function buildExecutiveStageState(mainStage) {
  const currentKey = mapMainStageToExecutive(mainStage)
  const currentIndex = executiveTransactionStages.findIndex((stage) => stage.key === currentKey)

  return executiveTransactionStages.map((stage, index) => ({
    ...stage,
    state: index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming',
  }))
}

export function getStageLabel(mainStage, fallbackDetailedStage = '') {
  const normalized = String(mainStage || '').toUpperCase()
  return MAIN_STAGE_LABELS[normalized] || fallbackDetailedStage || 'Current Stage'
}

export function buildActivityFeedItems({ comments = [], events = [] } = {}) {
  return [
    ...events.map((item) => ({
      id: `event-${item.id || item.created_at || Math.random().toString(36).slice(2)}`,
      title: item.title || 'System update',
      body: item.body || 'A transaction event was recorded.',
      timestamp: item.created_at || null,
      meta: 'Event',
    })),
    ...comments.map((item) => ({
      id: `comment-${item.id || item.createdAt || item.created_at || Math.random().toString(36).slice(2)}`,
      title: item.authorName || item.author_name || 'Bridge Team',
      body: item.commentBody || item.comment_text || item.commentText || 'No update text available.',
      timestamp: item.createdAt || item.created_at || null,
      meta: item.authorRoleLabel || item.author_role || 'Comment',
    })),
  ].sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0))
}

export function getProgressPercentFromMainStage(mainStage) {
  const stageState = buildExecutiveStageState(mainStage)
  const currentIndex = stageState.findIndex((item) => item.state === 'current')
  if (currentIndex === -1) return 0
  return Math.round((currentIndex / Math.max(stageState.length - 1, 1)) * 100)
}
