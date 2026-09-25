import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const SELLER_DOCUMENT_AUTOMATIONS = [
  'seller_document_requested',
  'seller_document_request_reminder',
  'seller_document_request_escalation',
  'seller_document_manual_reminder',
]
const RETRYABLE_SELLER_DOCUMENT_AUTOMATIONS = new Set([
  'seller_document_request_reminder',
  'seller_document_manual_reminder',
])

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function payload(row = {}) {
  const value = row.payload_json || row.payload
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function normalizeListingSellerDocumentDelivery(row = {}) {
  const eventPayload = payload(row)
  const status = key(row.status || 'queued')
  return {
    id: text(row.id),
    listingId: text(row.listing_id || row.listingId),
    requirementId: text(eventPayload.requirementId || eventPayload.requirement_id),
    requirementKey: key(eventPayload.requirementKey || eventPayload.requirement_key),
    automationKey: key(row.automation_key || row.automationKey),
    channel: key(row.channel || 'in_app'),
    status,
    recipientEmail: text(row.recipient_email || row.recipientEmail),
    recipientRole: text(row.recipient_role || row.recipientRole || 'seller'),
    error: text(row.last_dispatch_error || row.error_message || row.errorMessage),
    attempts: Math.max(0, Number(row.dispatch_attempt_count || row.dispatchAttemptCount || 0)),
    occurredAt: row.delivered_at || row.sent_at || row.failed_at || row.queued_at || row.created_at || '',
    retryable: status === 'failed' && key(row.channel) === 'email' && RETRYABLE_SELLER_DOCUMENT_AUTOMATIONS.has(key(row.automation_key || row.automationKey)),
    raw: row,
  }
}

export function buildListingSellerDocumentDeliveryIndex(rows = []) {
  const deliveries = (Array.isArray(rows) ? rows : [])
    .map(normalizeListingSellerDocumentDelivery)
    .sort((left, right) => Date.parse(right.occurredAt || 0) - Date.parse(left.occurredAt || 0))
  const byRequirementId = new Map()
  const byRequirementKey = new Map()
  deliveries.forEach((delivery) => {
    if (delivery.requirementId && !byRequirementId.has(delivery.requirementId)) byRequirementId.set(delivery.requirementId, delivery)
    if (delivery.requirementKey && !byRequirementKey.has(delivery.requirementKey)) byRequirementKey.set(delivery.requirementKey, delivery)
  })
  return {
    deliveries,
    failed: deliveries.filter((delivery) => delivery.status === 'failed'),
    forDocument(document = {}) {
      const requirementId = text(document.requirementId || document.requirement_id || document.id)
      const requirementKey = key(document.requirementKey || document.requirement_key || document.key)
      return byRequirementId.get(requirementId) || byRequirementKey.get(requirementKey) || null
    },
  }
}

function requireClient(client) {
  if (!isSupabaseConfigured || !client?.from || !client?.rpc) throw new Error('Supabase is required to inspect seller document delivery.')
  return client
}

export async function listListingSellerDocumentDeliveries({ listingId = '', client = supabase } = {}) {
  const normalizedListingId = text(listingId)
  if (!normalizedListingId || !isSupabaseConfigured || !client?.from) return []
  const result = await client
    .from('notification_events')
    .select('id, listing_id, automation_key, channel, status, recipient_email, recipient_role, payload_json, dispatch_attempt_count, last_dispatch_error, error_message, queued_at, sent_at, delivered_at, failed_at, created_at')
    .eq('listing_id', normalizedListingId)
    .in('automation_key', SELLER_DOCUMENT_AUTOMATIONS)
    .order('created_at', { ascending: false })
    .limit(200)
  if (result.error) {
    if (['42P01', 'PGRST205'].includes(text(result.error.code).toUpperCase())) return []
    throw result.error
  }
  return (result.data || []).map(normalizeListingSellerDocumentDelivery)
}

export async function retryListingSellerDocumentDelivery({ listingId = '', eventId = '', client = supabase } = {}) {
  const normalizedListingId = text(listingId)
  const normalizedEventId = text(eventId)
  if (!normalizedListingId || !normalizedEventId) throw new Error('The listing and failed delivery are required before retrying.')
  const result = await requireClient(client).rpc('bridge_retry_seller_document_delivery_phase7', {
    p_listing_id: normalizedListingId,
    p_event_id: normalizedEventId,
  })
  if (result.error) {
    if (['42883', 'PGRST202'].includes(text(result.error.code).toUpperCase()) || /could not find the function|does not exist/i.test(text(result.error.message))) {
      throw new Error('Deploy the Phase 7 seller document collaboration migration before retrying failed messages.')
    }
    throw result.error
  }
  return normalizeListingSellerDocumentDelivery(result.data?.event || result.data)
}

export { SELLER_DOCUMENT_AUTOMATIONS }
