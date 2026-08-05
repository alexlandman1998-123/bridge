import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_ENV_FILES = [
  '.vercel/.env.production.local',
  'the-it-guy/.env.production.local',
  'the-it-guy/.env',
]

const RANGE_DAYS = 30
const SAMPLE_LIMIT = 5000
const ROW_PREVIEW_LIMIT = 5
const OPERATING_REVENUE_KEYS = [
  'arch9_revenue_amount',
  'platform_fee_amount',
  'platform_fee',
  'transaction_fee',
  'fee_amount',
  'revenue_amount',
]

function parseEnvFile(filePath) {
  const env = {}
  if (!fs.existsSync(filePath)) return env

  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    let value = match[2]
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
  const env = { ...process.env }
  for (const file of DEFAULT_ENV_FILES) {
    Object.assign(env, parseEnvFile(path.resolve(file)))
  }
  const localEnv = parseEnvFile(path.resolve('the-it-guy/.env'))
  if (String(localEnv.VITE_SUPABASE_ANON_KEY || '').startsWith('eyJ')) {
    env.VITE_SUPABASE_ANON_KEY = localEnv.VITE_SUPABASE_ANON_KEY
  }
  if (String(localEnv.VITE_SUPABASE_KEY || '').startsWith('eyJ')) {
    env.VITE_SUPABASE_KEY = localEnv.VITE_SUPABASE_KEY
  }
  return env
}

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeToken(value = '') {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function firstText(row, keys, fallback = '') {
  for (const key of keys) {
    const value = normalizeText(row?.[key])
    if (value) return value
  }
  return fallback
}

function firstNumber(row, keys, fallback = 0) {
  for (const key of keys) {
    const raw = normalizeText(row?.[key]).replace(/[^0-9.-]/g, '')
    if (!raw || !/^-?[0-9]+(\.[0-9]+)?$/.test(raw)) continue
    const value = Number(raw)
    return key.toLowerCase().includes('cents') ? value / 100 : value
  }
  return fallback
}

function hasValue(row, keys) {
  return keys.some((key) => normalizeText(row?.[key]))
}

function firstDate(row, keys) {
  for (const key of keys) {
    const raw = normalizeText(row?.[key])
    if (!raw) continue
    const date = new Date(raw)
    if (!Number.isNaN(date.getTime())) return date
  }
  return null
}

function inRange(date, start, end) {
  return date && date >= start && date <= end
}

function compactPreview(rows, mapper) {
  return rows.slice(0, ROW_PREVIEW_LIMIT).map(mapper)
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
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          code: body?.code || '',
          message: body?.message || response.statusText,
          rows: [],
        }
      }
      return {
        ok: true,
        status: response.status,
        rows: Array.isArray(body) ? body : [],
      }
    },
    async callRpc(name, keyForCall, payload) {
      const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
        body: JSON.stringify(payload),
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${keyForCall}`,
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

function evaluateData({ organisations, profiles, listings, transactions, supportTickets }, range) {
  const activeOrganisations = organisations.rows.filter((row) => {
    const status = normalizeToken(firstText(row, ['status', 'organisation_status', 'organization_status', 'is_active'], 'active'))
    return !['inactive', 'archived', 'deleted', 'suspended', 'disabled', 'false'].includes(status)
  })

  const activeAgents = profiles.rows.filter((row) => {
    const role = normalizeToken(firstText(row, ['role', 'app_role', 'system_role', 'workspace_role', 'organisation_role', 'organization_role', 'portal_role']))
    const status = normalizeToken(firstText(row, ['status', 'profile_status', 'is_active'], 'active'))
    return role.includes('agent') && !['inactive', 'archived', 'deleted', 'suspended', 'disabled', 'false'].includes(status)
  })

  const activeListings = listings.rows.filter((row) => {
    const status = normalizeToken(firstText(row, ['bridge_listing_status', 'listing_status', 'status', 'publication_status', 'marketing_status', 'is_active'], 'active'))
    return !['sold', 'registered', 'archived', 'withdrawn', 'deleted', 'inactive', 'disabled', 'not_published', 'draft', 'false'].includes(status)
  })

  const pipeline = []
  const registered = []
  const stalled = []

  for (const row of transactions.rows) {
    const status = normalizeToken(firstText(row, ['status', 'workflow_status', 'lifecycle_state', 'matter_status']))
    const stage = normalizeToken(firstText(row, ['stage', 'transaction_stage', 'matter_stage', 'onboarding_status']))
    const registrationAt = firstDate(row, ['registration_date', 'registered_at', 'date_registered', 'transfer_registered_at'])
    const lastActivityAt = firstDate(row, ['last_activity_at', 'updated_at', 'created_at'])
    const revenuePresent = hasValue(row, OPERATING_REVENUE_KEYS)
    const revenue = revenuePresent ? firstNumber(row, OPERATING_REVENUE_KEYS, 0) : 0
    const isRegistered = Boolean(registrationAt) || status.includes('registered') || stage.includes('registered')
    const signedSeller =
      Boolean(firstDate(row, ['seller_signed_at', 'seller_signature_at', 'seller_otp_signed_at', 'mandate_signed_at'])) ||
      status.includes('seller_signed') ||
      stage.includes('seller_signed') ||
      status.includes('signed_seller') ||
      stage.includes('signed_seller')
    const signedBuyer =
      Boolean(firstDate(row, ['buyer_signed_at', 'buyer_signature_at', 'buyer_otp_signed_at', 'otp_signed_date', 'offer_signed_at', 'signed_at'])) ||
      status.includes('buyer_signed') ||
      stage.includes('buyer_signed') ||
      status.includes('signed_buyer') ||
      stage.includes('signed_buyer') ||
      stage.includes('otp_signed') ||
      status.includes('otp_signed')

    if (signedSeller && signedBuyer && !isRegistered) {
      pipeline.push({ row, revenue, revenuePresent, lastActivityAt })
    }

    if (isRegistered && inRange(registrationAt || lastActivityAt || new Date(), range.start, range.end)) {
      registered.push({ row, revenue, revenuePresent, registeredAt: registrationAt || lastActivityAt })
    }

    if (
      !isRegistered &&
      !['cancelled', 'canceled', 'closed', 'complete', 'completed', 'lost', 'deleted', 'archived'].includes(status) &&
      !['cancelled', 'canceled', 'closed', 'complete', 'completed', 'lost', 'deleted', 'archived'].includes(stage) &&
      lastActivityAt &&
      lastActivityAt < new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    ) {
      stalled.push({ row, lastActivityAt, stage: stage || status })
    }
  }

  const openTickets = supportTickets.rows.filter((row) => {
    const status = normalizeToken(firstText(row, ['status', 'ticket_status'], 'open'))
    return !['closed', 'resolved', 'done', 'complete', 'completed', 'deleted', 'archived'].includes(status)
  })
  const urgentTickets = openTickets.filter((row) => {
    const priority = normalizeToken(firstText(row, ['priority', 'severity'], 'normal'))
    return ['urgent', 'critical', 'high', 'p0', 'p1'].includes(priority)
  })

  return {
    counts: {
      activeAgents: activeAgents.length,
      activeListings: activeListings.length,
      activeOrganisations: activeOrganisations.length,
      missingPipelineRevenue: pipeline.filter((item) => !item.revenuePresent).length,
      missingRegisteredRevenue: registered.filter((item) => !item.revenuePresent).length,
      openTickets: openTickets.length,
      pipelineRevenue: pipeline.reduce((sum, item) => sum + item.revenue, 0),
      registeredRevenueThisRange: registered.reduce((sum, item) => sum + item.revenue, 0),
      registeredThisRange: registered.length,
      sellerSignedBuyerSigned: pipeline.length,
      stalledTransactions: stalled.length,
      urgentTickets: urgentTickets.length,
    },
    samples: {
      activeAgents: compactPreview(activeAgents, (row) => ({
        id: row.id || null,
        organisationId: firstText(row, ['organisation_id', 'organization_id', 'agency_id', 'company_id'], null),
        role: firstText(row, ['role', 'app_role', 'system_role', 'workspace_role', 'organisation_role', 'organization_role', 'portal_role'], null),
        status: firstText(row, ['status', 'profile_status', 'is_active'], 'active'),
      })),
      activeListings: compactPreview(activeListings, (row) => ({
        id: row.id || null,
        organisationId: firstText(row, ['organisation_id', 'organization_id', 'agency_id', 'company_id'], null),
        status: firstText(row, ['bridge_listing_status', 'listing_status', 'status', 'publication_status', 'marketing_status', 'is_active'], 'active'),
      })),
      activeOrganisations: compactPreview(activeOrganisations, (row) => ({
        id: row.id || null,
        status: firstText(row, ['status', 'organisation_status', 'organization_status', 'is_active'], 'active'),
      })),
      missingRevenue: compactPreview(
        [...pipeline, ...registered].filter((item) => !item.revenuePresent),
        (item) => ({
          id: item.row.id || null,
          reference: firstText(item.row, ['reference', 'matter_number', 'transaction_reference', 'id'], null),
        }),
      ),
    },
  }
}

function summarizeTable(name, result) {
  if (result.ok) return { ok: true, sampledRows: result.rows.length }
  return {
    code: result.code,
    message: result.message,
    ok: false,
    status: result.status,
  }
}

async function main() {
  const env = loadEnv()
  const supabaseUrl = normalizeText(env.VITE_SUPABASE_URL || env.SUPABASE_URL)
  const anonKey = normalizeText(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || env.SUPABASE_ANON_KEY)
  const serviceKey = normalizeText(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY)

  if (!supabaseUrl || !anonKey || !serviceKey) {
    throw new Error('VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY/VITE_SUPABASE_KEY, and SUPABASE_SERVICE_ROLE_KEY are required.')
  }

  const rangeEnd = new Date()
  const rangeStart = new Date(rangeEnd)
  rangeStart.setDate(rangeEnd.getDate() - RANGE_DAYS)
  const client = makeClient({ apiKey: anonKey, supabaseUrl })
  const rpcPayload = {
    p_range_end: rangeEnd.toISOString(),
    p_range_start: rangeStart.toISOString(),
  }

  const [dashboardAnon, dashboardService, supportService] = await Promise.all([
    client.callRpc('arch9_admin_dashboard_snapshot', anonKey, rpcPayload),
    client.callRpc('arch9_admin_dashboard_snapshot', serviceKey, rpcPayload),
    client.callRpc('arch9_admin_support_snapshot', serviceKey, rpcPayload),
  ])
  const supportAnon = await client.callRpc('arch9_admin_support_snapshot', anonKey, rpcPayload)

  const organisations = await client.getTable('organisations', serviceKey)
  const profilesAttempt = await client.getTable('profiles', serviceKey)
  const profiles = profilesAttempt.ok ? profilesAttempt : await client.getTable('users', serviceKey)
  const listings = await client.getTable('private_listings', serviceKey)
  const transactions = await client.getTable('transactions', serviceKey)
  const supportTickets = await client.getTable('support_tickets', serviceKey)

  const data = evaluateData(
    { listings, organisations, profiles, supportTickets, transactions },
    { end: rangeEnd, start: rangeStart },
  )

  const checks = []
  checks.push({
    check: 'Dashboard RPC exists in schema cache',
    ok: dashboardAnon.status !== 404 || dashboardAnon.code !== 'PGRST202',
    status: dashboardAnon.status,
    code: dashboardAnon.code,
  })
  checks.push({
    check: 'Support RPC exists in schema cache',
    ok: supportAnon.status !== 404 || supportAnon.code !== 'PGRST202',
    status: supportAnon.status,
    code: supportAnon.code,
  })
  checks.push({
    check: 'Anon dashboard RPC access is blocked after function deploy',
    ok: !dashboardAnon.ok && dashboardAnon.status !== 404,
    status: dashboardAnon.status,
    code: dashboardAnon.code,
  })
  checks.push({
    check: 'Service diagnostic JWT is accepted',
    ok: dashboardService.status !== 401 || dashboardService.code !== 'PGRST301',
    status: dashboardService.status,
    code: dashboardService.code,
  })
  checks.push({
    check: 'Real transaction rows are readable for QA',
    ok: transactions.ok && transactions.rows.length > 0,
    sampledRows: transactions.rows.length,
  })
  checks.push({
    check: 'Revenue fields exist on at least one pipeline/registered record',
    ok: data.counts.pipelineRevenue > 0 || data.counts.registeredRevenueThisRange > 0,
    pipelineRevenue: data.counts.pipelineRevenue,
    registeredRevenueThisRange: data.counts.registeredRevenueThisRange,
  })

  const result = {
    generatedAt: new Date().toISOString(),
    range: {
      days: RANGE_DAYS,
      end: rangeEnd.toISOString(),
      start: rangeStart.toISOString(),
    },
    rpc: {
      dashboardAnon: {
        ok: dashboardAnon.ok,
        status: dashboardAnon.status,
        code: dashboardAnon.code,
        message: dashboardAnon.message,
      },
      dashboardService: {
        ok: dashboardService.ok,
        status: dashboardService.status,
        code: dashboardService.code,
        message: dashboardService.message,
      },
      supportAnon: {
        ok: supportAnon.ok,
        status: supportAnon.status,
        code: supportAnon.code,
        message: supportAnon.message,
      },
      supportService: {
        ok: supportService.ok,
        status: supportService.status,
        code: supportService.code,
        message: supportService.message,
      },
    },
    tables: {
      organisations: summarizeTable('organisations', organisations),
      profiles: summarizeTable('profiles/users', profiles),
      private_listings: summarizeTable('private_listings', listings),
      transactions: summarizeTable('transactions', transactions),
      support_tickets: summarizeTable('support_tickets', supportTickets),
    },
    checks,
    computed: data,
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
