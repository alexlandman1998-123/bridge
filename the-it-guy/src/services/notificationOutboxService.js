import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import {
  NOTIFICATION_MODE,
  normalizeNotificationMode,
  resolveNotificationDispatchPlan,
} from './communicationDeliveryService'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const OUTBOX_STATUSES = ['prepared', 'queued', 'failed']
const EVENT_STATUSES = ['prepared', 'queued', 'sent', 'delivered', 'failed', 'skipped']

function text(value) {
  return String(value ?? '').trim()
}

function nullableUuid(value) {
  const normalized = text(value)
  return UUID_PATTERN.test(normalized) ? normalized : null
}

function normalizeStatus(value = 'prepared') {
  const normalized = text(value).toLowerCase().replace(/[\s-]+/g, '_')
  return EVENT_STATUSES.includes(normalized) ? normalized : 'prepared'
}

function mapOutboxEvent(row = {}) {
  const payloadSource = row.payload_json || row.payload
  const metadataSource = row.metadata_json || row.metadata
  const payload = payloadSource && typeof payloadSource === 'object' ? payloadSource : {}
  const metadata = metadataSource && typeof metadataSource === 'object' ? metadataSource : {}
  return {
    id: text(row.id),
    organisationId: text(row.organisation_id),
    leadId: text(row.lead_id),
    listingId: text(row.listing_id),
    transactionId: text(row.transaction_id),
    offerId: text(row.offer_id),
    appointmentId: text(row.appointment_id),
    eventKey: text(row.event_key),
    communicationType: text(payload.communicationType || metadata.communicationType || row.event_key),
    channel: text(row.channel),
    status: normalizeStatus(row.status),
    recipient: text(payload.recipient || row.recipient_email),
    recipientRole: text(row.recipient_role),
    subject: text(row.subject),
    messagePreview: text(row.message_preview),
    notificationMode: normalizeNotificationMode(metadata.notificationMode || payload.notificationMode),
    handoffRequired: Boolean(metadata.handoffRequired),
    errorMessage: text(row.error_message),
    dedupeKey: text(row.dedupe_key),
    preparedAt: row.prepared_at || null,
    queuedAt: row.queued_at || null,
    sentAt: row.sent_at || null,
    deliveredAt: row.delivered_at || null,
    failedAt: row.failed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    payload,
    metadata,
    raw: row,
  }
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before preparing notifications in the outbox.')
  }
  return supabase
}

function isMissingOutboxTable(error) {
  const code = text(error?.code).toUpperCase()
  const message = text(error?.message).toLowerCase()
  return code === '42P01' || message.includes('notification_events')
}

/**
 * Builds durable outbox rows without sending anything. Automatic modes create
 * queued channel jobs; agent-assisted mode creates one in-app handoff task.
 */
