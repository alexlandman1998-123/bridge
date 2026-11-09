// clientPortal owns these operations and their existing recovery behavior.
import { normalizeNullableText, isMissingTableError, isMissingSchemaError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { requireClientPortalTokenClient } from './appointmentRead.js'
import { resolveClientPortalLinkByToken } from './originatorFinanceRead.js'

function normalizeClientPortalNotificationType(value, fallback = 'action_required') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  const allowed = new Set([
    'action_required',
    'document_requested',
    'additional_document_requested',
    'document_rejected',
    'document_approved',
    'signature_required',
    'mandate_signature_required',
    'otp_signature_required',
    'onboarding_required',
    'onboarding_completed',
    'stage_updated',
    'message_shared',
    'appointment_requested',
    'appointment_reschedule_requested',
    'appointment_reschedule_proposed',
    'appointment_reschedule_rejected',
    'appointment_confirmed',
    'appointment_completed',
    'appointment_rescheduled',
    'appointment_cancelled',
    'appointment_reminder_due',
    'appointment_documents_required',
    'no_action_required',
  ])
  return allowed.has(normalized) ? normalized : fallback
}

function normalizeClientPortalNotificationPriority(value, fallback = 'normal') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  const allowed = new Set(['urgent', 'high', 'normal', 'low', 'informational'])
  if (allowed.has(normalized)) return normalized
  return fallback
}

function normalizeClientPortalNotificationStatus(value, fallback = 'unread') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  const allowed = new Set(['unread', 'read', 'dismissed'])
  return allowed.has(normalized) ? normalized : fallback
}

function normalizeClientPortalNotificationVisibility(value, fallback = 'client_visible') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  const allowed = new Set(['client_visible', 'shared_role_players', 'internal_only'])
  return allowed.has(normalized) ? normalized : fallback
}

function normalizeClientPortalNotificationRole(value, fallback = 'buyer') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (normalized === 'selling') return 'seller'
  if (normalized === 'buying') return 'buyer'
  const allowed = new Set(['buyer', 'seller', 'shared', 'both'])
  return allowed.has(normalized) ? normalized : fallback
}

function normalizeOptionalUuid(value) {
  const normalized = String(value || '').trim()
  if (!normalized) return null
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidPattern.test(normalized) ? normalized : null
}

function normalizeClientPortalNotificationRow(row = {}) {
  return {
    id: row?.id || null,
    transactionId: row?.transaction_id || null,
    clientPortalToken: row?.client_portal_token || null,
    clientRole: normalizeClientPortalNotificationRole(row?.client_role),
    type: normalizeClientPortalNotificationType(row?.notification_type),
    title: normalizeTextValue(row?.title || 'Arch9 Update'),
    description: normalizeTextValue(row?.description || ''),
    priority: normalizeClientPortalNotificationPriority(row?.priority),
    status: normalizeClientPortalNotificationStatus(row?.status),
    relatedEntityType: normalizeNullableText(row?.related_entity_type),
    relatedEntityId: normalizeOptionalUuid(row?.related_entity_id),
    actionLabel: normalizeNullableText(row?.action_label),
    actionRoute: normalizeNullableText(row?.action_route),
    visibility: normalizeClientPortalNotificationVisibility(row?.visibility),
    metadata: row?.metadata && typeof row.metadata === 'object' ? row.metadata : {},
    dedupeKey: normalizeNullableText(row?.dedupe_key),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || row?.created_at || null,
    readAt: row?.read_at || null,
    dismissedAt: row?.dismissed_at || null,
  }
}

