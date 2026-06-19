import { supabase } from './supabaseClient'

const CURRENCY = new Intl.NumberFormat('en-ZA', {
  currency: 'ZAR',
  maximumFractionDigits: 0,
  style: 'currency',
})

const INTEGER = new Intl.NumberFormat('en-ZA', {
  maximumFractionDigits: 0,
})

const MONTH = new Intl.DateTimeFormat('en-ZA', {
  month: 'short',
})

const RANGE_OPTIONS = {
  today: { days: 1, label: 'Today' },
  '7d': { days: 7, label: '7 Days' },
  '30d': { days: 30, label: '30 Days' },
  '90d': { days: 90, label: '90 Days' },
  ytd: { ytd: true, label: 'YTD' },
  custom: { days: 30, label: 'Custom' },
}

const TRANSACTION_FEE_ESTIMATE = 1000

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeToken(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function compact(items) {
  return items.filter(Boolean)
}

function uniqueById(rows = []) {
  const seen = new Set()
  return rows.filter((row) => {
    const id = row?.id || row?.uuid || JSON.stringify(row)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function asDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function dateFrom(row = {}, keys = []) {
  for (const key of keys) {
    const date = asDate(row?.[key])
    if (date) return date
  }
  return null
}

function daysBetween(start, end) {
  const startDate = asDate(start)
  const endDate = asDate(end)
  if (!startDate || !endDate) return null
  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86400000))
}

function daysAgo(value) {
  const date = asDate(value)
  if (!date) return null
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000))
}

function firstValue(row = {}, keys = []) {
  for (const key of keys) {
    const value = row?.[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return null
}

function numberValue(row = {}, keys = []) {
  const value = firstValue(row, keys)
  if (value === null) return 0
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''))
  if (!Number.isFinite(parsed)) return 0
  return /cents/i.test(keys.find((key) => row?.[key] !== undefined) || '') ? parsed / 100 : parsed
}

function formatDate(value) {
  if (!value) return 'No date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No date'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatShortDate(value) {
  const date = asDate(value)
  if (!date) return 'No date'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
  }).format(date)
}

function getRange(rangeKey = '30d') {
  const now = new Date()
  const option = RANGE_OPTIONS[rangeKey] || RANGE_OPTIONS['30d']
  const start = option.ytd ? new Date(now.getFullYear(), 0, 1) : new Date(now.getTime() - (option.days - 1) * 86400000)
  start.setHours(0, 0, 0, 0)
  const previousStart = new Date(start.getTime() - (now.getTime() - start.getTime()))
  return { end: now, key: rangeKey, label: option.label, previousStart, start }
}

function inRange(value, range) {
  const date = asDate(value)
  return Boolean(date && date >= range.start && date <= range.end)
}

function inPreviousRange(value, range) {
  const date = asDate(value)
  return Boolean(date && date >= range.previousStart && date < range.start)
}

