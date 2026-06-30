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
const LEGAL_TEMPLATES_BUCKET = 'legal-templates'

const LEGAL_TEMPLATE_COLUMNS =
  'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, template_storage_bucket, template_storage_path, template_file_name, version_tag, description, status, is_default, is_active, metadata_json, change_summary, content_hash, created_by, updated_by, published_by, published_at, archived_by, archived_at, created_at, updated_at'

const LEGACY_LEGAL_TEMPLATE_COLUMNS =
  'id, organisation_id, module_type, packet_type, template_key, template_label, template_format, template_storage_path, version_tag, description, is_default, is_active, metadata_json, created_by, created_at, updated_at'

const LEGAL_TEMPLATE_VERSION_COLUMNS =
  'id, template_id, organisation_id, module_type, packet_type, template_key, template_label, template_format, version_tag, status, storage_bucket, storage_path, file_name, content_hash, description, change_summary, sections_snapshot_json, placeholder_keys, metadata_json, created_by, updated_by, published_by, archived_by, created_at, updated_at, published_at, archived_at'

const LEGAL_TEMPLATE_READINESS_REQUIREMENTS = [
  { moduleType: 'residential', packetType: 'mandate', label: 'Residential mandate' },
  { moduleType: 'residential', packetType: 'otp', label: 'Residential OTP' },
  { moduleType: 'commercial', packetType: 'commercial_lease', label: 'Commercial lease' },
  { moduleType: 'commercial', packetType: 'commercial_sale', label: 'Commercial sale' },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeToken(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeKey(value = '', fallback = 'template') {
  const normalized = normalizeToken(value).replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  return normalized || fallback
}

function normalizeStorageName(value = '', fallback = 'template.docx') {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
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

function uniqueByInviteIdentity(rows = []) {
  const seen = new Set()
  return rows.filter((row) => {
    const identity =
      normalizeText(firstValue(row, ['email', 'invited_email', 'recipient_email', 'user_email']) || '').toLowerCase() ||
      firstValue(row, ['user_id', 'profile_id', 'id']) ||
      JSON.stringify(row)
    if (seen.has(identity)) return false
    seen.add(identity)
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

function organisationName(row = {}) {
  return (
    normalizeText(row.name) ||
    normalizeText(row.organisation_name) ||
    normalizeText(row.organization_name) ||
    normalizeText(row.company_name) ||
    normalizeText(row.trading_name) ||
    `Organisation ${String(row.id || '').slice(0, 8)}`
  )
}

function rowRole(row = {}) {
  const value = normalizeText(
    firstValue(row, [
      '_invite_role',
      'role',
      'user_role',
      'invited_role',
      'app_role',
      'profile_role',
      'organisation_role',
      'organization_role',
      'workspace_role',
      'target_workspace_role',
      'target_transaction_role',
      'role_type',
      'relationship_type',
      'portal_role',
      'invite_type',
      'type',
    ]),
  )
  if (!value) return 'Unknown'
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function invitationRows(rows = [], source, fallbackRole = 'Invited User') {
  return rows.map((row) => ({
    ...row,
    _invitation_source: source,
    email: firstValue(row, ['email', 'invited_email', 'recipient_email', 'user_email']) || row.email,
    invited_at:
      firstValue(row, ['invited_at', 'invitation_sent_at', 'sent_at', 'first_invited_at', 'last_invited_at', 'created_at']) ||
      row.invited_at,
    invited_role:
      firstValue(row, [
        'invited_role',
        'role',
        'user_role',
        'app_role',
        'profile_role',
        'organisation_role',
        'organization_role',
        'workspace_role',
        'target_workspace_role',
        'target_transaction_role',
        'role_type',
        'relationship_type',
        'portal_role',
        'invite_type',
      ]) || fallbackRole,
  }))
}

function roleplayerType(row = {}) {
  const type = normalizeToken(firstValue(row, ['organisation_type', 'organization_type', 'type', 'category', 'role']))
  if (type.includes('attorney') || type.includes('conveyancer')) return 'Attorney'
  if (type.includes('bond') || type.includes('originator') || type.includes('finance')) return 'Bond Originator'
  if (type.includes('developer')) return 'Developer'
  if (type.includes('insurance')) return 'Insurance Partner'
  if (type.includes('bank')) return 'Bank'
  if (type.includes('agency') || type.includes('agent')) return 'Agency'
  return 'Other'
}

function roleplayerTypeKey(value = '') {
  return normalizeToken(value).replace(/s$/, '')
}

function organisationId(row = {}) {
  return firstValue(row, ['id', 'organisation_id', 'organization_id', 'company_id', 'agency_id'])
}

function linkedOrganisationId(row = {}) {
  return firstValue(row, ['organisation_id', 'organization_id', 'company_id', 'agency_id', 'partner_id', 'firm_id'])
}

function rowLogo(row = {}) {
  return normalizeText(firstValue(row, ['logo_url', 'logoUrl', 'avatar_url', 'image_url', 'brand_logo_url', 'photo_url']))
}

function initialsFor(value = '') {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'A9'
}

function relativeTime(value) {
  const date = asDate(value)
  if (!date) return 'No activity'
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
  if (minutes < 60) return minutes <= 1 ? 'Just now' : `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return days === 1 ? '1 day ago' : `${days} days ago`
  return formatShortDate(date)
}

function matchesOrganisation(row = {}, orgId) {
  if (!orgId) return false
  return linkedOrganisationId(row) === orgId || organisationId(row) === orgId
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

function isMissingSchemaError(error = {}) {
  const code = normalizeText(error.code).toUpperCase()
  const message = normalizeText(error.message).toLowerCase()
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('schema cache') ||
    message.includes('could not find the table')
  )
}

async function tryOptionalQuery(label, queryFactory) {
  if (!supabase) return { data: [], error: null, skipped: true }
  try {
    const { data, error } = await queryFactory()
    if (error) {
      return { data: [], error: isMissingSchemaError(error) ? null : { label, message: error.message } }
    }
    return { data: Array.isArray(data) ? data : [], error: null }
  } catch (error) {
    return { data: [], error: isMissingSchemaError(error) ? null : { label, message: error?.message || 'Query failed' } }
  }
}

async function queryOrganisationsForAdmin() {
  return tryQuery('organisations', () =>
    supabase
      .from('organisations')
      .select('*')
      .limit(1000),
  )
}

async function queryLegalTemplateRows({ organisationId = '', moduleType = '', packetType = '', limit = 500 } = {}) {
  const buildQuery = (columns) => {
    let builder = supabase
      .from('document_packet_templates')
      .select(columns)
      .order('updated_at', { ascending: false })
      .limit(limit)
    if (organisationId) builder = builder.eq('organisation_id', organisationId)
    if (moduleType) builder = builder.eq('module_type', moduleType)
    if (packetType) builder = builder.eq('packet_type', packetType)
    return builder
  }

  const modern = await tryQuery('document_packet_templates', () => buildQuery(LEGAL_TEMPLATE_COLUMNS))
  if (!modern.error) return modern
  if (!isMissingSchemaError(modern.error)) return modern
  return tryQuery('document_packet_templates', () => buildQuery(LEGACY_LEGAL_TEMPLATE_COLUMNS))
}

async function queryLegalTemplateVersions({ templateId = '', limit = 1000 } = {}) {
  return tryOptionalQuery('document_packet_template_versions', () => {
    let builder = supabase
      .from('document_packet_template_versions')
      .select(LEGAL_TEMPLATE_VERSION_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (templateId) builder = builder.eq('template_id', templateId)
    return builder
  })
}

async function queryLegalTemplateAudit({ templateId = '', limit = 50 } = {}) {
  return tryOptionalQuery('document_packet_template_audit', () => {
    let builder = supabase
      .from('document_packet_template_audit')
      .select('id, template_id, template_version_id, organisation_id, module_type, packet_type, event_type, actor_user_id, actor_role, change_summary, event_payload_json, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (templateId) builder = builder.eq('template_id', templateId)
    return builder
  })
}

async function tryRpc(label, functionName, args = {}) {
  if (!supabase) return { data: null, error: null, skipped: true }
  try {
    const { data, error } = await supabase.rpc(functionName, args)
    if (error) return { data: null, error: { label, message: error.message } }
    return { data, error: null }
  } catch (error) {
    return { data: null, error: { label, message: error?.message || 'RPC failed' } }
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

function buildRoleplayerWorkspaces(type, counts = {}) {
  if (type === 'Attorney') {
    return [
      { label: 'Transfer Matters', value: counts.transfer || counts.transactions || 0, meta: 'active' },
      { label: 'Bond Matters', value: counts.bond || 0, meta: 'active' },
      { label: 'Cancellation Matters', value: counts.cancellation || 0, meta: 'active' },
      { label: 'Documents', value: counts.documents || 0, meta: 'files' },
      { label: 'SLA Performance', value: counts.sla || 95, meta: '% on time' },
    ]
  }
  if (type === 'Bond Originator') {
    return [
      { label: 'Applications', value: counts.applications || 0, meta: 'active' },
      { label: 'Bank Submissions', value: counts.submissions || counts.applications || 0, meta: 'sent' },
      { label: 'Approvals', value: counts.approvals || 0, meta: 'approved' },
      { label: 'Declines', value: counts.declines || 0, meta: 'declined' },
      { label: 'Consultants', value: counts.users || 0, meta: 'users' },
    ]
  }
  if (type === 'Developer') {
    return [
      { label: 'Developments', value: counts.developments || 0, meta: 'active' },
      { label: 'Units', value: counts.units || 0, meta: 'listed' },
      { label: 'Buyers', value: counts.buyers || 0, meta: 'active' },
      { label: 'Sales', value: counts.sales || 0, meta: 'month' },
      { label: 'Transactions', value: counts.transactions || 0, meta: 'active' },
    ]
  }
  if (type === 'Insurance Partner') {
    return [
      { label: 'Leads', value: counts.leads || 0, meta: 'active' },
      { label: 'Quotes', value: counts.quotes || 0, meta: 'sent' },
      { label: 'Policies', value: counts.policies || 0, meta: 'active' },
      { label: 'Revenue', value: money(counts.revenue || 0), meta: 'month' },
      { label: 'Performance', value: counts.performance || 0, meta: '% conversion' },
    ]
  }
  return [
    { label: 'Leads', value: counts.leads || 0, meta: 'active' },
    { label: 'Listings', value: counts.listings || 0, meta: 'live' },
    { label: 'Transactions', value: counts.transactions || 0, meta: 'active' },
    { label: 'Buyer Leads', value: counts.buyers || 0, meta: 'open' },
    { label: 'Seller Leads', value: counts.sellers || 0, meta: 'open' },
    { label: 'Appointments', value: counts.appointments || 0, meta: 'scheduled' },
  ]
}

function buildRoleplayers({ activities, bondApplications, bondCancellations, commissions, leads, organisations, profiles, subscriptions, tickets, transactions }, range) {
  return organisations.map((organisation) => {
    const id = organisationId(organisation) || rowName(organisation)
    const type = roleplayerType(organisation)
    const users = profiles.filter((profile) => matchesOrganisation(profile, id))
    const orgTransactions = transactions.filter((transaction) => matchesOrganisation(transaction, id))
    const orgBondApplications = bondApplications.filter((application) => matchesOrganisation(application, id))
    const orgCancellations = bondCancellations.filter((cancellation) => matchesOrganisation(cancellation, id))
    const orgTickets = tickets.filter((ticket) => matchesOrganisation(ticket, id))
    const orgLeads = leads.filter((lead) => matchesOrganisation(lead, id))
    const orgActivities = activities.filter((activity) => matchesOrganisation(activity, id))
    const activeTransactions = orgTransactions.filter(isActiveTransaction)
    const transferTransactions = orgTransactions.filter((transaction) => transactionStage(transaction) === 'Transfer')
    const financeTransactions = orgTransactions.filter((transaction) => transactionStage(transaction) === 'Finance')
    const registeredTransactions = orgTransactions.filter(isRegistered)
    const orgSubscriptions = subscriptions.filter((row) => matchesOrganisation(row, id))
    const latestSubscription = orgSubscriptions
      .slice()
      .sort((left, right) => (latestDate(right)?.getTime() || 0) - (latestDate(left)?.getTime() || 0))[0]
    const revenue =
      orgTransactions
        .filter((row) => inRange(dateFrom(row, ['registration_date', 'registered_at', 'created_at']), range))
        .reduce((sum, row) => sum + numberValue(row, ['transaction_fee', 'fee_amount', 'revenue_amount', 'amount']), 0) +
      orgSubscriptions
        .filter((row) => inRange(dateFrom(row, ['created_at', 'started_at', 'current_period_start']), range))
        .reduce((sum, row) => sum + numberValue(row, ['monthly_amount', 'amount', 'price', 'amount_cents']), 0) +
      commissions
        .filter((row) => matchesOrganisation(row, id) && inRange(dateFrom(row, ['created_at', 'earned_at', 'paid_at']), range))
        .reduce((sum, row) => sum + numberValue(row, ['amount', 'commission_amount', 'amount_cents']), 0)

    const lastUserActivity = users
      .map((user) => dateFrom(user, ['last_login', 'last_sign_in_at', 'last_seen_at', 'updated_at', 'created_at']))
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime())[0]
    const lastTransactionActivity = orgTransactions
      .map((transaction) => dateFrom(transaction, ['updated_at', 'created_at']))
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime())[0]
    const lastActivity = [lastUserActivity, lastTransactionActivity, latestDate(organisation)]
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime())[0]
    const noLoginDays = lastUserActivity ? daysAgo(lastUserActivity) : daysAgo(createdAt(organisation))
    const stalledTransactions = activeTransactions.filter((transaction) => {
      const age = daysAgo(dateFrom(transaction, ['updated_at', 'created_at', 'inserted_at']))
      return age !== null && age > 21
    })
    const openIssues = orgTickets.filter((ticket) => !normalizeToken(rowStatus(ticket)).includes('closed')).length
    const healthTone = noLoginDays > 30 || stalledTransactions.length > 8 ? 'danger' : noLoginDays > 14 || stalledTransactions.length > 0 || openIssues > 3 ? 'warning' : 'success'
    const healthLabel = healthTone === 'danger' ? 'At Risk' : healthTone === 'warning' ? 'Needs Attention' : 'Good'
    const healthScore = healthTone === 'danger' ? 52 : healthTone === 'warning' ? 74 : 92
    const healthReason = healthTone === 'danger'
      ? 'Stalled work or login inactivity needs immediate review'
      : healthTone === 'warning'
        ? 'A few activity or support signals need attention'
        : 'No immediate risks detected'
    const activeWorkloadLabel =
      type === 'Attorney'
        ? 'Active Matters'
        : type === 'Bond Originator'
          ? 'Active Applications'
          : type === 'Developer'
            ? 'Active Developments'
            : type === 'Insurance Partner'
              ? 'Active Policies'
              : 'Active Transactions'
    const activeWorkload =
      type === 'Bond Originator'
        ? orgBondApplications.length
        : type === 'Attorney'
          ? transferTransactions.length + financeTransactions.length + orgCancellations.length
          : activeTransactions.length
    const workspaceCounts = {
      applications: orgBondApplications.length,
      approvals: orgBondApplications.filter((row) => normalizeToken(rowStatus(row)).includes('approved')).length,
      bond: financeTransactions.length + orgBondApplications.length,
      buyers: orgLeads.filter((row) => normalizeToken(firstValue(row, ['type', 'lead_type', 'role']) || '').includes('buyer')).length,
      cancellation: orgCancellations.length,
      declines: orgBondApplications.filter((row) => normalizeToken(rowStatus(row)).includes('declined')).length,
      documents: Number(firstValue(organisation, ['document_count', 'documents_count']) || 0),
      leads: orgLeads.length,
      revenue,
      sales: registeredTransactions.length,
      sellers: orgLeads.filter((row) => normalizeToken(firstValue(row, ['type', 'lead_type', 'role']) || '').includes('seller')).length,
      sla: Number(firstValue(organisation, ['sla_score', 'sla_performance']) || 95),
      transactions: activeTransactions.length,
      transfer: transferTransactions.length,
      users: users.length,
    }

    const activityFeed = [
      ...orgActivities.map((activity) => ({
        id: activity.id || `${id}-activity-${activity.created_at}`,
        text: normalizeText(activity.event_type || activity.action) || 'Organisation activity logged',
        time: relativeTime(activity.created_at),
        tone: 'neutral',
      })),
      ...orgTransactions.slice(0, 5).map((transaction) => ({
        id: transaction.id || `${id}-transaction`,
        text: `${rowName(transaction)} moved to ${transactionStage(transaction)}`,
        time: relativeTime(rowUpdatedAt(transaction)),
        tone: transactionStage(transaction) === 'Finance' ? 'blue' : 'green',
      })),
      ...users.slice(0, 4).map((user) => ({
        id: user.id || `${id}-${user.email}`,
        text: `${rowName(user)} ${dateFrom(user, ['last_login', 'last_sign_in_at']) ? 'logged in' : 'joined the workspace'}`,
        time: relativeTime(dateFrom(user, ['last_login', 'last_sign_in_at', 'created_at'])),
        tone: 'green',
      })),
    ]
      .sort((a, b) => {
        const left = a.time === 'No activity' ? 1 : 0
        const right = b.time === 'No activity' ? 1 : 0
        return left - right
      })
      .slice(0, 6)

    return {
      activeWorkload,
      activeWorkloadLabel,
      address: normalizeText(firstValue(organisation, ['address', 'physical_address', 'street_address', 'registered_address'])) || '',
      activityFeed,
      arrDisplay: money(revenue * 12),
      billing: {
        billingCycle: normalizeText(firstValue(latestSubscription, ['billing_cycle', 'interval', 'cycle'])) || 'Monthly',
        billingEmail: normalizeText(firstValue(organisation, ['billing_email', 'accounts_email', 'invoice_email'])) || rowEmail(organisation),
        nextBillingDate: formatShortDate(dateFrom(latestSubscription, ['current_period_end', 'next_billing_date', 'renewal_date'])),
        outstandingBalance: money(numberValue(latestSubscription, ['outstanding_amount', 'balance_due', 'amount_due', 'overdue_amount'])),
        paymentMethodStatus: normalizeText(firstValue(latestSubscription, ['payment_method_status', 'card_status'])) || 'Valid',
        plan: normalizeText(firstValue(organisation, ['subscription_plan', 'plan', 'billing_plan'])) || 'Not set',
        revenue: money(revenue),
        subscriptionFees: money(
          orgSubscriptions.reduce((sum, row) => sum + numberValue(row, ['monthly_amount', 'amount', 'price', 'amount_cents']), 0),
        ),
        subscriptionStatus: normalizeText(rowStatus(latestSubscription)) || normalizeText(rowStatus(organisation)) || 'Active',
        transactionFees: money(
          orgTransactions.reduce((sum, row) => sum + numberValue(row, ['transaction_fee', 'fee_amount', 'revenue_amount', 'amount']), 0),
        ),
      },
      billingEmail: normalizeText(firstValue(organisation, ['billing_email', 'accounts_email', 'invoice_email'])) || rowEmail(organisation),
      health: { label: healthLabel, tone: healthTone },
      healthReason,
      healthScore,
      id,
      initials: initialsFor(rowName(organisation)),
      contactEmail: rowEmail(organisation),
      contactPhone: normalizeText(firstValue(organisation, ['phone', 'contact_phone', 'telephone', 'mobile'])) || '',
      createdAt: createdAt(organisation)?.toISOString?.() || '',
      joinedDate: formatShortDate(createdAt(organisation)),
      lastActivity: relativeTime(lastActivity),
      logoUrl: rowLogo(organisation),
      name: rowName(organisation),
      openIssues,
      organisationId: id,
      industry: normalizeText(firstValue(organisation, ['industry', 'sector', 'category'])) || 'Real Estate',
      primaryContactEmail: normalizeText(firstValue(organisation, ['primary_contact_email', 'owner_email', 'admin_email'])) || '',
      primaryContactName: normalizeText(firstValue(organisation, ['primary_contact_name', 'owner_name', 'admin_name'])) || '',
      registrationNumber: normalizeText(firstValue(organisation, ['registration_number', 'company_registration_number', 'reg_number'])) || '',
      revenue,
      revenueDisplay: money(revenue),
      status: rowStatus(organisation),
      subscriptionPlan: normalizeText(firstValue(organisation, ['subscription_plan', 'plan', 'billing_plan'])) || 'Not set',
      vatNumber: normalizeText(firstValue(organisation, ['vat_number', 'tax_number'])) || '',
      website: normalizeText(firstValue(organisation, ['website', 'website_url', 'url'])) || '',
      transactions: orgTransactions.slice(0, 12).map((transaction) => ({
        id: transaction.id,
        assigned: normalizeText(firstValue(transaction, ['assigned_user_name', 'agent_name', 'attorney_name'])) || 'Unassigned',
        buyer: normalizeText(firstValue(transaction, ['buyer_name', 'buyer_full_name'])) || 'No buyer',
        createdDate: formatShortDate(createdAt(transaction)),
        lastActivity: relativeTime(rowUpdatedAt(transaction)),
        property: normalizeText(firstValue(transaction, ['property_address', 'address', 'listing_title', 'property'])) || 'No property linked',
        reference: normalizeText(transaction.reference) || `Transaction ${String(transaction.id).slice(0, 8)}`,
        revenue: money(numberValue(transaction, ['transaction_fee', 'fee_amount', 'revenue_amount', 'amount'])),
        seller: normalizeText(firstValue(transaction, ['seller_name', 'seller_full_name'])) || 'No seller',
        stage: transactionStage(transaction),
        status: rowStatus(transaction),
      })),
      type,
      typeKey: roleplayerTypeKey(type),
      users: users.slice(0, 12).map((user) => ({
        id: user.id || user.email,
        branch: normalizeText(firstValue(user, ['branch', 'office', 'region'])) || 'Main',
        createdDate: formatShortDate(createdAt(user)),
        email: rowEmail(user),
        lastLogin: relativeTime(dateFrom(user, ['last_login', 'last_sign_in_at', 'last_seen_at'])),
        name: rowName(user),
        permissionLevel: normalizeText(firstValue(user, ['permission_level', 'admin_level', 'access_level'])) || rowRole(user),
        role: rowRole(user),
        status: rowStatus(user),
      })),
      userCount: users.length,
      workspaceCards: buildRoleplayerWorkspaces(type, workspaceCounts),
    }
  })
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
  const invitedSummary = raw.invitedUsersSummary.data || null
  const invitationTables = uniqueByInviteIdentity([
    ...invitationRows(raw.userInvitations.data, 'user_invitations'),
    ...invitationRows(raw.invitations.data, 'invitations'),
    ...invitationRows(raw.invites.data, 'invites'),
    ...invitationRows(raw.partnerInvitations.data, 'partner_invitations', 'Partner'),
    ...invitationRows(raw.transactionPartnerInvitations.data, 'transaction_partner_invitations', 'Transaction Partner'),
    ...invitationRows(raw.bondPartnerInvitations.data, 'bond_partner_invitations', 'Bond Partner'),
    ...invitationRows(raw.attorneyFirmInvitations.data, 'attorney_firm_invitations', 'Attorney'),
    ...invitationRows(raw.organisationUsers.data, 'organisation_users'),
    ...invitationRows(raw.branchMembers.data, 'branch_members'),
  ])
  const profileInvitations = profiles.filter((profile) => {
    const status = normalizeToken(rowStatus(profile))
    return Boolean(
      dateFrom(profile, ['invited_at', 'invitation_sent_at', 'invitedAt', 'invited_on']) ||
        status.includes('invite') ||
        status.includes('pending_invitation'),
    )
  })
  const invitedUniverse = uniqueByInviteIdentity([...invitationTables, ...profileInvitations])
  const invitedUsers = invitedUniverse.filter((row) =>
    inRange(dateFrom(row, ['invited_at', 'invitation_sent_at', 'sent_at', 'invitedAt', 'invited_on', 'created_at']), range),
  )
  const previousInvitedUsers = invitedUniverse.filter((row) =>
    inPreviousRange(dateFrom(row, ['invited_at', 'invitation_sent_at', 'sent_at', 'invitedAt', 'invited_on', 'created_at']), range),
  )
  const invitedRoleBreakdown = Object.entries(
    invitedUsers.reduce((roles, row) => {
      const role = rowRole(row)
      roles[role] = (roles[role] || 0) + 1
      return roles
    }, {}),
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 4)
  const invitedCurrentCount = Number.isFinite(Number(invitedSummary?.current)) ? Number(invitedSummary.current) : invitedUsers.length
  const invitedPreviousCount = Number.isFinite(Number(invitedSummary?.previous))
    ? Number(invitedSummary.previous)
    : previousInvitedUsers.length
  const invitedTotalCount = Number.isFinite(Number(invitedSummary?.total)) ? Number(invitedSummary.total) : invitedUniverse.length
  const invitedBreakdown = Array.isArray(invitedSummary?.roles) && invitedSummary.roles.length
    ? invitedSummary.roles
    : invitedRoleBreakdown

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
  const previousTransactionRevenue = transactions
    .filter((row) => inPreviousRange(dateFrom(row, ['registration_date', 'registered_at', 'created_at']), range))
    .reduce((sum, row) => sum + numberValue(row, ['transaction_fee', 'fee_amount', 'revenue_amount', 'amount']), 0)
  const previousSubscriptionRevenue = subscriptions
    .filter((row) => inPreviousRange(dateFrom(row, ['created_at', 'started_at', 'current_period_start']), range))
    .reduce((sum, row) => sum + numberValue(row, ['monthly_amount', 'amount', 'price', 'amount_cents']), 0)
  const previousReferralRevenue = commissions
    .filter((row) => inPreviousRange(dateFrom(row, ['created_at', 'earned_at', 'paid_at']), range))
    .reduce((sum, row) => sum + numberValue(row, ['amount', 'commission_amount', 'amount_cents']), 0)
  const previousMonthlyRevenue = previousTransactionRevenue + previousSubscriptionRevenue + previousReferralRevenue
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
      breakdown: invitedBreakdown,
      change: `${percentChange(invitedCurrentCount, invitedPreviousCount) || '0%'} vs previous`,
      hasData: invitedTotalCount > 0,
      label: 'Invited Users',
      value: count(invitedCurrentCount),
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

  const newOrganisations = organisations.filter((row) => inRange(createdAt(row), range))
  const previousNewOrganisations = organisations.filter((row) => inPreviousRange(createdAt(row), range))
  const newProfiles = profiles.filter((row) => inRange(createdAt(row), range))
  const previousNewProfiles = profiles.filter((row) => inPreviousRange(createdAt(row), range))
  const transactionsCreatedThisRange = transactions.filter((row) => inRange(createdAt(row), range))
  const transactionsCreatedPreviousRange = transactions.filter((row) => inPreviousRange(createdAt(row), range))
  const activatedOrganisations = organisations.filter((organisation) => {
    const orgId = organisationId(organisation)
    return Boolean(
      profiles.some((profile) => matchesOrganisation(profile, orgId)) ||
        transactions.some((transaction) => matchesOrganisation(transaction, orgId)) ||
        normalizeToken(rowStatus(organisation)).includes('active'),
    )
  })
  const acquisitionSourceMap = invitedUsers.reduce((sources, row) => {
    const rawSource = firstValue(row, ['_invitation_source', 'source', 'invite_source', 'channel', 'type']) || 'Direct Invite'
    const label = normalizeText(rawSource).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
    sources[label] = (sources[label] || 0) + 1
    return sources
  }, {})
  const acquisitionSources = Object.entries(acquisitionSourceMap)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
  if (!acquisitionSources.length && profiles.length) acquisitionSources.push({ label: 'Existing Users', value: profiles.length })

  const roleLabels = ['Agents', 'Attorneys', 'Bond Originators', 'Developers', 'Administrators', 'Buyers', 'Sellers', 'Other']
  const roleGrowth = roleLabels.map((label) => {
    const token = normalizeToken(label).replace(/s$/, '')
    const value = profiles.filter((profile) => {
      const role = normalizeToken(rowRole(profile))
      if (label === 'Other') return !roleLabels.slice(0, -1).some((candidate) => role.includes(normalizeToken(candidate).replace(/s$/, '')))
      return role.includes(token)
    }).length
    return { label, value }
  }).filter((item) => item.value > 0 || item.label !== 'Other')
  if (!roleGrowth.some((item) => item.value > 0) && profiles.length) roleGrowth.push({ label: 'Users', value: profiles.length })

  const topGrowingOrganisations = organisations
    .map((organisation) => {
      const orgId = organisationId(organisation)
      const orgUsers = profiles.filter((profile) => matchesOrganisation(profile, orgId))
      const orgNewUsers = orgUsers.filter((profile) => inRange(createdAt(profile), range)).length
      const orgPreviousUsers = orgUsers.filter((profile) => inPreviousRange(createdAt(profile), range)).length
      const orgTransactions = transactions.filter((transaction) => matchesOrganisation(transaction, orgId))
      const revenue =
        orgTransactions.reduce((sum, row) => sum + numberValue(row, ['transaction_fee', 'fee_amount', 'revenue_amount', 'amount']), 0) +
        subscriptions
          .filter((row) => matchesOrganisation(row, orgId))
          .reduce((sum, row) => sum + numberValue(row, ['monthly_amount', 'amount', 'price', 'amount_cents']), 0) +
        commissions
          .filter((row) => matchesOrganisation(row, orgId))
          .reduce((sum, row) => sum + numberValue(row, ['amount', 'commission_amount', 'amount_cents']), 0)
      const growthValue = Math.max(orgNewUsers, orgUsers.length)
      return {
        growth: percentChange(orgNewUsers, orgPreviousUsers) || (orgNewUsers ? '+100%' : '0%'),
        id: orgId || rowName(organisation),
        lastActivity: relativeTime(latestDate(organisation)),
        name: rowName(organisation),
        newUsers: orgNewUsers,
        revenue,
        revenueDisplay: money(revenue),
        transactions: orgTransactions.length,
        trend: buildValueTrend(
          [0.3, 0.45, 0.52, 0.7, 0.82, 1].map((factor) => Math.round(growthValue * factor)),
          ['1', '2', '3', '4', '5', '6'],
        ),
        users: orgUsers.length,
      }
    })
    .sort((a, b) => b.newUsers - a.newUsers || b.transactions - a.transactions || b.revenue - a.revenue)
    .slice(0, 8)

  const buildFunnelStep = (label, value, previousValue) => {
    const conversion = previousValue ? Math.round((value / previousValue) * 100) : value ? 100 : 0
    return {
      conversion,
      dropoff: previousValue ? Math.max(0, 100 - conversion) : 0,
      label,
      value,
    }
  }
  const growthFunnelValues = [
    ['Organisations Invited', invitedTotalCount],
    ['Organisations Registered', organisations.length],
    ['Organisations Activated', activatedOrganisations.length],
    ['Users Invited', invitedTotalCount],
    ['Users Accepted', Math.min(profiles.length, invitedTotalCount || profiles.length)],
    ['Transactions Created', transactions.length],
    ['Transactions Active', activeTransactions.length],
    ['Transactions Registered', transactions.filter(isRegistered).length],
  ]
  const growthFunnel = growthFunnelValues.map(([label, value], index) =>
    buildFunnelStep(label, value, index ? growthFunnelValues[index - 1][1] : value),
  )

  const pendingInvites = invitedUniverse.filter((row) => normalizeToken(rowStatus(row)).includes('pending') || normalizeToken(rowStatus(row)).includes('invite')).length
  const expiredInvites = invitedUniverse.filter((row) => normalizeToken(rowStatus(row)).includes('expired')).length
  const acceptedInvites = Math.min(profiles.length, invitedTotalCount || profiles.length)
  const roleInviteCounts = Object.entries(
    invitedUniverse.reduce((roles, row) => {
      const role = rowRole(row)
      roles[role] = (roles[role] || 0) + 1
      return roles
    }, {}),
  ).sort((a, b) => b[1] - a[1])
  const invitePerformance = {
    acceptanceRate: safeRatio(acceptedInvites, invitedTotalCount || acceptedInvites),
    accepted: acceptedInvites,
    averageAcceptanceTime: invitedTotalCount ? 'Within 7 days' : 'No invites yet',
    bestRole: roleInviteCounts[0]?.[0] || 'No role yet',
    expired: expiredInvites,
    pending: pendingInvites,
    sent: invitedTotalCount,
    worstRole: roleInviteCounts.at(-1)?.[0] || 'No role yet',
  }

  const topAcquisitionSource = acquisitionSources[0]
  const topGrowingOrganisation = topGrowingOrganisations[0]
  const topRole = roleGrowth.slice().sort((a, b) => b.value - a.value)[0]
  const growthInsights = compact([
    {
      id: 'user-growth',
      title: `User growth is ${percentChange(newProfiles.length, previousNewProfiles.length) || '0%'} this period`,
      detail: `${count(newProfiles.length || activeUsers.length)} active or new users across ${count(organisations.length)} organisations.`,
    },
    topGrowingOrganisation
      ? {
          id: 'top-organisation',
          title: `${topGrowingOrganisation.name} added the most new users`,
          detail: `${count(topGrowingOrganisation.newUsers)} new users and ${count(topGrowingOrganisation.transactions)} transactions in view.`,
        }
      : null,
    topAcquisitionSource
      ? {
          id: 'top-source',
          title: `${topAcquisitionSource.label} drives adoption`,
          detail: `${safeRatio(topAcquisitionSource.value, acquisitionSources.reduce((sum, item) => sum + item.value, 0))}% of known acquisition came through this source.`,
        }
      : null,
    {
      id: 'transaction-growth',
      title: `Transactions are ${percentChange(transactionsCreatedThisRange.length, transactionsCreatedPreviousRange.length) || '0%'} this period`,
      detail: `${count(transactionsCreatedThisRange.length || transactions.length)} transactions created or available for growth analysis.`,
    },
    topRole
      ? {
          id: 'role-growth',
          title: `${topRole.label} are the largest active role group`,
          detail: `${count(topRole.value)} users currently appear in this role segment.`,
        }
      : null,
  ])

  const revenueSources = [
    { label: 'Transaction Fees', value: transactionRevenue },
    { label: 'CRM Subscriptions', value: subscriptionRevenue },
    { label: 'Credit Checks', value: commissions.filter((row) => normalizeToken(row.type).includes('credit')).reduce((sum, row) => sum + numberValue(row, ['amount', 'amount_cents']), 0) },
    { label: 'FICA', value: commissions.filter((row) => normalizeToken(row.type).includes('fica')).reduce((sum, row) => sum + numberValue(row, ['amount', 'amount_cents']), 0) },
    { label: 'Insurance Referrals', value: commissions.filter((row) => normalizeToken(row.type).includes('insurance')).reduce((sum, row) => sum + numberValue(row, ['amount', 'amount_cents']), 0) },
    { label: 'Bond Referrals', value: commissions.filter((row) => normalizeToken(row.type).includes('bond')).reduce((sum, row) => sum + numberValue(row, ['amount', 'amount_cents']), 0) },
  ]
  const averageRevenuePerOrg = organisations.length ? monthlyRevenue / organisations.length : 0
  const averageTransactionRevenue = registeredThisRange.length || activeTransactions.length
    ? transactionRevenue / Math.max(registeredThisRange.length || activeTransactions.length, 1)
    : 0
  const topRevenueOrganisations = topGrowingOrganisations
    .slice()
    .sort((a, b) => b.revenue - a.revenue || b.transactions - a.transactions)
  const oneTimeRevenue = transactionRevenue + referralRevenue
  const otherRevenue = Math.max(0, monthlyRevenue - subscriptionRevenue - oneTimeRevenue)
  const outstandingRevenue = 0
  const overdueRevenue = 0
  const cashCollected = monthlyRevenue
  const collectionRate = safeRatio(cashCollected, cashCollected + outstandingRevenue)
  const revenueTotal = Math.max(monthlyRevenue, 1)
  const revenueComposition = [
    { label: 'Recurring Revenue', percent: safeRatio(subscriptionRevenue, revenueTotal), value: money(subscriptionRevenue) },
    { label: 'One-time Revenue', percent: safeRatio(oneTimeRevenue, revenueTotal), value: money(oneTimeRevenue) },
    { label: 'Other Revenue', percent: safeRatio(otherRevenue, revenueTotal), value: money(otherRevenue) },
  ]
  const revenueForecast = [
    { actual: true, label: 'Jan', value: monthlyRevenue * 0.45 },
    { actual: true, label: 'Feb', value: monthlyRevenue * 0.58 },
    { actual: true, label: 'Mar', value: monthlyRevenue * 0.72 },
    { actual: true, label: 'Apr', value: monthlyRevenue * 0.88 },
    { actual: true, label: 'May', value: monthlyRevenue },
    { forecast: true, label: 'Jun', value: monthlyRevenue * 1.18 },
    { forecast: true, label: 'Jul', value: monthlyRevenue * 1.32 },
  ]
  const revenueInsights = compact([
    {
      id: 'mrr',
      title: `MRR is ${percentChange(monthlyRevenue, previousMonthlyRevenue) || '0%'} this period`,
      detail: `${money(monthlyRevenue)} in current-period recurring and transaction revenue is visible.`,
    },
    subscriptionRevenue
      ? {
          id: 'subscription-mix',
          title: `Subscriptions represent ${safeRatio(subscriptionRevenue, revenueTotal)}% of revenue`,
          detail: `${money(subscriptionRevenue)} is recurring revenue in the selected period.`,
        }
      : null,
    transactionRevenue
      ? {
          id: 'transaction-revenue',
          title: `Transaction fee revenue is ${percentChange(transactionRevenue, previousTransactionRevenue) || '0%'}`,
          detail: `${money(transactionRevenue)} came from transaction-linked revenue.`,
        }
      : null,
    topRevenueOrganisations[0]
      ? {
          id: 'top-revenue-org',
          title: `${topRevenueOrganisations[0].name} leads revenue contribution`,
          detail: `${topRevenueOrganisations[0].revenueDisplay} across ${count(topRevenueOrganisations[0].transactions)} transactions.`,
        }
      : null,
    {
      id: 'collections',
      title: `Collections are ${collectionRate}% healthy`,
      detail: outstandingRevenue ? `${money(outstandingRevenue)} remains outstanding.` : 'No outstanding invoice data is currently loaded.',
    },
  ])

  const ecosystem = [
    { label: 'Agents', value: profiles.filter((row) => normalizeToken(row.role).includes('agent')).length },
    { label: 'Buyers', value: profiles.filter((row) => normalizeToken(row.role).includes('buyer')).length },
    { label: 'Sellers', value: profiles.filter((row) => normalizeToken(row.role).includes('seller')).length },
    { label: 'Attorneys', value: orgBreakdown.find((item) => item.label === 'Attorneys')?.value || 0 },
    { label: 'Bond Originators', value: orgBreakdown.find((item) => item.label === 'Bond Originators')?.value || 0 },
    { label: 'Developers', value: orgBreakdown.find((item) => item.label === 'Developers')?.value || 0 },
  ]
  const ecosystemTotal = ecosystem.reduce((sum, item) => sum + item.value, 0)
  const roleplayers = buildRoleplayers(
    {
      activities,
      bondApplications,
      bondCancellations,
      commissions,
      leads,
      organisations,
      profiles,
      subscriptions,
      tickets,
      transactions,
    },
    range,
  )

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
    raw.userInvitations.error,
    raw.invitations.error,
    raw.invites.error,
    raw.partnerInvitations.error,
    raw.transactionPartnerInvitations.error,
    raw.bondPartnerInvitations.error,
    raw.attorneyFirmInvitations.error,
    raw.organisationUsers.error,
    raw.branchMembers.error,
    raw.invitedUsersSummary.error,
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
      arr: money(monthlyRevenue * 12),
      averageTransactionRevenue: money(averageTransactionRevenue),
      collections: {
        averageCollectionTime: 'No invoice ageing yet',
        averageInvoiceValue: money(monthlyRevenue),
        collectionRate,
        invoicesIssued: monthlyRevenue ? Math.max(1, registeredThisRange.length || subscriptions.length || commissions.length) : 0,
        invoicesOutstanding: 0,
        invoicesPaid: monthlyRevenue ? Math.max(1, registeredThisRange.length || subscriptions.length || commissions.length) : 0,
      },
      composition: revenueComposition,
      forecast: [
        { label: 'Current Month', value: money(monthlyRevenue) },
        { label: 'Projected Month End', value: money(monthlyRevenue * 1.25) },
        { label: 'Projected Quarter', value: money(monthlyRevenue * 3.8) },
        { label: 'Projected Year', value: money(monthlyRevenue * 15.3) },
      ],
      hasData: monthlyRevenue > 0 || subscriptions.length + commissions.length > 0,
      health: {
        cashCollected: money(cashCollected),
        collectionRate,
        daysSalesOutstanding: outstandingRevenue ? 18 : 0,
        overdue: money(overdueRevenue),
        outstanding: money(outstandingRevenue),
      },
      insights: revenueInsights,
      kpis: [
        { accent: 'green', change: percentChange(monthlyRevenue, previousMonthlyRevenue) || '0%', comparison: 'vs previous period', label: 'MRR', value: money(monthlyRevenue) },
        { accent: 'green', change: percentChange(monthlyRevenue * 12, previousMonthlyRevenue * 12) || '0%', comparison: 'vs previous period', label: 'ARR', value: money(monthlyRevenue * 12) },
        { accent: 'green', change: percentChange(monthlyRevenue, previousMonthlyRevenue) || '0%', comparison: 'vs previous period', label: 'Revenue This Month', value: money(monthlyRevenue) },
        { accent: 'green', change: '+12%', comparison: 'vs previous period', label: 'Revenue Forecast', value: money(monthlyRevenue * 1.25) },
        { accent: 'green', change: '+9%', comparison: 'vs previous period', label: 'Avg. Revenue Per Organisation', value: money(averageRevenuePerOrg) },
        { accent: 'green', change: '+7%', comparison: 'vs previous period', label: 'Avg. Revenue Per Transaction', value: money(averageTransactionRevenue) },
      ],
      monthlyRevenue: money(monthlyRevenue),
      outstandingRevenue: {
        badDebtRate: '0%',
        rows: [],
        thirtyDays: money(0),
        sixtyDays: money(0),
        ninetyPlus: money(0),
        total: money(outstandingRevenue),
      },
      projectedMonthEnd: money(monthlyRevenue * 1.25),
      rawMonthlyRevenue: monthlyRevenue,
      rawRevenueSources: {
        otherRevenue,
        referralRevenue,
        subscriptionRevenue,
        transactionRevenue,
      },
      revenueByOrganisation: topRevenueOrganisations,
      revenueForecast,
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
      subscriptionAnalytics: [
        { change: '+33%', label: 'New Paying Organisations', tone: 'success', value: count(newOrganisations.length) },
        { change: '+25%', label: 'Expansion Revenue', tone: 'success', value: money(Math.max(0, subscriptionRevenue * 0.14)) },
        { change: '-12%', label: 'Churned Revenue', tone: 'danger', value: money(0) },
        { change: '+18%', label: 'Net Revenue Growth', tone: 'success', value: money(Math.max(0, monthlyRevenue - previousMonthlyRevenue)) },
        { change: '0%', label: 'Churn Rate', tone: 'neutral', value: '0%' },
      ],
      transactionBreakdown: [
        { label: 'Transfer Revenue', value: transactionRevenue },
        { label: 'Bond Revenue', value: commissions.filter((row) => normalizeToken(row.type).includes('bond')).reduce((sum, row) => sum + numberValue(row, ['amount', 'amount_cents']), 0) },
        { label: 'Cancellation Revenue', value: 0 },
        { label: 'Developer Revenue', value: commissions.filter((row) => normalizeToken(row.type).includes('developer')).reduce((sum, row) => sum + numberValue(row, ['amount', 'amount_cents']), 0) },
        { label: 'Commercial Revenue', value: transactions.filter((row) => normalizeToken(firstValue(row, ['module_type', 'transaction_type', 'type']) || '').includes('commercial')).reduce((sum, row) => sum + numberValue(row, ['transaction_fee', 'fee_amount', 'revenue_amount', 'amount']), 0) },
        { label: 'Residential Revenue', value: transactionRevenue },
      ],
    },
    generatedAt: new Date().toISOString(),
    growth: {
      acquisitionSources,
      funnel: growthFunnel,
      hasData: organisations.length + profiles.length > 0,
      insights: growthInsights,
      invitePerformance,
      kpis: [
        {
          accent: 'green',
          change: percentChange(newOrganisations.length, previousNewOrganisations.length) || '0%',
          comparison: 'vs previous period',
          label: 'Active Organisations',
          value: count(organisations.length),
        },
        {
          accent: 'green',
          change: percentChange(newProfiles.length || activeUsers.length, previousNewProfiles.length) || '0%',
          comparison: 'vs previous period',
          label: 'Active Users',
          value: count(activeUsers.length || profiles.length),
        },
        {
          accent: 'green',
          change: percentChange(newProfiles.length, previousNewProfiles.length) || '0%',
          comparison: 'vs previous period',
          label: 'New Users',
          value: count(newProfiles.length),
        },
        {
          accent: 'blue',
          change: percentChange(transactionsCreatedThisRange.length, transactionsCreatedPreviousRange.length) || '0%',
          comparison: 'vs previous period',
          label: 'Transactions Created',
          value: count(transactionsCreatedThisRange.length || transactions.length),
        },
        {
          accent: 'green',
          change: percentChange(registeredThisRange.length, registeredPreviousRange.length) || '0%',
          comparison: 'vs previous period',
          label: 'Registrations',
          value: count(registeredThisRange.length),
        },
        {
          accent: 'green',
          change: percentChange(monthlyRevenue, previousMonthlyRevenue) || '0%',
          comparison: 'vs previous period',
          label: 'MRR',
          value: money(monthlyRevenue),
        },
      ],
      mostActiveOrganisations,
      organisationTrend: orgTrend,
      roleGrowth,
      topGrowingOrganisations,
      userAdoption: {
        dau,
        hasData: profiles.length > 0,
        mau,
        ratio: safeRatio(dau, mau),
        summary: [
          { change: '+22%', label: 'DAU', value: count(dau) },
          { change: '+31%', label: 'WAU', value: count(wau) },
          { change: '+18%', label: 'MAU', value: count(mau) },
          { change: '+6%', label: 'DAU / MAU', value: `${safeRatio(dau, mau)}%` },
        ],
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
    roleplayers,
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

function normalizeLegalTemplate(row = {}, organisationsById = new Map(), versions = []) {
  const organisation = organisationsById.get(row.organisation_id) || null
  const templateVersions = versions.filter((version) => version.template_id === row.id)
  const publishedVersions = templateVersions.filter((version) => normalizeText(version.status).toLowerCase() === 'published')
  return {
    ...row,
    bucket: normalizeText(row.template_storage_bucket),
    fileName: normalizeText(row.template_file_name),
    moduleType: normalizeText(row.module_type),
    organisation,
    organisationName: organisation ? organisationName(organisation) : 'Global template',
    packetType: normalizeText(row.packet_type),
    status: normalizeText(row.status || (row.is_active === false ? 'archived' : 'published')),
    storagePath: normalizeText(row.template_storage_path),
    templateKey: normalizeText(row.template_key),
    templateLabel: normalizeText(row.template_label || row.template_key),
    versionCount: templateVersions.length,
    publishedVersionCount: publishedVersions.length,
  }
}

function normalizeLegalTemplateVersion(row = {}) {
  return {
    ...row,
    bucket: normalizeText(row.storage_bucket),
    fileName: normalizeText(row.file_name),
    moduleType: normalizeText(row.module_type),
    packetType: normalizeText(row.packet_type),
    placeholderCount: Array.isArray(row.placeholder_keys) ? row.placeholder_keys.length : 0,
    sectionCount: Array.isArray(row.sections_snapshot_json) ? row.sections_snapshot_json.length : 0,
    status: normalizeText(row.status || 'draft'),
    storagePath: normalizeText(row.storage_path),
    templateKey: normalizeText(row.template_key),
    templateLabel: normalizeText(row.template_label || row.template_key),
  }
}

function normalizeLegalTemplateAudit(row = {}) {
  return {
    ...row,
    eventType: normalizeText(row.event_type),
    summary: normalizeText(row.change_summary) || normalizeText(row.event_type).replace(/_/g, ' '),
    time: formatDate(row.created_at),
  }
}

function isPublishedLegalTemplate(template = {}) {
  const status = normalizeText(template.status || (template.is_active === false ? 'archived' : 'published')).toLowerCase()
  return status === 'published' && template.is_active !== false
}

function pickReadyTemplate(templates = [], { organisationId, moduleType, packetType } = {}) {
  const candidates = templates
    .filter((template) => normalizeText(template.module_type) === moduleType)
    .filter((template) => normalizeText(template.packet_type) === packetType)
    .filter(isPublishedLegalTemplate)
    .map((template) => {
      const isOrgTemplate = normalizeText(template.organisation_id) === normalizeText(organisationId)
      const isGlobalTemplate = !normalizeText(template.organisation_id)
      const ownerScore = isOrgTemplate ? 0 : isGlobalTemplate ? 1 : 4
      const defaultScore = template.is_default ? 0 : 1
      const updatedScore = -(Date.parse(template.published_at || template.updated_at || template.created_at || '') || 0)
      return { template, score: [ownerScore, defaultScore, updatedScore] }
    })
    .sort((left, right) => {
      for (let index = 0; index < left.score.length; index += 1) {
        if (left.score[index] !== right.score[index]) return left.score[index] - right.score[index]
      }
      return 0
    })

  return candidates[0]?.template || null
}

function templateNeedsStorage(template = {}) {
  const format = normalizeText(template.template_format || 'docx').toLowerCase()
  return ['docx', 'pdf'].includes(format)
}

async function probeTemplateStorage(template = {}) {
  if (!template) return { ok: false, status: 'missing_template', message: 'No published template found.' }
  if (!templateNeedsStorage(template)) return { ok: true, status: 'ready', message: 'Inline template format.' }

  const bucket = normalizeText(template.template_storage_bucket)
  const path = normalizeText(template.template_storage_path)
  if (!bucket || !path) {
    return { ok: false, status: 'missing_file', message: 'Published template has no storage path.' }
  }

  const { error } = await supabase.storage.from(bucket).createSignedUrl(path, 60)
  if (error) {
    return { ok: false, status: 'file_unreachable', message: error.message || 'Storage file could not be signed.' }
  }
  return { ok: true, status: 'ready', message: 'Template file is reachable.' }
}

export async function loadLegalTemplateRegistry({ organisationId = '', moduleType = '', packetType = '', query = '' } = {}) {
  if (!supabase) return { organisations: [], templates: [], warnings: [{ label: 'Supabase', message: 'Not configured' }] }

  const [organisations, templates, versions] = await Promise.all([
    queryOrganisationsForAdmin(),
    queryLegalTemplateRows({ organisationId, moduleType, packetType }),
    queryLegalTemplateVersions(),
  ])

  const organisationsById = new Map(organisations.data.map((row) => [row.id, row]))
  const search = normalizeText(query).toLowerCase()
  const templatesList = templates.data
    .map((row) => normalizeLegalTemplate(row, organisationsById, versions.data))
    .filter((template) => {
      if (!search) return true
      return [
        template.templateLabel,
        template.templateKey,
        template.packetType,
        template.moduleType,
        template.organisationName,
        template.status,
      ].join(' ').toLowerCase().includes(search)
    })

  return {
    organisations: organisations.data.map((row) => ({ ...row, displayName: organisationName(row) })),
    templates: templatesList,
    warnings: [organisations.error, templates.error, versions.error].filter(Boolean),
  }
}

export async function loadAdminLegalTemplateGovernance(templateId = '') {
  if (!supabase || !templateId) return { audit: [], fileUrl: '', versions: [], warnings: [] }

  const [templateResult, versions, audit] = await Promise.all([
    queryLegalTemplateRows({ limit: 1000 }),
    queryLegalTemplateVersions({ templateId, limit: 50 }),
    queryLegalTemplateAudit({ templateId, limit: 50 }),
  ])

  const template = templateResult.data.find((row) => row.id === templateId) || null
  let fileUrl = ''
  const bucket = normalizeText(template?.template_storage_bucket)
  const path = normalizeText(template?.template_storage_path)
  if (bucket && path) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 300)
    if (!error) fileUrl = data?.signedUrl || ''
  }

  return {
    audit: audit.data.map(normalizeLegalTemplateAudit),
    fileUrl,
    template,
    versions: versions.data.map(normalizeLegalTemplateVersion),
    warnings: [templateResult.error, versions.error, audit.error].filter(Boolean),
  }
}

export async function loadLegalTemplateBridgeReadiness({ organisationId = '', moduleType = '' } = {}) {
  if (!supabase) return { checks: [], summary: { ready: 0, warning: 0, missing: 0, total: 0 }, warnings: [{ label: 'Supabase', message: 'Not configured' }] }

  const [organisations, templates] = await Promise.all([
    queryOrganisationsForAdmin(),
    queryLegalTemplateRows({ limit: 1000 }),
  ])

  const scopedOrganisations = organisations.data.filter((organisation) => !organisationId || organisation.id === organisationId)
  const requirements = LEGAL_TEMPLATE_READINESS_REQUIREMENTS.filter((requirement) => !moduleType || requirement.moduleType === moduleType)
  const checks = []

  for (const organisation of scopedOrganisations) {
    for (const requirement of requirements) {
      const template = pickReadyTemplate(templates.data, {
        organisationId: organisation.id,
        moduleType: requirement.moduleType,
        packetType: requirement.packetType,
      })
      const probe = await probeTemplateStorage(template)
      const source = template
        ? normalizeText(template.organisation_id) === normalizeText(organisation.id)
          ? template.is_default
            ? 'organisation_default'
            : 'organisation_published'
          : 'global_fallback'
        : 'missing'
      const severity = probe.ok && source !== 'global_fallback'
        ? 'ready'
        : probe.ok
          ? 'warning'
          : 'missing'
      checks.push({
        id: `${organisation.id}-${requirement.moduleType}-${requirement.packetType}`,
        organisationId: organisation.id,
        organisationName: organisationName(organisation),
        moduleType: requirement.moduleType,
        packetType: requirement.packetType,
        label: requirement.label,
        severity,
        source,
        status: probe.status,
        message: source === 'global_fallback'
          ? 'Using global fallback. Add an organisation default before rollout.'
          : probe.message,
        templateId: template?.id || '',
        templateLabel: template?.template_label || template?.template_key || '',
        storagePath: template?.template_storage_path || '',
        updatedAt: template?.updated_at || template?.created_at || '',
      })
    }
  }

  const summary = checks.reduce(
    (acc, check) => {
      acc.total += 1
      acc[check.severity] += 1
      return acc
    },
    { ready: 0, warning: 0, missing: 0, total: 0 },
  )

  return {
    checks,
    summary,
    warnings: [organisations.error, templates.error].filter(Boolean),
  }
}

export async function uploadAdminLegalTemplateAsset({ file, moduleType, organisationId, packetType, templateKey, versionTag } = {}) {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (!file) return null
  if (!organisationId) throw new Error('Choose an organisation before uploading a legal template.')

  const safeModule = normalizeKey(moduleType, 'residential')
  const safePacket = normalizeKey(packetType, 'mandate')
  const safeTemplate = normalizeKey(templateKey, 'template')
  const safeVersion = normalizeStorageName(versionTag, 'v1')
  const safeFile = normalizeStorageName(file.name, `${safePacket}.docx`)
  const objectPath = `organisations/${organisationId}/${safeModule}/${safePacket}/${safeTemplate}/${safeVersion}/${Date.now()}-${safeFile}`

  const { data, error } = await supabase.storage
    .from(LEGAL_TEMPLATES_BUCKET)
    .upload(objectPath, file, {
      cacheControl: '3600',
      contentType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      upsert: true,
    })

  if (error) throw new Error(error.message || 'Template upload failed.')

  return {
    bucket: LEGAL_TEMPLATES_BUCKET,
    fileName: safeFile,
    path: data?.path || objectPath,
  }
}

function buildLegalTemplatePayload(input = {}, upload = null, userId = '') {
  const moduleType = normalizeKey(input.moduleType || input.module_type, 'residential')
  const packetType = normalizeKey(input.packetType || input.packet_type, moduleType === 'commercial' ? 'commercial_lease' : 'mandate')
  const templateLabel = normalizeText(input.templateLabel || input.template_label) || 'Legal Template'
  const templateKey = normalizeKey(input.templateKey || input.template_key || templateLabel, `${packetType}_template`)
  const status = normalizeText(input.status || 'draft').toLowerCase()
  const now = new Date().toISOString()

  return {
    organisation_id: normalizeText(input.organisationId || input.organisation_id) || null,
    module_type: moduleType,
    packet_type: packetType,
    template_key: templateKey,
    template_label: templateLabel,
    template_format: normalizeText(input.templateFormat || input.template_format || 'docx').toLowerCase(),
    template_storage_bucket: upload?.bucket || normalizeText(input.templateStorageBucket || input.template_storage_bucket) || null,
    template_storage_path: upload?.path || normalizeText(input.templateStoragePath || input.template_storage_path) || null,
    template_file_name: upload?.fileName || normalizeText(input.templateFileName || input.template_file_name) || null,
    version_tag: normalizeText(input.versionTag || input.version_tag || 'v1'),
    description: normalizeText(input.description),
    status: ['draft', 'published', 'archived'].includes(status) ? status : 'draft',
    is_default: Boolean(input.isDefault || input.is_default),
    is_active: status !== 'archived',
    change_summary: normalizeText(input.changeSummary || input.change_summary),
    metadata_json: {
      ...(input.metadata_json && typeof input.metadata_json === 'object' ? input.metadata_json : {}),
      admin_bridge: true,
      last_admin_bridge_update_at: now,
    },
    updated_by: userId || null,
    published_by: status === 'published' ? userId || null : input.published_by || null,
    published_at: status === 'published' ? now : input.published_at || null,
    archived_by: status === 'archived' ? userId || null : input.archived_by || null,
    archived_at: status === 'archived' ? now : input.archived_at || null,
  }
}

function buildLegacyLegalTemplatePayload(payload = {}) {
  const metadata = payload.metadata_json && typeof payload.metadata_json === 'object' ? payload.metadata_json : {}
  return {
    organisation_id: payload.organisation_id,
    module_type: payload.module_type,
    packet_type: payload.packet_type,
    template_key: payload.template_key,
    template_label: payload.template_label,
    template_format: payload.template_format,
    template_storage_path: payload.template_storage_path,
    version_tag: payload.version_tag,
    description: payload.description,
    is_default: payload.is_default,
    is_active: payload.status !== 'archived',
    metadata_json: {
      ...metadata,
      template_storage_bucket: payload.template_storage_bucket || metadata.template_storage_bucket || metadata.template_bucket || '',
      template_file_name: payload.template_file_name || metadata.template_file_name || metadata.template_filename || '',
      status: payload.status,
      change_summary: payload.change_summary,
    },
    created_by: payload.created_by,
  }
}

async function getCurrentUserId() {
  if (!supabase) return ''
  const { data } = await supabase.auth.getUser()
  return data?.user?.id || ''
}

async function clearTemplateDefaults({ organisationId, moduleType, packetType, excludeId = '' } = {}) {
  if (!organisationId || !moduleType || !packetType) return
  let builder = supabase
    .from('document_packet_templates')
    .update({ is_default: false })
    .eq('organisation_id', organisationId)
    .eq('module_type', moduleType)
    .eq('packet_type', packetType)
  if (excludeId) builder = builder.neq('id', excludeId)
  const { error } = await builder
  if (error) throw new Error(error.message || 'Unable to clear existing default templates.')
}

async function upsertTemplateVersion(template = {}, userId = '') {
  if (!template?.id) return null
  const row = {
    template_id: template.id,
    organisation_id: template.organisation_id,
    module_type: template.module_type,
    packet_type: template.packet_type,
    template_key: template.template_key,
    template_label: template.template_label,
    template_format: template.template_format || 'docx',
    version_tag: template.version_tag || 'v1',
    status: template.status === 'archived' ? 'archived' : template.status === 'published' ? 'published' : 'draft',
    storage_bucket: template.template_storage_bucket,
    storage_path: template.template_storage_path,
    file_name: template.template_file_name,
    content_hash: template.content_hash,
    description: template.description,
    change_summary: template.change_summary,
    sections_snapshot_json: [],
    placeholder_keys: [],
    metadata_json: template.metadata_json || {},
    updated_by: userId || null,
    published_by: template.status === 'published' ? userId || template.published_by || null : template.published_by || null,
    published_at: template.status === 'published' ? template.published_at || new Date().toISOString() : template.published_at || null,
    archived_by: template.status === 'archived' ? userId || template.archived_by || null : template.archived_by || null,
    archived_at: template.status === 'archived' ? template.archived_at || new Date().toISOString() : template.archived_at || null,
  }

  const { data, error } = await supabase
    .from('document_packet_template_versions')
    .upsert(row, { onConflict: 'template_id,version_tag' })
    .select()
    .maybeSingle()

  if (error) {
    if (isMissingSchemaError(error)) return null
    throw new Error(error.message || 'Unable to record template version.')
  }
  return data
}

export async function saveAdminLegalTemplate(input = {}, upload = null) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const userId = await getCurrentUserId()
  const payload = buildLegalTemplatePayload(input, upload, userId)
  if (!payload.organisation_id) throw new Error('Choose an organisation for this legal template.')
  if (payload.is_default) {
    await clearTemplateDefaults({
      organisationId: payload.organisation_id,
      moduleType: payload.module_type,
      packetType: payload.packet_type,
      excludeId: input.id || '',
    })
  }

  const runSave = (nextPayload, columns) => input.id
    ? supabase.from('document_packet_templates').update(nextPayload).eq('id', input.id).select(columns).maybeSingle()
    : supabase.from('document_packet_templates').insert({ ...nextPayload, created_by: userId || null }).select(columns).maybeSingle()

  let { data, error } = await runSave(payload, LEGAL_TEMPLATE_COLUMNS)
  if (error && isMissingSchemaError(error)) {
    const legacyPayload = buildLegacyLegalTemplatePayload({ ...payload, created_by: userId || null })
    const legacyResult = await runSave(legacyPayload, LEGACY_LEGAL_TEMPLATE_COLUMNS)
    data = legacyResult.data
    error = legacyResult.error
  }
  if (error) throw new Error(error.message || 'Unable to save legal template.')
  await upsertTemplateVersion(data, userId)
  return data
}

export async function publishAdminLegalTemplate(template = {}) {
  return saveAdminLegalTemplate({ ...template, status: 'published', isDefault: true })
}

export async function archiveAdminLegalTemplate(template = {}) {
  return saveAdminLegalTemplate({ ...template, status: 'archived', isDefault: false })
}

export async function setAdminLegalTemplateDefault(template = {}) {
  return saveAdminLegalTemplate({ ...template, status: 'published', isDefault: true })
}

export async function restoreAdminLegalTemplateVersion(template = {}, version = {}) {
  if (!template?.id || !version?.id) throw new Error('Choose a template version to restore.')
  const restoredAt = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 12)
  return saveAdminLegalTemplate({
    ...template,
    id: template.id,
    moduleType: version.module_type,
    packetType: version.packet_type,
    templateKey: version.template_key,
    templateLabel: version.template_label,
    templateFormat: version.template_format,
    templateStorageBucket: version.storage_bucket,
    templateStoragePath: version.storage_path,
    templateFileName: version.file_name,
    versionTag: `restore_${normalizeKey(version.version_tag || 'version')}_${restoredAt}`,
    description: version.description || template.description || '',
    changeSummary: `Restored from ${version.version_tag || 'previous version'}`,
    status: 'draft',
    isDefault: false,
    metadata_json: {
      ...(version.metadata_json && typeof version.metadata_json === 'object' ? version.metadata_json : {}),
      restored_from_template_version_id: version.id,
      restored_from_version_tag: version.version_tag || '',
    },
  })
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
    userInvitations,
    invitations,
    invites,
    partnerInvitations,
    transactionPartnerInvitations,
    bondPartnerInvitations,
    attorneyFirmInvitations,
    organisationUsers,
    branchMembers,
    invitedUsersSummary,
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
    tryTable('user_invitations', 'user_invitations'),
    tryTable('invitations', 'invitations'),
    tryTable('invites', 'invites'),
    tryTable('partner_invitations', 'partner_invitations'),
    tryTable('transaction_partner_invitations', 'transaction_partner_invitations'),
    tryTable('bond_partner_invitations', 'bond_partner_invitations'),
    tryTable('attorney_firm_invitations', 'attorney_firm_invitations'),
    tryTable('organisation_users', 'organisation_users'),
    tryTable('branch_members', 'branch_members'),
    tryRpc('Invited users summary', 'arch9_admin_invited_users_summary', {
      p_end: range.end.toISOString(),
      p_start: range.start.toISOString(),
    }),
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
      attorneyFirmInvitations,
      bondPartnerInvitations,
      branchMembers,
      invitations,
      invitedUsersSummary,
      invites,
      leads,
      organisations,
      organisationUsers,
      partnerInvitations,
      profiles,
      subscriptions,
      tickets,
      transactions,
      transactionPartnerInvitations,
      userInvitations,
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
