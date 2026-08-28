import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

import {
  evaluateQueryPerformanceGovernance,
  partitionQueryGovernanceEvidence,
  QUERY_GOVERNANCE_CONTRACT,
  renderQueryPerformanceGovernanceSummary,
} from '../src/services/observability/queryPerformanceGovernance.js'
import { evaluateQueryReleaseBudget } from '../src/services/observability/queryPerformanceBudget.js'

const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')

const strict = process.argv.includes('--strict')
const hoursArg = process.argv.find((arg) => arg.startsWith('--period-hours='))
const outputArg = process.argv.find((arg) => arg.startsWith('--output='))
const summaryArg = process.argv.find((arg) => arg.startsWith('--summary='))
const periodHours = Math.max(1, Number(hoursArg?.split('=')[1]) || 24)
const outputPath = outputArg ? resolve(outputArg.slice('--output='.length)) : null
const summaryPath = summaryArg ? resolve(summaryArg.slice('--summary='.length)) : null
const githubSummaryPath = String(process.env.GITHUB_STEP_SUMMARY || '').trim()
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

  const now = Date.now()
  const since = new Date(now - periodHours * 2 * 3_600_000).toISOString()
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
      .limit(10),
  ])

  if (metricsResult.error) throw new Error(`Telemetry read failed: ${metricsResult.error.message}`)
  if (snapshotsResult.error) throw new Error(`Database snapshot read failed: ${snapshotsResult.error.message}`)

  const periods = partitionQueryGovernanceEvidence({
    windows: metricsResult.data || [],
    snapshots: snapshotsResult.data || [],
    now,
    periodHours,
  })
  const current = evaluateQueryReleaseBudget({
    windows: periods.current.windows,
    databaseDelta: periods.current.databaseDelta,
    now,
  })
  const baseline = evaluateQueryReleaseBudget({
    windows: periods.baseline.windows,
    databaseDelta: periods.baseline.databaseDelta,
    now,
  })
  const governance = evaluateQueryPerformanceGovernance({ current, baseline })

  return {
    ...governance,
    generatedAt: new Date(now).toISOString(),
    periodHours,
    databaseSnapshotCaptured: true,
    periods: {
      current: {
        startedAt: periods.current.startedAt,
        endedAt: periods.current.endedAt,
        evaluation: current,
      },
      baseline: {
        startedAt: periods.baseline.startedAt,
        endedAt: periods.baseline.endedAt,
        evaluation: baseline,
      },
    },
  }
}

let report
try {
  report = await collectReport()
} catch (error) {
  report = {
    contract: QUERY_GOVERNANCE_CONTRACT,
    status: 'ERROR',
    ready: false,
    generatedAt: new Date().toISOString(),
    periodHours,
    databaseSnapshotCaptured: false,
    error: safeError(error),
    incident: {
      required: true,
      title: 'Query performance monitor execution failed',
      actions: ['Inspect the workflow error and restore telemetry collection before accepting another release.'],
    },
  }
}

const serialized = `${JSON.stringify(report, null, 2)}\n`
const markdown = renderQueryPerformanceGovernanceSummary(report)
if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, serialized, 'utf8')
}
if (summaryPath) {
  await mkdir(dirname(summaryPath), { recursive: true })
  await writeFile(summaryPath, markdown, 'utf8')
}
if (githubSummaryPath && resolve(githubSummaryPath) !== summaryPath) {
  await appendFile(githubSummaryPath, markdown, 'utf8')
}
process.stdout.write(serialized)

if (strict && report.status !== 'PASS') process.exitCode = 1