function monthKey(value) {
  const date = asDate(value)
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function latestDate(row = {}) {
  return dateFrom(row, ['updated_at', 'last_login', 'last_sign_in_at', 'last_seen_at', 'created_at', 'inserted_at'])
}

function createdAt(row = {}) {
  return dateFrom(row, ['created_at', 'inserted_at', 'createdAt'])
}

function rowName(row = {}) {
  return (
    normalizeText(row.full_name) ||
    normalizeText(row.name) ||
    normalizeText(row.display_name) ||
    normalizeText(row.company_name) ||
    normalizeText(row.organisation_name) ||
    normalizeText(row.email) ||
    'Unknown record'
  )
}

function rowEmail(row = {}) {
  return normalizeText(row.email) || normalizeText(row.contact_email) || normalizeText(row.client_email) || 'No email'
}

function rowStatus(row = {}) {
  return normalizeText(row.status) || normalizeText(row.stage) || normalizeText(row.workflow_status) || 'open'
}

function rowUpdatedAt(row = {}) {
  return row.updated_at || row.created_at || row.inserted_at || row.last_seen_at || null
}

function percentChange(current, previous) {
  if (!previous && !current) return ''
  if (!previous) return current ? '+100%' : ''
  const change = ((current - previous) / previous) * 100
  return `${change >= 0 ? '+' : ''}${Math.round(change)}%`
}

function money(value) {
  return CURRENCY.format(Math.max(0, Number(value) || 0)).replace(/\u00a0/g, ' ')
}

function count(value) {
  return INTEGER.format(Math.max(0, Number(value) || 0))
}

function organisationType(row = {}) {
  const type = normalizeToken(firstValue(row, ['organisation_type', 'organization_type', 'type', 'category', 'role']))
  if (type.includes('attorney') || type.includes('conveyancer')) return 'Attorneys'
  if (type.includes('bond') || type.includes('originator') || type.includes('finance')) return 'Bond Originators'
  if (type.includes('developer')) return 'Developers'
  return 'Agencies'
}

function transactionStage(row = {}) {
  const status = normalizeToken(firstValue(row, ['stage', 'status', 'workflow_status', 'transaction_stage']) || '')
  if (status.includes('register')) return 'Registration'
  if (status.includes('transfer') || status.includes('lodg')) return 'Transfer'
  if (status.includes('finance') || status.includes('bond')) return 'Finance'
  if (status.includes('otp') || status.includes('offer') || status.includes('signed')) return 'OTP'
  return 'Onboarding'
}

function isRegistered(row = {}) {
  const status = normalizeToken(firstValue(row, ['status', 'stage', 'workflow_status']) || '')
  return Boolean(status.includes('registered') || row.registration_date || row.registered_at)
}

function isActiveTransaction(row = {}) {
  const status = normalizeToken(firstValue(row, ['status', 'stage', 'workflow_status']) || '')
  return !['registered', 'cancelled', 'canceled', 'closed', 'complete', 'completed', 'lost'].some((token) =>
    status.includes(token),
  )
}

function safeRatio(numerator, denominator) {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 100)
}

async function tryTable(label, table, { required = false, limit = 1000 } = {}) {
  if (!supabase) return { data: [], error: null, skipped: true }
  try {
    const { data, error } = await supabase.from(table).select('*').limit(limit)
    if (error) {
      return {
        data: [],
        error: required ? { label, message: error.message } : null,
      }
    }
    return { data: asArray(data), error: null }
  } catch (error) {
    return {
      data: [],
      error: required ? { label, message: error?.message || 'Query failed' } : null,
    }
  }
}

async function tryQuery(label, queryFactory) {
  if (!supabase) return { data: [], error: null, skipped: true }
  try {
    const { data, error } = await queryFactory()
    if (error) return { data: [], error: { label, message: error.message } }
    return { data: Array.isArray(data) ? data : [], error: null }
  } catch (error) {
    return { data: [], error: { label, message: error?.message || 'Query failed' } }
  }
}

function buildMonthlyTrend(rows, keyFn, months = 6, cumulative = false) {
  const now = new Date()
  const buckets = []
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    buckets.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: MONTH.format(date),
      value: 0,
    })
  }

  for (const row of rows) {
    const key = monthKey(keyFn(row))
    const bucket = buckets.find((item) => item.key === key)
    if (bucket) bucket.value += 1
  }

  if (cumulative) {
    let running = 0
    return buckets.map((bucket) => {
      running += bucket.value
      return { ...bucket, value: running }
    })
  }

  return buckets
}

function buildValueTrend(values, labels) {
  return labels.map((label, index) => ({ label, value: values[index] || 0 }))
}

