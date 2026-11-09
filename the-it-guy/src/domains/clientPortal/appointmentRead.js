// clientPortal owns these operations and their existing recovery behavior.
import { getDefaultTrustInvestmentForm } from '../transactions/workspaceReadApi.js'
import { isOptionalRelationKnownMissing, rememberMissingOptionalRelation } from '../../lib/api/shared/schemaReadCompatibility.js'
import { isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError } from '../../lib/api/shared/readHelpers.js'
import { hashBondApplicationSnapshot, projectNormalizedBondApplicationToLegacy } from '../../modules/bond/application/index.js'
import { appointmentStartIso } from '../../core/appointments/attorneyCalendarModel.js'
import { requireScopedClient } from '../transactions/contactSupport.js'
import { TRUST_INVESTMENT_FORM_SELECT, normalizeTrustInvestmentFormRow } from '../transactions/workspaceHydration.js'

export function requireClientPortalTokenClient(token, sellerAccessToken = '') {
  return requireScopedClient({
    'x-bridge-client-portal-token': String(token || '').trim(),
    ...(sellerAccessToken ? {'x-bridge-seller-portal-access-token':sellerAccessToken} : {}),
  })
}

export async function fetchTrustInvestmentFormForTransaction(client, { developmentId, unitId, transaction, buyer }) {
  const defaults = getDefaultTrustInvestmentForm({
    developmentId,
    unitId,
    transaction,
    buyer,
  })

  if (!transaction?.id) {
    return defaults
  }

  const { data, error } = await client
    .from('trust_investment_forms')
    .select(TRUST_INVESTMENT_FORM_SELECT)
    .eq('transaction_id', transaction.id)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, 'trust_investment_forms')) {
      return defaults
    }

    throw error
  }

  if (!data) {
    return defaults
  }

  return normalizeTrustInvestmentFormRow(data, defaults)
}

function normalizeAppointmentVisibilityScope(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (['client_visible', 'internal_only', 'shared_role_players'].includes(normalized)) {
    return normalized
  }
  if (normalized === 'client') return 'client_visible'
  if (normalized === 'internal') return 'internal_only'
  if (normalized === 'shared') return 'shared_role_players'
  return 'shared_role_players'
}

function appointmentTypeLabelFromValue(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return 'Appointment'
  if (normalized.includes('_')) {
    return normalized
      .split('_')
      .filter(Boolean)
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(' ')
  }
  return normalized
}

