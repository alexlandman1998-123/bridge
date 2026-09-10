import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i
const TYPES = new Set(['credit_check', 'bonds', 'transfers', 'avm', 'recent_sales'])
const text = (value) => String(value || '').trim()
function org(value) { if (!UUID.test(text(value))) throw new Error('Select a valid organisation workspace.'); return text(value) }

export async function listSensitiveLookupCases({ organisationId } = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Sensitive lookup storage is not configured.')
  const { data, error } = await supabase.from('knowledge_factory_sensitive_lookup_cases').select('*').eq('organisation_id', org(organisationId)).order('created_at', { ascending: false })
  if (error) throw new Error(error.message || 'Sensitive lookup cases could not be loaded.')
  return data || []
}

export async function createSensitiveLookupCase({ organisationId, prospectId = '', lookupType, subjectLabel, businessPurpose, consentCaptured } = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Sensitive lookup storage is not configured.')
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) throw new Error('Sign in before creating a lookup case.')
  if (!TYPES.has(text(lookupType))) throw new Error('Select a supported lookup type.')
  if (text(subjectLabel).length < 2) throw new Error('Enter a subject label.')
  if (text(businessPurpose).length < 10) throw new Error('Provide a specific business purpose.')
  if (consentCaptured !== true) throw new Error('Recorded consent is required before this lookup can be queued.')
  const { data, error } = await supabase.from('knowledge_factory_sensitive_lookup_cases').insert({ organisation_id: org(organisationId), prospect_id: UUID.test(text(prospectId)) ? text(prospectId) : null, created_by: userId, lookup_type: text(lookupType), subject_label: text(subjectLabel), business_purpose: text(businessPurpose), consent_captured_at: new Date().toISOString(), consent_captured_by: userId }).select('*').single()
  if (error || !data) throw new Error(error?.message || 'Sensitive lookup case could not be created.')
  return data
}
