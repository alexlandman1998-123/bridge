import { supabase } from '../lib/supabaseClient.js'
import { notifyDevelopmentLeadChange } from './developmentLeadRefreshService.js'
export async function setDevelopmentLeadReservation({ developerLeadId, unitId, reserved = true }, client = supabase) {
  if (!client || !developerLeadId || !unitId) throw new Error('Choose the buyer lead and unit.')
  const { data, error } = await client.rpc('bridge_set_development_lead_reservation', {
    p_developer_lead_id: developerLeadId, p_unit_id: unitId, p_reserved: reserved,
  })
  if (error) throw error
  if (data?.developerLeadId !== developerLeadId || data?.unitId !== unitId || data?.reservationState !== (reserved ? 'reserved' : 'none') || data?.unitStatus !== (reserved ? 'Reserved' : 'Available')) throw new Error('The saved reservation could not be verified.')
  notifyDevelopmentLeadChange(data, { stockChanged: true })
  return data
}
