import { normalizeCommunicationDelivery } from './communicationDeliveryService'

export const COMMUNICATION_PROVIDER_HEALTH_STATES = ['healthy', 'degraded', 'offline']

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function latestFailure(rows = []) {
  return rows
    .filter((row) => row.status === 'failed')
    .map((row) => row.failedAt || row.updatedAt || row.createdAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null
}

function resolveChannelHealth(rows = [], { configured = true } = {}) {
  const attempts = rows.filter((row) => ['queued', 'sent', 'delivered', 'failed'].includes(row.status))
  const failures = rows.filter((row) => row.status === 'failed')
  if (!configured) {
    return {
      state: 'offline',
      lastFailureAt: latestFailure(rows),
      reason: 'Provider is not configured.',
    }
  }
  if (attempts.length >= 3 && failures.length === attempts.length) {
    return {
      state: 'offline',
      lastFailureAt: latestFailure(rows),
      reason: 'Recent delivery attempts are all failing.',
    }
  }
  if (failures.length) {
    return {
      state: 'degraded',
      lastFailureAt: latestFailure(rows),
      reason: 'Recent failures require attention.',
    }
  }
  return {
    state: 'healthy',
    lastFailureAt: null,
    reason: 'No recent delivery failures.',
  }
}

export function getCommunicationProviderHealth({ deliveries = [], providers = {}, now = new Date() } = {}) {
  const rows = (Array.isArray(deliveries) ? deliveries : []).map(normalizeCommunicationDelivery)
  void now
  const emailRows = rows.filter((row) => row.channel === 'email')
  const whatsappRows = rows.filter((row) => row.channel === 'whatsapp')
  return {
    email: {
      channel: 'email',
      label: 'Email',
      provider: normalizeText(providers.email || 'internal'),
      ...resolveChannelHealth(emailRows, { configured: providers.emailConfigured !== false }),
    },
    whatsapp: {
      channel: 'whatsapp',
      label: 'WhatsApp',
      provider: normalizeText(providers.whatsapp || 'internal'),
      ...resolveChannelHealth(whatsappRows, { configured: providers.whatsappConfigured !== false }),
    },
  }
}

export function getCommunicationProviderHealthRows(input = {}) {
  return Object.values(getCommunicationProviderHealth(input)).map((row) => ({
    ...row,
    displayState: normalizeLower(row.state).replace(/\b\w/g, (letter) => letter.toUpperCase()),
  }))
}

export const communicationProviderService = {
  getCommunicationProviderHealth,
  getCommunicationProviderHealthRows,
}
