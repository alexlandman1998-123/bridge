import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')

const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const hoursArg = process.argv.find((arg) => arg.startsWith('--hours='))
const hours = Math.max(1, Number(hoursArg?.split('=')[1]) || 24)

if (!url || !serviceRoleKey) {
  throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

function percentile(values, fraction) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] * 10) / 10
}

function databaseDelta(previous, current) {
  if (!previous || !current || previous.stats_reset !== current.stats_reset) {
    return { comparable: false, reason: previous ? 'pg_stat_statements_reset_changed' : 'first_snapshot' }
  }
  const prior = new Map((previous.statements || []).map((row) => [row.queryId, row]))
  const deltas = (current.statements || []).map((row) => {
    const before = prior.get(row.queryId) || {}
    return {
      queryId: row.queryId,
      calls: Math.max(0, Number(row.calls || 0) - Number(before.calls || 0)),
      totalExecTimeMs: Math.max(0, Number(row.totalExecTimeMs || 0) - Number(before.totalExecTimeMs || 0)),
      rows: Math.max(0, Number(row.rows || 0) - Number(before.rows || 0)),
    }
  })
  return {
    comparable: true,
    elapsedHours: Math.round(((new Date(current.captured_at) - new Date(previous.captured_at)) / 3_600_000) * 10) / 10,
    topByCalls: [...deltas].sort((left, right) => right.calls - left.calls).slice(0, 20),
    topByExecutionTime: [...deltas].sort((left, right) => right.totalExecTimeMs - left.totalExecTimeMs).slice(0, 20),
  }
}

const client = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
const since = new Date(Date.now() - hours * 3_600_000).toISOString()
const metricResult = await client
  .from('performance_metrics')
  .select('created_at,route,duration_ms,value,metadata')
  .eq('metric_name', 'query_baseline.window')
  .gte('created_at', since)
  .order('created_at', { ascending: true })
  .limit(10_000)

if (metricResult.error) throw metricResult.error

let databaseSnapshot = { captured: false, reason: 'snapshot_migration_not_deployed' }
const captureResult = await client.rpc('capture_query_baseline_database_snapshot')
if (!captureResult.error) {
  const snapshotsResult = await client
    .from('query_baseline_database_snapshots')
    .select('id,captured_at,stats_reset,statements')
    .order('captured_at', { ascending: false })
    .limit(2)
  if (!snapshotsResult.error) {
    const [current, previous] = snapshotsResult.data || []
    databaseSnapshot = {
      captured: true,
      snapshotId: captureResult.data,
      statsReset: current?.stats_reset || null,
      delta: databaseDelta(previous, current),
    }
  } else {
    databaseSnapshot = { captured: true, reason: snapshotsResult.error.message }
  }
} else {
  databaseSnapshot = { captured: false, reason: captureResult.error.message }
}

const rows = metricResult.data || []
const metadata = rows.map((row) => row.metadata || {})
const resourceCounts = new Map()
for (const window of metadata) {
  for (const item of window.topResources || []) {
    resourceCounts.set(item.resource, (resourceCounts.get(item.resource) || 0) + Number(item.count || 0))
  }
}

const report = {
  contract: 'arch9-query-baseline-report-v1',
  generatedAt: new Date().toISOString(),
  windowHours: hours,
  sampledWindows: rows.length,
  requestsPerMinute: {
    p50: percentile(rows.map((row) => Number(row.value || 0)), 0.5),
    p95: percentile(rows.map((row) => Number(row.value || 0)), 0.95),
  },
  requestLatencyMs: {
    p50: percentile(metadata.map((row) => Number(row.requestP50Ms || 0)), 0.5),
    p95: percentile(metadata.map((row) => Number(row.requestP95Ms || 0)), 0.95),
  },
  totals: {
    requests: metadata.reduce((sum, row) => sum + Number(row.requestCount || 0), 0),
    routeLoadRequests: metadata.reduce((sum, row) => sum + Number(row.routeLoadRequests || 0), 0),
    idleRequests: metadata.reduce((sum, row) => sum + Number(row.idleRequests || 0), 0),
    errors: metadata.reduce((sum, row) => sum + Number(row.errorCount || 0), 0),
    schemaErrors: metadata.reduce((sum, row) => sum + Number(row.schemaErrorCount || 0), 0),
    peakRealtimeChannels: Math.max(0, ...metadata.map((row) => Number(row.peakRealtimeChannels || 0))),
  },
  topResources: [...resourceCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 20)
    .map(([resource, count]) => ({ resource, count })),
  databaseSnapshot,
}

console.log(JSON.stringify(report, null, 2))
