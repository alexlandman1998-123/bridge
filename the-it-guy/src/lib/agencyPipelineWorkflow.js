// Existing async operations, loaded on demand by the service facade.
import {
  ACTIVITY_TYPES,
  __normalizeLabel as normalizeLabel,
  __normalizeText as normalizeText,
  __safeReadStore as safeReadStore,
  __normalizeLowerText as normalizeLowerText,
  __isUuidLike as isUuidLike,
  __assertLocalFallbackAllowed as assertLocalFallbackAllowed,
  __writeStore as writeStore,
  __emitAgencyCrmUpdated as emitAgencyCrmUpdated,
  __normalizeListValue as normalizeListValue,
  __resolveAgentSnapshot as resolveAgentSnapshot,
  __createUuid as createUuid,
  addLeadActivity,
  createAppointment,
  __toNullableUuid as toNullableUuid,
  __normalizeAppointmentRecord as normalizeAppointmentRecord,
  __normalizeAppointmentType as normalizeAppointmentType,
  __normalizeExternalCalendarStatus as normalizeExternalCalendarStatus,
  __normalizeAppointmentLocationType as normalizeAppointmentLocationType,
  __normalizeAppointmentStatus as normalizeAppointmentStatus,
  __assertAppointmentWrite as assertAppointmentWrite,
  __deriveDateTime as deriveDateTime,
  __DEFAULT_APPOINTMENT_BUSINESS_HOURS as DEFAULT_APPOINTMENT_BUSINESS_HOURS,
  __normalizeParticipantRecord as normalizeParticipantRecord,
  __mapLegacyRsvpStatus as mapLegacyRsvpStatus,
  __buildSchedulingConflictErrorMessage as buildSchedulingConflictErrorMessage,
  updateAppointment,
  __prepareAppointmentUpdate as prepareAppointmentUpdate,
  __CLOSED_APPOINTMENT_STATUSES as CLOSED_APPOINTMENT_STATUSES,
  updateAppointmentParticipantRsvp,
  addAppointmentOutcome,
  listAppointments,
  __applyAppointmentScope as applyAppointmentScope,
  buildAppointmentsDashboardSummary,
} from './agencyPipelineModel.js'







import {
  isSupabaseConfigured,
  supabase,
} from './supabaseClient'



import {
  createTransactionFromLeadOverride,
} from './transactionLifecycleService'

import {
  MOCK_DATA_ENABLED,
} from './mockData'

import {
  isUnsafeFallbackAllowed,
} from './envValidation'

import {
  WorkspaceContextError,
} from '../services/workspaceResolutionService'

import {
  getAppointmentCompletionBehavior,
  getAppointmentTypeDefinition,
  getAppointmentTypeLabel,
  getAppointmentVisibilityDefault,
} from './appointmentTypeDefinitions'



import {
  checkAppointmentConflicts,
  getParticipantAvailability,
} from './appointmentAvailabilityEngine'

import {
  notifyAppointmentParticipants,
} from '../services/appointmentNotificationService'

import {
  applyBuyerLifecycleEvent,
  BUYER_LIFECYCLE_EVENTS,
  isBuyerLifecycleAppointment,
} from './buyerLifecycleService'

const APPOINTMENTS_DEMO_FALLBACK_REASON = {
  UNSCOPED_ORG: 'unscoped_organisation',
  SUPABASE_NOT_CONFIGURED: 'supabase_not_configured',
}

function normalizeTimeText(value) {
  const text = normalizeText(value)
  if (!text) return null
  return text.slice(0, 8)
}

function isMissingColumnError(error, columnName = '') {
  const message = String(error?.message || error?.details || '')
  const code = normalizeText(error?.code).toUpperCase()
  const normalizedColumn = normalizeText(columnName).toLowerCase()
  if (normalizedColumn && message.toLowerCase().includes(normalizedColumn)) {
    return true
  }
  return code === '42703' || code === 'PGRST204' || /column .* does not exist/i.test(message) || message.toLowerCase().includes('schema cache')
}

function resolveAppointmentsDemoFallbackReason(organisationId) {
  if (!MOCK_DATA_ENABLED) {
    return null
  }
  const scopedOrganisationId = normalizeText(organisationId)
  if (!isUuidLike(scopedOrganisationId)) {
    return APPOINTMENTS_DEMO_FALLBACK_REASON.UNSCOPED_ORG
  }
  if (!isSupabaseConfigured || !supabase) {
    return APPOINTMENTS_DEMO_FALLBACK_REASON.SUPABASE_NOT_CONFIGURED
  }
  return null
}

const APPOINTMENT_NOTIFICATION_TIMEOUT_RESULT = '__appointment_notification_still_running__'

const APPOINTMENT_PARTICIPANT_FETCH_BATCH_SIZE = 100

function serializeAppointmentNotificationError(error = {}) {
  return {
    message: normalizeText(error?.message || error?.error || 'Unknown appointment notification error'),
    code: normalizeText(error?.code || ''),
    details: error?.details ?? null,
    hint: error?.hint ?? null,
    status: error?.status ?? null,
  }
}

function summarizeAppointmentNotificationError(error = {}) {
  const summary = serializeAppointmentNotificationError(error)
  return [
    summary.message,
    summary.code ? `code=${summary.code}` : '',
    summary.status ? `status=${summary.status}` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

async function runAppointmentNotificationTask(taskName, callback, options = {}) {
  const softTimeoutMs = Math.max(0, Number(options?.softTimeoutMs || 0) || 0)
  let timeoutId = null
  try {
    const taskPromise = Promise.resolve().then(callback)
    if (!softTimeoutMs) {
      return await taskPromise
    }
    const timerApi = typeof window !== 'undefined' ? window : globalThis
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = timerApi.setTimeout(() => resolve(APPOINTMENT_NOTIFICATION_TIMEOUT_RESULT), softTimeoutMs)
    })
    const result = await Promise.race([taskPromise, timeoutPromise])
    if (result !== APPOINTMENT_NOTIFICATION_TIMEOUT_RESULT) {
      return result
    }
    console.warn(`[appointments][notifications] ${taskName} still running after ${softTimeoutMs}ms`, {
      taskName,
      softTimeoutMs,
    })
    taskPromise
      .then(() => {
        console.info(`[appointments][notifications] ${taskName} completed after returning control to the UI`, {
          taskName,
          softTimeoutMs,
        })
      })
      .catch((error) => {
        console.warn(
          `[appointments][notifications] ${taskName} failed after returning control to the UI: ${summarizeAppointmentNotificationError(error)}`,
          serializeAppointmentNotificationError(error),
        )
      })
    return { timedOut: true, notificationsQueued: true }
  } catch (error) {
    console.warn(
      `[appointments][notifications] ${taskName} failed: ${summarizeAppointmentNotificationError(error)}`,
      serializeAppointmentNotificationError(error),
    )
    return null
  } finally {
    if (timeoutId) {
      const timerApi = typeof window !== 'undefined' ? window : globalThis
      timerApi.clearTimeout(timeoutId)
    }
  }
}

