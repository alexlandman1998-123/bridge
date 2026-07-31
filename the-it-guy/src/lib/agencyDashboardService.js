import { isSupabaseConfigured, supabase } from './supabaseClient'
import { MOCK_DATA_ENABLED } from './mockData'
import { isUnsafeFallbackAllowed } from './envValidation'
import { logUnsafeFallbackBlocked, WorkspaceContextError } from '../services/workspaceResolutionService'
import {
  getAppointmentTypeDefinition,
  getAppointmentTypeLabel,
  normalizeAppointmentTypeKey,
} from './appointmentTypeDefinitions'

const STORAGE_PREFIX = 'itg:agency-crm:v1'
const APPOINTMENTS_DEMO_FALLBACK_REASON = {
  UNSCOPED_ORG: 'unscoped_organisation',
  SUPABASE_NOT_CONFIGURED: 'supabase_not_configured',
}
const LEAD_DIRECTIONS = ['Inbound', 'Outbound']
const LEAD_CATEGORIES = ['buyer', 'seller', 'other']
const LEAD_STAGES = [
  'Lead',
  'Contacted',
  'Onboarding Sent',
  'Onboarding Completed',
  'Seller Onboarding Sent',
  'Seller Onboarding Submitted',
  'Qualified',
  'Appointment Scheduled',
  'Appointment Completed',
  'Mandate Ready',
  'Mandate Generated',
  'Mandate Sent',
  'Mandate Signed',
  'Listing Created',
  'Listing Live',
  'All Documents Submitted',
  'Converted To Listing',
  'Offer Submitted',
  'Offer Accepted',
  'Follow-up',
  'Negotiating',
  'Converted to Transaction',
  'Deal Created',
  'Finance',
  'Transfer',
  'Registered / Closed',
  'Lost',
  'Nurture / Follow-up Later',
]
const LEAD_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']
const APPOINTMENT_STATUSES = [
  'draft',
  'requested',
  'accepted',
  'alternative_requested',
  'alternative_proposed',
  'confirmed',
  'declined',
  'completed',
  'cancelled',
  'no_show',
]
const APPOINTMENT_PARTICIPANT_ROLES = [
  'Client',
  'Buyer',
  'Seller',
  'Agent',
  'Co-agent',
  'Principal',
  'Attorney',
  'Bond Originator',
  'Developer',
  'Other',
  'Other Contact',
]
const APPOINTMENT_LOCATION_TYPES = [
  'physical_address',
  'video_call',
  'phone_call',
  'to_be_confirmed',
]

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function normalizeLeadIdentityKey(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  const withoutPrefix = raw.replace(/^lead_/i, '')
  return isUuidLike(withoutPrefix) ? withoutPrefix : raw
}

function normalizeTimeText(value) {
  const text = normalizeText(value)
  if (!text) return null
  return text.slice(0, 5)
}

function isMissingColumnError(error) {
  const message = String(error?.message || error?.details || '')
  const code = normalizeText(error?.code).toUpperCase()
  return code === '42703' || code === 'PGRST204' || /column .* does not exist/i.test(message) || message.toLowerCase().includes('schema cache')
}

function isPermissionDeniedError(error) {
  const status = Number(error?.status || error?.statusCode || 0)
  const code = normalizeText(error?.code)
  const message = normalizeLowerText(error?.message || error?.details || '')
  return status === 403 || code === '42501' || message.includes('permission denied') || message.includes('row-level security')
}

function localFallbackAllowed(service = '', organisationId = '', attemptedFallbackType = 'local_crm_snapshot') {
  const allowed = isUnsafeFallbackAllowed()
  if (!allowed) {
    logUnsafeFallbackBlocked({
      service,
      missingContextType: 'workspace_scoped_data',
      attemptedFallbackType,
      workspaceId: organisationId,
    })
  }
  return allowed
}

function resolveAppointmentsDemoFallbackReason(organisationId) {
  if (!MOCK_DATA_ENABLED) return null
  const scopedOrganisationId = normalizeText(organisationId)
  if (!isUuidLike(scopedOrganisationId)) return APPOINTMENTS_DEMO_FALLBACK_REASON.UNSCOPED_ORG
  if (!isSupabaseConfigured || !supabase) return APPOINTMENTS_DEMO_FALLBACK_REASON.SUPABASE_NOT_CONFIGURED
  return null
}

