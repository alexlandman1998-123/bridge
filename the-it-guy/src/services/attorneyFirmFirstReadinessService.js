import { buildAttorneyFirmFirstReadinessReport } from '../lib/attorneyFirmFirstReadiness.js'
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

export async function getAttorneyFirmFirstReadinessReport({ organisationId = '', client = supabase } = {}) {
  if (!isSupabaseConfigured || !client) {
    return buildAttorneyFirmFirstReadinessReport([], { source: 'supabase_not_configured' })
  }

  let query = client.from('transfer_firm_allocation_lifecycle_v2').select(READINESS_SELECT)
  if (organisationId) query = query.eq('organisation_id', organisationId)
  const result = await query

  if (result.error) {
    const code = String(result.error.code || '').toUpperCase()
    if (['42P01', 'PGRST205'].includes(code)) {
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

  return buildAttorneyFirmFirstReadinessReport(result.data || [])
}
