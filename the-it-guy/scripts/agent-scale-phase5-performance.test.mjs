import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildAgentPerformanceBaselineReport } from './collect-agent-performance-baseline.mjs'

const budgets = JSON.parse(readFileSync('config/agent-scale-phase5-performance-budgets.json', 'utf8'))
const routeBaseline = readFileSync('src/services/observability/agentRoutePerformanceBaseline.js', 'utf8')
const pipeline = readFileSync('src/pages/agency/AgencyPipelinePage.jsx', 'utf8')
const collector = readFileSync('scripts/collect-agent-performance-baseline.mjs', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))

assert.equal(budgets.contract, 'arch9-agent-scale-phase5-performance-budgets-v1')
assert.equal(budgets.minimumSamplesPerTemperature, 20)
assert.match(routeBaseline, /calendar: Object\.freeze\(\{ route: '\/pipeline\/calendar'/)
assert.match(pipeline, /createAgentRoutePerformanceBaseline\(\{ surface: 'calendar'/)
assert.match(pipeline, /skipNextCalendarRangeReloadRef\.current = isCalendarMode/)
assert.match(pipeline, /data-testid="agent-calendar-ready"/)
assert.match(collector, /'calendar'/)

const passing = []
for (const temperature of ['cold', 'warm']) {
  for (let index = 0; index < budgets.minimumSamplesPerTemperature; index += 1) {
    passing.push({ metric_name: 'agent_calendar.route.core_ready', duration_ms: 1800 + index, metadata: { temperature } })
    passing.push({
      metric_name: 'agent_calendar.route.settled',
      duration_ms: 3000 + index,
      metadata: { temperature, requestCount: 6, duplicateRequestCount: 0, slowRequestCount: 0, transferredBytes: 250000 },
    })
  }
}
const passingRows = buildAgentPerformanceBaselineReport(passing, { minimumSamples: 20 }).rows.filter((row) => row.surface === 'calendar')
assert.equal(passingRows.length, 4)
assert.equal(passingRows.every((row) => row.coverage === 'COMPLETE' && row.status === 'PASS'), true)

const insufficientRows = buildAgentPerformanceBaselineReport(passing.slice(0, 4), { minimumSamples: 20 }).rows.filter((row) => row.surface === 'calendar')
assert.equal(insufficientRows.some((row) => row.coverage === 'INSUFFICIENT'), true)

const duplicateFailure = passing.map((metric) => metric.metric_name === 'agent_calendar.route.settled'
  ? { ...metric, metadata: { ...metric.metadata, duplicateRequestCount: 1 } }
  : metric)
const failedRows = buildAgentPerformanceBaselineReport(duplicateFailure, { minimumSamples: 20 }).rows.filter((row) => row.surface === 'calendar' && row.checkpoint === 'settled')
assert.equal(failedRows.every((row) => row.status === 'FAIL'), true, 'Duplicate Calendar requests must fail the Phase 5 budget.')

assert.equal(typeof packageJson.scripts['test:agent-scale-phase5'], 'string')
assert.match(packageJson.scripts['verify:agent-scale-phase5'], /verify:agent-scale-phase4/)
assert.match(packageJson.scripts['acceptance:agent-scale-phase5'], /--minimum-samples=20/)
assert.match(packageJson.scripts['acceptance:agent-scale-phase5'], /--fail-on-insufficient/)

console.log('Agent scale Phase 5 performance checks passed.')
