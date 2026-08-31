import assert from 'node:assert/strict'
import { buildAgentPerformanceBaselineReport, renderAgentPerformanceBaselineMarkdown } from './collect-agent-performance-baseline.mjs'
import { summarizeAgentRouteResources } from '../src/services/observability/agentRoutePerformanceBaseline.js'

const metrics = []
for (const temperature of ['cold', 'warm']) {
  for (let index = 0; index < 20; index += 1) {
    metrics.push({ metric_name: 'agent_clients.route.core_ready', duration_ms: 1200 + index, metadata: { temperature } })
    metrics.push({ metric_name: 'agent_clients.route.settled', duration_ms: 2200 + index, metadata: { temperature, requestCount: 4, slowRequestCount: 0 } })
  }
}

const report = buildAgentPerformanceBaselineReport(metrics, { minimumSamples: 20 })
const clientRows = report.rows.filter((row) => row.surface === 'clients')
assert.equal(clientRows.filter((row) => row.coverage === 'COMPLETE').length, 4)
assert.equal(clientRows.every((row) => row.status === 'PASS'), true)
assert.equal(report.status, 'INSUFFICIENT_DATA', 'Other primary surfaces must prevent a false green baseline.')
assert.match(renderAgentPerformanceBaselineMarkdown(report), /A complete baseline requires 20 cold and 20 warm samples/)

const resources = summarizeAgentRouteResources({
  startedAt: 10,
  performanceApi: {
    getEntriesByType: () => [
      { name: 'https://abc.supabase.co/rest/v1/clients?select=*', startTime: 11, duration: 1200, transferSize: 100 },
      { name: 'https://abc.supabase.co/rest/v1/clients?select=id', startTime: 12, duration: 200, transferSize: 50 },
      { name: 'https://app.arch9.co.za/assets/app.js', startTime: 13, duration: 50, transferSize: 300 },
    ],
  },
})
assert.equal(resources.requestCount, 2)
assert.equal(resources.duplicateRequestCount, 1)
assert.equal(resources.slowRequestCount, 1)
assert.deepEqual(resources.slowestRequests[0], { path: 'abc.supabase.co/rest/v1/clients', durationMs: 1200 })

console.log('Agent performance baseline checks passed.')
