import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

import { isDashboardTransactionActive } from '../../src/lib/dashboardTransactionIntegrity.js'
import { requireHQAccess } from './hqAccessGuard.js'

const DATE_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 1000
const ACTIVE_MEMBERSHIP_STATUSES = new Set(['active'])
const ACTIVE_ORGANISATION_BLOCKLIST = new Set(['inactive', 'archived', 'deleted', 'cancelled', 'canceled', 'removed', 'suspended'])
const TERMINAL_TRANSACTION_STATUSES = new Set(['registered', 'closed', 'completed', 'cancelled', 'canceled', 'archived', 'deleted'])
const AGENT_ROLE_TOKENS = ['agent', 'estate_agent', 'real_estate_agent', 'senior_agent', 'broker', 'commercial_broker']
const ATTORNEY_ROLE_TOKENS = ['attorney', 'conveyancer', 'transfer_attorney', 'bond_attorney']
const BOND_ORIGINATOR_ROLE_TOKENS = ['bond_originator', 'originator']
const WEBSITE_SOURCE_TOKENS = ['website', 'web']

let cachedRuntimeEnv = null

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

function toIsoString(value = new Date()) {
  const parsed = toDate(value)
  return (parsed || new Date()).toISOString()
}

function startOfDay(date = new Date()) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function addMonths(date, months) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function daysBetween(start, end = new Date()) {
  const startDate = toDate(start)
  const endDate = toDate(end)
  if (!startDate || !endDate) return null
  return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / DATE_MS))
}

function isWithinRange(value, start, end) {
  const date = toDate(value)
  return Boolean(date && date >= start && date < end)
}

function isOnOrAfter(value, threshold) {
  const date = toDate(value)
  return Boolean(date && date >= threshold)
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max)
}

function calculatePercentageChange(currentValue, previousValue) {
  const current = Number.isFinite(Number(currentValue)) ? Number(currentValue) : null
  const previous = Number.isFinite(Number(previousValue)) ? Number(previousValue) : null
  if (current === null || previous === null || previous <= 0) return null
  return (current - previous) / previous
}

function hasSelectedColumn(fields = '', columnName = '') {
  return normalizeLower(fields).includes(normalizeLower(columnName))
}

function buildExecutiveEmptyState() {
  return {
    platformHealthScore: null,
    healthStatus: null,
    growthTrend: {
      currentMonth: null,
      previousMonth: null,
      percentageChange: null,
    },
    registrationTrend: {
      registeredThisMonth: null,
      registeredLastMonth: null,
      percentageChange: null,
    },
    registrationForecast: {
      next7Days: null,
      next14Days: null,
      next30Days: null,
    },
    revenue: {
      actualThisMonth: null,
      forecastThisMonth: null,
      subscriptionRevenue: null,
      transactionRevenue: null,
    },
    focusAreas: [],
  }
}

function resolveHealthStatus(score) {
  if (score === null || score === undefined) return null
  if (score >= 80) return 'healthy'
  if (score >= 60) return 'watch'
  return 'attention'
}

function buildFocusArea({ type, title, description, severity = 'info' }) {
  return {
    type: normalizeToken(type || 'focus_area') || 'focus_area',
    title: normalizeText(title) || 'Focus area',
    description: normalizeText(description),
    severity: severity === 'critical' ? 'critical' : severity === 'warning' ? 'warning' : 'info',
  }
}

