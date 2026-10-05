import { appointmentStartIso, calendarOperationalStatus } from '../core/appointments/attorneyCalendarModel.js'
import { getAttorneyProfessionalProfilePermissions, getCurrentUserAttorneyMembership } from '../lib/attorneyPermissions'
import { buildMatterListProgress, fetchMatterListProgress } from './attorneyMatterProgress.js'
import { fetchDashboardDevelopmentProfileImages } from '../lib/api/dashboardTransactionSummaryApi.js'
import { getFirmAttorneyAssignments } from './transactionAttorneyAssignments'
import { getAttorneyFirmById, getAttorneyFirmDepartments, getCurrentUserPrimaryAttorneyFirm } from './attorneyFirms'
import { getAttorneyFirmMembers } from './attorneyFirmMembers'
import {
  getAuthenticatedUser,
  isMissingColumnError,
  isMissingTableError,
  normalizeText,
  requireClient,
} from './attorneyFirmServiceShared'
import { getAppointmentTypeLabel, normalizeAppointmentTypeKey } from '../lib/appointmentTypeDefinitions'
import { checkAppointmentSchedulingIntegrityAsync } from '../lib/agencyPipelineService'
import { applyAppointmentTemplate } from './appointmentTemplateService'
import {
  notifyAppointmentParticipants,
  scheduleAppointmentReminders,
} from './appointmentNotificationService'
import {
  proposeAppointmentReschedule,
  resolveAppointmentRescheduleRequest,
} from './appointmentRescheduleService'
import { requireValidAttorneyInvite } from '../core/appointments/attorneyInviteContract'
import { readAttorneyAppointmentDelivery } from './attorneyAppointmentDelivery'
import {
  recordAttorneyCalendarRolloutEvent,
  requireAttorneyCalendarRollout,
} from './attorneyCalendarRolloutService'
import {
  applyAttorneyOperationsScope,
  buildAttorneyOperationsScope,
} from '../core/transactions/attorneyOperationsScope.js'
import { createPerfTimer } from '../lib/performanceTrace'
import { manageAttorneyAppointment } from './attorneyAppointmentManagement'
import {
  resolvePortalBuyerName,
  resolvePortalPropertyLabel,
  resolvePortalSellerName,
} from './portalCanonicalFieldFallbacks.js'

const MANAGEMENT_ROLES = new Set(['firm_admin', 'director_partner'])
const OPERATIONAL_WORKSPACE_CACHE_TTL_MS = 15_000
const operationalWorkspaceCache = new Map()
const operationalWorkspaceInflight = new Map()

const ATTORNEY_STAGE_LABELS = {
  instruction_received: 'Instruction Received',
  fica_onboarding: 'FICA Received',
  drafting: 'Transfer Documents Prepared',
  signing: 'Buyer/Seller Signed Documents',
  guarantees: 'Guarantees Received',
  clearances: 'Clearances In Progress',
  lodgement: 'Lodgement Submitted',
  registration_preparation: 'Registration Preparation',
  registered: 'Registration Confirmed',
}

const MAIN_STAGE_LABELS = {
  AVAIL: 'Instruction Received',
  DEP: 'FICA Received',
  OTP: 'Buyer/Seller Signed Documents',
  FIN: 'Finance In Progress',
  ATTY: 'Attorney Preparation',
  XFER: 'Transfer In Progress',
  REG: 'Registration Confirmed',
}

const ROLE_COPY = {
  transfer_attorney: 'Manage your transfer matters, signatures, lodgement steps, and client-facing updates.',
  bond_attorney: 'Manage your bond matters, bank conditions, grant documents, and bond registration progress.',
  conveyancing_secretary: 'Coordinate assigned matters, document requests, signature scheduling, and client follow-ups.',
  admin_staff: 'Track document requests, uploads, reviews, and outstanding admin actions.',
  reception_scheduling: 'Coordinate signing appointments, confirmations, and day-to-day schedule readiness.',
  candidate_attorney: 'Follow your assigned matters, complete internal tasks, and support document preparation workflows.',
  firm_admin: 'Monitor and execute operational work across the firm while retaining management visibility.',
  director_partner: 'Track leadership-level operational workload and support execution across departments.',
  attorney_conveyancer: 'Manage qualified transaction lanes assigned to you, including documents, signing, workflow, and client updates.',
}

function toLower(value) {
  return String(value || '').trim().toLowerCase()
}

function isTruthy(value) {
  return value !== null && value !== undefined && value !== ''
}

function getMatterReference(transaction = {}, fallbackId = '') {
  return (
    normalizeText(transaction.matter_number) ||
    normalizeText(transaction.transaction_reference) ||
    `MAT-${String(fallbackId || transaction.id || '').slice(0, 8).toUpperCase()}`
  )
}

function normalizeRoleLabel(value) {
  return String(value || '')
    .trim()
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (marker) => {
    const value = Math.floor(Math.random() * 16)
    return (marker === 'x' ? value : ((value & 0x3) | 0x8)).toString(16)
  })
}

function isUuidLike(value = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function buildAppointmentDateTime(date = '', startTime = '', fallback = '') {
  const explicit = normalizeText(fallback)
  if (explicit) return explicit
  const safeDate = normalizeText(date)
  const safeStart = normalizeText(startTime)
  if (!safeDate || !safeStart) return ''
  return `${safeDate}T${safeStart.length === 5 ? `${safeStart}:00` : safeStart}+02:00`
}

function deriveAttorneyInviteDateAndTimeParts(dateTimeValue = '', fallbackDate = '', fallbackStartTime = '', fallbackEndTime = '') {
  const parsed = dateTimeValue ? new Date(dateTimeValue) : null
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return {
      date: normalizeText(fallbackDate),
      startTime: normalizeText(fallbackStartTime).slice(0, 5),
      endTime: normalizeText(fallbackEndTime).slice(0, 5),
    }
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(parsed).reduce((accumulator, part) => {
    accumulator[part.type] = part.value
    return accumulator
  }, {})
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    startTime: `${parts.hour}:${parts.minute}`,
    endTime: normalizeText(fallbackEndTime).slice(0, 5),
  }
}

function mapAttorneyParticipantRowForScheduling(row = {}) {
  return {
    participantId: normalizeText(row?.participant_id),
    appointmentId: normalizeText(row?.appointment_id),
    organisationId: normalizeText(row?.organisation_id),
    name: normalizeText(row?.name),
    email: toLower(row?.email),
    participantRole: normalizeText(row?.participant_role),
    rsvpStatus: normalizeText(row?.rsvp_status || 'Pending'),
    isRequired: row?.is_required !== false,
  }
}

function buildStageLabel(transaction = {}) {
  const attorneyStage = toLower(transaction.attorney_stage)
  if (ATTORNEY_STAGE_LABELS[attorneyStage]) {
    return ATTORNEY_STAGE_LABELS[attorneyStage]
  }

  const mainStage = String(transaction.current_main_stage || '').trim().toUpperCase()
  if (MAIN_STAGE_LABELS[mainStage]) {
    return MAIN_STAGE_LABELS[mainStage]
  }

  return transaction.current_sub_stage_summary || transaction.stage || 'Unknown stage'
}

function resolveMatterType(transaction = {}, assignmentType = '') {
  const normalizedAssignmentType = toLower(assignmentType)
  if (normalizedAssignmentType === 'transfer') return 'Transfer'
  if (normalizedAssignmentType === 'bond') return 'Bond'
  if (normalizedAssignmentType === 'cancellation') return 'Cancellation'
  if (normalizedAssignmentType === 'transfer_and_bond') return 'Transfer + Bond'
  if (normalizedAssignmentType === 'transfer_bond_cancellation') return 'Transfer + Bond + Cancellation'
  if (normalizedAssignmentType === 'bond_cancellation') return 'Bond + Cancellation'
  if (normalizedAssignmentType === 'transfer_cancellation') return 'Transfer + Cancellation'

  const financeType = toLower(transaction.finance_type)
  const sellerHasExistingBond =
    transaction.seller_has_existing_bond === true ||
    toLower(transaction.seller_has_existing_bond) === 'true' ||
    toLower(transaction.seller_existing_bond) === 'true'
  if (financeType.includes('bond') || financeType.includes('hybrid') || financeType.includes('combination')) {
    return sellerHasExistingBond ? 'Transfer + Bond + Cancellation' : 'Transfer + Bond'
  }
  return sellerHasExistingBond ? 'Transfer + Cancellation' : 'Transfer'
}