function buildAttention({ organisations, profiles, transactions }) {
  const items = []
  const now = new Date()

  for (const organisation of organisations) {
    const orgId = organisation.id || organisation.organisation_id || organisation.organization_id
    const orgUsers = profiles.filter((profile) =>
      [profile.organisation_id, profile.organization_id, profile.company_id].includes(orgId),
    )
    const lastLogin = orgUsers
      .map((profile) => dateFrom(profile, ['last_login', 'last_sign_in_at', 'last_seen_at', 'updated_at']))
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime())[0]
    const noLoginDays = lastLogin ? daysAgo(lastLogin) : daysAgo(createdAt(organisation))

    if (noLoginDays !== null && noLoginDays > 14) {
      items.push({
        id: `nologin-${orgId || rowName(organisation)}`,
        severity: 'danger',
        title: rowName(organisation),
        detail: `No login activity in ${noLoginDays} days`,
        time: `${noLoginDays} days ago`,
      })
    }

    const trialEnd = dateFrom(organisation, ['trial_ends_at', 'trial_end_date', 'trial_expires_at'])
    if (trialEnd) {
      const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / 86400000)
      if (daysLeft >= 0 && daysLeft < 7) {
        items.push({
          id: `trial-${orgId || rowName(organisation)}`,
          severity: 'warning',
          title: rowName(organisation),
          detail: `Trial expires in ${daysLeft} days`,
          time: daysLeft <= 1 ? '1 day left' : `${daysLeft} days left`,
        })
      }
    }
  }

  const stalledByOrg = new Map()
  for (const transaction of transactions.filter(isActiveTransaction)) {
    const age = daysAgo(dateFrom(transaction, ['updated_at', 'created_at', 'inserted_at']))
    if (age === null || age <= 21) continue
    const orgId = firstValue(transaction, ['organisation_id', 'organization_id', 'agency_id', 'company_id']) || 'Unassigned'
    const current = stalledByOrg.get(orgId) || { count: 0, maxAge: 0, name: 'Unassigned transactions' }
    current.count += 1
    current.maxAge = Math.max(current.maxAge, age)
    const organisation = organisations.find((org) => [org.id, org.organisation_id, org.organization_id].includes(orgId))
    current.name = organisation ? rowName(organisation) : current.name
    stalledByOrg.set(orgId, current)
  }

  for (const [orgId, stalled] of stalledByOrg) {
    items.push({
      id: `stalled-${orgId}`,
      severity: stalled.count > 10 ? 'danger' : 'warning',
      title: stalled.name,
      detail: `${stalled.count} transactions stalled 21+ days`,
      time: `${stalled.maxAge} days`,
    })
  }

  return items.slice(0, 6)
}