function normalizeAppointmentRecordRow(row = {}) {
  return {
    appointmentId: row?.appointment_id || null,
    transactionId: row?.transaction_id || null,
    appointmentType: String(row?.appointment_type || '').trim() || 'internal_meeting',
    appointmentTypeLabel: appointmentTypeLabelFromValue(row?.appointment_type || ''),
    title: String(row?.title || '').trim() || appointmentTypeLabelFromValue(row?.appointment_type || ''),
    date: row?.appointment_date || null,
    startTime: row?.start_time || null,
    endTime: row?.end_time || null,
    dateTime: appointmentStartIso(row),
    location: String(row?.location || '').trim() || null,
    notes: String(row?.notes || '').trim() || null,
    status: String(row?.status || '').trim() || 'Pending Confirmation',
    linkedWorkflow: row?.linked_workflow || null,
    linkedWorkflowStage: row?.linked_workflow_stage || row?.linked_transaction_stage || null,
    linkedTaskId: row?.linked_task_id || null,
    linkedTransactionStage: row?.linked_transaction_stage || null,
    visibility: normalizeAppointmentVisibilityScope(row?.visibility_scope),
    instructions: String(row?.appointment_instructions || '').trim() || null,
    requiredDocuments: Array.isArray(row?.required_documents) ? row.required_documents : [],
    calendarEventUid: row?.calendar_event_uid || null,
    icsGeneratedAt: row?.ics_generated_at || null,
    externalCalendarStatus: String(row?.external_calendar_status || '').trim() || 'not_synced',
    externalCalendarProvider: String(row?.external_calendar_provider || '').trim() || null,
    externalCalendarEventId: String(row?.external_calendar_event_id || '').trim() || null,
    completionBehavior: String(row?.completion_behavior || '').trim() || null,
    resourceId: row?.resource_id || null,
    allowOutsideBusinessHours: row?.allow_outside_business_hours === true,
    participants: Array.isArray(row?.participants) ? row.participants : [],
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

function normalizeAppointmentParticipantRecordRow(row = {}) {
  return {
    participantId: row?.participant_id || null,
    appointmentId: row?.appointment_id || null,
    name: String(row?.name || '').trim() || 'Participant',
    email:
      String(row?.email || '')
        .trim()
        .toLowerCase() || null,
    phone: String(row?.phone || '').trim() || null,
    participantRole: String(row?.participant_role || 'Other Contact').trim() || 'Other Contact',
    rsvpStatus: String(row?.rsvp_status || 'Pending').trim() || 'Pending',
    proposedNewTime: row?.proposed_new_time || null,
    respondedAt: row?.responded_at || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

function normalizeRescheduleRequestStatus(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (['pending', 'proposed', 'accepted', 'rejected', 'cancelled', 'completed'].includes(normalized)) return normalized
  return 'pending'
}

function normalizeAppointmentRescheduleRequestRow(row = {}) {
  return {
    id: row?.id || null,
    appointmentId: row?.appointment_id || null,
    requestedBy: row?.requested_by || null,
    requestedByRole: String(row?.requested_by_role || '').trim() || null,
    reason: String(row?.reason || '').trim() || null,
    preferredStart: row?.preferred_start || null,
    preferredEnd: row?.preferred_end || null,
    status: normalizeRescheduleRequestStatus(row?.status),
    reviewedBy: row?.reviewed_by || null,
    reviewedAt: row?.reviewed_at || null,
    suggestedSlots: Array.isArray(row?.suggested_slots) ? row.suggested_slots : [],
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  }
}

export async function fetchTransactionAppointments(client, transactionIds = [], options = {}) {
  const { viewer = 'internal' } = options
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return {}
  if (isOptionalRelationKnownMissing('appointments')) return {}

  let query = await client
    .from('appointments')
    .select(
      'appointment_id, transaction_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, notes, status, linked_workflow, linked_workflow_stage, linked_task_id, linked_transaction_stage, visibility_scope, appointment_instructions, required_documents, calendar_event_uid, ics_generated_at, external_calendar_status, external_calendar_provider, external_calendar_event_id, completion_behavior, resource_id, allow_outside_business_hours, created_at, updated_at',
    )
    .in('transaction_id', ids)
    .order('date_time', { ascending: true })

  if (
    query.error &&
    (isMissingColumnError(query.error, 'linked_workflow') ||
      isMissingColumnError(query.error, 'linked_workflow_stage') ||
      isMissingColumnError(query.error, 'linked_task_id') ||
      isMissingColumnError(query.error, 'linked_transaction_stage') ||
      isMissingColumnError(query.error, 'visibility_scope') ||
      isMissingColumnError(query.error, 'appointment_instructions') ||
      isMissingColumnError(query.error, 'required_documents') ||
      isMissingColumnError(query.error, 'calendar_event_uid') ||
      isMissingColumnError(query.error, 'ics_generated_at') ||
      isMissingColumnError(query.error, 'external_calendar_status') ||
      isMissingColumnError(query.error, 'external_calendar_provider') ||
      isMissingColumnError(query.error, 'external_calendar_event_id') ||
      isMissingColumnError(query.error, 'completion_behavior') ||
      isMissingColumnError(query.error, 'resource_id') ||
      isMissingColumnError(query.error, 'allow_outside_business_hours'))
  ) {
    query = await client
      .from('appointments')
      .select(
        'appointment_id, transaction_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, notes, status, created_at, updated_at',
      )
      .in('transaction_id', ids)
      .order('date_time', { ascending: true })
  }

  if (query.error) {
    if (rememberMissingOptionalRelation('appointments', query.error) || isMissingSchemaError(query.error)) {
      return {}
    }
    throw query.error
  }

  const appointmentIds = (query.data || []).map((row) => row?.appointment_id).filter(Boolean)

  const participantsByAppointmentId = {}
  const rescheduleRequestsByAppointmentId = {}
  if (appointmentIds.length) {
    let participantsQuery = await client
      .from('appointment_participants')
      .select(
        'participant_id, appointment_id, name, email, phone, participant_role, rsvp_status, proposed_new_time, responded_at, created_at, updated_at',
      )
      .in('appointment_id', appointmentIds)

    if (
      participantsQuery.error &&
      (isMissingColumnError(participantsQuery.error, 'proposed_new_time') ||
        isMissingColumnError(participantsQuery.error, 'responded_at'))
    ) {
      participantsQuery = await client
        .from('appointment_participants')
        .select(
          'participant_id, appointment_id, name, email, phone, participant_role, rsvp_status, created_at, updated_at',
        )
        .in('appointment_id', appointmentIds)
    }

    if (
      participantsQuery.error &&
      !isMissingTableError(participantsQuery.error, 'appointment_participants') &&
      !isMissingSchemaError(participantsQuery.error)
    ) {
      throw participantsQuery.error
    }

    for (const participantRow of participantsQuery.data || []) {
      const normalizedParticipant = normalizeAppointmentParticipantRecordRow(participantRow)
      const targetAppointmentId = normalizedParticipant.appointmentId
      if (!targetAppointmentId) continue
      if (!participantsByAppointmentId[targetAppointmentId]) {
        participantsByAppointmentId[targetAppointmentId] = []
      }
      participantsByAppointmentId[targetAppointmentId].push(normalizedParticipant)
    }

    let rescheduleQuery = await client
      .from('appointment_reschedule_requests')
      .select(
        'id, appointment_id, requested_by, requested_by_role, reason, preferred_start, preferred_end, status, reviewed_by, reviewed_at, suggested_slots, created_at, updated_at',
      )
      .in('appointment_id', appointmentIds)
      .order('created_at', { ascending: false })

    if (rescheduleQuery.error && isMissingColumnError(rescheduleQuery.error, 'suggested_slots')) {
      rescheduleQuery = await client
        .from('appointment_reschedule_requests')
        .select(
          'id, appointment_id, requested_by, requested_by_role, reason, preferred_start, preferred_end, status, reviewed_by, reviewed_at, created_at, updated_at',
        )
        .in('appointment_id', appointmentIds)
        .order('created_at', { ascending: false })
    }

    if (
      rescheduleQuery.error &&
      !isMissingTableError(rescheduleQuery.error, 'appointment_reschedule_requests') &&
      !isMissingSchemaError(rescheduleQuery.error)
    ) {
      throw rescheduleQuery.error
    }

    for (const rescheduleRow of rescheduleQuery.data || []) {
      const normalizedRequest = normalizeAppointmentRescheduleRequestRow(rescheduleRow)
      const targetAppointmentId = normalizedRequest.appointmentId
      if (!targetAppointmentId) continue
      if (!rescheduleRequestsByAppointmentId[targetAppointmentId]) {
        rescheduleRequestsByAppointmentId[targetAppointmentId] = []
      }
      rescheduleRequestsByAppointmentId[targetAppointmentId].push(normalizedRequest)
    }
  }

  const byTransactionId = {}
  for (const row of query.data || []) {
    const normalized = normalizeAppointmentRecordRow({
      ...row,
      participants: participantsByAppointmentId[row?.appointment_id] || [],
    })
    normalized.rescheduleRequests = rescheduleRequestsByAppointmentId[row?.appointment_id] || []
    normalized.latestRescheduleRequest = normalized.rescheduleRequests[0] || null
    if (viewer === 'client' && normalized.visibility !== 'client_visible') continue
    if (!byTransactionId[normalized.transactionId]) {
      byTransactionId[normalized.transactionId] = []
    }
    byTransactionId[normalized.transactionId].push(normalized)
  }

  return byTransactionId
}

export async function persistNormalizedCompatibilityProjection(client, normalizedApplication, existingFormData = {}) {
  let baseFormData = existingFormData || {}
  if (normalizedApplication.onboardingFormDataId && Object.keys(baseFormData).length === 0) {
    const lookup = await client
      .from('onboarding_form_data')
      .select('form_data')
      .eq('id', normalizedApplication.onboardingFormDataId)
      .maybeSingle()
    if (!lookup.error && lookup.data?.form_data) {
      baseFormData = lookup.data.form_data
    } else if (lookup.error && !isPermissionDeniedError(lookup.error) && !isMissingSchemaError(lookup.error)) {
      throw lookup.error
    }
  }
  const legacy = projectNormalizedBondApplicationToLegacy({
    normalizedApplication,
    existingLegacy: baseFormData?.bond_application || {},
  })
  const projectionHash = await hashBondApplicationSnapshot(legacy)
  const formData = {
    ...(baseFormData || {}),
    bond_application: {
      ...legacy,
      _meta: {
        ...(legacy._meta || {}),
        normalized_bond_application: {
          ...(legacy._meta?.normalized_bond_application || {}),
          projection_hash: projectionHash,
        },
      },
    },
  }
  if (normalizedApplication.onboardingFormDataId) {
    const update = await client
      .from('onboarding_form_data')
      .update({ form_data: formData, updated_at: new Date().toISOString() })
      .eq('id', normalizedApplication.onboardingFormDataId)
    if (update.error && !isPermissionDeniedError(update.error)) throw update.error
  }
  await client
    .from('bond_applications')
    .update({
      compatibility_projection_version: normalizedApplication.revision || 1,
      compatibility_projection_hash: projectionHash,
      compatibility_projected_at: new Date().toISOString(),
    })
    .eq('id', normalizedApplication.id)
  return { legacy, projectionHash, formData }
}