function resolveMatterFlags(transaction = {}) {
  const riskStatus = toLower(transaction.risk_status)
  const operationalState = toLower(transaction.operational_state)
  const stage = toLower(transaction.stage)
  const nextAction = toLower(transaction.next_action)
  const attorneyStage = toLower(transaction.attorney_stage)

  const delayed =
    riskStatus.includes('delayed') ||
    riskStatus.includes('blocked') ||
    operationalState.includes('blocked') ||
    operationalState.includes('at_risk') ||
    stage.includes('delayed') ||
    stage.includes('blocked')

  const awaitingFica = attorneyStage === 'fica_onboarding' || nextAction.includes('fica') || nextAction.includes('client documents')

  const awaitingSignatures =
    attorneyStage === 'signing' ||
    nextAction.includes('sign') ||
    (stage.includes('otp signed') === false && nextAction.includes('otp'))

  const guaranteesOutstanding = attorneyStage === 'guarantees' || nextAction.includes('guarantee')
  const bankConditionsPending = nextAction.includes('bank condition') || nextAction.includes('bank approval')
  const lodgementPending = attorneyStage === 'lodgement' || nextAction.includes('lodgement')

  return {
    delayed,
    awaitingFica,
    awaitingSignatures,
    guaranteesOutstanding,
    bankConditionsPending,
    lodgementPending,
  }
}

function resolvePriorityOrder(priority) {
  const normalized = toLower(priority)
  if (normalized === 'high') return 0
  if (normalized === 'medium') return 1
  return 2
}

function buildPriorityLabel(raw) {
  const normalized = toLower(raw)
  if (normalized === 'high') return 'High'
  if (normalized === 'medium') return 'Medium'
  return 'Low'
}

function startOfDay(date = new Date()) {
  const cloned = new Date(date)
  cloned.setHours(0, 0, 0, 0)
  return cloned
}

function endOfDay(date = new Date()) {
  const cloned = new Date(date)
  cloned.setHours(23, 59, 59, 999)
  return cloned
}

function isDateWithinToday(value) {
  const timestamp = new Date(value || '').getTime()
  if (!Number.isFinite(timestamp)) return false
  const start = startOfDay().getTime()
  const end = endOfDay().getTime()
  return timestamp >= start && timestamp <= end
}

export async function fetchAttorneyMatterTransactions(client, ids = []) {
  const transactionIds = [...new Set((ids || []).filter(Boolean))]
  if (!transactionIds.length) return []

  const primarySelect =
    'id, organisation_id, development_id, unit_id, buyer_id, matter_number, transaction_reference, stage, current_main_stage, current_sub_stage_summary, finance_type, risk_status, operational_state, attorney_stage, next_action, next_action_due_at, updated_at, created_at, assigned_attorney_email, attorney, assigned_agent, assigned_agent_email, assigned_agent_id, bond_originator, assigned_bond_originator_email, bank, property_description, property_address_line_1, property_address_line_2, suburb, city, province, erf_number, property_image_url, thumbnail_url, cover_image_url, hero_image_url, image_url, seller_name, seller_email, seller_phone, seller_has_existing_bond, current_bond_bank, current_bond_account_number, estimated_settlement_amount, purchase_price, sales_price, expected_transfer_date, target_registration_date, registration_date, registered_at, lifecycle_state, last_meaningful_activity_at, is_active'

  let query = await client
    .from('transactions')
    .select(`${primarySelect}, routing_profile_json, listing_id, property_tenure, property_type`)
    .in('id', transactionIds)

  if (
    query.error &&
    (query.error.code === '42703' || query.error.code === 'PGRST204' || isMissingColumnError(query.error, 'current_main_stage') ||
      isMissingColumnError(query.error, 'matter_number') ||
      isMissingColumnError(query.error, 'assigned_attorney_email') ||
      isMissingColumnError(query.error, 'assigned_agent') ||
      isMissingColumnError(query.error, 'assigned_agent_email') ||
      isMissingColumnError(query.error, 'assigned_agent_id') ||
      isMissingColumnError(query.error, 'assigned_bond_originator_email') ||
      isMissingColumnError(query.error, 'bond_originator') ||
      isMissingColumnError(query.error, 'bank') ||
      isMissingColumnError(query.error, 'operational_state') ||
      isMissingColumnError(query.error, 'attorney_stage') ||
      isMissingColumnError(query.error, 'property_description') ||
      isMissingColumnError(query.error, 'property_image_url') ||
      isMissingColumnError(query.error, 'thumbnail_url') ||
      isMissingColumnError(query.error, 'cover_image_url') ||
      isMissingColumnError(query.error, 'hero_image_url') ||
      isMissingColumnError(query.error, 'image_url') ||
      isMissingColumnError(query.error, 'development_id') ||
      isMissingColumnError(query.error, 'unit_id') ||
      isMissingColumnError(query.error, 'erf_number') ||
      isMissingColumnError(query.error, 'seller_has_existing_bond') ||
      isMissingColumnError(query.error, 'current_bond_bank') ||
      isMissingColumnError(query.error, 'next_action_due_at') ||
      isMissingColumnError(query.error, 'target_registration_date') ||
      isMissingColumnError(query.error, 'last_meaningful_activity_at') ||
      isMissingColumnError(query.error, 'is_active'))
  ) {
    query = await client
      .from('transactions')
      // Optional presentation columns vary by deployment. Keep all existing
      // fields, especially unit/development/listing links and routing facts.
      .select('*')
      .in('id', transactionIds)
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'transactions')) return []
    throw query.error
  }

  return query.data || []
}

async function fetchBuyersById(client, ids = []) {
  const buyerIds = [...new Set((ids || []).filter(Boolean))]
  if (!buyerIds.length) return {}

  const query = await client.from('buyers').select('id, name, email').in('id', buyerIds)
  if (query.error) {
    if (isMissingTableError(query.error, 'buyers')) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})
}

async function fetchUnitsById(client, ids = []) {
  const unitIds = [...new Set((ids || []).filter(Boolean))]
  if (!unitIds.length) return {}

  let query = await client
    .from('units')
    .select('id, development_id, unit_number, unit_label, phase, block, status, image_url, thumbnail_url, cover_image_url')
    .in('id', unitIds)

  if (
    query.error &&
    (isMissingColumnError(query.error, 'unit_label') ||
      isMissingColumnError(query.error, 'block') ||
      isMissingColumnError(query.error, 'phase') ||
      isMissingColumnError(query.error, 'image_url') ||
      isMissingColumnError(query.error, 'thumbnail_url') ||
      isMissingColumnError(query.error, 'cover_image_url'))
  ) {
    query = await client
      .from('units')
      .select('id, development_id, unit_number, status')
      .in('id', unitIds)
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'units')) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})
}

async function fetchDevelopmentsById(client, ids = []) {
  const developmentIds = [...new Set((ids || []).filter(Boolean))]
  if (!developmentIds.length) return {}

  let query = await client
    .from('developments')
    .select('*')
    .in('id', developmentIds)

  if (
    query.error &&
    (isMissingColumnError(query.error, 'development_name') ||
      isMissingColumnError(query.error, 'code') ||
      isMissingColumnError(query.error, 'formatted_address') ||
      isMissingColumnError(query.error, 'street_address') ||
      isMissingColumnError(query.error, 'address_line_1') ||
      isMissingColumnError(query.error, 'location') ||
      isMissingColumnError(query.error, 'hero_image_url') ||
      isMissingColumnError(query.error, 'cover_image_url') ||
      isMissingColumnError(query.error, 'image_url'))
  ) {
    query = await client
      .from('developments')
      .select('id, name')
      .in('id', developmentIds)
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'developments')) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})
}

async function fetchProfilesById(client, ids = []) {
  const profileIds = [...new Set((ids || []).filter(Boolean))]
  if (!profileIds.length) return {}

  const query = await client
    .from('profiles')
    .select('id, first_name, last_name, full_name, email')
    .in('id', profileIds)

  if (query.error) {
    if (isMissingTableError(query.error, 'profiles')) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, row) => {
    const fullName =
      String(row.full_name || '').trim() ||
      [row.first_name, row.last_name].map((value) => String(value || '').trim()).filter(Boolean).join(' ').trim()

    accumulator[row.id] = {
      id: row.id,
      name: fullName || 'Team Member',
      email: toLower(row.email),
    }
    return accumulator
  }, {})
}

async function fetchChecklistItems(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return []

  const query = await client
    .from('transaction_checklist_items')
    .select('id, transaction_id, stage, label, status, priority, owner_role, owner_user_id, updated_at, created_at')
    .in('transaction_id', ids)

  if (query.error) {
    if (isMissingTableError(query.error, 'transaction_checklist_items')) {
      return []
    }
    throw query.error
  }

  return query.data || []
}

async function fetchDocumentRequests(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return []

  const query = await client
    .from('document_requests')
    .select('id, transaction_id, category, document_type, title, priority, due_date, assigned_to_role, assigned_to_user_id, status, updated_at, created_at')
    .in('transaction_id', ids)

  if (query.error) {
    if (isMissingTableError(query.error, 'document_requests')) {
      return []
    }
    throw query.error
  }

  return query.data || []
}