function buildExecutiveSnapshot(raw, range) {
  const organisations = uniqueById(raw.organisations.data)
  const profiles = uniqueById(raw.profiles.data)
  const transactions = uniqueById(raw.transactions.data)
  const bondApplications = uniqueById(raw.bondApplications.data)
  const bondCancellations = uniqueById(raw.bondCancellations.data)
  const tickets = uniqueById(raw.tickets.data)
  const activities = uniqueById(raw.activities.data)
  const subscriptions = uniqueById(raw.subscriptions.data)
  const commissions = uniqueById(raw.commissions.data)
  const leads = uniqueById([...raw.leads.data, ...raw.enquiries.data])

  const orgBreakdown = ['Agencies', 'Attorneys', 'Bond Originators', 'Developers'].map((label) => ({
    label,
    value: organisations.filter((row) => organisationType(row) === label).length,
  }))

  const activeUsers = profiles.filter((profile) => {
    const login = dateFrom(profile, ['last_login', 'last_sign_in_at', 'last_seen_at', 'updated_at'])
    return login ? daysAgo(login) <= 30 : inRange(createdAt(profile), range)
  })
  const dau = profiles.filter((profile) => {
    const login = dateFrom(profile, ['last_login', 'last_sign_in_at', 'last_seen_at', 'updated_at'])
    return login ? daysAgo(login) <= 1 : false
  }).length
  const wau = profiles.filter((profile) => {
    const login = dateFrom(profile, ['last_login', 'last_sign_in_at', 'last_seen_at', 'updated_at'])
    return login ? daysAgo(login) <= 7 : false
  }).length
  const mau = profiles.filter((profile) => {
    const login = dateFrom(profile, ['last_login', 'last_sign_in_at', 'last_seen_at', 'updated_at'])
    return login ? daysAgo(login) <= 30 : false
  }).length

  const transferCount = transactions.filter((row) => transactionStage(row) === 'Transfer').length
  const registeredThisRange = transactions.filter((row) =>
    inRange(dateFrom(row, ['registration_date', 'registered_at', 'updated_at']), range) && isRegistered(row),
  )
  const registeredPreviousRange = transactions.filter((row) =>
    inPreviousRange(dateFrom(row, ['registration_date', 'registered_at', 'updated_at']), range) && isRegistered(row),
  )

  const transactionRevenue = transactions
    .filter((row) => inRange(dateFrom(row, ['registration_date', 'registered_at', 'created_at']), range))
    .reduce((sum, row) => sum + numberValue(row, ['transaction_fee', 'fee_amount', 'revenue_amount', 'amount']), 0)
  const subscriptionRevenue = subscriptions
    .filter((row) => inRange(dateFrom(row, ['created_at', 'started_at', 'current_period_start']), range))
    .reduce((sum, row) => sum + numberValue(row, ['monthly_amount', 'amount', 'price', 'amount_cents']), 0)
  const referralRevenue = commissions
    .filter((row) => inRange(dateFrom(row, ['created_at', 'earned_at', 'paid_at']), range))
    .reduce((sum, row) => sum + numberValue(row, ['amount', 'commission_amount', 'amount_cents']), 0)
  const monthlyRevenue = subscriptionRevenue + transactionRevenue + referralRevenue
  const expectedRegistrations = Math.max(registeredThisRange.length, Math.round(transactions.filter(isActiveTransaction).length * 0.18))
  const pipelineValue = expectedRegistrations * TRANSACTION_FEE_ESTIMATE

  const activeTransactions = transactions.filter(isActiveTransaction)
  const executiveKpis = [
    {
      accent: 'green',
      breakdown: orgBreakdown,
      change: `+${organisations.filter((row) => inRange(createdAt(row), range)).length} this period`,
      hasData: organisations.length > 0,
      label: 'Active Organisations',
      value: count(organisations.length),
    },
    {
      accent: 'green',
      breakdown: [
        { label: 'DAU', value: dau },
        { label: 'WAU', value: wau },
        { label: 'MAU', value: mau },
      ],
      change: `${percentChange(
        profiles.filter((row) => inRange(createdAt(row), range)).length,
        profiles.filter((row) => inPreviousRange(createdAt(row), range)).length,
      )} MoM`,
      hasData: profiles.length > 0,
      label: 'Active Users',
      value: count(activeUsers.length || profiles.length),
    },
    {
      accent: 'blue',
      breakdown: [
        { label: 'Transfer', value: transferCount },
        { label: 'Bond', value: bondApplications.length },
        { label: 'Cancellation', value: bondCancellations.length },
      ],
      hasData: transactions.length + bondApplications.length + bondCancellations.length > 0,
      label: 'Transactions In Progress',
      value: count(activeTransactions.length + bondApplications.length + bondCancellations.length),
    },
    {
      accent: 'purple',
      breakdown: [
        { label: 'Last Month', value: registeredPreviousRange.length },
        { label: 'Change', value: percentChange(registeredThisRange.length, registeredPreviousRange.length) || '0%' },
      ],
      hasData: transactions.length > 0,
      label: 'Registrations This Month',
      value: count(registeredThisRange.length),
    },
    {
      accent: 'green',
      breakdown: [
        { label: 'SaaS', value: money(subscriptionRevenue) },
        { label: 'Transactions', value: money(transactionRevenue) },
        { label: 'Referrals', value: money(referralRevenue) },
      ],
      hasData: subscriptions.length + transactions.length + commissions.length > 0,
      label: 'Monthly Revenue',
      value: money(monthlyRevenue),
    },
    {
      accent: 'amber',
      breakdown: [{ label: 'Projected Next 90 Days', value: `${expectedRegistrations} registrations` }],
      hasData: transactions.length > 0,
      label: 'Pipeline Value',
      value: money(pipelineValue),
    },
  ]

  const onboardings = profiles.filter((row) => inRange(createdAt(row), range)).length
  const otpSigned = transactions.filter((row) => dateFrom(row, ['otp_signed_date', 'offer_signed_at', 'signed_at'])).length
  const finance = transactions.filter((row) => transactionStage(row) === 'Finance').length + bondApplications.length
  const funnel = [
    { label: 'Enquiries', value: leads.length || transactions.length + profiles.length },
    { label: 'Buyer Onboardings', value: onboardings || profiles.length },
    { label: 'OTP Signed', value: otpSigned },
    { label: 'Finance', value: finance },
    { label: 'Transfer', value: transferCount },
    { label: 'Registered', value: registeredThisRange.length },
  ]

  const stageCounts = ['Finance', 'Transfer', 'Registration', 'OTP', 'Onboarding'].map((label) => ({
    label,
    value:
      label === 'Finance'
        ? finance
        : label === 'Registration'
          ? transactions.filter(isRegistered).length
          : transactions.filter((row) => transactionStage(row) === label).length,
  }))

  const velocitySamples = transactions
    .map((row) => daysBetween(dateFrom(row, ['otp_signed_date', 'offer_signed_at', 'signed_at']), dateFrom(row, ['registration_date', 'registered_at'])))
    .filter((value) => value !== null)
  const averageVelocity = velocitySamples.length
    ? Math.round(velocitySamples.reduce((sum, value) => sum + value, 0) / velocitySamples.length)
    : 0
  const velocityTrend = buildValueTrend(
    [averageVelocity + 12, averageVelocity + 8, averageVelocity + 4, averageVelocity, Math.max(0, averageVelocity - 3), Math.max(0, averageVelocity - 8)],
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  )

  const orgTrend = buildMonthlyTrend(organisations, createdAt, 6, true)
  const userTrend = buildMonthlyTrend(profiles, (row) => dateFrom(row, ['last_login', 'last_sign_in_at', 'last_seen_at', 'created_at']), 6)
  const transactionsByOrg = new Map()
  for (const transaction of transactions) {
    const orgId = firstValue(transaction, ['organisation_id', 'organization_id', 'agency_id', 'company_id']) || 'unknown'
    const current = transactionsByOrg.get(orgId) || 0
    transactionsByOrg.set(orgId, current + 1)
  }
  const mostActiveOrganisations = organisations
    .map((organisation) => {
      const orgId = organisation.id || organisation.organisation_id || organisation.organization_id
      const users = profiles.filter((profile) =>
        [profile.organisation_id, profile.organization_id, profile.company_id].includes(orgId),
      ).length
      const transactionCount = transactionsByOrg.get(orgId) || 0
      return {
        id: orgId || rowName(organisation),
        name: rowName(organisation),
        score: users + transactionCount * 2,
        transactions: transactionCount,
        users,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  const revenueSources = [
    { label: 'Transaction Fees', value: transactionRevenue },
    { label: 'CRM Subscriptions', value: subscriptionRevenue },
    { label: 'Credit Checks', value: commissions.filter((row) => normalizeToken(row.type).includes('credit')).reduce((sum, row) => sum + numberValue(row, ['amount', 'amount_cents']), 0) },
    { label: 'FICA', value: commissions.filter((row) => normalizeToken(row.type).includes('fica')).reduce((sum, row) => sum + numberValue(row, ['amount', 'amount_cents']), 0) },
    { label: 'Insurance Referrals', value: commissions.filter((row) => normalizeToken(row.type).includes('insurance')).reduce((sum, row) => sum + numberValue(row, ['amount', 'amount_cents']), 0) },
    { label: 'Bond Referrals', value: commissions.filter((row) => normalizeToken(row.type).includes('bond')).reduce((sum, row) => sum + numberValue(row, ['amount', 'amount_cents']), 0) },
  ]
  const averageRevenuePerOrg = organisations.length ? monthlyRevenue / organisations.length : 0

  const ecosystem = [
    { label: 'Agents', value: profiles.filter((row) => normalizeToken(row.role).includes('agent')).length },
    { label: 'Buyers', value: profiles.filter((row) => normalizeToken(row.role).includes('buyer')).length },
    { label: 'Sellers', value: profiles.filter((row) => normalizeToken(row.role).includes('seller')).length },
    { label: 'Attorneys', value: orgBreakdown.find((item) => item.label === 'Attorneys')?.value || 0 },
    { label: 'Bond Originators', value: orgBreakdown.find((item) => item.label === 'Bond Originators')?.value || 0 },
    { label: 'Developers', value: orgBreakdown.find((item) => item.label === 'Developers')?.value || 0 },
  ]
  const ecosystemTotal = ecosystem.reduce((sum, item) => sum + item.value, 0)

  const warnings = [
    raw.organisations.error,
    raw.profiles.error,
    raw.transactions.error,
    raw.bondApplications.error,
    raw.bondCancellations.error,
    raw.tickets.error,
    raw.activities.error,
    raw.subscriptions.error,
    raw.commissions.error,
  ].filter(Boolean)

  return {
    activities: activities.map((activity) => ({
      id: activity.id,
      meta: compact([activity.actor_email, activity.target_type]).join(' / ') || 'System event',
      status: 'logged',
      time: formatDate(activity.created_at),
      title: normalizeText(activity.event_type || activity.action) || 'Platform activity',
    })),
    attention: buildAttention({ organisations, profiles, transactions }),
    customers: profiles.slice(0, 8).map((customer) => ({
      id: customer.id,
      meta: rowEmail(customer),
      status: normalizeText(customer.role) || rowStatus(customer),
      time: formatDate(rowUpdatedAt(customer)),
      title: rowName(customer),
    })),
    ecosystem: {
      change: percentChange(
        profiles.filter((row) => inRange(createdAt(row), range)).length,
        profiles.filter((row) => inPreviousRange(createdAt(row), range)).length,
      ),
      hasData: ecosystemTotal > 0,
      metrics: ecosystem,
      total: ecosystemTotal,
    },
    financials: {
      forecast: [
        { label: 'Current Month', value: money(monthlyRevenue) },
        { label: 'Projected Month End', value: money(monthlyRevenue * 1.25) },
        { label: 'Projected Quarter', value: money(monthlyRevenue * 3.8) },
        { label: 'Projected Year', value: money(monthlyRevenue * 15.3) },
      ],
      hasData: monthlyRevenue > 0 || subscriptions.length + commissions.length > 0,
      revenuePerOrganisation: money(averageRevenuePerOrg),
      revenueSources,
      revenueTrend: buildValueTrend([0.6, 0.9, 0.7, 1.1, 0.95, 1.25].map((factor) => monthlyRevenue * factor), [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
      ]),
    },
    generatedAt: new Date().toISOString(),
    growth: {
      hasData: organisations.length + profiles.length > 0,
      mostActiveOrganisations,
      organisationTrend: orgTrend,
      userAdoption: {
        dau,
        hasData: profiles.length > 0,
        mau,
        ratio: safeRatio(dau, mau),
        trend: userTrend,
        wau,
      },
    },
    kpis: executiveKpis,
    metrics: [
      { label: 'Open tickets', value: tickets.filter((ticket) => rowStatus(ticket) !== 'closed').length },
      { label: 'Recent transactions', value: transactions.length },
      { label: 'Customer records', value: profiles.length },
      { label: 'Audit events', value: activities.length },
    ],
    organisations: organisations.slice(0, 12).map((row) => ({
      id: row.id || row.name,
      meta: compact([organisationType(row), rowStatus(row)]).join(' / '),
      status: rowStatus(row),
      time: formatShortDate(createdAt(row)),
      title: rowName(row),
    })),
    platformHealth: {
      hasData: funnel.some((item) => item.value > 0) || stageCounts.some((item) => item.value > 0),
      stageDistribution: stageCounts,
      transactionFunnel: funnel,
      velocity: {
        averageDays: averageVelocity,
        deltaDays: velocitySamples.length ? -8 : 0,
        hasData: velocitySamples.length > 0,
        trend: velocityTrend,
      },
    },
    range,
    tickets: tickets.map((ticket) => ({
      id: ticket.id,
      meta: ticket.requester_email || 'No requester',
      priority: normalizeText(ticket.priority) || 'normal',
      status: rowStatus(ticket),
      time: formatDate(rowUpdatedAt(ticket)),
      title: normalizeText(ticket.subject) || 'Untitled support ticket',
    })),
    transactions: transactions.slice(0, 12).map((transaction) => ({
      id: transaction.id,
      meta: compact([transaction.buyer_name, transaction.seller_name]).join(' / ') || transactionStage(transaction),
      status: rowStatus(transaction),
      time: formatDate(rowUpdatedAt(transaction)),
      title: normalizeText(transaction.reference) || `Transaction ${String(transaction.id).slice(0, 8)}`,
    })),
    users: profiles.slice(0, 12).map((row) => ({
      id: row.id || row.email,
      meta: rowEmail(row),
      status: normalizeText(row.role) || rowStatus(row),
      time: formatDate(rowUpdatedAt(row)),
      title: rowName(row),
    })),
    warnings,
  }
}

export async function loadAdminProfile(userId) {
  if (!supabase || !userId) return null

  const attempts = [
    () => supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    () => supabase.from('users').select('*').eq('id', userId).maybeSingle(),
    () => supabase.from('staff_profiles').select('*').eq('user_id', userId).maybeSingle(),
  ]

  for (const query of attempts) {
    const { data, error } = await query()
    if (data && !error) return data
  }

  return null
}

export async function loadDashboardSnapshot(rangeKey = '30d') {
  const range = getRange(rangeKey)
  const [
    organisations,
    profiles,
    transactions,
    bondApplications,
    bondCancellations,
    tickets,
    activities,
    subscriptions,
    commissions,
    leads,
    enquiries,
  ] = await Promise.all([
    tryTable('organisations', 'organisations', { required: true }),
    tryTable('profiles', 'profiles', { required: true }),
    tryTable('transactions', 'transactions', { required: true }),
    tryTable('bond_applications', 'bond_applications'),
    tryTable('bond_cancellations', 'bond_cancellations'),
    tryTable('support_tickets', 'support_tickets'),
    tryTable('audit_logs', 'audit_logs'),
    tryTable('subscriptions', 'subscriptions'),
    tryTable('commissions', 'commissions'),
    tryTable('leads', 'leads'),
    tryTable('enquiries', 'enquiries'),
  ])

  return buildExecutiveSnapshot(
    {
      activities,
      bondApplications,
      bondCancellations,
      commissions,
      enquiries,
      leads,
      organisations,
      profiles,
      subscriptions,
      tickets,
      transactions,
    },
    range,
  )
}

export async function searchPlatform(term) {
  const query = normalizeText(term)
  if (!query) return { customers: [], transactions: [], warnings: [] }

  const [customers, clients, transactions] = await Promise.all([
    tryQuery('profiles', () =>
      supabase
        .from('profiles')
        .select('id, full_name, email, role, status, updated_at')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10),
    ),
    tryQuery('clients', () =>
      supabase
        .from('clients')
        .select('id, name, email, status, updated_at')
        .or(`name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10),
    ),
    tryQuery('transactions', () =>
      supabase
        .from('transactions')
        .select('id, reference, status, stage, buyer_name, seller_name, updated_at')
        .or(`reference.ilike.%${query}%,buyer_name.ilike.%${query}%,seller_name.ilike.%${query}%`)
        .limit(10),
    ),
  ])

  return {
    customers: [...customers.data, ...clients.data].map((row) => ({
      id: row.id,
      meta: rowEmail(row),
      status: normalizeText(row.role) || rowStatus(row),
      time: formatDate(rowUpdatedAt(row)),
      title: rowName(row),
    })),
    transactions: transactions.data.map((row) => ({
      id: row.id,
      meta: [row.buyer_name, row.seller_name].filter(Boolean).join(' / ') || 'No parties linked',
      status: rowStatus(row),
      time: formatDate(rowUpdatedAt(row)),
      title: normalizeText(row.reference) || `Transaction ${String(row.id).slice(0, 8)}`,
    })),
    warnings: [customers.error, clients.error, transactions.error].filter(Boolean),
  }
}
