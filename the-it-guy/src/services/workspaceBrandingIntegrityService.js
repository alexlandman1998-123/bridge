import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const BLOCKING_STATUSES = new Set(['missing_attorney_membership', 'inactive_attorney_membership'])

function normalizeText(value) {
  return String(value || '').trim()
}

export function buildWorkspaceBrandingIntegrityDiagnostics(rows = [], { source = 'security_invoker_view' } = {}) {
  const statusCounts = {}
  let blockingCount = 0
  let overlapCount = 0
  let normalizedIdentityCount = 0
  let brandedCount = 0

  for (const row of rows) {
    const status = normalizeText(row?.integrity_status) || 'unknown'
    statusCounts[status] = (statusCounts[status] || 0) + 1
    if (BLOCKING_STATUSES.has(status)) blockingCount += 1
    if (Number(row?.membership_source_count || 0) > 1) overlapCount += 1
    if (row?.identity_normalized === true) normalizedIdentityCount += 1
    if (row?.logo_present === true) brandedCount += 1
  }

  const unbrandedCount = rows.length - brandedCount
  const status = blockingCount > 0
    ? 'blocked'
    : unbrandedCount > 0 || rows.length === 0
      ? 'attention'
      : 'healthy'
  const actions = [
    {
      key: 'review_missing_attorney_memberships',
      label: 'Review missing attorney memberships',
      count: statusCounts.missing_attorney_membership || 0,
      severity: 'critical',
    },
    {
      key: 'review_inactive_attorney_memberships',
      label: 'Review inactive attorney memberships',
      count: statusCounts.inactive_attorney_membership || 0,
      severity: 'critical',
    },
    {
      key: 'configure_workspace_branding',
      label: 'Configure missing workspace branding',
      count: statusCounts.unbranded || 0,
      severity: 'warning',
    },
  ].filter((action) => action.count > 0)

  return {
    source,
    generatedAt: new Date().toISOString(),
    summary: {
      status,
      rowCount: rows.length,
      blockingCount,
      overlapCount,
      normalizedIdentityCount,
      brandedCount,
      unbrandedCount,
      statusCounts,
    },
    gate: {
      status: blockingCount > 0 ? 'blocked' : unbrandedCount > 0 || rows.length === 0 ? 'warning' : 'pass',
      reason: blockingCount > 0
        ? `${blockingCount} blocking membership integrity issue${blockingCount === 1 ? '' : 's'} require review.`
        : unbrandedCount > 0
          ? `${unbrandedCount} workspace${unbrandedCount === 1 ? '' : 's'} do not have a configured logo.`
          : rows.length === 0
            ? 'No workspace membership integrity rows are visible to this session.'
            : 'Workspace branding and membership integrity checks passed.',
    },
    actions,
    dryRun: true,
  }
}

export async function getWorkspaceBrandingIntegrityDiagnostics({ client = supabase } = {}) {
  if (!isSupabaseConfigured || !client) {
    return {
      source: 'not_configured',
      generatedAt: new Date().toISOString(),
      summary: { status: 'not_configured', rowCount: 0, blockingCount: 0, overlapCount: 0, normalizedIdentityCount: 0, brandedCount: 0, unbrandedCount: 0, statusCounts: {} },
      gate: { status: 'blocked', reason: 'Supabase is not configured.' },
      actions: [],
      dryRun: true,
    }
  }

  const result = await client
    .from('bridge_workspace_membership_integrity_v1')
    .select('workspace_type,membership_count,membership_source_count,membership_sources,selected_membership_source,has_attorney_membership,has_active_attorney_membership,has_active_organisation_membership,logo_present,identity_normalized,integrity_status,last_membership_update')

  if (result.error) {
    const code = String(result.error.code || '').toUpperCase()
    if (code === '42P01' || code === 'PGRST205') {
      return {
        source: 'phase6_view_missing',
        generatedAt: new Date().toISOString(),
        summary: { status: 'not_installed', rowCount: 0, blockingCount: 0, overlapCount: 0, normalizedIdentityCount: 0, brandedCount: 0, unbrandedCount: 0, statusCounts: {} },
        gate: { status: 'blocked', reason: 'Deploy the Phase 6 workspace integrity migration before rollout.' },
        actions: [],
        dryRun: true,
      }
    }
    throw result.error
  }

  return buildWorkspaceBrandingIntegrityDiagnostics(result.data || [])
}
