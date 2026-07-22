import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

process.env.VITE_SUPABASE_URL = 'https://phase6-principal-dashboard.test.supabase.co'
process.env.VITE_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.phase6-principal-dashboard'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serviceSource = readFileSync(path.join(PROJECT_ROOT, 'src/services/principalDashboardService.js'), 'utf8')
const principalDashboardSource = readFileSync(path.join(PROJECT_ROOT, 'src/pages/PrincipalDashboard.jsx'), 'utf8')
const dashboardSource = readFileSync(path.join(PROJECT_ROOT, 'src/pages/Dashboard.jsx'), 'utf8')
const workspaceScopedCacheSource = readFileSync(path.join(PROJECT_ROOT, 'src/services/workspaceScopedCache.js'), 'utf8')
const originalFetch = globalThis.fetch
const originalConsoleTable = console.table
const requests = []

const ORGANISATION_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const BRANCH_ID = '44444444-4444-4444-8444-444444444444'
const ROOT_TABLES = new Set([
  'transactions',
  'leads',
  'document_packets',
  'document_packet_events',
  'organisation_users',
  'transaction_commissions',
  'commission_targets',
  'organisation_branches',
])
let responseMode = 'success'
let heldTransactionRequests = 0
let releaseHeldTransaction = null

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

function rootRequests() {
  return requests.filter((request) => ROOT_TABLES.has(request.table))
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  assert.fail(message)
}

globalThis.fetch = async (input) => {
  const url = requestUrl(input)
  const request = requestSummary(url)
  requests.push(request)

  if (responseMode === 'fail-transactions' && request.table === 'transactions') {
    return jsonResponse(
      { code: 'PGRST500', message: 'Synthetic Principal dashboard failure' },
      { status: 500, statusText: 'Internal Server Error' },
    )
  }

  if (
    responseMode === 'hold-first-transaction' &&
    request.table === 'transactions' &&
    heldTransactionRequests === 0
  ) {
    heldTransactionRequests += 1
    await new Promise((resolve) => {
      releaseHeldTransaction = resolve
    })
  }

  return jsonResponse([])
}