export function mapAttorneyAppointmentForWorkspace(appointment, matter = null, attendeesDetailed = [], rescheduleRequests = []) {
  attendeesDetailed = attendeesDetailed.map(row => ({ ...row,
    participantId: row.participantId || row.participant_id, userId: row.userId || row.user_id || null,
    participantRole: row.participantRole || row.participant_role, rsvpStatus: row.rsvpStatus || row.rsvp_status,
    isSchedulingOwner: Boolean(row.isSchedulingOwner || row.is_scheduling_owner),
  }))
  const attendees = attendeesDetailed.map((row) => row.name).filter(Boolean)
  const latestRescheduleRequest = rescheduleRequests[0] || null
  const dateTime = buildDateTimeFromAppointment(appointment)
  const appointmentTypeKey = normalizeAppointmentTypeKey(appointment.appointment_type)
  const appointmentTypeLabel = getAppointmentTypeLabel(appointmentTypeKey)
  const appointmentStatus = normalizeText(appointment.status || 'Pending Confirmation') || 'Pending Confirmation'
  return {
    id: appointment.appointment_id,
    appointmentType: appointmentTypeLabel || appointment.title || 'General consultation',
    appointmentTypeKey,
    matterReference: matter?.matterReference || getMatterReference({}, appointment.transaction_id),
    transactionId: appointment.transaction_id || null,
    organisationId: appointment.organisation_id || matter?.organisationId || null,
    clientName: matter?.clientName || 'Unassigned client',
    dateTime,
    rawDateTime: dateTime,
    appointmentDate: appointment.appointment_date || null,
    startTime: appointment.start_time || null,
    endTime: appointment.end_time || null,
    updatedAt: appointment.updated_at || null,
    delivery: appointment.delivery || null,
    calendarRevision: appointment.calendar_revision || 0,
    schedulingOwnerId: appointment.scheduling_owner_user_id || null,
    schedulingOwnerName: attendeesDetailed.find(row => row.isSchedulingOwner || row.is_scheduling_owner)?.name || null,
    title: appointment.title || null,
    cancellationReason: appointment.cancellation_reason || null,
    cancelledAt: appointment.cancelled_at || null,
    attendees,
    attendeesDetailed,
    linkedWorkflow: appointment.linked_workflow || null,
    linkedWorkflowStage: appointment.linked_workflow_stage || appointment.linked_transaction_stage || null,
    location: appointment.location || '',
    locationType: appointment.location_type || null,
    meetingUrl: appointment.meeting_url || null,
    instructions: appointment.appointment_instructions || null,
    requiredDocuments: Array.isArray(appointment.required_documents) ? appointment.required_documents : [],
    visibility: appointment.visibility_scope || 'shared_role_players',
    calendarEventUid: appointment.calendar_event_uid || null,
    externalCalendarStatus: appointment.external_calendar_status || 'not_synced',
    externalCalendarProvider: appointment.external_calendar_provider || null,
    externalCalendarEventId: appointment.external_calendar_event_id || null,
    icsGeneratedAt: appointment.ics_generated_at || null,
    resourceId: appointment.resource_id || null,
    status: appointmentStatus,
    rescheduleRequests,
    latestRescheduleRequest,
    assignedAttorneyId: matter?.assignedAttorneyId || null,
    assignedSecretaryId: matter?.assignedSecretaryId || null,
    assignedAdminHandlerId: matter?.assignedAdminHandlerId || null,
    assignedAttorneyName: matter?.assignedAttorneyName || null,
    assignedSecretaryName: matter?.assignedSecretaryName || null,
    assignedAdminHandlerName: matter?.assignedAdminHandlerName || null,
    matterType: matter?.matterType || null,
    flags: matter?.flags || {},
    actionLabel: 'Open Matter',
    actionHref: appointment.transaction_id ? `/transactions/${encodeURIComponent(appointment.transaction_id)}` : '',
  }
}

export async function fetchAttorneyWorkspaceAppointments(client, transactionIds = [], organisationId = '') {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  const scopedOrganisationId = normalizeText(organisationId)
  if (!ids.length && !scopedOrganisationId) return []

  const primarySelect = 'appointment_id, organisation_id, transaction_id, resource_id, appointment_type, title, appointment_date, start_time, end_time, date_time, scheduling_owner_user_id, attorney_delivery_enabled, attorney_attach_calendar, calendar_revision, location_type, meeting_url, location, linked_workflow, linked_workflow_stage, linked_transaction_stage, visibility_scope, appointment_instructions, required_documents, status, cancellation_reason, cancelled_at, calendar_event_uid, external_calendar_status, external_calendar_provider, external_calendar_event_id, ics_generated_at, updated_at, created_at'
  const compatibilitySelect = 'appointment_id, transaction_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, status, updated_at, created_at'

  async function readScope(internal = false) {
    const scope = (query) => internal
      ? query.eq('organisation_id', scopedOrganisationId).is('transaction_id', null)
      : query.in('transaction_id', ids)
    let query = await scope(client.from('appointments').select(primarySelect))
    if (query.error && ['attorney_delivery_enabled','attorney_attach_calendar','calendar_revision'].some(column => String(query.error.message || '').includes(column))) {
      query = await scope(client.from('appointments').select(primarySelect.replace(', attorney_delivery_enabled, attorney_attach_calendar, calendar_revision', '')))
    }
    if (query.error && isMissingColumnError(query.error, 'scheduling_owner_user_id')) {
      query = await scope(client.from('appointments').select(primarySelect.replace(', scheduling_owner_user_id', '')))
    }
    if (query.error && isMissingColumnError(query.error)) {
      // Legacy schemas cannot safely identify firm-owned internal events.
      if (internal && isMissingColumnError(query.error, 'organisation_id')) return []
      query = await scope(client.from('appointments').select(compatibilitySelect))
    }
    if (query.error) {
      if (isMissingTableError(query.error, 'appointments')) return []
      throw query.error
    }
    return (query.data || []).filter((row) => internal
      ? !row.transaction_id
      : ids.includes(row.transaction_id))
  }

  // Assigned matters retain their own agency/developer organisation. Read them
  // by authorised matter IDs; read matterless events only from the firm's org.
  const scopes = await Promise.all([
    ids.length ? readScope() : [],
    scopedOrganisationId ? readScope(true) : [],
  ])
  const appointments = [...new Map(scopes.flat().map((row) => [row.appointment_id, row])).values()]
  const managed = appointments.filter(row => row.attorney_delivery_enabled !== undefined && row.attorney_delivery_enabled !== null)
  if (managed.length) {
    const jobs = await client.from('attorney_appointment_delivery_jobs').select('appointment_id, revision, event_kind, status, next_attempt_at, sent_at, last_error').in('appointment_id', managed.map(row => row.appointment_id))
    for (const row of managed) row.delivery = readAttorneyAppointmentDelivery(row, jobs.error ? null : jobs.data)
  }
  return appointments
}

async function fetchParticipantsByAppointment(client, appointmentIds = []) {
  const ids = [...new Set((appointmentIds || []).filter(Boolean))]
  if (!ids.length) return {}

  let query = await client
    .from('appointment_participants')
    .select('appointment_id, participant_id, user_id, name, email, participant_role, rsvp_status, is_scheduling_owner')
    .in('appointment_id', ids)

  if (query.error && isMissingColumnError(query.error, 'is_scheduling_owner')) {
    query = await client.from('appointment_participants')
      .select('appointment_id, participant_id, user_id, name, email, participant_role, rsvp_status')
      .in('appointment_id', ids)
  }

  if (query.error) {
    if (isMissingTableError(query.error, 'appointment_participants')) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, row) => {
    if (!accumulator[row.appointment_id]) {
      accumulator[row.appointment_id] = []
    }
    accumulator[row.appointment_id].push({
      participantId: row.participant_id,
      userId: row.user_id || null,
      rsvpStatus: row.rsvp_status || 'Pending',
      isSchedulingOwner: Boolean(row.is_scheduling_owner),
      name: row.name,
      email: toLower(row.email),
      participantRole: row.participant_role || 'Participant',
    })
    return accumulator
  }, {})
}

