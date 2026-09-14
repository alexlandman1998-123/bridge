import { supabase } from '../../lib/supabaseClient'

function text(value = '') { return String(value || '').trim() }

async function call(body) {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session?.access_token) throw new Error('Please sign in again before managing the controlled UAT set.')
  const response = await fetch('/api/knowledge-factory/uat', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(text(payload?.error) || `Controlled UAT request failed (HTTP ${response.status}).`)
  return payload || {}
}

export function listKnowledgeFactoryUatCases({ organisationId } = {}) { return call({ action: 'list_cases', organisationId: text(organisationId) }) }
export function createKnowledgeFactoryUatCase({ organisationId, propertyId, scenario, purpose, expectedOutcome } = {}) { return call({ action: 'create_case', organisationId: text(organisationId), propertyId: text(propertyId), scenario: text(scenario), purpose: text(purpose), expectedOutcome: text(expectedOutcome) }) }
export function updateKnowledgeFactoryUatCase({ organisationId, caseId, status, outcomeNote, reportRequestId } = {}) { return call({ action: 'update_case', organisationId: text(organisationId), caseId: text(caseId), status: text(status), outcomeNote: text(outcomeNote), reportRequestId: text(reportRequestId) }) }
