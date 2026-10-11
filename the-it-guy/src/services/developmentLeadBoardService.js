import { supabase } from '../lib/supabaseClient.js'
import { normalizeDeveloperLeadStatus } from '../core/developerLeads/developerLeadContract.js'
import { resolveDevelopmentLeadBoardMove } from '../core/developments/developmentLeadBoard.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function saveDevelopmentLeadBoardStage({ lead, targetKey, client = supabase }) {
  if (!client || !UUID.test(lead?.developerLeadId || '') || !UUID.test(lead?.developerOrgId || '')) throw new Error('A linked development lead is required.')
  const move = resolveDevelopmentLeadBoardMove(lead, targetKey)
  if (move.kind !== 'status') throw new Error('Complete this stage in the lead workspace.')
  const previousStatus = normalizeDeveloperLeadStatus(lead.leadStatus)
  let query = client.from('developer_leads')
    .update({ lead_status: move.status })
    .eq('developer_org_id', lead.developerOrgId)
    .eq('developer_lead_id', lead.developerLeadId)
    .eq('lead_status', previousStatus)
  if (move.status === 'reserved') query = query.eq('reservation_state', 'reserved')
  const { data, error } = await query.select('developer_lead_id, lead_status, updated_at').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('This lead changed or is no longer editable. Refresh the leads and try again.')
  // Activity enrichment must not report a failed move after the status has
  // already been saved. Keep the durable receipt even if activity is unavailable.
  try {
    const activity = await client.from('developer_lead_activity').insert({
      developer_lead_id: lead.developerLeadId,
      developer_org_id: lead.developerOrgId,
      source_agency_org_id: lead.sourceAgencyOrgId || null,
      activity_type: 'status_changed',
      activity_note: `Pipeline stage moved to ${move.label}.`,
      visibility_scope: lead.sourceAgencyOrgId ? 'shared' : 'developer',
      metadata: { previousLeadStatus: previousStatus, nextLeadStatus: move.status, source: 'development_kanban' },
    })
    if (activity.error) console.warn('Lead stage saved; activity could not be recorded.', activity.error.code || '')
  } catch {
    console.warn('Lead stage saved; activity could not be recorded.')
  }
  return { developerLeadId: data.developer_lead_id, leadStatus: data.lead_status, updatedAt: data.updated_at }
}
