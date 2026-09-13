export const REVO_SHARED_INBOX_CHANNELS = Object.freeze(['email', 'whatsapp'])
export const REVO_SHARED_INBOX_CONVERSATION_STATUSES = Object.freeze(['open', 'closed', 'snoozed'])
export const REVO_SHARED_INBOX_MESSAGE_DIRECTIONS = Object.freeze(['inbound', 'outbound'])

function text(value = '') {
  return String(value || '').trim()
}

function nullableText(value = '') {
  return text(value) || null
}

function isoTime(value = '') {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function oneOf(value = '', allowed = [], fallback = null) {
  const normalized = text(value).toLowerCase()
  return allowed.includes(normalized) ? normalized : fallback
}

export function normalizeSharedInboxChannel(input = {}) {
  const channel = oneOf(input.channel, REVO_SHARED_INBOX_CHANNELS)
  return {
    id: nullableText(input.id),
    organisationId: nullableText(input.organisationId || input.organisation_id),
    channel,
    providerKey: nullableText(input.providerKey || input.provider_key),
    address: nullableText(input.address),
    displayName: nullableText(input.displayName || input.display_name),
    connectionStatus: oneOf(input.connectionStatus || input.connection_status, ['draft', 'connected', 'paused', 'disconnected'], 'draft'),
    isDefault: input.isDefault === true || input.is_default === true,
  }
}

export function normalizeSharedInboxConversation(input = {}) {
  return {
    id: nullableText(input.id),
    organisationId: nullableText(input.organisationId || input.organisation_id),
    channelId: nullableText(input.channelId || input.channel_id),
    contactName: nullableText(input.contactName || input.contact_name),
    contactAddress: nullableText(input.contactAddress || input.contact_address),
    subject: nullableText(input.subject),
    status: oneOf(input.status, REVO_SHARED_INBOX_CONVERSATION_STATUSES, 'open'),
    assignedUserId: nullableText(input.assignedUserId || input.assigned_user_id),
    lastMessageAt: isoTime(input.lastMessageAt || input.last_message_at),
    lastMessagePreview: nullableText(input.lastMessagePreview || input.last_message_preview),
  }
}

export function normalizeSharedInboxMessage(input = {}) {
  return {
    id: nullableText(input.id),
    organisationId: nullableText(input.organisationId || input.organisation_id),
    conversationId: nullableText(input.conversationId || input.conversation_id),
    channel: oneOf(input.channel, REVO_SHARED_INBOX_CHANNELS),
    direction: oneOf(input.direction, REVO_SHARED_INBOX_MESSAGE_DIRECTIONS),
    providerKey: nullableText(input.providerKey || input.provider_key),
    providerMessageId: nullableText(input.providerMessageId || input.provider_message_id),
    providerThreadId: nullableText(input.providerThreadId || input.provider_thread_id),
    senderAddress: nullableText(input.senderAddress || input.sender_address),
    recipientAddresses: (Array.isArray(input.recipientAddresses || input.recipient_addresses) ? input.recipientAddresses || input.recipient_addresses : [])
      .map(nullableText)
      .filter(Boolean),
    subject: nullableText(input.subject),
    bodyText: text(input.bodyText || input.body_text),
    occurredAt: isoTime(input.occurredAt || input.occurred_at),
  }
}

export function canAppendSharedInboxMessage(message = {}) {
  const normalized = normalizeSharedInboxMessage(message)
  return Boolean(
    normalized.organisationId &&
      normalized.conversationId &&
      normalized.channel &&
      normalized.direction &&
      normalized.providerKey &&
      normalized.senderAddress &&
      normalized.recipientAddresses.length &&
      normalized.occurredAt,
  )
}