async function fetchRescheduleRequestsByAppointment(client, appointmentIds = []) {
  const ids = [...new Set((appointmentIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const query = await client
    .from('appointment_reschedule_requests')
    .select('id, appointment_id, requested_by_role, reason, preferred_start, preferred_end, status, created_at, updated_at')
    .in('appointment_id', ids)
    .order('created_at', { ascending: false })

  if (query.error) {
    if (isMissingTableError(query.error, 'appointment_reschedule_requests')) {
      return {}
    }
    throw query.error
  }

  return (query.data || []).reduce((accumulator, row) => {
    const appointmentId = row?.appointment_id
    if (!appointmentId) return accumulator
    if (!accumulator[appointmentId]) {
      accumulator[appointmentId] = []
    }
    accumulator[appointmentId].push({
      id: row?.id,
      requestedByRole: row?.requested_by_role || null,
      reason: row?.reason || null,
      preferredStart: row?.preferred_start || null,
      preferredEnd: row?.preferred_end || null,
      status: row?.status || 'pending',
      createdAt: row?.created_at || null,
      updatedAt: row?.updated_at || null,
    })
    return accumulator
  }, {})
}

async function fetchPacketSigners(client, transactionIds = []) {
  const ids = [...new Set((transactionIds || []).filter(Boolean))]
  if (!ids.length) return []

  const packetQuery = await client
    .from('document_packets')
    .select('id, transaction_id, packet_type, title, status')
    .in('transaction_id', ids)

  if (packetQuery.error) {
    if (isMissingTableError(packetQuery.error, 'document_packets')) {
      return []
    }
    throw packetQuery.error
  }

  const packets = packetQuery.data || []
  const packetIds = packets.map((packet) => packet.id).filter(Boolean)
  if (!packetIds.length) return []

  const signerQuery = await client
    .from('document_packet_signers')
    .select('id, packet_id, signer_role, signer_name, signer_email, status, updated_at, created_at')
    .in('packet_id', packetIds)

  if (signerQuery.error) {
    if (isMissingTableError(signerQuery.error, 'document_packet_signers')) {
      return []
    }
    throw signerQuery.error
  }

  const packetById = packets.reduce((accumulator, packet) => {
    accumulator[packet.id] = packet
    return accumulator
  }, {})

  return (signerQuery.data || []).map((signer) => ({
    ...signer,
    packet: packetById[signer.packet_id] || null,
  }))
}

function resolveRoleSpecificKpis({ role, matters, documentQueue, appointmentQueue, priorityQueue, packetSigners, checklistItems, permissions, userContext }) {
  if (role === 'transfer_attorney') {
    return [
      {
        key: 'lodgements_pending',
        label: 'Lodgements Pending',
        value: matters.filter((matter) => matter.flags.lodgementPending).length,
      },
      {
        key: 'guarantees_outstanding',
        label: 'Guarantees Outstanding',
        value: matters.filter((matter) => matter.flags.guaranteesOutstanding).length,
      },
    ]
  }

  if (role === 'bond_attorney') {
    return [
      {
        key: 'bank_conditions_pending',
        label: 'Bank Conditions Pending',
        value: matters.filter((matter) => matter.flags.bankConditionsPending).length,
      },
      {
        key: 'grants_awaiting_signature',
        label: 'Grants Awaiting Signature',
        value: packetSigners.filter((signer) => ['pending', 'sent', 'viewed'].includes(toLower(signer.status))).length,
      },
    ]
  }

  if (role === 'admin_staff') {
    return [
      {
        key: 'documents_to_review',
        label: 'Documents To Review',
        value: documentQueue.filter((item) => toLower(item.status) === 'uploaded').length,
      },
      {
        key: 'fica_outstanding',
        label: 'FICA Outstanding',
        value: matters.filter((matter) => matter.flags.awaitingFica).length,
      },
    ]
  }

  if (role === 'reception_scheduling') {
    return [
      {
        key: 'appointments_today',
        label: 'Appointments Today',
        value: appointmentQueue.filter((item) => isDateWithinToday(item.rawDateTime)).length,
      },
      {
        key: 'confirmations_pending',
        label: 'Confirmations Pending',
        value: appointmentQueue.filter((item) => ['requested', 'proposed', 'pending confirmation', 'needs reschedule'].includes(toLower(item.status))).length,
      },
    ]
  }

  if (role === 'candidate_attorney') {
    const ownChecklist = checklistItems.filter((item) => item.owner_user_id === userContext.id)
    return [
      {
        key: 'internal_tasks',
        label: 'Internal Tasks',
        value: ownChecklist.filter((item) => ['pending', 'in_progress', 'blocked'].includes(toLower(item.status))).length,
      },
      {
        key: 'priority_actions',
        label: 'Priority Actions',
        value: priorityQueue.filter((item) => item.priority === 'High').length,
      },
    ]
  }

  if (permissions.can_view_firm_dashboard) {
    return [
      {
        key: 'firm_wide_priority',
        label: 'High Priority Items',
        value: priorityQueue.filter((item) => item.priority === 'High').length,
      },
      {
        key: 'pending_signers',
        label: 'Pending Signers',
        value: packetSigners.filter((signer) => ['pending', 'sent', 'viewed'].includes(toLower(signer.status))).length,
      },
    ]
  }

  return []
}

function buildQueuePriority({ dueDate = null, isBlocked = false, isOverdue = false, pending = false }) {
  if (isBlocked || isOverdue) return 'High'
  if (pending || dueDate) return 'Medium'
  return 'Low'
}

function buildDateTimeFromAppointment(appointment = {}) {
  return appointmentStartIso(appointment)
}

function getOperationalWorkspaceCacheKey(firmId = '', userId = '') {
  return `${normalizeText(firmId) || 'no-firm'}:${normalizeText(userId) || 'current-user'}`
}

function buildScopedAuthUser(userId = '', authUser = null) {
  if (authUser?.id) return authUser
  const id = normalizeText(userId)
  return id ? { id, email: '', user_metadata: {} } : null
}

export function clearAttorneyOperationalWorkspaceCache({ firmId = '', userId = '' } = {}) {
  if (!firmId && !userId) {
    operationalWorkspaceCache.clear()
    operationalWorkspaceInflight.clear()
    return
  }

  const firmKey = normalizeText(firmId)
  const userKey = normalizeText(userId)
  for (const key of [...operationalWorkspaceCache.keys(), ...operationalWorkspaceInflight.keys()]) {
    const [cachedFirmId, cachedUserId] = key.split(':')
    if (firmKey && cachedFirmId !== firmKey) continue
    if (userKey && cachedUserId !== userKey) continue
    operationalWorkspaceCache.delete(key)
    operationalWorkspaceInflight.delete(key)
  }
}

export async function getAttorneyOperationalWorkspaceData(firmId = null, userId = null, options = {}) {
  const client = requireClient()
  const timer = createPerfTimer('attorney.service.operations', {
    firmId: normalizeText(firmId) || null,
    userId: normalizeText(userId || options.userId) || null,
    force: Boolean(options?.force),
  })
  const providedUserId = normalizeText(userId || options.userId)
  const authUser = options.authUser || buildScopedAuthUser(providedUserId) || await getAuthenticatedUser(client)
  const resolvedFirm = options.resolvedFirm || (firmId ? await getAttorneyFirmById(firmId) : await getCurrentUserPrimaryAttorneyFirm())
  const currentUserId = providedUserId || authUser.id
  const cacheKey = getOperationalWorkspaceCacheKey(resolvedFirm?.id, currentUserId)
  timer.mark('context:resolved', {
    firmId: resolvedFirm?.id || null,
    userId: currentUserId || null,
    usedProvidedUser: Boolean(providedUserId),
  })

  if (!options?.force) {
    const cached = operationalWorkspaceCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      timer.end({ outcome: 'cache-hit' })
      return cached.data
    }
    const inflight = operationalWorkspaceInflight.get(cacheKey)
    if (inflight) {
      timer.end({ outcome: 'inflight-hit' })
      return inflight
    }
  }

  const loadPromise = loadAttorneyOperationalWorkspaceData(firmId, userId, {
    client,
    authUser,
    resolvedFirm,
    currentUserId,
    timer,
  })
    .then((data) => {
      if (operationalWorkspaceInflight.get(cacheKey) === loadPromise) {
        operationalWorkspaceCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + OPERATIONAL_WORKSPACE_CACHE_TTL_MS,
        })
      }
      timer.end({
        outcome: 'loaded',
        matters: data?.matterQueue?.length || 0,
        documents: data?.documentQueue?.length || 0,
        appointments: data?.appointmentQueue?.length || 0,
      })
      return data
    })
    .catch((error) => {
      timer.end({ outcome: 'failed', message: error?.message || null })
      throw error
    })
    .finally(() => {
      if (operationalWorkspaceInflight.get(cacheKey) === loadPromise) {
        operationalWorkspaceInflight.delete(cacheKey)
      }
    })

  operationalWorkspaceInflight.set(cacheKey, loadPromise)
  return loadPromise
}

