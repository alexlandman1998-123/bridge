import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i
const TYPES = new Set(['credit_check', 'bonds', 'transfers', 'avm', 'recent_sales'])
const text = (value) => String(value || '').trim()
function org(value) { if (!UUID.test(text(value))) throw new Error('Select a valid organisation workspace.'); return text(value) }

export async function listSensitiveLookupCases({ organisationId } = {}) {
  const payload = await call({ action: 'list_cases', organisationId: org(organisationId) })
  return payload.items || []
}

async function call(body) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Sensitive lookup storage is not configured.')
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session?.access_token) throw new Error('Please sign in again before managing sensitive lookup requests.')
  const response = await fetch('/api/knowledge-factory/sensitive-lookups', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(text(payload?.error) || `Sensitive lookup request failed (HTTP ${response.status}).`)
  return payload || {}
}

export async function createSensitiveLookupCase({ organisationId, prospectId = '', lookupType, subjectLabel, businessPurpose, consentCaptured, consentVersion = 'arch9_sensitive_lookup_v1' } = {}) {
  if (!TYPES.has(text(lookupType))) throw new Error('Select a supported lookup type.')
  if (text(subjectLabel).length < 2) throw new Error('Enter a subject label.')
  if (text(businessPurpose).length < 10) throw new Error('Provide a specific business purpose.')
  if (consentCaptured !== true) throw new Error('Recorded consent is required before this lookup can be queued.')
  const payload = await call({ action: 'create_case', organisationId: org(organisationId), prospectId: UUID.test(text(prospectId)) ? text(prospectId) : '', lookupType: text(lookupType), subjectLabel: text(subjectLabel), businessPurpose: text(businessPurpose), consentCaptured, consentVersion: text(consentVersion) })
  return payload.item
}

export async function reviewSensitiveLookupCase({ organisationId, caseId, decision, reviewNote } = {}) {
  const payload = await call({ action: 'review_case', organisationId: org(organisationId), caseId: text(caseId), decision: text(decision), reviewNote: text(reviewNote) })
  return payload.item
}
