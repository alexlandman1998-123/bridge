import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')

const CONTRACT = 'arch9-agent-performance-baseline-report-v2'
const DEFAULT_WINDOW_HOURS = 168
const DEFAULT_MINIMUM_SAMPLES = 20
const DEFAULT_LIMIT = 10_000

const METRIC_MAP = Object.freeze({
  'agent_clients.route.shell_ready': { surface: 'clients', checkpoint: 'shell_ready', budgetMs: 1500 },
  'agent_clients.route.core_ready': { surface: 'clients', checkpoint: 'core_ready', budgetMs: 2500 },
  'agent_clients.route.settled': { surface: 'clients', checkpoint: 'settled', budgetMs: 5000 },
  'agent_listings.route.shell_ready': { surface: 'listings', checkpoint: 'shell_ready', budgetMs: 1500 },
  'agent_listings.route.core_ready': { surface: 'listings', checkpoint: 'core_ready', budgetMs: 2500 },
  'agent_listings.route.settled': { surface: 'listings', checkpoint: 'settled', budgetMs: 5000 },
  'agent_canvassing.route.shell_ready': { surface: 'canvassing', checkpoint: 'shell_ready', budgetMs: 1500 },
  'agent_canvassing.route.core_ready': { surface: 'canvassing', checkpoint: 'core_ready', budgetMs: 2500 },
  'agent_canvassing.route.settled': { surface: 'canvassing', checkpoint: 'settled', budgetMs: 5000 },
  'transaction_workspace.core_ready': { surface: 'transaction_detail', checkpoint: 'core_ready', budgetMs: 4000 },
  'transaction_workspace.full_ready': { surface: 'transaction_detail', checkpoint: 'settled', budgetMs: 8000 },
  'buyer_leads.core.ready': { surface: 'lead_detail', checkpoint: 'core_ready', budgetMs: 4000 },
  'buyer_leads.workspace.ready': { surface: 'lead_detail', checkpoint: 'settled', budgetMs: 8000 },
  'seller_leads.workspace.ready': { surface: 'lead_detail', checkpoint: 'settled', budgetMs: 8000 },
})

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    windowHours: DEFAULT_WINDOW_HOURS,
    minimumSamples: DEFAULT_MINIMUM_SAMPLES,
    limit: DEFAULT_LIMIT,
    output: '',
    markdown: '',
    fixture: '',
    failOnInsufficient: false,
  }
  for (const arg of argv) {
    if (arg.startsWith('--window-hours=')) options.windowHours = positiveNumber(arg.split('=')[1], options.windowHours)
    else if (arg.startsWith('--minimum-samples=')) options.minimumSamples = positiveNumber(arg.split('=')[1], options.minimumSamples)
    else if (arg.startsWith('--limit=')) options.limit = positiveNumber(arg.split('=')[1], options.limit)
    else if (arg.startsWith('--output=')) options.output = arg.split('=').slice(1).join('=').trim()
    else if (arg.startsWith('--markdown=')) options.markdown = arg.split('=').slice(1).join('=').trim()
    else if (arg.startsWith('--fixture=')) options.fixture = arg.split('=').slice(1).join('=').trim()
    else if (arg === '--fail-on-insufficient') options.failOnInsufficient = true
  }
  return options
}

function positiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function percentile(values = [], fraction = 0.95) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right)
  if (!sorted.length) return null
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] * 10) / 10
}

function normalizeTemperature(metadata = {}) {
  const explicit = String(metadata?.temperature || '').trim().toLowerCase()
  if (explicit === 'cold' || explicit === 'warm') return explicit
  const origin = String(metadata?.timingOrigin || metadata?.timing_origin || '').trim().toLowerCase()
  return origin.includes('route_transition') ? 'warm' : 'cold'
}