export function buildNotificationOutboxPayloads({
  organisationId = '',
  branchId = '',
  assignedUserId = '',
  leadId = '',
  listingId = '',
  transactionId = '',
  offerId = '',
  appointmentId = '',
  communicationType = 'manual_notification',
  notificationMode = NOTIFICATION_MODE.EMAIL,
  recipientName = '',
  recipientRole = 'client',
  email = '',
  phone = '',
  subject = '',
  message = '',
  source = 'agent_workspace',
  dedupeKey = '',
  metadata = {},
} = {}) {
  const organisationUuid = nullableUuid(organisationId)
  if (!organisationUuid) throw new Error('A persisted organisation is required before preparing notifications.')
  const plan = resolveNotificationDispatchPlan({ mode: notificationMode, email, phone, recipientName, metadata })
  if (plan.blockers.length) throw new Error(plan.blockers.join(' '))

  const base = {
    organisation_id: organisationUuid,
    branch_id: nullableUuid(branchId),
    assigned_user_id: nullableUuid(assignedUserId),
    lead_id: nullableUuid(leadId),
    listing_id: nullableUuid(listingId),
    transaction_id: nullableUuid(transactionId),
    offer_id: nullableUuid(offerId),
    appointment_id: nullableUuid(appointmentId),
    event_key: text(communicationType) || 'manual_notification',
    category: 'notification',
    trigger_type: 'manual_send',
    recipient_role: text(recipientRole) || 'client',
    subject: text(subject) || null,
    message_preview: text(message).slice(0, 320) || null,
    source: text(source) || 'agent_workspace',
    payload_json: {
      communicationType: text(communicationType) || 'manual_notification',
      recipientName: text(recipientName),
      notificationMode: plan.mode,
      message: text(message),
    },
    metadata_json: {
      ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}),
      notificationMode: plan.mode,
      handoffRequired: plan.handoffRequired,
      notificationSuppressed: plan.suppressed,
      notificationSuppressionReason: plan.suppressionReason || null,
      outbox: true,
    },
  }

  if (plan.suppressed) {
    return [{
      ...base,
      channel: 'in_app',
      status: 'skipped',
      recipient_email: text(email).toLowerCase() || null,
      error_message: plan.suppressionMessage || 'Controlled test recipient: external notification delivery is suppressed.',
      dedupe_key: text(dedupeKey) ? `${text(dedupeKey)}:suppressed` : null,
      payload_json: {
        ...base.payload_json,
        recipient: text(recipientName) || text(email) || text(phone) || 'Controlled test recipient',
        phone: text(phone),
      },
    }]
  }

  if (plan.handoffRequired) {
    return [{
      ...base,
      channel: 'in_app',
      status: 'prepared',
      recipient_email: text(email) || null,
      dedupe_key: text(dedupeKey) ? `${text(dedupeKey)}:agent_handoff` : null,
      payload_json: {
        ...base.payload_json,
        recipient: text(recipientName) || text(email) || text(phone) || 'Recipient pending',
        phone: text(phone),
      },
    }]
  }

  return plan.channels.map((channel) => {
    const recipient = channel === 'email' ? text(email).toLowerCase() : text(phone)
    return {
      ...base,
      channel,
      status: 'queued',
      recipient_email: recipient,
      dedupe_key: text(dedupeKey) ? `${text(dedupeKey)}:${channel}` : null,
      payload_json: {
        ...base.payload_json,
        recipient,
      },
    }
  })
}

export async function prepareNotificationOutbox(input = {}) {
  const client = requireClient()
  const payloads = buildNotificationOutboxPayloads(input)
  const created = []

  for (const payload of payloads) {
    if (payload.dedupe_key) {
      const existing = await client
        .from('notification_events')
        .select('*')
        .eq('organisation_id', payload.organisation_id)
        .eq('dedupe_key', payload.dedupe_key)
        .in('status', ['prepared', 'queued'])
        .maybeSingle()
      if (existing.error && !isMissingOutboxTable(existing.error)) throw existing.error
      if (existing.data) {
        created.push(mapOutboxEvent(existing.data))
        continue
      }
    }

    const inserted = await client
      .from('notification_events')
      .insert(payload)
      .select('*')
      .single()
    if (inserted.error) {
      if (isMissingOutboxTable(inserted.error)) {
        throw new Error('Notification outbox is unavailable. Apply the notification automation foundation migration before using queued notifications.')
      }
      throw inserted.error
    }
    created.push(mapOutboxEvent(inserted.data))
  }

  return {
    plan: resolveNotificationDispatchPlan({
      mode: input.notificationMode,
      email: input.email,
      phone: input.phone,
      recipientName: input.recipientName,
      metadata: input.metadata,
    }),
    items: created,
  }
}

export async function listNotificationOutbox({
  organisationId = '',
  leadId = '',
  listingId = '',
  transactionId = '',
  status = '',
  limit = 100,
} = {}) {
  const organisationUuid = nullableUuid(organisationId)
  if (!organisationUuid) return []
  const client = requireClient()
  let query = client
    .from('notification_events')
    .select('*')
    .eq('organisation_id', organisationUuid)
    .eq('source', 'agent_workspace')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 500)))
  if (nullableUuid(leadId)) query = query.eq('lead_id', nullableUuid(leadId))
  if (nullableUuid(listingId)) query = query.eq('listing_id', nullableUuid(listingId))
  if (nullableUuid(transactionId)) query = query.eq('transaction_id', nullableUuid(transactionId))
  if (status && status !== 'all') query = query.eq('status', normalizeStatus(status))
  else query = query.in('status', OUTBOX_STATUSES)
  const result = await query
  if (result.error) {
    if (isMissingOutboxTable(result.error)) return []
    throw result.error
  }
  return (result.data || []).map(mapOutboxEvent)
}

