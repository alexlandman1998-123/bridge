import assert from 'node:assert/strict'
import {
  RENTAL_PERFORMANCE_METRICS, buildRentalPerformanceReport, createRentalPerformanceTrace,
  evaluateRentalPerformanceSample, persistRentalPerformanceSample, summarizeRentalResources,
} from '../rentalPerformanceTelemetry.js'

const origin = 'https://project.supabase.co'
const baseline = [{ name: `${origin}/rest/v1/rental_units?select=id`, startTime: 10, responseEnd: 20, duration: 10, transferSize: 100 }]
const resources = [
  ...baseline,
  { name: `${origin}/rest/v1/rental_vacancies?select=id`, startTime: 110, responseEnd: 160, duration: 50, transferSize: 900 },
  { name: `${origin}/rest/v1/telemetry_events`, startTime: 120, responseEnd: 130, duration: 10, transferSize: 200 },
]

assert.deepEqual(summarizeRentalResources({ entries: resources, baselineEntries: baseline, startedAt: 100, endedAt: 200 }), { available: true, requestCount: 1, payloadBytes: 900, slowestRequestMs: 50 })

let entries = baseline
const trace = createRentalPerformanceTrace({ metricName: RENTAL_PERFORMANCE_METRICS.routeFirstData, route: '/agent/rentals/listings/123e4567-e89b-12d3-a456-426614174000?token=nope', performanceApi: { now: () => entries === baseline ? 100 : 700, getEntriesByType: () => entries } })
entries = resources
const sample = trace.finish({ outcome: 'success' })
assert.equal(sample.route, '/agent/rentals/listings/:id')
assert.equal(sample.durationMs, 600)
assert.equal(evaluateRentalPerformanceSample(sample).pass, true)

const failed = { ...sample, durationMs: 3500, resources: { requestCount: 13, payloadBytes: 900_000 } }
assert.deepEqual(evaluateRentalPerformanceSample(failed).violations, ['duration_ms', 'request_count', 'payload_bytes'])

const metrics = []
const events = []
const persisted = persistRentalPerformanceSample(failed, { userId: 'user-1', workspaceId: 'workspace-1', transport: (payload) => metrics.push(payload), telemetryTransport: (payload) => events.push(payload) })
assert.equal(persisted.persisted, true)
assert.equal(persisted.alerted, true)
assert.equal(metrics.length, 1)
assert.equal(events[0].eventName, 'rental_performance_budget_breached')

const report = buildRentalPerformanceReport([sample, failed])
assert.equal(report.byMetric[RENTAL_PERFORMANCE_METRICS.routeFirstData].failedCount, 1)
assert.equal(report.byMetric[RENTAL_PERFORMANCE_METRICS.routeFirstData].p95DurationMs, 3500)
console.log('Rental performance telemetry tests passed.')
