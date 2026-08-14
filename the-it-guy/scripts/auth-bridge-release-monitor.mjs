import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')

const DEFAULT_WINDOW_MINUTES = 60
const DEFAULT_EVENT_LIMIT = 10_000
const DEFAULT_METRIC_LIMIT = 10_000
const DEFAULT_THRESHOLDS = Object.freeze({
  maxDegradedRate: 0.01,
  maxAuthErrorRate: 0.03,
  maxWorkspaceTimeouts: 0,
  maxMissingColumnEvents: 0,
  maxWorkspaceP95Ms: 2_500,
})

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    windowMinutes: DEFAULT_WINDOW_MINUTES,
    eventLimit: DEFAULT_EVENT_LIMIT,
    metricLimit: DEFAULT_METRIC_LIMIT,
    output: '',
    fixture: '',
    failOnBlockers: true,
    ...DEFAULT_THRESHOLDS,
  }

  for (const arg of argv) {
    if (arg === '--no-fail') {
      options.failOnBlockers = false
    } else if (arg.startsWith('--window-minutes=')) {
      options.windowMinutes = positiveNumber(arg.split('=')[1], options.windowMinutes)
    } else if (arg.startsWith('--event-limit=')) {
      options.eventLimit = positiveNumber(arg.split('=')[1], options.eventLimit)
    } else if (arg.startsWith('--metric-limit=')) {
      options.metricLimit = positiveNumber(arg.split('=')[1], options.metricLimit)
    } else if (arg.startsWith('--max-degraded-rate=')) {
      options.maxDegradedRate = positiveNumber(arg.split('=')[1], options.maxDegradedRate)
    } else if (arg.startsWith('--max-auth-error-rate=')) {
      options.maxAuthErrorRate = positiveNumber(arg.split('=')[1], options.maxAuthErrorRate)
    } else if (arg.startsWith('--max-workspace-timeouts=')) {
      options.maxWorkspaceTimeouts = positiveNumber(arg.split('=')[1], options.maxWorkspaceTimeouts)
    } else if (arg.startsWith('--max-missing-column-events=')) {
      options.maxMissingColumnEvents = positiveNumber(arg.split('=')[1], options.maxMissingColumnEvents)
    } else if (arg.startsWith('--max-workspace-p95-ms=')) {
      options.maxWorkspaceP95Ms = positiveNumber(arg.split('=')[1], options.maxWorkspaceP95Ms)
    } else if (arg.startsWith('--output=')) {
      options.output = String(arg.split('=').slice(1).join('=') || '').trim()
    } else if (arg.startsWith('--fixture=')) {
      options.fixture = String(arg.split('=').slice(1).join('=') || '').trim()
    }
  }

  return options
}

function positiveNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

function text(value) {
  return String(value || '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function metadataText(row = {}) {
  try {
    return JSON.stringify(row.metadata || {}).toLowerCase()
  } catch {
    return ''
  }
}

function isAuthBootEvent(row = {}) {
  return lower(row.event_name).startsWith('auth_boot_')
}

function isAuthErrorEvent(row = {}) {
  const haystack = `${lower(row.category)} ${lower(row.event_name)} ${lower(row.severity)} ${metadataText(row)}`
  return haystack.includes('auth_error') || (haystack.includes('auth') && haystack.includes('error'))
}

function isWorkspaceTimeoutEvent(row = {}) {
  const haystack = `${lower(row.event_name)} ${metadataText(row)}`
  return haystack.includes('workspace.resolvecurrentworkspace timed out') ||
    haystack.includes('workspace_query_timeout') ||
    haystack.includes('auth_boot_slow')
}

function isMissingColumnEvent(row = {}) {
  const haystack = `${lower(row.event_name)} ${metadataText(row)}`
  return haystack.includes('pgrst204') ||
    haystack.includes('42703') ||
    haystack.includes('does not exist') ||
    haystack.includes('schema cache')
}

function durationValue(row = {}) {
  const candidates = [row.duration_ms, row.value, row.metadata?.durationMs, row.metadata?.duration_ms]
  for (const candidate of candidates) {
    const parsed = Number(candidate)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return null
}

function isWorkspaceMetric(row = {}) {
  const name = lower(row.metric_name)
  const route = lower(row.route)
  const meta = metadataText(row)
  return name.includes('workspace') ||
    name.includes('auth_boot') ||
    route.includes('dashboard') ||
    meta.includes('resolvecurrentworkspace')
}

function percentile(values = [], percentileValue = 95) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right)
  if (!sorted.length) return null
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))]
}

