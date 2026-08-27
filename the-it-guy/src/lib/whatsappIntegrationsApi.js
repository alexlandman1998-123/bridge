import { assertEdgeFunctionSuccess, invokeEdgeFunction } from './supabaseClient'

function normalizeText(value) {
  return String(value || '').trim()
}

export async function listWhatsAppConnections({ organisationId } = {}) {
  const response = await invokeEdgeFunction('whatsapp-integrations', {
    body: {
      action: 'list',
      organisationId: normalizeText(organisationId),
    },
  })
  assertEdgeFunctionSuccess(response, 'Unable to load WhatsApp integrations.')
  return Array.isArray(response?.data?.connections) ? response.data.connections : []
}

export async function connectWhatsAppChannel(payload = {}) {
  const response = await invokeEdgeFunction('whatsapp-integrations', {
    body: {
      action: 'connect',
      ...payload,
    },
  })
  assertEdgeFunctionSuccess(response, 'Unable to complete the WhatsApp connection.')
  return response?.data || null
}

export async function disconnectWhatsAppChannel(payload = {}) {
  const response = await invokeEdgeFunction('whatsapp-integrations', {
    body: {
      action: 'disconnect',
      ...payload,
    },
  })
  assertEdgeFunctionSuccess(response, 'Unable to disconnect the WhatsApp channel.')
  return response?.data || null
}
