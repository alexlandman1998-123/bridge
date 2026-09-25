const CHANNELS = Object.freeze(['Property24', 'Private Property'])
const DELIVERY_TYPES = new Set([
  'listing_price_changed', 'listing_under_offer', 'listing_sold', 'listing_portal_update_retried', 'listing_portal_update_started',
  'listing_channel_publication_submitted', 'listing_channel_publication_accepted', 'listing_channel_publication_failed',
])

function text(value) {
  return String(value ?? '').trim()
}

function eventType(event = {}) {
  return text(event.activity_type || event.activityType)
}

function eventMetadata(event = {}) {
  const value = event.metadata
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function eventTime(event = {}) {
  const value = Date.parse(event.created_at || event.createdAt || '')
  return Number.isFinite(value) ? value : 0
}

function eventAction(event, metadata) {
  return text(metadata.action) || ({
    listing_price_changed: 'price_reduction',
    listing_under_offer: 'under_offer',
    listing_sold: 'sold',
  }[eventType(event)] || '')
}

export function deriveListingChannelUpdateStates(activityRows = [], sessionResults = [], sessionAction = '') {
  const states = Object.fromEntries(CHANNELS.map((channel) => [channel, null]))
  const events = (Array.isArray(activityRows) ? activityRows : [])
    .filter((event) => DELIVERY_TYPES.has(eventType(event)) || ['listing_portal_update_verified', 'listing_channel_publication_verified'].includes(eventType(event)))
    .sort((left, right) => eventTime(right) - eventTime(left))

  for (const event of events) {
    const metadata = eventMetadata(event)
    const action = eventAction(event, metadata)
    if (['listing_portal_update_verified', 'listing_channel_publication_verified'].includes(eventType(event))) {
      const channel = text(metadata.channel)
      if (CHANNELS.includes(channel) && !states[channel]) {
        states[channel] = { status: 'current', action, detail: 'Public page verified by an agent.' }
      }
      continue
    }
    if (eventType(event).startsWith('listing_channel_publication_')) {
      const channel = text(metadata.channel)
      if (!CHANNELS.includes(channel) || states[channel]) continue
      if (eventType(event) === 'listing_channel_publication_failed') {
        states[channel] = { status: 'needs_attention', action: action || 'publish', detail: text(metadata.error || metadata.detail) || 'Portal publication failed.', retriable: true }
      } else if (eventType(event) === 'listing_channel_publication_accepted') {
        states[channel] = { status: 'awaiting_verification', action: action || 'publish', detail: 'Portal accepted the publication; verify the public page before treating it as current.' }
      } else {
        states[channel] = { status: 'awaiting_verification', action: action || 'publish', detail: 'Publication was submitted and is waiting for a portal response.' }
      }
      continue
    }
    for (const result of Array.isArray(metadata.channelResults) ? metadata.channelResults : []) {
      const channel = text(result?.channel)
      if (!CHANNELS.includes(channel) || states[channel]) continue
      if (result.status === 'failed') states[channel] = { status: 'needs_attention', action, detail: text(result.detail) || 'Portal update failed.', retriable: true }
      else if (result.status === 'pending') states[channel] = { status: 'needs_attention', action, detail: 'Arch9 saved this change, but the portal update has not been confirmed.' }
      else if (result.status === 'sent') states[channel] = { status: 'awaiting_verification', action, detail: 'Update accepted; check the public page before confirming it is current.' }
      else if (result.status === 'not_connected') states[channel] = { status: 'needs_attention', action, detail: text(result.detail) || 'No confirmed live listing to update.', retriable: false }
    }
  }

  // The current session is authoritative when activity storage itself fails.
  for (const result of Array.isArray(sessionResults) ? sessionResults : []) {
    const channel = text(result?.channel)
    if (!CHANNELS.includes(channel)) continue
    if (result.status === 'failed') states[channel] = { ...states[channel], action: text(sessionAction) || states[channel]?.action || '', status: 'needs_attention', detail: text(result.detail) || 'Portal update failed.' }
    else if (result.status === 'not_connected') states[channel] = { action: text(sessionAction), status: 'needs_attention', detail: text(result.detail) || 'No confirmed live listing to update.', retriable: false }
    else if (result.status === 'sent' && !['current', 'needs_attention'].includes(states[channel]?.status)) states[channel] = { ...states[channel], action: text(sessionAction) || states[channel]?.action || '', status: 'awaiting_verification', detail: 'Update accepted; check the public page before confirming it is current.' }
  }
  return states
}
