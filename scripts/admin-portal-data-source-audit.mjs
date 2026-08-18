import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_ENV_FILES = [
  'apps/admin/.vercel/.env.production.local',
  '.vercel/.env.production.local',
  'the-it-guy/.vercel/.env.production.local',
  'the-it-guy/.env.production.local',
  'the-it-guy/.env',
]

const SAMPLE_LIMIT = 10000
const ARCH9_LISTING_PIPELINE_FEE = 1500

const MOCK_ORGANISATION_NAMES = new Set([
  'alex_bond',
  'alexagency',
  'bond_runtime_personal_originator',
  'bond_runtime_test_company',
  'bridge9_realty',
  'canonical_qa_attorney_firm',
  'dalawyer_lawyers',
  'meyer_partners_conveyancers',
  'northside_bond_attorneys',
])

const INACTIVE_STATUSES = new Set([
  'archived',
  'cancelled',
  'canceled',
  'deleted',
  'disabled',
  'false',
  'inactive',
  'invited',
  'pending',
  'removed',
  'suspended',
])

const AGENT_ROLE_TOKENS = new Set([
  'admin',
  'agency',
  'agent',
  'broker',
  'commercial_broker',
  'consultant',
  'estate_agent',
  'manager',
  'member',
  'principal',
  'property_practitioner',
  'real_estate',
  'realtor',
])

function parseEnvFile(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    env[match[1]] = value
  }

  return env
}

function loadEnv() {
  return DEFAULT_ENV_FILES.reduce((env, file) => ({
    ...env,
    ...parseEnvFile(path.resolve(file)),
  }), { ...process.env })
}

