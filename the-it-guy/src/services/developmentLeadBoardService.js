import { notifyDevelopmentLeadChange } from './developmentLeadRefreshService.js'
import { supabase } from '../lib/supabaseClient.js'
import { normalizeDeveloperLeadStatus } from '../core/developerLeads/developerLeadContract.js'
import { getLeadDevelopmentId } from '../core/leads/developmentBuyerLead.js'
import { resolveDevelopmentLeadBoardMove } from '../core/developments/developmentLeadBoard.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function saveDevelopmentLeadBoardStage({ lead, targetKey, client = supabase }) {
  if (!client || !UUID.test(lead?.developerLeadId || '') || !UUID.test(lead?.developerOrgId || '')) throw new Error('A linked development lead is required.')
  const move = resolveDevelopmentLeadBoardMove(lead, targetKey)
  if (move.kind !== 'status') throw new Error('Complete this stage in the lead workspace.')
  const previousStatus = normalizeDeveloperLeadStatus(lead.leadStatus)
  if (['reserved', 'onboarding_sent', 'onboarding_submitted', 'otp', 'converted'].includes(previousStatus) && ['new', 'contacted', 'qualified', 'viewing', 'lost'].includes(move.status)) {
    throw new Error('Release the reservation or continue the buyer’s onboarding and offer in their lead workflow before moving this stage backwards.')
  }
  let query = client.from('developer_leads')
    .update({ lead_status: move.status })
    .eq('developer_org_id', lead.developerOrgId)
    .eq('developer_lead_id', lead.developerLeadId)
    .eq('lead_status', previousStatus)
  if (move.status === 'reserved') query = query.eq('reservation_state', 'reserved')
  const { data, error } = await query.select('developer_lead_id, lead_status, updated_at').maybeSingle()
  if (error) throw error
  if (!data || data.developer_lead_id !== lead.developerLeadId || data.lead_status !== move.status) throw new Error('This lead changed or is no longer editable. Refresh the leads and try again.')
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
  notifyDevelopmentLeadChange({ ...lead, sourceLeadId: lead.sourceLeadId })
  return { developerLeadId: data.developer_lead_id, leadStatus: data.lead_status, updatedAt: data.updated_at }
}


// Complete the same early sales milestone on the development link after the
// buyer workspace records its evidence. Never infer reservations or later work.
export async function saveDevelopmentBuyerMilestone({ organisationId, lead, milestone, client = supabase }) {
  const developmentId = getLeadDevelopmentId(lead)
  if (!developmentId) return null
  const sourceLeadId = lead?.leadId || lead?.lead_id || ''
  if (!client || !UUID.test(organisationId || '') || !UUID.test(sourceLeadId) || !UUID.test(developmentId)
    || !['contacted', 'qualified'].includes(milestone)) throw new Error('A resolved buyer and development milestone are required.')
  const linkedId = lead?.developmentLeadContext?.developerLeadId
  const { data, error } = await client.from('developer_leads')
    .select('developer_lead_id,developer_org_id,source_agency_org_id,source_lead_id,primary_development_id,lead_owner,lead_status,reservation_state')
    .eq('source_lead_id', sourceLeadId).eq('primary_development_id', developmentId)
    .or(`developer_org_id.eq.${organisationId},source_agency_org_id.eq.${organisationId}`).maybeSingle()
  if (error) throw new Error('Buyer details were saved, but the development board could not be updated. Refresh this lead and retry the action.', { cause: error })
  if (!data && !linkedId) return null
  const owner = data?.lead_owner === 'agency' ? data?.source_agency_org_id : data?.developer_org_id
  if (!data || owner !== organisationId || data.source_lead_id !== sourceLeadId || data.primary_development_id !== developmentId
    || linkedId && data.developer_lead_id !== linkedId) throw new Error('The buyer’s development link could not be confirmed. Refresh the lead before retrying.')
  const status = normalizeDeveloperLeadStatus(data.lead_status)
  const progress = ['new', 'contacted', 'qualified', 'viewing']
  if (status === 'lost') throw new Error('This development lead is closed. Reopen it before recording a new sales milestone.')
  if (!progress.includes(status) || progress.indexOf(status) >= progress.indexOf(milestone)
    || !['none', '', null].includes(data.reservation_state)) return { developerLeadId: data.developer_lead_id, leadStatus: status, unchanged: true }
  try {
    return await saveDevelopmentLeadBoardStage({ client, targetKey: milestone, lead: {
    developerLeadId: data.developer_lead_id, developerOrgId: data.developer_org_id,
      sourceAgencyOrgId: data.source_agency_org_id, sourceLeadId, leadStatus: status,
    } })
  } catch (cause) {
    throw new Error('Buyer details were saved, but the development board could not be updated. Refresh this lead and retry the action.', { cause })
  }
}
