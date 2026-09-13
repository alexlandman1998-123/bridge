import { isSupabaseConfigured, supabase } from '../../../lib/supabaseClient.js'
import { REVO_ORGANISATION_ID } from '../revoExtensionRegistry.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TABLE_UNAVAILABLE_CODES = new Set(['42P01', '42703', 'PGRST204'])

export const REVO_INBOX_CHANNEL_PROVIDERS = Object.freeze({
  email: Object.freeze([
    Object.freeze({ key: 'google_workspace', label: 'Google Workspace' }),
    Object.freeze({ key: 'microsoft_365', label: 'Microsoft 365' }),
    Object.freeze({ key: 'other_email', label: 'Other email provider' }),
  ]),
  whatsapp: Object.freeze([
    Object.freeze({ key: 'meta_cloud_api', label: 'Meta WhatsApp Cloud API' }),
    Object.freeze({ key: 'twilio_whatsapp', label: 'Twilio WhatsApp' }),
    Object.freeze({ key: 'other_whatsapp', label: 'Other WhatsApp provider' }),
  ]),
})

function text(value = '') {
  return String(value ?? '').trim()
}

function isUuid(value = '') {
  return UUID_PATTERN.test(text(value))
}

function requireRevoOrganisationId(organisationId = '') {
  const normalized = text(organisationId)
  if (normalized !== REVO_ORGANISATION_ID) {
    throw new Error('The shared inbox is only available for the Revo workspace.')
  }
  return normalized
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for shared inbox operations.')
  }
  return supabase
}

function throwIfError(result) {
  if (result?.error) throw result.error
  return result?.data
}

function mapConversation(row = {}) {
  return {
    id: text(row.id),
    organisationId: text(row.organisation_id),
    channelId: text(row.channel_id),
    channel: text(row.revo_inbox_channels?.channel),
    providerKey: text(row.revo_inbox_channels?.provider_key),
    channelAddress: text(row.revo_inbox_channels?.address),
    contactName: text(row.contact_name),
    contactAddress: text(row.contact_address),
    subject: text(row.subject),
    status: text(row.status) || 'open',
    assignedUserId: text(row.assigned_user_id),
    branchId: text(row.branch_id),
    assignedTeamId: text(row.assigned_team_id),
    unreadCount: Math.max(0, Number(row.unread_count) || 0),
    lastMessageAt: row.last_message_at || null,
    lastInboundAt: row.last_inbound_at || null,
    lastOutboundAt: row.last_outbound_at || null,
    lastMessagePreview: text(row.last_message_preview),
    createdAt: row.created_at || null,
  }
}

