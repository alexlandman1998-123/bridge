import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const text = (value) => String(value || '').trim()

export async function getKnowledgeFactoryOperationsSnapshot({ organisationId } = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Knowledge Factory operations storage is not configured.')
  if (!UUID.test(text(organisationId))) throw new Error('Select a valid organisation workspace.')
  const [access, permissions, audits, reports, lookups, pilot, packageResults] = await Promise.all([
    supabase.from('knowledge_factory_organisation_access').select('enabled, allowed_operations, suspended_at, activated_at').eq('organisation_id', text(organisationId)).maybeSingle(),
    supabase.from('knowledge_factory_user_permissions').select('user_id, allowed_operations, revoked_at').eq('organisation_id', text(organisationId)).limit(100),
    supabase.from('knowledge_factory_audit_log').select('operation, outcome, credits_consumed, created_at, request_purpose, error_code').eq('organisation_id', text(organisationId)).order('created_at', { ascending: false }).limit(100),
    supabase.from('knowledge_factory_report_requests').select('status, credits_consumed').eq('organisation_id', text(organisationId)).limit(100),
    supabase.from('knowledge_factory_sensitive_lookup_cases').select('status, lookup_type').eq('organisation_id', text(organisationId)).limit(100),
    supabase.from('knowledge_factory_package_pilot_enrolments').select('status, allowed_user_ids, activated_at, pilot_report_cap, pilot_credit_cap, pilot_ends_at').eq('organisation_id', text(organisationId)).maybeSingle(),
    supabase.from('knowledge_factory_report_results').select('credits_consumed, executed_at').eq('organisation_id', text(organisationId)).order('executed_at', { ascending: false }).limit(1000),
  ])
  const error = [access.error, permissions.error, audits.error, reports.error, lookups.error, pilot.error, packageResults.error].find(Boolean)
  if (error) throw new Error(error.message || 'Knowledge Factory operations are unavailable.')
  const events = audits.data || []
  const activePermissions = (permissions.data || []).filter((item) => !item.revoked_at)
  const operationUsers = (operation) => activePermissions.filter((item) => Array.isArray(item.allowed_operations) && item.allowed_operations.includes(operation)).length
  const failedEvents = events.filter((item) => item.outcome === 'failed' || item.outcome === 'denied')
  const pilotStart = pilot.data?.activated_at || ''
  const pilotResults = pilotStart
    ? (packageResults.data || []).filter((item) => String(item.executed_at || '') >= pilotStart)
    : []
  const pilotUsage = {
    reportCount: pilotResults.length,
    creditsConsumed: pilotResults.reduce((sum, item) => sum + (Number(item.credits_consumed) || 0), 0),
  }
  return {
    access: access.data,
    permissions: permissions.data || [],
    events,
    reportCount: (reports.data || []).length,
    pendingLookups: (lookups.data || []).filter((item) => item.status === 'pending_approval').length,
    credits: events.reduce((sum, event) => sum + (Number(event.credits_consumed) || 0), 0),
    rollout: {
      mode: 'controlled_uat',
      enabled: access.data?.enabled === true && !access.data?.suspended_at,
      namedUserCount: activePermissions.length,
      mapUserCount: operationUsers('map_properties'),
      reportUserCount: operationUsers('property_report'),
      auditedEventCount: events.length,
      failedEventCount: failedEvents.length,
      latestEventAt: events[0]?.created_at || null,
      packagePilot: pilot.data
        ? {
            status: pilot.data.status,
            namedUserCount: Array.isArray(pilot.data.allowed_user_ids)
              ? pilot.data.allowed_user_ids.length
              : 0,
            reportCap: pilot.data.pilot_report_cap,
            creditCap: pilot.data.pilot_credit_cap,
            endsAt: pilot.data.pilot_ends_at,
            ...pilotUsage,
          }
        : null,
    },
  }
}
