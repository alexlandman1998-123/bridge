import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const text = (value) => String(value || '').trim()

export async function getKnowledgeFactoryOperationsSnapshot({ organisationId } = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Knowledge Factory operations storage is not configured.')
  if (!UUID.test(text(organisationId))) throw new Error('Select a valid organisation workspace.')
  const [access, permissions, audits, reports, lookups] = await Promise.all([
    supabase.from('knowledge_factory_organisation_access').select('enabled, allowed_operations, suspended_at, activated_at').eq('organisation_id', text(organisationId)).maybeSingle(),
    supabase.from('knowledge_factory_user_permissions').select('user_id, allowed_operations, revoked_at').eq('organisation_id', text(organisationId)).limit(100),
    supabase.from('knowledge_factory_audit_log').select('operation, outcome, credits_consumed, created_at, request_purpose, error_code').eq('organisation_id', text(organisationId)).order('created_at', { ascending: false }).limit(100),
    supabase.from('knowledge_factory_report_requests').select('status, credits_consumed').eq('organisation_id', text(organisationId)).limit(100),
    supabase.from('knowledge_factory_sensitive_lookup_cases').select('status, lookup_type').eq('organisation_id', text(organisationId)).limit(100),
  ])
  const error = [access.error, permissions.error, audits.error, reports.error, lookups.error].find(Boolean)
  if (error) throw new Error(error.message || 'Knowledge Factory operations are unavailable.')
  const events = audits.data || []
  return { access: access.data, permissions: permissions.data || [], events, reportCount: (reports.data || []).length, pendingLookups: (lookups.data || []).filter((item) => item.status === 'pending_approval').length, credits: events.reduce((sum, event) => sum + (Number(event.credits_consumed) || 0), 0) }
}
