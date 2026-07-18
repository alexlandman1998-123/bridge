import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export const ATTORNEY_ROLE_INTEGRITY_BLOCKING_STATUSES = Object.freeze(new Set([
  'ineligible_open_assignment',
  'compatibility_mismatch',
  'missing_organisation_extension',
  'organisation_extension_mismatch',
]))

const INTEGRITY_SELECT = [
  'member_id',
  'firm_id',
  'user_id',
  'organisation_user_id',
  'membership_status',
  'professional_role',
  'practice_qualifications',
  'compatibility_role',
  'expected_compatibility_role',
  'organisation_professional_role',
  'organisation_practice_qualifications',
  'organisation_compatibility_role',
  'organisation_attorney_member_id',
  'open_assignment_count',
  'ineligible_open_assignment_count',
  'integrity_status',
  'last_integrity_update',
].join(',')

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase() || 'unknown'
}

export function buildAttorneyRoleIntegrityReport(rows = [], { source = 'attorney_role_integrity_v1' } = {}) {
  const statusCounts = {}
  let blockingCount = 0
  let ineligibleAssignmentCount = 0

  for (const row of rows) {
    const status = normalizeStatus(row?.integrity_status)
    statusCounts[status] = (statusCounts[status] || 0) + 1
    if (ATTORNEY_ROLE_INTEGRITY_BLOCKING_STATUSES.has(status)) blockingCount += 1
    ineligibleAssignmentCount += Number(row?.ineligible_open_assignment_count || 0)
  }

  const actions = [
    ['review_ineligible_assignments', 'Review ineligible open assignments', 'ineligible_open_assignment'],
    ['repair_compatibility_mirrors', 'Repair compatibility mirrors', 'compatibility_mismatch'],
    ['link_organisation_extensions', 'Link missing organisation extensions', 'missing_organisation_extension'],
    ['repair_organisation_extensions', 'Repair organisation extension mirrors', 'organisation_extension_mismatch'],
  ].map(([key, label, status]) => ({
    key,
    label,
    count: statusCounts[status] || 0,
    severity: 'critical',
  })).filter((action) => action.count > 0)

  const gateStatus = rows.length === 0 ? 'blocked' : blockingCount > 0 ? 'blocked' : 'pass'
  return {
    source,
    generatedAt: new Date().toISOString(),
    dryRun: true,
    summary: {
      status: gateStatus === 'pass' ? 'healthy' : 'blocked',
      rowCount: rows.length,
      blockingCount,
      ineligibleAssignmentCount,
      statusCounts,
    },
    gate: {
      status: gateStatus,
      releaseRecommended: gateStatus === 'pass',
      reason: rows.length === 0
        ? 'No attorney role integrity rows are visible to this session.'
        : blockingCount > 0
          ? `${blockingCount} attorney role integrity issue${blockingCount === 1 ? '' : 's'} must be resolved before compatibility cleanup.`
          : 'Canonical attorney roles, compatibility mirrors, organisation extensions, and open assignments are consistent.',
    },
    actions,
    rows,
  }
}

export async function getAttorneyRoleIntegrityReport({ firmId = '', client = supabase } = {}) {
  if (!isSupabaseConfigured || !client) {
    return buildAttorneyRoleIntegrityReport([], { source: 'supabase_not_configured' })
  }

  let query = client.from('attorney_role_integrity_v1').select(INTEGRITY_SELECT)
  if (firmId) query = query.eq('firm_id', firmId)
  const result = await query

  if (result.error) {
    const code = String(result.error.code || '').toUpperCase()
    if (['42P01', 'PGRST205'].includes(code)) {
      const report = buildAttorneyRoleIntegrityReport([], { source: 'phase8_integrity_view_missing' })
      return {
        ...report,
        gate: {
          status: 'blocked',
          releaseRecommended: false,
          reason: 'Deploy the Phase 8 attorney role integrity migration before compatibility cleanup.',
        },
      }
    }
    throw result.error
  }

  return buildAttorneyRoleIntegrityReport(result.data || [])
}
