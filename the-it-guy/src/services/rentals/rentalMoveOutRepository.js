import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const text = (value) => String(value ?? '').trim()
const requireClient = (client = supabase) => { if (!isSupabaseConfigured || !client) throw new Error('Move-out workflows require Supabase configuration.'); return client }

export async function getRentalMoveOutWorkflow(tenancyId, { client = supabase } = {}) { const result = await requireClient(client).rpc('rental_get_move_out_workflow', { p_tenancy_id: text(tenancyId) }); if (result.error) throw result.error; return result.data }
export async function startRentalMoveOutWorkflow(tenancyId, { client = supabase } = {}) { const result = await requireClient(client).rpc('rental_start_move_out_workflow', { p_tenancy_id: text(tenancyId) }); if (result.error) throw result.error; return result.data }
export async function recordRentalMoveOutItem({ itemId, status, evidenceLink = '', note = '' } = {}, { client = supabase } = {}) { const result = await requireClient(client).rpc('rental_record_move_out_checklist_item', { p_item_id: text(itemId), p_status: text(status), p_evidence_link: text(evidenceLink) || null, p_note: text(note) || null }); if (result.error) throw result.error; return result.data }
export async function rescheduleRentalMoveOutInspection({ itemId, dueOn, note } = {}, { client = supabase } = {}) { const result = await requireClient(client).rpc('rental_reschedule_move_out_inspection', { p_item_id: text(itemId), p_due_on: dueOn, p_note: text(note) }); if (result.error) throw result.error; return result.data }
