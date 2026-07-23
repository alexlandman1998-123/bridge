import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

process.env.VITE_SUPABASE_URL = 'https://phase5-private-listings.test.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.phase5-private-listings'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dashboardSource = readFileSync(path.join(PROJECT_ROOT, 'src/pages/Dashboard.jsx'), 'utf8')
const settingsApiSource = readFileSync(path.join(PROJECT_ROOT, 'src/lib/settingsApi.js'), 'utf8')
const originalFetch = globalThis.fetch
const requests = []

const ORGANISATION_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const ALIAS_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_AGENT_ID = '44444444-4444-4444-8444-444444444444'
const PROFILE_LISTING_ID = '55555555-5555-4555-8555-555555555555'
const ALIAS_LISTING_ID = '66666666-6666-4666-8666-666666666666'
const EMAIL_LISTING_ID = '77777777-7777-4777-8777-777777777777'
let responseMode = 'normal'

function jsonResponse(payload, { status = 200, statusText = 'OK' } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    statusText,
    headers: { 'content-type': 'application/json' },
  })
}

function requestUrl(input) {
  if (typeof input === 'string') return new URL(input)
  if (input instanceof URL) return input
  return new URL(input.url)
}

function requestSummary(url) {
  const parts = url.pathname.split('/').filter(Boolean)
  return {
    table: parts.at(-1),
    url,
    select: url.searchParams.get('select') || '',
  }
}

function privateListingRow({ id, assignedAgentId, assignedAgentEmail, askingPrice, isActive = true }) {
  return {
    id,
    listing_reference: `PL-${id.slice(0, 4)}`,
    listing_status: 'active',
    listing_visibility: 'internal',
    seller_onboarding_status: 'completed',
    mandate_status: 'signed',
    mandate_packet_id: null,
    asking_price: askingPrice,
    estimated_value: askingPrice,
    title: 'Phase 5 listing',
    address_line_1: '1 Efficient Lane',
    address_line_2: '',
    formatted_address: '1 Efficient Lane',
    street_address: '1 Efficient Lane',
    suburb: 'Performance',
    city: 'Cape Town',
    province: 'Western Cape',
    country: 'South Africa',
    postal_code: '8001',
    latitude: null,
    longitude: null,
    google_place_id: '',
    seller_type: 'individual',
    finance_context: '',
    mandate_type: 'sole',
    property_category: 'residential',
    property_type: 'house',
    property_structure_type: 'freehold',
    listing_category: 'private_sale',
    listing_source: 'private_listing',
    stock_source: 'private_listing',
    seller_canonical_facts_json: {},
    seller_canonical_fact_readiness_json: {},
    seller_lead_id: null,
    seller_profile_id: null,
    property_profile_id: null,
    organisation_id: ORGANISATION_ID,
    branch_id: null,
    assigned_agent_id: assignedAgentId,
    assigned_agent_email: assignedAgentEmail,
    is_active: isActive,
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-02T00:00:00.000Z',
  }
}

const privateListingRows = [
  privateListingRow({
    id: PROFILE_LISTING_ID,
    assignedAgentId: PROFILE_ID,
    assignedAgentEmail: 'agent@example.test',
    askingPrice: 1000000,
  }),
  privateListingRow({
    id: ALIAS_LISTING_ID,
    assignedAgentId: ALIAS_ID,
    assignedAgentEmail: 'alias@example.test',
    askingPrice: 2000000,
  }),
  privateListingRow({
    id: EMAIL_LISTING_ID,
    assignedAgentId: OTHER_AGENT_ID,
    assignedAgentEmail: 'agent@example.test',
    askingPrice: 3000000,
    isActive: false,
  }),
]

globalThis.fetch = async (input) => {
  const url = requestUrl(input)
  const request = requestSummary(url)
  requests.push(request)

  if (request.table === 'private_listings') {
    if (responseMode === 'missing-agent-email' && request.select.includes('assigned_agent_email')) {
      return jsonResponse(
        {
          code: '42703',
          message: 'column private_listings.assigned_agent_email does not exist',
        },
        { status: 400, statusText: 'Bad Request' },
      )
    }

    const rows = responseMode === 'missing-agent-email'
      ? privateListingRows.slice(0, 2).map(({ assigned_agent_email, ...row }) => row)
      : privateListingRows
    return jsonResponse(rows)
  }

  if (request.table === 'private_listing_seller_onboarding') {
    return jsonResponse([
      {
        private_listing_id: ALIAS_LISTING_ID,
        form_data: {
          commissionType: 'percentage',
          commissionPercentage: '5',
        },
      },
    ])
  }

  return jsonResponse([])
}

function getDashboardPrivateListingLoader() {
  const start = dashboardSource.indexOf('async function fetchAgentDashboardPrivateListings')
  const end = dashboardSource.indexOf('\nfunction getAppointmentDateValue', start)
  assert.ok(start >= 0 && end > start, 'the Agent dashboard private-listing loader must remain discoverable')
  return dashboardSource.slice(start, end)
}

function privateListingRequests() {
  return requests.filter((request) => request.table === 'private_listings')
}

function onboardingRequests() {
  return requests.filter((request) => request.table === 'private_listing_seller_onboarding')
}