export function buildReleaseMonitorReport({
  events = [],
  metrics = [],
  checkedAt = new Date().toISOString(),
  windowMinutes = DEFAULT_WINDOW_MINUTES,
  thresholds = DEFAULT_THRESHOLDS,
} = {}) {
  const authBootEvents = events.filter(isAuthBootEvent)
  const authBootSuccess = authBootEvents.filter((row) => lower(row.event_name) === 'auth_boot_success').length
  const authBootDegraded = authBootEvents.filter((row) => lower(row.event_name) === 'auth_boot_degraded').length
  const authBootSlow = authBootEvents.filter((row) => lower(row.event_name) === 'auth_boot_slow').length
  const authErrors = events.filter(isAuthErrorEvent)
  const workspaceTimeouts = events.filter(isWorkspaceTimeoutEvent)
  const missingColumnEvents = events.filter(isMissingColumnEvent)
  const workspaceDurations = metrics.filter(isWorkspaceMetric).map(durationValue).filter((value) => value !== null)
  const workspaceP95Ms = percentile(workspaceDurations, 95)
  const authBootTotal = authBootEvents.length
  const degradedRate = authBootTotal ? authBootDegraded / authBootTotal : 0
  const authErrorRate = authBootTotal ? authErrors.length / authBootTotal : 0

  const blockers = []
  if (degradedRate > thresholds.maxDegradedRate) {
    blockers.push({ code: 'AUTH_BOOT_DEGRADED_RATE_HIGH', value: degradedRate, threshold: thresholds.maxDegradedRate })
  }
  if (authErrorRate > thresholds.maxAuthErrorRate) {
    blockers.push({ code: 'AUTH_ERROR_RATE_HIGH', value: authErrorRate, threshold: thresholds.maxAuthErrorRate })
  }
  if (workspaceTimeouts.length > thresholds.maxWorkspaceTimeouts) {
    blockers.push({ code: 'WORKSPACE_TIMEOUTS_PRESENT', value: workspaceTimeouts.length, threshold: thresholds.maxWorkspaceTimeouts })
  }
  if (missingColumnEvents.length > thresholds.maxMissingColumnEvents) {
    blockers.push({ code: 'SCHEMA_DRIFT_EVENTS_PRESENT', value: missingColumnEvents.length, threshold: thresholds.maxMissingColumnEvents })
  }
  if (workspaceP95Ms !== null && workspaceP95Ms > thresholds.maxWorkspaceP95Ms) {
    blockers.push({ code: 'WORKSPACE_P95_TOO_SLOW', value: workspaceP95Ms, threshold: thresholds.maxWorkspaceP95Ms })
  }

  return {
    version: 'arch9_auth_bridge_release_monitor_v1',
    checkedAt,
    windowMinutes,
    releaseRecommended: blockers.length === 0,
    thresholds,
    counts: {
      telemetryEvents: events.length,
      performanceMetrics: metrics.length,
      authBootTotal,
      authBootSuccess,
      authBootDegraded,
      authBootSlow,
      authErrors: authErrors.length,
      workspaceTimeouts: workspaceTimeouts.length,
      missingColumnEvents: missingColumnEvents.length,
      workspaceMetricSamples: workspaceDurations.length,
    },
    rates: {
      degradedRate,
      authErrorRate,
    },
    performance: {
      workspaceP95Ms,
      workspaceMaxMs: workspaceDurations.length ? Math.max(...workspaceDurations) : null,
    },
    blockers,
  }
}

async function loadFixture(fixturePath) {
  const { readFile } = await import('node:fs/promises')
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
  return {
    events: Array.isArray(fixture.events) ? fixture.events : [],
    metrics: Array.isArray(fixture.metrics) ? fixture.metrics : [],
  }
}

async function loadLiveData(options) {
  const supabaseUrl = text(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for live release monitoring.')
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const since = new Date(Date.now() - options.windowMinutes * 60_000).toISOString()

  const [eventsQuery, metricsQuery] = await Promise.all([
    client
      .from('telemetry_events')
      .select('category, event_name, route, severity, metadata, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(options.eventLimit),
    client
      .from('performance_metrics')
      .select('metric_name, route, duration_ms, value, metadata, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(options.metricLimit),
  ])

  if (eventsQuery.error) throw eventsQuery.error
  if (metricsQuery.error) throw metricsQuery.error

  return {
    events: eventsQuery.data || [],
    metrics: metricsQuery.data || [],
  }
}

async function main() {
  const options = parseArgs()
  const data = options.fixture ? await loadFixture(options.fixture) : await loadLiveData(options)
  const thresholds = {
    maxDegradedRate: options.maxDegradedRate,
    maxAuthErrorRate: options.maxAuthErrorRate,
    maxWorkspaceTimeouts: options.maxWorkspaceTimeouts,
    maxMissingColumnEvents: options.maxMissingColumnEvents,
    maxWorkspaceP95Ms: options.maxWorkspaceP95Ms,
  }
  const report = buildReleaseMonitorReport({
    ...data,
    windowMinutes: options.windowMinutes,
    thresholds,
  })

  const output = JSON.stringify(report, null, 2)
  if (options.output) {
    await writeFile(options.output, `${output}\n`)
  }
  console.log(output)
  if (options.failOnBlockers && !report.releaseRecommended) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
