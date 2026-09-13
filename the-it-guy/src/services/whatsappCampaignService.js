import { invokeEdgeFunction } from '../lib/supabaseClient'
export async function whatsappCampaignRequest(organisationId, action, fields = {}) {
  if (!organisationId) throw new Error('Choose an organisation workspace to use WhatsApp campaigns.')
  const { data, error } = await invokeEdgeFunction('whatsapp-campaigns', { body: { ...fields, organisationId, action } })
  if (error) throw new Error(error.message || 'WhatsApp campaigns could not be loaded.')
  if (data?.error) throw new Error(data.error)
  return data
}