export async function upsertClientPortalNotification({
  token,
  clientRole = 'buyer',
  transactionId = null,
  clientPortalToken = null,
  notificationType = 'action_required',
  title = 'Arch9 Update',
  description = '',
  priority = 'normal',
  status = 'unread',
  relatedEntityType = null,
  relatedEntityId = null,
  actionLabel = null,
  actionRoute = null,
  visibility = 'client_visible',
  metadata = {},
  dedupeKey = null,
} = {}) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const resolvedTransactionId = transactionId || link?.transaction_id
  if (!resolvedTransactionId) {
    throw new Error('Transaction context is required to create a client portal notification.')
  }

  const normalizedRole = normalizeClientPortalNotificationRole(clientRole)
  const normalizedType = normalizeClientPortalNotificationType(notificationType)
  const normalizedStatus = normalizeClientPortalNotificationStatus(status)
  const normalizedVisibility = normalizeClientPortalNotificationVisibility(visibility)
  const normalizedPriority = normalizeClientPortalNotificationPriority(priority)
  const normalizedDedupeKey = normalizeNullableText(dedupeKey)
  const normalizedRelatedEntityId = normalizeOptionalUuid(relatedEntityId)
  const now = new Date().toISOString()
  const selectClause = [
    'id',
    'transaction_id',
    'client_portal_token',
    'client_role',
    'notification_type',
    'title',
    'description',
    'priority',
    'status',
    'related_entity_type',
    'related_entity_id',
    'action_label',
    'action_route',
    'visibility',
    'metadata',
    'dedupe_key',
    'created_at',
    'updated_at',
    'read_at',
    'dismissed_at',
  ].join(', ')

  const existingQuery = await client
    .from('client_portal_notifications')
    .select(selectClause)
    .eq('transaction_id', resolvedTransactionId)
    .eq('client_role', normalizedRole)
    .eq('notification_type', normalizedType)
    .eq('dedupe_key', normalizedDedupeKey || '')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingQuery.error) {
    if (
      isMissingTableError(existingQuery.error, 'client_portal_notifications') ||
      isMissingSchemaError(existingQuery.error)
    ) {
      return null
    }
    throw existingQuery.error
  }

  if (existingQuery.data) {
    const existing = normalizeClientPortalNotificationRow(existingQuery.data)
    if (existing.status === 'dismissed') {
      return existing
    }

    if (
      existing.title === normalizeTextValue(title || 'Arch9 Update') &&
      existing.description === normalizeTextValue(description || '') &&
      existing.priority === normalizedPriority &&
      existing.actionLabel === normalizeNullableText(actionLabel) &&
      existing.actionRoute === normalizeNullableText(actionRoute) &&
      existing.status === normalizedStatus
    ) {
      return existing
    }

    const { data: updated, error: updateError } = await client
      .from('client_portal_notifications')
      .update({
        title: normalizeTextValue(title || 'Arch9 Update'),
        description: normalizeNullableText(description),
        priority: normalizedPriority,
        status: normalizedStatus,
        related_entity_type: normalizeNullableText(relatedEntityType),
        related_entity_id: normalizedRelatedEntityId,
        action_label: normalizeNullableText(actionLabel),
        action_route: normalizeNullableText(actionRoute),
        visibility: normalizedVisibility,
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
        read_at: normalizedStatus === 'read' ? now : existing.readAt,
        dismissed_at: normalizedStatus === 'dismissed' ? now : existing.dismissedAt,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select(selectClause)
      .maybeSingle()

    if (updateError) {
      if (isMissingTableError(updateError, 'client_portal_notifications') || isMissingSchemaError(updateError)) {
        return existing
      }
      throw updateError
    }

    return updated ? normalizeClientPortalNotificationRow(updated) : existing
  }

  const insertPayload = {
    transaction_id: resolvedTransactionId,
    client_portal_token: normalizeNullableText(clientPortalToken || token),
    client_role: normalizedRole,
    notification_type: normalizedType,
    title: normalizeTextValue(title || 'Arch9 Update'),
    description: normalizeNullableText(description),
    priority: normalizedPriority,
    status: normalizedStatus,
    related_entity_type: normalizeNullableText(relatedEntityType),
    related_entity_id: normalizedRelatedEntityId,
    action_label: normalizeNullableText(actionLabel),
    action_route: normalizeNullableText(actionRoute),
    visibility: normalizedVisibility,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    dedupe_key: normalizedDedupeKey || '',
    read_at: normalizedStatus === 'read' ? now : null,
    dismissed_at: normalizedStatus === 'dismissed' ? now : null,
    created_at: now,
    updated_at: now,
  }

  const { data: inserted, error: insertError } = await client
    .from('client_portal_notifications')
    .insert(insertPayload)
    .select(selectClause)
    .maybeSingle()

  if (insertError) {
    if (isMissingTableError(insertError, 'client_portal_notifications') || isMissingSchemaError(insertError)) {
      return null
    }
    throw insertError
  }

  return inserted ? normalizeClientPortalNotificationRow(inserted) : null
}

export async function fetchClientPortalNotifications({
  token,
  clientRole = 'buyer',
  includeDismissed = false,
  limit = 40,
} = {}) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  const resolvedTransactionId = link?.transaction_id
  if (!resolvedTransactionId) {
    return { notifications: [], unreadCount: 0 }
  }

  const normalizedRole = normalizeClientPortalNotificationRole(clientRole)
  const selectClause = [
    'id',
    'transaction_id',
    'client_portal_token',
    'client_role',
    'notification_type',
    'title',
    'description',
    'priority',
    'status',
    'related_entity_type',
    'related_entity_id',
    'action_label',
    'action_route',
    'visibility',
    'metadata',
    'dedupe_key',
    'created_at',
    'updated_at',
    'read_at',
    'dismissed_at',
  ].join(', ')

  let listQuery = client
    .from('client_portal_notifications')
    .select(selectClause)
    .eq('transaction_id', resolvedTransactionId)
    .eq('client_role', normalizedRole)
    .eq('visibility', 'client_visible')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!includeDismissed) {
    listQuery = listQuery.neq('status', 'dismissed')
  }

  const listResult = await listQuery
  if (listResult.error) {
    if (
      isMissingTableError(listResult.error, 'client_portal_notifications') ||
      isMissingSchemaError(listResult.error)
    ) {
      return { notifications: [], unreadCount: 0 }
    }
    throw listResult.error
  }

  const unreadResult = await client
    .from('client_portal_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('transaction_id', resolvedTransactionId)
    .eq('client_role', normalizedRole)
    .eq('visibility', 'client_visible')
    .eq('status', 'unread')

  const unreadCount = unreadResult.error ? 0 : Number(unreadResult.count || 0)
  return {
    notifications: (listResult.data || []).map((row) => normalizeClientPortalNotificationRow(row)),
    unreadCount,
  }
}