async function loadAttorneyOperationalWorkspaceData(firmId = null, userId = null, context = {}) {
  const client = context.client || requireClient()
  const timer = context.timer || createPerfTimer('attorney.service.operations.load', {
    firmId: normalizeText(firmId) || null,
    userId: normalizeText(context.currentUserId || userId) || null,
  })
  const providedUserId = normalizeText(context.currentUserId || userId)
  const authUser = context.authUser || buildScopedAuthUser(providedUserId) || await getAuthenticatedUser(client)
  const currentUserId = providedUserId || authUser.id

  const resolvedFirm = context.resolvedFirm || (firmId ? await getAttorneyFirmById(firmId) : await getCurrentUserPrimaryAttorneyFirm())
  timer.mark('firm:resolved', {
    firmId: resolvedFirm?.id || null,
  })

  if (!resolvedFirm?.id) {
    return {
      firm: null,
      currentUser: null,
      permissions: {},
      kpis: {
        myActiveMatters: 0,
        tasksDueToday: 0,
        outstandingDocuments: 0,
        pendingSignatures: 0,
        delayedMatters: 0,
        upcomingAppointments: 0,
        transferMatters: 0,
        bondMatters: 0,
        roleSpecific: [],
      },
      priorityQueue: [],
      matterQueue: [],
      documentQueue: [],
      appointmentQueue: [],
      recentUpdates: [],
      accessBlocked: false,
      availableFilters: {
        departments: [],
        members: [],
        matterTypes: ['Transfer', 'Bond', 'Transfer + Bond', 'Admin'],
        statuses: [],
      },
    }
  }

  const currentMembership = await getCurrentUserAttorneyMembership(resolvedFirm.id, currentUserId).catch(() => null)
  timer.mark('membership:resolved', {
    status: currentMembership?.status || null,
    active: Boolean(currentMembership?.isActive),
  })
  if (!currentMembership?.isActive) {
    return {
      firm: null,
      currentUser: {
        id: currentUserId,
        name: authUser.user_metadata?.full_name || authUser.email || 'Attorney User',
        email: authUser.email || '',
        role: '',
        roleLabel: '',
        department: 'Unassigned Department',
        roleCopy: 'An active attorney firm membership is required.',
        status: currentMembership?.status || 'missing',
      },
      permissions: getAttorneyProfessionalProfilePermissions({}),
      kpis: {
        myActiveMatters: 0,
        tasksDueToday: 0,
        outstandingDocuments: 0,
        pendingSignatures: 0,
        delayedMatters: 0,
        upcomingAppointments: 0,
        transferMatters: 0,
        bondMatters: 0,
        roleSpecific: [],
      },
      priorityQueue: [],
      matterQueue: [],
      documentQueue: [],
      appointmentQueue: [],
      recentUpdates: [],
      accessBlocked: true,
      canViewFirmDashboard: false,
      availableFilters: {
        departments: [],
        members: [],
        matterTypes: ['Transfer', 'Bond', 'Transfer + Bond', 'Admin'],
        statuses: [],
      },
    }
  }

  const [departments, members] = await Promise.all([
    getAttorneyFirmDepartments(resolvedFirm.id).catch(() => []),
    getAttorneyFirmMembers(resolvedFirm.id).catch(() => []),
  ])
  timer.mark('firmDirectory:loaded', {
    departments: departments?.length || 0,
    members: members?.length || 0,
  })

  const listedMembership = (members || []).find((member) => member.userId === currentUserId) || null
  const resolvedCurrentMembership = listedMembership?.isActive ? listedMembership : currentMembership
  const membersWithCurrent = resolvedCurrentMembership && !(members || []).some((member) => member.userId === currentUserId)
    ? [...(members || []), resolvedCurrentMembership]
    : (members || [])
  const activeMembers = membersWithCurrent.filter((member) => !['suspended', 'removed'].includes(toLower(member.status)))

  const allProfileIds = [...new Set(activeMembers.map((member) => member.userId).filter(Boolean))]
  const profilesById = await fetchProfilesById(client, allProfileIds)
  timer.mark('profiles:loaded', {
    profiles: Object.keys(profilesById || {}).length,
  })

  const currentProfile = profilesById[currentUserId] || {
    id: currentUserId,
    name: authUser.user_metadata?.full_name || authUser.email || 'Attorney User',
    email: toLower(authUser.email),
  }

  const currentRole = resolvedCurrentMembership?.professionalRole || ''
  const permissions = getAttorneyProfessionalProfilePermissions(resolvedCurrentMembership)
  const operationsScope = buildAttorneyOperationsScope({
    currentUser: {
      role: currentRole,
      professionalRole: resolvedCurrentMembership?.professionalRole || currentRole,
      practiceQualifications: resolvedCurrentMembership?.practiceQualifications || [],
    },
    permissions,
  })

  const departmentById = (departments || []).reduce((accumulator, department) => {
    accumulator[department.id] = department
    return accumulator
  }, {})

  const currentDepartment = resolvedCurrentMembership?.departmentId ? departmentById[resolvedCurrentMembership.departmentId] : null

  // Assignment SELECT is team-scoped in the database: everyone in the firm
  // sees unallocated intake, while allocated matters reach only the team and
  // principals. A user-id filter here would hide unallocated work entirely.
  const assignments = resolvedCurrentMembership?.isActive
    ? await getFirmAttorneyAssignments(resolvedFirm.id)
    : []
  timer.mark('assignments:loaded', {
    assignments: assignments?.length || 0,
    scope: 'matter_team',
  })

  const relevantAssignments = assignments.filter((assignment) => ['pending', 'active', 'paused'].includes(toLower(assignment.status)))

  const transactionIds = [...new Set(relevantAssignments.map((assignment) => assignment.transactionId).filter(Boolean))]
  const transactions = await fetchAttorneyMatterTransactions(client, transactionIds)
  timer.mark('transactions:loaded', {
    transactionIds: transactionIds.length,
    transactions: transactions.length,
  })
  const transactionsById = transactions.reduce((accumulator, row) => {
    accumulator[row.id] = row
    return accumulator
  }, {})

  const unitIds = [...new Set(transactions.map((transaction) => transaction.unit_id).filter(Boolean))]
  const transactionDevelopmentIds = [...new Set(transactions.map((transaction) => transaction.development_id).filter(Boolean))]
  const unitsById = await fetchUnitsById(client, unitIds)
  const developmentIds = [
    ...new Set([
      ...transactionDevelopmentIds,
      ...Object.values(unitsById).map((unit) => unit.development_id).filter(Boolean),
    ]),
  ]
  const listingIds = [...new Set(transactions.map(t => t.listing_id).filter(Boolean))]
  const [developmentsById, matterProgress, listingResult, developmentImages] = await Promise.all([
    fetchDevelopmentsById(client, developmentIds),
    fetchMatterListProgress(client, transactions),
    listingIds.length ? client.from('private_listings').select('*').in('id', listingIds) : { data: [] },
    fetchDashboardDevelopmentProfileImages(client, developmentIds),
  ])
  if (listingResult.error) throw listingResult.error
  const listingsById = new Map((listingResult.data || []).map(row => [row.id, row]))
  timer.mark('propertyContext:loaded', {
    units: Object.keys(unitsById || {}).length,
    developments: Object.keys(developmentsById || {}).length,
  })

  const [buyersById, checklistItems, documentRequests, appointments, packetSigners] = await Promise.all([
    fetchBuyersById(client, transactions.map((transaction) => transaction.buyer_id).filter(Boolean)),
    fetchChecklistItems(client, transactionIds),
    fetchDocumentRequests(client, transactionIds),
    fetchAttorneyWorkspaceAppointments(client, transactionIds, resolvedFirm.organisationId),
    fetchPacketSigners(client, transactionIds),
  ])
  timer.mark('matterDependencies:loaded', {
    buyers: Object.keys(buyersById || {}).length,
    checklistItems: checklistItems?.length || 0,
    documentRequests: documentRequests?.length || 0,
    appointments: appointments?.length || 0,
    packetSigners: packetSigners?.length || 0,
  })

  const participantsByAppointment = await fetchParticipantsByAppointment(
    client,
    appointments.map((appointment) => appointment.appointment_id).filter(Boolean),
  )
  const rescheduleRequestsByAppointment = await fetchRescheduleRequestsByAppointment(
    client,
    appointments.map((appointment) => appointment.appointment_id).filter(Boolean),
  )
  timer.mark('appointmentDependencies:loaded', {
    participantGroups: Object.keys(participantsByAppointment || {}).length,
    rescheduleGroups: Object.keys(rescheduleRequestsByAppointment || {}).length,
  })

  const allMatterQueue = relevantAssignments
    .map((assignment) => {
      const transaction = transactionsById[assignment.transactionId]
      if (!transaction) return null
      if (transaction.is_active === false) return null

      const unit = unitsById[transaction.unit_id] || null
      const development = developmentsById[transaction.development_id || unit?.development_id] || null
      const flags = resolveMatterFlags(transaction)
      const progressContext = matterProgress.get(transaction.id)
      const laneKey = assignment.assignmentType === 'bond' ? 'bond' : assignment.assignmentType === 'cancellation' ? 'cancellation' : 'transfer'
      const matchingLanes = (progressContext?.lanes || []).filter(lane => lane.process_type === laneKey || (laneKey === 'transfer' && lane.process_type === 'attorney'))
      const lane = matchingLanes.find(item => item.attorney_assignment_id === assignment.id) || matchingLanes.find(item => !item.attorney_assignment_id)
      const workflowProgress = buildMatterListProgress(transaction, laneKey, lane, progressContext?.steps.get(lane?.id) || [])
      // Do not interpret "upload the signed OTP" as an outstanding signature.
      const waitingTask = workflowProgress.status === 'waiting' ? workflowProgress.taskKey : ''
      flags.awaitingSignatures = Boolean(waitingTask && /sign/.test(waitingTask))
      flags.awaitingFica = Boolean(waitingTask && /fica/.test(waitingTask))
      flags.guaranteesOutstanding = Boolean(waitingTask && /guarantee/.test(waitingTask))
      flags.bankConditionsPending = waitingTask === 'bank_conditions_outstanding'
      flags.delayed = workflowProgress.status === 'blocked' || ['blocked', 'delayed'].includes(toLower(transaction.risk_status))
      const matterType = resolveMatterType(transaction, assignment.assignmentType)
      const status = flags.delayed
        ? 'Needs Attention'
        : flags.awaitingSignatures
          ? 'Awaiting Signature'
          : flags.awaitingFica
            ? 'Awaiting FICA'
            : 'On Track'

      const identityRow = {
        ...transaction,
        transaction,
        buyer: buyersById[transaction.buyer_id],
        unit,
        development,
        listing: listingsById.get(transaction.listing_id),
      }
      const clientName = resolvePortalBuyerName(identityRow, {
        fallback: buyersById[transaction.buyer_id]?.email || `Buyer ${String(transaction.buyer_id || '').slice(0, 8)}`,
      })

      const assignmentRole =
        assignment.primaryAttorneyId === currentUserId
          ? 'Primary Attorney'
          : assignment.secretaryId === currentUserId
            ? 'Secretary'
            : assignment.adminHandlerId === currentUserId
              ? 'Admin Handler'
              : normalizeRoleLabel(currentRole)

      return {
        assignmentId: assignment.id,
        matterId: transaction.id,
        organisationId: transaction.organisation_id || null,
        developmentId: transaction.development_id || unit?.development_id || null,
        unitId: transaction.unit_id || null,
        matterReference: getMatterReference(transaction, transaction.id),
        clientName,
        buyerName: clientName,
        sellerName: resolvePortalSellerName(identityRow, { fallback: transaction.seller_email || 'Seller pending' }),
        propertyLabel: resolvePortalPropertyLabel(identityRow, {
          fallback: unit?.unit_number ? `Unit ${unit.unit_number}` : 'Property pending',
        }),
        propertyAddress: [transaction.property_address_line_1, transaction.property_address_line_2].filter(Boolean).join(', ') || transaction.property_description || '',
        propertySuburb: transaction.suburb || '',
        propertyCity: transaction.city || '',
        propertyImageUrl:
          transaction.property_image_url ||
          transaction.thumbnail_url ||
          transaction.cover_image_url ||
          transaction.hero_image_url ||
          transaction.image_url ||
          unit?.image_url ||
          unit?.thumbnail_url ||
          unit?.cover_image_url ||
          developmentImages.get(transaction.development_id || unit?.development_id) ||
          development?.hero_image_url ||
          development?.cover_image_url ||
          development?.image_url ||
          '',
        developmentName: transaction.development_name || development?.development_name || development?.name || 'Standalone matter',
        unitNumber: unit?.unit_label || unit?.unit_number || '',
        phase: unit?.phase || unit?.block || '',
        erfNumber: transaction.erf_number || '',
        financeType: transaction.finance_type || 'cash',
        purchasePrice: Number(transaction.purchase_price || transaction.sales_price || 0),
        sellerHasExistingBond:
          transaction.seller_has_existing_bond === true ||
          toLower(transaction.seller_has_existing_bond) === 'true' ||
          toLower(transaction.seller_existing_bond) === 'true',
        currentBondBank: transaction.current_bond_bank || '',
        estimatedSettlementAmount: Number(transaction.estimated_settlement_amount || 0),
        expectedRegistrationDate: transaction.target_registration_date || transaction.expected_transfer_date || transaction.registration_date || transaction.registered_at || null,
        expectedLodgementDate: transaction.expected_lodgement_date || transaction.expected_lodgement_at || null,
        nextActionDueAt: transaction.next_action_due_at || null,
        registrationDate: transaction.registration_date || transaction.registered_at || null,
        lifecycleState: transaction.lifecycle_state || null,
        matterType,
        workflowProgress,
        currentStage: workflowProgress.label,
        nextAction: workflowProgress.nextAction,
        assignedRole: assignmentRole,
        assignedUserId: assignment.primaryAttorneyId || null,
        assignedAttorneyId: assignment.primaryAttorneyId || null,
        assignedSecretaryId: assignment.secretaryId || null,
        assignedAdminHandlerId: assignment.adminHandlerId || null,
        assignedAttorneyName: assignment.primaryAttorney?.name || assignment.firm?.name || null,
        assignedFirmName: assignment.firm?.name || resolvedFirm.name || transaction.attorney || '',
        assignedSecretaryName: assignment.secretary?.name || null,
        assignedAdminHandlerName: assignment.adminHandler?.name || null,
        assignedAgentId: transaction.assigned_agent_id || null,
        assignedAgentName: transaction.assigned_agent || transaction.assigned_agent_email || '',
        assignedAgentEmail: transaction.assigned_agent_email || '',
        bondOriginatorName: transaction.bond_originator || transaction.assigned_bond_originator_email || '',
        assignedBondOriginatorEmail: transaction.assigned_bond_originator_email || '',
        bank: transaction.bank || transaction.current_bond_bank || '',
        assignedDepartmentId: assignment.departmentId || null,
        createdAt: transaction.created_at || null,
        lastUpdated: transaction.updated_at || transaction.created_at || null,
        lastMeaningfulActivityAt: transaction.last_meaningful_activity_at || transaction.updated_at || transaction.created_at || null,
        status,
        flags,
        actionLabel: 'Open Matter',
        actionHref: `/transactions/${encodeURIComponent(transaction.id)}`,
      }
    })
    .filter(Boolean)
  const matterQueue = applyAttorneyOperationsScope(allMatterQueue, operationsScope)
  const scopedMatterIds = new Set(matterQueue.map((matter) => matter.matterId).filter(Boolean))
  const scopedRelevantAssignments = relevantAssignments.filter((assignment) => scopedMatterIds.has(assignment.transactionId))
  const scopedChecklistItems = (checklistItems || []).filter((item) => scopedMatterIds.has(item.transaction_id))
  const scopedPacketSigners = (packetSigners || []).filter((signer) => scopedMatterIds.has(signer.packet?.transaction_id))

  const canAccessDocumentQueue =
    permissions.can_request_documents || permissions.can_review_documents || permissions.can_upload_documents

  const documentQueue = canAccessDocumentQueue
    ? (documentRequests || [])
        .filter((request) => scopedMatterIds.has(request.transaction_id))
        .map((request) => {
          const matter = matterQueue.find((item) => item.matterId === request.transaction_id)
          return {
            id: request.id,
            matterReference: matter?.matterReference || getMatterReference({}, request.transaction_id),
            clientName: matter?.clientName || 'Unassigned client',
            documentType: request.document_type || request.title || request.category || 'Document',
            status: normalizeText(request.status || 'requested') || 'requested',
            requestedFrom: request.assigned_to_role || 'client',
            lastUpdated: request.updated_at || request.created_at || null,
            dueDate: request.due_date || null,
            priority: request.priority || 'required',
            actionLabel: 'Open Matter',
            actionHref: request.transaction_id ? `/transactions/${encodeURIComponent(request.transaction_id)}` : '',
            transactionId: request.transaction_id,
          }
        })
    : []

  const canAccessAppointments = permissions.can_manage_signing_appointments

  const appointmentQueue = canAccessAppointments
    ? (appointments || [])
        .filter((appointment) => !appointment.transaction_id || scopedMatterIds.has(appointment.transaction_id))
        .map((appointment) => mapAttorneyAppointmentForWorkspace(
          appointment,
          matterQueue.find((item) => item.matterId === appointment.transaction_id),
          participantsByAppointment[appointment.appointment_id] || [],
          rescheduleRequestsByAppointment[appointment.appointment_id] || [],
        ))
    : []

  const pendingSignerStatuses = new Set(['pending', 'sent', 'viewed'])
  const pendingSignaturesCount = scopedPacketSigners.filter((signer) => pendingSignerStatuses.has(toLower(signer.status))).length

  const checklistTaskCount = scopedChecklistItems.filter((item) => {
    const pending = ['pending', 'in_progress', 'blocked'].includes(toLower(item.status))
    if (!pending) return false
    if (permissions.can_view_all_firm_matters || MANAGEMENT_ROLES.has(currentRole)) return true
    return item.owner_user_id === currentUserId || !item.owner_user_id
  }).length

  const tasksDueToday =
    documentQueue.filter((item) => item.dueDate && isDateWithinToday(item.dueDate)).length +
    appointmentQueue.filter((item) => isDateWithinToday(item.rawDateTime)).length +
    checklistTaskCount

  const outstandingDocuments = documentQueue.filter((item) => ['requested', 'uploaded', 'rejected'].includes(toLower(item.status))).length
  const delayedMatters = matterQueue.filter((item) => item.flags?.delayed).length

  const upcomingAppointments = appointmentQueue.filter((item) => {
    const status = toLower(item.status)
    if (['completed', 'cancelled'].includes(status)) return false
    const timestamp = new Date(item.rawDateTime || '').getTime()
    return Number.isFinite(timestamp) && timestamp >= Date.now()
  }).length

  const priorityQueue = []

  matterQueue.forEach((matter) => {
    if (matter.flags?.delayed || matter.flags?.awaitingFica || matter.flags?.awaitingSignatures || matter.flags?.guaranteesOutstanding || matter.flags?.bankConditionsPending) {
      const issue = matter.flags?.delayed
        ? 'Matter stalled or delayed'
        : matter.flags?.awaitingFica
          ? 'Missing FICA documentation'
          : matter.flags?.awaitingSignatures
            ? 'Signature action pending'
            : matter.flags?.guaranteesOutstanding
              ? 'Guarantee outstanding'
              : 'Bank condition pending'

      priorityQueue.push({
        id: `matter-${matter.assignmentId || matter.matterId}`,
        priority: buildPriorityLabel(
          buildQueuePriority({
            isBlocked: matter.flags?.delayed,
            pending: true,
          }),
        ),
        matterReference: matter.matterReference,
        clientName: matter.clientName,
        issue,
        dueDate: matter.lastUpdated,
        assignedRole: matter.assignedRole,
        actionLabel: 'Open Matter',
        actionHref: matter.actionHref,
      })
    }
  })

  documentQueue.forEach((documentItem) => {
    if (!['requested', 'uploaded', 'rejected'].includes(toLower(documentItem.status))) return

    const isRejected = toLower(documentItem.status) === 'rejected'
    const dueDate = documentItem.dueDate || null
    const isOverdue = dueDate ? new Date(dueDate).getTime() < Date.now() : false

    priorityQueue.push({
      id: `document-${documentItem.id}`,
      priority: buildPriorityLabel(
        buildQueuePriority({ isBlocked: isRejected, isOverdue, dueDate, pending: true }),
      ),
      matterReference: documentItem.matterReference,
      clientName: documentItem.clientName,
      issue: isRejected ? 'Document rejected and requires follow-up' : 'Outstanding document action',
      dueDate,
      assignedRole: normalizeRoleLabel(currentRole),
      actionLabel: 'Open Matter',
      actionHref: documentItem.actionHref,
    })
  })

  appointmentQueue.forEach((appointmentItem) => {
    const normalizedStatus = toLower(appointmentItem.status)
    if (!['pending confirmation', 'needs reschedule', 'reschedule requested', 'requested', 'proposed'].includes(normalizedStatus)) return

    priorityQueue.push({
      id: `appointment-${appointmentItem.id}`,
      priority: buildPriorityLabel(
        buildQueuePriority({
          isBlocked: normalizedStatus === 'needs reschedule' || normalizedStatus === 'reschedule requested',
          pending: true,
          dueDate: appointmentItem.rawDateTime,
        }),
      ),
      matterReference: appointmentItem.matterReference,
      clientName: appointmentItem.clientName,
      issue: normalizedStatus === 'needs reschedule' || normalizedStatus === 'reschedule requested'
        ? 'Appointment needs reschedule'
        : 'Appointment confirmation needed',
      dueDate: appointmentItem.rawDateTime,
      assignedRole: normalizeRoleLabel(currentRole),
      actionLabel: 'Open Matter',
      actionHref: appointmentItem.actionHref,
    })
  })

  const dedupedPriorityQueue = Object.values(
    priorityQueue.reduce((accumulator, item) => {
      if (!accumulator[item.id]) {
        accumulator[item.id] = item
      }
      return accumulator
    }, {}),
  )
    .sort((a, b) => {
      const priorityDiff = resolvePriorityOrder(a.priority) - resolvePriorityOrder(b.priority)
      if (priorityDiff !== 0) return priorityDiff
      return new Date(b.dueDate || 0).getTime() - new Date(a.dueDate || 0).getTime()
    })
    .slice(0, 30)

  const recentUpdates = [
    ...priorityQueue.slice(0, 8).map((item) => ({
      id: `priority-update-${item.id}`,
      message: `${item.issue} on ${item.matterReference}.`,
      occurredAt: item.dueDate || null,
      source: 'System',
    })),
    ...appointmentQueue.slice(0, 6).map((item) => ({
      id: `appointment-update-${item.id}`,
      message: `${item.appointmentType} appointment is ${item.status.toLowerCase()}.`,
      occurredAt: item.rawDateTime || null,
      source: 'Scheduling',
    })),
    ...scopedRelevantAssignments.slice(0, 6).map((assignment) => ({
      id: `assignment-update-${assignment.id}`,
      message: `${normalizeRoleLabel(assignment.assignmentType)} assignment is ${assignment.status}.`,
      occurredAt: assignment.updatedAt || assignment.assignedAt || assignment.createdAt,
      source: 'Assignment',
    })),
  ]
    .filter((item) => isTruthy(item.occurredAt))
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 12)

  const roleSpecific = resolveRoleSpecificKpis({
    role: currentRole,
    matters: matterQueue,
    documentQueue,
    appointmentQueue,
    priorityQueue: dedupedPriorityQueue,
    packetSigners: scopedPacketSigners,
    checklistItems: scopedChecklistItems,
    permissions,
    userContext: currentProfile,
  })

  const transferMatterCount = matterQueue.filter((matter) => ['Transfer', 'Transfer + Bond'].includes(matter.matterType)).length
  const bondMatterCount = matterQueue.filter((matter) => ['Bond', 'Transfer + Bond'].includes(matter.matterType)).length
  const visibleDepartments = operationsScope.canViewAllOperationalQueues
    ? departments || []
    : (departments || []).filter((department) => department.id === resolvedCurrentMembership?.departmentId)
  const visibleMembers = operationsScope.canViewAllOperationalQueues
    ? activeMembers
    : activeMembers.filter((member) => member.userId === currentUserId)
  const availableMatterTypes = [...new Set(matterQueue.map((matter) => matter.matterType).filter(Boolean))]

  return {
    firm: {
      id: resolvedFirm.id,
      organisationId: resolvedFirm.organisationId || null,
      name: resolvedFirm.name,
      logo_url: resolvedFirm.logoUrl || '',
      primary_colour: resolvedFirm.primaryColour || '',
      secondary_colour: resolvedFirm.secondaryColour || '',
    },
    currentUser: {
      id: currentUserId,
      name: currentProfile.name,
      email: currentProfile.email,
      role: currentRole,
      roleLabel: normalizeRoleLabel(currentRole),
      practiceQualifications: resolvedCurrentMembership?.practiceQualifications || [],
      department: currentDepartment?.name || 'Unassigned Department',
      roleCopy: ROLE_COPY[currentRole] || 'Your assigned matters, document tasks, and signing actions in one place.',
      status: resolvedCurrentMembership?.status || 'unknown',
    },
    permissions,
    scope: operationsScope,
    kpis: {
      myActiveMatters: matterQueue.length,
      transferMatters: transferMatterCount,
      bondMatters: bondMatterCount,
      tasksDueToday,
      outstandingDocuments,
      pendingSignatures: pendingSignaturesCount,
      delayedMatters,
      upcomingAppointments,
      roleSpecific,
    },
    priorityQueue: dedupedPriorityQueue,
    matterQueue,
    documentQueue,
    appointmentQueue,
    recentUpdates,
    accessBlocked: false,
    canViewFirmDashboard: Boolean(permissions.can_view_firm_dashboard),
    availableFilters: {
      departments: visibleDepartments
        .filter((department) => department.isActive)
        .map((department) => ({ value: department.id, label: department.name, type: department.departmentType })),
      members: visibleMembers.map((member) => ({
        value: member.userId,
        label: profilesById[member.userId]?.name || 'Team Member',
        email: profilesById[member.userId]?.email || '',
        role: member.role,
      })),
      matterTypes: availableMatterTypes,
      statuses: [...new Set(matterQueue.map((matter) => matter.status).filter(Boolean))],
    },
  }
}