function mapDbAppointmentRow(row = {}, organisationId = '') {
  return normalizeAppointmentRecord(
    {
      appointmentId: row?.appointment_id,
      organisationId: row?.organisation_id || organisationId,
      assignedAgentId: row?.agent_id,
      schedulingOwnerUserId: row?.scheduling_owner_user_id,
      appointmentType: row?.appointment_type,
      customTypeLabel: row?.custom_type_label,
      title: row?.title,
      date: row?.appointment_date,
      startTime: normalizeTimeText(row?.start_time),
      endTime: normalizeTimeText(row?.end_time),
      dateTime: row?.date_time,
      endDateTime: row?.end_date_time,
      calendarRevision: row?.calendar_revision,
      archivedAt: row?.archived_at, archivedBy: row?.archived_by, archiveReason: row?.archive_reason,
      reservationManaged: row?.reservation_managed,
      attorneyDeliveryEnabled: row?.attorney_delivery_enabled,
      listingViewingRoundNumber: row?.listing_viewing_round_number,
      requestIssuedAt: row?.request_issued_at,
      holdExpiresAt: row?.hold_expires_at,
      hasConfirmedReservation: row?.has_confirmed_reservation,
      locationType: normalizeAppointmentLocationType(row?.location_type),
      location: row?.location,
      meetingUrl: row?.meeting_url,
      timezone: row?.timezone,
      allDay: row?.all_day,
      leadId: row?.lead_id,
      contactId: row?.contact_id,
      listingId: row?.listing_id,
      transactionId: row?.transaction_id,
      relatedEntityType: row?.related_entity_type,
      relatedEntityId: row?.related_entity_id,
      linkedWorkflow: row?.linked_workflow,
      linkedWorkflowStage: row?.linked_workflow_stage,
      linkedTaskId: row?.linked_task_id,
      linkedTransactionStage: row?.linked_transaction_stage,
      workflowCompletionEffect: row?.workflow_completion_effect,
      visibility: row?.visibility_scope,
      completionBehavior: row?.completion_behavior,
      instructions: row?.appointment_instructions,
      requiredDocuments: row?.required_documents,
      reminderRules: row?.reminder_rules,
      sendInviteEmails: row?.invitations_enabled,
      remindersEnabled: row?.reminders_enabled,
      attachCalendarInvite: row?.attach_calendar_invite,
      calendarDeliveryManaged: row?.calendar_delivery_managed,
      emailTheme: row?.email_theme,
      emailTemplateKey: row?.email_template_key,
      calendarEventUid: row?.calendar_event_uid || null,
      icsGeneratedAt: row?.ics_generated_at || null,
      externalCalendarStatus: row?.external_calendar_status || 'not_synced',
      externalCalendarProvider: row?.external_calendar_provider || null,
      externalCalendarEventId: row?.external_calendar_event_id || null,
      resourceId: row?.resource_id,
      allowOutsideBusinessHours: row?.allow_outside_business_hours === true,
      schedulingOverrideReason: row?.scheduling_override_reason,
      status: row?.status,
      notes: row?.notes,
      outcomeSummary: row?.outcome_summary,
      clientFeedback: row?.client_feedback,
      agentNotes: row?.agent_notes,
      nextStep: row?.next_step,
      followUpDate: row?.follow_up_date,
      offerInviteId: row?.offer_invite_id,
      createdBy: row?.created_by,
      createdAt: row?.created_at,
      updatedAt: row?.updated_at,
      completedAt: row?.completed_at,
      cancelledAt: row?.cancelled_at,
      cancelledBy: row?.cancelled_by,
      cancellationReason: row?.cancellation_reason,
    },
    { organisationId },
  )
}

function mapDbParticipantRow(row = {}) {
  return normalizeParticipantRecord(
    {
      participantId: row?.participant_id,
      appointmentId: row?.appointment_id,
      organisationId: row?.organisation_id,
      userId: row?.user_id,
      contactId: row?.contact_id,
      name: row?.name,
      email: row?.email,
      phone: row?.phone,
      participantRole: row?.participant_role,
      isRequired: row?.is_required,
      rsvpStatus: row?.rsvp_status,
      proposedNewTime: row?.proposed_new_time,
      rsvpComment: row?.rsvp_comment,
      rsvpToken: row?.rsvp_token,
      invitationSentAt: row?.invitation_sent_at,
      lastInvitationSentAt: row?.last_invitation_sent_at,
      respondedAt: row?.responded_at,
      rsvpRevokedAt: row?.rsvp_revoked_at,
      proposalId: row?.proposal_id,
      proposalResponse: row?.proposal_response,
      createdAt: row?.created_at,
      updatedAt: row?.updated_at,
    },
    {
      appointmentId: row?.appointment_id,
      organisationId: row?.organisation_id,
    },
  )
}

function mapAppointmentToDbInsert(appointment = {}, organisationId = '') {
  const normalized = normalizeAppointmentRecord(appointment, { organisationId })
  return {
    organisation_id: normalizeText(normalized.organisationId || organisationId),
    lead_id: toNullableUuid(normalized.leadId),
    agent_id: toNullableUuid(normalized.assignedAgentId),
    appointment_type: normalizeAppointmentType(normalized.appointmentType),
    custom_type_label: normalizeText(normalized.customTypeLabel) || null,
    title: normalizeText(normalized.title) || getAppointmentTypeLabel(normalized.appointmentType),
    appointment_date: normalized.date || null,
    start_time: normalizeTimeText(normalized.startTime),
    end_time: normalizeTimeText(normalized.endTime),
    date_time: normalized.dateTime || deriveDateTime({ date: normalized.date, startTime: normalized.startTime, timezone: normalized.timezone }),
    end_date_time: normalized.endDateTime || null,
    location_type: normalizeAppointmentLocationType(normalized.locationType),
    location: normalizeText(normalized.location) || null,
    meeting_url: normalizeText(normalized.meetingUrl) || null,
    timezone: normalizeText(normalized.timezone) || DEFAULT_APPOINTMENT_BUSINESS_HOURS.timezone,
    all_day: normalized.allDay === true,
    contact_id: toNullableUuid(normalized.contactId),
    listing_id: normalizeText(normalized.listingId) || null,
    transaction_id: toNullableUuid(normalized.transactionId),
    related_entity_type: normalizeText(normalized.relatedEntityType) || null,
    related_entity_id: toNullableUuid(normalized.relatedEntityId),
    linked_workflow: normalizeText(normalized.linkedWorkflow) || null,
    linked_workflow_stage: normalizeText(normalized.linkedWorkflowStage) || null,
    linked_task_id: toNullableUuid(normalized.linkedTaskId),
    linked_transaction_stage: normalizeText(normalized.linkedTransactionStage) || null,
    workflow_completion_effect:
      normalized.workflowCompletionEffect && typeof normalized.workflowCompletionEffect === 'object'
        ? normalized.workflowCompletionEffect
        : {},
    visibility_scope: normalizeText(normalized.visibility) || getAppointmentVisibilityDefault(normalized.appointmentType),
    completion_behavior: normalizeText(normalized.completionBehavior) || getAppointmentCompletionBehavior(normalized.appointmentType),
    appointment_instructions: normalizeText(normalized.instructions) || null,
    required_documents: Array.isArray(normalized.requiredDocuments) ? normalized.requiredDocuments : [],
    reminder_rules: normalized.reminderRules,
    invitations_enabled: normalized.sendInviteEmails,
    reminders_enabled: normalized.remindersEnabled,
    attach_calendar_invite: normalized.attachCalendarInvite,
    email_theme: normalized.emailTheme,
    email_template_key: normalized.emailTemplateKey,
    calendar_event_uid: normalizeText(normalized.calendarEventUid) || null,
    ics_generated_at: normalized.icsGeneratedAt || null,
    external_calendar_status: normalizeExternalCalendarStatus(normalized.externalCalendarStatus || 'not_synced'),
    external_calendar_provider: normalizeText(normalized.externalCalendarProvider) || null,
    external_calendar_event_id: normalizeText(normalized.externalCalendarEventId) || null,
    resource_id: toNullableUuid(normalized.resourceId),
    allow_outside_business_hours: normalized.allowOutsideBusinessHours === true,
    scheduling_override_reason: normalizeText(normalized.schedulingOverrideReason) || null,
    status: normalizeAppointmentStatus(normalized.status),
    notes: normalizeText(normalized.notes) || null,
    outcome_summary: normalizeText(normalized.outcomeSummary) || null,
    client_feedback: normalizeText(normalized.clientFeedback) || null,
    agent_notes: normalizeText(normalized.agentNotes) || null,
    next_step: normalizeText(normalized.nextStep) || null,
    follow_up_date: normalizeText(normalized.followUpDate) || null,
    offer_invite_id: toNullableUuid(normalized.offerInviteId),
    created_by: toNullableUuid(normalized.createdBy),
    completed_at: normalized.status === 'completed' ? normalized.completedAt || new Date().toISOString() : normalized.completedAt || null,
    cancelled_at: normalizeText(normalized.status).toLowerCase().includes('cancel') ? normalized.cancelledAt || new Date().toISOString() : normalized.cancelledAt || null,
    cancelled_by: toNullableUuid(normalized.cancelledBy),
    cancellation_reason: normalizeText(normalized.cancellationReason) || null,
  }
}

function mapParticipantToDbInsert(participant = {}, { appointmentId = '', organisationId = '' } = {}) {
  const normalized = normalizeParticipantRecord(participant, { appointmentId, organisationId })
  return {
    participant_id: toNullableUuid(normalized.participantId),
    appointment_id: normalizeText(normalized.appointmentId || appointmentId),
    organisation_id: normalizeText(normalized.organisationId || organisationId),
    user_id: toNullableUuid(normalized.userId),
    contact_id: toNullableUuid(normalized.contactId),
    name: normalizeText(normalized.name) || 'Participant',
    email: normalizeText(normalized.email) || null,
    phone: normalizeText(normalized.phone) || null,
    participant_role: normalizeLabel(normalized.participantRole, 'Other Contact'),
    is_required: normalized.isRequired !== false,
    rsvp_status: mapLegacyRsvpStatus(normalized.rsvpStatus),
    proposed_new_time: normalized.proposedNewTime || null,
    rsvp_comment: normalizeText(normalized.rsvpComment) || null,
    rsvp_token: normalizeText(normalized.rsvpToken) || createUuid(),
    invitation_sent_at: normalized.invitationSentAt || null,
    last_invitation_sent_at: normalized.lastInvitationSentAt || null,
    responded_at: normalized.respondedAt || null,
  }
}