function normalizeLabel(value, fallback = '') {
  const raw = normalizeText(value)
  return raw || fallback
}

function normalizeListValue(value, allowed, fallback) {
  const normalized = normalizeLabel(value, fallback)
  return allowed.includes(normalized) ? normalized : fallback
}

function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const seed = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.padEnd(32, '0').slice(0, 32)
  return `${seed.slice(0, 8)}-${seed.slice(8, 12)}-4${seed.slice(13, 16)}-8${seed.slice(17, 20)}-${seed.slice(20, 32)}`
}

function getStorageKey(organisationId) {
  const org = normalizeText(organisationId)
  if (!org || org === 'default') {
    throw new Error('A resolved organisation id is required before using agency pipeline storage.')
  }
  return `${STORAGE_PREFIX}:${org}`
}

function createEmptyStore(organisationId) {
  return {
    version: 1,
    organisationId: normalizeText(organisationId) || null,
    contacts: [],
    leads: [],
    leadActivities: [],
    tasks: [],
    appointments: [],
    appointmentParticipants: [],
    transactions: [],
    deals: [],
    deletedLeadIds: [],
    deletedLeadKeys: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function safeReadStore(organisationId) {
  if (!localFallbackAllowed('agencyDashboardService.safeReadStore', organisationId, 'local_crm_snapshot')) {
    return createEmptyStore(organisationId)
  }
  if (typeof window === 'undefined') return createEmptyStore(organisationId)
  try {
    const raw = window.localStorage.getItem(getStorageKey(organisationId))
    if (!raw) return createEmptyStore(organisationId)
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return createEmptyStore(organisationId)
    return {
      ...createEmptyStore(organisationId),
      ...parsed,
      organisationId: normalizeText(parsed.organisationId || organisationId) || null,
      contacts: Array.isArray(parsed.contacts) ? parsed.contacts : [],
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      leadActivities: Array.isArray(parsed.leadActivities) ? parsed.leadActivities : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
      appointmentParticipants: Array.isArray(parsed.appointmentParticipants) ? parsed.appointmentParticipants : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : Array.isArray(parsed.deals) ? parsed.deals : [],
      deals: Array.isArray(parsed.deals) ? parsed.deals : [],
      deletedLeadIds: Array.isArray(parsed.deletedLeadIds) ? parsed.deletedLeadIds.map(normalizeText).filter(Boolean) : [],
      deletedLeadKeys: Array.isArray(parsed.deletedLeadKeys) ? parsed.deletedLeadKeys.map(normalizeText).filter(Boolean) : [],
    }
  } catch {
    return createEmptyStore(organisationId)
  }
}

function getLeadDeletionKeys(lead = {}) {
  return [
    lead.leadId,
    lead.lead_id,
    lead.id,
    lead.originatingCrmLeadId,
    lead.originating_crm_lead_id,
    lead.sellerLeadId,
    lead.seller_lead_id,
    lead.canvassingProspectId ? `prospect:${lead.canvassingProspectId}` : '',
    lead.canvassing_prospect_id ? `prospect:${lead.canvassing_prospect_id}` : '',
  ]
    .map(normalizeLeadIdentityKey)
    .filter(Boolean)
}

function getDeletedLeadKeySet(store = {}) {
  return new Set([
    ...(Array.isArray(store.deletedLeadIds) ? store.deletedLeadIds : []),
    ...(Array.isArray(store.deletedLeadKeys) ? store.deletedLeadKeys : []),
  ].map(normalizeLeadIdentityKey).filter(Boolean))
}

function leadMatchesDeletedKeys(lead = {}, deletedKeys = null) {
  const keys = deletedKeys || new Set()
  return getLeadDeletionKeys(lead).some((key) => keys.has(normalizeLeadIdentityKey(key)))
}

function normalizeLeadCategoryFromRecord(lead = {}) {
  const explicit = normalizeLowerText(lead.leadCategory || lead.lead_category || lead.category || lead.type)
  if (explicit.includes('sell')) return 'seller'
  if (explicit.includes('buy')) return 'buyer'
  const signal = `${lead.sellerName || ''} ${lead.sellerEmail || ''} ${lead.sellerOnboardingStatus || ''} ${lead.sellerLeadId || ''}`
  if (normalizeText(signal)) return 'seller'
  return 'buyer'
}

function normalizeLeadRecord(lead = {}, organisationId) {
  const notes = normalizeText(lead.notes)
  const prospectMatch = notes.match(/Canvassing Prospect ID:\s*([^\s|]+)/i)
  const canvassingProspectId = normalizeText(lead.canvassingProspectId || lead.canvassing_prospect_id || prospectMatch?.[1])
  const explicitLeadSource = normalizeText(lead.leadSource || lead.lead_source || lead.source || lead.source_label || lead.origin)
  const leadSource = explicitLeadSource && !['unknown', 'other'].includes(explicitLeadSource.toLowerCase())
    ? explicitLeadSource
    : canvassingProspectId || /canvassing prospect id:/i.test(notes)
      ? 'Canvassing'
      : explicitLeadSource || 'Other'
  const leadCategory = normalizeListValue(normalizeLeadCategoryFromRecord(lead), LEAD_CATEGORIES, 'buyer')

  return {
    ...lead,
    leadId: normalizeText(lead.leadId || lead.lead_id || lead.id),
    organisationId: normalizeText(lead.organisationId || lead.organisation_id || organisationId) || null,
    branchId: normalizeText(lead.branchId || lead.branch_id),
    assignedUserId: normalizeText(lead.assignedUserId || lead.assigned_user_id),
    assignedAgentId: normalizeText(lead.assignedAgentId || lead.assigned_agent_id),
    assignedAgentName: normalizeText(lead.assignedAgentName || lead.assigned_agent_name),
    assignedAgentEmail: normalizeText(lead.assignedAgentEmail || lead.assigned_agent_email).toLowerCase(),
    contactId: normalizeText(lead.contactId || lead.contact_id),
    leadCategory,
    leadDirection: normalizeListValue(lead.leadDirection || lead.lead_direction, LEAD_DIRECTIONS, 'Inbound'),
    leadSource,
    stage: normalizeListValue(lead.stage, LEAD_STAGES, 'Lead'),
    status: normalizeText(lead.status || lead.stage || 'Lead'),
    priority: normalizeListValue(lead.priority, LEAD_PRIORITIES, 'Medium'),
    estimatedValue: Number(lead.estimatedValue || lead.estimated_value || 0) || 0,
    budget: Number(lead.budget || 0) || 0,
    notes,
    canvassingProspectId,
    sellerName: normalizeText(lead.sellerName || lead.seller_name),
    sellerSurname: normalizeText(lead.sellerSurname || lead.seller_surname),
    sellerEmail: normalizeText(lead.sellerEmail || lead.seller_email).toLowerCase(),
    sellerPhone: normalizeText(lead.sellerPhone || lead.seller_phone),
    sellerOnboardingStatus: normalizeText(lead.sellerOnboardingStatus || lead.seller_onboarding_status),
    sellerLeadId: normalizeText(lead.sellerLeadId || lead.seller_lead_id),
    privateListingId: normalizeText(lead.privateListingId || lead.private_listing_id),
    listingId: normalizeText(lead.listingId || lead.listing_id),
    createdAt: lead.createdAt || lead.created_at || new Date().toISOString(),
    updatedAt: lead.updatedAt || lead.updated_at || new Date().toISOString(),
    convertedDealId: normalizeText(lead.convertedDealId || lead.converted_deal_id) || null,
    convertedTransactionId: normalizeText(lead.convertedTransactionId || lead.converted_transaction_id || lead.convertedDealId || lead.converted_deal_id) || null,
  }
}

export function getAgencyPipelineSnapshot(organisationId) {
  if (!localFallbackAllowed('agencyDashboardService.getAgencyPipelineSnapshot', organisationId, 'local_crm_snapshot')) {
    return createEmptyStore(organisationId)
  }
  const store = safeReadStore(organisationId)
  const deletedKeys = getDeletedLeadKeySet(store)
  const dedupeMap = new Map()
  for (const row of Array.isArray(store.leads) ? store.leads : []) {
    if (leadMatchesDeletedKeys(row, deletedKeys)) continue
    const normalized = normalizeLeadRecord(row, organisationId)
    const dedupeKey = normalized.canvassingProspectId
      ? `prospect:${normalizeLowerText(normalized.canvassingProspectId)}`
      : `lead:${normalizeLowerText(normalizeLeadIdentityKey(normalized.leadId))}`
    const existing = dedupeMap.get(dedupeKey)
    if (!existing) {
      dedupeMap.set(dedupeKey, normalized)
      continue
    }
    const existingUpdated = new Date(existing?.updatedAt || existing?.createdAt || 0).getTime()
    const normalizedUpdated = new Date(normalized?.updatedAt || normalized?.createdAt || 0).getTime()
    if (normalizedUpdated >= existingUpdated) {
      dedupeMap.set(dedupeKey, normalized)
    }
  }

  return {
    ...store,
    leads: [...dedupeMap.values()],
  }
}

function mapLegacyAppointmentStatus(value) {
  const normalized = normalizeLowerText(value)
  if (normalized === 'pending') return 'requested'
  if (normalized === 'needs reschedule' || normalized === 'needs_reschedule') return 'alternative_requested'
  if (normalized === 'proposed new time' || normalized === 'proposed_new_time') return 'alternative_proposed'
  if (normalized === 'no show' || normalized === 'no-show') return 'no_show'
  return normalized || 'requested'
}

function mapLegacyRsvpStatus(value) {
  const normalized = normalizeLowerText(value)
  if (normalized === 'accepted') return 'Accepted'
  if (normalized === 'declined') return 'Declined'
  if (normalized === 'proposed new time') return 'Proposed New Time'
  return 'Pending'
}

function normalizeAppointmentType(value) {
  return normalizeAppointmentTypeKey(value)
}

function normalizeAppointmentStatus(value) {
  const normalized = mapLegacyAppointmentStatus(value)
  return APPOINTMENT_STATUSES.includes(normalized) ? normalized : 'requested'
}

function normalizeAppointmentLocationType(value) {
  const normalized = normalizeLowerText(value)
  if (!normalized) return 'to_be_confirmed'
  if (APPOINTMENT_LOCATION_TYPES.includes(normalized)) return normalized
  if (normalized === 'physical' || normalized === 'address' || normalized === 'onsite' || normalized === 'inperson' || normalized === 'in person') return 'physical_address'
  if (normalized === 'call' || normalized === 'phone' || normalized === 'phonecall') return 'phone_call'
  if (normalized === 'videocall' || normalized === 'video' || normalized === 'zoom') return 'video_call'
  return 'to_be_confirmed'
}

function deriveDateTime({ date = '', startTime = '' } = {}) {
  if (!normalizeText(date)) return null
  const safeTime = normalizeText(startTime) || '00:00'
  const dateTime = new Date(`${date}T${safeTime}`)
  if (Number.isNaN(dateTime.getTime())) return null
  return dateTime.toISOString()
}

function getAppointmentStartMs(appointment = {}) {
  const explicit = appointment?.dateTime || appointment?.date_time || appointment?.startsAt || appointment?.starts_at
  if (explicit) {
    const parsed = new Date(explicit)
    if (!Number.isNaN(parsed.getTime())) return parsed.getTime()
  }
  const derived = deriveDateTime({
    date: appointment?.date || appointment?.appointmentDate || appointment?.appointment_date,
    startTime: appointment?.startTime || appointment?.start_time || appointment?.appointmentTime || appointment?.appointment_time,
  })
  if (!derived) return NaN
  const parsed = new Date(derived)
  return Number.isNaN(parsed.getTime()) ? NaN : parsed.getTime()
}

function normalizeParticipantRecord(participant = {}, { appointmentId = '', organisationId = '' } = {}) {
  const participantRole = normalizeLabel(participant?.participantRole || participant?.role || 'Other Contact')
  const normalizedRole = APPOINTMENT_PARTICIPANT_ROLES.includes(participantRole) ? participantRole : 'Other Contact'
  return {
    participantId: normalizeText(participant?.participantId || participant?.id) || createUuid(),
    appointmentId: normalizeText(participant?.appointmentId || appointmentId),
    organisationId: normalizeText(participant?.organisationId || organisationId) || null,
    userId: normalizeText(participant?.userId || participant?.user_id) || null,
    contactId: normalizeText(participant?.contactId || participant?.contact_id) || null,
    name: normalizeText(participant?.name),
    email: normalizeText(participant?.email).toLowerCase(),
    phone: normalizeText(participant?.phone),
    participantRole: normalizedRole,
    isRequired: participant?.isRequired === false || participant?.is_required === false ? false : true,
    rsvpStatus: mapLegacyRsvpStatus(participant?.rsvpStatus || participant?.responseStatus || participant?.response_status),
    proposedNewTime: normalizeText(participant?.proposedNewTime || participant?.proposed_new_time) || null,
    rsvpComment: normalizeText(participant?.rsvpComment || participant?.rsvp_comment) || null,
    rsvpToken: normalizeText(participant?.rsvpToken || participant?.rsvp_token) || createUuid(),
    invitationSentAt: participant?.invitationSentAt || participant?.invitation_sent_at || null,
    lastInvitationSentAt: participant?.lastInvitationSentAt || participant?.last_invitation_sent_at || null,
    respondedAt: participant?.respondedAt || participant?.responded_at || null,
    createdAt: participant?.createdAt || participant?.created_at || new Date().toISOString(),
    updatedAt: participant?.updatedAt || participant?.updated_at || new Date().toISOString(),
  }
}

function normalizeAppointmentRecord(appointment = {}, { organisationId = '', fallbackLeadId = '' } = {}) {
  const dateTime = appointment?.dateTime || appointment?.date_time || null
  const parsedDateTime = dateTime ? new Date(dateTime) : null
  const hasDateTime = parsedDateTime && !Number.isNaN(parsedDateTime.getTime())
  const normalizedDate = normalizeText(appointment?.date) || (hasDateTime ? parsedDateTime.toISOString().slice(0, 10) : '')
  const normalizedStart = normalizeText(appointment?.startTime || appointment?.start_time) || (hasDateTime ? parsedDateTime.toISOString().slice(11, 16) : '')
  const appointmentType = normalizeAppointmentType(appointment?.appointmentType || appointment?.appointment_type)
  const appointmentTypeDefinition = getAppointmentTypeDefinition(appointmentType)

  return {
    appointmentId: normalizeText(appointment?.appointmentId || appointment?.id) || createUuid(),
    organisationId: normalizeText(appointment?.organisationId || organisationId) || null,
    assignedAgentId: normalizeText(appointment?.assignedAgentId || appointment?.agentId || appointment?.agent_id),
    assignedAgentName: normalizeText(appointment?.assignedAgentName || appointment?.agentName),
    assignedAgentEmail: normalizeText(appointment?.assignedAgentEmail || appointment?.agentEmail).toLowerCase(),
    appointmentType,
    customTypeLabel: normalizeText(appointment?.customTypeLabel || appointment?.custom_type_label) || null,
    appointmentTypeLabel: getAppointmentTypeLabel(appointmentType),
    title: normalizeText(appointment?.title) || appointmentTypeDefinition.title,
    date: normalizedDate || null,
    startTime: normalizedStart || null,
    endTime: normalizeText(appointment?.endTime || appointment?.end_time) || null,
    dateTime: hasDateTime ? parsedDateTime.toISOString() : deriveDateTime({ date: normalizedDate, startTime: normalizedStart }),
    locationType: normalizeAppointmentLocationType(appointment?.locationType || appointment?.location_type),
    location: normalizeText(appointment?.location),
    meetingUrl: normalizeText(appointment?.meetingUrl || appointment?.meeting_url) || null,
    leadId: normalizeText(appointment?.leadId || appointment?.lead_id || fallbackLeadId) || null,
    contactId: normalizeText(appointment?.contactId || appointment?.contact_id) || null,
    listingId: normalizeText(appointment?.listingId || appointment?.listing_id) || null,
    transactionId: normalizeText(appointment?.transactionId || appointment?.transaction_id) || null,
    status: normalizeAppointmentStatus(appointment?.status),
    notes: normalizeText(appointment?.notes),
    outcomeSummary: normalizeText(appointment?.outcomeSummary || appointment?.outcome_summary) || null,
    createdBy: normalizeText(appointment?.createdBy || appointment?.created_by) || null,
    createdAt: appointment?.createdAt || appointment?.created_at || new Date().toISOString(),
    updatedAt: appointment?.updatedAt || appointment?.updated_at || new Date().toISOString(),
    completedAt: appointment?.completedAt || appointment?.completed_at || null,
    cancelledAt: appointment?.cancelledAt || appointment?.cancelled_at || null,
  }
}

function readAppointmentParticipants(store, appointmentId) {
  const targetId = normalizeText(appointmentId)
  if (!targetId) return []
  return (store?.appointmentParticipants || []).filter(
    (participant) => normalizeText(participant?.appointmentId || participant?.appointment_id) === targetId,
  )
}

function attachAppointmentParticipants(store, appointments = []) {
  return (Array.isArray(appointments) ? appointments : []).map((appointment) => ({
    ...appointment,
    participants: readAppointmentParticipants(store, appointment?.appointmentId).map((participant) =>
      normalizeParticipantRecord(participant, {
        appointmentId: appointment?.appointmentId,
        organisationId: appointment?.organisationId,
      }),
    ),
  }))
}

function mapDbAppointmentRow(row = {}, organisationId = '') {
  return normalizeAppointmentRecord(
    {
      appointmentId: row?.appointment_id,
      organisationId: row?.organisation_id || organisationId,
      assignedAgentId: row?.agent_id,
      appointmentType: row?.appointment_type,
      customTypeLabel: row?.custom_type_label,
      title: row?.title,
      date: row?.appointment_date,
      startTime: normalizeTimeText(row?.start_time),
      endTime: normalizeTimeText(row?.end_time),
      dateTime: row?.date_time,
      locationType: normalizeAppointmentLocationType(row?.location_type),
      location: row?.location,
      meetingUrl: row?.meeting_url,
      leadId: row?.lead_id,
      contactId: row?.contact_id,
      listingId: row?.listing_id,
      transactionId: row?.transaction_id,
      status: row?.status,
      notes: row?.notes,
      outcomeSummary: row?.outcome_summary,
      createdBy: row?.created_by,
      createdAt: row?.created_at,
      updatedAt: row?.updated_at,
      completedAt: row?.completed_at,
      cancelledAt: row?.cancelled_at,
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
      createdAt: row?.created_at,
      updatedAt: row?.updated_at,
    },
    {
      appointmentId: row?.appointment_id,
      organisationId: row?.organisation_id,
    },
  )
}

function applyAppointmentScope(rows = [], { includeAll = false, agentId = '', agentEmail = '', agentKeys = [], listingId = '', from = null, to = null } = {}) {
  const scopedAgentKeys = new Set(
    [agentId, agentEmail, ...(Array.isArray(agentKeys) ? agentKeys : [])]
      .map((value) => normalizeLowerText(value))
      .filter(Boolean),
  )
  const scopedListingId = normalizeLowerText(listingId)
  const fromMs = from ? new Date(from).getTime() : null
  const toMs = to ? new Date(to).getTime() : null

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (scopedListingId && normalizeLowerText(row?.listingId || row?.listing_id) !== scopedListingId) return false

    if (!includeAll && scopedAgentKeys.size) {
      const rowKeys = [
        row?.assignedAgentId,
        row?.assignedAgentEmail,
        row?.createdBy,
        ...(Array.isArray(row?.participants)
          ? row.participants.flatMap((participant) => [
              participant?.userId,
              participant?.email,
            ])
          : []),
      ]
        .map((value) => normalizeLowerText(value))
        .filter(Boolean)

      if (!rowKeys.some((key) => scopedAgentKeys.has(key))) return false
    }

    if (fromMs || toMs) {
      const value = getAppointmentStartMs(row)
      if (!Number.isFinite(value)) return false
      if (Number.isFinite(fromMs) && value < fromMs) return false
      if (Number.isFinite(toMs) && value >= toMs) return false
    }
    return true
  })
}

