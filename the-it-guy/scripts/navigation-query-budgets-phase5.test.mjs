import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { resolveOrganisationContextOnce, __organisationContextRuntimeTestUtils } from '../src/lib/organisationContextRuntime.js'
import { createSupabaseRequestCoordinator } from '../src/lib/supabaseRequestCoordinator.js'
import {
  createNavigationPerformanceTracker,
  evaluateNavigationQueryBudget,
  NAVIGATION_QUERY_BUDGET,
} from '../src/services/observability/navigationPerformanceBudget.js'

const appSource = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')
const reportContainmentSource = await readFile(new URL('./reports-phase0-containment.test.mjs', import.meta.url), 'utf8')
const routePrefetchSource = await readFile(new URL('../src/lib/routePrefetch.js', import.meta.url), 'utf8')
const performanceBudgetSource = await readFile(new URL('../src/services/observability/navigationPerformanceBudget.js', import.meta.url), 'utf8')

test.afterEach(() => {
  __organisationContextRuntimeTestUtils.reset()
})

test('Phase 5 publishes the agreed hard budgets', () => {
  assert.equal(NAVIGATION_QUERY_BUDGET.reportQueriesWhileDisabled.limit, 0)
  assert.equal(NAVIGATION_QUERY_BUDGET.organisationContextResolutionsPerSession.limit, 1)
  assert.equal(NAVIGATION_QUERY_BUDGET.duplicateIdenticalRequestsInFlight.limit, 0)
  assert.equal(NAVIGATION_QUERY_BUDGET.menuFeedbackMs.limit, 100)
  assert.equal(NAVIGATION_QUERY_BUDGET.cachedRouteVisibleMs.limit, 500)
  assert.equal(NAVIGATION_QUERY_BUDGET.firstRouteVisibleMs.limit, 1500)
})

test('budget evaluation fails on query or navigation regressions', () => {
  const pass = evaluateNavigationQueryBudget({
    reportQueriesWhileDisabled: 0,
    organisationContextResolutionsPerSession: 1,
    duplicateIdenticalRequestsInFlight: 0,
    menuFeedbackMs: 100,
    routeVisibleMs: 500,
    cached: true,
  })
  assert.equal(pass.status, 'PASS')

  const failure = evaluateNavigationQueryBudget({
    reportQueriesWhileDisabled: 1,
    organisationContextResolutionsPerSession: 2,
    duplicateIdenticalRequestsInFlight: 1,
    menuFeedbackMs: 101,
    routeVisibleMs: 1501,
    cached: false,
  })
  assert.equal(failure.status, 'FAIL')
  assert.deepEqual(failure.violations.map(({ metric }) => metric), [
    'reportQueriesWhileDisabled',
    'organisationContextResolutionsPerSession',
    'duplicateIdenticalRequestsInFlight',
    'menuFeedbackMs',
    'firstRouteVisibleMs',
  ])
})

test('navigation measurements classify cached and first visits at React commit time', () => {
  let clock = 0
  const emitted = []
  const tracker = createNavigationPerformanceTracker({ now: () => clock, onMeasurement: (item) => emitted.push(item) })

  const cachedId = tracker.start({ target: '/pipeline', label: 'Pipeline', cached: true })
  clock = 80
  tracker.feedback(cachedId)
  clock = 450
  assert.equal(tracker.complete(cachedId).budget.status, 'PASS')

  const firstId = tracker.start({ target: '/listings', label: 'Listings', cached: false })
  clock = 560
  tracker.feedback(firstId)
  clock = 2051
  const slowFirstVisit = tracker.complete(firstId)
  assert.equal(slowFirstVisit.menuFeedbackMs, 110)
  assert.equal(slowFirstVisit.routeVisibleMs, 1601)
  assert.equal(slowFirstVisit.budget.status, 'FAIL')
  assert.equal(emitted.length, 2)
})

test('organisation context resolves once and identical in-flight reads issue one network request', async () => {
  let contextLoads = 0
  await Promise.all([
    resolveOrganisationContextOnce(async () => {
      contextLoads += 1
      await Promise.resolve()
      return { organisation: { id: 'workspace-1' } }
    }),
    resolveOrganisationContextOnce(async () => {
      contextLoads += 1
      return { organisation: { id: 'workspace-1' } }
    }),
  ])
  assert.equal(contextLoads, 1)

  let fetches = 0
  const coordinatedFetch = createSupabaseRequestCoordinator(async () => {
    fetches += 1
    await Promise.resolve()
    return { clone: () => ({ ok: true }) }
  })
  const url = 'https://project.supabase.co/rest/v1/transactions?select=id'
  await Promise.all([coordinatedFetch(url), coordinatedFetch(url)])
  assert.equal(fetches, 1)
})

test('runtime instrumentation is bounded, local-only, and attached to visible navigation states', () => {
  assert.match(appSource, /startNavigationMeasurement\(\{/)
  assert.match(appSource, /<NavigationFeedbackMarker measurementId=\{pendingRouteNavigation\.measurementId\} \/>/)
  assert.match(appSource, /completeNavigationMeasurement\(pendingNavigation\.measurementId\)/)
  assert.match(routePrefetchSource, /export function isRouteModuleReady/)
  assert.match(routePrefetchSource, /export function markRouteModuleReady/)
  assert.match(performanceBudgetSource, /MAX_SESSION_MEASUREMENTS = 50/)
  assert.match(performanceBudgetSource, /window\.sessionStorage\.setItem/)
  assert.doesNotMatch(performanceBudgetSource, /fetch\(|supabase|setInterval|setTimeout/)
})

test('Reports zero-query containment remains an enforced prerequisite', () => {
  assert.match(reportContainmentSource, /query-owning components while locked/)
  assert.match(reportContainmentSource, /assert\.doesNotMatch\(appSource/)
  assert.match(reportContainmentSource, /pages\\\/Report/)
})
