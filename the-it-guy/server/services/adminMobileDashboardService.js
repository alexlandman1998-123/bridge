import { isDashboardTransactionActive } from '../../src/lib/dashboardTransactionIntegrity.js'
import {
  authenticateHqRequest,
  fetchAllRows,
  getMissionControlSnapshot,
  selectRows,
} from './hqMissionControlSnapshotService.js'

const DATE_MS = 24 * 60 * 60 * 1000
const TERMINAL_STATUS_TOKENS = new Set([
  'registered',
  'completed',
  'complete',
  'closed',
  'closed_won',
  'archived',
  'cancelled',
  'canceled',
  'lost',
  'closed_lost',
  'dead',
  'deleted',
])
const RECOGNISED_REVENUE_STATUSES = new Set(['recognized', 'recognised'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeToken(value = '') {
  return normalizeLower(value).replace(/[\s-]+/g, '_')
}

function toDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date, months) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function isWithinRange(value, start, end) {
  const date = toDate(value)
  return Boolean(date && date >= start && date < end)
}

function calculatePercentageChange(currentValue, previousValue) {
  const current = Number(currentValue)
  const previous = Number(previousValue)
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null
  return (current - previous) / previous
}

function countUnique(rows = [], getKey = (row) => row?.id) {
  return new Set(rows.map(getKey).map(normalizeText).filter(Boolean)).size
}

function isTerminalStatus(...values) {
  return values.some((value) => TERMINAL_STATUS_TOKENS.has(normalizeToken(value)))
}

function isActiveCommercialTransaction(row = {}) {
  return !isTerminalStatus(row?.status, row?.stage, row?.lifecycle_state, row?.deal_status)
}

function isActiveBondApplication(row = {}) {
  return !isTerminalStatus(row?.status, row?.application_status, row?.lifecycle_state)
}

function getRegistrationDate(row = {}) {
  return row?.registered_at || row?.registration_date || row?.completed_at || row?.actual_close_date || null
}

function getCreatedDate(row = {}) {
  return row?.instruction_at || row?.instruction_date || row?.created_at || row?.opened_at || null
}

function averageRegistrationDays(rows = []) {
  const durations = rows
    .map((row) => {
      const createdAt = toDate(getCreatedDate(row))
      const registeredAt = toDate(getRegistrationDate(row))
      if (!createdAt || !registeredAt || registeredAt < createdAt) return null
      return Math.round((registeredAt.getTime() - createdAt.getTime()) / DATE_MS)
    })
    .filter((value) => Number.isFinite(value))

  if (!durations.length) return null
  return Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
}

function sumRecognisedRevenue(rows = [], start, end) {
  return rows.reduce((sum, row) => {
    if (!RECOGNISED_REVENUE_STATUSES.has(normalizeToken(row?.status))) return sum
    if (!isWithinRange(row?.recognised_at || row?.recognized_at || row?.created_at, start, end)) return sum
    const amountCents = Number(row?.amount_cents)
    if (!Number.isFinite(amountCents)) return sum
    return sum + amountCents / 100
  }, 0)
}

function getNetworkHealthStatus(score) {
  if (score >= 90) return 'healthy'
  if (score >= 70) return 'attention'
  return 'critical'
}

function buildNetworkHealth({ stalledTransactions, inactiveOrganisations, failedInvites, integrationIssues }) {
  let score = 100
  score -= Math.min(stalledTransactions * 2, 30)
  score -= Math.min(integrationIssues * 3, 25)
  score -= Math.min(failedInvites, 15)
  score -= Math.min(inactiveOrganisations, 20)
  score = Math.max(0, Math.min(100, score))

  return {
    score,
    status: getNetworkHealthStatus(score),
    alertCount: stalledTransactions + inactiveOrganisations + failedInvites + integrationIssues,
  }
}

function makeCompactTrend(currentValue, previousValue, range) {
  const current = Number.isFinite(Number(currentValue)) ? Number(currentValue) : 0
  const previous = Number.isFinite(Number(previousValue)) ? Number(previousValue) : 0
  const labels =
    range === '12m'
      ? ['M-5', 'M-4', 'M-3', 'M-2', 'M-1', 'Now']
      : range === '6m'
        ? ['W-5', 'W-4', 'W-3', 'W-2', 'W-1', 'Now']
        : ['25d', '20d', '15d', '10d', '5d', 'Now']
  const steps = labels.length - 1
  return labels.map((label, index) => {
    const progress = steps ? index / steps : 1
    const value = Math.round(previous + (current - previous) * progress)
    return { label, value }
  })
}

function mapRecentActivity(snapshotItems = [], platformItems = []) {
  const platformActivity = platformItems.map((item, index) => ({
    id: normalizeText(item?.id) || `platform-activity-${index + 1}`,
    type: normalizeText(item?.activity_type || item?.event_type || item?.type) || 'platform_activity',
    title: normalizeText(item?.title) || 'Platform activity',
    description: normalizeText(item?.description || item?.summary) || '',
    organisationName: normalizeText(item?.organisation_name) || '',
    time: item?.occurred_at || item?.created_at || null,
    severity: normalizeText(item?.severity) || 'info',
  }))

  const missionActivity = snapshotItems.map((item, index) => ({
    id: normalizeText(item?.id) || `mission-activity-${index + 1}`,
    type: normalizeText(item?.type) || 'platform_activity',
    title: normalizeText(item?.label) || 'Platform activity',
    description: normalizeText(item?.description) || '',
    organisationName: normalizeText(item?.organisationName) || '',
    time: item?.time || null,
    severity: normalizeText(item?.severity) || 'info',
  }))

  return [...platformActivity, ...missionActivity]
    .filter((item) => item.time || item.title || item.description)
    .sort((left, right) => (toDate(right.time)?.getTime() || 0) - (toDate(left.time)?.getTime() || 0))
    .slice(0, 8)
}

function getFirstName(profile = {}) {
  const explicit = normalizeText(profile?.first_name || profile?.firstName)
  if (explicit) return explicit
  const fullName = normalizeText(profile?.full_name || profile?.fullName || profile?.name)
  if (fullName) return fullName.split(/\s+/)[0]
  return normalizeText(profile?.email).split('@')[0] || 'Alex'
}

async function getOptionalAdminRows(serviceClient, now) {
  const monthStart = startOfMonth(now)
  const previousMonthStart = startOfMonth(addMonths(now, -1))

  const [
    transactionResult,
    commercialTransactionResult,
    bondApplicationResult,
    revenueEventResult,
    organisationActivityResult,
    integrationEventResult,
    platformActivityResult,
  ] = await Promise.all([
    fetchAllRows(
      serviceClient,
      'transactions',
      [
        'id, organisation_id, status, lifecycle_state, current_main_stage, stage, attorney_stage, is_active, created_at, instruction_at, instruction_date, updated_at, registered_at, registration_date, completed_at, archived_at, cancelled_at, deleted_at, last_meaningful_activity_at',
        'id, organisation_id, status, lifecycle_state, current_main_stage, stage, is_active, created_at, updated_at, registered_at, registration_date, completed_at, archived_at, cancelled_at, deleted_at',
        'id, status, created_at, updated_at, registered_at, registration_date, completed_at',
      ],
      { allowMissing: true, order: { column: 'created_at', ascending: false } },
    ),
    fetchAllRows(
      serviceClient,
      'commercial_transactions',
      [
        'id, organisation_id, transaction_type, status, transaction_name, created_at, updated_at, actual_close_date',
        'id, organisation_id, transaction_type, status, created_at, updated_at',
      ],
      { allowMissing: true, order: { column: 'created_at', ascending: false } },
    ),
    fetchAllRows(
      serviceClient,
      'transaction_bond_applications',
      [
        'id, transaction_id, status, application_status, lifecycle_state, created_at, updated_at, submitted_at, completed_at, cancelled_at',
        'id, transaction_id, status, created_at, updated_at',
      ],
      { allowMissing: true, order: { column: 'created_at', ascending: false } },
    ),
    fetchAllRows(
      serviceClient,
      'platform_revenue_events',
      [
        'id, organisation_id, transaction_id, commercial_deal_id, revenue_type, amount_cents, currency, status, recognised_at, recognized_at, created_at',
        'id, revenue_type, amount_cents, currency, status, recognised_at, created_at',
      ],
      {
        allowMissing: true,
        apply(query) {
          return query.gte('created_at', previousMonthStart.toISOString())
        },
        order: { column: 'created_at', ascending: false },
      },
    ),
    fetchAllRows(
      serviceClient,
      'organisation_activity_events',
      ['id, organisation_id, activity_type, occurred_at, created_at', 'id, organisation_id, created_at'],
      {
        allowMissing: true,
        apply(query) {
          return query.gte('created_at', addDays(now, -30).toISOString())
        },
        order: { column: 'created_at', ascending: false },
      },
    ),
    fetchAllRows(
      serviceClient,
      'platform_integration_events',
      [
        'id, integration_key, provider, status, severity, message, occurred_at, resolved_at, created_at',
        'id, provider, status, resolved_at, created_at',
      ],
      {
        allowMissing: true,
        apply(query) {
          return query.is('resolved_at', null)
        },
        order: { column: 'created_at', ascending: false },
      },
    ),
    selectRows(
      serviceClient,
      'platform_activity_events',
      [
        'id, organisation_id, activity_type, event_type, title, description, summary, severity, occurred_at, created_at',
        'id, activity_type, title, description, severity, occurred_at, created_at',
      ],
      {
        allowMissing: true,
        order: { column: 'created_at', ascending: false },
        limit: 12,
      },
    ),
  ])

  return {
    transactions: transactionResult.rows || [],
    commercialTransactions: commercialTransactionResult.rows || [],
    bondApplications: bondApplicationResult.rows || [],
    revenueEvents: revenueEventResult.rows || [],
    organisationActivityEvents: organisationActivityResult.rows || [],
    integrationEvents: integrationEventResult.rows || [],
    platformActivityEvents: platformActivityResult.rows || [],
    monthStart,
    previousMonthStart,
    nextMonthStart: startOfMonth(addMonths(now, 1)),
  }
}

export async function getAdminMobileDashboard({ headers = {}, now = new Date() } = {}) {
  const [{ profile, serviceClient }, snapshot] = await Promise.all([
    authenticateHqRequest(headers),
    getMissionControlSnapshot({ headers, now }),
  ])
  const optionalRows = await getOptionalAdminRows(serviceClient, now)

  const residentialActiveRows = optionalRows.transactions.filter(isDashboardTransactionActive)
  const commercialActiveRows = optionalRows.commercialTransactions.filter(isActiveCommercialTransaction)
  const bondActiveRows = optionalRows.bondApplications.filter(isActiveBondApplication)
  const registeredCurrentRows = optionalRows.transactions.filter((row) => isWithinRange(getRegistrationDate(row), optionalRows.monthStart, optionalRows.nextMonthStart))
  const registeredPreviousRows = optionalRows.transactions.filter((row) => isWithinRange(getRegistrationDate(row), optionalRows.previousMonthStart, optionalRows.monthStart))

  const activeResidentialCount = residentialActiveRows.length || Number(snapshot?.summary?.activeTransactions || 0)
  const activeCommercialCount = commercialActiveRows.length
  const activeBondCount = countUnique(bondActiveRows, (row) => row?.transaction_id || row?.id)
  const uniqueTransactionIds = new Set([
    ...residentialActiveRows.map((row) => normalizeText(row?.id)),
    ...bondActiveRows.map((row) => normalizeText(row?.transaction_id || row?.id)),
    ...commercialActiveRows.map((row) => `commercial:${normalizeText(row?.id)}`),
  ].filter(Boolean))
  const activeTransactions = uniqueTransactionIds.size || activeResidentialCount + activeCommercialCount

  const registrationsThisMonth =
    registeredCurrentRows.length || Number(snapshot?.executive?.registrationTrend?.registeredThisMonth || snapshot?.summary?.registeredToday || 0)
  const registrationsPreviousMonth =
    registeredPreviousRows.length || Number(snapshot?.executive?.registrationTrend?.registeredLastMonth || 0)
  const revenueThisMonthFromEvents = sumRecognisedRevenue(optionalRows.revenueEvents, optionalRows.monthStart, optionalRows.nextMonthStart)
  const revenuePreviousMonthFromEvents = sumRecognisedRevenue(optionalRows.revenueEvents, optionalRows.previousMonthStart, optionalRows.monthStart)
  const revenueThisMonth =
    optionalRows.revenueEvents.length > 0
      ? revenueThisMonthFromEvents
      : Number.isFinite(Number(snapshot?.executive?.revenue?.subscriptionRevenue))
        ? Number(snapshot.executive.revenue.subscriptionRevenue)
        : null
  const activeOrganisations =
    countUnique(optionalRows.organisationActivityEvents, (row) => row?.organisation_id) || Number(snapshot?.funnel?.organisationsLive || snapshot?.growth?.activeAgencies || 0)

  const integrationIssueCount = optionalRows.integrationEvents.filter((row) => {
    if (row?.resolved_at) return false
    const status = normalizeToken(row?.status)
    return !status || ['failed', 'error', 'degraded', 'critical', 'down'].includes(status)
  }).length
  const stalledTransactions = Number(snapshot?.transactionHealth?.stuck || snapshot?.stuckTransactions?.length || 0)
  const inactiveOrganisations = Number(snapshot?.organisationsNeedingAttention?.length || 0)
  const failedInvites = Number(snapshot?.invites?.failedInvites || 0)
  const networkHealth = buildNetworkHealth({
    stalledTransactions,
    inactiveOrganisations,
    failedInvites,
    integrationIssues: integrationIssueCount,
  })
  const registrationTimeThisMonth = averageRegistrationDays(registeredCurrentRows)
  const registrationTimePreviousMonth = averageRegistrationDays(registeredPreviousRows)

  return {
    generatedAt: now.toISOString(),
    greetingName: getFirstName(profile),
    headline: {
      label: 'Active Transactions',
      value: activeTransactions,
      subtitle: 'Across the Arch9 ecosystem',
    },
    networkHealth,
    kpis: [
      {
        key: 'activeTransactions',
        label: 'Active Transactions',
        value: activeTransactions,
        changePct: null,
        helper: 'Residential, bond and commercial activity',
        icon: 'transactions',
        tone: 'blue',
      },
      {
        key: 'registrationsThisMonth',
        label: 'Registrations This Month',
        value: registrationsThisMonth,
        changePct: calculatePercentageChange(registrationsThisMonth, registrationsPreviousMonth),
        helper: registrationsThisMonth > 0 ? 'Registered transfers this month' : 'No registrations yet this month.',
        icon: 'registrations',
        tone: 'green',
      },
      {
        key: 'revenueThisMonth',
        label: 'Revenue This Month',
        value: revenueThisMonth,
        valueType: 'currency',
        changePct: optionalRows.revenueEvents.length > 0 ? calculatePercentageChange(revenueThisMonthFromEvents, revenuePreviousMonthFromEvents) : null,
        helper: revenueThisMonth === null ? 'Revenue events are not connected yet.' : 'Recognised platform revenue',
        icon: 'revenue',
        tone: 'purple',
      },
      {
        key: 'activeOrganisations',
        label: 'Active Organisations',
        value: activeOrganisations,
        changePct: snapshot?.executive?.growthTrend?.percentageChange ?? null,
        helper: 'Meaningful activity in the last 30 days',
        icon: 'organisations',
        tone: 'orange',
      },
    ],
    attentionRequired: [
      {
        key: 'stalledTransactions',
        label: 'Stalled Transactions',
        value: stalledTransactions,
        helper: 'No meaningful progress for more than 7 days',
        severity: stalledTransactions > 0 ? 'critical' : 'healthy',
      },
      {
        key: 'inactiveOrganisations',
        label: 'Inactive Organisations',
        value: inactiveOrganisations,
        helper: 'No login or platform activity for 30 days',
        severity: inactiveOrganisations > 0 ? 'warning' : 'healthy',
      },
      {
        key: 'failedInvites',
        label: 'Failed Invites',
        value: failedInvites,
        helper: 'Failed, bounced, expired or stale pending invites',
        severity: failedInvites > 0 ? 'warning' : 'healthy',
      },
      {
        key: 'integrationIssues',
        label: 'Integration Issues',
        value: integrationIssueCount,
        helper: 'Unresolved failed platform integrations',
        severity: integrationIssueCount > 0 ? 'critical' : 'healthy',
      },
    ],
    transactionDistribution: {
      uniqueTransactionsTotal: uniqueTransactionIds.size || activeTransactions,
      items: [
        { key: 'agents', label: 'Agents', value: activeResidentialCount, tone: 'blue' },
        { key: 'attorneys', label: 'Attorneys', value: activeResidentialCount, tone: 'green' },
        { key: 'bondOriginators', label: 'Bond Originators', value: activeBondCount, tone: 'purple' },
        { key: 'commercial', label: 'Commercial', value: activeCommercialCount, tone: 'orange' },
      ],
    },
    averageRegistrationTime: {
      days: registrationTimeThisMonth,
      previousDays: registrationTimePreviousMonth,
      changePct: registrationTimeThisMonth !== null && registrationTimePreviousMonth !== null
        ? calculatePercentageChange(registrationTimeThisMonth, registrationTimePreviousMonth)
        : null,
      benchmarkDays: 45,
      helper: registrationTimeThisMonth === null ? 'No registrations yet this month.' : 'Created to registered',
    },
    trends: {
      ranges: {
        '30d': [
          { key: 'transactionVolume', label: 'Transaction Volume', tone: 'blue', data: makeCompactTrend(activeTransactions, Math.max(0, activeTransactions - registrationsThisMonth), '30d') },
          { key: 'registrations', label: 'Registrations', tone: 'green', data: makeCompactTrend(registrationsThisMonth, registrationsPreviousMonth, '30d') },
          { key: 'revenue', label: 'Revenue', tone: 'purple', valueType: 'currency', data: makeCompactTrend(revenueThisMonth || 0, revenuePreviousMonthFromEvents || 0, '30d') },
        ],
        '6m': [
          { key: 'transactionVolume', label: 'Transaction Volume', tone: 'blue', data: makeCompactTrend(activeTransactions, Math.max(0, activeTransactions - registrationsThisMonth), '6m') },
          { key: 'registrations', label: 'Registrations', tone: 'green', data: makeCompactTrend(registrationsThisMonth, registrationsPreviousMonth, '6m') },
          { key: 'revenue', label: 'Revenue', tone: 'purple', valueType: 'currency', data: makeCompactTrend(revenueThisMonth || 0, revenuePreviousMonthFromEvents || 0, '6m') },
        ],
        '12m': [
          { key: 'transactionVolume', label: 'Transaction Volume', tone: 'blue', data: makeCompactTrend(activeTransactions, Math.max(0, activeTransactions - registrationsThisMonth), '12m') },
          { key: 'registrations', label: 'Registrations', tone: 'green', data: makeCompactTrend(registrationsThisMonth, registrationsPreviousMonth, '12m') },
          { key: 'revenue', label: 'Revenue', tone: 'purple', valueType: 'currency', data: makeCompactTrend(revenueThisMonth || 0, revenuePreviousMonthFromEvents || 0, '12m') },
        ],
      },
    },
    recentActivity: mapRecentActivity(snapshot?.recentActivity || [], optionalRows.platformActivityEvents),
  }
}