function listAppointments(organisationId, { includeAll = false, agentId = '', agentEmail = '', agentKeys = [], listingId = '', from = null, to = null } = {}) {
  const store = safeReadStore(organisationId)
  const normalizedRows = attachAppointmentParticipants(
    store,
    store.appointments.map((row) => normalizeAppointmentRecord(row, { organisationId })),
  )
  return applyAppointmentScope(normalizedRows, { includeAll, agentId, agentEmail, agentKeys, listingId, from, to })
}

async function listAppointmentsFromSupabase(organisationId, { includeAll = false, agentId = '', agentEmail = '', agentKeys = [], listingId = '', from = null, to = null } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedListingId = normalizeText(listingId)
  const selectModern =
    'appointment_id, organisation_id, lead_id, agent_id, appointment_type, custom_type_label, title, appointment_date, start_time, end_time, date_time, timezone, all_day, location_type, location, meeting_url, contact_id, listing_id, transaction_id, status, notes, outcome_summary, created_by, created_at, updated_at, completed_at, cancelled_at'
  const selectMinimal =
    'appointment_id, organisation_id, lead_id, agent_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, contact_id, listing_id, transaction_id, status, notes, created_by, created_at, updated_at'

  const buildQuery = (select) => {
    let query = supabase
      .from('appointments')
      .select(select)
      .eq('organisation_id', scopedOrganisationId)
      .order('date_time', { ascending: true })
    if (scopedListingId) query = query.eq('listing_id', scopedListingId)
    return query
  }

  let appointmentRows = []
  let appointmentError = null
  const rpcResult = await supabase.rpc('bridge_list_calendar_appointments', {
    p_organisation_id: scopedOrganisationId,
    p_include_all: includeAll === true,
    p_listing_id: scopedListingId || null,
    p_from: from || null,
    p_to: to || null,
  })
  if (!rpcResult.error) {
    appointmentRows = Array.isArray(rpcResult.data) ? rpcResult.data : []
  } else {
    if (!['PGRST202', '42883'].includes(normalizeText(rpcResult.error?.code))) {
      console.warn('[appointments] calendar RPC failed; falling back to direct appointment query.', rpcResult.error)
    }
    for (const select of [selectModern, selectMinimal]) {
      const result = await buildQuery(select)
      if (!result.error) {
        appointmentRows = Array.isArray(result.data) ? result.data : []
        appointmentError = null
        break
      }
      appointmentError = result.error
      if (!isMissingColumnError(result.error)) break
    }
  }
  if (appointmentError) throw appointmentError

  const appointmentIds = appointmentRows.map((row) => normalizeText(row?.appointment_id)).filter(Boolean)
  const participantMap = new Map()

  if (appointmentIds.length) {
    let participantResult = await supabase
      .from('appointment_participants')
      .select(
        'participant_id, appointment_id, organisation_id, user_id, contact_id, name, email, phone, participant_role, is_required, rsvp_status, proposed_new_time, rsvp_comment, rsvp_token, invitation_sent_at, last_invitation_sent_at, responded_at, created_at, updated_at',
      )
      .eq('organisation_id', scopedOrganisationId)
      .in('appointment_id', appointmentIds)
    if (participantResult.error && isMissingColumnError(participantResult.error)) {
      participantResult = await supabase
        .from('appointment_participants')
        .select(
          'participant_id, appointment_id, organisation_id, name, email, phone, participant_role, rsvp_status, proposed_new_time, responded_at, created_at, updated_at',
        )
        .eq('organisation_id', scopedOrganisationId)
        .in('appointment_id', appointmentIds)
    }

    const { data: participantRows, error: participantError } = participantResult
    if (participantError) {
      console.warn('[appointments] participant rows could not be loaded; showing appointments without participant detail.', participantError)
    } else {
      for (const row of Array.isArray(participantRows) ? participantRows : []) {
        const mapped = mapDbParticipantRow(row)
        const key = normalizeText(mapped?.appointmentId)
        if (!participantMap.has(key)) participantMap.set(key, [])
        participantMap.get(key).push(mapped)
      }
    }
  }

  const rows = appointmentRows.map((row) => {
    const mapped = mapDbAppointmentRow(row, scopedOrganisationId)
    return {
      ...mapped,
      participants: participantMap.get(normalizeText(mapped?.appointmentId)) || [],
    }
  })

  return applyAppointmentScope(rows, { includeAll, agentId, agentEmail, agentKeys, listingId: scopedListingId, from, to })
}

