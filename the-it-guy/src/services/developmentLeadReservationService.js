import { supabase } from '../lib/supabaseClient.js'
import { invalidateAgencyLeadListCache } from '../pages/agency/agencyLeadListReadRepository.js'
import { clearBuyerLeadWorkspaceDataLoaderCache } from '../pages/agency/buyerLeadWorkspaceDataLoader.js'
import { clearAgencyLeadWorkspaceSnapshotCache } from '../pages/agency/agencyLeadWorkspaceSnapshotCache.js'

export async function setDevelopmentLeadReservation({ developerLeadId, unitId, reserved = true }, client = supabase) {
  if (!client || !developerLeadId || !unitId) throw new Error('Choose the buyer lead and unit.')
  const { data, error } = await client.rpc('bridge_set_development_lead_reservation', {
    p_developer_lead_id: developerLeadId, p_unit_id: unitId, p_reserved: reserved,
  })
  if (error) throw error
  if (data?.developerLeadId !== developerLeadId || data?.unitId !== unitId) throw new Error('The saved reservation could not be verified.')
  for (const organisationId of new Set([data.developerOrgId, data.sourceAgencyOrgId].filter(Boolean))) {
    invalidateAgencyLeadListCache(organisationId, data.sourceLeadId)
  }
  clearBuyerLeadWorkspaceDataLoaderCache()
  clearAgencyLeadWorkspaceSnapshotCache()
  if (typeof window !== 'undefined') {
    const detail = { organisationId: data.sourceAgencyOrgId || data.developerOrgId, leadId: data.sourceLeadId, updatedAt: Date.now() }
    window.dispatchEvent(new Event('itg:developments-changed'))
    window.dispatchEvent(new Event('itg:developer-leads-changed'))
    window.dispatchEvent(new CustomEvent('bridge:buyer-lifecycle-refresh', { detail }))
    try { window.localStorage.setItem('bridge:buyer-lifecycle-refresh:v1', JSON.stringify(detail)) } catch { /* Same-tab refresh remains available. */ }
  }
  return data
}
