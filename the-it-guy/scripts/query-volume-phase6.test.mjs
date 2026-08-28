import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  evaluateQueryPerformanceGovernance,
  partitionQueryGovernanceEvidence,
  renderQueryPerformanceGovernanceSummary,
} from '../src/services/observability/queryPerformanceGovernance.js'

const healthyEvaluation = {
  status: 'PASS',
  ready: true,
  metrics: {
    requestsPerMinuteP95: 10,
    routeLoadRequestsP95: 10,
    idleRequestsP95: 1,
    requestLatencyP95Ms: 300,
    errorRate: 0,
    peakRealtimeChannels: 2,
  },
  database: {
    maxStatementCallsPerHour: 100,
    maxStatementExecutionMsPerHour: 1000,
    totalExecutionMsPerHour: 5000,
  },
}

test('governance partitions current and baseline periods using existing evidence', () => {
  const now = Date.parse('2026-08-27T12:00:00.000Z')
  const at = (hoursAgo) => new Date(now - hoursAgo * 3_600_000).toISOString()
  const periods = partitionQueryGovernanceEvidence({
    now,
    windows: [1, 23, 25, 47].map((hoursAgo) => ({ created_at: at(hoursAgo), metadata: {} })),
    snapshots: [
      { captured_at: at(0), stats_reset: 'same', statements: [{ queryId: '1', calls: 300, totalExecTimeMs: 3000 }] },
      { captured_at: at(24), stats_reset: 'same', statements: [{ queryId: '1', calls: 200, totalExecTimeMs: 2000 }] },
      { captured_at: at(48), stats_reset: 'same', statements: [{ queryId: '1', calls: 100, totalExecTimeMs: 1000 }] },
    ],
  })

  assert.equal(periods.current.windows.length, 2)
  assert.equal(periods.baseline.windows.length, 2)
  assert.equal(periods.current.databaseDelta.elapsedHours, 24)
  assert.equal(periods.baseline.databaseDelta.elapsedHours, 24)
  assert.equal(periods.current.databaseDelta.statements[0].calls, 100)
})

test('governance blocks material current-period regressions', () => {
  const result = evaluateQueryPerformanceGovernance({
    baseline: healthyEvaluation,
    current: {
      ...healthyEvaluation,
      metrics: { ...healthyEvaluation.metrics, routeLoadRequestsP95: 14 },
    },
  })

  assert.equal(result.status, 'FAIL')
  assert.equal(result.incident.required, true)
  assert.deepEqual(result.regressions.map((item) => item.metric), ['routeLoadRequestsP95'])
  assert.match(renderQueryPerformanceGovernanceSummary(result), /routeLoadRequestsP95/)
})

test('governance fails closed until both comparison periods are ready', () => {
  const result = evaluateQueryPerformanceGovernance({
    baseline: { ...healthyEvaluation, ready: false, status: 'INSUFFICIENT_DATA' },
    current: healthyEvaluation,
  })
  assert.equal(result.status, 'INSUFFICIENT_DATA')
  assert.equal(result.ready, false)
})

test('Phase 6 reuses the six-hour monitor without adding database requests', async () => {
  const monitor = await readFile(new URL('./monitor-query-performance-phase6.mjs', import.meta.url), 'utf8')
  const workflow = await readFile(
    new URL('../../.github/workflows/query-performance-monitor.yml', import.meta.url),
    'utf8',
  )
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

  assert.equal((monitor.match(/\.rpc\('capture_query_baseline_database_snapshot'\)/g) || []).length, 1)
  assert.match(monitor, /Promise\.all\(\[/)
  assert.match(monitor, /\.limit\(10\)/)
  assert.match(monitor, /GITHUB_STEP_SUMMARY/)
  assert.doesNotMatch(monitor, /setInterval|setTimeout|VITE_SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(workflow, /cron: '23 \*\/6 \* \* \*'/)
  assert.match(workflow, /monitor:query-performance-phase6/)
  assert.match(workflow, /retention-days: 90/)
  assert.equal(packageJson.scripts['test:query-volume-phase6'], 'node --test scripts/query-volume-phase6.test.mjs')
})
