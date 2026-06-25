import {
  dismissClientPortalNotificationById,
  fetchClientPortalNotifications,
  markAllClientPortalNotificationsReadByToken,
  markClientPortalNotificationReadById,
  upsertClientPortalNotification,
} from '../lib/api'

function normalizeValue(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizePriority(value = '') {
  const normalized = normalizeValue(value)
  if (['urgent', 'high', 'normal', 'low', 'informational'].includes(normalized)) return normalized
  if (normalized === 'medium') return 'normal'
  return 'normal'
}

function normalizeStatus(value = '') {
  const normalized = normalizeValue(value)
  if (['unread', 'read', 'dismissed'].includes(normalized)) return normalized
  return 'unread'
}

function normalizeClientRole(value = '') {
  const normalized = normalizeValue(value)
  if (normalized === 'seller' || normalized === 'selling') return 'seller'
  if (normalized === 'buyer' || normalized === 'buying') return 'buyer'
  if (normalized === 'shared' || normalized === 'both') return 'shared'
  return 'buyer'
}

function normalizeNotificationType(value = '') {
  const normalized = normalizeValue(value)
  if (!normalized) return 'action_required'

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
  if (allowed.has(normalized)) return normalized

  if (normalized.includes('reupload') || normalized.includes('rejected')) return 'document_rejected'
  if (normalized.includes('additional_document')) return 'additional_document_requested'
  if (normalized.includes('document')) return 'document_requested'
  if (normalized.includes('mandate')) return 'mandate_signature_required'
  if (normalized.includes('otp')) return 'otp_signature_required'
  if (normalized.includes('onboarding')) return 'onboarding_required'
  if (normalized.includes('stage')) return 'stage_updated'

  return 'action_required'
}

function buildDedupeKey({ notificationType = '', relatedEntityType = '', relatedEntityId = '', fallback = '' } = {}) {
  const type = normalizeNotificationType(notificationType)
  const entityType = normalizeValue(relatedEntityType)
  const entityId = String(relatedEntityId || '').trim()
  const fallbackKey = String(fallback || '').trim().toLowerCase()
  return [type, entityType || 'none', entityId || 'none', fallbackKey || 'none'].join(':')
}

function mapNextActionTypeToNotificationType(actionType = '') {
  const normalized = normalizeValue(actionType)
  if (normalized === 'onboarding_required') return 'onboarding_required'
  if (normalized === 'mandate_signature_required') return 'mandate_signature_required'
  if (normalized === 'otp_signature_required') return 'otp_signature_required'
  if (normalized === 'document_reupload_required') return 'document_rejected'
  if (normalized === 'additional_document_requested') return 'additional_document_requested'
  if (normalized === 'document_upload_required' || normalized === 'proof_of_funds_required') return 'document_requested'
  if (normalized === 'awaiting_internal_review' || normalized === 'awaiting_other_party') return 'message_shared'
  return 'action_required'
}

function mapActivityTypeToNotificationType(activityType = '') {
  const normalized = normalizeValue(activityType)
  if (!normalized) return 'message_shared'

  const mapping = {
    onboarding_sent: 'onboarding_required',
    onboarding_completed: 'onboarding_completed',
    document_requested: 'document_requested',
    additional_document_requested: 'additional_document_requested',
    document_uploaded: 'message_shared',
    document_rejected: 'document_rejected',
    document_approved: 'document_approved',
    mandate_sent: 'mandate_signature_required',
    mandate_signed: 'message_shared',
    otp_ready: 'otp_signature_required',
    otp_signed: 'message_shared',
    transaction_stage_changed: 'stage_updated',
    note_shared_with_client: 'message_shared',
    appointment_requested: 'appointment_requested',
    appointment_reschedule_requested: 'appointment_reschedule_requested',
    appointment_reschedule_proposed: 'appointment_reschedule_proposed',
    appointment_reschedule_rejected: 'appointment_reschedule_rejected',
    appointment_confirmed: 'appointment_confirmed',
    appointment_scheduled: 'appointment_requested',
    appointment_completed: 'appointment_completed',
    appointment_rescheduled: 'appointment_rescheduled',
    appointment_cancelled: 'appointment_cancelled',
    appointment_reminder_due: 'appointment_reminder_due',
    appointment_documents_required: 'appointment_documents_required',
  }

  return mapping[normalized] || 'message_shared'
}

function shouldCreateNotificationFromActivityEvent(event = {}) {
  if (!event) return false
  if (event?.metadata?.silentNotification === true) return false
  const type = normalizeValue(event?.type)
  const allowedAlways = new Set([
    'document_rejected',
    'document_requested',
    'additional_document_requested',
    'otp_ready',
    'mandate_sent',
    'onboarding_sent',
    'appointment_confirmation_required',
    'appointment_reschedule_requested',
    'appointment_reschedule_proposed',
    'appointment_reschedule_rejected',
    'appointment_cancelled',
    'appointment_documents_required',
    'transaction_stage_changed',
    'registration_completed',
    'lodgement_submitted',
  ])
  if (allowedAlways.has(type)) return true
  return event?.requiresAttention === true
}

function deriveActionRoute(notification = {}) {
  const explicitRoute = String(notification?.actionRoute || notification?.action_route || '').trim()
  if (explicitRoute) return explicitRoute

  const type = normalizeNotificationType(notification?.notificationType || notification?.type)
  if (['document_requested', 'additional_document_requested', 'document_rejected', 'document_approved'].includes(type)) {
    return 'documents'
  }
  if (['otp_signature_required', 'mandate_signature_required'].includes(type)) {
    return 'documents'
  }
  if (type === 'appointment_documents_required') {
    return 'documents'
  }
  if (type === 'onboarding_required') {
    return 'details'
  }
  if (type === 'stage_updated') {
    return 'progress'
  }
  if (type.startsWith('appointment_')) {
    return 'appointments'
  }

  return 'overview'
}

function deriveActionLabel(notification = {}) {
  const explicit = String(notification?.actionLabel || notification?.action_label || '').trim()
  if (explicit) return explicit

  const type = normalizeNotificationType(notification?.notificationType || notification?.type)
  if (type === 'document_rejected') return 'Re-upload Document'
  if (type === 'document_requested' || type === 'additional_document_requested') return 'Upload Document'
  if (type === 'otp_signature_required') return 'Sign OTP'
  if (type === 'mandate_signature_required') return 'Sign Mandate'
  if (type === 'onboarding_required') return 'Complete Onboarding'
  if (type === 'stage_updated') return 'View Progress'
  if (type === 'appointment_documents_required') return 'Upload Documents'
  if (type.startsWith('appointment_')) return 'View Appointment'
  return 'Open'
}

function normalizeClientPortalNotification(notification = {}) {
  const createdAt = notification?.createdAt || notification?.created_at || new Date().toISOString()

  return {
    id: notification?.id || `notification_${Math.random().toString(36).slice(2, 10)}`,
    type: normalizeNotificationType(notification?.notificationType || notification?.notification_type || notification?.type),
    title: String(notification?.title || 'Arch9 Update').trim(),
    description: String(notification?.description || '').trim(),
    priority: normalizePriority(notification?.priority),
    status: normalizeStatus(notification?.status),
    createdAt,
    actionLabel: deriveActionLabel(notification),
    actionRoute: deriveActionRoute(notification),
    relatedEntityType: String(notification?.relatedEntityType || notification?.related_entity_type || '').trim(),
    relatedEntityId: String(notification?.relatedEntityId || notification?.related_entity_id || '').trim(),
    metadata: notification?.metadata && typeof notification.metadata === 'object' ? notification.metadata : {},
  }
}

export async function createClientPortalNotification(payload = {}) {
  const token = String(payload?.token || '').trim()
  if (!token) {
    throw new Error('Client portal token is required to create a notification.')
  }

  const notificationType = normalizeNotificationType(payload.notificationType || payload.type)
  const relatedEntityType = String(payload.relatedEntityType || payload.related_entity_type || '').trim()
  const relatedEntityId = String(payload.relatedEntityId || payload.related_entity_id || '').trim()
  const dedupeKey = String(payload.dedupeKey || '').trim() || buildDedupeKey({
    notificationType,
    relatedEntityType,
    relatedEntityId,
    fallback: payload?.title || payload?.actionRoute || '',
  })

  const created = await upsertClientPortalNotification({
    token,
    clientRole: normalizeClientRole(payload.clientRole || payload.client_role),
    transactionId: payload.transactionId || payload.transaction_id || null,
    clientPortalToken: token,
    notificationType,
    title: payload.title || 'Arch9 Update',
    description: payload.description || '',
    priority: normalizePriority(payload.priority),
    status: normalizeStatus(payload.status || 'unread'),
    relatedEntityType,
    relatedEntityId: relatedEntityId || null,
    actionLabel: payload.actionLabel || payload.action_label || deriveActionLabel(payload),
    actionRoute: payload.actionRoute || payload.action_route || deriveActionRoute(payload),
    visibility: payload.visibility || 'client_visible',
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    dedupeKey,
  })

  return created ? normalizeClientPortalNotification(created) : null
}

export async function getClientPortalNotifications(token, clientRole = 'buyer') {
  const response = await fetchClientPortalNotifications({ token, clientRole: normalizeClientRole(clientRole) })
  const items = Array.isArray(response?.notifications)
    ? response.notifications.map((item) => normalizeClientPortalNotification(item))
    : []

  return {
    unreadCount: Number(response?.unreadCount || items.filter((item) => item.status === 'unread').length),
    items,
  }
}

export async function markClientPortalNotificationRead(notificationId, options = {}) {
  if (!notificationId) return null
  const token = String(options?.token || '').trim()
  if (!token) {
    throw new Error('Client portal token is required.')
  }
  const updated = await markClientPortalNotificationReadById({ token, notificationId })
  return updated ? normalizeClientPortalNotification(updated) : null
}

export async function markAllClientPortalNotificationsRead(token, clientRole = 'buyer') {
  const normalizedToken = String(token || '').trim()
  if (!normalizedToken) {
    throw new Error('Client portal token is required.')
  }
  return markAllClientPortalNotificationsReadByToken({ token: normalizedToken, clientRole: normalizeClientRole(clientRole) })
}

export async function dismissClientPortalNotification(notificationId, options = {}) {
  if (!notificationId) return null
  const token = String(options?.token || '').trim()
  if (!token) {
    throw new Error('Client portal token is required.')
  }
  const updated = await dismissClientPortalNotificationById({ token, notificationId })
  return updated ? normalizeClientPortalNotification(updated) : null
}

export async function syncNotificationsFromNextActions(context = {}) {
  const token = String(context?.token || context?.portalContext?.token || '').trim()
  if (!token) return []

  const transactionId = context?.transactionId || context?.transaction?.id || null
  const clientRole = normalizeClientRole(context?.clientRole || context?.workspaceMode || context?.portalContext?.workspace)
  const nextActions = Array.isArray(context?.nextActions) ? context.nextActions : []
  const created = []

  for (const action of nextActions) {
    if (!action || action.notificationEligible === false) continue

    const notificationType = mapNextActionTypeToNotificationType(action.type)
    const relatedEntityType = action?.metadata?.requirementKey
      ? 'requirement'
      : action?.metadata?.requestId
        ? 'additional_request'
        : action?.type || 'next_action'
    const relatedEntityId = action?.metadata?.requestId || action?.metadata?.requirementKey || action?.id

    const notification = await createClientPortalNotification({
      token,
      transactionId,
      clientRole,
      notificationType,
      title: action.title || 'Action required',
      description: action.description || 'You have a new transaction action.',
      priority: action.priority,
      status: 'unread',
      relatedEntityType,
      relatedEntityId,
      actionLabel: action.actionLabel,
      actionRoute: action.actionRoute,
      visibility: action.visibility || 'client_visible',
      metadata: {
        ...(action.metadata || {}),
        source: 'next_actions',
        actionType: action.type || '',
        blocking: Boolean(action.blocking),
      },
      dedupeKey: buildDedupeKey({
        notificationType,
        relatedEntityType,
        relatedEntityId,
        fallback: action.type || action.title,
      }),
    })

    if (notification) created.push(notification)
  }

  return created
}

export async function syncNotificationsFromActivityFeed(context = {}) {
  const token = String(context?.token || context?.portalContext?.token || '').trim()
  if (!token) return []

  const transactionId = context?.transactionId || context?.transaction?.id || null
  const clientRole = normalizeClientRole(context?.clientRole || context?.workspaceMode || context?.portalContext?.workspace)
  const activityFeed = Array.isArray(context?.activityFeed) ? context.activityFeed : []
  const created = []

  for (const event of activityFeed) {
    if (!event) continue
    const visibility = normalizeValue(event?.visibility)
    if (visibility && visibility !== 'client_visible') continue
    if (!shouldCreateNotificationFromActivityEvent(event)) continue

    const notificationType = mapActivityTypeToNotificationType(event.type)
    const relatedEntityType = event?.relatedEntityType || event?.related_entity_type || event?.type || 'activity'
    const relatedEntityId = event?.relatedEntityId || event?.related_entity_id || event?.id

    const notification = await createClientPortalNotification({
      token,
      transactionId,
      clientRole,
      notificationType,
      title: event.title || 'Transaction updated',
      description: event.description || 'There is a new update in your transaction workspace.',
      priority: event?.requiresAttention ? 'high' : 'normal',
      status: 'unread',
      relatedEntityType,
      relatedEntityId,
      actionLabel: event?.metadata?.actionLabel,
      actionRoute: event?.metadata?.actionRoute,
      visibility: event?.visibility || 'client_visible',
      metadata: {
        ...(event?.metadata && typeof event.metadata === 'object' ? event.metadata : {}),
        source: 'activity_feed',
        activityType: event?.type || '',
      },
      dedupeKey: buildDedupeKey({
        notificationType,
        relatedEntityType,
        relatedEntityId,
        fallback: event?.type || event?.timestamp,
      }),
    })

    if (notification) created.push(notification)
  }

  return created
}
