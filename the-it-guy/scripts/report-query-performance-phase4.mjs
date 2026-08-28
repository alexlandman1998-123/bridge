import { createRequire } from 'node:module'

import {
  buildQueryDatabaseDelta,
  evaluateQueryReleaseBudget,
} from '../src/services/observability/queryPerformanceBudget.js'

const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')

const url = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const strict = process.argv.includes('--strict')
const hoursArg = process.argv.find((arg) => arg.startsWith('--hours='))
const hours = Math.max(1, Number(hoursArg?.split('=')[1]) || 24)

if (!url || !serviceRoleKey) {
  throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
}

const client = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
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

if (metricsResult.error) throw metricsResult.error
const snapshotsUnavailable = snapshotsResult.error
const [current, previous] = snapshotsResult.data || []
const evaluation = evaluateQueryReleaseBudget({
  windows: metricsResult.data || [],
  databaseDelta: snapshotsUnavailable
    ? { comparable: false, reason: snapshotsResult.error.message }
    : buildQueryDatabaseDelta(previous, current),
})

console.log(JSON.stringify({
  ...evaluation,
  generatedAt: new Date().toISOString(),
  windowHours: hours,
  databaseSnapshotReason: snapshotsUnavailable ? snapshotsResult.error.message : null,
}, null, 2))

if (strict && evaluation.status !== 'PASS') process.exitCode = 1
