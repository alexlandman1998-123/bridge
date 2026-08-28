import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

import {
  buildQueryDatabaseDelta,
  evaluateQueryReleaseBudget,
} from '../src/services/observability/queryPerformanceBudget.js'

const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')

const MONITOR_CONTRACT = 'arch9-query-performance-monitor-v1'
const strict = process.argv.includes('--strict')
const hoursArg = process.argv.find((arg) => arg.startsWith('--hours='))
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))
const hours = Math.max(1, Number(hoursArg?.split('=')[1]) || 48)
const outputPath = outputArg ? resolve(outputArg.slice('--output='.length)) : null
const url = String(process.env.SUPABASE_URL || '').trim()
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

function safeError(error) {
  return String(error?.message || error || 'Unknown monitor error').slice(0, 500)
}

async function collectReport() {
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const captureResult = await client.rpc('capture_query_baseline_database_snapshot')
  if (captureResult.error) throw new Error(`Database snapshot capture failed: ${captureResult.error.message}`)

  const since = new Date(Date.now() - hours * 3_600_000).toISOString()
  const [metricsResult, snapshotsResult] = await Promise.all([
    client
      .from('performance_metrics')
      .select('created_at,metadata')
      .eq('metric_name', 'query_baseline.window')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(10_000),
    client
      .from('query_baseline_database_snapshots')
      .select('captured_at,stats_reset,statements')
      .order('captured_at', { ascending: false })
      .limit(2),
  ])

  if (metricsResult.error) throw new Error(`Telemetry read failed: ${metricsResult.error.message}`)
  if (snapshotsResult.error) throw new Error(`Database snapshot read failed: ${snapshotsResult.error.message}`)

  const [current, previous] = snapshotsResult.data || []
  const databaseDelta = buildQueryDatabaseDelta(previous, current)
  const evaluation = evaluateQueryReleaseBudget({
    windows: metricsResult.data || [],
    databaseDelta,
  })

  return {
    ...evaluation,
    contract: MONITOR_CONTRACT,
    generatedAt: new Date().toISOString(),
    windowHours: hours,
    databaseSnapshotCaptured: true,
    databaseSnapshotReason: databaseDelta.reason || null,
  }
}

let report
try {
  report = await collectReport()
} catch (error) {
  report = {
    contract: MONITOR_CONTRACT,
    status: 'ERROR',
    ready: false,
    generatedAt: new Date().toISOString(),
    windowHours: hours,
    databaseSnapshotCaptured: false,
    error: safeError(error),
  }
}

const serialized = `${JSON.stringify(report, null, 2)}\n`
if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, serialized, 'utf8')
}
process.stdout.write(serialized)

if (strict && report.status !== 'PASS') process.exitCode = 1
