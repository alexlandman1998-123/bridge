import { supabase } from './supabaseClient'

const SELECT = 'id, transaction_id, user_id, role_type, notification_type, title, message, is_read, read_at, dedupe_key, event_type, event_data, created_at, updated_at'
const CACHE_TTL_MS = 15_000
let cachedResult = null
let cachedAt = 0
let inFlight = null

function isMissingTable(error) {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || '').toLowerCase()
  return code === '42P01' || code === 'PGRST205' || message.includes('transaction_notifications') && message.includes('does not exist')
}

function normalize(row) {
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    userId: row?.user_id || null,
    roleType: String(row?.role_type || '').trim().toLowerCase(),
    type: String(row?.notification_type || '').trim().toLowerCase(),
    title: row?.title || '',
    message: row?.message || '',
    isRead: Boolean(row?.is_read),
    readAt: row?.read_at || null,
    dedupeKey: row?.dedupe_key || null,
    eventType: String(row?.event_type || '').trim().toLowerCase(),
    eventData: row?.event_data && typeof row.event_data === 'object' ? row.event_data : {},
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

function isPlaceholderDocumentNotification(row = {}) {
  const data = row?.event_data && typeof row.event_data === 'object' ? row.event_data : {}
  const type = String(row?.notification_type || '').trim().toLowerCase()
  const source = String(data.source || data.trigger || data.type || '').trim().toLowerCase()
  const isDocumentNotification =
    ['additional_document_requested', 'document_uploaded', 'overdue_missing_docs'].includes(type) ||
    source.includes('document')
  if (!isDocumentNotification) return false

  const meaningfulContext = [
    data.propertyAddress,
    data.property_address,
    data.listingAddress,
    data.listing_address,
    data.unitAddress,
    data.unit_address,
    data.unitLabel,
    data.unit_label,
    data.unitName,
    data.unit_name,
    data.developmentName,
    data.development_name,
    data.transactionReference,
    data.transaction_reference,
    data.documentName,
    data.document_name,
    data.clientName,
    data.client_name,
  ].some((value) => String(value || '').trim())
  if (meaningfulContext) return false

  const title = String(row?.title || '').trim()
  return !title || /^unit\s*-?\s*$/i.test(title) || /^notification$/i.test(title)
}

async function currentUserId() {
  const result = await supabase.auth.getUser()
  if (result.error) throw result.error
  return result.data?.user?.id || null
}

export async function fetchMyNotifications({ limit = 25, unreadOnly = false, userId: suppliedUserId = null } = {}) {
  if (!unreadOnly && cachedResult && Date.now() - cachedAt < CACHE_TTL_MS) return cachedResult
  if (!unreadOnly && inFlight) return inFlight
  const loader = async () => {
    const userId = String(suppliedUserId || '').trim() || await currentUserId()
    if (!userId) return { notifications: [], unreadCount: 0 }
    let list = supabase.from('transaction_notifications').select(SELECT).eq('user_id', userId).order('created_at', { ascending: false }).limit(Math.max(1, Number(limit) || 25))
    if (unreadOnly) list = list.eq('is_read', false)
    const listResult = await list
    if (listResult.error) {
      if (isMissingTable(listResult.error)) return { notifications: [], unreadCount: 0 }
      throw listResult.error
    }
    const notifications = (listResult.data || [])
      .filter((row) => !isPlaceholderDocumentNotification(row))
      .map(normalize)
    const transactionIds = [...new Set(notifications.map((item) => item.transactionId).filter(Boolean))]
    let unitIds = {}
    if (transactionIds.length) {
      const units = await supabase.from('transactions').select('id, unit_id').in('id', transactionIds)
      if (!units.error) unitIds = Object.fromEntries((units.data || []).map((row) => [row.id, row.unit_id || null]))
    }
    return {
      notifications: notifications.map((item) => ({ ...item, unitId: unitIds[item.transactionId] || item.eventData?.unitId || null })),
      unreadCount: notifications.filter((item) => !item.isRead).length,
    }
  }
  const request = loader()
  if (!unreadOnly) inFlight = request
  try {
    const result = await request
    if (!unreadOnly) {
      cachedResult = result
      cachedAt = Date.now()
    }
    return result
  } finally {
    if (!unreadOnly && inFlight === request) inFlight = null
  }
}

export async function markNotificationRead(notificationId) {
  if (!notificationId) return null
  const userId = await currentUserId()
  if (!userId) return null
  const now = new Date().toISOString()
  const result = await supabase.from('transaction_notifications').update({ is_read: true, read_at: now, updated_at: now }).eq('id', notificationId).eq('user_id', userId).select(SELECT).maybeSingle()
  if (result.error) {
    if (isMissingTable(result.error)) return null
    throw result.error
  }
  cachedResult = null
  return result.data ? normalize(result.data) : null
}

export async function markAllNotificationsRead() {
  const userId = await currentUserId()
  if (!userId) return 0
  const now = new Date().toISOString()
  const result = await supabase.from('transaction_notifications').update({ is_read: true, read_at: now, updated_at: now }).eq('user_id', userId).eq('is_read', false).select('id')
  if (result.error) {
    if (isMissingTable(result.error)) return 0
    throw result.error
  }
  cachedResult = null
  return (result.data || []).length
}