export async function updateNotificationOutboxStatus({
  eventId = '',
  status = 'prepared',
  errorMessage = '',
  provider = '',
} = {}) {
  const id = nullableUuid(eventId)
  if (!id) throw new Error('A notification outbox item id is required.')
  const nextStatus = normalizeStatus(status)
  const patch = {
    status: nextStatus,
    error_message: text(errorMessage) || null,
    provider: text(provider) || null,
    queued_at: nextStatus === 'queued' ? new Date().toISOString() : undefined,
    sent_at: nextStatus === 'sent' ? new Date().toISOString() : undefined,
    failed_at: nextStatus === 'failed' ? new Date().toISOString() : undefined,
  }
  Object.keys(patch).forEach((key) => {
    if (patch[key] === undefined) delete patch[key]
  })
  const client = requireClient()
  const result = await client
    .from('notification_events')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (result.error) throw result.error
  return mapOutboxEvent(result.data)
}

/**
 * A failed notification is only moved back to the prepared queue. It is never
 * dispatched automatically by recovery, and controlled test recipients remain
 * suppressed. The recovery decision is retained in the event metadata.
 */
export async function prepareNotificationOutboxRecovery({ eventId = '', organisationId = '', actor = {} } = {}) {
  const id = nullableUuid(eventId)
  const organisationUuid = nullableUuid(organisationId)
  if (!id || !organisationUuid) throw new Error('A persisted organisation and notification event are required for recovery.')
  const client = requireClient()
  const current = await client
    .from('notification_events')
    .select('*')
    .eq('id', id)
    .eq('organisation_id', organisationUuid)
    .maybeSingle()
  if (current.error) throw current.error
  if (!current.data) throw new Error('Notification event was not found in this organisation.')

  const event = mapOutboxEvent(current.data)
  if (event.status !== 'failed') throw new Error('Only failed notification events can be prepared for recovery.')
  const plan = resolveNotificationDispatchPlan({
    mode: event.notificationMode,
    email: event.channel === 'email' ? event.recipient : '',
    phone: event.channel === 'whatsapp' ? event.recipient : '',
    recipientName: event.payload?.recipientName || '',
    metadata: event.metadata,
  })
  if (plan.suppressed) throw new Error('Controlled test notifications cannot be retried externally.')

  const previousRecovery = event.metadata?.recovery && typeof event.metadata.recovery === 'object' ? event.metadata.recovery : {}
  const recoveryEvent = {
    action: 'prepared_notification_retry',
    previousStatus: event.status,
    requestedAt: new Date().toISOString(),
    actorId: text(actor?.id) || null,
    actorName: text(actor?.name) || null,
  }
  const result = await client
    .from('notification_events')
    .update({
      status: 'prepared',
      error_message: null,
      metadata_json: {
        ...event.metadata,
        recovery: {
          ...previousRecovery,
          last: recoveryEvent,
          history: [...(Array.isArray(previousRecovery.history) ? previousRecovery.history : []), recoveryEvent].slice(-10),
        },
      },
    })
    .eq('id', id)
    .eq('organisation_id', organisationUuid)
    .eq('status', 'failed')
    .select('*')
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data) throw new Error('The notification changed before recovery could be prepared. Refresh and try again.')
  return mapOutboxEvent(result.data)
}

export function summarizeNotificationOutbox(events = []) {
  const rows = Array.isArray(events) ? events.map(mapOutboxEvent) : []
  return {
    total: rows.length,
    prepared: rows.filter((row) => row.status === 'prepared').length,
    queued: rows.filter((row) => row.status === 'queued').length,
    failed: rows.filter((row) => row.status === 'failed').length,
    agentHandoffs: rows.filter((row) => row.handoffRequired).length,
  }
}

export const __notificationOutboxServiceTestUtils = {
  buildNotificationOutboxPayloads,
  mapOutboxEvent,
  normalizeStatus,
  summarizeNotificationOutbox,
  prepareNotificationOutboxRecovery,
}
