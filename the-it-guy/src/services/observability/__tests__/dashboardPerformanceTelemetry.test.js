import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DASHBOARD_PERFORMANCE_METRICS,
  DASHBOARD_PERFORMANCE_TELEMETRY_CONTRACT,
  buildDashboardPerformancePayload,
  createDashboardPerformanceTrace,
  persistDashboardPerformanceTrace,
  sampleDashboardNetworkRequests,
  summarizeDashboardPerformanceByRole,
  summarizeDashboardPerformanceRows,
} from '../dashboardPerformanceTelemetry.js'

test('samples only new, relevant Supabase resource requests without retaining URLs', () => {
  const origin = 'https://project.supabase.co'
  const baseline = [
    { name: `${origin}/rest/v1/organisations?select=id`, startTime: 10, responseEnd: 20, initiatorType: 'fetch' },
  ]
  const entries = [
    ...baseline,
    { name: `${origin}/rest/v1/transactions?select=*`, startTime: 120, responseEnd: 180, initiatorType: 'fetch' },
    { name: `${origin}/storage/v1/object/sign/brand/logo.png?token=secret`, startTime: 150, responseEnd: 210, initiatorType: 'fetch' },
    { name: `${origin}/rest/v1/performance_metrics`, startTime: 170, responseEnd: 190, initiatorType: 'fetch' },
    { name: 'https://analytics.example.test/collect', startTime: 170, responseEnd: 190, initiatorType: 'fetch' },
  ]

  const sample = sampleDashboardNetworkRequests(entries, {
    baselineEntries: baseline,
    startedAt: 100,
    endedAt: 250,
    resourceOrigin: origin,
  })

  assert.deepEqual(sample, {
    available: true,
    requestCount: 2,
    restRequestCount: 1,
    authRequestCount: 0,
    storageRequestCount: 1,
    functionRequestCount: 0,
    realtimeRequestCount: 0,
  })
  assert.doesNotMatch(JSON.stringify(sample), /transactions|secret|logo/i)
})

test('builds a privacy-safe aggregate payload from a trace', () => {
  const origin = 'https://project.supabase.co'
  let entries = []
  const trace = createDashboardPerformanceTrace({
    metricName: DASHBOARD_PERFORMANCE_METRICS.agentSummary,
    startedAt: 100,
    getEntries: () => entries,
    resourceOrigin: origin,
  })
  entries = [
    { name: `${origin}/rest/v1/transactions?assigned_agent_email=eq.agent@example.test`, startTime: 130, responseEnd: 160, initiatorType: 'fetch' },
  ]

  const payload = buildDashboardPerformancePayload(trace, {
    endedAt: 220,
    userId: 'user-123',
    workspaceId: 'workspace-123',
    route: '/dashboard?token=secret#details',
    appRole: 'agent',
    dashboardKind: 'agent',
    lifecycle: 'initial',
    outcome: 'success',
    preset: 'last_30_days',
    resultCount: 4,
    cacheHit: false,
    metadata: { email: 'agent@example.test', arbitrary: 'must-not-persist' },
    actorEmail: 'agent@example.test',
  })

  assert.equal(payload.metricName, DASHBOARD_PERFORMANCE_METRICS.agentSummary)
  assert.equal(payload.durationMs, 120)
  assert.equal(payload.value, 1)
  assert.equal(payload.unit, 'requests')
  assert.equal(payload.route, '/dashboard')
  assert.deepEqual(payload.metadata, {
    contract: DASHBOARD_PERFORMANCE_TELEMETRY_CONTRACT,
    appRole: 'agent',
    dashboardKind: 'agent',
    lifecycle: 'initial',
    outcome: 'success',
    preset: 'last_30_days',
    resourceTimingAvailable: true,
    cacheHit: false,
    resultCount: 4,
    requestCount: 1,
    restRequestCount: 1,
    authRequestCount: 0,
    storageRequestCount: 0,
    functionRequestCount: 0,
    realtimeRequestCount: 0,
  })
  assert.doesNotMatch(JSON.stringify(payload), /agent@example|secret|arbitrary/i)
})

