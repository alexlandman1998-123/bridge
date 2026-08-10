import {
  ATTORNEY_FIRM_FIRST_LIFECYCLE_VIEW,
  ATTORNEY_FIRM_FIRST_RECONCILIATION_VIEW,
  ATTORNEY_FIRM_FIRST_RELEASE_READINESS_VIEW,
  buildAttorneyFirmFirstReadinessReport,
} from '../lib/attorneyFirmFirstReadiness.js'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

const READINESS_SELECT = [
  'transaction_id',
  'organisation_id',
  'assignment_id',
  'attorney_firm_id',
  'attorney_user_id',
  'allocation_state',
  'firm_acceptance_status',
  'staff_assignment_status',
  'instruction_status',
  'lifecycle_health',
  'lifecycle_issue',
  'required_action',
  'hours_in_allocation_state',
  'replaces_assignment_id',
  'replacement_sequence',
  'lifecycle_updated_at',
].join(',')

const RELEASE_READINESS_SELECT = [
  'organisation_id',
  'transaction_count',
  'healthy_count',
  'attention_count',
  'blocked_count',
  'firm_acceptance_overdue_count',
  'internal_assignment_overdue_count',
  'awaiting_firm_acceptance_count',
  'awaiting_staff_assignment_count',
  'staff_assigned_count',
  'active_count',
  'declined_count',
  'replacement_count',
  'rollout_status',
  'last_lifecycle_update',
].join(',')

const RECONCILIATION_SELECT = [
  'transaction_id',
  'organisation_id',
  'assignment_id',
  'attorney_firm_id',
  'allocation_state',
  'lifecycle_health',
  'lifecycle_issue',
  'required_action',
  'hours_in_allocation_state',
  'replaces_assignment_id',
  'replacement_sequence',
  'recommended_resolution',
  'automatic_repair_allowed',
  'lifecycle_updated_at',
].join(',')

function isMissingReadinessViewError(error) {
  const code = String(error?.code || '').toUpperCase()
  return ['42P01', 'PGRST205'].includes(code)
}

async function fetchOptionalReadinessRows(client, table, select, { organisationId = '' } = {}) {
  let query = client.from(table).select(select)
  if (organisationId) query = query.eq('organisation_id', organisationId)
  const result = await query
  if (result.error) {
    if (isMissingReadinessViewError(result.error)) return { rows: [], missing: true }
    throw result.error
  }
  return { rows: result.data || [], missing: false }
}

export async function getAttorneyFirmFirstReadinessReport({ organisationId = '', client = supabase } = {}) {
  if (!isSupabaseConfigured || !client) {
    return buildAttorneyFirmFirstReadinessReport([], { source: 'supabase_not_configured' })
  }

  let query = client.from(ATTORNEY_FIRM_FIRST_LIFECYCLE_VIEW).select(READINESS_SELECT)
  if (organisationId) query = query.eq('organisation_id', organisationId)
  const result = await query

  if (result.error) {
    if (isMissingReadinessViewError(result.error)) {
      const report = buildAttorneyFirmFirstReadinessReport([], { source: 'phase7_assurance_view_missing' })
      return {
        ...report,
        gate: {
          status: 'blocked',
          releaseRecommended: false,
          reason: 'Deploy the Phase 7 lifecycle assurance migration before running the Phase 8 release gate.',
        },
      }
    }
    throw result.error
  }

  const [releaseReadiness, reconciliation] = await Promise.all([
    fetchOptionalReadinessRows(client, ATTORNEY_FIRM_FIRST_RELEASE_READINESS_VIEW, RELEASE_READINESS_SELECT, {
      organisationId,
    }),
    fetchOptionalReadinessRows(client, ATTORNEY_FIRM_FIRST_RECONCILIATION_VIEW, RECONCILIATION_SELECT, {
      organisationId,
    }),
  ])

  return buildAttorneyFirmFirstReadinessReport(result.data || [], {
    source: releaseReadiness.missing ? ATTORNEY_FIRM_FIRST_LIFECYCLE_VIEW : ATTORNEY_FIRM_FIRST_RELEASE_READINESS_VIEW,
    releaseReadinessRows: releaseReadiness.rows,
    reconciliationCandidates: reconciliation.rows,
  })
}
