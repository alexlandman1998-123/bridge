import {
  isMissingColumnError,
  isMissingTableError,
  isPermissionDeniedError,
  normalizeText,
} from './attorneyFirmServiceShared.js'

export const ATTORNEY_INCOMING_MATTER_NOTIFICATION_EVENTS = Object.freeze({
  primaryAttorneyAssigned: 'AttorneyIncomingMatterPrimaryAssigned',
})

function compactObject(payload = {}) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

function normalizeLaneLabel(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'bond' || normalized === 'bond_attorney') return 'Bond Attorney'
  if (normalized === 'cancellation' || normalized === 'cancellation_attorney') return 'Cancellation Attorney'
  return 'Transfer Attorney'
}

function getProfileName(profile = null, fallback = 'Assigned attorney') {
  if (!profile) return fallback
  const fullName = normalizeText(profile.full_name || profile.fullName)
  if (fullName) return fullName
  const parts = [profile.first_name || profile.firstName, profile.last_name || profile.lastName]
    .map(normalizeText)
    .filter(Boolean)
  return parts.join(' ') || normalizeText(profile.email) || fallback
}

async function getActorUserId(client, actorUserId = '') {
  const explicit = normalizeText(actorUserId)
  if (explicit) return explicit
  try {
    const result = await client.auth?.getUser?.()
    return normalizeText(result?.data?.user?.id)
  } catch {
    return ''
  }
}

async function fetchProfileById(client, userId = '') {
  const normalizedUserId = normalizeText(userId)
  if (!normalizedUserId) return null
  const result = await client
    .from('profiles')
    .select('id, full_name, first_name, last_name, email')
    .eq('id', normalizedUserId)
    .maybeSingle()

  if (result.error) {
    if (isMissingTableError(result.error, 'profiles') || isPermissionDeniedError(result.error)) return null
    throw result.error
  }
  return result.data || null
}

function eventTypeConstraintError(error) {
  if (!error) return false
  const code = normalizeText(error.code).toLowerCase()
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return code === '23514' || (text.includes('event_type') && (text.includes('constraint') || text.includes('violates')))
}

async function insertTransactionEvent(client, payload = {}) {
  let currentPayload = { ...payload }
  let result = await client
    .from('transaction_events')
    .insert(currentPayload)
    .select('id, transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope, created_at')
    .single()

  if (result.error && eventTypeConstraintError(result.error) && currentPayload.event_type !== 'TransactionUpdated') {
    currentPayload = {
      ...currentPayload,
      event_type: 'TransactionUpdated',
      event_data: {
        ...(currentPayload.event_data && typeof currentPayload.event_data === 'object' ? currentPayload.event_data : {}),
        originalEventType: currentPayload.event_type,
      },
    }
    result = await client
      .from('transaction_events')
      .insert(currentPayload)
      .select('id, transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope, created_at')
      .single()
  }

  while (
    result.error &&
    ['event_data', 'created_by_role', 'visibility_scope'].some((column) => isMissingColumnError(result.error, column))
  ) {
    const missingColumn = ['event_data', 'created_by_role', 'visibility_scope'].find((column) => isMissingColumnError(result.error, column))
    delete currentPayload[missingColumn]
    result = await client
      .from('transaction_events')
      .insert(currentPayload)
      .select('id, transaction_id, event_type, created_by, created_at')
      .single()
  }

  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_events') || isPermissionDeniedError(result.error)) return null
    throw result.error
  }
  return result.data || null
}

