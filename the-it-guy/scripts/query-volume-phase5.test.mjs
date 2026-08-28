import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { buildQueryDatabaseDelta } from '../src/services/observability/queryPerformanceBudget.js'

test('database snapshot deltas compare counters without exposing query text', () => {
  const previous = {
    captured_at: '2026-08-27T00:00:00.000Z',
    stats_reset: '2026-08-26T00:00:00.000Z',
    statements: [{ queryId: '123', calls: 10, totalExecTimeMs: 250 }],
  }
  const current = {
    captured_at: '2026-08-27T01:00:00.000Z',
    stats_reset: previous.stats_reset,
    statements: [{ queryId: '123', calls: 16, totalExecTimeMs: 400 }],
  }

  assert.deepEqual(buildQueryDatabaseDelta(previous, current).statements, [
    { queryId: '123', calls: 6, totalExecTimeMs: 150 },
  ])
  assert.equal(buildQueryDatabaseDelta(previous, current).elapsedHours, 1)
  assert.equal(buildQueryDatabaseDelta(previous, { ...current, stats_reset: 'changed' }).comparable, false)
})

test('Phase 5 monitor captures once, writes evidence, and fails closed in strict mode', async () => {
  const monitor = await readFile(new URL('./monitor-query-performance-phase5.mjs', import.meta.url), 'utf8')

  assert.equal((monitor.match(/\.rpc\('capture_query_baseline_database_snapshot'\)/g) || []).length, 1)
  assert.match(monitor, /Promise\.all\(\[/)
  assert.match(monitor, /writeFile\(outputPath/)
  assert.match(monitor, /\.\.\.evaluation,\s+contract: MONITOR_CONTRACT/)
  assert.match(monitor, /if \(strict && report\.status !== 'PASS'\) process\.exitCode = 1/)
  assert.doesNotMatch(monitor, /VITE_SUPABASE_SERVICE_ROLE_KEY|setInterval|setTimeout/)
})

test('Phase 5 workflow runs every six hours and preserves evidence on failure', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/query-performance-monitor.yml', import.meta.url),
    'utf8',
  )

  assert.match(workflow, /cron: '23 \*\/6 \* \* \*'/)
  assert.match(workflow, /environment: production/)
  assert.match(workflow, /SUPABASE_PRODUCTION_SERVICE_ROLE_KEY/)
  assert.match(workflow, /if: always\(\)/)
  assert.match(workflow, /actions\/upload-artifact@v4/)
  assert.doesNotMatch(workflow, /VITE_SUPABASE|pull_request|push:/)
})