function cleanSecret(value = '') {
  return String(value || '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '')
    .trim()
}

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeToken(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function normalizeIdentity(value = '') {
  return normalizeToken(String(value || '').replace(/&/g, 'and').replace(/[^a-zA-Z0-9]+/g, ' '))
    .replace(/(^|_)and(_|$)/g, '_')
    .replace(/^_+|_+$/g, '')
}

function firstText(row, keys, fallback = '') {
  for (const key of keys) {
    const value = normalizeText(row?.[key])
    if (value) return value
  }
  return fallback
}

function getOrganisationId(row = {}) {
  return firstText(row, ['organisationId', 'organisation_id', 'organizationId', 'organization_id', 'agencyId', 'agency_id', 'companyId', 'company_id'])
}

function getOrganisationName(row = {}) {
  return firstText(row, [
    'name',
    'tradingName',
    'trading_name',
    'displayName',
    'display_name',
    'organisationName',
    'organisation_name',
    'organizationName',
    'organization_name',
    'companyName',
    'company_name',
  ])
}

function isInactiveStatus(value = '', fallback = 'active') {
  return INACTIVE_STATUSES.has(normalizeToken(value || fallback))
}

function isMockOrganisation(row = {}) {
  const names = [
    getOrganisationName(row),
    row.name,
    row.trading_name,
    row.tradingName,
    row.organisation_name,
    row.organisationName,
    row.company_name,
    row.companyName,
  ].map(normalizeIdentity).filter(Boolean)
  return names.some((name) => MOCK_ORGANISATION_NAMES.has(name))
}

function isTestEmail(value = '') {
  const email = normalizeText(value).toLowerCase()
  return Boolean(email && (email.endsWith('.test') || email.includes('enterprise-pentest-')))
}

function rowTokens(row = {}, keys = []) {
  return keys.map((key) => normalizeToken(row?.[key])).filter(Boolean).join('_')
}

function roleMatchesAgent(row = {}) {
  const tokens = rowTokens(row, [
    'role',
    'app_role',
    'system_role',
    'workspace_role',
    'organisation_role',
    'organization_role',
    'portal_role',
    'commercial_role',
    'module_context',
    'workspace_kind',
  ])
  return tokens.split('_').some((token) => AGENT_ROLE_TOKENS.has(token)) ||
    /(^|_)(agent|agency|principal|broker|consultant|manager|admin|member|property_practitioner|estate_agent|realtor|real_estate)(_|$)/.test(tokens)
}

function isAgentRow(row = {}) {
  if (isInactiveStatus(firstText(row, ['status', 'membership_status', 'profile_status', 'is_active'], 'active'))) return false
  if (isTestEmail(firstText(row, ['email', 'email_address']))) return false
  return roleMatchesAgent(row)
}

function isActiveListing(row = {}) {
  const tokens = rowTokens(row, [
    'listing_status',
    'status',
    'publication_status',
    'marketing_status',
    'listing_visibility',
    'bridge_listing_status',
    'property24_status',
    'private_property_status',
    'mandate_status',
  ])
  const activeFlag = ['is_active', 'active'].some((key) => ['true', 't', 'yes', 'y', '1', 'active', 'live', 'published'].includes(normalizeToken(row?.[key])))
  const activeSignal = activeFlag || /(mandate_signed|listing_active|active_market|under_offer|transaction_created|published|live|active|signed_external_pending_upload|signed_uploaded|uploaded_signed|current_listing)/.test(tokens)
  const terminalSignal = /(^|_)(inactive|archived|withdrawn|deleted|disabled|registered|sold|sold_archived)(_|$)/.test(tokens)
  return activeSignal && !terminalSignal
}

function isActiveTransaction(row = {}) {
  const tokens = rowTokens(row, ['status', 'workflow_status', 'lifecycle_state', 'matter_status', 'stage', 'transaction_stage', 'matter_stage'])
  return !/(^|_)(cancelled|canceled|closed|complete|completed|lost|deleted|archived|registered)(_|$)/.test(tokens)
}

function agentKey(row = {}) {
  return firstText(row, ['user_id', 'profile_id', 'id', 'email']).toLowerCase()
}

function makeClient({ apiKey, supabaseUrl }) {
  const baseUrl = supabaseUrl.replace(/\/$/, '')
  return {
    async getTable(table, authKey) {
      const url = new URL(`${baseUrl}/rest/v1/${encodeURIComponent(table)}`)
      url.searchParams.set('select', '*')
      url.searchParams.set('limit', String(SAMPLE_LIMIT))
      const response = await fetch(url, {
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${authKey}`,
        },
      })
      const body = await response.json().catch(() => null)
      return {
        ok: response.ok,
        status: response.status,
        code: body?.code || '',
        message: body?.message || response.statusText,
        rows: response.ok && Array.isArray(body) ? body : [],
      }
    },
    async callRpc(name, authKey, payload) {
      const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
        body: JSON.stringify(payload),
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${authKey}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })
      const body = await response.json().catch(() => null)
      return {
        body,
        ok: response.ok,
        status: response.status,
        code: body?.code || '',
        message: body?.message || response.statusText,
      }
    },
  }
}

function tableSummary(result) {
  if (result.ok) return { ok: true, rows: result.rows.length }
  return { code: result.code, message: result.message, ok: false, status: result.status }
}

async function main() {
  const env = loadEnv()
  const supabaseUrl = normalizeText(env.VITE_SUPABASE_URL || env.SUPABASE_URL)
  const anonKey = cleanSecret(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || env.SUPABASE_ANON_KEY)
  const serviceKey = cleanSecret(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY)

  if (!supabaseUrl || !anonKey || !serviceKey) {
    throw new Error('VITE_SUPABASE_URL, anon key, and SUPABASE_SERVICE_ROLE_KEY are required for the admin audit.')
  }

  const client = makeClient({ apiKey: anonKey, supabaseUrl })
  const rangeEnd = new Date()
  const rangeStart = new Date(rangeEnd)
  rangeStart.setDate(rangeEnd.getDate() - 30)
  const rpcPayload = {
    p_range_end: rangeEnd.toISOString(),
    p_range_start: rangeStart.toISOString(),
  }

  const [dashboardRpc, organisations, profiles, organisationUsers, listings, transactions] = await Promise.all([
    client.callRpc('arch9_admin_dashboard_snapshot', anonKey, rpcPayload),
    client.getTable('organisations', serviceKey),
    client.getTable('profiles', serviceKey),
    client.getTable('organisation_users', serviceKey),
    client.getTable('private_listings', serviceKey),
    client.getTable('transactions', serviceKey),
  ])

  const mockOrganisations = organisations.rows.filter(isMockOrganisation)
  const mockOrganisationIds = new Set(mockOrganisations.map((row) => firstText(row, ['id'])).filter(Boolean))
  const activeOrganisations = organisations.rows.filter((row) => !isMockOrganisation(row) && !isInactiveStatus(firstText(row, ['status', 'organisation_status', 'organization_status', 'is_active'], 'active')))
  const profileById = new Map(profiles.rows.map((row) => [agentKey(row), row]).filter(([key]) => key))
  const agentRows = new Map()
  const excludedAgents = []

  for (const membership of organisationUsers.rows) {
    const orgId = getOrganisationId(membership)
    const profile = profileById.get(firstText(membership, ['user_id', 'profile_id']).toLowerCase()) || {}
    const row = { ...profile, ...membership, email: firstText(membership, ['email'], firstText(profile, ['email'])) }
    const key = agentKey(row)
    const excludedReason = mockOrganisationIds.has(orgId)
      ? 'mock_organisation'
      : isTestEmail(firstText(row, ['email']))
        ? 'test_email'
        : ''
    if (excludedReason) {
      excludedAgents.push({ email: firstText(row, ['email']), id: key, organisationId: orgId, reason: excludedReason })
      continue
    }
    if (isAgentRow(row) && key) agentRows.set(key, row)
  }

  for (const profile of profiles.rows) {
    const orgId = getOrganisationId(profile)
    const key = agentKey(profile)
    if (mockOrganisationIds.has(orgId) || isTestEmail(firstText(profile, ['email']))) continue
    if (isAgentRow(profile) && key && !agentRows.has(key)) agentRows.set(key, profile)
  }

  const activeListings = listings.rows.filter((row) => {
    const orgId = getOrganisationId(row)
    return !mockOrganisationIds.has(orgId) && isActiveListing(row)
  })
  const activeTransactions = transactions.rows.filter((row) => {
    const orgId = getOrganisationId(row)
    return !mockOrganisationIds.has(orgId) && isActiveTransaction(row)
  })

  const topHeaderStats = [
    {
      label: 'Organisations',
      displayedAfterFix: activeOrganisations.length,
      rawRows: organisations.rows.length,
      source: 'organisations table, active status, exact mock-name exclusion',
    },
    {
      label: 'Agents',
      displayedAfterFix: agentRows.size,
      rawRows: organisationUsers.rows.length + profiles.rows.length,
      source: 'organisation_users enriched with profiles, plus direct agent profiles',
    },
    {
      label: 'Active Listings',
      displayedAfterFix: activeListings.length,
      rawRows: listings.rows.length,
      source: 'private_listings active/publication/mandate signals, excluding mock organisation ids',
    },
    {
      label: 'Listing Pipeline',
      displayedAfterFix: activeListings.length * ARCH9_LISTING_PIPELINE_FEE,
      rawRows: activeListings.length,
      source: `Active Listings x R${ARCH9_LISTING_PIPELINE_FEE}`,
    },
    {
      label: 'Active Transactions',
      displayedAfterFix: activeTransactions.length,
      rawRows: transactions.rows.length,
      source: 'transactions table, not terminal and not registered, excluding mock organisation ids',
    },
  ]

  const report = {
    generatedAt: new Date().toISOString(),
    range: {
      end: rangeEnd.toISOString(),
      start: rangeStart.toISOString(),
    },
    dashboardRpc: {
      code: dashboardRpc.code,
      kpis: dashboardRpc.ok ? dashboardRpc.body?.kpis || {} : null,
      message: dashboardRpc.message,
      ok: dashboardRpc.ok,
      status: dashboardRpc.status,
    },
    tables: {
      organisation_users: tableSummary(organisationUsers),
      organisations: tableSummary(organisations),
      private_listings: tableSummary(listings),
      profiles: tableSummary(profiles),
      transactions: tableSummary(transactions),
    },
    topHeaderStats,
    excluded: {
      mockOrganisationCount: mockOrganisations.length,
      testAgentCount: excludedAgents.length,
      mockOrganisations: mockOrganisations.map((row) => ({
        id: firstText(row, ['id']),
        name: getOrganisationName(row),
        status: firstText(row, ['status', 'organisation_status', 'organization_status', 'is_active'], 'active'),
      })),
      testAgents: excludedAgents.slice(0, 50),
    },
    samples: {
      activeAgents: Array.from(agentRows.values()).slice(0, 10).map((row) => ({
        email: firstText(row, ['email']),
        id: agentKey(row),
        name: firstText(row, ['full_name', 'name'], [row.first_name, row.last_name].map(normalizeText).filter(Boolean).join(' ')),
        organisationId: getOrganisationId(row),
        role: firstText(row, ['role', 'workspace_role', 'organisation_role', 'organization_role']),
      })),
      activeOrganisations: activeOrganisations.slice(0, 10).map((row) => ({
        id: firstText(row, ['id']),
        name: getOrganisationName(row),
        status: firstText(row, ['status', 'organisation_status', 'organization_status', 'is_active'], 'active'),
      })),
    },
  }

  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
