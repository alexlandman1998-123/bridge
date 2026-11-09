import { supabase } from '../lib/supabaseClient'

export async function getDevelopmentManagementAccess(developmentId) {
  const { data, error } = await supabase.rpc('bridge_can_manage_development_record', { target_development_id: developmentId })
  if (error) throw new Error('Development edit access could not be checked. Refresh to retry; your leads remain available.')
  return data === true
}