async function listAppointmentsAsync(organisationId, { includeAll = false, agentId = '', agentEmail = '', agentKeys = [], listingId = '', from = null, to = null } = {}) {
  const fallbackReason = resolveAppointmentsDemoFallbackReason(organisationId)
  if (fallbackReason) {
    if (!localFallbackAllowed('agencyDashboardService.listAppointmentsAsync', organisationId, fallbackReason)) {
      return []
    }
    return listAppointments(organisationId, { includeAll, agentId, agentEmail, agentKeys, listingId, from, to })
  }
  if (!isUuidLike(normalizeText(organisationId))) {
    throw new WorkspaceContextError('invalid_service_workspace_context', {
      service: 'agencyDashboardService.listAppointmentsAsync',
      workspaceId: normalizeText(organisationId) || null,
    })
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Appointment scheduling requires the database connection.')
  }
  try {
    return await listAppointmentsFromSupabase(organisationId, { includeAll, agentId, agentEmail, agentKeys, listingId, from, to })
  } catch (error) {
    if (isPermissionDeniedError(error) && isUnsafeFallbackAllowed()) {
      return listAppointments(organisationId, { includeAll, agentId, agentEmail, agentKeys, listingId, from, to })
    }
    throw error
  }
}

function buildAppointmentsDashboardSummary(rows = [], { now = new Date() } = {}) {
  const sortedRows = (Array.isArray(rows) ? rows : [])
    .slice()
    .sort((left, right) => new Date(right?.updatedAt || 0).getTime() - new Date(left?.updatedAt || 0).getTime())

  const nowDate = new Date(now)
  const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime()
  const todayEnd = todayStart + 24 * 60 * 60 * 1000
  const weekStartDate = new Date(nowDate)
  weekStartDate.setDate(nowDate.getDate() - nowDate.getDay() + 1)
  weekStartDate.setHours(0, 0, 0, 0)
  const weekEndDate = new Date(weekStartDate)
  weekEndDate.setDate(weekStartDate.getDate() + 7)
  const weekStart = weekStartDate.getTime()
  const weekEnd = weekEndDate.getTime()

  const pending = sortedRows.filter((row) => ['requested', 'pending', 'alternative_proposed'].includes(row.status))
  const reschedule = sortedRows.filter((row) => ['alternative_requested', 'needs_reschedule'].includes(row.status))
  const upcoming = sortedRows.filter((row) => {
    if (!['requested', 'pending', 'accepted', 'alternative_requested', 'needs_reschedule', 'alternative_proposed', 'confirmed'].includes(row?.status)) return false
    const value = getAppointmentStartMs(row)
    return Number.isFinite(value) && value >= nowDate.getTime()
  })
  const today = sortedRows.filter((row) => {
    const value = getAppointmentStartMs(row)
    return Number.isFinite(value) && value >= todayStart && value < todayEnd
  })
  const thisWeek = sortedRows.filter((row) => {
    const value = getAppointmentStartMs(row)
    return Number.isFinite(value) && value >= weekStart && value < weekEnd
  })

  const statusCounts = APPOINTMENT_STATUSES.map((status) => ({
    status,
    count: sortedRows.filter((row) => row.status === status).length,
  }))
  const typeMap = new Map()
  for (const row of sortedRows) {
    const type = normalizeAppointmentType(row?.appointmentType)
    typeMap.set(type, (typeMap.get(type) || 0) + 1)
  }
  const typeCounts = Array.from(typeMap.entries())
    .map(([type, count]) => ({ type: getAppointmentTypeLabel(type), count }))
    .sort((left, right) => right.count - left.count)

  return {
    rows: sortedRows,
    pending,
    reschedule,
    upcoming,
    today,
    thisWeek,
    statusCounts,
    typeCounts,
  }
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