function normalizeAppointmentOperationalStatus(value = '') {
  const normalized = toLower(value)
  if (normalized.includes('progress')) return 'in_progress'
  if (['ready','draft'].includes(normalized)) return normalized
  return calendarOperationalStatus({ status: value })
}

function mapOperationalToDbStatus(value = '') {
  const normalized = normalizeAppointmentOperationalStatus(value)
  if (normalized === 'cancelled') return 'Cancelled'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'confirmed') return 'Confirmed'
  if (normalized === 'reschedule_requested') return 'Reschedule Requested'
  if (normalized === 'in_progress') return 'Confirmed'
  if (normalized === 'ready') return 'Confirmed'
  if (normalized === 'blocked') return 'Needs Reschedule'
  if (normalized === 'draft') return 'Draft'
  return 'Pending Confirmation'
}

export async function updateAttorneyAppointmentOperationalStatus(appointmentId, operationalStatus, options = {}) {
  const client = requireClient()
  const scopedAppointmentId = normalizeText(appointmentId)
  if (!scopedAppointmentId) {
    throw new Error('Appointment is required.')
  }

  const status = mapOperationalToDbStatus(operationalStatus)
  if (status === 'Completed' || status === 'Cancelled') {
    const saved = await manageAttorneyWorkspaceAppointment(scopedAppointmentId,
      status === 'Completed' ? 'complete' : 'cancel', options.expectedUpdatedAt, { reason: options.reason })
    return { ...saved, status, operationalStatus: normalizeAppointmentOperationalStatus(status) }
  }
  const nowIso = new Date().toISOString()
  const updatePayload = {
    status,
    updated_at: nowIso,
  }

  const update = await client
    .from('appointments')
    .update(updatePayload)
    .eq('appointment_id', scopedAppointmentId)
    .select('appointment_id, transaction_id, status, visibility_scope, attorney_delivery_enabled')
    .maybeSingle()

  if (update.error) throw update.error

  const appointment = update.data || null
  if (!appointment) {
    throw new Error('Appointment could not be updated.')
  }

  if (status === 'Confirmed' && appointment.attorney_delivery_enabled == null) {
    await notifyAppointmentParticipants(scopedAppointmentId, 'appointment_confirmed', {
      visibility: appointment.visibility_scope || 'shared_role_players',
      metadata: {
        source: 'updateAttorneyAppointmentOperationalStatus',
        actorRole: normalizeText(options?.actorRole || 'attorney'),
      },
    }).catch(() => null)
    await scheduleAppointmentReminders(scopedAppointmentId).catch(() => null)
  }

  return {
    appointmentId: appointment.appointment_id,
    transactionId: appointment.transaction_id || null,
    status,
    operationalStatus: normalizeAppointmentOperationalStatus(status),
  }
}