console.table = () => {}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    PRINCIPAL_DASHBOARD_CACHE_TTL_MS,
    clearPrincipalDashboardRuntimeCache,
    getPrincipalDashboardData,
  } = await server.ssrLoadModule('/src/services/principalDashboardService.js')

  assert.equal(PRINCIPAL_DASHBOARD_CACHE_TTL_MS, 12_000, 'the Principal result cache should stay short lived')
  assert.match(serviceSource, /principalDashboardInflight/, 'the service must track duplicate in-flight dashboard loads')
  assert.match(serviceSource, /principalDashboardRefreshInflight/, 'forced refreshes must coalesce as well')
  assert.match(serviceSource, /principalDashboardGlobalCacheEpoch/, 'a global cache reset must invalidate in-flight results too')
  assert.match(serviceSource, /actorId,\s*\n\s*actorEmail/, 'the cache key must retain the actor scope')
  assert.match(serviceSource, /workspaceId/, 'the cache key must retain the selected workspace')
  assert.match(serviceSource, /dateRange/, 'the cache key must retain the selected date range')
  assert.match(serviceSource, /overviewMode/, 'the cache key must retain the selected overview mode')
  assert.match(serviceSource, /canViewAllTransactions/, 'the cache key must retain the permission scope')

  assert.match(principalDashboardSource, /dashboardLoadSequenceRef/, 'the page must ignore stale dashboard responses')
  assert.match(principalDashboardSource, /loadDashboard\(\{ forceRefresh: true \}\)/, 'mutation events must bypass the result cache')
  assert.match(principalDashboardSource, /cacheHit: Boolean\(dashboardResult\?\.meta\?\.cacheHit\)/, 'Principal telemetry must record cache hits')
  assert.match(principalDashboardSource, /deduplicated: Boolean\(dashboardResult\?\.meta\?\.deduplicated\)/, 'Principal telemetry must record coalesced requests')
  assert.match(
    dashboardSource,
    /useEffect\(\(\) => \{\s+if \(isPrincipalAgentView\) return undefined\s+\s+function refreshDashboard/,
    'the parent Agent dashboard must not attach a duplicate refresh listener in Principal mode',
  )
  assert.match(
    workspaceScopedCacheSource,
    /bridge:workspace-scoped-cache-cleared/,
    'workspace, logout, and session resets must emit the runtime-cache reset signal',
  )
  assert.match(
    serviceSource,
    /addEventListener\('bridge:workspace-scoped-cache-cleared'/,
    'the Principal service must clear its runtime state when the workspace boundary resets',
  )

  const baseOptions = {
    agencyId: ORGANISATION_ID,
    workspaceId: 'all',
    dateRangePreset: 'last_30_days',
    overviewMode: 'overview',
    canViewAllTransactions: true,
    actorId: ACTOR_ID,
    actorEmail: 'principal@example.test',
  }

  clearPrincipalDashboardRuntimeCache({ agencyId: ORGANISATION_ID })
  requests.length = 0
  const [coldResult, coalescedResult] = await Promise.all([
    getPrincipalDashboardData(baseOptions),
    getPrincipalDashboardData(baseOptions),
  ])
  assert.equal(rootRequests().length, 8, 'two matching cold loads must share the eight root dashboard reads')
  assert.equal(coldResult?.meta?.cacheHit, undefined, 'the cold result must not be marked as a cache hit')
  assert.equal(coalescedResult?.meta?.deduplicated, true, 'the follower must be marked as an in-flight coalesced request')
  assert.deepEqual(
    new Set(rootRequests().map((request) => request.table)),
    ROOT_TABLES,
    'the compact empty-data path must retain exactly the expected root dashboard reads',
  )
  for (const request of rootRequests()) {
    assert.equal(
      request.url.searchParams.get('organisation_id'),
      `eq.${ORGANISATION_ID}`,
      `${request.table} must remain scoped to the resolved organisation`,
    )
  }

  const cachedResult = await getPrincipalDashboardData(baseOptions)
  assert.equal(rootRequests().length, 8, 'an identical sequential load must use the short-lived result cache')
  assert.equal(cachedResult?.meta?.cacheHit, true, 'the sequential result must be marked as a cache hit')

  const [, coalescedForceRefresh] = await Promise.all([
    getPrincipalDashboardData({ ...baseOptions, forceRefresh: true }),
    getPrincipalDashboardData({ ...baseOptions, forceRefresh: true }),
  ])
  assert.equal(rootRequests().length, 16, 'matching forced refreshes must still share one fresh root query set')
  assert.equal(coalescedForceRefresh?.meta?.deduplicated, true, 'the forced-refresh follower must be coalesced')

  await getPrincipalDashboardData({ ...baseOptions, workspaceId: BRANCH_ID })
  await getPrincipalDashboardData({ ...baseOptions, actorId: OTHER_ACTOR_ID })
  await getPrincipalDashboardData({ ...baseOptions, dateRangePreset: 'this_month' })
  await getPrincipalDashboardData({ ...baseOptions, overviewMode: 'pipeline' })
  assert.equal(rootRequests().length, 48, 'workspace, actor, date range, and overview changes must not share cached data')

  clearPrincipalDashboardRuntimeCache({ agencyId: ORGANISATION_ID })
  requests.length = 0
  heldTransactionRequests = 0
  releaseHeldTransaction = null
  responseMode = 'hold-first-transaction'
  const preInvalidationRefresh = getPrincipalDashboardData({ ...baseOptions, forceRefresh: true })
  await waitFor(
    () => typeof releaseHeldTransaction === 'function',
    'the first forced refresh should remain in flight for the invalidation race check',
  )
  responseMode = 'success'
  await getPrincipalDashboardData({ ...baseOptions, workspaceId: BRANCH_ID, forceRefresh: true })
  const latestRefresh = getPrincipalDashboardData({ ...baseOptions, forceRefresh: true })
  try {
    await waitFor(
      () => rootRequests().length >= 24,
      'a forced refresh after another filter invalidates the agency must issue a new root query set',
    )
    assert.equal(
      rootRequests().length,
      24,
      'a pre-invalidation forced request must not satisfy a later forced refresh for the same filter',
    )
  } finally {
    releaseHeldTransaction?.()
    await Promise.all([preInvalidationRefresh, latestRefresh])
  }

  clearPrincipalDashboardRuntimeCache()
  requests.length = 0
  heldTransactionRequests = 0
  releaseHeldTransaction = null
  responseMode = 'hold-first-transaction'
  const preBoundaryLoad = getPrincipalDashboardData(baseOptions)
  await waitFor(
    () => typeof releaseHeldTransaction === 'function',
    'the pre-boundary load should remain in flight while the workspace cache resets',
  )
  clearPrincipalDashboardRuntimeCache()
  responseMode = 'success'
  releaseHeldTransaction?.()
  await preBoundaryLoad
  await getPrincipalDashboardData(baseOptions)
  assert.equal(
    rootRequests().length,
    16,
    'a global workspace or logout cache reset must prevent an older in-flight load from repopulating the result cache',
  )

  clearPrincipalDashboardRuntimeCache({ agencyId: ORGANISATION_ID })
  requests.length = 0
  responseMode = 'fail-transactions'
  await assert.rejects(
    getPrincipalDashboardData({ ...baseOptions, dateRangePreset: 'failure-check' }),
    (error) => error?.message === 'Synthetic Principal dashboard failure',
    'a failed dashboard load must surface to the caller',
  )
  const failedRequestCount = rootRequests().length
  assert.equal(failedRequestCount, 8, 'the failed cold load must still issue one root query set')

  responseMode = 'success'
  await getPrincipalDashboardData({ ...baseOptions, dateRangePreset: 'failure-check' })
  assert.equal(
    rootRequests().length,
    failedRequestCount + 8,
    'failed loads must not remain cached or leave a stale in-flight promise behind',
  )

  console.log('Principal dashboard Phase 6 cache and refresh tests passed')
} finally {
  globalThis.fetch = originalFetch
  console.table = originalConsoleTable
  await server.close()
}