async function listAppointmentsFromSupabase(organisationId, { includeAll = false, agentId = '', agentEmail = '', agentKeys = [], listingId = '', leadId = '', from = null, to = null, signal } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedListingId = normalizeText(listingId)
  const read = (query) => signal ? query.abortSignal(signal) : query
  const selectModern =
    'appointment_id, organisation_id, lead_id, agent_id, archived_at, archived_by, archive_reason, calendar_delivery_managed, invitations_enabled, reminders_enabled, reminder_rules, attach_calendar_invite, email_theme, email_template_key, calendar_revision, request_issued_at, hold_expires_at, has_confirmed_reservation, scheduling_owner_user_id, appointment_type, custom_type_label, title, appointment_date, start_time, end_time, date_time, end_date_time, timezone, all_day, location_type, location, meeting_url, contact_id, listing_id, transaction_id, related_entity_type, related_entity_id, linked_workflow, linked_workflow_stage, linked_task_id, linked_transaction_stage, workflow_completion_effect, visibility_scope, completion_behavior, appointment_instructions, required_documents, calendar_event_uid, ics_generated_at, external_calendar_status, external_calendar_provider, external_calendar_event_id, resource_id, allow_outside_business_hours, scheduling_override_reason, status, notes, outcome_summary, client_feedback, agent_notes, next_step, follow_up_date, offer_invite_id, created_by, created_at, updated_at, completed_at, cancelled_at, cancelled_by, cancellation_reason'
  const selectLegacy =
    'appointment_id, organisation_id, lead_id, agent_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, contact_id, listing_id, transaction_id, status, notes, outcome_summary, client_feedback, agent_notes, next_step, follow_up_date, created_by, created_at, updated_at, completed_at'
  const selectMinimal =
    'appointment_id, organisation_id, lead_id, agent_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, contact_id, listing_id, transaction_id, status, notes, created_by, created_at, updated_at'

  const buildQuery = (select) => {
    let query = supabase
      .from('appointments')
      .select(select)
      .eq('organisation_id', scopedOrganisationId)
      .order('date_time', { ascending: true })
    if (scopedListingId) {
      query = query.eq('listing_id', scopedListingId)
    }
    if (from) {
      query = query.gte('date_time', from)
    }
    if (to) {
      query = query.lt('date_time', to)
    }
    return query
  }

  let appointmentRows = []
  let appointmentError = null
  const rpcResult = await read(supabase.rpc(leadId ? 'bridge_list_lead_appointments' : 'bridge_list_calendar_appointments_with_times', {
    p_organisation_id: scopedOrganisationId,
    p_include_all: includeAll === true,
    ...(leadId ? { p_lead_id: normalizeText(leadId) } : {
      p_listing_id: scopedListingId || null,
      p_from: from || null,
      p_to: to || null,
    }),
  }))
  if (leadId && rpcResult.error) throw rpcResult.error
  if (!rpcResult.error) {
    if (!Array.isArray(rpcResult.data)) throw new Error('Appointment data could not be verified. Please retry.')
    appointmentRows = rpcResult.data
  } else {
    if (!['PGRST202', '42883'].includes(normalizeText(rpcResult.error?.code))) {
      throw rpcResult.error
    }
    for (const select of [selectModern, selectLegacy, selectMinimal]) {
      const result = await read(buildQuery(select))
      if (!result.error) {
        if (!Array.isArray(result.data)) throw new Error('Appointment data could not be verified. Please retry.')
        appointmentRows = result.data
        appointmentError = null
        break
      }
      appointmentError = result.error
      if (!isMissingColumnError(result.error)) {
        break
      }
    }
  }
  if (appointmentError) throw appointmentError

  const appointmentIds = appointmentRows
    .map((row) => normalizeText(row?.appointment_id))
    .filter(Boolean)
  const participantMap = new Map()

  if (appointmentIds.length) {
    const participantRows = []
    let participantError = null
    for (let index = 0; index < appointmentIds.length; index += APPOINTMENT_PARTICIPANT_FETCH_BATCH_SIZE) {
      const appointmentIdBatch = appointmentIds.slice(index, index + APPOINTMENT_PARTICIPANT_FETCH_BATCH_SIZE)
      let participantResult = await read(supabase
        .from('appointment_participants')
        .select(
          'participant_id, appointment_id, organisation_id, user_id, contact_id, name, email, phone, participant_role, is_required, rsvp_status, proposed_new_time, rsvp_comment, rsvp_token, invitation_sent_at, last_invitation_sent_at, responded_at, rsvp_revoked_at, proposal_id, proposal_response, created_at, updated_at',
        )
        .eq('organisation_id', scopedOrganisationId)
        .in('appointment_id', appointmentIdBatch))
      if (participantResult.error && isMissingColumnError(participantResult.error)) {
        participantResult = await read(supabase
          .from('appointment_participants')
          .select(
            'participant_id, appointment_id, organisation_id, name, email, phone, participant_role, rsvp_status, proposed_new_time, responded_at, created_at, updated_at',
          )
          .eq('organisation_id', scopedOrganisationId)
          .in('appointment_id', appointmentIdBatch))
      }
      if (participantResult.error) {
        participantError = participantResult.error
        break
      }
      if (!Array.isArray(participantResult.data)) throw new Error('Appointment attendance could not be verified. Please retry.')
      participantRows.push(...participantResult.data)
    }

    if (participantError) {
      throw participantError
    }
    for (const row of participantRows) {
      const mapped = mapDbParticipantRow(row)
      const key = normalizeText(mapped?.appointmentId)
      if (!participantMap.has(key)) {
        participantMap.set(key, [])
      }
      participantMap.get(key).push(mapped)
    }
  }

  const rows = appointmentRows.map((row) => {
    const mapped = mapDbAppointmentRow(row, scopedOrganisationId)
    return {
      ...mapped,
      participants: (participantMap.get(normalizeText(mapped?.appointmentId)) || []).filter(person => !person.rsvpRevokedAt || CLOSED_APPOINTMENT_STATUSES.has(mapped.status)),
    }
  })

  // The lead reader has already applied the canonical calendar access rules.
  // A lead owner can see bookings assigned to another agent.
  return applyAppointmentScope(rows, { includeAll: leadId ? true : includeAll, agentId, agentEmail, agentKeys, listingId: scopedListingId, from: leadId ? null : from, to: leadId ? null : to })
}

async function saveAppointmentCommand({ organisationId, appointmentId, appointment, participants, creating = false, expectedRevision = null, commandId, action = 'save', viewingMode = null, confirmationNote = null }) {
  const result = await supabase.rpc('save_calendar_appointment_with_delivery', {
    p_organisation_id: organisationId, p_appointment_id: appointmentId,
    p_payload: mapAppointmentToDbInsert(appointment, organisationId),
    p_participants: participants === null ? null : participants.map(participant => {
      const row = mapParticipantToDbInsert(participant, { appointmentId, organisationId })
      // Creation includes temporary form IDs; only the server assigns attendance
      // IDs. Null stays stable across a lost-response retry.
      row.participant_id = creating ? null : toNullableUuid(participant?.participantId)
      return Object.fromEntries(['participant_id', 'user_id', 'contact_id', 'name', 'email', 'phone', 'participant_role', 'is_required'].map(key => [key, row[key]]))
    }),
    p_expected_revision: expectedRevision, p_command_id: commandId || createUuid(), p_action: action,
    p_viewing_mode: viewingMode, p_confirmation_note: confirmationNote,
  })
  if (result.error) throw result.error
  const receipt = result.data
  if (receipt?.verified !== true || !receipt.appointment || !Array.isArray(receipt.participants)
    || receipt.appointment.appointment_id !== appointmentId || receipt.appointment.organisation_id !== organisationId
    || !Number.isInteger(receipt.appointment.calendar_revision)
    || receipt.participants.some(person => !isUuidLike(person?.participant_id) || person.appointment_id !== appointmentId || person.organisation_id !== organisationId)
    || new Set(receipt.participants.map(person => person?.participant_id)).size !== receipt.participants.length
    || (participants !== null && !CLOSED_APPOINTMENT_STATUSES.has(receipt.appointment.status) && receipt.participants.length !== participants.length)) {
    throw new Error('The appointment save could not be verified. Refresh before retrying.')
  }
  if (receipt.appointment.calendar_delivery_managed && (receipt.delivery?.verified !== true || receipt.delivery.revision !== receipt.appointment.calendar_revision
    || !Array.isArray(receipt.delivery.jobs) || receipt.delivery.jobs.some(job => job.appointment_id !== appointmentId || job.revision !== receipt.appointment.calendar_revision))) {
    throw new Error('The appointment delivery queue could not be verified. Refresh before retrying.')
  }
  return { ...mapDbAppointmentRow(receipt.appointment, organisationId), participants: receipt.participants.map(mapDbParticipantRow),
    delivery: receipt.delivery || null, mutationReplayed: receipt.replayed === true }
}

