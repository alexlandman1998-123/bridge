import { createClient } from '@supabase/supabase-js'
import {
  getPublicListingReadinessReport,
  normalizePublicListingText,
} from '../server/services/publicListingReadinessService.js'

const OUTPUT_MARKDOWN = process.argv.includes('--markdown')
const SKIP_LIVE = process.argv.includes('--no-live')
const liveUrlArg = process.argv.find((arg) => arg.startsWith('--live-url='))
const LIVE_API_URL = liveUrlArg ? liveUrlArg.slice('--live-url='.length) : 'https://app.arch9.co.za/api/public/listings?limit=3'

function getSupabaseConfig() {
  const supabaseUrl = normalizePublicListingText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const serviceRoleKey = normalizePublicListingText(process.env.SUPABASE_SERVICE_ROLE_KEY)
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }
  return { supabaseUrl, serviceRoleKey }
}

function createSupabaseAdminClient() {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

function renderQueue(title, rows = []) {
  const lines = [`### ${title}`, '']
  if (!rows.length) {
    lines.push('No rows.', '')
    return lines
  }

  lines.push('| Listing | Status | Media | Blockers |')
  lines.push('| --- | --- | ---: | --- |')
  for (const row of rows.slice(0, 10)) {
    lines.push(`| ${row.title} | ${row.listingStatus || '-'} | ${row.imageCount}/${row.mediaCount} | ${(row.blockers || []).join('<br>') || '-'} |`)
  }
  lines.push('')
  return lines
}

function renderMarkdown(report = {}) {
  const summary = report.summary || {}
  const lines = [
    '# Arch9 Buy Public Listing Readiness',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Total listings scanned: ${summary.totalListings || 0}`,
    `- Active market listings: ${summary.activeMarket || 0}`,
    `- Arch9 bridge published: ${summary.bridgePublished || 0}`,
    `- Publication rows: ${summary.publicationRows || 0}`,
    `- Publication rows marked Published: ${summary.publicationPublished || 0}`,
    `- Media rows: ${summary.mediaRows || 0}`,
    `- Public eligible now: ${summary.eligible || 0}`,
    `- Safe backfill candidates: ${summary.backfillable || 0}`,
    '',
  ]

  if (report.liveApi) {
    lines.push('## Live API')
    lines.push('')
    lines.push(`- URL: ${report.liveApi.url}`)
    lines.push(`- OK: ${report.liveApi.ok ? 'yes' : 'no'}`)
    lines.push(`- Status: ${report.liveApi.status || '-'}`)
    lines.push(`- Count: ${report.liveApi.count ?? '-'}`)
    lines.push('')
  }

  lines.push('## Blockers')
  lines.push('')
  const blockerEntries = Object.entries(report.blockerCounts || {})
  if (!blockerEntries.length) {
    lines.push('No blockers.', '')
  } else {
    for (const [blocker, count] of blockerEntries.sort((left, right) => right[1] - left[1])) {
      lines.push(`- ${blocker}: ${count}`)
    }
    lines.push('')
  }

  lines.push(...renderQueue('Eligible Now', report.actionQueues?.eligible || []))
  lines.push(...renderQueue('Safe Backfill Candidates', report.actionQueues?.backfillable || []))
  lines.push(...renderQueue('Needs Publication Save', report.actionQueues?.needsPublicationSave || []))
  lines.push(...renderQueue('Needs Media', report.actionQueues?.needsMedia || []))
  lines.push(...renderQueue('Blocked By Lifecycle', report.actionQueues?.blockedLifecycle || []))

  return lines.join('\n')
}

async function run() {
  const client = createSupabaseAdminClient()
  const report = await getPublicListingReadinessReport({
    client,
    liveApiUrl: SKIP_LIVE ? '' : LIVE_API_URL,
  })

  if (OUTPUT_MARKDOWN) {
    console.log(renderMarkdown(report))
    return
  }

  console.log(JSON.stringify(report, null, 2))
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