function assertScopedSummaryRequest(request, { includesEmail = true } = {}) {
  assert.equal(
    request.url.searchParams.get('organisation_id'),
    `eq.${ORGANISATION_ID}`,
    'the compact listing query must be scoped to the active organisation',
  )
  assert.equal(request.select.includes('*'), false, 'the dashboard must not issue a select(*) private-listing read')
  assert.match(request.select, /assigned_agent_id/, 'the compact read must retain assignment identity')
  assert.match(request.select, /is_active/, 'the compact read must retain active-listing state')

  const assignmentFilter = request.url.searchParams.get('or') || request.url.searchParams.get('assigned_agent_id') || ''
  const expectedAliasFilter = `in.(${PROFILE_ID},${ALIAS_ID})`
  assert.equal(
    assignmentFilter.includes(`assigned_agent_id.${expectedAliasFilter}`) || assignmentFilter === expectedAliasFilter,
    true,
    'the compact read must include both canonical and membership alias assignment IDs',
  )
  if (includesEmail) {
    assert.match(request.select, /assigned_agent_email/, 'the compact read must retain legacy assignment email')
    assert.match(
      assignmentFilter,
      /assigned_agent_email\.eq\."agent@example\.test"/,
      'the compact read must retain legacy email assignments in the same query',
    )
  } else {
    assert.equal(request.select.includes('assigned_agent_email'), false, 'the compatibility retry must omit the missing email column')
    assert.equal(assignmentFilter.includes('assigned_agent_email'), false, 'the compatibility retry must remain ID-scoped')
  }
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const dashboardPrivateListingLoader = getDashboardPrivateListingLoader()
  assert.match(
    dashboardPrivateListingLoader,
    /getAgentPrivateListingSummaries\(profile\.id,\s*\{/,
    'the Agent dashboard must use the compact private-listing summary loader',
  )
  assert.doesNotMatch(
    dashboardPrivateListingLoader,
    /getAgentPrivateListings\(/,
    'the Agent dashboard KPI loader must not invoke the full listing hydrator',
  )
  assert.match(
    dashboardPrivateListingLoader,
    /assignedAgentIds:\s*assignmentIds/,
    'the compact dashboard read must retain membership alias IDs',
  )
  assert.match(
    dashboardPrivateListingLoader,
    /assignedAgentEmail:\s*profile\.email/,
    'the compact dashboard read must retain legacy email assignments',
  )
  assert.match(
    dashboardPrivateListingLoader,
    /includeCommissionTerms:\s*true/,
    'the dashboard summary must preserve custom mandate commission forecasts',
  )
  assert.match(
    dashboardPrivateListingLoader,
    /listOrganisationUserAssignmentAliases\(/,
    'the dashboard must use the compact membership alias lookup',
  )
  assert.doesNotMatch(
    dashboardPrivateListingLoader,
    /listOrganisationUsers\(/,
    'the dashboard must not hydrate the full organisation directory for KPI aliases',
  )
  assert.match(
    settingsApiSource,
    /select\('id, user_id, email'\)/,
    'the alias lookup must remain a small projection without avatar/profile enrichment',
  )

  const { getAgentPrivateListingSummaries } = await server.ssrLoadModule('/src/services/privateListingService.js')
  const rows = await getAgentPrivateListingSummaries(PROFILE_ID, {
    organisationId: ORGANISATION_ID,
    assignedAgentIds: [ALIAS_ID],
    assignedAgentEmail: 'Agent@Example.Test',
    includeCommissionTerms: true,
  })

  assert.equal(privateListingRequests().length, 1, 'the union of ID aliases and legacy email must use one compact listing request')
  assertScopedSummaryRequest(privateListingRequests()[0])
  assert.equal(onboardingRequests().length, 1, 'commission preservation may use one batched onboarding read')
  assert.equal(
    onboardingRequests()[0].select,
    'private_listing_id,form_data',
    'the commission preservation read must request only the listing link and form data',
  )
  assert.deepEqual(
    new Set(requests.map((request) => request.table)),
    new Set(['private_listings', 'private_listing_seller_onboarding']),
    'the dashboard summary path must not fan out to documents, publication, external links, or mandate packets',
  )

  const rowsById = new Map(rows.map((row) => [row.id, row]))
  assert.equal(rowsById.size, 3, 'the summary must retain canonical-ID, alias-ID, and legacy-email listing rows')
  assert.equal(rowsById.get(PROFILE_LISTING_ID)?.askingPrice, 1000000, 'the summary must retain pipeline value')
  assert.equal(rowsById.get(PROFILE_LISTING_ID)?.isActive, true, 'the summary must retain active-listing state')
  assert.equal(rowsById.get(EMAIL_LISTING_ID)?.assignedAgentEmail, 'agent@example.test', 'the summary must retain the legacy assignment email')
  assert.equal(rowsById.get(ALIAS_LISTING_ID)?.commission?.commission_percentage, '5', 'the summary must retain custom commission terms')

  requests.length = 0
  responseMode = 'missing-agent-email'
  const compatibilityRows = await getAgentPrivateListingSummaries(PROFILE_ID, {
    organisationId: ORGANISATION_ID,
    assignedAgentIds: [ALIAS_ID],
    assignedAgentEmail: 'agent@example.test',
  })

  assert.equal(privateListingRequests().length, 2, 'a stale email column must retry once without broadening the listing scope')
  assertScopedSummaryRequest(privateListingRequests()[0])
  assertScopedSummaryRequest(privateListingRequests()[1], { includesEmail: false })
  assert.equal(onboardingRequests().length, 0, 'the default compact summary must not load onboarding data')
  assert.deepEqual(
    new Set(compatibilityRows.map((row) => row.id)),
    new Set([PROFILE_LISTING_ID, ALIAS_LISTING_ID]),
    'the compatibility retry must retain canonical and alias ID assignments while omitting unavailable email filtering',
  )

  console.log('agent dashboard Phase 5 private-listing summary tests passed')
} finally {
  globalThis.fetch = originalFetch
  await server.close()
}