export async function manageAttorneyWorkspaceAppointment(appointmentId, action, expectedUpdatedAt, changes = {}) {
  const saved = await manageAttorneyAppointment(appointmentId, action, expectedUpdatedAt, changes)
  operationalWorkspaceCache.clear()
  operationalWorkspaceInflight.clear()
  return saved
}

export async function assignAttorneyAppointmentResource(appointmentId, resourceId = null, options = {}) {
  return manageAttorneyWorkspaceAppointment(appointmentId, 'resource', options.expectedUpdatedAt, { resourceId })
}

export async function createAttorneyAppointmentInvite(input = {}) {
  const invite = requireValidAttorneyInvite(input)
  const client = requireClient()
  const organisationId = invite.organisationId
  const transactionId = invite.transactionId
  const appointmentType = normalizeAppointmentTypeKey(invite.appointmentType)
  const templated = applyAppointmentTemplate(appointmentType, invite)
  const appointmentDate = normalizeText(templated.date || invite.date)
  const startTime = normalizeText(templated.startTime || invite.startTime)
  const endTime = normalizeText(templated.endTime || invite.endTime)
  const dateTime = buildAppointmentDateTime(appointmentDate, startTime, templated.dateTime || invite.dateTime)
  const recipientEmail = invite.recipientEmail
  const recipientName = invite.recipientName || recipientEmail

  await requireAttorneyCalendarRollout(organisationId, { client })
  void recordAttorneyCalendarRolloutEvent('invite_attempted', {
    organisationId,
    transactionId,
    metadata: { appointmentType },
  }, { client }).catch(() => {})

  const user = await getAuthenticatedUser(client).catch(() => null)
  const appointmentId = createUuid()
  const nowIso = new Date().toISOString()
  const visibility = normalizeText(templated.visibility || invite.visibility || 'client_visible') || 'client_visible'
  const insertPayload = {
    appointment_id: appointmentId,
    organisation_id: organisationId,
    transaction_id: transactionId,
    appointment_type: appointmentType,
    title: normalizeText(templated.title || invite.title) || getAppointmentTypeLabel(appointmentType),
    appointment_date: appointmentDate,
    start_time: startTime,
    end_time: endTime || null,
    date_time: dateTime || null,
    timezone: invite.timezone,
    location_type: invite.locationType || null,
    location: invite.location || null,
    meeting_url: invite.meetingUrl || null,
    linked_workflow: normalizeText(templated.linkedWorkflow || invite.linkedWorkflow) || null,
    linked_workflow_stage: normalizeText(templated.linkedWorkflowStage || invite.linkedWorkflowStage) || null,
    linked_transaction_stage: invite.linkedTransactionStage || null,
    visibility_scope: visibility,
    appointment_instructions: normalizeText(invite.instructions || templated.instructions) || null,
    required_documents: Array.isArray(templated.requiredDocuments) ? templated.requiredDocuments : [],
    resource_id: invite.resourceId || null,
    status: 'Pending Confirmation',
    notes: invite.notes || null,
    created_by: isUuidLike(user?.id) ? user.id : null,
    created_at: nowIso,
    updated_at: nowIso,
  }

  const recipientParticipantId = createUuid()
  const participantRows = [
    {
      participant_id: recipientParticipantId,
      appointment_id: appointmentId,
      organisation_id: organisationId,
      name: recipientName || 'Client',
      email: recipientEmail,
      participant_role: invite.participantRole || 'Client',
      rsvp_status: 'Pending',
      rsvp_expires_at: dateTime || null,
      created_at: nowIso,
      updated_at: nowIso,
    },
  ]

  const attorneyName = normalizeText(invite.attorneyName || user?.user_metadata?.full_name || user?.email)
  const attorneyEmail = toLower(invite.attorneyEmail || user?.email)
  if (attorneyName || attorneyEmail) {
    participantRows.push({
      participant_id: createUuid(),
      appointment_id: appointmentId,
      organisation_id: organisationId,
      user_id: isUuidLike(user?.id) ? user.id : null,
      name: attorneyName || 'Attorney',
      email: attorneyEmail || null,
      participant_role: 'Attorney',
      rsvp_status: 'Accepted',
      rsvp_expires_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    })
  }

  const inviteTimeParts = deriveAttorneyInviteDateAndTimeParts(dateTime, appointmentDate, startTime, endTime)
  const schedulingIntegrity = await checkAppointmentSchedulingIntegrityAsync(
    organisationId,
    {
      appointmentId,
      appointmentType,
      title: insertPayload.title,
      date: inviteTimeParts.date,
      startTime: inviteTimeParts.startTime,
      endTime: inviteTimeParts.endTime,
      dateTime,
      transactionId,
      resourceId: invite.resourceId || null,
      location: invite.location || null,
      participants: participantRows.map(mapAttorneyParticipantRowForScheduling),
      linkedWorkflowStage: insertPayload.linked_workflow_stage || null,
      linkedTransactionStage: insertPayload.linked_transaction_stage || null,
      allowOutsideBusinessHours: false,
      status: insertPayload.status,
    },
    {
      excludeAppointmentId: appointmentId,
      allowOutsideBusinessHours: false,
      maxSuggestions: 5,
    },
  )

  if (schedulingIntegrity?.hasHardConflicts) {
    const conflictError = new Error('Appointment has hard scheduling conflicts.')
    conflictError.code = 'APPOINTMENT_HARD_CONFLICT'
    conflictError.schedulingConflicts = schedulingIntegrity
    await recordAttorneyCalendarRolloutEvent('persistence_failed', {
      organisationId,
      transactionId,
      appointmentId,
      metadata: {
        stage: 'scheduling_integrity',
        code: conflictError.code,
        hardConflictCount: schedulingIntegrity.hardConflicts?.length || 0,
      },
    }, { client })
    throw conflictError
  }

  const result = await client.rpc('create_attorney_appointment_invite', {
    p_appointment: insertPayload, p_participants: participantRows,
    p_send_notifications: invite.sendNotifications, p_attach_calendar: invite.attachCalendarInvite,
  })
  if (result.error) {
    if (result.error.code === 'PGRST202') throw new Error('The calendar needs the latest database migration before invitations can be saved.')
    throw result.error
  }
  const confirmed = result.data
  if (confirmed?.appointment?.appointment_id !== appointmentId || !Array.isArray(confirmed.participants) || !confirmed.participants.length) {
    throw new Error('Appointment save could not be confirmed. Refresh the calendar before trying again.')
  }
  operationalWorkspaceCache.clear()
  operationalWorkspaceInflight.clear()
  const delivery = {
    status: invite.sendNotifications ? 'queued' : 'disabled', retryable: false,
    calendarInviteRequested: invite.attachCalendarInvite, calendarInviteDelivered: false,
    reminders: { status: invite.sendNotifications ? 'scheduled' : 'skipped' },
  }
  void recordAttorneyCalendarRolloutEvent('invite_created', {
    organisationId, transactionId, appointmentId,
    metadata: { appointmentType, deliveryStatus: delivery.status },
  }, { client }).catch(() => {})
  return { appointmentId, transactionId, status: confirmed.appointment.status,
    appointmentType, appointment: confirmed.appointment, participants: confirmed.participants, delivery }
}

export async function resendAttorneyAppointmentCommunication(appointmentId, communicationType = 'confirmation') {
  const client = requireClient()
  const scopedAppointmentId = normalizeText(appointmentId)
  if (!scopedAppointmentId) {
    throw new Error('Appointment is required.')
  }

  const kind = communicationType === 'documents' ? 'documents' : communicationType === 'reminder' ? 'reminder_due'
    : ['portal','calendar'].includes(communicationType) ? 'updated' : 'invite'
  const result = await client.rpc('retry_attorney_appointment_delivery', { p_id: scopedAppointmentId, p_kind: kind })
  if (result.error) throw result.error
  return { appointmentId: scopedAppointmentId, queuedCount: Number(result.data) || 0, deliveryRecorded: Number(result.data) === 0 }
}

export async function proposeAttorneyAppointmentReschedule(requestId, payload = {}) {
  return proposeAppointmentReschedule(requestId, payload)
}

export async function resolveAttorneyAppointmentReschedule(requestId, payload = {}) {
  return resolveAppointmentRescheduleRequest(requestId, payload)
}
