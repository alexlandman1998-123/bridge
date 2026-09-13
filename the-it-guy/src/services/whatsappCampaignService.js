import { invokeEdgeFunction } from '../lib/supabaseClient'

function campaignError(error) {
  const message = String(error?.message || error || '')
  const code = String(error?.code || error?.status || '')
  if (code === '404' || code === 'NOT_FOUND' || /requested function was not found/i.test(message)
    || /(?:relation.*whatsapp_.*does not exist|could not find.*whatsapp_)/i.test(message)) {
    return new Error('WhatsApp campaign setup is incomplete. An administrator needs to finish deploying the campaign service and database update.')
  }
  if (/failed to fetch|failed to send a request to the edge function|networkerror|load failed/i.test(message)
    || error?.name === 'FunctionsFetchError') {
    return new Error('Unable to reach the WhatsApp campaign service. Check your connection and try again. If this continues, an administrator should check that the WhatsApp service is deployed and available.')
  }
  return new Error(message || 'WhatsApp campaigns could not be loaded.')
}

export async function whatsappCampaignRequest(organisationId, action, fields = {}) {
  if (!organisationId) throw new Error('Choose an organisation workspace to use WhatsApp campaigns.')
  let response
  try {
    response = await invokeEdgeFunction('whatsapp-campaigns', { body: { ...fields, organisationId, action } })
  } catch (error) {
    throw campaignError(error)
  }
  if (response?.error) throw campaignError(response.error)
  if (response?.data?.error) throw campaignError(response.data.error)
  if (!response?.data) throw new Error('The WhatsApp campaign service returned no data. Please try again.')
  return response.data
}