test('persists through injected transports without awaiting or throwing', async () => {
  const trace = createDashboardPerformanceTrace({
    metricName: DASHBOARD_PERFORMANCE_METRICS.principalSummary,
    startedAt: 10,
    getEntries: () => [],
  })
  const performancePayloads = []
  const eventPayloads = []

  const result = persistDashboardPerformanceTrace(trace, {
    endedAt: 20,
    userId: 'user-123',
    workspaceId: 'workspace-123',
    route: '/dashboard',
    appRole: 'principal',
    dashboardKind: 'principal',
    lifecycle: 'retry',
    outcome: 'failed',
    transport(payload) {
      performancePayloads.push(payload)
      return Promise.reject(new Error('telemetry transport unavailable'))
    },
    telemetryTransport(payload) {
      eventPayloads.push(payload)
      return Promise.resolve()
    },
  })

  assert.equal(result.accepted, true)
  assert.equal(result.dispatched, true)
  assert.equal(result.errorDispatched, true)
  assert.equal(performancePayloads.length, 1)
  assert.equal(performancePayloads[0].durationMs, 10)
  assert.equal(eventPayloads.length, 1)
  assert.equal(eventPayloads[0].eventName, 'dashboard_performance_failed')
  await Promise.resolve()
})

test('summarizes successful dashboard samples by role with p50 and p95 timings and request counts', () => {
  const rows = [
    { metric_name: DASHBOARD_PERFORMANCE_METRICS.agentSummary, duration_ms: 100, value: 2, unit: 'requests', metadata: { appRole: 'agent', dashboardKind: 'agent', outcome: 'success' } },
    { metric_name: DASHBOARD_PERFORMANCE_METRICS.agentSummary, duration_ms: 200, value: 4, unit: 'requests', metadata: { appRole: 'agent', dashboardKind: 'agent', outcome: 'success' } },
    { metric_name: DASHBOARD_PERFORMANCE_METRICS.agentSummary, duration_ms: 300, value: 6, unit: 'requests', metadata: { appRole: 'agent', dashboardKind: 'agent', outcome: 'success' } },
    { metric_name: DASHBOARD_PERFORMANCE_METRICS.agentSummary, duration_ms: 400, value: 8, unit: 'requests', metadata: { appRole: 'agent', dashboardKind: 'agent', outcome: 'success' } },
    { metric_name: DASHBOARD_PERFORMANCE_METRICS.principalSummary, duration_ms: 1000, value: 18, unit: 'requests', metadata: { appRole: 'principal', dashboardKind: 'principal', outcome: 'success' } },
    { metric_name: DASHBOARD_PERFORMANCE_METRICS.principalSummary, duration_ms: 3000, value: 35, unit: 'requests', metadata: { appRole: 'principal', dashboardKind: 'principal', outcome: 'success' } },
    { metric_name: DASHBOARD_PERFORMANCE_METRICS.principalSummary, duration_ms: 40, value: 1, unit: 'requests', metadata: { appRole: 'principal', dashboardKind: 'principal', outcome: 'failed' } },
  ]

  const byRole = summarizeDashboardPerformanceByRole(rows)
  assert.deepEqual(byRole.agent, {
    sampleCount: 4,
    successfulCount: 4,
    failedCount: 0,
    p50DurationMs: 200,
    p95DurationMs: 400,
    averageDurationMs: 250,
    p50RequestCount: 4,
    p95RequestCount: 8,
    averageRequestCount: 5,
  })
  assert.deepEqual(byRole.principal, {
    sampleCount: 3,
    successfulCount: 2,
    failedCount: 1,
    p50DurationMs: 1000,
    p95DurationMs: 3000,
    averageDurationMs: 2000,
    p50RequestCount: 18,
    p95RequestCount: 35,
    averageRequestCount: 27,
  })

  const snapshot = summarizeDashboardPerformanceRows(rows)
  assert.equal(snapshot.contract, DASHBOARD_PERFORMANCE_TELEMETRY_CONTRACT)
  assert.equal(snapshot.summary.p95DurationMs, 3000)
  assert.equal(snapshot.byMetric[DASHBOARD_PERFORMANCE_METRICS.principalSummary].p95RequestCount, 35)
})
