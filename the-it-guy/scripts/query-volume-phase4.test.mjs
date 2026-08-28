import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  evaluateQueryReleaseBudget,
  evaluateQueryWindowBudget,
} from '../src/services/observability/queryPerformanceBudget.js'

const healthyWindow = {
  created_at: new Date().toISOString(),
  metadata: {
    requestCount: 20,
    requestsPerMinute: 12,
    routeLoadRequests: 8,
    idleRequests: 1,
    errorCount: 0,
    schemaErrorCount: 0,
    requestP95Ms: 250,
    peakRealtimeChannels: 2,
  },
}

const healthyDatabaseDelta = {
  comparable: true,
  elapsedHours: 1,
  topByCalls: [{ queryId: 'one', calls: 100, totalExecTimeMs: 1000 }],
  topByExecutionTime: [{ queryId: 'one', calls: 100, totalExecTimeMs: 1000 }],
}

test('individual query windows classify storms and schema failures', () => {
  assert.equal(evaluateQueryWindowBudget(healthyWindow.metadata).status, 'PASS')
  const storm = evaluateQueryWindowBudget({
    ...healthyWindow.metadata,
    idleRequests: 11,
    schemaErrorCount: 1,
  })
  assert.equal(storm.status, 'FAIL')
  assert.deepEqual(storm.violations.map((item) => item.metric), ['idleRequests', 'schemaErrorCount'])
})

test('release gate fails closed until telemetry and database coverage exist', () => {
  const evaluation = evaluateQueryReleaseBudget({ windows: [healthyWindow] })
  assert.equal(evaluation.status, 'INSUFFICIENT_DATA')
  assert.equal(evaluation.ready, false)
  assert.equal(evaluation.coverage.telemetry, false)
  assert.equal(evaluation.coverage.database, false)
})

test('healthy sampled windows and database deltas pass the release budget', () => {
  const windows = Array.from({ length: 12 }, (_, index) => ({
    ...healthyWindow,
    created_at: new Date(Date.now() - index * 60_000).toISOString(),
  }))
  const evaluation = evaluateQueryReleaseBudget({ windows, databaseDelta: healthyDatabaseDelta })
  assert.equal(evaluation.status, 'PASS')
  assert.equal(evaluation.ready, true)
  assert.deepEqual(evaluation.violations, [])
})

test('database query-volume regressions block the release budget', () => {
  const windows = Array.from({ length: 12 }, () => healthyWindow)
  const evaluation = evaluateQueryReleaseBudget({
    windows,
    databaseDelta: {
      ...healthyDatabaseDelta,
      topByCalls: [{ queryId: 'storm', calls: 6000, totalExecTimeMs: 1000 }],
    },
  })
  assert.equal(evaluation.status, 'FAIL')
  assert.ok(evaluation.violations.some((item) => item.metric === 'statementCallsPerHour'))
})

test('Phase 4 reporting is manual and does not add background query sources', async () => {
  const reporter = await readFile(
    new URL('./report-query-performance-phase4.mjs', import.meta.url),
    'utf8',
  )
  const telemetry = await readFile(
    new URL('../src/services/observability/queryBaselineTelemetry.js', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(reporter, /setInterval|cron|capture_query_baseline_database_snapshot/)
  assert.match(reporter, /if \(strict && evaluation\.status !== 'PASS'\) process\.exitCode = 1/)
  assert.match(telemetry, /budget: evaluateQueryWindowBudget\(summary\)/)
})