function normalizeAppointmentResourceRow(row = {}) {
  return {
    resourceId: normalizeText(row?.id),
    organisationId: normalizeText(row?.organisation_id),
    resourceName: normalizeText(row?.resource_name) || 'Resource',
    resourceType: normalizeText(row?.resource_type) || 'meeting_room',
    isActive: row?.is_active !== false,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

async function listAppointmentResourcesFromSupabase(organisationId, { includeInactive = false, signal } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  let query = supabase
    .from('appointment_resources')
    .select('id, organisation_id, resource_name, resource_type, is_active, created_at, updated_at')
    .eq('organisation_id', scopedOrganisationId)
    .order('resource_name', { ascending: true })

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error) {
    if (error?.code === '42P01' || error?.code === 'PGRST205') {
      return []
    }
    throw error
  }

  return (Array.isArray(data) ? data : []).map((row) => normalizeAppointmentResourceRow(row))
}

export async function listAppointmentResourcesAsync(organisationId, { includeInactive = false, signal } = {}) {
  const fallbackReason = resolveAppointmentsDemoFallbackReason(organisationId)
  if (fallbackReason) {
    if (isUnsafeFallbackAllowed()) return []
    throw new WorkspaceContextError('invalid_service_workspace_context', {
      service: 'agencyPipelineService.listAppointmentResourcesAsync',
      workspaceId: normalizeText(organisationId) || null,
      attemptedFallbackType: fallbackReason,
    })
  }
  const scopedOrganisationId = normalizeText(organisationId)
  if (!isUuidLike(scopedOrganisationId)) {
    throw new WorkspaceContextError('invalid_service_workspace_context', {
      service: 'agencyPipelineService.listAppointmentResourcesAsync',
      workspaceId: scopedOrganisationId || null,
    })
  }
  if (!isSupabaseConfigured || !supabase) throw new Error('Appointment resources require the database connection.')
  return listAppointmentResourcesFromSupabase(scopedOrganisationId, { includeInactive, signal })
}

function getSchedulingRangeForAppointment(appointment = {}) {
  const startDate = appointment?.dateTime ? new Date(appointment.dateTime) : deriveDateTime({
    date: appointment?.date,
    startTime: appointment?.startTime,
    timezone: appointment?.timezone,
  })
  const parsedStart = startDate instanceof Date ? startDate : (startDate ? new Date(startDate) : null)
  const safeStart = parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : null
  if (!safeStart) {
    return { from: null, to: null }
  }
  const from = new Date(safeStart.getTime() - (24 * 60 * 60 * 1000)).toISOString()
  const to = new Date(safeStart.getTime() + (14 * 24 * 60 * 60 * 1000)).toISOString()
  return { from, to }
}

export async function checkAppointmentSchedulingIntegrityAsync(
  organisationId,
  appointmentPayload = {},
  options = {},
) {
  const fallbackReason = resolveAppointmentsDemoFallbackReason(organisationId)
  if (fallbackReason) {
    if (!isUnsafeFallbackAllowed()) {
      throw new WorkspaceContextError('invalid_service_workspace_context', {
        service: 'agencyPipelineService.checkAppointmentSchedulingIntegrityAsync',
        workspaceId: normalizeText(organisationId) || null,
        attemptedFallbackType: fallbackReason,
      })
    }
    return {
      hardConflicts: [],
      softConflicts: [],
      hasHardConflicts: false,
      hasSoftConflicts: false,
      participantAvailability: [],
      suggestedSlots: [],
      businessHours: DEFAULT_APPOINTMENT_BUSINESS_HOURS,
      bufferMinutes: 15,
      availabilityByParticipant: [],
      resources: [],
      canProceed: true,
      checkedAt: new Date().toISOString(),
    }
  }

  const scopedOrganisationId = normalizeText(organisationId)
  if (!isUuidLike(scopedOrganisationId)) {
    throw new Error('A valid organisation is required to run appointment availability checks.')
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Appointment scheduling requires the database connection.')
  }

  if (CLOSED_APPOINTMENT_STATUSES.has(normalizeAppointmentStatus(appointmentPayload.status))) {
    return {
      ...checkAppointmentConflicts(appointmentPayload, options),
      availabilityByParticipant: [], resources: [], canProceed: true,
      checkedAt: new Date().toISOString(),
    }
  }
  const normalized = normalizeAppointmentRecord(appointmentPayload, { organisationId: scopedOrganisationId })
  const { from, to } = getSchedulingRangeForAppointment(normalized)
  const [existingAppointments, resources] = await Promise.all([
    listAppointmentsFromSupabase(scopedOrganisationId, {
      includeAll: true,
      from,
      to,
    }),
    listAppointmentResourcesFromSupabase(scopedOrganisationId, { includeInactive: true }),
  ])

  const checks = checkAppointmentConflicts(
    {
      ...normalized,
      participants: Array.isArray(normalized?.participants) ? normalized.participants : [],
    },
    {
      appointments: existingAppointments,
      excludeAppointmentId: normalizeText(options?.excludeAppointmentId || normalized?.appointmentId),
      businessHours: options?.businessHours || DEFAULT_APPOINTMENT_BUSINESS_HOURS,
      allowOutsideBusinessHours: normalized.allowOutsideBusinessHours === true || options?.allowOutsideBusinessHours === true,
      maxSuggestions: Number(options?.maxSuggestions || 6),
      searchDays: Number(options?.searchDays || 10),
      slotMinutes: Number(options?.slotMinutes || getAppointmentTypeDefinition(normalized?.appointmentType)?.defaultDuration || 30),
    },
  )

  const availabilityByParticipant = await getParticipantAvailability(
    normalized.participants || [],
    { from, to },
    {
      appointments: existingAppointments,
    },
  )

  return {
    ...checks,
    availabilityByParticipant,
    resources,
    canProceed: checks.hasHardConflicts !== true,
    checkedAt: new Date().toISOString(),
  }
}

async function addLeadActivityInSupabase(organisationId, leadId, payload = {}, actor = null) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedLeadId = toNullableUuid(leadId)
  if (!scopedOrganisationId || !scopedLeadId) return

  const resolvedActorId = toNullableUuid(actor?.id)
  const { error } = await supabase.from('lead_activities').insert({
    organisation_id: scopedOrganisationId,
    lead_id: scopedLeadId,
    agent_id: resolvedActorId,
    activity_type: normalizeListValue(payload?.activityType, ACTIVITY_TYPES, 'Note'),
    activity_note: normalizeText(payload?.activityNote) || null,
    activity_date: payload?.activityDate || new Date().toISOString(),
    outcome: normalizeText(payload?.outcome) || null,
  })

  if (error) {
    throw error
  }
}

async function fetchAppointmentByIdFromSupabase(organisationId, appointmentId, options = {}) {
  const rows = await listAppointmentsFromSupabase(organisationId, { ...options, includeAll: true })
  return rows.find((row) => normalizeText(row?.appointmentId) === normalizeText(appointmentId)) || null
}

export async function getAppointmentAsync(organisationId, appointmentId) {
  if (!isSupabaseConfigured || !supabase || !isUuidLike(organisationId) || !isUuidLike(appointmentId)) throw new Error('Select a valid appointment and workspace.')
  const appointment = await fetchAppointmentByIdFromSupabase(organisationId, appointmentId)
  if (!appointment) throw new Error('This appointment is unavailable or you no longer have access to it.')
  return appointment
}

