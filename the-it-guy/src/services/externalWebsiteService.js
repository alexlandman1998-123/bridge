import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { REVO_ORGANISATION_ID } from '../modules/revo/revoExtensionRegistry'

export async function manageExternalWebsite(organisationId, action = 'list', connectionId = null, config = {}) {
  if (organisationId !== REVO_ORGANISATION_ID) throw new Error('External Websites is available for Revo Properties only.')
  if (!isSupabaseConfigured || !supabase) throw new Error('Website integration is not configured.')
  const { data, error } = await supabase.rpc('external_website_manage', {
    p_organisation_id: organisationId, p_connection_id: connectionId, p_action: action, p_config: config,
  })
  if (error) throw new Error(error.code === '42883' || error.code === 'PGRST202' ? 'External Websites needs its database migration before it can be used.' : error.message)
  return data
}
