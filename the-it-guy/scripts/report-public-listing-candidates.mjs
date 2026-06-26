import { createClient } from '@supabase/supabase-js'
import {
  createPublicListingLaunchCandidateReport,
  fetchPublicListingReadinessRows,
  normalizePublicListingText,
} from '../server/services/publicListingReadinessService.js'

const MARKDOWN = process.argv.includes('--markdown')
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const LIMIT = limitArg ? Number(limitArg.slice('--limit='.length)) : 20

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

function renderMarkdown(report = {}) {
  const summary = report.summary || {}
  const lines = [
    '# Arch9 Buy Launch Candidates',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '## Summary',
    '',
    `- Total listings scanned: ${summary.totalListings || 0}`,
    `- Ready to apply: ${summary.readyToApply || 0}`,
    `- Needs media: ${summary.needsMedia || 0}`,
    `- Needs data: ${summary.needsData || 0}`,
    `- Needs publish state: ${summary.needsPublishState || 0}`,
    `- Blocked lifecycle: ${summary.blockedLifecycle || 0}`,
    '',
    '## Top Candidates',
    '',
  ]

  if (!report.candidates?.length) {
    lines.push('No candidates found.', '')
    return lines.join('\n')
  }

  lines.push('| Score | Type | Listing | Images | Action |')
  lines.push('| ---: | --- | --- | ---: | --- |')
  for (const candidate of report.candidates) {
    const action = candidate.canApply
      ? candidate.command
      : (candidate.actionItems || []).slice(0, 2).join('<br>') || 'Review listing.'
    lines.push(`| ${candidate.score} | ${candidate.candidateType} | ${candidate.title}<br>${candidate.listingId} | ${candidate.imageCount}/${candidate.mediaCount} | ${action} |`)
  }
  lines.push('')
  return lines.join('\n')
}

async function run() {
  const client = createSupabaseAdminClient()
  const rows = await fetchPublicListingReadinessRows(client)
  const report = createPublicListingLaunchCandidateReport({
    ...rows,
    limit: LIMIT,
  })

  if (MARKDOWN) {
    console.log(renderMarkdown(report))
    return
  }

  console.log(JSON.stringify(report, null, 2))
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