export function buildAgentPerformanceBaselineReport(metrics = [], {
  generatedAt = new Date().toISOString(),
  windowHours = DEFAULT_WINDOW_HOURS,
  minimumSamples = DEFAULT_MINIMUM_SAMPLES,
} = {}) {
  const groups = new Map()
  for (const metric of Array.isArray(metrics) ? metrics : []) {
    const config = METRIC_MAP[String(metric?.metric_name || '')]
    if (!config) continue
    const temperature = normalizeTemperature(metric?.metadata)
    const key = `${config.surface}:${temperature}:${config.checkpoint}`
    if (!groups.has(key)) groups.set(key, { ...config, temperature, durations: [], requestCounts: [], slowRequestCounts: [] })
    const group = groups.get(key)
    group.durations.push(Number(metric?.duration_ms))
    const requestCount = Number(metric?.metadata?.requestCount ?? metric?.metadata?.supabaseRequestCount)
    const slowRequestCount = Number(metric?.metadata?.slowRequestCount)
    if (Number.isFinite(requestCount)) group.requestCounts.push(requestCount)
    if (Number.isFinite(slowRequestCount)) group.slowRequestCounts.push(slowRequestCount)
  }

  const requiredSurfaces = ['clients', 'listings', 'canvassing', 'transaction_detail', 'lead_detail']
  const rows = []
  for (const surface of requiredSurfaces) {
    for (const temperature of ['cold', 'warm']) {
      for (const checkpoint of ['core_ready', 'settled']) {
        const group = groups.get(`${surface}:${temperature}:${checkpoint}`)
        const sampleCount = group?.durations.filter(Number.isFinite).length || 0
        const p50Ms = percentile(group?.durations || [], 0.5)
        const p95Ms = percentile(group?.durations || [], 0.95)
        const budgetMs = group?.budgetMs || (checkpoint === 'core_ready' ? 4000 : 8000)
        rows.push({
          surface,
          temperature,
          checkpoint,
          sampleCount,
          p50Ms,
          p95Ms,
          budgetMs,
          requestCountP95: percentile(group?.requestCounts || [], 0.95),
          slowRequestCountP95: percentile(group?.slowRequestCounts || [], 0.95),
          coverage: sampleCount >= minimumSamples ? 'COMPLETE' : 'INSUFFICIENT',
          status: p95Ms === null ? 'NO_DATA' : p95Ms <= budgetMs ? 'PASS' : 'FAIL',
        })
      }
    }
  }
  const insufficientRows = rows.filter((row) => row.coverage !== 'COMPLETE')
  const failingRows = rows.filter((row) => row.status === 'FAIL')
  return {
    contract: CONTRACT,
    generatedAt,
    windowHours,
    minimumSamples,
    status: insufficientRows.length ? 'INSUFFICIENT_DATA' : failingRows.length ? 'FAIL' : 'PASS',
    rows,
    insufficientRows: insufficientRows.map(({ surface, temperature, checkpoint, sampleCount }) => ({ surface, temperature, checkpoint, sampleCount })),
    failingRows,
  }
}

export function renderAgentPerformanceBaselineMarkdown(report) {
  const table = report.rows.map((row) => `| ${row.surface} | ${row.temperature} | ${row.checkpoint} | ${row.sampleCount} | ${row.p50Ms ?? '—'} | ${row.p95Ms ?? '—'} | ${row.budgetMs} | ${row.requestCountP95 ?? '—'} | ${row.slowRequestCountP95 ?? '—'} | ${row.status} |`).join('\n')
  return `# Agent performance baseline\n\nGenerated: ${report.generatedAt}\n\nStatus: **${report.status}**\n\nWindow: ${report.windowHours} hours. A complete baseline requires ${report.minimumSamples} cold and ${report.minimumSamples} warm samples per checkpoint.\n\n| Surface | Temperature | Checkpoint | Samples | p50 ms | p95 ms | Budget ms | Requests p95 | Slow requests p95 | Status |\n| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |\n${table}\n\n## Interpretation\n\n- Core ready is the point where the primary record or list can be used.\n- Settled includes secondary hydration and captures request counts and the slowest requests.\n- INSUFFICIENT_DATA is expected immediately after instrumentation ships; it is not treated as a performance pass.\n- Optimisation decisions should use p95 only after coverage is complete.\n`
}

async function loadMetrics(options) {
  if (options.fixture) {
    const fixture = JSON.parse(await readFile(options.fixture, 'utf8'))
    return Array.isArray(fixture) ? fixture : fixture.metrics || []
  }
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const metricNames = Object.keys(METRIC_MAP)
  const since = new Date(Date.now() - options.windowHours * 60 * 60 * 1000).toISOString()
  const result = await client
    .from('performance_metrics')
    .select('metric_name, route, duration_ms, metadata, created_at')
    .in('metric_name', metricNames)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(options.limit)
  if (result.error) throw result.error
  return result.data || []
}

async function main() {
  const options = parseArgs()
  const metrics = await loadMetrics(options)
  const report = buildAgentPerformanceBaselineReport(metrics, options)
  const json = `${JSON.stringify(report, null, 2)}\n`
  const markdown = renderAgentPerformanceBaselineMarkdown(report)
  if (options.output) await writeFile(options.output, json)
  if (options.markdown) await writeFile(options.markdown, markdown)
  console.log(json.trim())
  if (options.failOnInsufficient && report.status !== 'PASS') process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