async function insertNotification(client, payload = {}) {
  if (!payload.user_id || !payload.dedupe_key) return null
  const existing = await client
    .from('transaction_notifications')
    .select('id, transaction_id, user_id, dedupe_key, created_at')
    .eq('user_id', payload.user_id)
    .eq('dedupe_key', payload.dedupe_key)
    .limit(1)
    .maybeSingle()

  if (existing.error) {
    if (
      isMissingTableError(existing.error, 'transaction_notifications') ||
      isMissingColumnError(existing.error, 'dedupe_key') ||
      isPermissionDeniedError(existing.error)
    ) {
      return null
    }
    throw existing.error
  }
  if (existing.data) return existing.data

  let currentPayload = { ...payload }
  let result = await client
    .from('transaction_notifications')
    .insert(currentPayload)
    .select('id, transaction_id, user_id, role_type, notification_type, title, message, dedupe_key, event_type, event_data, created_at')
    .single()

  while (
    result.error &&
    ['event_data', 'event_type', 'dedupe_key'].some((column) => isMissingColumnError(result.error, column))
  ) {
    const missingColumn = ['event_data', 'event_type', 'dedupe_key'].find((column) => isMissingColumnError(result.error, column))
    delete currentPayload[missingColumn]
    result = await client
      .from('transaction_notifications')
      .insert(currentPayload)
      .select('id, transaction_id, user_id, role_type, notification_type, title, message, created_at')
      .single()
  }

  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_notifications') || isPermissionDeniedError(result.error)) return null
    throw result.error
  }
  return result.data || null
}

export async function notifyAttorneyIncomingPrimaryAssignment({
  assignment = null,
  assignmentId = '',
  transactionId = '',
  attorneyUserId = '',
  laneKey = 'transfer',
  actorUserId = '',
  source = 'attorney_incoming_queue',
  client,
} = {}) {
  if (!client) throw new Error('Supabase client is required.')
  const resolvedAssignmentId = normalizeText(assignmentId || assignment?.id)
  const resolvedTransactionId = normalizeText(transactionId || assignment?.transactionId || assignment?.transaction_id)
  const resolvedAttorneyUserId = normalizeText(attorneyUserId || assignment?.attorneyUserId || assignment?.attorney_user_id)
  if (!resolvedAssignmentId || !resolvedTransactionId || !resolvedAttorneyUserId) {
    return { auditEvent: null, notification: null, assignee: null }
  }

  const resolvedLane = normalizeText(laneKey || assignment?.laneKey || assignment?.attorneyRole || assignment?.attorney_role || 'transfer')
  const laneLabel = normalizeLaneLabel(resolvedLane)
  const resolvedActorUserId = await getActorUserId(client, actorUserId)
  const assignee = await fetchProfileById(client, resolvedAttorneyUserId)
  const assigneeName = getProfileName(assignee)
  const eventType = ATTORNEY_INCOMING_MATTER_NOTIFICATION_EVENTS.primaryAttorneyAssigned
  const eventKey = `attorney_primary_assigned:${resolvedAssignmentId}:${resolvedAttorneyUserId}`
  const message = `${laneLabel} assigned to ${assigneeName}.`
  const eventData = {
    eventKey,
    source,
    assignmentId: resolvedAssignmentId,
    attorneyUserId: resolvedAttorneyUserId,
    attorneyName: assigneeName,
    attorneyEmail: normalizeText(assignee?.email),
    laneKey: resolvedLane,
    laneLabel,
  }

  const auditEvent = await insertTransactionEvent(client, compactObject({
    transaction_id: resolvedTransactionId,
    event_type: eventType,
    event_data: {
      ...eventData,
      message,
      visibility: 'internal',
    },
    created_by: resolvedActorUserId || null,
    created_by_role: 'attorney',
    visibility_scope: 'internal',
  }))

  const notification = await insertNotification(client, compactObject({
    transaction_id: resolvedTransactionId,
    user_id: resolvedAttorneyUserId,
    role_type: 'attorney',
    notification_type: 'attorney_incoming_primary_assigned',
    title: `${laneLabel} assigned`,
    message: `You have been assigned as primary ${laneLabel.toLowerCase()} for this incoming matter.`,
    is_read: false,
    read_at: null,
    dedupe_key: eventKey,
    event_type: eventType,
    event_data: eventData,
  }))

  return { auditEvent, notification, assignee }
}