export function normalizeRevoInboxChannel(row = {}) {
  return {
    id: text(row.id),
    organisationId: text(row.organisation_id),
    channel: text(row.channel),
    providerKey: text(row.provider_key),
    address: text(row.address),
    displayName: text(row.display_name),
    connectionStatus: text(row.connection_status) || 'draft',
    isDefault: row.is_default === true,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function requireChannelType(value) {
  const channel = text(value).toLowerCase()
  if (!Object.hasOwn(REVO_INBOX_CHANNEL_PROVIDERS, channel)) throw new Error('Choose Email or WhatsApp for this Revo channel.')
  return channel
}

function requireProviderKey(channel, value) {
  const providerKey = text(value).toLowerCase()
  if (!REVO_INBOX_CHANNEL_PROVIDERS[channel].some((provider) => provider.key === providerKey)) {
    throw new Error('Choose a supported provider for this channel.')
  }
  return providerKey
}

export function buildRevoInboxChannel({ organisationId, actorUserId, channel, providerKey, address, displayName } = {}) {
  const normalizedChannel = requireChannelType(channel)
  const normalizedAddress = text(address)
  if (!normalizedAddress) throw new Error('Enter the inbox email address or WhatsApp number.')
  if (!isUuid(actorUserId)) throw new Error('A signed-in Revo administrator is required.')
  return {
    organisation_id: requireRevoOrganisationId(organisationId),
    channel: normalizedChannel,
    provider_key: requireProviderKey(normalizedChannel, providerKey),
    address: normalizedAddress,
    display_name: text(displayName) || null,
    connection_status: 'draft',
    is_default: false,
    metadata_json: { setupVersion: 1 },
    created_by: actorUserId,
  }
}

function mapMessage(row = {}) {
  return {
    id: text(row.id),
    conversationId: text(row.conversation_id),
    channel: text(row.channel),
    direction: text(row.direction),
    messageType: text(row.message_type) || 'message',
    senderAddress: text(row.sender_address),
    recipientAddresses: Array.isArray(row.recipient_addresses) ? row.recipient_addresses.map(text).filter(Boolean) : [],
    subject: text(row.subject),
    bodyText: text(row.body_text),
    deliveryStatus: text(row.delivery_status),
    occurredAt: row.occurred_at || null,
    createdBy: text(row.created_by),
  }
}

function mapActivity(row = {}) {
  return {
    id: text(row.id),
    conversationId: text(row.conversation_id),
    actorUserId: text(row.actor_user_id),
    action: text(row.action),
    metadata: row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {},
    createdAt: row.created_at || null,
  }
}

export function isSharedInboxSchemaUnavailable(error = null) {
  return TABLE_UNAVAILABLE_CODES.has(text(error?.code)) || /revo_inbox_(activity|messages|conversations)/i.test(text(error?.message))
}

export function buildPrivateInboxMessage({ organisationId, conversation, actorUserId, bodyText, type = 'note' } = {}) {
  const normalizedType = text(type).toLowerCase()
  const body = text(bodyText)
  if (!['note', 'draft'].includes(normalizedType)) throw new Error('Only a private note or draft can be saved before a channel is connected.')
  if (!body) throw new Error(`Write a ${normalizedType} before saving.`)
  if (!isUuid(actorUserId)) throw new Error('A signed-in Revo user is required.')
  if (!text(conversation?.id) || !text(conversation?.channel) || !text(conversation?.providerKey) || !text(conversation?.channelAddress)) {
    throw new Error('The conversation is missing its channel details.')
  }
  return {
    organisation_id: requireRevoOrganisationId(organisationId),
    conversation_id: text(conversation.id),
    channel: text(conversation.channel),
    direction: normalizedType === 'note' ? 'internal' : 'outbound',
    message_type: normalizedType,
    provider_key: text(conversation.providerKey),
    sender_address: text(conversation.channelAddress),
    recipient_addresses: [text(conversation.contactAddress)].filter(Boolean),
    subject: normalizedType === 'draft' ? text(conversation.subject) || null : null,
    body_text: body,
    delivery_status: 'queued',
    created_by: actorUserId,
  }
}

export async function loadRevoInbox(organisationId) {
  const client = requireClient()
  const resolvedOrganisationId = requireRevoOrganisationId(organisationId)
  const [conversationsResult, messagesResult, activityResult, associationsResult] = await Promise.all([
    client
      .from('revo_inbox_conversations')
      .select('id, organisation_id, channel_id, contact_name, contact_address, subject, status, assigned_user_id, assigned_team_id, branch_id, unread_count, last_message_at, last_inbound_at, last_outbound_at, last_message_preview, created_at, revo_inbox_channels!inner(channel, provider_key, address)')
      .eq('organisation_id', resolvedOrganisationId)
      .order('last_message_at', { ascending: false, nullsFirst: false }),
    client
      .from('revo_inbox_messages')
      .select('id, conversation_id, channel, direction, message_type, sender_address, recipient_addresses, subject, body_text, delivery_status, occurred_at, created_by')
      .eq('organisation_id', resolvedOrganisationId)
      .order('occurred_at', { ascending: true }),
    client
      .from('revo_inbox_activity')
      .select('id, conversation_id, actor_user_id, action, metadata_json, created_at')
      .eq('organisation_id', resolvedOrganisationId)
      .order('created_at', { ascending: true }),
    client
      .from('revo_inbox_associations')
      .select('id, conversation_id, entity_type, entity_id, is_primary, created_at')
      .eq('organisation_id', resolvedOrganisationId)
      .order('created_at', { ascending: true }),
  ])

  const firstError = conversationsResult.error || messagesResult.error || activityResult.error || associationsResult.error
  if (firstError) throw firstError
  return {
    conversations: (conversationsResult.data || []).map(mapConversation),
    messages: (messagesResult.data || []).map(mapMessage),
    activity: (activityResult.data || []).map(mapActivity),
    associations: (associationsResult.data || []).map((row) => ({
      id: text(row.id),
      conversationId: text(row.conversation_id),
      entityType: text(row.entity_type),
      entityId: text(row.entity_id),
      isPrimary: row.is_primary === true,
      createdAt: row.created_at || null,
    })),
  }
}

export async function loadRevoInboxChannels(organisationId) {
  const client = requireClient()
  const data = throwIfError(await client
    .from('revo_inbox_channels')
    .select('id, organisation_id, channel, provider_key, address, display_name, connection_status, is_default, created_at, updated_at')
    .eq('organisation_id', requireRevoOrganisationId(organisationId))
    .order('channel', { ascending: true })
    .order('created_at', { ascending: true }))
  return (data || []).map(normalizeRevoInboxChannel)
}

export async function createRevoInboxChannel(input = {}) {
  const client = requireClient()
  const data = throwIfError(await client
    .from('revo_inbox_channels')
    .insert(buildRevoInboxChannel(input))
    .select('id, organisation_id, channel, provider_key, address, display_name, connection_status, is_default, created_at, updated_at')
    .single())
  return normalizeRevoInboxChannel(data)
}

export async function updateRevoInboxChannel({ organisationId, channelId, displayName, connectionStatus } = {}) {
  const client = requireClient()
  const patch = {}
  if (displayName !== undefined) patch.display_name = text(displayName) || null
  if (connectionStatus !== undefined) {
    const status = text(connectionStatus).toLowerCase()
    if (!['draft', 'paused', 'disconnected'].includes(status)) throw new Error('A channel can only be saved as draft, paused, or disconnected until its provider is connected.')
    patch.connection_status = status
  }
  if (!Object.keys(patch).length) throw new Error('Choose a channel change to save.')
  const data = throwIfError(await client
    .from('revo_inbox_channels')
    .update(patch)
    .eq('id', text(channelId))
    .eq('organisation_id', requireRevoOrganisationId(organisationId))
    .select('id, organisation_id, channel, provider_key, address, display_name, connection_status, is_default, created_at, updated_at')
    .maybeSingle())
  if (!data) throw new Error('The Revo channel could not be updated.')
  return normalizeRevoInboxChannel(data)
}

export async function setRevoInboxDefaultChannel(channelId) {
  const client = requireClient()
  throwIfError(await client.rpc('revo_set_default_inbox_channel', { p_channel_id: text(channelId) }))
}

export async function updateRevoInboxConversation({ organisationId, conversationId, status, assignedUserId } = {}) {
  const client = requireClient()
  const patch = {}
  if (status !== undefined) {
    const normalizedStatus = text(status).toLowerCase()
    if (!['open', 'waiting_on_us', 'waiting_on_client', 'closed', 'spam'].includes(normalizedStatus)) throw new Error('Choose a valid conversation status.')
    patch.status = normalizedStatus
    patch.closed_at = normalizedStatus === 'closed' ? new Date().toISOString() : null
    patch.closed_by = normalizedStatus === 'closed' ? (await client.auth.getUser()).data.user?.id || null : null
  }
  if (assignedUserId !== undefined) {
    if (assignedUserId !== null && !isUuid(assignedUserId)) throw new Error('The selected conversation owner is invalid.')
    patch.assigned_user_id = assignedUserId
  }
  if (!Object.keys(patch).length) throw new Error('Choose a conversation change to save.')
  const data = throwIfError(await client
    .from('revo_inbox_conversations')
    .update(patch)
    .eq('id', text(conversationId))
    .eq('organisation_id', requireRevoOrganisationId(organisationId))
    .select('id, organisation_id, channel_id, contact_name, contact_address, subject, status, assigned_user_id, assigned_team_id, branch_id, unread_count, last_message_at, last_inbound_at, last_outbound_at, last_message_preview, created_at, revo_inbox_channels!inner(channel, provider_key, address)')
    .maybeSingle())
  if (!data) throw new Error('The conversation could not be updated. It may no longer be accessible.')
  return mapConversation(data)
}

export async function saveRevoInboxPrivateMessage(input = {}) {
  const client = requireClient()
  const payload = buildPrivateInboxMessage(input)
  const data = throwIfError(await client
    .from('revo_inbox_messages')
    .insert(payload)
    .select('id, conversation_id, channel, direction, message_type, sender_address, recipient_addresses, subject, body_text, delivery_status, occurred_at, created_by')
    .single())
  return mapMessage(data)
}

export async function markRevoInboxConversationRead({ organisationId, conversationId } = {}) {
  const client = requireClient()
  const data = throwIfError(await client
    .from('revo_inbox_conversations')
    .update({ unread_count: 0, last_read_at: new Date().toISOString() })
    .eq('id', text(conversationId))
    .eq('organisation_id', requireRevoOrganisationId(organisationId))
    .select('id, organisation_id, channel_id, contact_name, contact_address, subject, status, assigned_user_id, assigned_team_id, branch_id, unread_count, last_message_at, last_inbound_at, last_outbound_at, last_message_preview, created_at, revo_inbox_channels!inner(channel, provider_key, address)')
    .maybeSingle())
  if (!data) throw new Error('The conversation could not be marked as read.')
  return mapConversation(data)
}
