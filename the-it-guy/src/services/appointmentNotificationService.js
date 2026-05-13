import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { createClientPortalNotification } from './clientPortalNotificationsService'
import { getAppointmentTypeTemplate } from './appointmentTemplateService'

const APPOINTMENT_EVENT_TYPES = new Set([
  'appointment_scheduled',
  'appointment_updated',
  'appointment_confirmation_required',
  'appointment_confirmed',
  'appointment_declined',
  'appointment_reschedule_requested',
  'appointment_reschedule_proposed',
  'appointment_rescheduled',
  'appointment_cancelled',
  'appointment_completed',
  'appointment_reminder_due',
  'appointment_documents_required',
])

const EMAIL_SUPPORTED_EVENT_TYPES = new Set([
  'appointment_scheduled',
  'appointment_updated',
  'appointment_confirmation_required',
  'appointment_rescheduled',
  'appointment_cancelled',
  'appointment_reminder_due',
  'appointment_documents_required',
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function buildAppointmentActionUrl(path = '') {
  const fallbackOrigin = 'https://app.bridgenine.co.za'
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : fallbackOrigin
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

function isUuidLike(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function isMissingTableError(error, table = '') {
  const message = String(error?.message || error?.details || '').toLowerCase()
  return error?.code === '42P01' || (table ? message.includes(table.toLowerCase()) : false)
}

function isMissingColumnError(error, column = '') {
  const message = String(error?.message || error?.details || '').toLowerCase()
  return error?.code === '42703' || (column ? message.includes(column.toLowerCase()) : false)
}

function normalizeEventType(value = '') {
  const normalized = normalizeLower(value)
  if (APPOINTMENT_EVENT_TYPES.has(normalized)) return normalized
  return 'appointment_updated'
}

function normalizeVisibility(value = '') {
  const normalized = normalizeLower(value)
  if (['client_visible', 'shared_role_players', 'internal_only'].includes(normalized)) return normalized
  if (normalized === 'client') return 'client_visible'
  if (normalized === 'internal') return 'internal_only'
  if (normalized === 'shared') return 'shared_role_players'
  return 'shared_role_players'
}

function normalizeClientRole(value = '') {
  const normalized = normalizeLower(value)
  if (normalized.includes('sell')) return 'seller'
  return 'buyer'
}

function normalizeReminderStatus(value = '') {
  const normalized = normalizeLower(value)
  if (['pending', 'sent', 'failed', 'cancelled'].includes(normalized)) return normalized
  return 'pending'
}

function normalizeParticipantRole(value = '') {
  const normalized = normalizeLower(value)
  if (normalized.includes('bond')) return 'bond_originator'
  if (normalized.includes('attorney') || normalized.includes('conveyancer')) return 'attorney'
  if (normalized.includes('agent')) return 'agent'
  if (normalized.includes('develop')) return 'developer'
  if (normalized.includes('buyer') || normalized.includes('client')) return 'buyer'
  if (normalized.includes('seller')) return 'seller'
  return normalized || 'participant'
}

function titleCaseStatus(value = '') {
  const normalized = normalizeLower(value)
  if (!normalized) return 'Pending'
  return normalized
    .replaceAll('_', ' ')
    .split(' ')
    .filter(Boolean)
    .map((chunk) => `${chunk.slice(0, 1).toUpperCase()}${chunk.slice(1)}`)
    .join(' ')
}

function formatDate(appointment = {}) {
  const dateText = normalizeText(appointment?.appointment_date || appointment?.date || '')
  if (dateText) return dateText
  const dateTime = normalizeText(appointment?.date_time || appointment?.dateTime || '')
  if (!dateTime) return ''
  const parsed = new Date(dateTime)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function formatTime(appointment = {}) {
  const startTime = normalizeText(appointment?.start_time || appointment?.startTime || '')
  if (startTime) return startTime.slice(0, 5)
  const dateTime = normalizeText(appointment?.date_time || appointment?.dateTime || '')
  if (!dateTime) return ''
  const parsed = new Date(dateTime)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(11, 16)
}

function buildAppointmentDateTime(appointment = {}) {
  const explicit = normalizeText(appointment?.date_time || appointment?.dateTime)
  if (explicit) {
    const parsed = new Date(explicit)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  const dateText = normalizeText(appointment?.appointment_date || appointment?.date)
  const startText = normalizeText(appointment?.start_time || appointment?.startTime).slice(0, 5)
  if (!dateText || !startText) return null

  const parsed = new Date(`${dateText}T${startText}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function eventToEmailType(eventType = '') {
  const normalized = normalizeEventType(eventType)
  if (normalized === 'appointment_reschedule_requested' || normalized === 'appointment_reschedule_proposed' || normalized === 'appointment_rescheduled') {
    return 'appointment_rescheduled'
  }
  if (normalized === 'appointment_reminder_due') return 'appointment_reminder'
  if (normalized === 'appointment_documents_required') return 'appointment_documents_required'
  if (normalized === 'appointment_confirmation_required') return 'appointment_confirmation_required'
  if (normalized === 'appointment_cancelled') return 'appointment_cancelled'
  if (normalized === 'appointment_scheduled') return 'appointment_scheduled'
  return 'appointment_updated'
}

function eventToClientNotificationType(eventType = '') {
  const normalized = normalizeEventType(eventType)
  if (normalized === 'appointment_confirmation_required') return 'appointment_requested'
  if (normalized === 'appointment_cancelled') return 'appointment_cancelled'
  if (normalized === 'appointment_rescheduled' || normalized === 'appointment_reschedule_proposed') return 'appointment_rescheduled'
  if (normalized === 'appointment_reschedule_requested') return 'appointment_reschedule_requested'
  if (normalized === 'appointment_completed') return 'appointment_completed'
  if (normalized === 'appointment_documents_required') return 'document_requested'
  return 'appointment_requested'
}

function shouldNotifyRoleForVisibility(participantRole = '', visibility = 'shared_role_players') {
  const role = normalizeParticipantRole(participantRole)
  if (visibility === 'internal_only') {
    return !['buyer', 'seller'].includes(role)
  }
  if (visibility === 'shared_role_players') {
    return !['buyer', 'seller'].includes(role)
  }
  return true
}

function createDedupeKey({ appointmentId, eventType, recipientRole, recipientEmail = '', recipientId = '', scheduledFor = '' } = {}) {
  return [
    normalizeText(appointmentId),
    normalizeEventType(eventType),
    normalizeParticipantRole(recipientRole),
    normalizeText(recipientId),
    normalizeLower(recipientEmail),
    normalizeText(scheduledFor),
  ].join('::')
}

function resolveEventTitle(eventType = '') {
  const normalized = normalizeEventType(eventType)
  const titles = {
    appointment_scheduled: 'Appointment scheduled',
    appointment_updated: 'Appointment updated',
    appointment_confirmation_required: 'Appointment confirmation required',
    appointment_confirmed: 'Appointment confirmed',
    appointment_declined: 'Appointment declined',
    appointment_reschedule_requested: 'Appointment reschedule requested',
    appointment_reschedule_proposed: 'Appointment reschedule proposed',
    appointment_rescheduled: 'Appointment rescheduled',
    appointment_cancelled: 'Appointment cancelled',
    appointment_completed: 'Appointment completed',
    appointment_reminder_due: 'Appointment reminder',
    appointment_documents_required: 'Documents required before appointment',
  }
  return titles[normalized] || 'Appointment updated'
}

function resolveEventMessage(eventType = '', appointment = {}) {
  const title = normalizeText(appointment?.title || appointment?.appointment_type || 'appointment')
  const date = formatDate(appointment)
  const time = formatTime(appointment)
  const place = normalizeText(appointment?.location || 'TBC')

  if (normalizeEventType(eventType) === 'appointment_documents_required') {
    return `Please upload the required documents before ${title}${date ? ` on ${date}` : ''}${time ? ` at ${time}` : ''}.`
  }

  if (normalizeEventType(eventType) === 'appointment_cancelled') {
    return `${title} was cancelled${date ? ` (${date}${time ? ` ${time}` : ''})` : ''}.`
  }

  if (normalizeEventType(eventType) === 'appointment_reminder_due') {
    return `Reminder: ${title}${date ? ` on ${date}` : ''}${time ? ` at ${time}` : ''}${place ? ` (${place})` : ''}.`
  }

  return `${title}${date ? ` on ${date}` : ''}${time ? ` at ${time}` : ''}${place ? ` (${place})` : ''}.`
}

async function loadAppointmentContext(appointmentId) {
  const scopedAppointmentId = normalizeText(appointmentId)
  if (!scopedAppointmentId) {
    throw new Error('Appointment is required.')
  }

  let appointmentQuery = await supabase
    .from('appointments')
    .select('appointment_id, organisation_id, transaction_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, meeting_url, status, notes, visibility_scope, required_documents, linked_workflow_stage, linked_transaction_stage')
    .eq('appointment_id', scopedAppointmentId)
    .maybeSingle()

  if (
    appointmentQuery.error &&
    (isMissingColumnError(appointmentQuery.error, 'required_documents') || isMissingColumnError(appointmentQuery.error, 'meeting_url'))
  ) {
    appointmentQuery = await supabase
      .from('appointments')
      .select('appointment_id, organisation_id, transaction_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, status, notes, visibility_scope')
      .eq('appointment_id', scopedAppointmentId)
      .maybeSingle()
  }

  if (appointmentQuery.error) {
    throw appointmentQuery.error
  }

  const appointment = appointmentQuery.data
  if (!appointment) {
    throw new Error('Appointment could not be loaded.')
  }

  let participantsQuery = await supabase
    .from('appointment_participants')
    .select('participant_id, appointment_id, name, email, phone, participant_role, rsvp_status, rsvp_token')
    .eq('appointment_id', scopedAppointmentId)

  if (participantsQuery.error && isMissingColumnError(participantsQuery.error, 'rsvp_token')) {
    participantsQuery = await supabase
      .from('appointment_participants')
      .select('participant_id, appointment_id, name, email, phone, participant_role, rsvp_status')
      .eq('appointment_id', scopedAppointmentId)
  }

  if (participantsQuery.error && !isMissingTableError(participantsQuery.error, 'appointment_participants')) {
    throw participantsQuery.error
  }

  const participants = Array.isArray(participantsQuery.data)
    ? participantsQuery.data.map((row) => ({
      participantId: normalizeText(row?.participant_id) || null,
      name: normalizeText(row?.name) || 'Participant',
      email: normalizeLower(row?.email),
      phone: normalizeText(row?.phone),
      participantRole: normalizeText(row?.participant_role) || 'Participant',
      rsvpStatus: titleCaseStatus(row?.rsvp_status || 'pending'),
      rsvpToken: normalizeText(row?.rsvp_token) || '',
    }))
    : []

  return {
    appointment,
    participants,
  }
}

async function resolveClientPortalTokenForTransaction(transactionId) {
  const scopedTransactionId = normalizeText(transactionId)
  if (!scopedTransactionId) return ''

  const query = await supabase
    .from('client_portal_links')
    .select('token, is_active, created_at')
    .eq('transaction_id', scopedTransactionId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)

  if (query.error) {
    if (isMissingTableError(query.error, 'client_portal_links')) return ''
    throw query.error
  }

  return normalizeText(query.data?.[0]?.token)
}

async function sendAppointmentEmailToRecipient({ recipientEmail, eventType, appointment, participant = {}, metadata = {} }) {
  const to = normalizeLower(recipientEmail)
  if (!to) {
    return { sent: false, status: 'skipped', reason: 'missing_recipient_email' }
  }

  const emailType = eventToEmailType(eventType)
  if (!EMAIL_SUPPORTED_EVENT_TYPES.has(normalizeEventType(eventType))) {
    return { sent: false, status: 'skipped', reason: 'unsupported_event_type' }
  }

  const body = {
    type: emailType,
    to,
    appointmentId: normalizeText(appointment?.appointment_id || appointment?.appointmentId || ''),
    participantId: normalizeText(participant?.participantId || ''),
    rsvpToken: normalizeText(participant?.rsvpToken || ''),
    appointmentType: normalizeText(appointment?.appointment_type || appointment?.title || 'Appointment'),
    appointmentTitle: normalizeText(appointment?.title || ''),
    appointmentDate: formatDate(appointment),
    appointmentTime: formatTime(appointment),
    appointmentEndTime: normalizeText(appointment?.end_time || ''),
    location: normalizeText(appointment?.location || 'To be confirmed'),
    meetingUrl: normalizeText(appointment?.meeting_url || ''),
    status: titleCaseStatus(appointment?.status || 'pending'),
    recipientName: normalizeText(participant?.name || ''),
    participantRole: normalizeText(participant?.participantRole || ''),
    notes: normalizeText(metadata?.notes || appointment?.notes || ''),
    transactionId: normalizeText(appointment?.transaction_id || ''),
    actionLink: normalizeText(participant?.rsvpToken)
      ? buildAppointmentActionUrl(`/appointment-rsvp/${encodeURIComponent(participant.rsvpToken)}`)
      : '',
    acceptLink: normalizeText(participant?.rsvpToken)
      ? buildAppointmentActionUrl(`/appointment-rsvp/${encodeURIComponent(participant.rsvpToken)}?action=accept`)
      : '',
    declineLink: normalizeText(participant?.rsvpToken)
      ? buildAppointmentActionUrl(`/appointment-rsvp/${encodeURIComponent(participant.rsvpToken)}?action=decline`)
      : '',
    rescheduleLink: normalizeText(participant?.rsvpToken)
      ? buildAppointmentActionUrl(`/appointment-rsvp/${encodeURIComponent(participant.rsvpToken)}?action=reschedule`)
      : '',
    attachCalendarInvite: metadata?.attachCalendarInvite !== false,
  }

  const { data, error } = await supabase.functions.invoke('send-email', { body })
  if (error || data?.ok === false) {
    const reason = error?.message || data?.error || data?.message || 'unknown_send_error'
    return { sent: false, status: 'failed', reason }
  }

  if (participant?.participantId) {
    try {
      await supabase
        .from('appointment_participants')
        .update({
          invitation_sent_at: new Date().toISOString(),
          last_invitation_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('participant_id', participant.participantId)
    } catch {
      // Invite delivery should not fail because legacy participant metadata columns are unavailable.
    }
  }

  return { sent: true, status: 'sent', reason: '', response: data || null }
}

function buildReminderEntries({ appointment = {}, participants = [], includeDocsReminder = false }) {
  const appointmentStart = buildAppointmentDateTime(appointment)
  if (!appointmentStart) return []

  const template = getAppointmentTypeTemplate(appointment?.appointment_type || appointment?.appointmentType)
  const base = (Array.isArray(template?.reminderRules) && template.reminderRules.length
    ? template.reminderRules
    : [
        { reminderType: 'appointment_reminder_24h', offsetMinutes: 24 * 60 },
        { reminderType: 'appointment_reminder_2h', offsetMinutes: 2 * 60 },
        { reminderType: 'appointment_reminder_due', offsetMinutes: 0 },
      ])
    .map((rule) => ({
      reminderType: normalizeText(rule?.reminderType || rule?.reminder_type || 'appointment_reminder_due'),
      offsetMs: Math.max(0, Number(rule?.offsetMinutes ?? rule?.offset_minutes ?? 0) || 0) * 60 * 1000,
    }))

  if (includeDocsReminder && !base.some((entry) => normalizeText(entry?.reminderType) === 'appointment_documents_required')) {
    base.push({ reminderType: 'appointment_documents_required', offsetMs: 24 * 60 * 60 * 1000 })
  }

  const now = Date.now()
  const entries = []

  for (const participant of participants) {
    const role = normalizeParticipantRole(participant?.participantRole)
    for (const template of base) {
      const scheduledFor = new Date(appointmentStart.getTime() - template.offsetMs)
      if (Number.isNaN(scheduledFor.getTime())) continue
      if (scheduledFor.getTime() <= now) continue

      entries.push({
        appointmentId: normalizeText(appointment?.appointment_id || appointment?.appointmentId),
        recipientId: isUuidLike(participant?.participantId) ? participant.participantId : null,
        recipientRole: role,
        recipientEmail: normalizeLower(participant?.email),
        recipientPhone: normalizeText(participant?.phone) || null,
        reminderType: template.reminderType,
        scheduledFor: scheduledFor.toISOString(),
        status: 'pending',
        metadata: {
          appointmentType: normalizeText(appointment?.appointment_type || ''),
          appointmentTitle: normalizeText(appointment?.title || ''),
          appointmentDate: formatDate(appointment),
          appointmentTime: formatTime(appointment),
          location: normalizeText(appointment?.location || ''),
        },
      })
    }
  }

  return entries
}

function ensureReady() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Appointment notifications require a database connection.')
  }
}

export async function createAppointmentNotificationEvent(payload = {}) {
  ensureReady()

  const appointmentId = normalizeText(payload?.appointmentId)
  const eventType = normalizeEventType(payload?.eventType)
  const visibility = normalizeVisibility(payload?.visibility)
  const recipientRole = normalizeParticipantRole(payload?.recipientRole)
  const recipientId = isUuidLike(payload?.recipientId) ? payload.recipientId : null
  const recipientEmail = normalizeLower(payload?.recipientEmail)
  const transactionId = normalizeText(payload?.transactionId) || null
  const metadata = payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}
  const dedupeKey = normalizeText(payload?.dedupeKey) || createDedupeKey({
    appointmentId,
    eventType,
    recipientRole,
    recipientId,
    recipientEmail,
    scheduledFor: normalizeText(payload?.scheduledFor || ''),
  })

  if (!appointmentId) {
    throw new Error('Appointment is required to create a notification event.')
  }

  const title = normalizeText(payload?.title) || resolveEventTitle(eventType)
  const message = normalizeText(payload?.message)

  const existing = await supabase
    .from('appointment_notification_events')
    .select('id, appointment_id, transaction_id, event_type, recipient_id, recipient_role, recipient_email, visibility, title, message, email_status, in_app_status, metadata, dedupe_key, created_at, updated_at')
    .eq('dedupe_key', dedupeKey)
    .limit(1)
    .maybeSingle()

  if (existing.error) {
    if (!isMissingTableError(existing.error, 'appointment_notification_events')) {
      throw existing.error
    }
    return null
  }

  if (existing.data) {
    return existing.data
  }

  const insert = await supabase
    .from('appointment_notification_events')
    .insert({
      appointment_id: appointmentId,
      transaction_id: transactionId,
      event_type: eventType,
      recipient_id: recipientId,
      recipient_role: recipientRole,
      recipient_email: recipientEmail || null,
      visibility,
      title,
      message: message || null,
      email_status: normalizeReminderStatus(payload?.emailStatus || 'pending'),
      in_app_status: normalizeReminderStatus(payload?.inAppStatus || 'pending'),
      metadata,
      dedupe_key: dedupeKey,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id, appointment_id, transaction_id, event_type, recipient_id, recipient_role, recipient_email, visibility, title, message, email_status, in_app_status, metadata, dedupe_key, created_at, updated_at')
    .maybeSingle()

  if (insert.error) {
    if (isMissingTableError(insert.error, 'appointment_notification_events')) {
      return null
    }
    throw insert.error
  }

  return insert.data || null
}

export async function getAppointmentNotificationsForUser(userId) {
  ensureReady()
  const scopedUserId = normalizeText(userId)
  if (!isUuidLike(scopedUserId)) return []

  const query = await supabase
    .from('appointment_notification_events')
    .select('id, appointment_id, transaction_id, event_type, recipient_id, recipient_role, recipient_email, visibility, title, message, email_status, in_app_status, metadata, dedupe_key, created_at, updated_at')
    .eq('recipient_id', scopedUserId)
    .order('created_at', { ascending: false })

  if (query.error) {
    if (isMissingTableError(query.error, 'appointment_notification_events')) return []
    throw query.error
  }

  return Array.isArray(query.data) ? query.data : []
}

export async function notifyAppointmentParticipants(appointmentId, eventType, options = {}) {
  ensureReady()

  const normalizedEventType = normalizeEventType(eventType)
  const context = await loadAppointmentContext(appointmentId)
  const appointment = context.appointment
  const visibility = normalizeVisibility(options?.visibility || appointment?.visibility_scope)
  const message = normalizeText(options?.message) || resolveEventMessage(normalizedEventType, appointment)
  const title = normalizeText(options?.title) || resolveEventTitle(normalizedEventType)

  const participants = (context.participants || []).filter((participant) =>
    shouldNotifyRoleForVisibility(participant?.participantRole, visibility),
  )

  const results = []

  for (const participant of participants) {
    const role = normalizeParticipantRole(participant?.participantRole)
    const recipientEmail = normalizeLower(participant?.email)
    const dedupeFingerprint = [
      normalizeText(appointment?.appointment_date),
      normalizeText(appointment?.start_time),
      normalizeText(appointment?.status),
      normalizeText(options?.metadata?.reason),
      normalizeText(options?.metadata?.preferredStart),
      normalizeText(options?.metadata?.confirmedStart),
    ]
      .filter(Boolean)
      .join('|')
    const dedupeKey = createDedupeKey({
      appointmentId,
      eventType: normalizedEventType,
      recipientRole: role,
      recipientId: participant?.participantId,
      recipientEmail,
      scheduledFor: dedupeFingerprint,
    })

    const eventRow = await createAppointmentNotificationEvent({
      appointmentId,
      transactionId: appointment?.transaction_id,
      eventType: normalizedEventType,
      visibility,
      recipientId: participant?.participantId,
      recipientRole: role,
      recipientEmail,
      title,
      message,
      metadata: {
        ...(options?.metadata && typeof options.metadata === 'object' ? options.metadata : {}),
        appointmentType: normalizeText(appointment?.appointment_type),
        appointmentTitle: normalizeText(appointment?.title),
        appointmentDate: formatDate(appointment),
        appointmentTime: formatTime(appointment),
        location: normalizeText(appointment?.location),
      },
      dedupeKey,
    })

    let emailResult = { sent: false, status: 'skipped', reason: 'not_attempted' }
    if (EMAIL_SUPPORTED_EVENT_TYPES.has(normalizedEventType)) {
      emailResult = await sendAppointmentEmailToRecipient({
        recipientEmail,
        eventType: normalizedEventType,
        appointment,
        participant,
        metadata: options?.metadata || {},
      })

      if (!emailResult.sent && emailResult.status === 'failed') {
        console.warn('[appointment-notifications] email send failed', {
          appointmentId,
          eventType: normalizedEventType,
          recipientEmail,
          reason: emailResult.reason,
        })
      }
    }

    let inAppStatus = 'skipped'
    try {
      if (visibility === 'client_visible' && ['buyer', 'seller'].includes(role) && appointment?.transaction_id) {
        const portalToken = await resolveClientPortalTokenForTransaction(appointment.transaction_id)
        if (portalToken) {
          await createClientPortalNotification({
            token: portalToken,
            clientRole: normalizeClientRole(role),
            transactionId: appointment.transaction_id,
            notificationType: eventToClientNotificationType(normalizedEventType),
            title,
            description: message,
            priority:
              normalizedEventType === 'appointment_confirmation_required' || normalizedEventType === 'appointment_documents_required'
                ? 'high'
                : normalizedEventType === 'appointment_reminder_due'
                  ? 'normal'
                  : 'normal',
            status: 'unread',
            relatedEntityType: 'appointment',
            relatedEntityId: appointmentId,
            actionLabel:
              normalizedEventType === 'appointment_confirmation_required'
                ? 'Confirm Appointment'
                : normalizedEventType === 'appointment_documents_required'
                  ? 'Upload Documents'
                  : 'View Appointment',
            actionRoute: 'appointments',
            visibility: 'client_visible',
            metadata: {
              appointmentId,
              appointmentType: normalizeText(appointment?.appointment_type),
              eventType: normalizedEventType,
              ...(options?.metadata && typeof options.metadata === 'object' ? options.metadata : {}),
            },
            dedupeKey,
          })
          inAppStatus = 'sent'
        }
      }
    } catch (clientNotificationError) {
      inAppStatus = 'failed'
      console.warn('[appointment-notifications] client notification failed', {
        appointmentId,
        eventType: normalizedEventType,
        role,
        error: clientNotificationError,
      })
    }

    if (eventRow?.id) {
      const updatePayload = {
        email_status: normalizeReminderStatus(emailResult?.status || 'skipped'),
        in_app_status: normalizeReminderStatus(inAppStatus),
        updated_at: new Date().toISOString(),
      }
      await supabase
        .from('appointment_notification_events')
        .update(updatePayload)
        .eq('id', eventRow.id)
    }

    results.push({
      event: eventRow,
      participant,
      email: emailResult,
      inAppStatus,
    })
  }

  return results
}

export async function scheduleAppointmentReminders(appointmentId) {
  ensureReady()

  const context = await loadAppointmentContext(appointmentId)
  const appointment = context.appointment
  const visibility = normalizeVisibility(appointment?.visibility_scope)
  const requiredDocs = Array.isArray(appointment?.required_documents) ? appointment.required_documents : []
  const template = getAppointmentTypeTemplate(appointment?.appointment_type || appointment?.title)
  const hasTemplatePrep = Array.isArray(template?.requiredBeforeAppointment) && template.requiredBeforeAppointment.length > 0
  const participants = (context.participants || []).filter((participant) =>
    shouldNotifyRoleForVisibility(participant?.participantRole, visibility),
  )

  const rows = buildReminderEntries({
    appointment,
    participants,
    includeDocsReminder: requiredDocs.length > 0 || hasTemplatePrep,
  })

  if (!rows.length) {
    return []
  }

  const inserted = []

  for (const row of rows) {
    const dedupeScheduledFor = normalizeText(row.scheduledFor)
    let existingQuery = supabase
      .from('appointment_reminders')
      .select('id, appointment_id, recipient_id, recipient_role, recipient_email, recipient_phone, reminder_type, scheduled_for, status, sent_at, metadata, created_at, updated_at')
      .eq('appointment_id', row.appointmentId)
      .eq('recipient_role', row.recipientRole)
      .eq('reminder_type', row.reminderType)
      .eq('scheduled_for', dedupeScheduledFor)
      .limit(1)
    existingQuery = row.recipientEmail ? existingQuery.eq('recipient_email', row.recipientEmail) : existingQuery.is('recipient_email', null)
    const existing = await existingQuery.maybeSingle()

    if (existing.error) {
      if (isMissingTableError(existing.error, 'appointment_reminders')) {
        return []
      }
      if (!isMissingColumnError(existing.error, 'recipient_email')) {
        throw existing.error
      }
    }

    if (existing.data) {
      inserted.push(existing.data)
      continue
    }

    const create = await supabase
      .from('appointment_reminders')
      .insert({
        appointment_id: row.appointmentId,
        recipient_id: row.recipientId,
        recipient_role: row.recipientRole,
        recipient_email: row.recipientEmail || null,
        recipient_phone: row.recipientPhone || null,
        reminder_type: row.reminderType,
        scheduled_for: dedupeScheduledFor,
        status: 'pending',
        sent_at: null,
        metadata: row.metadata,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id, appointment_id, recipient_id, recipient_role, recipient_email, recipient_phone, reminder_type, scheduled_for, status, sent_at, metadata, created_at, updated_at')
      .maybeSingle()

    if (create.error) {
      if (isMissingTableError(create.error, 'appointment_reminders')) {
        return inserted
      }
      throw create.error
    }

    inserted.push(create.data)
  }

  return inserted.filter(Boolean)
}

export async function cancelAppointmentReminders(appointmentId) {
  ensureReady()
  const scopedAppointmentId = normalizeText(appointmentId)
  if (!scopedAppointmentId) return 0

  const update = await supabase
    .from('appointment_reminders')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('appointment_id', scopedAppointmentId)
    .eq('status', 'pending')
    .select('id')

  if (update.error) {
    if (isMissingTableError(update.error, 'appointment_reminders')) return 0
    throw update.error
  }

  return Array.isArray(update.data) ? update.data.length : 0
}

export async function markAppointmentReminderSent(reminderId) {
  ensureReady()
  const scopedReminderId = normalizeText(reminderId)
  if (!scopedReminderId) return null

  const now = new Date().toISOString()
  const update = await supabase
    .from('appointment_reminders')
    .update({
      status: 'sent',
      sent_at: now,
      updated_at: now,
    })
    .eq('id', scopedReminderId)
    .select('id, appointment_id, recipient_id, recipient_role, recipient_email, recipient_phone, reminder_type, scheduled_for, status, sent_at, metadata, created_at, updated_at')
    .maybeSingle()

  if (update.error) {
    if (isMissingTableError(update.error, 'appointment_reminders')) return null
    throw update.error
  }

  return update.data || null
}

export async function markAppointmentReminderFailed(reminderId, error) {
  ensureReady()
  const scopedReminderId = normalizeText(reminderId)
  if (!scopedReminderId) return null

  const now = new Date().toISOString()
  const failureMessage = normalizeText(error?.message || error || 'Unknown reminder send error')
  const update = await supabase
    .from('appointment_reminders')
    .update({
      status: 'failed',
      metadata: {
        error: failureMessage,
      },
      updated_at: now,
    })
    .eq('id', scopedReminderId)
    .select('id, appointment_id, recipient_id, recipient_role, recipient_email, recipient_phone, reminder_type, scheduled_for, status, sent_at, metadata, created_at, updated_at')
    .maybeSingle()

  if (update.error) {
    if (isMissingTableError(update.error, 'appointment_reminders')) return null
    throw update.error
  }

  return update.data || null
}
