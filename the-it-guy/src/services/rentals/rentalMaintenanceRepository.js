import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const text = (value) => String(value ?? '').trim()
const requireClient = (client = supabase) => { if (!isSupabaseConfigured || !client) throw new Error('Rental maintenance requires Supabase configuration.'); return client }

export async function getRentalMaintenanceQueue({ limit = 100, client = supabase } = {}) { const result = await requireClient(client).rpc('rental_get_maintenance_queue', { p_limit: Math.min(Math.max(Number(limit) || 100, 1), 1000) }); if (result.error) throw result.error; return result.data || [] }
export async function createRentalMaintenanceRequest({ tenancyId, category, priority, description, media = [] } = {}, { client = supabase } = {}) { const result = await requireClient(client).rpc('rental_create_maintenance_request', { x: text(tenancyId), c: text(category), pr: text(priority), d: text(description), m: Array.isArray(media) ? media : [] }); if (result.error) throw result.error; return result.data }
export async function acknowledgeRentalMaintenanceRequest(requestId, { client = supabase } = {}) { const result = await requireClient(client).rpc('rental_acknowledge_maintenance_request', { x: text(requestId) }); if (result.error) throw result.error; return result.data }
export async function triageRentalMaintenanceRequest({ requestId, priority, notes = '', assigneeName, assigneeContact = '' } = {}, { client = supabase } = {}) { const result = await requireClient(client).rpc('rental_triage_maintenance_request', { x: text(requestId), pr: text(priority), n: text(notes), an: text(assigneeName), ac: text(assigneeContact) || null }); if (result.error) throw result.error; return result.data }
export async function listRentalMaintenanceQuotes(requestId, { client = supabase } = {}) { const result = await requireClient(client).from('rental_maintenance_quotes').select('id, request_id, supplier_name, quote_reference, amount, currency_code, quote_link, scope_notes, valid_until, status, submitted_at').eq('request_id', text(requestId)).order('submitted_at', { ascending: true }); if (result.error) throw result.error; return result.data || [] }
export async function submitRentalMaintenanceQuote({ requestId, supplierName, quoteReference = '', amount, quoteLink, scopeNotes = '', validUntil = null } = {}, { client = supabase } = {}) { const result = await requireClient(client).rpc('rental_submit_maintenance_quote', { x: text(requestId), s: text(supplierName), ref: text(quoteReference) || null, a: Number(amount), l: text(quoteLink), n: text(scopeNotes) || null, v: validUntil || null }); if (result.error) throw result.error; return result.data }
export async function decideRentalMaintenanceQuote({ quoteId, decision, landlordName, evidenceLink, note = '' } = {}, { client = supabase } = {}) { const result = await requireClient(client).rpc('rental_record_maintenance_quote_decision', { x: text(quoteId), d: text(decision), ln: text(landlordName), e: text(evidenceLink), n: text(note) || null }); if (result.error) throw result.error; return result.data }
export async function listRentalMaintenanceWorkEvents(requestId, { client = supabase } = {}) { const result = await requireClient(client).from('rental_maintenance_work_events').select('id, event_type, note, evidence_link, actual_cost, recorded_at').eq('request_id', text(requestId)).order('recorded_at', { ascending: true }); if (result.error) throw result.error; return result.data || [] }
export async function recordRentalMaintenanceWorkEvent({ requestId, eventType, note = '', evidenceLink = '', actualCost = null } = {}, { client = supabase } = {}) { const result = await requireClient(client).rpc('rental_record_maintenance_work_event', { x: text(requestId), e: text(eventType), n: text(note) || null, ev: text(evidenceLink) || null, c: actualCost === '' || actualCost === null ? null : Number(actualCost) }); if (result.error) throw result.error; return result.data }
export async function reopenRentalMaintenanceRequest(requestId, reason, { client = supabase } = {}) { const result = await requireClient(client).rpc('rental_reopen_maintenance_request', { p_request_id: text(requestId), p_reason: text(reason) }); if (result.error) throw result.error; return result.data }

// Read the complete scoped register, including resolved jobs. The triage RPC
// intentionally returns only open requests and cannot supply job descriptions.
export async function listRentalMaintenanceRequests({ organisationId, branchId = '', offset = 0, limit = 100 } = {}, { client = supabase } = {}) {
  if (!text(organisationId)) return []
  const size = Math.min(Math.max(Number(limit) || 100, 1), 100)
  let query = requireClient(client).from('rental_maintenance_requests')
    .select('id, organisation_id, property_id, unit_id, tenancy_id, category, priority, description, status, reported_at, rental_properties!inner(organisation_id, branch_id), rental_maintenance_assignments(assignee_name, status)')
    .eq('organisation_id', text(organisationId)).eq('rental_properties.organisation_id', text(organisationId))
    .order('reported_at', { ascending: false }).order('id').range(offset, offset + size - 1)
  if (text(branchId)) query = query.eq('rental_properties.branch_id', text(branchId))
  const result = await query
  if (result.error) throw result.error
  return (result.data || []).map((row) => {
    const assignment = Array.isArray(row.rental_maintenance_assignments) ? row.rental_maintenance_assignments[0] : row.rental_maintenance_assignments
    return { ...row, request_id: row.id, assignee_name: assignment?.assignee_name || '', status: row.status === 'assigned' && assignment?.status === 'in_progress' ? 'in_progress' : row.status }
  })
}