export async function createAppointmentAsync(organisationId, payload = {}, { actor = null } = {}) {
  const fallbackReason = resolveAppointmentsDemoFallbackReason(organisationId)
  if (fallbackReason) {
    assertLocalFallbackAllowed('agencyPipelineService.createAppointmentAsync', organisationId, fallbackReason)
    return createAppointment(organisationId, payload, { actor })
  }

  const scopedOrganisationId = normalizeText(organisationId)
  if (!isUuidLike(scopedOrganisationId)) {
    throw new Error('A valid organisation is required to create a transaction-linked appointment.')
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Appointment scheduling requires the database connection.')
  }
  const assigned = resolveAgentSnapshot(payload?.assignedAgent || payload?.agent || actor || {})
  const resolvedAssignedAgentId = toNullableUuid(assigned.id)
    ? assigned.id
    : (toNullableUuid(actor?.id) ? actor.id : assigned.id)
  const resolvedCreatedBy = toNullableUuid(actor?.id)
    ? actor.id
    : (toNullableUuid(payload?.createdBy || payload?.created_by) ? (payload?.createdBy || payload?.created_by) : null)
  const nextId = toNullableUuid(payload.commandId) || createUuid()
  const nowIso = new Date().toISOString()
  const appointment = normalizeAppointmentRecord(
    {
      appointmentId: nextId,
      organisationId: scopedOrganisationId,
      assignedAgentId: resolvedAssignedAgentId || null,
      assignedAgentName: assigned.name || null,
      assignedAgentEmail: assigned.email || null,
      appointmentType: payload?.appointmentType || 'other',
      customTypeLabel: payload?.customTypeLabel,
      title: payload?.title || getAppointmentTypeLabel(payload?.appointmentType || 'other') || 'Appointment',
      date: payload?.date,
      startTime: payload?.startTime,
      endTime: payload?.endTime,
      dateTime: payload?.dateTime,
      endDateTime: payload?.endDateTime,
      durationMinutes: payload?.durationMinutes,
      locationType: payload?.locationType,
      location: payload?.location,
      meetingUrl: payload?.meetingUrl,
      timezone: payload?.timezone,
      allDay: payload?.allDay === true,
      leadId: payload?.leadId,
      contactId: payload?.contactId,
      listingId: payload?.listingId,
      transactionId: payload?.transactionId,
      relatedEntityType: payload?.relatedEntityType,
      relatedEntityId: payload?.relatedEntityId,
      linkedWorkflow: payload?.linkedWorkflow,
      linkedWorkflowStage: payload?.linkedWorkflowStage,
      linkedTaskId: payload?.linkedTaskId,
      linkedTransactionStage: payload?.linkedTransactionStage,
      workflowCompletionEffect: payload?.workflowCompletionEffect,
      visibility: payload?.visibility,
      completionBehavior: payload?.completionBehavior,
      instructions: payload?.instructions,
      requiredDocuments: payload?.requiredDocuments,
      reminderRules: payload?.reminderRules,
      sendInviteEmails: payload?.sendInviteEmails,
      remindersEnabled: payload?.remindersEnabled,
      attachCalendarInvite: payload?.attachCalendarInvite,
      emailTheme: payload?.emailTheme,
      emailTemplateKey: payload?.emailTemplateKey,
      resourceId: payload?.resourceId,
      allowOutsideBusinessHours: payload?.allowOutsideBusinessHours === true,
      schedulingOverrideReason: payload?.schedulingOverrideReason,
      status: payload?.status || 'requested',
      notes: payload?.notes,
      createdBy: resolvedCreatedBy,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    { organisationId: scopedOrganisationId, validateSchedule: true },
  )
  assertAppointmentWrite(appointment)

  const participants = (Array.isArray(payload?.participants) ? payload.participants : []).map((participant) =>
    normalizeParticipantRecord(participant, {
      appointmentId: appointment.appointmentId,
      organisationId: appointment.organisationId,
    }),
  )
  const hasAgentParticipant = participants.some((participant) => normalizeLowerText(participant?.participantRole) === 'agent')
  const defaultParticipants = hasAgentParticipant
    ? participants
    : [
        ...participants,
        normalizeParticipantRecord(
          {
            name: assigned.name || 'Agent',
            email: assigned.email || '',
            userId: toNullableUuid(resolvedAssignedAgentId) ? resolvedAssignedAgentId : null,
            participantRole: 'Agent',
            rsvpStatus: 'Pending',
          },
          { appointmentId: appointment.appointmentId, organisationId: appointment.organisationId },
        ),
      ]

  const schedulingIntegrity = await checkAppointmentSchedulingIntegrityAsync(
    scopedOrganisationId,
    {
      ...appointment,
      participants: defaultParticipants,
    },
    {
      excludeAppointmentId: appointment.appointmentId,
      allowOutsideBusinessHours: appointment.allowOutsideBusinessHours === true,
      maxSuggestions: 5,
    },
  )

  if (schedulingIntegrity.hasHardConflicts) {
    const conflictError = new Error(buildSchedulingConflictErrorMessage(schedulingIntegrity.hardConflicts))
    conflictError.code = 'APPOINTMENT_HARD_CONFLICT'
    conflictError.schedulingConflicts = schedulingIntegrity
    throw conflictError
  }

  const verifiedSaved = await saveAppointmentCommand({
    organisationId: scopedOrganisationId, appointmentId: appointment.appointmentId, appointment,
    participants: defaultParticipants, creating: true, commandId: payload.commandId,
    viewingMode: payload.listingViewingMode || null, confirmationNote: normalizeText(payload.bookingConfirmationNote) || null,
  })

  if (!verifiedSaved.mutationReplayed && normalizeText(appointment.leadId)) {
    try {
      await addLeadActivityInSupabase(
        scopedOrganisationId,
        appointment.leadId,
        {
          activityType: 'Appointment Created',
          activityNote: `${appointment.appointmentTypeLabel || getAppointmentTypeLabel(appointment.appointmentType)} appointment created`,
          outcome: appointment.status,
          activityDate: appointment.dateTime || appointment.createdAt,
        },
        actor || assigned,
      )
    } catch {
      // Appointments should still save if timeline write fails for legacy/unlinked lead rows.
    }
    if (isBuyerLifecycleAppointment(appointment)) {
      await applyBuyerLifecycleEvent({
        organisationId: scopedOrganisationId,
        leadId: appointment.leadId,
        event: BUYER_LIFECYCLE_EVENTS.VIEWING_CREATED,
        actor: actor || assigned,
        activityNote: `${appointment.appointmentTypeLabel || getAppointmentTypeLabel(appointment.appointmentType)} scheduled.`,
      }).catch(() => null)
    }
  }

  if (!verifiedSaved.mutationReplayed && normalizeText(appointment.transactionId)) {
    try {
      await supabase.from('transaction_events').insert({
        transaction_id: appointment.transactionId,
        event_type: 'appointment_requested',
        event_data: {
          appointmentId: appointment.appointmentId,
          appointmentType: appointment.appointmentType,
          appointmentTypeLabel: appointment.appointmentTypeLabel,
          linkedWorkflow: appointment.linkedWorkflow,
          linkedWorkflowStage: appointment.linkedWorkflowStage,
          linkedTransactionStage: appointment.linkedTransactionStage,
          status: appointment.status,
          visibility: appointment.visibility,
          audience: appointment.visibility === 'client_visible' ? 'shared' : 'internal',
          title: `${appointment.appointmentTypeLabel} appointment requested`,
          description: `A ${appointment.appointmentTypeLabel.toLowerCase()} appointment has been requested.`,
        },
      })
    } catch {
      // Keep appointment creation resilient even if event logging is unavailable.
    }
  }

  emitAgencyCrmUpdated()
  return { ...verifiedSaved, schedulingIntegrity,
    notificationsQueued: verifiedSaved.delivery?.verified === true && verifiedSaved.delivery.jobs.some(job => job.status === 'queued'),
    notificationResults: [], notificationError: null, documentNotificationResults: [],
    reminderResults: (verifiedSaved.delivery?.jobs || []).filter(job => job.event_kind.startsWith('reminder:')),
  }
}

export async function updateAppointmentAsync(organisationId, appointmentId, updater = {}, { actor = null } = {}) {
  const fallbackReason = resolveAppointmentsDemoFallbackReason(organisationId)
  if (fallbackReason) {
    assertLocalFallbackAllowed('agencyPipelineService.updateAppointmentAsync', organisationId, fallbackReason)
    return updateAppointment(organisationId, appointmentId, updater, { actor })
  }

  const scopedOrganisationId = normalizeText(organisationId)
  const scopedAppointmentId = normalizeText(appointmentId)
  if (!isUuidLike(scopedOrganisationId)) {
    throw new Error('A valid organisation is required to update an appointment.')
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Appointment scheduling requires the database connection.')
  }
  if (!scopedOrganisationId || !scopedAppointmentId) throw new Error('Select an appointment before saving.')

  const current = await fetchAppointmentByIdFromSupabase(scopedOrganisationId, scopedAppointmentId)
  if (!current) throw new Error('The appointment could not be loaded. Refresh before saving.')
  let managedListingViewing = false
  if (normalizeLowerText(current?.appointmentType).includes('view') && normalizeText(current?.listingId)) {
    const managedLookup = await supabase.from('appointments')
      .select('listing_viewing_round_number')
      .eq('organisation_id', scopedOrganisationId)
      .eq('appointment_id', scopedAppointmentId)
      .maybeSingle()
    if (managedLookup.error && !isMissingColumnError(managedLookup.error, 'listing_viewing_round_number')) {
      throw managedLookup.error
    }
    managedListingViewing = managedLookup.data?.listing_viewing_round_number != null
  }
  if (managedListingViewing && Array.isArray(updater?.participants)) {
    throw new Error('Viewing participants must be changed through the three-party viewing workflow.')
  }

  const merged = prepareAppointmentUpdate(current, updater, { organisationId: scopedOrganisationId, actor })
  const appointmentTimingChanged =
    normalizeText(current?.date) !== normalizeText(merged?.date) ||
    normalizeText(current?.startTime) !== normalizeText(merged?.startTime) ||
    normalizeText(current?.endTime) !== normalizeText(merged?.endTime) ||
    normalizeText(current?.dateTime) !== normalizeText(merged?.dateTime)
  if (managedListingViewing && appointmentTimingChanged) {
    throw new Error('Propose a new viewing time so the buyer, seller and agent can all approve it.')
  }
  const scheduleChanged =
    appointmentTimingChanged ||
    normalizeText(current?.location) !== normalizeText(merged?.location) ||
    normalizeText(current?.status) !== normalizeText(merged?.status)
  if (scheduleChanged) {
    merged.externalCalendarStatus = 'not_synced'
    merged.icsGeneratedAt = null
  }
  const nextParticipants = Array.isArray(updater?.participants)
    ? updater.participants.map((participant) =>
        normalizeParticipantRecord(participant, {
          appointmentId: scopedAppointmentId,
          organisationId: scopedOrganisationId,
        }),
      )
    : (Array.isArray(current?.participants) ? current.participants : [])

  const schedulingIntegrity = await checkAppointmentSchedulingIntegrityAsync(
    scopedOrganisationId,
    {
      ...merged,
      participants: nextParticipants,
    },
    {
      excludeAppointmentId: scopedAppointmentId,
      allowOutsideBusinessHours: merged.allowOutsideBusinessHours === true,
      maxSuggestions: 5,
    },
  )

  if (schedulingIntegrity.hasHardConflicts) {
    const conflictError = new Error(buildSchedulingConflictErrorMessage(schedulingIntegrity.hardConflicts))
    conflictError.code = 'APPOINTMENT_HARD_CONFLICT'
    conflictError.schedulingConflicts = schedulingIntegrity
    throw conflictError
  }

  if (merged.status === 'completed' && !merged.completedAt) {
    merged.completedAt = new Date().toISOString()
  }

  const verifiedSaved = await saveAppointmentCommand({
    organisationId: scopedOrganisationId, appointmentId: scopedAppointmentId, appointment: merged,
    participants: Array.isArray(updater.participants) ? nextParticipants.map(person => {
      // Preserve saved IDs, but discard temporary IDs on newly added attendees.
      const existing = current.participants?.some(saved => saved.participantId === person.participantId)
      return existing ? person : { ...person, participantId: null }
    }) : null,
    expectedRevision: updater.expectedRevision ?? current.calendarRevision, commandId: updater.commandId,
    action: updater.reissueRequest === true ? 'reissue' : 'save',
  })

  if (!verifiedSaved.mutationReplayed && normalizeText(merged.leadId) && Object.prototype.hasOwnProperty.call(updater, 'status')) {
    let statusActivityType = 'Appointment Booked'
    if (merged.status === 'confirmed') statusActivityType = 'Appointment Confirmed'
    if (merged.status === 'completed') statusActivityType = 'Appointment Completed'
    try {
      await addLeadActivityInSupabase(
        scopedOrganisationId,
        merged.leadId,
        {
          activityType: statusActivityType,
          activityNote: `Appointment status updated: ${merged.status}`,
          outcome: merged.status,
          activityDate: new Date().toISOString(),
        },
        actor || {},
      )
    } catch {
      // Non-blocking for legacy data where lead linkage is local/demo only.
    }
    if (merged.status === 'completed' && isBuyerLifecycleAppointment(merged)) {
      await applyBuyerLifecycleEvent({
        organisationId: scopedOrganisationId,
        leadId: merged.leadId,
        event: BUYER_LIFECYCLE_EVENTS.VIEWING_COMPLETED,
        actor: actor || {},
        activityNote: `${merged.appointmentTypeLabel || getAppointmentTypeLabel(merged.appointmentType)} completed.`,
      }).catch(() => null)
    }
  }

  const updatedRecord = verifiedSaved
  if (!verifiedSaved.mutationReplayed && normalizeText(updatedRecord?.transactionId)) {
    try {
      await supabase.from('transaction_events').insert({
        transaction_id: updatedRecord.transactionId,
        event_type: normalizeText(updatedRecord.status).toLowerCase() === 'completed' ? 'appointment_completed' : 'appointment_updated',
        event_data: {
          appointmentId: updatedRecord.appointmentId,
          appointmentType: updatedRecord.appointmentType,
          appointmentTypeLabel: updatedRecord.appointmentTypeLabel,
          linkedWorkflow: updatedRecord.linkedWorkflow,
          linkedWorkflowStage: updatedRecord.linkedWorkflowStage,
          linkedTransactionStage: updatedRecord.linkedTransactionStage,
          completionBehavior: updatedRecord.completionBehavior,
          workflowCompletionEffect: updatedRecord.workflowCompletionEffect || {},
          status: updatedRecord.status,
          visibility: updatedRecord.visibility,
          audience: updatedRecord.visibility === 'client_visible' ? 'shared' : 'internal',
          title:
            normalizeText(updatedRecord.status).toLowerCase() === 'completed'
              ? `${updatedRecord.appointmentTypeLabel} appointment completed`
              : `${updatedRecord.appointmentTypeLabel} appointment updated`,
          description:
            normalizeText(updatedRecord.status).toLowerCase() === 'completed'
              ? `${updatedRecord.appointmentTypeLabel} appointment was completed.`
              : `${updatedRecord.appointmentTypeLabel} appointment details were updated.`,
        },
      })
    } catch {
      // Non-blocking event log.
    }
  }
  emitAgencyCrmUpdated()
  return { ...updatedRecord, schedulingIntegrity,
    notificationsQueued: updatedRecord.delivery?.verified === true && updatedRecord.delivery.jobs.some(job => job.status === 'queued'),
    notificationResults: [], notificationError: null,
  }
}

export async function updateAppointmentParticipantRsvpAsync(
  organisationId,
  appointmentId,
  participantId,
  payload = {},
  { actor = null } = {},
) {
  const fallbackReason = resolveAppointmentsDemoFallbackReason(organisationId)
  if (fallbackReason) {
    assertLocalFallbackAllowed('agencyPipelineService.updateAppointmentParticipantRsvpAsync', organisationId, fallbackReason)
    return updateAppointmentParticipantRsvp(organisationId, appointmentId, participantId, payload, { actor })
  }

  const scopedOrganisationId = normalizeText(organisationId)
  const scopedAppointmentId = normalizeText(appointmentId)
  const scopedParticipantId = normalizeText(participantId)
  if (!isUuidLike(scopedOrganisationId)) {
    throw new Error('A valid organisation is required to update appointment RSVP.')
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Appointment scheduling requires the database connection.')
  }
  if (!scopedOrganisationId || !scopedAppointmentId || !scopedParticipantId) return null

  const managedViewing = await supabase.from('appointments')
    .select('listing_viewing_round_number, reservation_managed, calendar_revision')
    .eq('organisation_id', scopedOrganisationId)
    .eq('appointment_id', scopedAppointmentId)
    .maybeSingle()
  if (managedViewing.error && !isMissingColumnError(managedViewing.error, 'listing_viewing_round_number')) {
    throw managedViewing.error
  }
  if (managedViewing.data?.listing_viewing_round_number != null) {
    const participant = await supabase.from('appointment_participants')
      .select('rsvp_token, participant_role, email')
      .eq('organisation_id', scopedOrganisationId)
      .eq('appointment_id', scopedAppointmentId)
      .eq('participant_id', scopedParticipantId)
      .maybeSingle()
    if (participant.error) throw participant.error
    if (!participant.data?.rsvp_token) throw new Error('This viewing invitation is no longer active.')
    if (normalizeLowerText(participant.data.participant_role) !== 'agent'
      || normalizeLowerText(participant.data.email) !== normalizeLowerText(actor?.email)) {
      throw new Error('Only the assigned agent can respond to their viewing invitation here.')
    }
    const response = await supabase.rpc('submit_appointment_rsvp', {
      p_token: participant.data.rsvp_token,
      p_rsvp_status: mapLegacyRsvpStatus(payload?.rsvpStatus),
      p_proposed_new_time: payload?.proposedNewTime || null,
      p_preferred_end: payload?.preferredEnd || null,
      p_rsvp_comment: normalizeText(payload?.rsvpComment) || null,
    })
    if (response.error) throw response.error
    if (!Array.isArray(response.data) || response.data.length === 0) {
      throw new Error('This viewing invitation has expired or is no longer active.')
    }
    emitAgencyCrmUpdated()
    return fetchAppointmentByIdFromSupabase(scopedOrganisationId, scopedAppointmentId)
  }

  if (managedViewing.data?.reservation_managed === true) {
    const response = await supabase.rpc('respond_calendar_appointment', {
      p_appointment_id: scopedAppointmentId, p_participant_id: scopedParticipantId,
      p_expected_revision: payload.expectedRevision ?? managedViewing.data.calendar_revision,
      p_command_id: payload.commandId || createUuid(), p_status: mapLegacyRsvpStatus(payload.rsvpStatus),
      p_start: payload.proposedNewTime || null, p_end: payload.preferredEnd || null,
      p_comment: normalizeText(payload.rsvpComment) || null,
    })
    if (response.error) throw response.error
    if (response.data?.verified !== true || response.data.appointmentId !== scopedAppointmentId
      || response.data.participantId !== scopedParticipantId) throw new Error('The response could not be verified. Refresh before trying again.')
    emitAgencyCrmUpdated()
    return fetchAppointmentByIdFromSupabase(scopedOrganisationId, scopedAppointmentId)
  }

  const participantUpdate = {
    rsvp_status: mapLegacyRsvpStatus(payload?.rsvpStatus),
    proposed_new_time: payload?.proposedNewTime || null,
    rsvp_comment: normalizeText(payload?.rsvpComment) || null,
    responded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  let participantResult = await supabase
    .from('appointment_participants')
    .update(participantUpdate)
    .eq('organisation_id', scopedOrganisationId)
    .eq('appointment_id', scopedAppointmentId)
    .eq('participant_id', scopedParticipantId)
  if (participantResult.error && isMissingColumnError(participantResult.error, 'rsvp_comment')) {
    const { rsvp_comment: _rsvpComment, ...legacyParticipantUpdate } = participantUpdate
    participantResult = await supabase
      .from('appointment_participants')
      .update(legacyParticipantUpdate)
      .eq('organisation_id', scopedOrganisationId)
      .eq('appointment_id', scopedAppointmentId)
      .eq('participant_id', scopedParticipantId)
  }
  const { error: participantError } = participantResult
  if (participantError) {
    throw participantError
  }

  const appointment = await fetchAppointmentByIdFromSupabase(scopedOrganisationId, scopedAppointmentId)
  if (!appointment) return null
  const participants = Array.isArray(appointment.participants) ? appointment.participants : []
  const requiredParticipants = participants.filter((participant) => {
    if (participant?.isRequired === false || participant?.is_required === false) return false
    const role = normalizeLowerText(participant?.participantRole || participant?.participant_role)
    return !['agent', 'co-agent', 'principal'].includes(role)
  })
  const hasDeclined = requiredParticipants.some((participant) => participant.rsvpStatus === 'Declined')
  const hasProposed = requiredParticipants.some((participant) => participant.rsvpStatus === 'Proposed New Time')
  const allAccepted = requiredParticipants.length > 0 && requiredParticipants.every((participant) => participant.rsvpStatus === 'Accepted')
  const nextStatus = hasDeclined
    ? 'declined'
    : hasProposed
      ? 'alternative_requested'
      : allAccepted
        ? 'confirmed'
        : 'requested'

  const normalizedRsvp = normalizeLowerText(participantUpdate?.rsvp_status)
  const respondingParticipant = participants.find((participant) => normalizeText(participant?.participantId || participant?.participant_id) === scopedParticipantId)
  const isSellerAcceptedHandoff = normalizedRsvp === 'accepted' &&
    nextStatus === 'requested' &&
    normalizeLowerText(respondingParticipant?.participantRole || respondingParticipant?.participant_role).includes('seller')
  await runAppointmentNotificationTask('participant_rsvp_updated', async () => {
    if (normalizedRsvp === 'declined') {
      await notifyAppointmentParticipants(scopedAppointmentId, 'appointment_declined', {
        visibility: appointment.visibility,
        metadata: {
          source: 'updateAppointmentParticipantRsvpAsync',
          rsvpStatus: 'declined',
        },
      })
      return
    }
    if (normalizedRsvp.includes('proposed')) {
      await notifyAppointmentParticipants(scopedAppointmentId, 'appointment_reschedule_requested', {
        visibility: appointment.visibility,
        metadata: {
          source: 'updateAppointmentParticipantRsvpAsync',
          rsvpStatus: 'proposed_new_time',
        },
      })
      return
    }
    if (isSellerAcceptedHandoff) {
      const pendingBuyerEmails = requiredParticipants
        .filter((participant) =>
          normalizeLowerText(participant?.participantRole || participant?.participant_role).includes('buyer') &&
          normalizeText(participant?.rsvpStatus || participant?.rsvp_status) === 'Pending' &&
          normalizeText(participant?.email),
        )
        .map((participant) => normalizeText(participant?.email).toLowerCase())
      if (pendingBuyerEmails.length) {
        await notifyAppointmentParticipants(scopedAppointmentId, 'appointment_confirmation_required', {
          visibility: appointment.visibility,
          recipientEmails: pendingBuyerEmails,
          metadata: {
            source: 'seller_rsvp_handoff_to_buyer',
            sellerParticipantId: scopedParticipantId,
            attachCalendarInvite: true,
          },
        })
      }
    }
  })

  return updateAppointmentAsync(
    scopedOrganisationId,
    scopedAppointmentId,
    { status: nextStatus },
    { actor, suppressNotifications: isSellerAcceptedHandoff },
  )
}

export async function setAppointmentArchiveAsync(organisationId, appointmentId, { archive, reason, expectedRevision, expectedArchivedAt = null, commandId } = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Archiving requires the database connection.')
  if (!isUuidLike(organisationId) || !isUuidLike(appointmentId) || typeof archive !== 'boolean' || !Number.isInteger(expectedRevision)) {
    throw new Error('Refresh this appointment before archiving or restoring.')
  }
  const result = await supabase.rpc('set_calendar_appointment_archive', {
    p_organisation_id: organisationId, p_appointment_id: appointmentId, p_archive: archive,
    p_reason: normalizeText(reason), p_expected_revision: expectedRevision,
    p_expected_archived_at: expectedArchivedAt, p_command_id: commandId || createUuid(),
  })
  if (result.error) throw result.error
  const receipt = result.data
  if (receipt?.verified !== true || receipt.appointment?.appointment_id !== appointmentId
    || receipt.appointment.organisation_id !== organisationId || !Number.isInteger(receipt.appointment.calendar_revision)
    || !Array.isArray(receipt.participants) || receipt.participants.some(person => !isUuidLike(person?.participant_id) || person.appointment_id !== appointmentId || person.organisation_id !== organisationId) || (receipt.replayed !== true && Boolean(receipt.appointment.archived_at) !== archive)) {
    throw new Error('The archive result could not be verified. Refresh before retrying.')
  }
  const saved = { ...mapDbAppointmentRow(receipt.appointment, organisationId), participants: receipt.participants.map(mapDbParticipantRow), delivery: receipt.delivery || null }
  emitAgencyCrmUpdated()
  return saved
}

export async function addAppointmentOutcomeAsync(organisationId, appointmentId, payload = {}, { actor = null } = {}) {
  const fallbackReason = resolveAppointmentsDemoFallbackReason(organisationId)
  if (fallbackReason) {
    assertLocalFallbackAllowed('agencyPipelineService.addAppointmentOutcomeAsync', organisationId, fallbackReason)
    return addAppointmentOutcome(organisationId, appointmentId, payload, { actor })
  }

  const updated = await updateAppointmentAsync(
    organisationId,
    appointmentId,
    {
      status: payload?.status || 'completed',
      expectedRevision: payload.expectedRevision, commandId: payload.commandId,
      outcomeSummary: payload?.outcomeSummary,
      clientFeedback: payload?.clientFeedback,
      agentNotes: payload?.agentNotes,
      nextStep: payload?.nextStep,
      followUpDate: payload?.followUpDate,
    },
    { actor },
  )

  if (updated && !updated.mutationReplayed && normalizeText(updated.leadId)) {
    try {
      await addLeadActivityInSupabase(
        organisationId,
        updated.leadId,
        {
          activityType: 'Appointment Feedback Added',
          activityNote: updated.outcomeSummary || 'Appointment feedback added',
          outcome: updated.status,
          activityDate: new Date().toISOString(),
        },
        actor || {},
      )
    } catch {
      // Timeline insert should not block outcome persistence.
    }
  }

  emitAgencyCrmUpdated()
  return updated
}

export async function listAppointmentsAsync(organisationId, { includeAll = false, agentId = '', agentEmail = '', agentKeys = [], listingId = '', leadId = '', from = null, to = null, signal } = {}) {
  const fallbackReason = resolveAppointmentsDemoFallbackReason(organisationId)
  if (fallbackReason) {
    assertLocalFallbackAllowed('agencyPipelineService.listAppointmentsAsync', organisationId, fallbackReason)
    return listAppointments(organisationId, { includeAll, agentId, agentEmail, agentKeys, listingId, from: leadId ? null : from, to: leadId ? null : to }).filter((row) => !leadId || row.leadId === leadId || (row.relatedEntityType === 'lead' && row.relatedEntityId === leadId))
  }
  if (!isUuidLike(normalizeText(organisationId))) {
    throw new WorkspaceContextError('invalid_service_workspace_context', {
      service: 'agencyPipelineService.listAppointmentsAsync',
      workspaceId: normalizeText(organisationId) || null,
    })
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Appointment scheduling requires the database connection.')
  }
  return listAppointmentsFromSupabase(organisationId, { includeAll, agentId, agentEmail, agentKeys, listingId, leadId, from, to, signal })
}

export async function getAppointmentsDashboardSummaryAsync(
  organisationId,
  {
    includeAll = false,
    agentId = '',
    agentEmail = '',
    agentKeys = [],
    now = new Date(),
  } = {},
) {
  const rows = await listAppointmentsAsync(organisationId, { includeAll, agentId, agentEmail, agentKeys })
  return buildAppointmentsDashboardSummary(rows, { now })
}

export async function convertLeadToTransactionRecord(organisationId, leadId, payload = {}, { actor = null } = {}) {
  assertLocalFallbackAllowed('agencyPipelineService.convertLeadToTransactionRecord', organisationId, 'local_crm_transaction_conversion')
  const store = safeReadStore(organisationId)
  const targetLeadId = normalizeText(leadId)
  const lead = store.leads.find((row) => normalizeText(row?.leadId) === targetLeadId)
  if (!lead) {
    throw new Error('Lead not found.')
  }

  const assigned = resolveAgentSnapshot(payload?.assignedAgent || actor || {})
  const listingId = normalizeText(payload?.listingId)
  const acceptedOfferId = normalizeText(payload?.acceptedOfferId) || null
  const shouldUseMockMode =
    payload?.mockMode === true ||
    !isSupabaseConfigured ||
    !supabase ||
    !isUuidLike(normalizeText(organisationId))

  const created = await createTransactionFromLeadOverride({
    lead,
    actor: assigned,
    payload: {
      organisationId: normalizeText(organisationId) || null,
      listingId: listingId || null,
      listingTitle: normalizeText(payload?.listingTitle),
      dealValue: Number(payload?.dealValue || lead?.estimatedValue || lead?.budget || 0) || 0,
      purchasePrice: Number(payload?.dealValue || lead?.estimatedValue || lead?.budget || 0) || 0,
      stage: normalizeText(payload?.stage || (acceptedOfferId ? 'Buyer Onboarding Pending' : 'Reserved')),
      originatingBuyerLeadId: targetLeadId,
      originatingLeadId: targetLeadId,
      acceptedOfferId,
      assignedAgentId: normalizeText(lead?.assignedAgentId || assigned.id),
      assignedAgentName: normalizeText(lead?.assignedAgentName || assigned.name),
      assignedAgentEmail: normalizeText(lead?.assignedAgentEmail || assigned.email),
      buyerContactId: normalizeText(lead?.contactId),
      buyerName: normalizeText(payload?.buyerName || `${payload?.firstName || ''} ${payload?.lastName || ''}`),
      buyerEmail: normalizeText(payload?.buyerEmail),
      buyerPhone: normalizeText(payload?.buyerPhone),
      financeType: normalizeText(payload?.financeType || 'unknown'),
      grossCommissionPercentage: payload?.grossCommissionPercentage,
      grossCommissionAmount: payload?.grossCommissionAmount,
      agentSplitPercentage: payload?.agentSplitPercentage,
      agencySplitPercentage: payload?.agencySplitPercentage,
      agentCommissionAmount: payload?.agentCommissionAmount,
      agencyCommissionAmount: payload?.agencyCommissionAmount,
      mockMode: shouldUseMockMode,
    },
    options: {
      mockMode: shouldUseMockMode,
      allowRuntimeFallback: shouldUseMockMode,
    },
  })
  const transactionRow = created?.transactionRow || null
  if (!transactionRow?.transaction?.id) {
    throw new Error('Transaction creation failed.')
  }

  const transactionRecord = {
    transactionId: transactionRow.transaction.id,
    organisationId: normalizeText(organisationId) || null,
    leadId: targetLeadId,
    acceptedOfferId: normalizeText(transactionRow?.transaction?.accepted_offer_id),
    listingId: normalizeText(transactionRow?.transaction?.listing_id),
    assignedAgentId: normalizeText(transactionRow?.transaction?.assigned_agent_id || lead?.assignedAgentId || assigned.id),
    assignedAgentName: normalizeText(transactionRow?.transaction?.assigned_agent || lead?.assignedAgentName || assigned.name),
    assignedAgentEmail: normalizeText(transactionRow?.transaction?.assigned_agent_email || lead?.assignedAgentEmail || assigned.email),
    contactId: normalizeText(lead?.contactId),
    title: normalizeText(payload?.title) || `${lead?.leadCategory || 'Lead'} Transaction`,
    stage: normalizeText(transactionRow?.stage || payload?.stage || 'Reserved'),
    originatingLeadId: targetLeadId,
    dealValue: Number(payload?.dealValue || lead?.estimatedValue || lead?.budget || 0) || 0,
    status: normalizeText(payload?.status || 'created'),
    gross_commission_percentage: transactionRow?.transaction?.gross_commission_percentage ?? null,
    gross_commission_amount: transactionRow?.transaction?.gross_commission_amount ?? null,
    agent_split_percentage_snapshot: transactionRow?.transaction?.agent_split_percentage_snapshot ?? null,
    agency_split_percentage_snapshot: transactionRow?.transaction?.agency_split_percentage_snapshot ?? null,
    agent_commission_amount: transactionRow?.transaction?.agent_commission_amount ?? null,
    agency_commission_amount: transactionRow?.transaction?.agency_commission_amount ?? null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    transactionSource: 'lead_manual_override',
    workflowHealthIssues: Array.isArray(transactionRow?.transaction?.workflow_health_issues)
      ? transactionRow.transaction.workflow_health_issues
      : ['missing_accepted_offer'],
  }

  store.transactions = [
    transactionRecord,
    ...(Array.isArray(store.transactions) ? store.transactions.filter((row) => normalizeText(row?.transactionId) !== transactionRecord.transactionId) : []),
  ]
  // Keep legacy "deals" array in sync for beta compatibility.
  store.deals = [transactionRecord, ...(Array.isArray(store.deals) ? store.deals.filter((row) => normalizeText(row?.transactionId) !== transactionRecord.transactionId) : [])]
  store.leads = store.leads.map((row) =>
    normalizeText(row?.leadId) === targetLeadId
      ? {
          ...row,
          stage: 'Converted to Transaction',
          status: 'Converted to Transaction',
          convertedDealId: transactionRow.transaction.id,
          convertedTransactionId: transactionRow.transaction.id,
          updatedAt: new Date().toISOString(),
        }
      : row,
  )
  writeStore(organisationId, store)

  addLeadActivity(organisationId, leadId, {
    agent: actor || assigned,
    activityType: created?.existing ? 'Deal Created' : 'Transaction Created',
    activityNote: created?.existing
      ? `Linked to existing transaction ${transactionRow.transaction.id}`
      : `Converted to transaction ${transactionRow.transaction.id}`,
    outcome: transactionRecord.status,
    activityDate: new Date().toISOString(),
  })
  return transactionRecord
}

export async function convertLeadToDealRecord(organisationId, leadId, payload = {}, { actor = null } = {}) {
  return convertLeadToTransactionRecord(organisationId, leadId, payload, { actor })
}
