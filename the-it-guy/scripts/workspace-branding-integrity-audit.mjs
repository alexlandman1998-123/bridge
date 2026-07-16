import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const BLOCKING_STATUSES = new Set(['missing_attorney_membership', 'inactive_attorney_membership'])

function normalizeText(value) {
  return String(value || '').trim()
}

export function summarizeWorkspaceBrandingIntegrity(rows = []) {
  const statusCounts = {}
  let blockingCount = 0
  let normalizedIdentityCount = 0
  let overlapCount = 0
  let brandedCount = 0

  for (const row of rows) {
    const status = normalizeText(row.integrity_status) || 'unknown'
    statusCounts[status] = (statusCounts[status] || 0) + 1
    if (BLOCKING_STATUSES.has(status)) blockingCount += 1
    if (row.identity_normalized === true) normalizedIdentityCount += 1
    if (Number(row.membership_source_count || 0) > 1) overlapCount += 1
    if (row.logo_present === true) brandedCount += 1
  }

  return {
    rowCount: rows.length,
    blockingCount,
    normalizedIdentityCount,
    overlapCount,
    brandedCount,
    unbrandedCount: rows.length - brandedCount,
    statusCounts,
    healthy: blockingCount === 0,
  }
}

export async function runWorkspaceBrandingIntegrityAudit({ client, strict = false } = {}) {
  if (!client) throw new Error('A Supabase client is required for the workspace branding integrity audit.')

  let result
  try {
    result = await client
      .from('bridge_workspace_membership_integrity_v1')
      .select('workspace_type,membership_count,membership_source_count,membership_sources,selected_membership_source,has_attorney_membership,has_active_attorney_membership,has_active_organisation_membership,logo_present,identity_normalized,integrity_status,last_membership_update')
  } catch (error) {
    throw new Error(`Workspace integrity audit could not reach staging: ${error?.cause?.code || error?.message || 'network_error'}`)
  }

  if (result.error) {
    const missingProjection = ['42p01', 'PGRST205'].includes(String(result.error.code || '').toUpperCase())
    if (missingProjection) {
      throw new Error('Phase 6 workspace integrity views are not deployed in this environment yet.')
    }
    throw result.error
  }

  const summary = summarizeWorkspaceBrandingIntegrity(result.data || [])
  if (strict && !summary.healthy) process.exitCode = 1
  return summary
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !serviceKey) {
    throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the read-only integrity audit.')
  }

  const client = createClient(url, serviceKey, { auth: { persistSession: false } })
  const summary = await runWorkspaceBrandingIntegrityAudit({
    client,
    strict: process.argv.includes('--strict'),
  })
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), ...summary }, null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error?.message || error)
    process.exitCode = 1
  })
}