export async function markClientPortalNotificationReadById({ token, notificationId } = {}) {
  if (!notificationId) return null

  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  if (!link?.transaction_id) return null
  const now = new Date().toISOString()

  const selectClause = [
    'id',
    'transaction_id',
    'client_portal_token',
    'client_role',
    'notification_type',
    'title',
    'description',
    'priority',
    'status',
    'related_entity_type',
    'related_entity_id',
    'action_label',
    'action_route',
    'visibility',
    'metadata',
    'dedupe_key',
    'created_at',
    'updated_at',
    'read_at',
    'dismissed_at',
  ].join(', ')

  const { data, error } = await client
    .from('client_portal_notifications')
    .update({
      status: 'read',
      read_at: now,
      updated_at: now,
    })
    .eq('id', notificationId)
    .eq('transaction_id', link.transaction_id)
    .neq('status', 'dismissed')
    .select(selectClause)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'client_portal_notifications') || isMissingSchemaError(error)) {
      return null
    }
    throw error
  }

  return data ? normalizeClientPortalNotificationRow(data) : null
}

export async function markAllClientPortalNotificationsReadByToken({ token, clientRole = 'buyer' } = {}) {
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  if (!link?.transaction_id) return 0
  const now = new Date().toISOString()
  const normalizedRole = normalizeClientPortalNotificationRole(clientRole)

  const { data, error } = await client
    .from('client_portal_notifications')
    .update({
      status: 'read',
      read_at: now,
      updated_at: now,
    })
    .eq('transaction_id', link.transaction_id)
    .eq('client_role', normalizedRole)
    .eq('visibility', 'client_visible')
    .eq('status', 'unread')
    .select('id')

  if (error) {
    if (isMissingTableError(error, 'client_portal_notifications') || isMissingSchemaError(error)) {
      return 0
    }
    throw error
  }

  return (data || []).length
}

export async function dismissClientPortalNotificationById({ token, notificationId } = {}) {
  if (!notificationId) return null
  const client = requireClientPortalTokenClient(token)
  const link = await resolveClientPortalLinkByToken(client, token)
  if (!link?.transaction_id) return null
  const now = new Date().toISOString()
  const selectClause = [
    'id',
    'transaction_id',
    'client_portal_token',
    'client_role',
    'notification_type',
    'title',
    'description',
    'priority',
    'status',
    'related_entity_type',
    'related_entity_id',
    'action_label',
    'action_route',
    'visibility',
    'metadata',
    'dedupe_key',
    'created_at',
    'updated_at',
    'read_at',
    'dismissed_at',
  ].join(', ')

  const { data, error } = await client
    .from('client_portal_notifications')
    .update({
      status: 'dismissed',
      dismissed_at: now,
      updated_at: now,
    })
    .eq('id', notificationId)
    .eq('transaction_id', link.transaction_id)
    .select(selectClause)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'client_portal_notifications') || isMissingSchemaError(error)) {
      return null
    }
    throw error
  }

  return data ? normalizeClientPortalNotificationRow(data) : null
}
