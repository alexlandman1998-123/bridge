import fs from 'node:fs'
import path from 'node:path'

import {
  evaluateListingBaseline,
  inspectListingMediaRows,
  LISTING_BASELINE_CONTRACT,
} from '../the-it-guy/src/services/observability/listingArchitectureBaseline.js'

const root = process.cwd()
const envFiles = ['the-it-guy/.env', 'the-it-guy/.env.local', 'the-it-guy/.env.production.local', 'the-it-guy/.vercel/.env.production.local', '.vercel/.env.production.local']

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) return []
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    return [[match[1], value]]
  }))
}

function loadEnv() {
  return envFiles.reduce((result, file) => ({ ...result, ...parseEnvFile(path.resolve(root, file)) }), { ...process.env })
}

function percentile(values, percentage) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return null
  return sorted[Math.max(0, Math.ceil(sorted.length * percentage / 100) - 1)]
}

function groupCounts(rows, fields) {
  const result = new Map()
  for (const row of rows) {
    const key = fields.map((field) => String(row?.[field] ?? 'unknown')).join(' / ')
    result.set(key, (result.get(key) || 0) + 1)
  }
  return Object.fromEntries([...result.entries()].sort((a, b) => b[1] - a[1]))
}

function parseArgs() {
  return {
    write: process.argv.includes('--write'),
    json: process.argv.includes('--json'),
  }
}

async function requestRows(baseUrl, apiKey, table, select, filters = '', limit = 10000) {
  const url = `${baseUrl}/rest/v1/${table}?select=${encodeURIComponent(select)}${filters}&limit=${limit}`
  const response = await fetch(url, { headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` } })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`${table} baseline read failed (${response.status}): ${body?.message || response.statusText}`)
  return Array.isArray(body) ? body : []
}

function formatMarkdown(report) {
  const telemetry = report.telemetry
  const media = report.media
  return `# Listing architecture Phase 0 baseline\n\nGenerated: ${report.generatedAt}\n\nStatus: **${report.evaluation.status}**\n\n## Inventory\n\n- Listings sampled: ${report.inventory.listingsSampled}\n- Organisations: ${report.inventory.organisationCount}\n- Branches: ${report.inventory.branchCount}\n- Media rows sampled: ${media.rowCount}\n- Listings with media: ${media.listingCount}\n- Average assets per listing: ${media.averageAssetsPerListing}\n\n## Runtime telemetry\n\n- Samples: ${telemetry.sampleCount}\n- p50: ${telemetry.p50DurationMs ?? 'not yet available'} ms\n- p95: ${telemetry.p95DurationMs ?? 'not yet available'} ms\n- Maximum result count: ${telemetry.maximumResultCount ?? 'not yet available'}\n- Maximum estimated response: ${telemetry.maximumResponseBytes ?? 'not yet available'} bytes\n\n## Media health\n\n- Signed URLs detected: ${media.signedUrlCount}\n- Expired URLs: ${media.expiredUrlCount}\n- Expiring within seven days: ${media.expiringWithinSevenDaysCount}\n- Incomplete media rows: ${media.incompleteRowCount}\n\n## Target checks\n\n${Object.entries(report.evaluation.checks).map(([name, passed]) => `- ${passed ? 'PASS' : 'ATTENTION'}: ${name}`).join('\n')}\n\n## Notes\n\nCounts are bounded to 10,000 rows per source in this REST baseline. Run \`sql/listing-architecture-phase0-baseline.sql\` for exact database-wide inventory and query plans. Missing runtime samples are intentionally treated as requiring attention.\n`
}

async function main() {
  const options = parseArgs()
  const env = loadEnv()
  const baseUrl = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '')
  const apiKey = String(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || '').replace(/\\n/g, '').trim()
  if (!baseUrl || !apiKey) throw new Error('SUPABASE URL and service-role key are required for the read-only live baseline.')

  const since = encodeURIComponent(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  const [listings, mediaRows, metricRows] = await Promise.all([
    requestRows(baseUrl, apiKey, 'private_listings', 'organisation_id,branch_id,listing_status,listing_visibility'),
    requestRows(baseUrl, apiKey, 'listing_media', 'listing_id,file_url,media_type,is_cover'),
    requestRows(baseUrl, apiKey, 'performance_metrics', 'duration_ms,value,metadata,created_at', `&metric_name=eq.listings.index.load&created_at=gte.${since}`, 5000),
  ])

  const durations = metricRows.map((row) => row.duration_ms)
  const resultCounts = metricRows.map((row) => row?.metadata?.resultCount ?? row.value).map(Number).filter(Number.isFinite)
  const responseBytes = metricRows.map((row) => row?.metadata?.responseBytes).map(Number).filter(Number.isFinite)
  const telemetry = {
    sampleCount: metricRows.length,
    p50DurationMs: percentile(durations, 50),
    p95DurationMs: percentile(durations, 95),
    maximumResultCount: resultCounts.length ? Math.max(...resultCounts) : null,
    maximumResponseBytes: responseBytes.length ? Math.max(...responseBytes) : null,
  }
  const media = inspectListingMediaRows(mediaRows)
  const report = {
    contract: LISTING_BASELINE_CONTRACT,
    generatedAt: new Date().toISOString(),
    inventory: {
      listingsSampled: listings.length,
      organisationCount: new Set(listings.map((row) => row.organisation_id).filter(Boolean)).size,
      branchCount: new Set(listings.map((row) => row.branch_id).filter(Boolean)).size,
      byStatus: groupCounts(listings, ['listing_status']),
      byOrganisationAndStatus: groupCounts(listings, ['organisation_id', 'listing_status']),
    },
    telemetry,
    media,
  }
  report.evaluation = evaluateListingBaseline({ telemetry, media })

  if (options.write) {
    const outputDir = path.join(root, 'docs', 'architecture-baselines')
    fs.mkdirSync(outputDir, { recursive: true })
    fs.writeFileSync(path.join(outputDir, 'listing-phase0-latest.json'), `${JSON.stringify(report, null, 2)}\n`)
    fs.writeFileSync(path.join(outputDir, 'listing-phase0-latest.md'), formatMarkdown(report))
  }
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  else console.log(`Listing Phase 0 baseline: ${report.evaluation.status}; ${listings.length} listings, ${metricRows.length} telemetry samples, ${media.expiredUrlCount} expired media URLs.`)
}

main().catch((error) => {
  console.error(`Listing Phase 0 baseline failed: ${error.message}`)
  process.exitCode = 1
})