function buildExecutiveFocusAreas({ snapshot, executive }) {
  const items = []
  const attentionSummary = snapshot?.attention || {}
  const registrationTrend = executive?.registrationTrend || {}
  const growthTrend = executive?.growthTrend || {}
  const registrationForecast = executive?.registrationForecast || {}
  const revenue = executive?.revenue || {}
  const inviteAcceptanceRate = snapshot?.invites?.inviteAcceptanceRate
  const activeTransactions = snapshot?.summary?.activeTransactions

  if ((attentionSummary.critical || 0) > 0) {
    items.push(
      buildFocusArea({
        type: 'critical_attention',
        title: `${attentionSummary.critical} critical item${attentionSummary.critical === 1 ? '' : 's'} need intervention`,
        description: 'Mission Control is surfacing live operational blockers that need founder attention now.',
        severity: 'critical',
      }),
    )
  } else if ((attentionSummary.warning || 0) > 0) {
    items.push(
      buildFocusArea({
        type: 'warning_attention',
        title: `${attentionSummary.warning} warning item${attentionSummary.warning === 1 ? '' : 's'} should be watched`,
        description: 'The platform has live operational risks that have not escalated to critical yet.',
        severity: 'warning',
      }),
    )
  }

  if (activeTransactions > 0 && registrationTrend.registeredThisMonth === 0) {
    items.push(
      buildFocusArea({
        type: 'registration_stalled',
        title: 'Registrations have not landed this month',
        description: 'Active transactions exist, but no registration has been recorded this month.',
        severity: 'critical',
      }),
    )
  } else if (registrationTrend.percentageChange !== null) {
    items.push(
      buildFocusArea({
        type: registrationTrend.percentageChange >= 0 ? 'registration_improving' : 'registration_softening',
        title: registrationTrend.percentageChange >= 0 ? 'Registration momentum is improving' : 'Registration momentum has softened',
        description:
          registrationTrend.percentageChange >= 0
            ? 'Registered transactions are ahead of last month so far.'
            : 'Registered transactions are behind last month so far.',
        severity: registrationTrend.percentageChange >= 0 ? 'info' : 'warning',
      }),
    )
  }

  if (inviteAcceptanceRate !== null && inviteAcceptanceRate < 0.4) {
    items.push(
      buildFocusArea({
        type: 'invite_acceptance_below_target',
        title: 'Invite acceptance is below target',
        description: 'Less than 40% of this month’s invites have converted into accepted access.',
        severity: 'warning',
      }),
    )
  }

  if (growthTrend.currentMonth === 0) {
    items.push(
      buildFocusArea({
        type: 'growth_flat',
        title: 'New organisation growth is flat this month',
        description: 'No new organisation signup has been recorded yet this month.',
        severity: 'warning',
      }),
    )
  } else if (growthTrend.percentageChange !== null) {
    items.push(
      buildFocusArea({
        type: growthTrend.percentageChange >= 0 ? 'growth_improving' : 'growth_softening',
        title: growthTrend.percentageChange >= 0 ? 'Organisation growth is improving' : 'Organisation growth has slowed',
        description:
          growthTrend.percentageChange >= 0
            ? 'New organisation signups are running ahead of last month.'
            : 'New organisation signups are trailing last month.',
        severity: growthTrend.percentageChange >= 0 ? 'info' : 'warning',
      }),
    )
  }

  if (revenue.subscriptionRevenue !== null && revenue.actualThisMonth === null && revenue.transactionRevenue === null) {
    items.push(
      buildFocusArea({
        type: 'revenue_partial',
        title: 'Revenue intelligence is partially connected',
        description: 'Subscription revenue is live, while collected revenue and transaction revenue remain unavailable.',
        severity: 'info',
      }),
    )
  } else if (
    revenue.actualThisMonth === null &&
    revenue.forecastThisMonth === null &&
    revenue.subscriptionRevenue === null &&
    revenue.transactionRevenue === null
  ) {
    items.push(
      buildFocusArea({
        type: 'revenue_unavailable',
        title: 'Revenue data is not connected yet',
        description: 'Mission Control is intentionally withholding revenue until the platform has a trustworthy billing source of truth.',
        severity: 'info',
      }),
    )
  }

  if (registrationForecast.next7Days !== null && registrationForecast.next7Days > 0) {
    items.push(
      buildFocusArea({
        type: 'registration_pipeline',
        title: `${registrationForecast.next7Days} registration${registrationForecast.next7Days === 1 ? '' : 's'} expected in the next 7 days`,
        description: 'Upcoming expected registration dates are already visible in the live pipeline.',
        severity: 'info',
      }),
    )
  }

  const deduped = []
  const seen = new Set()
  for (const item of items) {
    const key = `${item.type}::${item.title}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
    if (deduped.length >= 5) break
  }

  if (!deduped.length) {
    return [
      buildFocusArea({
        type: 'monitoring',
        title: 'Executive monitoring is live',
        description: 'Mission Control is connected to real operational data and ready to surface the next meaningful signal.',
        severity: 'info',
      }),
    ]
  }

  return deduped
}

function buildExecutiveSnapshot({
  snapshot,
  growthCurrentMonth = null,
  growthPreviousMonth = null,
  registeredThisMonth = null,
  registeredLastMonth = null,
  supportsExpectedRegistrationDates = false,
  subscriptionRevenue = null,
}) {
  const executive = buildExecutiveEmptyState()
  const growthCurrentValue = Number(growthCurrentMonth)
  const growthPreviousValue = Number(growthPreviousMonth)
  executive.growthTrend.currentMonth = Number.isFinite(growthCurrentValue) ? growthCurrentValue : null
  executive.growthTrend.previousMonth = Number.isFinite(growthPreviousValue) ? growthPreviousValue : null
  executive.growthTrend.percentageChange = calculatePercentageChange(executive.growthTrend.currentMonth, executive.growthTrend.previousMonth)

  const registeredCurrentValue = Number(registeredThisMonth)
  const registeredPreviousValue = Number(registeredLastMonth)
  executive.registrationTrend.registeredThisMonth = Number.isFinite(registeredCurrentValue) ? registeredCurrentValue : null
  executive.registrationTrend.registeredLastMonth = Number.isFinite(registeredPreviousValue) ? registeredPreviousValue : null
  executive.registrationTrend.percentageChange = calculatePercentageChange(
    executive.registrationTrend.registeredThisMonth,
    executive.registrationTrend.registeredLastMonth,
  )

  executive.registrationForecast.next7Days = supportsExpectedRegistrationDates ? snapshot?.registrationForecast?.next7Days ?? 0 : null
  executive.registrationForecast.next14Days = supportsExpectedRegistrationDates ? snapshot?.registrationForecast?.next14Days ?? 0 : null
  executive.registrationForecast.next30Days = supportsExpectedRegistrationDates ? snapshot?.registrationForecast?.next30Days ?? 0 : null

  // Real revenue remains intentionally conservative. A live subscription source exists,
  // but there is not yet a trustworthy platform-wide actuals/forecast ledger for HQ.
  executive.revenue.actualThisMonth = null
  executive.revenue.forecastThisMonth = null
  executive.revenue.subscriptionRevenue = subscriptionRevenue
  executive.revenue.transactionRevenue = null

  const hasHealthInputs =
    Number.isFinite(Number(snapshot?.attention?.critical)) &&
    Number.isFinite(Number(snapshot?.attention?.warning)) &&
    Number.isFinite(Number(snapshot?.summary?.activeTransactions)) &&
    executive.registrationTrend.registeredThisMonth !== null &&
    executive.growthTrend.currentMonth !== null &&
    snapshot?.invites?.inviteAcceptanceRate !== null

  if (hasHealthInputs) {
    // Explainable Phase 6 formula:
    // Start at 100, subtract capped penalties for critical/warning attention items,
    // then subtract fixed penalties for stalled registrations, flat signups,
    // and low invite acceptance. Clamp to 0-100 for a simple founder signal.
    let score = 100
    score -= Math.min(Number(snapshot.attention.critical || 0) * 3, 30)
    score -= Math.min(Number(snapshot.attention.warning || 0), 20)
    if (Number(snapshot.summary.activeTransactions || 0) > 0 && Number(executive.registrationTrend.registeredThisMonth || 0) === 0) {
      score -= 10
    }
    if (Number(executive.growthTrend.currentMonth || 0) === 0) {
      score -= 10
    }
    if (Number(snapshot.invites.inviteAcceptanceRate) < 0.4) {
      score -= 10
    }
    executive.platformHealthScore = clampNumber(score, 0, 100)
    executive.healthStatus = resolveHealthStatus(executive.platformHealthScore)
  }

  executive.focusAreas = buildExecutiveFocusAreas({ snapshot, executive })

  return executive
}

function humanizeKey(value = '') {
  return normalizeText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=')
        if (separatorIndex === -1) return [line, '']
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1).replace(/^['"]|['"]$/g, '')]
      }),
  )
}

function getRuntimeEnv() {
  if (cachedRuntimeEnv) return cachedRuntimeEnv
  const rootEnvPath = new URL('../../.env', import.meta.url)
  const stagingEnvPath = new URL('../../.env.staging.local', import.meta.url)
  const rootEnv = parseEnvFile(rootEnvPath)
  const stagingEnv = parseEnvFile(stagingEnvPath)
  const processEnvSource = globalThis?.process?.env || {}
  const processEnv = Object.fromEntries(Object.entries(processEnvSource).map(([key, value]) => [key, normalizeText(value)]))
  const merged = { ...rootEnv, ...stagingEnv, ...processEnv }
  if (!merged.SUPABASE_URL && merged.VITE_SUPABASE_URL) merged.SUPABASE_URL = merged.VITE_SUPABASE_URL
  if (!merged.VITE_SUPABASE_URL && merged.SUPABASE_URL) merged.VITE_SUPABASE_URL = merged.SUPABASE_URL
  if (!merged.VITE_SUPABASE_ANON_KEY && merged.VITE_SUPABASE_KEY) merged.VITE_SUPABASE_ANON_KEY = merged.VITE_SUPABASE_KEY
  cachedRuntimeEnv = merged
  return cachedRuntimeEnv
}

function isMissingSourceError(error) {
  if (!error) return false
  const code = normalizeLower(error.code)
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  const status = Number(error.status || error.statusCode || 0)
  return (
    status === 404 ||
    code === '42p01' ||
    code === '42703' ||
    code === 'pgrst116' ||
    code === 'pgrst204' ||
    code === 'pgrst205' ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find')
  )
}

function getMissingColumnName(error) {
  const message = normalizeText(error?.message)
  return (
    message.match(/column\s+\S+\.([a-zA-Z0-9_]+)\s+does not exist/i)?.[1] ||
    message.match(/could not find the ['"]?([a-zA-Z0-9_]+)['"]?\s+column/i)?.[1] ||
    ''
  )
}

function removeColumnFromSelect(fields, columnName) {
  if (!fields || fields === '*' || !columnName) return fields
  const normalizedColumn = normalizeLower(columnName)
  const nextParts = String(fields)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => normalizeLower(part.split(/\s+as\s+/i)[0]) !== normalizedColumn)
  return nextParts.length ? nextParts.join(', ') : '*'
}

function createBackendClients() {
  const env = getRuntimeEnv()
  const supabaseUrl = normalizeText(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const anonKey = normalizeText(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY)
  const serviceRoleKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY)

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    const error = new Error('Mission Control backend is not configured.')
    error.code = 'hq_backend_unconfigured'
    error.status = 503
    throw error
  }

  const clientOptions = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }

  return {
    anonClient: createClient(supabaseUrl, anonKey, clientOptions),
    serviceClient: createClient(supabaseUrl, serviceRoleKey, clientOptions),
  }
}

async function runSelectQuery(client, table, fields, options = {}) {
  let query = client.from(table).select(fields, options.selectOptions || undefined)
  if (typeof options.apply === 'function') {
    query = options.apply(query) || query
  }
  if (options.order?.column) {
    query = query.order(options.order.column, { ascending: Boolean(options.order.ascending) })
  }
  if (Number.isFinite(options.limit) && options.limit > 0) {
    query = query.limit(options.limit)
  }
  if (options.range) {
    query = query.range(options.range.from, options.range.to)
  }
  return query
}

async function selectRows(client, table, selectVariants, options = {}) {
  const variants = Array.isArray(selectVariants) ? selectVariants : [selectVariants || '*']
  let lastError = null

  for (const variant of variants) {
    let fields = variant
    const removedColumns = new Set()

    for (let attempt = 0; attempt < 24; attempt += 1) {
      const result = await runSelectQuery(client, table, fields, options)
      if (!result.error) {
        return { rows: result.data || [], fieldsUsed: fields }
      }

      lastError = result.error
      const missingColumn = getMissingColumnName(result.error)
      const nextFields = removeColumnFromSelect(fields, missingColumn)
      if (missingColumn && nextFields !== fields && !removedColumns.has(missingColumn)) {
        removedColumns.add(missingColumn)
        fields = nextFields
        continue
      }
      if (options.allowMissing && isMissingSourceError(result.error)) {
        return { rows: [], fieldsUsed: fields }
      }
      if (isMissingSourceError(result.error)) break
      throw result.error
    }
  }

  if (options.allowMissing) {
    return { rows: [], fieldsUsed: '' }
  }
  throw lastError || new Error(`Unable to read ${table}.`)
}

async function selectMaybeSingle(client, table, selectVariants, options = {}) {
  const variants = Array.isArray(selectVariants) ? selectVariants : [selectVariants || '*']
  let lastError = null

  for (const variant of variants) {
    let fields = variant
    const removedColumns = new Set()

    for (let attempt = 0; attempt < 24; attempt += 1) {
      let query = client.from(table).select(fields)
      if (typeof options.apply === 'function') {
        query = options.apply(query) || query
      }
      const result = await query.maybeSingle()
      if (!result.error) {
        return result.data || null
      }

      lastError = result.error
      const missingColumn = getMissingColumnName(result.error)
      const nextFields = removeColumnFromSelect(fields, missingColumn)
      if (missingColumn && nextFields !== fields && !removedColumns.has(missingColumn)) {
        removedColumns.add(missingColumn)
        fields = nextFields
        continue
      }
      if (options.allowMissing && isMissingSourceError(result.error)) {
        return null
      }
      if (isMissingSourceError(result.error)) break
      throw result.error
    }
  }

  if (options.allowMissing) return null
  throw lastError || new Error(`Unable to read ${table}.`)
}

async function fetchAllRows(client, table, selectVariants, options = {}) {
  const rows = []
  let page = 0
  let fieldsUsed = ''

  while (page < 200) {
    const result = await selectRows(client, table, selectVariants, {
      ...options,
      range: {
        from: page * (options.pageSize || PAGE_SIZE),
        to: (page + 1) * (options.pageSize || PAGE_SIZE) - 1,
      },
    })
    const pageRows = result.rows || []
    fieldsUsed = fieldsUsed || result.fieldsUsed || ''
    rows.push(...pageRows)
    if (pageRows.length < (options.pageSize || PAGE_SIZE)) break
    page += 1
  }

  return { rows, fieldsUsed }
}

function buildEmptySnapshot(now = new Date()) {
  return {
    generatedAt: toIsoString(now),
    summary: {
      activeTransactions: 0,
      scheduledRegistrationsSoon: null,
      registeredToday: 0,
      revenueThisMonth: null,
      platformHealthScore: null,
    },
    growth: {
      activeAgencies: 0,
      activeAgents: 0,
      newAgencySignups: 0,
      websiteEnquiries: 0,
      demoRequests: null,
    },
    invites: {
      agentInvitesSent: 0,
      attorneyInvitesSent: 0,
      bondOriginatorInvitesSent: 0,
      inviteAcceptanceRate: null,
      failedInvites: 0,
    },
    transactionHealth: {
      onTrack: null,
      needsAttention: null,
      stuck: null,
      delayedRegistrations: null,
    },
    attention: {
      total: 0,
      critical: 0,
      warning: 0,
      items: [],
    },
    activeAreas: [],
    recentActivity: [],
    stuckTransactions: [],
    organisationsNeedingAttention: [],
    registrationForecast: {
      next7Days: 0,
      next14Days: 0,
      next30Days: 0,
      forecastRevenue: null,
    },
    funnel: {
      websiteEnquiries: 0,
      demosBooked: null,
      trialsStarted: null,
      organisationsLive: 0,
    },
    executive: buildExecutiveEmptyState(),
  }
}

function getBearerToken(headers = {}) {
  const authorization = headers?.authorization || headers?.Authorization || ''
  const match = String(authorization).match(/^Bearer\s+(.+)$/i)
  return normalizeText(match?.[1])
}

async function authenticateHqRequest(headers = {}) {
  const accessToken = getBearerToken(headers)
  if (!accessToken) {
    const error = new Error('Authentication is required.')
    error.code = 'unauthorized'
    error.status = 401
    throw error
  }

  const { anonClient, serviceClient } = createBackendClients()
  const authResult = await anonClient.auth.getUser(accessToken)
  if (authResult.error || !authResult.data?.user?.id) {
    const error = new Error('Authentication is required.')
    error.code = 'unauthorized'
    error.status = 401
    throw error
  }

  const user = authResult.data.user
  const profile = await selectMaybeSingle(
    serviceClient,
    'profiles',
    [
      'id, email, role, system_role, full_name, first_name, last_name, created_at, updated_at',
      'id, email, role, full_name, first_name, last_name, created_at, updated_at',
    ],
    {
      apply(query) {
        return query.eq('id', user.id)
      },
      allowMissing: true,
    },
  )

  const membershipResult = await fetchAllRows(
    serviceClient,
    'organisation_users',
    [
      'id, organisation_id, user_id, email, role, workspace_role, organisation_role, app_role, status, last_active_at, created_at, updated_at',
      'id, organisation_id, user_id, email, role, organisation_role, app_role, status, last_active_at, created_at, updated_at',
      'id, organisation_id, user_id, email, role, status, created_at, updated_at',
    ],
    {
      apply(query) {
        return query.eq('user_id', user.id)
      },
      allowMissing: true,
      pageSize: 50,
    },
  )

  requireHQAccess({
    profile,
    currentMembership: membershipResult.rows?.[0] || null,
    roles: membershipResult.rows.flatMap((row) => [row?.role, row?.workspace_role, row?.organisation_role, row?.app_role]),
  })

  return { user, profile, serviceClient }
}

function getTransactionStatusText(row = {}) {
  return [
    row?.lifecycle_state,
    row?.status,
    row?.current_main_stage,
    row?.stage,
    row?.operational_state,
    row?.attorney_stage,
  ]
    .map(normalizeLower)
    .join(' ')
}

function isRegisteredTransaction(row = {}) {
  if (row?.registered_at || row?.completed_at) return true
  const statusText = getTransactionStatusText(row)
  return [...TERMINAL_TRANSACTION_STATUSES].some((status) => statusText.includes(status))
}

function getRegistrationDate(row = {}) {
  return (
    row?.registered_at ||
    row?.registration_date ||
    row?.completed_at ||
    null
  )
}

function getExpectedRegistrationDate(row = {}) {
  return (
    row?.target_registration_date ||
    row?.expected_registration_date ||
    row?.expected_transfer_date ||
    null
  )
}

function getLastMeaningfulActivityAt(row = {}) {
  return row?.last_meaningful_activity_at || row?.updated_at || row?.created_at || null
}

function getTransactionReference(row = {}) {
  return (
    normalizeText(row?.transaction_reference) ||
    normalizeText(row?.matter_reference) ||
    normalizeText(row?.reference) ||
    normalizeText(row?.title_deed_number) ||
    null
  )
}

function getTransactionAddress(row = {}) {
  return (
    normalizeText(row?.property_address_line_1) ||
    normalizeText(row?.suburb) ||
    normalizeText(row?.city) ||
    normalizeText(row?.municipality) ||
    null
  )
}

function getAreaLabel(row = {}) {
  return normalizeText(row?.suburb || row?.city || row?.municipality || row?.property_address_line_1)
}

function isActiveOrganisation(row = {}) {
  if (row?.is_active === false) return false
  return !ACTIVE_ORGANISATION_BLOCKLIST.has(normalizeLower(row?.status) || 'active')
}

function normalizeOrganisationType(value = '') {
  const normalized = normalizeToken(value)
  if (normalized === 'estate_agency' || normalized === 'real_estate_agency') return 'agency'
  if (normalized === 'attorney' || normalized === 'attorneys' || normalized === 'conveyancer') return 'attorney_firm'
  if (normalized === 'bond' || normalized === 'originator') return 'bond_originator'
  if (normalized === 'developer_company' || normalized === 'development') return 'developer'
  return normalized || 'service_provider'
}

function isActiveMembership(row = {}) {
  return ACTIVE_MEMBERSHIP_STATUSES.has(normalizeLower(row?.status))
}

function collectRoleTokens(row = {}) {
  return [row?.role, row?.workspace_role, row?.organisation_role, row?.app_role].map(normalizeToken).filter(Boolean)
}

function roleMatchesAny(tokens = [], accepted = []) {
  return tokens.some((token) => accepted.some((candidate) => token === candidate || token.includes(candidate)))
}

function classifyInviteRole(row = {}) {
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  const tokens = [
    row?.target_workspace_role,
    row?.target_transaction_role,
    metadata?.role,
    metadata?.app_role,
    metadata?.workspace_role,
    metadata?.organisation_role,
    metadata?.role_type,
    metadata?.partner_role,
  ]
    .map(normalizeToken)
    .filter(Boolean)

  if (roleMatchesAny(tokens, ATTORNEY_ROLE_TOKENS)) return 'attorney'
  if (roleMatchesAny(tokens, BOND_ORIGINATOR_ROLE_TOKENS)) return 'bond_originator'
  if (roleMatchesAny(tokens, AGENT_ROLE_TOKENS)) return 'agent'
  return ''
}

function isWebsiteEnquiry(row = {}) {
  const tokens = [row?.lead_source, row?.source].map(normalizeToken).filter(Boolean)
  return tokens.some((token) => WEBSITE_SOURCE_TOKENS.includes(token) || token.includes('website'))
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function isUuidLike(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function getProfileDisplayName(profile = {}) {
  const firstName = normalizeText(profile?.first_name || profile?.firstName)
  const lastName = normalizeText(profile?.last_name || profile?.lastName)
  const fullName = normalizeText(profile?.full_name || profile?.fullName || [firstName, lastName].filter(Boolean).join(' '))
  return fullName || normalizeText(profile?.email) || ''
}

function getActorName(profileByUserId, userId, fallbacks = []) {
  const normalizedUserId = normalizeText(userId)
  if (normalizedUserId && profileByUserId?.has(normalizedUserId)) {
    const profileName = getProfileDisplayName(profileByUserId.get(normalizedUserId))
    if (profileName) return profileName
  }
  for (const fallback of fallbacks) {
    const text = normalizeText(fallback)
    if (text) return text
  }
  return null
}

function buildActivityRecord({
  id,
  time,
  type,
  label,
  description = null,
  entityId = null,
  entityType = null,
  organisationName = null,
  actorName = null,
  severity = 'info',
}) {
  const normalizedType = normalizeToken(type || 'activity_event') || 'activity_event'
  const normalizedSeverity = ['info', 'success', 'warning', 'critical'].includes(severity) ? severity : 'info'
  return {
    id: normalizeText(id),
    time: toIsoString(time),
    type: normalizedType,
    label: normalizeText(label) || humanizeKey(normalizedType),
    description: normalizeText(description) || null,
    entityId: normalizeText(entityId) || null,
    entityType: normalizeText(entityType) || null,
    organisationName: normalizeText(organisationName) || null,
    actorName: normalizeText(actorName) || null,
    severity: normalizedSeverity,
  }
}

function resolveActivityLabel(type = '') {
  switch (normalizeToken(type)) {
    case 'transaction_created':
      return 'Transaction created'
    case 'transaction_stage_changed':
      return 'Transaction stage changed'
    case 'registration_completed':
      return 'Registration completed'
    case 'bond_submitted':
      return 'Bond submitted'
    case 'document_uploaded':
      return 'Document uploaded'
    case 'otp_signed':
      return 'OTP signed'
    case 'agency_signup':
      return 'New agency joined'
    case 'user_activated':
      return 'User activated'
    case 'agent_invited':
      return 'Agent invited'
    case 'attorney_invited':
      return 'Attorney invited'
    case 'bond_originator_invited':
      return 'Bond originator invited'
    case 'lead_received':
      return 'Lead received'
    case 'website_enquiry_received':
      return 'Website enquiry received'
    default:
      return humanizeKey(type || 'Activity')
  }
}

function resolveActivitySeverity(type = '', options = {}) {
  const normalizedType = normalizeToken(type)
  const normalizedStatus = normalizeToken(options.status)
  const createdAt = toDate(options.createdAt)
  const ageInDays = createdAt ? daysBetween(createdAt, options.now || new Date()) : null

  if (['declined', 'expired', 'revoked', 'cancelled', 'canceled', 'failed'].includes(normalizedStatus)) {
    return 'critical'
  }
  if (normalizedType.endsWith('_invited') && normalizedStatus === 'pending' && ageInDays !== null && ageInDays > 7) {
    return 'warning'
  }
  if (['registration_completed', 'user_activated', 'agency_signup', 'document_uploaded', 'otp_signed'].includes(normalizedType)) {
    return 'success'
  }
  return 'info'
}

function resolveInviteActivityType(roleType = '') {
  if (roleType === 'agent') return 'agent_invited'
  if (roleType === 'attorney') return 'attorney_invited'
  if (roleType === 'bond_originator') return 'bond_originator_invited'
  return ''
}

function describeTransactionContext(row = {}) {
  const parts = [getTransactionReference(row), getTransactionAddress(row)].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

function resolveOrganisationNameFromActivity(row = {}, organisationById) {
  const metadata = normalizeObject(row?.metadata)
  return (
    normalizeText(metadata?.organisation_name || metadata?.organization_name || metadata?.workspace_name) ||
    organisationById.get(normalizeText(row?.target_workspace_id || metadata?.organisation_id || metadata?.organization_id || row?.workspace_id))?.name ||
    null
  )
}

function canonicalizeTransactionEventType(eventType = '', eventData = {}) {
  const token = normalizeToken(eventType || eventData?.eventType || eventData?.type || eventData?.event_type)
  if (!token) return ''
  if (token === 'transaction_created' || token === 'created' || (token.includes('transaction') && token.includes('created'))) return 'transaction_created'
  if (token === 'stage_update' || ((token.includes('stage') || token.includes('workflow')) && (token.includes('change') || token.includes('changed') || token.includes('update')))) {
    return 'transaction_stage_changed'
  }
  if (token.includes('registration') && (token.includes('completed') || token.includes('registered'))) return 'registration_completed'
  if (token.includes('bond') && token.includes('submitted')) return 'bond_submitted'
  if (token.includes('otp') && (token.includes('signed') || token.includes('completed'))) return 'otp_signed'
  return ''
}

function mapTransactionEventToActivity(row, context) {
  const eventData = normalizeObject(row?.event_data)
  const canonicalType = canonicalizeTransactionEventType(row?.event_type, eventData)
  if (!canonicalType) return null
  const transactionId = normalizeText(row?.transaction_id || eventData?.transaction_id)
  const transaction = context.transactionById.get(transactionId) || {}
  const organisationName = context.organisationById.get(normalizeText(transaction?.organisation_id))?.name || null
  const actorName = getActorName(context.profileByUserId, eventData?.actor_user_id || eventData?.actorUserId || eventData?.created_by, [
    eventData?.actor_name,
    eventData?.actorName,
    eventData?.created_by_role,
  ])

  let description = describeTransactionContext(transaction)
  if (canonicalType === 'transaction_stage_changed') {
    const destinationStage = humanizeKey(
      eventData?.to_stage ||
        eventData?.toStage ||
        eventData?.new_stage ||
        eventData?.newStage ||
        eventData?.next_stage ||
        eventData?.nextStage ||
        eventData?.stage,
    )
    description = [description, destinationStage ? `Moved to ${destinationStage}` : 'Workflow updated'].filter(Boolean).join(' · ')
  }

  return buildActivityRecord({
    id: `transaction-event-${normalizeText(row?.id)}`,
    time: row?.created_at,
    type: canonicalType,
    label: resolveActivityLabel(canonicalType),
    description,
    entityId: transactionId || normalizeText(row?.id),
    entityType: 'transaction',
    organisationName,
    actorName,
    severity: resolveActivitySeverity(canonicalType),
  })
}

function mapAuditRowToActivity(row, context) {
  const metadata = normalizeObject(row?.metadata)
  const action = normalizeToken(row?.action)
  const targetType = normalizeToken(row?.target_type)
  const targetId = normalizeText(row?.target_id)
  let type = ''

  if (action.includes('invite')) {
    type = resolveInviteActivityType(
      classifyInviteRole({
        target_workspace_role: metadata?.workspace_role,
        target_transaction_role: metadata?.transaction_role,
        metadata,
      }),
    )
  } else if (action.includes('document') && action.includes('upload')) {
    type = 'document_uploaded'
  } else if (action.includes('otp') && action.includes('sign')) {
    type = 'otp_signed'
  } else if (action.includes('bond') && action.includes('submitted')) {
    type = 'bond_submitted'
  } else if (action.includes('registration') && (action.includes('completed') || action.includes('registered'))) {
    type = 'registration_completed'
  } else if ((action.includes('stage') || action.includes('workflow')) && (action.includes('change') || action.includes('changed') || action.includes('update'))) {
    type = 'transaction_stage_changed'
  } else if ((action.includes('transaction') && action.includes('create')) || action === 'created_transaction') {
    type = 'transaction_created'
  } else if ((action.includes('organisation') || action.includes('agency')) && (action.includes('created') || action.includes('joined') || action.includes('signup'))) {
    const organisationType = normalizeOrganisationType(metadata?.organisation_type || metadata?.organization_type || metadata?.type)
    type = organisationType === 'agency' ? 'agency_signup' : ''
  } else if (action.includes('user') && (action.includes('activated') || action.includes('joined') || action.includes('accepted'))) {
    type = 'user_activated'
  } else if (action.includes('lead') || action.includes('enquiry') || action.includes('inquiry')) {
    type = isWebsiteEnquiry(metadata) ? 'website_enquiry_received' : 'lead_received'
  }

  if (!type) return null

  const entityId =
    targetId ||
    normalizeText(metadata?.transaction_id || metadata?.document_id || metadata?.invite_id || metadata?.organisation_id || metadata?.user_id || metadata?.lead_id)
  const entityType =
    targetType ||
    normalizeText(metadata?.entity_type || metadata?.target_type) ||
    (type.includes('transaction') || type === 'registration_completed' || type === 'bond_submitted' || type === 'otp_signed' ? 'transaction' : null)
  const transactionId = normalizeText(metadata?.transaction_id || (targetType === 'transaction' ? targetId : ''))
  const transaction = context.transactionById.get(transactionId) || {}
  const organisationName =
    resolveOrganisationNameFromActivity({ ...row, metadata }, context.organisationById) ||
    context.organisationById.get(normalizeText(transaction?.organisation_id))?.name ||
    null
  const actorName = getActorName(context.profileByUserId, row?.user_id || metadata?.actor_user_id || metadata?.user_id, [
    metadata?.actor_name,
    metadata?.user_name,
    metadata?.email,
  ])

  let description =
    normalizeText(metadata?.description || metadata?.message || metadata?.detail || metadata?.summary) ||
    describeTransactionContext(transaction) ||
    null
  if (type === 'transaction_stage_changed') {
    const destinationStage = humanizeKey(metadata?.to_stage || metadata?.new_stage || metadata?.next_stage || metadata?.stage)
    description = [description, destinationStage ? `Moved to ${destinationStage}` : 'Workflow updated'].filter(Boolean).join(' · ') || null
  }

  return buildActivityRecord({
    id: `audit-${normalizeText(row?.id)}`,
    time: row?.created_at,
    type,
    label: resolveActivityLabel(type),
    description,
    entityId: entityId || normalizeText(row?.id),
    entityType,
    organisationName,
    actorName,
    severity: resolveActivitySeverity(type, {
      status: metadata?.status,
      createdAt: row?.created_at,
      now: context.now,
    }),
  })
}

function mapDocumentRowToActivity(row, context) {
  const transactionId = normalizeText(row?.transaction_id)
  if (!transactionId) return null
  const transaction = context.transactionById.get(transactionId) || {}
  const organisationName = context.organisationById.get(normalizeText(transaction?.organisation_id))?.name || null
  const documentName = normalizeText(row?.document_name || row?.name || row?.file_name)
  return buildActivityRecord({
    id: `document-${normalizeText(row?.id)}`,
    time: row?.uploaded_at || row?.created_at || row?.updated_at,
    type: 'document_uploaded',
    label: resolveActivityLabel('document_uploaded'),
    description: [documentName, describeTransactionContext(transaction)].filter(Boolean).join(' · '),
    entityId: normalizeText(row?.id),
    entityType: 'document',
    organisationName,
    actorName: getActorName(context.profileByUserId, row?.uploaded_by || row?.created_by, [row?.uploaded_by]),
    severity: resolveActivitySeverity('document_uploaded'),
  })
}

function mapInviteRowToActivity(row, context) {
  const roleType = classifyInviteRole(row)
  const activityType = resolveInviteActivityType(roleType)
  if (!activityType) return null
  const metadata = normalizeObject(row?.metadata)
  const organisationName = resolveOrganisationNameFromActivity(row, context.organisationById)
  const status = normalizeToken(row?.status)
  const email = normalizeText(row?.email || metadata?.email)
  let description = [email ? `Invited ${email}` : '', organisationName ? `to ${organisationName}` : ''].filter(Boolean).join(' ')
  if (status === 'pending' && daysBetween(row?.created_at, context.now) > 7) {
    description = [description, 'Pending for more than 7 days'].filter(Boolean).join(' · ')
  } else if (['declined', 'expired', 'revoked', 'cancelled', 'canceled', 'failed'].includes(status)) {
    description = [description, humanizeKey(status)].filter(Boolean).join(' · ')
  }
  return buildActivityRecord({
    id: `invite-${normalizeText(row?.id)}`,
    time: row?.created_at,
    type: activityType,
    label: resolveActivityLabel(activityType),
    description,
    entityId: normalizeText(row?.id),
    entityType: 'invite',
    organisationName,
    actorName: getActorName(context.profileByUserId, row?.inviter_user_id, [metadata?.inviter_name, metadata?.created_by_name]),
    severity: resolveActivitySeverity(activityType, {
      status,
      createdAt: row?.created_at,
      now: context.now,
    }),
  })
}

function mapOrganisationRowToActivity(row) {
  if (normalizeOrganisationType(row?.type) !== 'agency') return null
  return buildActivityRecord({
    id: `organisation-${normalizeText(row?.id)}`,
    time: row?.created_at,
    type: 'agency_signup',
    label: resolveActivityLabel('agency_signup'),
    description: 'Agency signup recorded in the platform.',
    entityId: normalizeText(row?.id),
    entityType: 'organisation',
    organisationName: normalizeText(row?.display_name || row?.name) || null,
    severity: resolveActivitySeverity('agency_signup'),
  })
}

function mapOrganisationUserToActivity(row, context) {
  if (!isActiveMembership(row)) return null
  const activatedAt = row?.accepted_at || row?.joined_at || row?.updated_at || row?.created_at
  const organisationName = context.organisationById.get(normalizeText(row?.organisation_id))?.name || null
  const actorName = getActorName(context.profileByUserId, row?.user_id, [
    getProfileDisplayName(row),
    row?.email,
  ])
  return buildActivityRecord({
    id: `organisation-user-${normalizeText(row?.id)}`,
    time: activatedAt,
    type: 'user_activated',
    label: resolveActivityLabel('user_activated'),
    description: organisationName ? `Joined ${organisationName}` : 'User activation recorded in the platform.',
    entityId: normalizeText(row?.user_id || row?.id),
    entityType: 'user',
    organisationName,
    actorName,
    severity: resolveActivitySeverity('user_activated'),
  })
}

function mapLeadRowToActivity(row, context) {
  const activityType = isWebsiteEnquiry(row) ? 'website_enquiry_received' : 'lead_received'
  const organisationName = context.organisationById.get(normalizeText(row?.organisation_id))?.name || null
  const areaInterest = normalizeText(row?.area_interest)
  const stage = normalizeText(row?.stage || row?.status)
  return buildActivityRecord({
    id: `lead-${normalizeText(row?.lead_id || row?.id)}`,
    time: row?.created_at,
    type: activityType,
    label: resolveActivityLabel(activityType),
    description: [stage ? humanizeKey(stage) : '', areaInterest].filter(Boolean).join(' · '),
    entityId: normalizeText(row?.lead_id || row?.id),
    entityType: 'lead',
    organisationName,
    severity: resolveActivitySeverity(activityType),
  })
}

function buildTransactionLifecycleActivities(transactions = [], context = {}) {
  return (Array.isArray(transactions) ? transactions : []).flatMap((row) => {
    const organisationName = context.organisationById.get(normalizeText(row?.organisation_id))?.name || null
    const entityId = normalizeText(row?.id)
    const description = describeTransactionContext(row)
    const createdItem = toDate(row?.created_at)
      ? [
          buildActivityRecord({
            id: `transaction-created-${entityId}`,
            time: row?.created_at,
            type: 'transaction_created',
            label: resolveActivityLabel('transaction_created'),
            description,
            entityId,
            entityType: 'transaction',
            organisationName,
            severity: resolveActivitySeverity('transaction_created'),
          }),
        ]
      : []
    const registrationDate = getRegistrationDate(row)
    const registeredItem = isRegisteredTransaction(row) && registrationDate
      ? [
          buildActivityRecord({
            id: `transaction-registered-${entityId}`,
            time: registrationDate,
            type: 'registration_completed',
            label: resolveActivityLabel('registration_completed'),
            description,
            entityId,
            entityType: 'transaction',
            organisationName,
            severity: resolveActivitySeverity('registration_completed'),
          }),
        ]
      : []
    return [...createdItem, ...registeredItem]
  })
}

function buildRecentActivity({
  auditRows = [],
  transactionEventRows = [],
  documentRows = [],
  inviteRows = [],
  organisationRows = [],
  organisationUserRows = [],
  leadRows = [],
  lifecycleRows = [],
  transactionById = new Map(),
  organisationById = new Map(),
  profileByUserId = new Map(),
  now = new Date(),
} = {}) {
  const context = {
    transactionById,
    organisationById,
    profileByUserId,
    now,
  }

  const lifecycleActivity = transactionEventRows.length < 5 ? buildTransactionLifecycleActivities(lifecycleRows, context) : []
  const items = [
    ...(Array.isArray(auditRows) ? auditRows.map((row) => mapAuditRowToActivity(row, context)) : []),
    ...(Array.isArray(transactionEventRows) ? transactionEventRows.map((row) => mapTransactionEventToActivity(row, context)) : []),
    ...(Array.isArray(documentRows) ? documentRows.map((row) => mapDocumentRowToActivity(row, context)) : []),
    ...(Array.isArray(inviteRows) ? inviteRows.map((row) => mapInviteRowToActivity(row, context)) : []),
    ...(Array.isArray(organisationRows) ? organisationRows.map((row) => mapOrganisationRowToActivity(row, context)) : []),
    ...(Array.isArray(organisationUserRows) ? organisationUserRows.map((row) => mapOrganisationUserToActivity(row, context)) : []),
    ...(Array.isArray(leadRows) ? leadRows.map((row) => mapLeadRowToActivity(row, context)) : []),
    ...lifecycleActivity,
  ]
    .filter((item) => item?.id && item?.time && item?.type)
    .sort((left, right) => new Date(right.time).getTime() - new Date(left.time).getTime())

  const seen = new Set()
  const deduped = []
  for (const item of items) {
    const dedupeKey = [item.type, item.entityType, item.entityId, item.time].join('::')
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    deduped.push(item)
    if (deduped.length >= 10) break
  }
  return deduped
}

function getAttentionSeverityRank(severity = '') {
  if (severity === 'critical') return 0
  if (severity === 'warning') return 1
  return 2
}

function buildAttentionRecord({
  id,
  type,
  severity,
  title,
  description = null,
  entityId = null,
  entityType = null,
  organisationName = null,
  createdAt = null,
  lastActivityAt = null,
  actionLabel = null,
  route = null,
}) {
  return {
    id: normalizeText(id),
    type: normalizeToken(type || 'attention_item') || 'attention_item',
    severity: severity === 'critical' ? 'critical' : severity === 'warning' ? 'warning' : 'info',
    title: normalizeText(title) || 'Needs attention',
    description: normalizeText(description) || null,
    entityId: normalizeText(entityId) || null,
    entityType: normalizeText(entityType) || null,
    organisationName: normalizeText(organisationName) || null,
    createdAt: createdAt ? toIsoString(createdAt) : null,
    lastActivityAt: lastActivityAt ? toIsoString(lastActivityAt) : null,
    actionLabel: normalizeText(actionLabel) || null,
    route: normalizeText(route) || null,
  }
}

function buildTransactionRoute(transactionId = '') {
  const safeId = normalizeText(transactionId)
  return safeId ? `/transactions/${encodeURIComponent(safeId)}` : null
}

function buildOrganisationRoute(organisationId = '') {
  const safeId = normalizeText(organisationId)
  return safeId ? `/organizations/${encodeURIComponent(safeId)}` : null
}

function sortAttentionItems(items = []) {
  return [...items].sort((left, right) => {
    const severityDelta = getAttentionSeverityRank(left?.severity) - getAttentionSeverityRank(right?.severity)
    if (severityDelta !== 0) return severityDelta

    const leftLastActivity = toDate(left?.lastActivityAt)
    const rightLastActivity = toDate(right?.lastActivityAt)
    if (leftLastActivity && rightLastActivity) {
      const inactivityDelta = leftLastActivity.getTime() - rightLastActivity.getTime()
      if (inactivityDelta !== 0) return inactivityDelta
    }

    if (leftLastActivity && !rightLastActivity) return -1
    if (!leftLastActivity && rightLastActivity) return 1

    const leftCreatedAt = toDate(left?.createdAt)
    const rightCreatedAt = toDate(right?.createdAt)
    if (left?.severity === 'warning' && leftCreatedAt && rightCreatedAt) {
      const warningDelta = rightCreatedAt.getTime() - leftCreatedAt.getTime()
      if (warningDelta !== 0) return warningDelta
    }

    const leftCreatedMs = leftCreatedAt?.getTime() || 0
    const rightCreatedMs = rightCreatedAt?.getTime() || 0
    return rightCreatedMs - leftCreatedMs
  })
}

function buildAttentionSnapshot(items = []) {
  const sorted = sortAttentionItems(items).filter((item) => item?.id && item?.title)
  return {
    total: sorted.length,
    critical: sorted.filter((item) => item.severity === 'critical').length,
    warning: sorted.filter((item) => item.severity === 'warning').length,
    items: sorted.slice(0, 10),
  }
}

function buildStuckTransactionAttentionItems(stuckTransactions = [], organisationById = new Map()) {
  return (Array.isArray(stuckTransactions) ? stuckTransactions : []).map(({ row, reason, daysInactive }) => {
    const organisationName = organisationById.get(normalizeText(row?.organisation_id))?.name || null
    const severity = daysInactive >= 14 ? 'critical' : 'warning'
    const locationLabel = getTransactionAddress(row)
    const referenceLabel = getTransactionReference(row)
    return buildAttentionRecord({
      id: `attention-stuck-transaction-${normalizeText(row?.id)}`,
      type: 'stuck_transaction',
      severity,
      title: `Transaction inactive for ${daysInactive} day${daysInactive === 1 ? '' : 's'}`,
      description: [reason, [referenceLabel, locationLabel].filter(Boolean).join(' · ')].filter(Boolean).join(' · '),
      entityId: normalizeText(row?.id),
      entityType: 'transaction',
      organisationName,
      createdAt: row?.created_at,
      lastActivityAt: getLastMeaningfulActivityAt(row),
      actionLabel: 'Review transaction',
      route: buildTransactionRoute(row?.id),
    })
  })
}

function buildDelayedRegistrationAttentionItems(activeTransactions = [], organisationById = new Map(), { todayStart = new Date(), soonThreshold = new Date() } = {}) {
  return (Array.isArray(activeTransactions) ? activeTransactions : [])
    .filter((row) => !isRegisteredTransaction(row))
    .map((row) => {
      const expectedRegistrationDate = getExpectedRegistrationDate(row)
      const expectedDate = toDate(expectedRegistrationDate)
      if (!expectedDate) return null
      if (expectedDate >= soonThreshold) return null
      const passed = expectedDate < todayStart
      const severity = passed ? 'critical' : 'warning'
      const organisationName = organisationById.get(normalizeText(row?.organisation_id))?.name || null
      const dueText = passed ? 'Expected registration date has passed' : 'Expected registration date is within 3 days'
      return buildAttentionRecord({
        id: `attention-delayed-registration-${normalizeText(row?.id)}`,
        type: 'delayed_registration',
        severity,
        title: passed ? 'Registration may be delayed' : 'Registration approaching quickly',
        description: [dueText, [getTransactionReference(row), getTransactionAddress(row)].filter(Boolean).join(' · ')].filter(Boolean).join(' · '),
        entityId: normalizeText(row?.id),
        entityType: 'transaction',
        organisationName,
        createdAt: row?.created_at,
        lastActivityAt: expectedRegistrationDate,
        actionLabel: 'Review transaction',
        route: buildTransactionRoute(row?.id),
      })
    })
    .filter(Boolean)
}

function buildOrganisationAttentionItems(organisations = [], { transactionsByOrganisationId = new Map(), usersByOrganisationId = new Map(), organisationById = new Map(), now = new Date() } = {}) {
  return (Array.isArray(organisations) ? organisations : [])
    .map((organisation) => {
      const organisationId = normalizeText(organisation?.id)
      const organisationTransactions = transactionsByOrganisationId.get(organisationId) || []
      const organisationUsers = usersByOrganisationId.get(organisationId) || []
      const activeUsers = organisationUsers.filter(isActiveMembership)
      const lastActivityCandidates = [
        organisation?.updated_at,
        ...organisationUsers.map((row) => row?.last_active_at || row?.updated_at || row?.accepted_at || row?.created_at),
        ...organisationTransactions.map((row) => getLastMeaningfulActivityAt(row)),
      ]
        .map(toDate)
        .filter(Boolean)
        .sort((left, right) => right.getTime() - left.getTime())
      const lastActivityAt = lastActivityCandidates[0]?.toISOString() || null
      const daysSinceActivity = daysBetween(lastActivityAt, now)

      if (activeUsers.length === 0) {
        return buildAttentionRecord({
          id: `attention-organisation-no-users-${organisationId}`,
          type: 'organisation_no_active_users',
          severity: 'warning',
          title: 'Organisation has no activated users',
          description: 'New organisation exists in the platform, but no user has activated access yet.',
          entityId: organisationId,
          entityType: 'organisation',
          organisationName: organisationById.get(organisationId)?.name || 'Organisation',
          createdAt: organisation?.created_at,
          lastActivityAt,
          actionLabel: 'Review organisation',
          route: buildOrganisationRoute(organisationId),
        })
      }

      if (!organisationTransactions.length) {
        return buildAttentionRecord({
          id: `attention-organisation-no-transactions-${organisationId}`,
          type: 'organisation_no_transactions',
          severity: 'warning',
          title: 'Organisation has no transactions yet',
          description: 'Active users exist, but no transaction has been created for this organisation.',
          entityId: organisationId,
          entityType: 'organisation',
          organisationName: organisationById.get(organisationId)?.name || 'Organisation',
          createdAt: organisation?.created_at,
          lastActivityAt,
          actionLabel: 'Review organisation',
          route: buildOrganisationRoute(organisationId),
        })
      }

      if (daysSinceActivity !== null && daysSinceActivity >= 14) {
        return buildAttentionRecord({
          id: `attention-organisation-inactive-${organisationId}`,
          type: 'organisation_inactive',
          severity: daysSinceActivity >= 30 ? 'critical' : 'warning',
          title: `Organisation inactive for ${daysSinceActivity} day${daysSinceActivity === 1 ? '' : 's'}`,
          description: 'No recent organisation, user, or transaction activity has been detected.',
          entityId: organisationId,
          entityType: 'organisation',
          organisationName: organisationById.get(organisationId)?.name || 'Organisation',
          createdAt: organisation?.created_at,
          lastActivityAt,
          actionLabel: 'Review organisation',
          route: buildOrganisationRoute(organisationId),
        })
      }

      return null
    })
    .filter(Boolean)
}

function buildInviteAttentionItems(invites = [], organisationById = new Map(), { now = new Date() } = {}) {
  return (Array.isArray(invites) ? invites : [])
    .map((row) => {
      const roleType = classifyInviteRole(row)
      if (!roleType) return null

      const status = normalizeToken(row?.status)
      const createdAt = row?.created_at
      const inviteAge = daysBetween(createdAt, now)
      const organisationName =
        organisationById.get(normalizeText(row?.target_workspace_id))?.name ||
        normalizeText(normalizeObject(row?.metadata)?.organisation_name || normalizeObject(row?.metadata)?.organization_name) ||
        null

      if (['failed', 'bounced', 'declined', 'expired', 'revoked', 'cancelled', 'canceled'].includes(status)) {
        return buildAttentionRecord({
          id: `attention-invite-failed-${normalizeText(row?.id)}`,
          type: 'failed_invitation',
          severity: 'critical',
          title: `${humanizeKey(roleType)} invite failed`,
          description: [normalizeText(row?.email), humanizeKey(status)].filter(Boolean).join(' · '),
          entityId: normalizeText(row?.id),
          entityType: 'invite',
          organisationName,
          createdAt,
          lastActivityAt: row?.updated_at || row?.accepted_at || createdAt,
          actionLabel: null,
          route: null,
        })
      }

      const deliveryStatus = normalizeToken(row?.last_delivery_status)
      if (['failed', 'bounced'].includes(deliveryStatus)) {
        return buildAttentionRecord({
          id: `attention-invite-delivery-${normalizeText(row?.id)}`,
          type: 'failed_invitation_delivery',
          severity: 'critical',
          title: `${humanizeKey(roleType)} invite delivery failed`,
          description: [normalizeText(row?.email), humanizeKey(deliveryStatus)].filter(Boolean).join(' · '),
          entityId: normalizeText(row?.id),
          entityType: 'invite',
          organisationName,
          createdAt,
          lastActivityAt: row?.last_delivery_failed_at || row?.updated_at || createdAt,
          actionLabel: null,
          route: null,
        })
      }

      if (['pending', 'invited', 'sent', 'queued'].includes(status) && inviteAge !== null && inviteAge > 7) {
        return buildAttentionRecord({
          id: `attention-invite-stalled-${normalizeText(row?.id)}`,
          type: 'stalled_invitation',
          severity: inviteAge > 14 ? 'critical' : 'warning',
          title: `${humanizeKey(roleType)} invite pending for ${inviteAge} day${inviteAge === 1 ? '' : 's'}`,
          description: [normalizeText(row?.email), organisationName ? `for ${organisationName}` : ''].filter(Boolean).join(' · '),
          entityId: normalizeText(row?.id),
          entityType: 'invite',
          organisationName,
          createdAt,
          lastActivityAt: row?.updated_at || createdAt,
          actionLabel: null,
          route: null,
        })
      }

      return null
    })
    .filter(Boolean)
}

function buildCommunicationFailureAttentionItems(rows = [], organisationById = new Map()) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => normalizeToken(row?.status) === 'failed')
    .map((row) => {
      const channel = normalizeToken(row?.channel) || 'communication'
      const organisationName = organisationById.get(normalizeText(row?.organisation_id))?.name || null
      const transactionRoute = buildTransactionRoute(row?.transaction_id)
      return buildAttentionRecord({
        id: `attention-delivery-failed-${normalizeText(row?.id)}`,
        type: 'communication_delivery_failed',
        severity: 'critical',
        title: `${humanizeKey(channel)} delivery failed`,
        description: [normalizeText(row?.recipient), normalizeText(row?.error_message)].filter(Boolean).join(' · '),
        entityId: normalizeText(row?.transaction_id || row?.id),
        entityType: normalizeText(row?.transaction_id) ? 'transaction' : 'communication_delivery',
        organisationName,
        createdAt: row?.created_at,
        lastActivityAt: row?.failed_at || row?.updated_at || row?.created_at,
        actionLabel: transactionRoute ? 'Review transaction' : null,
        route: transactionRoute,
      })
    })
}

export async function getMissionControlSnapshot({ headers = {}, now = new Date() } = {}) {
  const { serviceClient } = await authenticateHqRequest(headers)
  const snapshot = buildEmptySnapshot(now)
  const todayStart = startOfDay(now)
  const tomorrowStart = addDays(todayStart, 1)
  const monthStart = startOfMonth(now)
  const nextMonthStart = startOfMonth(addMonths(now, 1))
  const previousMonthStart = startOfMonth(addMonths(now, -1))
  const next7Days = addDays(todayStart, 7)
  const next14Days = addDays(todayStart, 14)
  const next30Days = addDays(todayStart, 30)
  const warningThreshold = addDays(todayStart, -4)
  const inactiveOrganisationThreshold = addDays(todayStart, -14)

  const [
    transactionResult,
    organisationResult,
    organisationUserResult,
    inviteMetricResult,
    inviteAttentionResult,
    inviteActivityResult,
    leadMetricResult,
    leadActivityResult,
    documentActivityResult,
    communicationFailureResult,
    auditResult,
    transactionEventResult,
    subscriptionResult,
  ] = await Promise.all([
    fetchAllRows(
      serviceClient,
      'transactions',
      [
        'id, organisation_id, assigned_agent, assigned_agent_email, transaction_reference, matter_reference, reference, title_deed_number, status, lifecycle_state, current_main_stage, stage, operational_state, attorney_stage, is_active, created_at, updated_at, deleted_at, archived_at, cancelled_at, registered_at, completed_at, registration_date, target_registration_date, expected_registration_date, expected_transfer_date, last_meaningful_activity_at, property_address_line_1, suburb, city, municipality, province',
        'id, organisation_id, assigned_agent, assigned_agent_email, title_deed_number, status, lifecycle_state, current_main_stage, stage, is_active, created_at, updated_at, deleted_at, archived_at, cancelled_at, registered_at, completed_at, registration_date, expected_registration_date, last_meaningful_activity_at, property_address_line_1, suburb, city, province',
        'id, organisation_id, status, lifecycle_state, current_main_stage, stage, is_active, created_at, updated_at, registration_date, completed_at, property_address_line_1, suburb, city, province',
      ],
      {
        allowMissing: true,
        order: { column: 'created_at', ascending: false },
      },
    ),
    fetchAllRows(
      serviceClient,
      'organisations',
      [
        'id, name, display_name, type, status, is_active, created_at, updated_at',
        'id, name, display_name, type, status, created_at, updated_at',
        'id, name, display_name, created_at, updated_at',
      ],
      {
        allowMissing: true,
        order: { column: 'created_at', ascending: false },
      },
    ),
    fetchAllRows(
      serviceClient,
      'organisation_users',
      [
        'id, organisation_id, user_id, email, first_name, last_name, role, workspace_role, organisation_role, app_role, status, accepted_at, joined_at, invited_at, last_active_at, created_at, updated_at',
        'id, organisation_id, user_id, email, first_name, last_name, role, organisation_role, app_role, status, accepted_at, joined_at, last_active_at, created_at, updated_at',
        'id, organisation_id, user_id, email, role, status, created_at, updated_at',
      ],
      {
        allowMissing: true,
        order: { column: 'created_at', ascending: false },
      },
    ),
    fetchAllRows(
      serviceClient,
      'invites',
      [
        'id, invite_type, status, target_workspace_role, target_transaction_role, email, inviter_user_id, target_workspace_id, last_delivery_status, last_delivery_failed_at, metadata, accepted_at, created_at, updated_at',
        'id, invite_type, status, target_workspace_role, email, inviter_user_id, target_workspace_id, last_delivery_status, last_delivery_failed_at, metadata, accepted_at, created_at, updated_at',
        'id, invite_type, status, email, inviter_user_id, last_delivery_status, last_delivery_failed_at, metadata, accepted_at, created_at, updated_at',
      ],
      {
        allowMissing: true,
        apply(query) {
          return query.gte('created_at', monthStart.toISOString())
        },
        order: { column: 'created_at', ascending: false },
      },
    ),
    fetchAllRows(
      serviceClient,
      'invites',
      [
        'id, invite_type, status, target_workspace_role, target_transaction_role, email, inviter_user_id, target_workspace_id, last_delivery_status, last_delivery_failed_at, metadata, accepted_at, created_at, updated_at',
        'id, invite_type, status, target_workspace_role, email, inviter_user_id, target_workspace_id, last_delivery_status, last_delivery_failed_at, metadata, accepted_at, created_at, updated_at',
        'id, invite_type, status, email, inviter_user_id, last_delivery_status, last_delivery_failed_at, metadata, accepted_at, created_at, updated_at',
      ],
      {
        allowMissing: true,
        order: { column: 'created_at', ascending: false },
      },
    ),
    fetchAllRows(
      serviceClient,
      'leads',
      [
        'lead_id, id, organisation_id, source, lead_source, area_interest, stage, status, created_at, updated_at',
        'lead_id, id, organisation_id, source, stage, status, created_at, updated_at',
        'id, source, created_at, updated_at',
      ],
      {
        allowMissing: true,
        apply(query) {
          return query.gte('created_at', monthStart.toISOString())
        },
        order: { column: 'created_at', ascending: false },
      },
    ),
    selectRows(
      serviceClient,
      'invites',
      [
        'id, invite_type, status, target_workspace_role, target_transaction_role, email, inviter_user_id, target_workspace_id, last_delivery_status, last_delivery_failed_at, metadata, accepted_at, created_at, updated_at',
        'id, invite_type, status, target_workspace_role, email, inviter_user_id, target_workspace_id, last_delivery_status, last_delivery_failed_at, metadata, accepted_at, created_at, updated_at',
        'id, invite_type, status, email, inviter_user_id, last_delivery_status, last_delivery_failed_at, metadata, accepted_at, created_at, updated_at',
      ],
      {
        allowMissing: true,
        order: { column: 'created_at', ascending: false },
        limit: 12,
      },
    ),
    selectRows(
      serviceClient,
      'leads',
      [
        'lead_id, id, organisation_id, source, lead_source, area_interest, stage, status, created_at, updated_at',
        'lead_id, id, organisation_id, source, stage, status, created_at, updated_at',
        'id, source, created_at, updated_at',
      ],
      {
        allowMissing: true,
        order: { column: 'created_at', ascending: false },
        limit: 12,
      },
    ),
    selectRows(
      serviceClient,
      'documents',
      [
        'id, transaction_id, name, document_name, file_name, status, uploaded_at, uploaded_by, created_at, created_by, updated_at',
        'id, transaction_id, document_name, status, uploaded_at, uploaded_by, created_at, created_by, updated_at',
        'id, transaction_id, name, status, created_at, updated_at',
      ],
      {
        allowMissing: true,
        order: { column: 'created_at', ascending: false },
        limit: 12,
      },
    ),
    selectRows(
      serviceClient,
      'communication_deliveries',
      [
        'id, organisation_id, transaction_id, lead_id, channel, status, recipient, error_message, failed_at, created_at, updated_at',
        'id, organisation_id, transaction_id, channel, status, recipient, error_message, failed_at, created_at, updated_at',
        'id, organisation_id, channel, status, recipient, error_message, created_at, updated_at',
      ],
      {
        allowMissing: true,
        apply(query) {
          return query.eq('status', 'failed')
        },
        order: { column: 'created_at', ascending: false },
        limit: 20,
      },
    ),
    selectRows(
      serviceClient,
      'security_audit_events',
      [
        'id, user_id, workspace_id, action, target_type, target_id, metadata, created_at',
        'id, user_id, action, target_type, target_id, metadata, created_at',
        'id, action, target_type, target_id, created_at',
      ],
      {
        allowMissing: true,
        order: { column: 'created_at', ascending: false },
        limit: 12,
      },
    ),
    selectRows(
      serviceClient,
      'transaction_events',
      [
        'id, transaction_id, event_type, event_data, created_at',
        'id, transaction_id, event_type, created_at',
      ],
      {
        allowMissing: true,
        order: { column: 'created_at', ascending: false },
        limit: 12,
      },
    ),
    fetchAllRows(
      serviceClient,
      'workspace_subscriptions',
      [
        'id, organisation_id, status, billing_cycle, monthly_amount, current_period_ends_at, created_at, updated_at',
        'id, organisation_id, status, monthly_amount, created_at, updated_at',
        'id, organisation_id, status, created_at, updated_at',
      ],
      {
        allowMissing: true,
        order: { column: 'updated_at', ascending: false },
        pageSize: 500,
      },
    ),
  ])

  const transactions = transactionResult.rows || []
  const organisations = organisationResult.rows || []
  const organisationUsers = organisationUserResult.rows || []
  const invites = inviteMetricResult.rows || []
  const inviteAttentionRows = inviteAttentionResult.rows || []
  const inviteActivityRows = inviteActivityResult.rows || []
  const leads = leadMetricResult.rows || []
  const leadActivityRows = leadActivityResult.rows || []
  const documentActivityRows = documentActivityResult.rows || []
  const communicationFailureRows = communicationFailureResult.rows || []
  const auditRows = auditResult.rows || []
  const transactionEventRows = transactionEventResult.rows || []
  const subscriptions = subscriptionResult.rows || []

  const activeTransactions = transactions.filter((row) => isDashboardTransactionActive(row))
  const supportsOrganisationSource = Boolean(organisationResult.fieldsUsed)
  const supportsTransactionSource = Boolean(transactionResult.fieldsUsed)
  const supportsRegistrationDates =
    hasSelectedColumn(transactionResult.fieldsUsed, 'registered_at') ||
    hasSelectedColumn(transactionResult.fieldsUsed, 'registration_date') ||
    hasSelectedColumn(transactionResult.fieldsUsed, 'completed_at')
  const supportsExpectedRegistrationDates =
    hasSelectedColumn(transactionResult.fieldsUsed, 'target_registration_date') ||
    hasSelectedColumn(transactionResult.fieldsUsed, 'expected_registration_date') ||
    hasSelectedColumn(transactionResult.fieldsUsed, 'expected_transfer_date')
  const activeOrganisations = organisations.filter(isActiveOrganisation)
  const activeOrganisationIds = new Set(activeOrganisations.map((row) => normalizeText(row?.id)).filter(Boolean))
  const activeAgencies = activeOrganisations.filter((row) => normalizeOrganisationType(row?.type) === 'agency')
  const activeAgencyIds = new Set(activeAgencies.map((row) => normalizeText(row?.id)).filter(Boolean))
  const activeOrganisationUsers = organisationUsers.filter((row) => activeOrganisationIds.has(normalizeText(row?.organisation_id)) && isActiveMembership(row))
  const activeAgencyUsers = activeOrganisationUsers.filter((row) => activeAgencyIds.has(normalizeText(row?.organisation_id)))

  const transactionById = new Map(transactions.map((row) => [normalizeText(row?.id), row]))
  const recentOrganisationUsers = organisationUsers.slice(0, 12)
  const candidateProfileIds = [
    ...new Set(
      [
        ...activeAgencyUsers.map((row) => normalizeText(row?.user_id)),
        ...recentOrganisationUsers.map((row) => normalizeText(row?.user_id)),
        ...auditRows.map((row) => normalizeText(row?.user_id)),
        ...inviteActivityRows.map((row) => normalizeText(row?.inviter_user_id)),
        ...documentActivityRows.map((row) => normalizeText(row?.uploaded_by || row?.created_by)),
        ...transactionEventRows.map((row) => normalizeText(normalizeObject(row?.event_data)?.actor_user_id || normalizeObject(row?.event_data)?.actorUserId)),
      ].filter((value) => isUuidLike(value)),
    ),
  ]
  const activityProfiles = candidateProfileIds.length
    ? (
        await fetchAllRows(
          serviceClient,
          'profiles',
          [
            'id, role, system_role, email, full_name, first_name, last_name, updated_at',
            'id, role, email, full_name, first_name, last_name, updated_at',
          ],
          {
            allowMissing: true,
            apply(query) {
              return query.in('id', candidateProfileIds)
            },
            order: { column: 'updated_at', ascending: false },
            pageSize: 500,
          },
        )
      ).rows
    : []

  const organisationById = new Map(
    organisations.map((row) => [
      normalizeText(row?.id),
      {
        id: normalizeText(row?.id),
        name: normalizeText(row?.display_name || row?.name) || 'Organisation',
        type: normalizeOrganisationType(row?.type),
        createdAt: row?.created_at || null,
        updatedAt: row?.updated_at || null,
        status: normalizeLower(row?.status) || 'active',
      },
    ]),
  )

  const profileByUserId = new Map(activityProfiles.map((row) => [normalizeText(row?.id), row]))
  const activeAgentUserIds = new Set()
  for (const row of activeAgencyUsers) {
    const userId = normalizeText(row?.user_id)
    const membershipTokens = collectRoleTokens(row)
    const profileTokens = collectRoleTokens(profileByUserId.get(userId) || {})
    if (roleMatchesAny([...membershipTokens, ...profileTokens], AGENT_ROLE_TOKENS)) {
      activeAgentUserIds.add(userId || normalizeText(row?.email))
    }
  }

  snapshot.summary.activeTransactions = activeTransactions.length
  snapshot.summary.scheduledRegistrationsSoon = activeTransactions.reduce((count, row) => {
    const expectedDate = getExpectedRegistrationDate(row)
    return isWithinRange(expectedDate, todayStart, next7Days) ? count + 1 : count
  }, 0)
  const registeredTransactions = transactions.filter((row) => isRegisteredTransaction(row))
  const registeredThisMonth = supportsRegistrationDates
    ? registeredTransactions.filter((row) => isWithinRange(getRegistrationDate(row), monthStart, nextMonthStart)).length
    : null
  const registeredLastMonth = supportsRegistrationDates
    ? registeredTransactions.filter((row) => isWithinRange(getRegistrationDate(row), previousMonthStart, monthStart)).length
    : null
  snapshot.summary.registeredToday = registeredTransactions.reduce((count, row) => {
    if (!isRegisteredTransaction(row)) return count
    return isWithinRange(getRegistrationDate(row), todayStart, tomorrowStart) ? count + 1 : count
  }, 0)

  snapshot.growth.activeAgencies = activeAgencies.length
  snapshot.growth.activeAgents = activeAgentUserIds.size
  snapshot.growth.newAgencySignups = organisations.filter((row) => normalizeOrganisationType(row?.type) === 'agency' && isOnOrAfter(row?.created_at, monthStart)).length
  const newOrganisationsThisMonth = supportsOrganisationSource
    ? organisations.filter((row) => isWithinRange(row?.created_at, monthStart, nextMonthStart)).length
    : null
  const newOrganisationsLastMonth = supportsOrganisationSource
    ? organisations.filter((row) => isWithinRange(row?.created_at, previousMonthStart, monthStart)).length
    : null
  snapshot.growth.websiteEnquiries = leads.filter(isWebsiteEnquiry).length
  // TODO: connect demo requests once the enquiry/demo workflow is modelled explicitly.
  snapshot.growth.demoRequests = null

  let acceptedInvites = 0
  let sentInvites = 0
  for (const row of invites) {
    const roleType = classifyInviteRole(row)
    if (!roleType) continue
    sentInvites += 1
    if (normalizeLower(row?.status) === 'accepted' || row?.accepted_at) acceptedInvites += 1
    if (roleType === 'agent') snapshot.invites.agentInvitesSent += 1
    if (roleType === 'attorney') snapshot.invites.attorneyInvitesSent += 1
    if (roleType === 'bond_originator') snapshot.invites.bondOriginatorInvitesSent += 1
    if (['declined', 'expired', 'revoked', 'cancelled'].includes(normalizeLower(row?.status))) {
      snapshot.invites.failedInvites += 1
    }
  }
  snapshot.invites.inviteAcceptanceRate = sentInvites > 0 ? acceptedInvites / sentInvites : null

  const stuckTransactions = activeTransactions
    .map((row) => {
      const lastActivityAt = getLastMeaningfulActivityAt(row)
      const daysInactive = daysBetween(lastActivityAt, now)
      const expectedRegistrationDate = getExpectedRegistrationDate(row)
      let reason = 'No meaningful update in more than 7 days'
      if (expectedRegistrationDate && toDate(expectedRegistrationDate) < todayStart) {
        reason = 'Expected registration date has passed'
      }
      return {
        row,
        daysInactive,
        expectedRegistrationDate,
        reason,
      }
    })
    .filter((entry) => entry.daysInactive !== null && entry.daysInactive > 7)
    .sort((left, right) => (right.daysInactive || 0) - (left.daysInactive || 0))

  const needsAttentionTransactions = activeTransactions.filter((row) => {
    const lastActivityAt = getLastMeaningfulActivityAt(row)
    const expectedRegistrationDate = getExpectedRegistrationDate(row)
    if (expectedRegistrationDate && toDate(expectedRegistrationDate) < todayStart) return true
    return Boolean(lastActivityAt && toDate(lastActivityAt) < todayStart && toDate(lastActivityAt) <= warningThreshold)
  })

  const delayedRegistrations = activeTransactions.filter((row) => {
    const expectedRegistrationDate = getExpectedRegistrationDate(row)
    return Boolean(expectedRegistrationDate && toDate(expectedRegistrationDate) < todayStart)
  }).length

  snapshot.transactionHealth.stuck = stuckTransactions.length
  snapshot.transactionHealth.needsAttention = Math.max(
    0,
    new Set(needsAttentionTransactions.map((row) => normalizeText(row?.id))).size - stuckTransactions.length,
  )
  snapshot.transactionHealth.onTrack = Math.max(
    0,
    activeTransactions.length - (snapshot.transactionHealth.stuck || 0) - (snapshot.transactionHealth.needsAttention || 0),
  )
  snapshot.transactionHealth.delayedRegistrations = delayedRegistrations

  const areaSummary = new Map()
  for (const row of activeTransactions) {
    const area = getAreaLabel(row)
    if (!area) continue
    const province = normalizeText(row?.province) || null
    const key = `${area.toLowerCase()}::${province || ''}`
    const entry = areaSummary.get(key) || { area, province, transactionCount: 0 }
    entry.transactionCount += 1
    areaSummary.set(key, entry)
  }
  snapshot.activeAreas = [...areaSummary.values()].sort((left, right) => right.transactionCount - left.transactionCount).slice(0, 5)

  snapshot.recentActivity = buildRecentActivity({
    auditRows,
    transactionEventRows,
    documentRows: documentActivityRows,
    inviteRows: inviteActivityRows,
    organisationRows: organisations.slice(0, 12),
    organisationUserRows: recentOrganisationUsers,
    leadRows: leadActivityRows,
    lifecycleRows: transactions.slice(0, 12),
    transactionById,
    organisationById,
    profileByUserId,
    now,
  })

  snapshot.stuckTransactions = stuckTransactions.slice(0, 5).map(({ row, reason, daysInactive }) => ({
    id: normalizeText(row?.id),
    reference: getTransactionReference(row),
    address: getTransactionAddress(row),
    agency: organisationById.get(normalizeText(row?.organisation_id))?.name || null,
    agent: normalizeText(row?.assigned_agent) || normalizeText(row?.assigned_agent_email) || null,
    reason,
    daysInactive,
  }))

  const transactionsByOrganisationId = new Map()
  for (const row of transactions) {
    const organisationId = normalizeText(row?.organisation_id)
    if (!organisationId) continue
    const bucket = transactionsByOrganisationId.get(organisationId) || []
    bucket.push(row)
    transactionsByOrganisationId.set(organisationId, bucket)
  }

  const usersByOrganisationId = new Map()
  for (const row of organisationUsers) {
    const organisationId = normalizeText(row?.organisation_id)
    if (!organisationId) continue
    const bucket = usersByOrganisationId.get(organisationId) || []
    bucket.push(row)
    usersByOrganisationId.set(organisationId, bucket)
  }

  const organisationsNeedingAttention = activeOrganisations
    .map((organisation) => {
      const organisationId = normalizeText(organisation?.id)
      const organisationTransactions = transactionsByOrganisationId.get(organisationId) || []
      const organisationUsersList = usersByOrganisationId.get(organisationId) || []
      const activeUsersCount = organisationUsersList.filter(isActiveMembership).length
      const lastActivityCandidates = [
        organisation?.updated_at,
        ...organisationUsersList.map((row) => row?.last_active_at || row?.updated_at || row?.created_at),
        ...organisationTransactions.map((row) => getLastMeaningfulActivityAt(row)),
      ]
        .map(toDate)
        .filter(Boolean)
        .sort((left, right) => right.getTime() - left.getTime())

      const lastActivityAt = lastActivityCandidates[0]?.toISOString() || null
      let reason = ''

      if (activeUsersCount === 0) {
        reason = 'No active users yet'
      } else if (!organisationTransactions.length) {
        reason = 'No transactions created yet'
      } else if (lastActivityAt && toDate(lastActivityAt) < inactiveOrganisationThreshold) {
        reason = 'No activity in the last 14 days'
      }

      if (!reason) return null

      return {
        id: organisationId,
        name: organisationById.get(organisationId)?.name || 'Organisation',
        type: organisationById.get(organisationId)?.type || null,
        reason,
        lastActivityAt,
      }
    })
    .filter(Boolean)
    .slice(0, 5)

  snapshot.organisationsNeedingAttention = organisationsNeedingAttention

  const attentionItems = [
    ...buildStuckTransactionAttentionItems(stuckTransactions, organisationById),
    // TODO: if the platform adds an explicit registration-readiness field, tighten this warning logic to require "not ready" instead of "not yet registered".
    ...buildDelayedRegistrationAttentionItems(activeTransactions, organisationById, {
      todayStart,
      soonThreshold: addDays(todayStart, 3),
    }),
    ...buildOrganisationAttentionItems(activeOrganisations, {
      transactionsByOrganisationId,
      usersByOrganisationId,
      organisationById,
      now,
    }),
    ...buildInviteAttentionItems(inviteAttentionRows, organisationById, { now }),
    // TODO: add document-generation failure alerts once there is a stable platform-wide failure source beyond communication delivery failures.
    ...buildCommunicationFailureAttentionItems(communicationFailureRows, organisationById),
  ]

  snapshot.attention = buildAttentionSnapshot(attentionItems)

  snapshot.registrationForecast.next7Days = activeTransactions.filter((row) => isWithinRange(getExpectedRegistrationDate(row), todayStart, next7Days)).length
  snapshot.registrationForecast.next14Days = activeTransactions.filter((row) => isWithinRange(getExpectedRegistrationDate(row), todayStart, next14Days)).length
  snapshot.registrationForecast.next30Days = activeTransactions.filter((row) => isWithinRange(getExpectedRegistrationDate(row), todayStart, next30Days)).length
  // TODO: connect forecast revenue once billing and registration revenue attribution are finalised.
  snapshot.registrationForecast.forecastRevenue = null

  snapshot.funnel.websiteEnquiries = snapshot.growth.websiteEnquiries
  // TODO: connect demo booking stages once a dedicated demo workflow exists.
  snapshot.funnel.demosBooked = null
  // TODO: connect trial lifecycle stages once they exist in the platform model.
  snapshot.funnel.trialsStarted = null
  snapshot.funnel.organisationsLive = activeOrganisations.length

  const supportsSubscriptionRevenue = hasSelectedColumn(subscriptionResult.fieldsUsed, 'monthly_amount')
  const subscriptionRevenue = supportsSubscriptionRevenue
    ? subscriptions.reduce((sum, row) => {
        const normalizedStatus = normalizeToken(row?.status)
        if (!['active', 'past_due'].includes(normalizedStatus)) return sum
        const monthlyAmount = Number(row?.monthly_amount)
        if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) return sum
        return sum + monthlyAmount / 100
      }, 0)
    : null

  snapshot.executive = buildExecutiveSnapshot({
    snapshot,
    growthCurrentMonth: newOrganisationsThisMonth,
    growthPreviousMonth: newOrganisationsLastMonth,
    registeredThisMonth: supportsTransactionSource ? registeredThisMonth : null,
    registeredLastMonth: supportsTransactionSource ? registeredLastMonth : null,
    supportsExpectedRegistrationDates,
    subscriptionRevenue,
  })

  snapshot.summary.revenueThisMonth = snapshot.executive.revenue.actualThisMonth
  snapshot.summary.platformHealthScore = snapshot.executive.platformHealthScore

  return snapshot
}
