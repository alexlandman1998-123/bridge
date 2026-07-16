import { assertEdgeFunctionSuccess, invokeEdgeFunction } from '../lib/supabaseClient.js'

function normalizeText(value = '', maxLength = 1000) {
  return String(value || '').trim().slice(0, maxLength)
}

export async function sendAttorneyQuoteEmail({ organisationId, quoteId } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedQuoteId = normalizeText(quoteId)
  if (!scopedOrganisationId || !scopedQuoteId) throw new Error('Attorney quote email context is required.')
  const result = await invokeEdgeFunction('send-email', {
    body: {
      type: 'attorney_quote',
      organisationId: scopedOrganisationId,
      quoteId: scopedQuoteId,
    },
  })
  assertEdgeFunctionSuccess(result, 'Unable to send the Attorney quote email.')
  if (result.data?.sent !== true) throw new Error('Attorney quote email delivery was not confirmed.')
  return {
    sent: true,
    deliveryId: normalizeText(result.data?.deliveryId),
    recipientEmail: normalizeText(result.data?.recipientEmail, 254),
  }
}
