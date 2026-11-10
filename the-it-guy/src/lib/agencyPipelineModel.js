// Shared synchronous models and legacy local-store operations. Network workflows load separately.
import {
  appointmentMatchesAgent,
  appointmentReadState,
} from '../core/appointments/appointmentReadModel.js'

import {
  sastDayStart,
  sastWeekStart,
  addCalendarDays,
} from '../core/appointments/attorneyCalendarModel.js'

import {
  appointmentReservationState,
} from '../core/appointments/appointmentReservation.js'

import {
  appointmentLocalToIso,
  mergeAppointmentSchedule,
  resolveAppointmentSchedule,
} from '../core/appointments/appointmentTime.js'

import {
  isUnsafeFallbackAllowed,
} from './envValidation'

import {
  logUnsafeFallbackBlocked,
  WorkspaceContextError,
} from '../services/workspaceResolutionService'

import {
  getAppointmentCompletionBehavior,
  getAppointmentTypeDefinition,
  getAppointmentTypeLabel,
  getAppointmentTypeOptions,
  getAppointmentVisibilityDefault,
  normalizeAppointmentTypeKey,
} from './appointmentTypeDefinitions'

import {
  applyAppointmentTemplate,
  getAppointmentCompletionEffects,
  getAppointmentTemplateInstructions,
  getAppointmentTypeTemplate,
} from '../services/appointmentTemplateService'

import {
  checkAppointmentConflicts,
} from './appointmentAvailabilityEngine'

import {
  BUYER_LEAD_STAGES,
} from './buyerLifecycleService'

import {
  inferLeadCategoryFromRecord,
  normalizeLeadCategory,
} from './leadCategory'

import {
  resolveLeadLifecyclePresentation,
} from '../services/leadLifecyclePresentationService'

import {
  getBuyerProcessDefinition,
  normalizeBuyerProcessStageKey,
} from '../services/buyerProcessDefinitionService'

import {
  migrateBuyerProcessLeadRecord,
} from '../services/buyerProcessMigrationService'

const STORAGE_PREFIX = 'itg:agency-crm:v1'

const CRM_UPDATED_EVENT = 'itg:agency-crm-updated'

const DELETED_LEAD_TOMBSTONE_LIMIT = 300

export const LEAD_DIRECTIONS = ['Inbound', 'Outbound']

export const LEAD_CATEGORIES = ['buyer', 'seller', 'other']

const BUYER_PROCESS_DEFINITION = getBuyerProcessDefinition()

const BUYER_PROCESS_LEAD_STAGES = BUYER_PROCESS_DEFINITION.stages.map((stage) => stage.label)

const ACTIVE_BUYER_PROCESS_STAGE_KEYS = new Set(BUYER_PROCESS_DEFINITION.activeStageKeys)

export const LEAD_STAGES = [
  ...BUYER_PROCESS_LEAD_STAGES,
  ...BUYER_LEAD_STAGES,
  'Lead',
  'Contacted',
  'Onboarding Sent',
  'Onboarding Completed',
  'Seller Onboarding Sent',
  'Seller Onboarding Submitted',
  'Qualified',
  'Appointment Scheduled',
  'Appointment Completed',
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
  'Viewing / Presentation',
  'Unit Selection & Reservation',
  'Buyer Onboarding',
  'OTP',
  'Lost',
  'Nurture / Follow-up Later',
].filter((stage, index, stages) => stages.indexOf(stage) === index)

export const LEAD_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

export const ACTIVITY_TYPES = [
  'Lead Created',
  'Seller Onboarding Sent',
  'Seller Onboarding Submitted',
  'Call',
  'WhatsApp',
  'Email',
  'Door Knock',
  'Meeting',
  'Viewing',
  'Follow-up',
  'Note',
  'Stage Change',
  'Appointment Created',
  'Appointment Confirmed',
  'Appointment Completed',
  'Appointment Feedback Added',
  'Appointment Booked',
  'Mandate Signed',
  'Listing Created',
  'Listing Activated',
  'Transaction Created',
  'Deal Created',
]

export const TASK_STATUSES = ['Pending', 'Completed', 'Overdue', 'Cancelled']

export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

export const APPOINTMENT_TYPES = [
  ...getAppointmentTypeOptions().map((option) => option.value),
]

export const APPOINTMENT_STATUSES = [
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

export const APPOINTMENT_STATUS_LABELS = {
  draft: 'Draft',
  requested: 'Requested',
  accepted: 'Accepted',
  alternative_requested: 'Needs reschedule',
  alternative_proposed: 'Alternative proposed',
  confirmed: 'Confirmed',
  declined: 'Declined',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

export const APPOINTMENT_PARTICIPANT_ROLES = [
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

export const APPOINTMENT_RSVP_STATUSES = ['Pending', 'Accepted', 'Declined', 'Proposed New Time']

const APPOINTMENT_LOCATION_TYPES = [
  'physical_address',
  'video_call',
  'phone_call',
  'to_be_confirmed',
]

const INBOUND_BUYER_SOURCES = [
  'Property24',
  'Private Property',
  'Website',
  'Facebook Ads',
  'Google Ads',
  'Referral',
  'Show Day',
  'Walk-in',
  'WhatsApp Enquiry',
  'Listing Call',
  'Signboard',
  'Organic Social Media',
  'Other',
]

const INBOUND_SELLER_SOURCES = [
  'Referral',
  'Website Valuation Request',
  'Facebook Lead Form',
  'List My Property Form',
  'Walk-in',
  'Signboard Call',
  'Existing Database',
  'Repeat Client',
  'WhatsApp Enquiry',
  'Other',
]

const OUTBOUND_BUYER_SOURCES = [
  'Old Buyer Database Call',
  'Investor Prospecting',
  'Database Reactivation',
  'Rental Database Outreach',
  'WhatsApp Outreach',
  'Email Nurturing',
  'Buyer Qualification Campaign',
  'Previous Enquiry Follow-up',
  'Other',
]

const OUTBOUND_SELLER_SOURCES = [
  'Cold Call',
  'Door Knock',
  'Farming',
  'Expired Listing',
  'Area Prospecting',
  'Valuation Campaign',
  'Just Sold Campaign',
  'Circle Prospecting',
  'Referral Follow-up',
  'Existing Owner Database',
  'Other',
]

export function getLeadSourceOptions({ leadDirection = 'Inbound', leadCategory = 'buyer' } = {}) {
  const direction = normalizeLabel(leadDirection)
  const category = normalizeLeadCategory(leadCategory, 'buyer')
  if (direction === 'Outbound') {
    if (category === 'seller') return OUTBOUND_SELLER_SOURCES
    return OUTBOUND_BUYER_SOURCES
  }
  if (category === 'seller') return INBOUND_SELLER_SOURCES
  return INBOUND_BUYER_SOURCES
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeKnownBuyerProcessStageKey(value = '') {
  if (!normalizeText(value)) return ''
  return normalizeBuyerProcessStageKey(value, '')
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function toNullableUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function normalizeLeadIdentityKey(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  const withoutPrefix = raw.replace(/^lead_/i, '')
  return isUuidLike(withoutPrefix) ? withoutPrefix : raw
}

function normalizeLabel(value, fallback = '') {
  const raw = normalizeText(value)
  return raw || fallback
}

function normalizeListValue(value, allowed, fallback) {
  const normalized = normalizeLabel(value, fallback)
  return allowed.includes(normalized) ? normalized : fallback
}

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function createUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const seed = `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`.padEnd(32, '0').slice(0, 32)
  return `${seed.slice(0, 8)}-${seed.slice(8, 12)}-4${seed.slice(13, 16)}-8${seed.slice(17, 20)}-${seed.slice(20, 32)}`
}

const DEFAULT_APPOINTMENT_BUSINESS_HOURS = {
  timezone: 'Africa/Johannesburg',
  days: [1, 2, 3, 4, 5],
  start: '08:00',
  end: '17:00',
}

function getStorageKey(organisationId) {
  const org = normalizeText(organisationId)
  if (!org || org === 'default') {
    throw new Error('A resolved organisation id is required before using agency pipeline storage.')
  }
  return `${STORAGE_PREFIX}:${org}`
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

function assertLocalFallbackAllowed(service = '', organisationId = '', attemptedFallbackType = 'local_crm_mutation') {
  if (localFallbackAllowed(service, organisationId, attemptedFallbackType)) return
  throw new WorkspaceContextError('unsafe_local_fallback_blocked', {
    service,
    workspaceId: normalizeText(organisationId) || null,
    attemptedFallbackType,
  })
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
  if (!localFallbackAllowed('agencyPipelineService.safeReadStore', organisationId, 'local_crm_snapshot')) {
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

function writeStore(organisationId, store) {
  if (!localFallbackAllowed('agencyPipelineService.writeStore', organisationId, 'local_crm_snapshot_write')) return
  if (typeof window === 'undefined') return
  const payload = {
    ...store,
    organisationId: normalizeText(store?.organisationId || organisationId) || null,
    updatedAt: new Date().toISOString(),
  }
  window.localStorage.setItem(getStorageKey(organisationId), JSON.stringify(payload))
  emitAgencyCrmUpdated()
}

function getStoreRecordScore(store = {}) {
  return (
    (Array.isArray(store?.leads) ? store.leads.length : 0) * 10 +
    (Array.isArray(store?.contacts) ? store.contacts.length : 0) * 6 +
    (Array.isArray(store?.tasks) ? store.tasks.length : 0) * 3 +
    (Array.isArray(store?.appointments) ? store.appointments.length : 0) * 4 +
    (Array.isArray(store?.deals) ? store.deals.length : 0) * 5 +
    (Array.isArray(store?.transactions) ? store.transactions.length : 0) * 5
  )
}

function dedupeRecordsByKey(rows = [], resolveKey) {
  const map = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = normalizeText(resolveKey(row))
    if (!key) continue
    const existing = map.get(key)
    if (!existing) {
      map.set(key, row)
      continue
    }
    const existingTime = new Date(existing?.updatedAt || existing?.createdAt || 0).getTime()
    const rowTime = new Date(row?.updatedAt || row?.createdAt || 0).getTime()
    if (rowTime >= existingTime) map.set(key, row)
  }
  return [...map.values()]
}

function buildRemotePreferredRows(localRows = [], incomingRows = [], resolveKey, preserveLocal = () => false) {
  const preservedLocal = (Array.isArray(localRows) ? localRows : []).filter((row) => preserveLocal(row))
  return dedupeRecordsByKey(
    [...preservedLocal, ...(Array.isArray(incomingRows) ? incomingRows : [])],
    resolveKey,
  )
}

function replaceLeadRowsForStore(localRows = [], incomingRows = [], organisationId = '', preserveLocal = () => false) {
  const incomingLeadRows = Array.isArray(incomingRows) ? incomingRows : []
  const incomingKeys = new Set(
    incomingLeadRows
      .map((row) => normalizeLeadIdentityKey(row?.leadId || row?.id))
      .filter(Boolean),
  )
  const mergedRows = mergeLeadRowsForStore(localRows, incomingLeadRows, organisationId)
  return mergedRows.filter((row) => {
    const key = normalizeLeadIdentityKey(row?.leadId || row?.id)
    if (incomingKeys.has(key)) return true
    return preserveLocal(row)
  })
}

function mergeLeadRowsForStore(localRows = [], incomingRows = [], organisationId = '') {
  const mergedById = new Map()
  for (const row of Array.isArray(localRows) ? localRows : []) {
    const normalized = normalizeLeadRecord(row, organisationId)
    const key = normalizeLeadIdentityKey(normalized?.leadId || normalized?.id)
    if (!key) continue
    mergedById.set(key, normalized)
  }

  for (const row of Array.isArray(incomingRows) ? incomingRows : []) {
    const incoming = normalizeLeadRecord(row, organisationId)
    const key = normalizeLeadIdentityKey(incoming?.leadId || incoming?.id)
    if (!key) continue
    const local = mergedById.get(key) || null
    if (!local) {
      mergedById.set(key, incoming)
      continue
    }
    const incomingUpdated = new Date(incoming?.updatedAt || incoming?.createdAt || 0).getTime()
    const localUpdated = new Date(local?.updatedAt || local?.createdAt || 0).getTime()
    const incomingWins = incomingUpdated >= localUpdated
    const incomingIsAuthoritativeLead = isUuidLike(normalizeLeadIdentityKey(incoming?.leadId || incoming?.id))
    const base = incomingWins ? { ...local, ...incoming } : { ...incoming, ...local }
    mergedById.set(key, normalizeLeadRecord({
      ...base,
      leadId: local.leadId || incoming.leadId,
      organisationId: normalizeText(base?.organisationId || organisationId) || null,
      assignedAgentName: normalizeText(base?.assignedAgentName || local?.assignedAgentName || incoming?.assignedAgentName),
      assignedAgentEmail: normalizeText(base?.assignedAgentEmail || local?.assignedAgentEmail || incoming?.assignedAgentEmail).toLowerCase(),
      sellerOnboardingToken: normalizeText(base?.sellerOnboardingToken || local?.sellerOnboardingToken || incoming?.sellerOnboardingToken),
      sellerOnboardingLink: normalizeText(base?.sellerOnboardingLink || local?.sellerOnboardingLink || incoming?.sellerOnboardingLink),
      sellerOnboardingStatus: normalizeText(base?.sellerOnboardingStatus || local?.sellerOnboardingStatus || incoming?.sellerOnboardingStatus),
      sellerLeadId: normalizeText(base?.sellerLeadId || local?.sellerLeadId || incoming?.sellerLeadId),
      sellerWorkflowLeadId: normalizeText(base?.sellerWorkflowLeadId || local?.sellerWorkflowLeadId || incoming?.sellerWorkflowLeadId),
      originatingCrmLeadId: normalizeText(base?.originatingCrmLeadId || local?.originatingCrmLeadId || incoming?.originatingCrmLeadId),
      privateListingId: normalizeText(base?.privateListingId || local?.privateListingId || incoming?.privateListingId),
      sellerName: normalizeText(base?.sellerName || local?.sellerName || incoming?.sellerName),
      sellerSurname: normalizeText(base?.sellerSurname || local?.sellerSurname || incoming?.sellerSurname),
      sellerEmail: normalizeText(base?.sellerEmail || local?.sellerEmail || incoming?.sellerEmail).toLowerCase(),
      sellerPhone: normalizeText(base?.sellerPhone || local?.sellerPhone || incoming?.sellerPhone),
      mandatePacketId: incomingIsAuthoritativeLead
        ? normalizeText(incoming?.mandatePacketId)
        : normalizeText(base?.mandatePacketId || local?.mandatePacketId || incoming?.mandatePacketId),
      mandateRuntimeDraftId: normalizeText(base?.mandateRuntimeDraftId || local?.mandateRuntimeDraftId || incoming?.mandateRuntimeDraftId),
      mandateStatus: normalizeText(base?.mandateStatus || local?.mandateStatus || incoming?.mandateStatus),
      mandateGeneratedAt: normalizeText(base?.mandateGeneratedAt || local?.mandateGeneratedAt || incoming?.mandateGeneratedAt),
      mandateSentAt: normalizeText(base?.mandateSentAt || local?.mandateSentAt || incoming?.mandateSentAt),
      listingId: incomingIsAuthoritativeLead
        ? normalizeText(incoming?.listingId)
        : normalizeText(base?.listingId || local?.listingId || incoming?.listingId),
      canvassingProspectId: normalizeText(base?.canvassingProspectId || local?.canvassingProspectId || incoming?.canvassingProspectId),
    }, organisationId))
  }

  return [...mergedById.values()]
}

function normalizeDeletionKeyPart(value) {
  return normalizeLowerText(value).replace(/\s+/g, ' ')
}

function addLeadDeletionIdKeys(keys, value) {
  const raw = normalizeText(value)
  if (!raw) return

  keys.add(`lead:${normalizeLowerText(raw)}`)

  const identityId = normalizeLeadIdentityKey(raw)
  if (identityId) keys.add(`lead:${normalizeLowerText(identityId)}`)

  if (/^lead_/i.test(raw)) {
    const withoutLeadPrefix = raw.replace(/^lead_/i, '')
    if (withoutLeadPrefix) keys.add(`lead:${normalizeLowerText(withoutLeadPrefix)}`)
    return
  }

  keys.add(`lead:${normalizeLowerText(`lead_${raw}`)}`)
}

function findLeadContact(store = {}, lead = {}) {
  const contactId = normalizeText(lead?.contactId || lead?.contact_id)
  if (!contactId) return null
  return (Array.isArray(store.contacts) ? store.contacts : []).find((row) =>
    normalizeText(row?.contactId || row?.contact_id || row?.id) === contactId
  ) || null
}

function getDeletedLeadKeySet(store = {}) {
  const keys = new Set()
  for (const id of Array.isArray(store.deletedLeadIds) ? store.deletedLeadIds : []) {
    const normalizedId = normalizeText(id)
    if (normalizedId) keys.add(`lead:${normalizeLowerText(normalizedId)}`)
    const identityId = normalizeLeadIdentityKey(id)
    if (identityId) keys.add(`lead:${normalizeLowerText(identityId)}`)
  }
  for (const key of Array.isArray(store.deletedLeadKeys) ? store.deletedLeadKeys : []) {
    const normalizedKey = normalizeText(key)
    if (normalizedKey) keys.add(normalizedKey)
    if (normalizedKey.startsWith('lead:')) {
      const identityKey = normalizeLeadIdentityKey(normalizedKey.slice(5))
      if (identityKey) keys.add(`lead:${normalizeLowerText(identityKey)}`)
    }
  }
  return keys
}

function getLeadDeletionKeys(lead = {}, store = {}) {
  const keys = new Set()
  const leadIdCandidates = [
    lead?.leadId,
    lead?.lead_id,
    lead?.id,
    lead?.sellerWorkflowLeadId,
    lead?.seller_workflow_lead_id,
    lead?.sellerLeadId,
    lead?.seller_lead_id,
    lead?.originatingCrmLeadId,
    lead?.originating_crm_lead_id,
    lead?.listingId,
    lead?.listing_id,
    lead?.privateListingId,
    lead?.private_listing_id,
  ]

  leadIdCandidates.forEach((candidate) => addLeadDeletionIdKeys(keys, candidate))

  const contact = findLeadContact(store, lead) || {}
  const category = normalizeDeletionKeyPart(lead?.leadCategory || lead?.lead_category || 'lead') || 'lead'
  const email = normalizeDeletionKeyPart(contact.email || lead?.email || lead?.sellerEmail || lead?.seller_email)
  const phone = normalizeDeletionKeyPart(contact.phone || lead?.phone || lead?.sellerPhone || lead?.seller_phone).replace(/[^0-9+]/g, '')
  const firstName = normalizeDeletionKeyPart(contact.firstName || contact.first_name || lead?.firstName || lead?.first_name || lead?.sellerName || lead?.seller_name)
  const lastName = normalizeDeletionKeyPart(contact.lastName || contact.last_name || lead?.lastName || lead?.last_name || lead?.sellerSurname || lead?.seller_surname)
  const property = normalizeDeletionKeyPart(
    lead?.propertyInterest ||
      lead?.property_interest ||
      lead?.sellerPropertyAddress ||
      lead?.seller_property_address ||
      lead?.propertyAddress ||
      lead?.property_address ||
      lead?.listingTitle ||
      lead?.listing_title,
  )

  if (email) keys.add(`identity:${category}:email:${email}`)
  if (phone) keys.add(`identity:${category}:phone:${phone}`)
  if (firstName || lastName) keys.add(`identity:${category}:name:${firstName}:${lastName}`)
  if (property && (email || phone || firstName || lastName)) keys.add(`identity:${category}:property:${property}`)

  return keys
}

function leadMatchesDeletedKeys(lead = {}, store = {}, deletedKeys = null) {
  const keys = deletedKeys || getDeletedLeadKeySet(store)
  if (!keys.size) return false
  const leadKeys = getLeadDeletionKeys(lead, store)
  for (const key of leadKeys) {
    if (keys.has(key)) return true
  }
  return false
}

function mergeDeletedLeadKeys(store = {}, keys = new Set()) {
  const existingKeys = getDeletedLeadKeySet(store)
  for (const key of keys) {
    const normalizedKey = normalizeText(key)
    if (normalizedKey) existingKeys.add(normalizedKey)
  }

  const leadIds = []
  const deletedKeys = []
  for (const key of existingKeys) {
    if (key.startsWith('lead:')) leadIds.push(key.slice(5))
    deletedKeys.push(key)
  }

  return {
    ...store,
    deletedLeadIds: leadIds.slice(-DELETED_LEAD_TOMBSTONE_LIMIT),
    deletedLeadKeys: deletedKeys.slice(-DELETED_LEAD_TOMBSTONE_LIMIT),
  }
}

function pruneDeletedLeadReferences(store = {}, deletedKeys = new Set()) {
  const removedLeadIds = new Set()
  const nextLeads = []
  for (const row of Array.isArray(store.leads) ? store.leads : []) {
    if (leadMatchesDeletedKeys(row, store, deletedKeys)) {
      const rowIds = [
        row?.leadId,
        row?.lead_id,
        row?.id,
        row?.sellerWorkflowLeadId,
        row?.seller_workflow_lead_id,
        row?.sellerLeadId,
        row?.seller_lead_id,
        row?.originatingCrmLeadId,
        row?.originating_crm_lead_id,
      ]
      rowIds.forEach((rowId) => {
        const normalized = normalizeText(rowId)
        if (normalized) removedLeadIds.add(normalized)
        const identityId = normalizeLeadIdentityKey(normalized)
        if (identityId) removedLeadIds.add(identityId)
        if (normalized && !/^lead_/i.test(normalized)) removedLeadIds.add(`lead_${normalized}`)
        if (/^lead_/i.test(normalized)) removedLeadIds.add(normalized.replace(/^lead_/i, ''))
      })
      continue
    }
    nextLeads.push(row)
  }

  if (!removedLeadIds.size) {
    return { store: { ...store, leads: nextLeads }, removedLeadIds }
  }

  return {
    store: {
      ...store,
      leads: nextLeads,
      leadActivities: (store.leadActivities || []).filter((row) => !removedLeadIds.has(normalizeLeadIdentityKey(row?.leadId || row?.lead_id))),
      tasks: (store.tasks || []).filter((row) => !removedLeadIds.has(normalizeLeadIdentityKey(row?.leadId || row?.lead_id))),
      deals: (store.deals || []).filter((row) => !removedLeadIds.has(normalizeLeadIdentityKey(row?.leadId || row?.lead_id))),
      transactions: (store.transactions || []).filter((row) => !removedLeadIds.has(normalizeLeadIdentityKey(row?.leadId || row?.lead_id))),
      appointments: (store.appointments || []).map((row) =>
        removedLeadIds.has(normalizeLeadIdentityKey(row?.leadId || row?.lead_id)) ? { ...row, leadId: '', updatedAt: new Date().toISOString() } : row,
      ),
    },
    removedLeadIds,
  }
}

function pruneDeletedLeadFromSiblingStores(organisationId, deletedKeys = new Set()) {
  if (typeof window === 'undefined' || !window.localStorage || !deletedKeys.size) return
  const currentKey = getStorageKey(organisationId)
  const prefix = `${STORAGE_PREFIX}:`
  const keys = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key && key.startsWith(prefix) && key !== currentKey) keys.push(key)
  }

  for (const key of keys) {
    const scopedOrg = key.slice(prefix.length)
    const store = mergeDeletedLeadKeys(safeReadStore(scopedOrg), deletedKeys)
    const pruned = pruneDeletedLeadReferences(store, deletedKeys).store
    writeStore(scopedOrg, pruned)
  }
}

export function filterDeletedAgencyLeadRows(organisationId, leads = [], contacts = []) {
  if (!isUnsafeFallbackAllowed()) {
    return Array.isArray(leads) ? leads : []
  }
  const store = {
    ...safeReadStore(organisationId),
    contacts: Array.isArray(contacts) ? contacts : [],
  }
  const deletedKeys = getDeletedLeadKeySet(store)
  return (Array.isArray(leads) ? leads : []).filter((lead) => !leadMatchesDeletedKeys(lead, store, deletedKeys))
}

export function recoverAgencyPipelineStoreForOrganisation(organisationId) {
  assertLocalFallbackAllowed('agencyPipelineService.recoverAgencyPipelineStoreForOrganisation', organisationId, 'legacy_local_crm_recovery')
  const targetOrgId = normalizeText(organisationId)
  if (!targetOrgId || targetOrgId === 'default') return { migrated: false, reason: 'no_target' }
  if (typeof window === 'undefined' || !window.localStorage) return { migrated: false, reason: 'no_storage' }

  const targetStore = safeReadStore(targetOrgId)
  if (getStoreRecordScore(targetStore) > 0) {
    return { migrated: false, reason: 'target_has_data' }
  }

  const prefix = `${STORAGE_PREFIX}:`
  const candidateStores = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key || !key.startsWith(prefix)) continue
    const scopedOrg = key.slice(prefix.length)
    if (!scopedOrg || scopedOrg === targetOrgId) continue
    const snapshot = safeReadStore(scopedOrg)
    const score = getStoreRecordScore(snapshot)
    if (score <= 0) continue
    candidateStores.push({ org: scopedOrg, snapshot, score })
  }

  if (!candidateStores.length) return { migrated: false, reason: 'no_candidates' }

  candidateStores.sort((left, right) => {
    if (left.org === 'default' && right.org !== 'default') return -1
    if (right.org === 'default' && left.org !== 'default') return 1
    return right.score - left.score
  })

  const selected = candidateStores[0]
  const merged = createEmptyStore(targetOrgId)
  const targetDeletedKeys = getDeletedLeadKeySet(targetStore)
  const selectedDeletedKeys = getDeletedLeadKeySet(selected.snapshot)
  const recoveryDeletedKeys = new Set([...targetDeletedKeys, ...selectedDeletedKeys])

  merged.contacts = dedupeRecordsByKey(selected.snapshot.contacts, (row) => row?.contactId || row?.id)
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  merged.leads = dedupeRecordsByKey(
    filterDeletedAgencyLeadRows(selected.org, selected.snapshot.leads, selected.snapshot.contacts)
      .filter((row) => !leadMatchesDeletedKeys(row, selected.snapshot, recoveryDeletedKeys)),
    (row) => row?.leadId || row?.id,
  )
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  const recoveredLeadIds = new Set(merged.leads.map((row) => normalizeLeadIdentityKey(row?.leadId || row?.id)).filter(Boolean))
  merged.leadActivities = dedupeRecordsByKey(selected.snapshot.leadActivities, (row) => row?.activityId || row?.id)
    .filter((row) => recoveredLeadIds.has(normalizeLeadIdentityKey(row?.leadId || row?.lead_id)))
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  merged.tasks = dedupeRecordsByKey(selected.snapshot.tasks, (row) => row?.taskId || row?.id)
    .filter((row) => recoveredLeadIds.has(normalizeLeadIdentityKey(row?.leadId || row?.lead_id)))
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  merged.appointments = dedupeRecordsByKey(selected.snapshot.appointments, (row) => row?.appointmentId || row?.id)
    .filter((row) => !normalizeText(row?.leadId || row?.lead_id) || recoveredLeadIds.has(normalizeLeadIdentityKey(row?.leadId || row?.lead_id)))
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  merged.appointmentParticipants = dedupeRecordsByKey(selected.snapshot.appointmentParticipants, (row) => row?.participantId || row?.id)
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  merged.deals = dedupeRecordsByKey(selected.snapshot.deals, (row) => row?.transactionId || row?.dealId || row?.id)
    .filter((row) => !normalizeText(row?.leadId || row?.lead_id) || recoveredLeadIds.has(normalizeLeadIdentityKey(row?.leadId || row?.lead_id)))
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  merged.transactions = dedupeRecordsByKey(
    Array.isArray(selected.snapshot.transactions) && selected.snapshot.transactions.length
      ? selected.snapshot.transactions
      : selected.snapshot.deals,
    (row) => row?.transactionId || row?.dealId || row?.id,
  )
    .filter((row) => !normalizeText(row?.leadId || row?.lead_id) || recoveredLeadIds.has(normalizeLeadIdentityKey(row?.leadId || row?.lead_id)))
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  merged.deletedLeadIds = [...new Set([...(targetStore.deletedLeadIds || []), ...(selected.snapshot.deletedLeadIds || [])])]
  merged.deletedLeadKeys = [...recoveryDeletedKeys]

  writeStore(targetOrgId, merged)
  return {
    migrated: true,
    fromOrganisationId: selected.org,
    toOrganisationId: targetOrgId,
    leads: merged.leads.length,
    contacts: merged.contacts.length,
    tasks: merged.tasks.length,
    appointments: merged.appointments.length,
  }
}

export function resolveAgencyPipelineStorageScope(preferredOrganisationId = '') {
  const preferred = normalizeText(preferredOrganisationId)
  if (preferred && preferred !== 'default') return preferred
  assertLocalFallbackAllowed('agencyPipelineService.resolveAgencyPipelineStorageScope', preferredOrganisationId, 'legacy_local_crm_scope_resolution')
  if (typeof window === 'undefined' || !window.localStorage) {
    throw new Error('A resolved organisation id is required before loading agency pipeline data.')
  }

  const prefix = `${STORAGE_PREFIX}:`
  const candidates = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key || !key.startsWith(prefix)) continue
    const scopedOrg = normalizeText(key.slice(prefix.length))
    if (!scopedOrg || scopedOrg === 'default') continue
    const snapshot = safeReadStore(scopedOrg)
    const score = getStoreRecordScore(snapshot)
    if (score <= 0) continue
    candidates.push({
      org: scopedOrg,
      score,
      updatedAt: new Date(snapshot?.updatedAt || snapshot?.createdAt || 0).getTime(),
    })
  }

  candidates.sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) return right.updatedAt - left.updatedAt
    return right.score - left.score
  })

  const resolved = candidates[0]?.org || preferred
  if (!resolved || resolved === 'default') {
    throw new Error('A resolved organisation id is required before loading agency pipeline data.')
  }
  return resolved
}

function emitAgencyCrmUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(CRM_UPDATED_EVENT))
}

function resolveAgentSnapshot(agent = {}) {
  const id = normalizeText(agent?.id || agent?.userId || agent?.email)
  return {
    id,
    name: normalizeText(agent?.name || agent?.fullName || agent?.email || 'Assigned Agent'),
    email: normalizeText(agent?.email).toLowerCase(),
  }
}

function findOrCreateContact(store, input, organisationId, assignedAgent) {
  const contactId = normalizeText(input?.contactId || input?.contact_id)
  const email = normalizeText(input?.email).toLowerCase()
  const phone = normalizeText(input?.phone)
  const firstName = normalizeText(input?.firstName || input?.name)
  const lastName = normalizeText(input?.lastName)

  const existing = store.contacts.find((row) => {
    if (contactId && normalizeText(row?.contactId || row?.contact_id || row?.id) === contactId) return true
    if (email && normalizeText(row?.email).toLowerCase() === email) return true
    if (phone && normalizeText(row?.phone) === phone) return true
    return false
  })

  if (existing) {
    const updated = {
      ...existing,
      firstName: firstName || existing.firstName,
      lastName: lastName || existing.lastName,
      phone: phone || existing.phone,
      email: email || existing.email,
      contactType: normalizeText(input?.contactType || existing.contactType || 'Lead'),
      assignedAgentId: assignedAgent.id || existing.assignedAgentId || null,
      assignedAgentName: assignedAgent.name || existing.assignedAgentName || null,
      assignedAgentEmail: assignedAgent.email || existing.assignedAgentEmail || null,
      notes: normalizeText(input?.notes || existing.notes),
      updatedAt: new Date().toISOString(),
    }
    store.contacts = store.contacts.map((row) => (row.contactId === existing.contactId ? updated : row))
    return updated
  }

  const created = {
    contactId: contactId || createUuid(),
    organisationId,
    assignedAgentId: assignedAgent.id || null,
    assignedAgentName: assignedAgent.name || null,
    assignedAgentEmail: assignedAgent.email || null,
    firstName: firstName || 'Contact',
    lastName: lastName || '',
    phone,
    email,
    contactType: normalizeText(input?.contactType || 'Lead'),
    notes: normalizeText(input?.notes),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  store.contacts = [created, ...store.contacts]
  return created
}

function normalizeLeadRecord(lead = {}, organisationId) {
  const notes = normalizeText(lead.notes)
  const canvassingProspectIdFromNotes = (() => {
    const match = notes.match(/Canvassing Prospect ID:\s*([^\s|]+)/i)
    return normalizeText(match?.[1])
  })()
  const canvassingProspectId = normalizeText(lead.canvassingProspectId || lead.canvassing_prospect_id || canvassingProspectIdFromNotes)
  const explicitLeadSource = normalizeText(lead.leadSource || lead.lead_source || lead.source || lead.source_label || lead.origin)
  const leadSource = explicitLeadSource && !['unknown', 'other'].includes(explicitLeadSource.toLowerCase())
    ? explicitLeadSource
    : canvassingProspectId || /canvassing prospect id:/i.test(notes)
      ? 'Canvassing'
      : explicitLeadSource || 'Other'
  const sellerOnboarding =
    lead?.sellerOnboarding && typeof lead.sellerOnboarding === 'object'
      ? {
          ...lead.sellerOnboarding,
          token: normalizeText(lead?.sellerOnboarding?.token || lead?.sellerOnboardingToken) || null,
          status: normalizeText(lead?.sellerOnboarding?.status || lead?.sellerOnboardingStatus),
          formData:
            lead?.sellerOnboarding?.formData && typeof lead.sellerOnboarding.formData === 'object'
              ? lead.sellerOnboarding.formData
              : {},
        }
      : null
  const normalizedLead = {
    leadId: normalizeText(lead.leadId),
    organisationId: normalizeText(lead.organisationId || organisationId) || null,
    branchId: normalizeText(lead.branchId || lead.branch_id),
    assignedUserId: normalizeText(lead.assignedUserId || lead.assigned_user_id),
    createdBy: normalizeText(lead.createdBy || lead.created_by),
    assignedAgentId: normalizeText(lead.assignedAgentId),
    assignedAgentName: normalizeText(lead.assignedAgentName),
    assignedAgentEmail: normalizeText(lead.assignedAgentEmail).toLowerCase(),
    assignedAgentPhone: normalizeText(lead.assignedAgentPhone),
    contactId: normalizeText(lead.contactId),
    leadCategory: inferLeadCategoryFromRecord(lead, 'other'),
    leadDirection: normalizeListValue(lead.leadDirection, LEAD_DIRECTIONS, 'Inbound'),
    leadSource,
    stage: normalizeListValue(lead.stage, LEAD_STAGES, 'Lead'),
    status: normalizeText(lead.status || lead.stage || 'Lead'),
    priority: normalizeListValue(lead.priority, LEAD_PRIORITIES, 'Medium'),
    budget: Number(lead.budget || 0) || 0,
    areaInterest: normalizeText(lead.areaInterest),
    propertyInterest: normalizeText(lead.propertyInterest),
    sellerPropertyAddress: normalizeText(lead.sellerPropertyAddress),
    estimatedValue: Number(lead.estimatedValue || 0) || 0,
    notes,
    canvassingProspectId,
    sellerName: normalizeText(lead.sellerName),
    sellerSurname: normalizeText(lead.sellerSurname),
    sellerEmail: normalizeText(lead.sellerEmail).toLowerCase(),
    sellerPhone: normalizeText(lead.sellerPhone),
    sellerOnboardingToken: normalizeText(lead.sellerOnboardingToken),
    sellerOnboardingLink: normalizeText(lead.sellerOnboardingLink),
    sellerOnboardingStatus: normalizeText(lead.sellerOnboardingStatus),
    sellerOnboarding,
    sellerLeadId: normalizeText(lead.sellerLeadId || lead.seller_lead_id),
    sellerWorkflowLeadId: normalizeText(lead.sellerWorkflowLeadId),
    originatingCrmLeadId: normalizeText(lead.originatingCrmLeadId || lead.originating_crm_lead_id),
    privateListingId: normalizeText(lead.privateListingId || lead.private_listing_id),
    mandatePacketId: normalizeText(lead.mandatePacketId),
    mandateRuntimeDraftId: normalizeText(lead.mandateRuntimeDraftId),
    mandateStatus: normalizeText(lead.mandateStatus),
    mandateGeneratedAt: normalizeText(lead.mandateGeneratedAt),
    mandateSentAt: normalizeText(lead.mandateSentAt),
    listingId: normalizeText(lead.listingId || lead.listing_id),
    syncStatus: normalizeText(lead.syncStatus || lead.sync_status),
    syncError: normalizeText(lead.syncError || lead.sync_error),
    propertyAddress: normalizeText(lead.propertyAddress),
    propertyType: normalizeText(lead.propertyType),
    listingTitle: normalizeText(lead.listingTitle),
    branchName: normalizeText(lead.branchName),
    agentFfcNumber: normalizeText(lead.agentFfcNumber),
    createdAt: lead.createdAt || new Date().toISOString(),
    updatedAt: lead.updatedAt || new Date().toISOString(),
    convertedDealId: normalizeText(lead.convertedDealId) || null,
    convertedTransactionId: normalizeText(lead.convertedTransactionId) || normalizeText(lead.convertedDealId) || null,
  }
  return migrateBuyerProcessLeadRecord(normalizedLead)
}

export function getAgencyPipelineSnapshot(organisationId) {
  if (!localFallbackAllowed('agencyPipelineService.getAgencyPipelineSnapshot', organisationId, 'local_crm_snapshot')) {
    return createEmptyStore(organisationId)
  }
  const store = safeReadStore(organisationId)
  const deletedKeys = getDeletedLeadKeySet(store)
  const dedupeMap = new Map()
  for (const row of Array.isArray(store.leads) ? store.leads : []) {
    if (leadMatchesDeletedKeys(row, store, deletedKeys)) continue
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

export function reconcileAgencyPipelineSnapshot(organisationId, snapshot = {}, options = {}) {
  if (!localFallbackAllowed('agencyPipelineService.reconcileAgencyPipelineSnapshot', organisationId, 'local_crm_snapshot_merge')) {
    return {
      ...createEmptyStore(organisationId),
      contacts: Array.isArray(snapshot.contacts) ? snapshot.contacts : [],
      leads: Array.isArray(snapshot.leads) ? snapshot.leads.map((row) => normalizeLeadRecord(row, organisationId)) : [],
      leadActivities: Array.isArray(snapshot.leadActivities) ? snapshot.leadActivities : [],
      tasks: Array.isArray(snapshot.tasks) ? snapshot.tasks : [],
      appointments: Array.isArray(snapshot.appointments) ? snapshot.appointments : [],
      appointmentParticipants: Array.isArray(snapshot.appointmentParticipants) ? snapshot.appointmentParticipants : [],
      transactions: Array.isArray(snapshot.transactions) ? snapshot.transactions : [],
      deals: Array.isArray(snapshot.deals) ? snapshot.deals : [],
    }
  }
  const store = safeReadStore(organisationId)
  const nextStore = {
    ...store,
  }
  const replaceCollections = new Set(Array.isArray(options?.replaceCollections) ? options.replaceCollections : [])
  const originalContactsJson = JSON.stringify(Array.isArray(store.contacts) ? store.contacts : [])
  const originalLeadsJson = JSON.stringify(Array.isArray(store.leads) ? store.leads : [])
  const originalActivitiesJson = JSON.stringify(Array.isArray(store.leadActivities) ? store.leadActivities : [])
  const originalTasksJson = JSON.stringify(Array.isArray(store.tasks) ? store.tasks : [])

  if (Array.isArray(snapshot.contacts)) {
    const normalizedIncomingContacts = snapshot.contacts.map((row) => ({
      ...row,
      organisationId: normalizeText(row?.organisationId || organisationId) || null,
    }))
    nextStore.contacts = replaceCollections.has('contacts')
      ? buildRemotePreferredRows(
          store.contacts || [],
          normalizedIncomingContacts,
          (row) => row?.contactId || row?.contact_id || row?.id,
          (row) => !isUuidLike(row?.contactId || row?.contact_id || row?.id),
        )
      : dedupeRecordsByKey(
          [...(store.contacts || []), ...normalizedIncomingContacts],
          (row) => row?.contactId || row?.contact_id || row?.id,
        )
  }

  if (Array.isArray(snapshot.leads)) {
    const mergedLeads = replaceCollections.has('leads')
      ? replaceLeadRowsForStore(
          store.leads || [],
          snapshot.leads || [],
          organisationId,
          (row) => (
            !isUuidLike(row?.leadId || row?.lead_id || row?.id) ||
            Boolean(normalizeText(row?.canvassingProspectId || row?.canvassing_prospect_id)) ||
            normalizeText(row?.syncStatus || row?.sync_status) === 'pending_remote_sync'
          ),
        )
      : mergeLeadRowsForStore(store.leads || [], snapshot.leads || [], organisationId)
    nextStore.leads = filterDeletedAgencyLeadRows(
      organisationId,
      mergedLeads,
      nextStore.contacts || store.contacts || [],
    )
  }

  if (Array.isArray(snapshot.leadActivities)) {
    const normalizedIncomingActivities = snapshot.leadActivities.map((row) => ({
      ...row,
      organisationId: normalizeText(row?.organisationId || organisationId) || null,
    }))
    nextStore.leadActivities = replaceCollections.has('leadActivities')
      ? buildRemotePreferredRows(
          store.leadActivities || [],
          normalizedIncomingActivities,
          (row) => row?.activityId || row?.id,
          (row) => !isUuidLike(row?.activityId || row?.id),
        )
      : dedupeRecordsByKey(
          [...(store.leadActivities || []), ...normalizedIncomingActivities],
          (row) => row?.activityId || row?.id,
        )
  }

  if (Array.isArray(snapshot.tasks)) {
    const normalizedIncomingTasks = snapshot.tasks.map((row) => ({
      ...row,
      organisationId: normalizeText(row?.organisationId || organisationId) || null,
    }))
    nextStore.tasks = replaceCollections.has('tasks')
      ? buildRemotePreferredRows(
          store.tasks || [],
          normalizedIncomingTasks,
          (row) => row?.taskId || row?.id,
          (row) => !isUuidLike(row?.taskId || row?.id),
        )
      : dedupeRecordsByKey(
          [...(store.tasks || []), ...normalizedIncomingTasks],
          (row) => row?.taskId || row?.id,
        )
  }

  const nextContactsJson = JSON.stringify(Array.isArray(nextStore.contacts) ? nextStore.contacts : [])
  const nextLeadsJson = JSON.stringify(Array.isArray(nextStore.leads) ? nextStore.leads : [])
  const nextActivitiesJson = JSON.stringify(Array.isArray(nextStore.leadActivities) ? nextStore.leadActivities : [])
  const nextTasksJson = JSON.stringify(Array.isArray(nextStore.tasks) ? nextStore.tasks : [])
  if (
    nextContactsJson !== originalContactsJson ||
    nextLeadsJson !== originalLeadsJson ||
    nextActivitiesJson !== originalActivitiesJson ||
    nextTasksJson !== originalTasksJson
  ) {
    writeStore(organisationId, nextStore)
  }
  return getAgencyPipelineSnapshot(organisationId)
}

export function listAgencyLeads(organisationId, { agentId = '', includeAll = false } = {}) {
  const store = getAgencyPipelineSnapshot(organisationId)
  const normalizedAgentId = normalizeText(agentId).toLowerCase()
  const rows = store.leads.map((row) => normalizeLeadRecord(row, organisationId))
  if (includeAll || !normalizedAgentId) return rows
  return rows.filter((lead) => {
    const assignedId = normalizeText(lead.assignedAgentId).toLowerCase()
    const assignedEmail = normalizeText(lead.assignedAgentEmail).toLowerCase()
    return assignedId === normalizedAgentId || assignedEmail === normalizedAgentId
  })
}

export function createAgencyLead(organisationId, payload = {}, { actor = null } = {}) {
  assertLocalFallbackAllowed('agencyPipelineService.createAgencyLead', organisationId)
  const store = safeReadStore(organisationId)
  const assignedAgent = resolveAgentSnapshot(payload?.assignedAgent || actor || {})
  const leadPayload = {
    ...payload,
    ...(payload?.lead && typeof payload.lead === 'object' ? payload.lead : {}),
  }
  const contact = findOrCreateContact(store, payload?.contact || {}, organisationId, assignedAgent)
  const draftLeadForTombstone = {
    ...(payload || {}),
    contactId: contact.contactId,
    leadCategory: inferLeadCategoryFromRecord(payload, 'other'),
  }
  const newLeadKeys = getLeadDeletionKeys(draftLeadForTombstone, store)
  store.deletedLeadKeys = (store.deletedLeadKeys || []).filter((key) => !newLeadKeys.has(normalizeText(key)))
  store.deletedLeadIds = store.deletedLeadIds || []
  const canvassingProspectId = normalizeText(payload?.canvassingProspectId)

  if (canvassingProspectId) {
    const existingLead = (Array.isArray(store.leads) ? store.leads : [])
      .map((row) => normalizeLeadRecord(row, organisationId))
      .find((row) => normalizeLowerText(row?.canvassingProspectId) === normalizeLowerText(canvassingProspectId))
    if (existingLead) {
      return existingLead
    }
  }

  const nextLead = normalizeLeadRecord(
    {
      leadId: normalizeText(leadPayload?.leadId) || createUuid(),
      organisationId,
      branchId: normalizeText(leadPayload?.branchId || payload?.branchId || assignedAgent.branchId),
      assignedUserId: normalizeText(leadPayload?.assignedUserId || payload?.assignedUserId || assignedAgent.userId || assignedAgent.id),
      createdBy: normalizeText(leadPayload?.createdBy || payload?.createdBy || actor?.id),
      assignedAgentId: assignedAgent.id || null,
      assignedAgentName: assignedAgent.name || null,
      assignedAgentEmail: assignedAgent.email || null,
      contactId: contact.contactId,
      leadCategory: inferLeadCategoryFromRecord(leadPayload, 'other'),
      leadDirection: leadPayload?.leadDirection || 'Inbound',
      leadSource: leadPayload?.leadSource || 'Other',
      stage: leadPayload?.stage || 'Lead',
      status: leadPayload?.status || leadPayload?.stage || 'Lead',
      priority: leadPayload?.priority || 'Medium',
      budget: leadPayload?.budget || 0,
      areaInterest: leadPayload?.areaInterest || '',
      propertyInterest: leadPayload?.propertyInterest || '',
      sellerPropertyAddress: leadPayload?.sellerPropertyAddress || '',
      estimatedValue: leadPayload?.estimatedValue || 0,
      listingId: leadPayload?.listingId || leadPayload?.listing_id || '',
      notes: leadPayload?.notes || '',
      canvassingProspectId,
      sellerName: leadPayload?.sellerName || contact.firstName,
      sellerSurname: leadPayload?.sellerSurname || contact.lastName,
      sellerEmail: leadPayload?.sellerEmail || contact.email,
      sellerPhone: leadPayload?.sellerPhone || contact.phone,
      syncStatus: leadPayload?.syncStatus || leadPayload?.sync_status || '',
      syncError: leadPayload?.syncError || leadPayload?.sync_error || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    organisationId,
  )

  store.leads = [nextLead, ...store.leads]
  writeStore(organisationId, store)

  addLeadActivity(organisationId, nextLead.leadId, {
    agent: actor || assignedAgent,
    activityType: 'Lead Created',
    activityNote: 'lead_created',
    outcome: 'Lead captured',
    activityDate: new Date().toISOString(),
  })

  return nextLead
}

export function updateAgencyLead(organisationId, leadId, updater = {}) {
  assertLocalFallbackAllowed('agencyPipelineService.updateAgencyLead', organisationId)
  const store = safeReadStore(organisationId)
  const targetId = normalizeLeadIdentityKey(leadId)
  let updatedLead = null

  store.leads = store.leads.map((row) => {
    if (normalizeLeadIdentityKey(row?.leadId) !== targetId) return row
    const merged = normalizeLeadRecord(
      {
        ...row,
        ...updater,
        leadId: row.leadId,
        organisationId: row.organisationId,
        updatedAt: new Date().toISOString(),
      },
      organisationId,
    )
    updatedLead = merged
    return merged
  })

  writeStore(organisationId, store)
  return updatedLead
}

export function updateAgencyContact(organisationId, contactId, updater = {}) {
  assertLocalFallbackAllowed('agencyPipelineService.updateAgencyContact', organisationId)
  const store = safeReadStore(organisationId)
  const targetId = normalizeText(contactId)
  if (!targetId) return null
  let updatedContact = null

  store.contacts = store.contacts.map((row) => {
    if (normalizeText(row?.contactId) !== targetId) return row
    const merged = {
      ...row,
      ...updater,
      contactId: row.contactId,
      organisationId: row.organisationId,
      email: normalizeText(updater?.email ?? row?.email).toLowerCase(),
      phone: normalizeText(updater?.phone ?? row?.phone),
      firstName: normalizeText(updater?.firstName ?? row?.firstName) || 'Contact',
      lastName: normalizeText(updater?.lastName ?? row?.lastName),
      contactType: normalizeText(updater?.contactType ?? row?.contactType) || 'Lead',
      notes: normalizeText(updater?.notes ?? row?.notes),
      updatedAt: new Date().toISOString(),
    }
    updatedContact = merged
    return merged
  })

  writeStore(organisationId, store)
  return updatedContact
}

export function deleteAgencyLead(organisationId, leadId) {
  assertLocalFallbackAllowed('agencyPipelineService.deleteAgencyLead', organisationId)
  const store = safeReadStore(organisationId)
  const targetId = normalizeLeadIdentityKey(leadId)
  if (!targetId) return false

  const targetLead = store.leads.find((row) => normalizeLeadIdentityKey(row?.leadId || row?.lead_id || row?.id) === targetId) || { leadId: targetId }
  const deletedKeys = getLeadDeletionKeys(targetLead, store)
  const storeWithTombstones = mergeDeletedLeadKeys(store, deletedKeys)
  const pruned = pruneDeletedLeadReferences(storeWithTombstones, deletedKeys)
  const originalCount = store.leads.length

  writeStore(organisationId, pruned.store)
  pruneDeletedLeadFromSiblingStores(organisationId, deletedKeys)
  return pruned.store.leads.length !== originalCount || pruned.removedLeadIds.size > 0
}

export function addLeadActivity(organisationId, leadId, payload = {}) {
  assertLocalFallbackAllowed('agencyPipelineService.addLeadActivity', organisationId)
  const store = safeReadStore(organisationId)
  const agent = resolveAgentSnapshot(payload?.agent || {})
  const next = {
    activityId: createId('activity'),
    organisationId: normalizeText(organisationId) || null,
    leadId: normalizeText(leadId),
    agentId: agent.id || null,
    agentName: agent.name || null,
    agentEmail: agent.email || null,
    activityType: normalizeListValue(payload?.activityType, ACTIVITY_TYPES, 'Note'),
    activityNote: normalizeText(payload?.activityNote),
    activityDate: payload?.activityDate || new Date().toISOString(),
    outcome: normalizeText(payload?.outcome),
    createdAt: new Date().toISOString(),
  }

  store.leadActivities = [next, ...store.leadActivities]
  writeStore(organisationId, store)
  return next
}

export function updateLeadActivity(organisationId, activityId, updater = {}) {
  assertLocalFallbackAllowed('agencyPipelineService.updateLeadActivity', organisationId)
  const store = safeReadStore(organisationId)
  const targetId = normalizeText(activityId)
  if (!targetId) return null
  let updatedActivity = null

  store.leadActivities = store.leadActivities.map((row) => {
    if (normalizeText(row?.activityId) !== targetId) return row
    const merged = {
      ...row,
      ...updater,
      activityId: row.activityId,
      organisationId: row.organisationId,
      activityType: normalizeListValue(updater?.activityType || row?.activityType, ACTIVITY_TYPES, 'Note'),
      activityNote: normalizeText(updater?.activityNote ?? row?.activityNote),
      activityDate: updater?.activityDate || row?.activityDate || new Date().toISOString(),
      outcome: normalizeText(updater?.outcome ?? row?.outcome),
      createdAt: row.createdAt || new Date().toISOString(),
    }
    updatedActivity = merged
    return merged
  })

  writeStore(organisationId, store)
  return updatedActivity
}

export function deleteLeadActivity(organisationId, activityId) {
  assertLocalFallbackAllowed('agencyPipelineService.deleteLeadActivity', organisationId)
  const store = safeReadStore(organisationId)
  const targetId = normalizeText(activityId)
  if (!targetId) return false
  const originalCount = store.leadActivities.length
  store.leadActivities = store.leadActivities.filter((row) => normalizeText(row?.activityId) !== targetId)
  writeStore(organisationId, store)
  return store.leadActivities.length !== originalCount
}

export function listLeadActivities(organisationId, leadId, { includeAll = false, agentId = '' } = {}) {
  const store = safeReadStore(organisationId)
  const targetLeadId = normalizeText(leadId)
  const normalizedAgentId = normalizeText(agentId).toLowerCase()
  const rows = store.leadActivities.filter((row) => normalizeText(row?.leadId) === targetLeadId)
  if (includeAll || !normalizedAgentId) return rows
  return rows.filter((row) => {
    const id = normalizeText(row?.agentId).toLowerCase()
    const email = normalizeText(row?.agentEmail).toLowerCase()
    return id === normalizedAgentId || email === normalizedAgentId
  })
}

function resolveTaskStatus(task) {
  const current = normalizeListValue(task?.status, TASK_STATUSES, 'Pending')
  if (current === 'Completed' || current === 'Cancelled') return current
  const due = normalizeText(task?.dueDate)
  if (!due) return current
  const dueDate = new Date(due)
  if (Number.isNaN(dueDate.getTime())) return current
  if (dueDate.getTime() < Date.now()) return 'Overdue'
  return current
}

function mapLegacyAppointmentStatus(value) {
  const normalized = normalizeLabel(value).toLowerCase()
  if (!normalized) return 'requested'
  if (APPOINTMENT_STATUSES.includes(normalized)) return normalized
  if (normalized === 'draft') return 'draft'
  if (normalized === 'pending' || normalized === 'pending confirmation') return 'requested'
  if (normalized === 'requested') return 'requested'
  if (normalized === 'accepted' || normalized === 'proposed') return 'accepted'
  if (['confirmed', 'buyer confirmed', 'buyer_confirmed', 'client confirmed', 'client_confirmed'].includes(normalized)) return 'confirmed'
  if (normalized === 'completed') return 'completed'
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled'
  if (normalized === 'declined') return 'declined'
  if (normalized === 'needs reschedule' || normalized === 'needs_reschedule' || normalized === 'reschedule requested' || normalized === 'reschedule_requested') return 'alternative_requested'
  if (normalized === 'alternative requested') return 'alternative_requested'
  if (normalized === 'alternative proposed') return 'alternative_proposed'
  if (normalized === 'no show' || normalized === 'no-show') return 'no_show'
  return normalized
}

function mapLegacyRsvpStatus(value) {
  const normalized = normalizeLabel(value).toLowerCase()
  if (!normalized) return 'Pending'
  if (normalized === 'accepted') return 'Accepted'
  if (normalized === 'declined') return 'Declined'
  if (normalized === 'proposed new time') return 'Proposed New Time'
  return 'Pending'
}

function normalizeAppointmentType(value) {
  return normalizeAppointmentTypeKey(value)
}

function normalizeAppointmentStatus(value) {
  return mapLegacyAppointmentStatus(value)
}

function normalizeExternalCalendarStatus(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (['not_synced', 'ics_generated', 'sync_pending', 'synced', 'sync_failed'].includes(normalized)) {
    return normalized
  }
  return 'not_synced'
}

function normalizeAppointmentLocationType(value) {
  const normalized = normalizeLowerText(value)
  if (!normalized) return 'to_be_confirmed'
  if (APPOINTMENT_LOCATION_TYPES.includes(normalized)) return normalized
  if (normalized === 'physical') return 'physical_address'
  if (normalized === 'address' || normalized === 'onsite' || normalized === 'inperson' || normalized === 'in person') return 'physical_address'
  if (normalized === 'call' || normalized === 'phone' || normalized === 'phonecall') return 'phone_call'
  if (normalized === 'videocall' || normalized === 'video' || normalized === 'zoom') return 'video_call'
  if (normalized === 'tbc' || normalized === 'to be confirmed') return 'to_be_confirmed'
  return 'to_be_confirmed'
}

function deriveDateTime({ date = '', startTime = '', timezone = DEFAULT_APPOINTMENT_BUSINESS_HOURS.timezone } = {}) {
  if (!normalizeText(date)) return null
  try { return appointmentLocalToIso(date, normalizeText(startTime) || '00:00', timezone) }
  catch { return null }
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
    timezone: appointment?.timezone,
  })
  if (!derived) return NaN
  const parsed = new Date(derived)
  return Number.isNaN(parsed.getTime()) ? NaN : parsed.getTime()
}

function normalizeParticipantRecord(participant = {}, { appointmentId = '', organisationId = '' } = {}) {
  const participantRole = normalizeLabel(participant?.participantRole || participant?.role || 'Other Contact')
  const normalizedRole = APPOINTMENT_PARTICIPANT_ROLES.includes(participantRole) ? participantRole : 'Other Contact'
  const rsvpStatus = mapLegacyRsvpStatus(participant?.rsvpStatus || participant?.responseStatus || participant?.response_status)
  return {
    participantId: normalizeText(participant?.participantId || participant?.id) || createId('participant'),
    appointmentId: normalizeText(participant?.appointmentId || appointmentId),
    organisationId: normalizeText(participant?.organisationId || organisationId) || null,
    userId: normalizeText(participant?.userId || participant?.user_id) || null,
    contactId: normalizeText(participant?.contactId || participant?.contact_id) || null,
    name: normalizeText(participant?.name),
    email: normalizeText(participant?.email).toLowerCase(),
    phone: normalizeText(participant?.phone),
    participantRole: normalizedRole,
    isRequired: participant?.isRequired === false || participant?.is_required === false ? false : true,
    rsvpStatus,
    proposedNewTime: normalizeText(participant?.proposedNewTime || participant?.proposed_new_time) || null,
    rsvpComment: normalizeText(participant?.rsvpComment || participant?.rsvp_comment) || null,
    rsvpToken: normalizeText(participant?.rsvpToken || participant?.rsvp_token) || createUuid(),
    invitationSentAt: participant?.invitationSentAt || participant?.invitation_sent_at || null,
    lastInvitationSentAt: participant?.lastInvitationSentAt || participant?.last_invitation_sent_at || null,
    respondedAt: participant?.respondedAt || participant?.responded_at || null,
    rsvpRevokedAt: participant.rsvpRevokedAt || participant.rsvp_revoked_at || null,
    proposalId: participant.proposalId || participant.proposal_id || null,
    proposalResponse: participant.proposalResponse || participant.proposal_response || null,
    createdAt: participant?.createdAt || participant?.created_at || new Date().toISOString(),
    updatedAt: participant?.updatedAt || participant?.updated_at || new Date().toISOString(),
  }
}

function normalizeAppointmentRecord(appointment = {}, { organisationId = '', fallbackLeadId = '', validateSchedule = false } = {}) {
  const appointmentType = normalizeAppointmentType(appointment?.appointmentType || appointment?.appointment_type)
  const appointmentTypeDefinition = getAppointmentTypeDefinition(appointmentType)
  const appointmentTypeTemplate = getAppointmentTypeTemplate(appointmentType)
  const schedule = resolveAppointmentSchedule(appointment, {
    defaultDurationMinutes: appointmentTypeTemplate.defaultDurationMinutes,
    strict: validateSchedule,
  })
  const templated = applyAppointmentTemplate(appointmentType, {
    ...appointment,
    ...schedule,
  })
  const linkedWorkflow = normalizeText(templated?.linkedWorkflow) || null
  const linkedWorkflowStage = normalizeText(templated?.linkedWorkflowStage) || null
  const linkedTaskId = normalizeText(appointment?.linkedTaskId || appointment?.linked_task_id) || null
  const linkedTransactionStage = normalizeText(appointment?.linkedTransactionStage || appointment?.linked_transaction_stage) || null
  const visibility = normalizeText(templated?.visibility) || getAppointmentVisibilityDefault(appointmentTypeDefinition.type)
  const completionBehavior = normalizeText(templated?.completionBehavior) || getAppointmentCompletionBehavior(appointmentTypeDefinition.type)
  const instructions =
    normalizeText(templated?.instructions) ||
    getAppointmentTemplateInstructions(appointmentTypeDefinition.type, 'client') ||
    null
  const requiredDocuments = Array.isArray(templated?.requiredDocuments)
    ? templated.requiredDocuments
    : appointmentTypeDefinition.requiredDocuments || []
  const workflowCompletionEffect =
    appointment?.workflowCompletionEffect ||
    appointment?.workflow_completion_effect ||
    (getAppointmentCompletionEffects(appointmentTypeDefinition.type).length
      ? { completionEffects: getAppointmentCompletionEffects(appointmentTypeDefinition.type) }
      : {})
  const resourceId = normalizeText(appointment?.resourceId || appointment?.resource_id) || null
  const allowOutsideBusinessHours = Boolean(
    appointment?.allowOutsideBusinessHours === true ||
    appointment?.allow_outside_business_hours === true,
  )
  const schedulingOverrideReason = normalizeText(
    appointment?.schedulingOverrideReason || appointment?.scheduling_override_reason,
  ) || null
  const externalCalendarStatus = normalizeExternalCalendarStatus(
    appointment?.externalCalendarStatus || appointment?.external_calendar_status,
  )

  return {
    appointmentId: normalizeText(appointment?.appointmentId || appointment?.id) || createUuid(),
    organisationId: normalizeText(appointment?.organisationId || organisationId) || null,
    assignedAgentId: normalizeText(appointment?.assignedAgentId || appointment?.agentId),
    schedulingOwnerUserId: normalizeText(appointment?.schedulingOwnerUserId || appointment?.scheduling_owner_user_id) || null,
    assignedAgentName: normalizeText(appointment?.assignedAgentName || appointment?.agentName),
    assignedAgentEmail: normalizeText(appointment?.assignedAgentEmail || appointment?.agentEmail).toLowerCase(),
    appointmentType,
    customTypeLabel: normalizeText(appointment?.customTypeLabel || appointment?.custom_type_label) || null,
    appointmentTypeLabel: getAppointmentTypeLabel(appointmentType),
    title: normalizeText(templated?.title) || appointmentTypeDefinition.title,
    date: schedule.date || null,
    startTime: schedule.startTime || null,
    endTime: schedule.endTime || null,
    dateTime: schedule.dateTime,
    endDateTime: schedule.endDateTime,
    schedulingTimeIssue: schedule.schedulingTimeIssue,
    archivedAt: appointment.archivedAt || appointment.archived_at || null,
    archivedBy: appointment.archivedBy || appointment.archived_by || null,
    archiveReason: normalizeText(appointment.archiveReason || appointment.archive_reason) || null,
    calendarRevision: Number(appointment.calendarRevision ?? appointment.calendar_revision ?? 0),
    attorneyDeliveryEnabled: appointment.attorneyDeliveryEnabled ?? appointment.attorney_delivery_enabled ?? null,
    listingViewingRoundNumber: appointment.listingViewingRoundNumber ?? appointment.listing_viewing_round_number ?? null,
    reservationManaged: appointment.reservationManaged === true || appointment.reservation_managed === true,
    requestIssuedAt: appointment.requestIssuedAt || appointment.request_issued_at || null,
    holdExpiresAt: appointment.holdExpiresAt || appointment.hold_expires_at || null,
    hasConfirmedReservation: appointment.hasConfirmedReservation === true || appointment.has_confirmed_reservation === true,
    reservationState: appointmentReservationState(appointment),
    participants: Array.isArray(appointment.participants) ? appointment.participants : [],
    locationType: normalizeAppointmentLocationType(appointment?.locationType || appointment?.location_type),
    location: normalizeText(appointment?.location),
    meetingUrl: normalizeText(appointment?.meetingUrl || appointment?.meeting_url) || null,
    timezone: schedule.timezone,
    allDay: appointment?.allDay === true || appointment?.all_day === true,
    leadId: normalizeText(appointment?.leadId || fallbackLeadId) || null,
    contactId: normalizeText(appointment?.contactId) || null,
    listingId: normalizeText(appointment?.listingId) || null,
    transactionId: normalizeText(appointment?.transactionId) || null,
    relatedEntityType: normalizeText(appointment?.relatedEntityType || appointment?.related_entity_type) || null,
    relatedEntityId: normalizeText(appointment?.relatedEntityId || appointment?.related_entity_id) || null,
    linkedWorkflow,
    linkedWorkflowStage,
    linkedTaskId,
    linkedTransactionStage,
    workflowCompletionEffect: workflowCompletionEffect && typeof workflowCompletionEffect === 'object' ? workflowCompletionEffect : {},
    visibility,
    completionBehavior,
    instructions,
    internalInstructions: normalizeText(templated?.internalInstructions) || normalizeText(appointmentTypeTemplate?.internalInstructions) || null,
    reminderRules: Array.isArray(templated?.reminderRules) ? templated.reminderRules : [],
    sendInviteEmails: (appointment.sendInviteEmails ?? appointment.invitations_enabled) !== false,
    remindersEnabled: (appointment.remindersEnabled ?? appointment.reminders_enabled) !== false,
    attachCalendarInvite: (appointment.attachCalendarInvite ?? appointment.attach_calendar_invite) !== false,
    emailTheme: normalizeText(appointment.emailTheme || appointment.email_theme) || null,
    emailTemplateKey: normalizeText(appointment.emailTemplateKey || appointment.email_template_key) || null,
    calendarDeliveryManaged: appointment.calendarDeliveryManaged === true || appointment.calendar_delivery_managed === true,
    requiredDocuments,
    calendarEventUid: normalizeText(appointment?.calendarEventUid || appointment?.calendar_event_uid) || null,
    icsGeneratedAt: appointment?.icsGeneratedAt || appointment?.ics_generated_at || null,
    externalCalendarStatus,
    externalCalendarProvider: normalizeText(appointment?.externalCalendarProvider || appointment?.external_calendar_provider) || null,
    externalCalendarEventId: normalizeText(appointment?.externalCalendarEventId || appointment?.external_calendar_event_id) || null,
    resourceId,
    allowOutsideBusinessHours,
    schedulingOverrideReason,
    status: normalizeAppointmentStatus(appointment?.status),
    notes: normalizeText(appointment?.notes),
    outcomeSummary: normalizeText(appointment?.outcomeSummary) || null,
    clientFeedback: normalizeText(appointment?.clientFeedback) || null,
    agentNotes: normalizeText(appointment?.agentNotes) || null,
    nextStep: normalizeText(appointment?.nextStep) || null,
    followUpDate: normalizeText(appointment?.followUpDate) || null,
    offerInviteId: normalizeText(appointment?.offerInviteId || appointment?.offer_invite_id) || null,
    createdBy: normalizeText(appointment?.createdBy) || null,
    createdAt: appointment?.createdAt || null,
    updatedAt: appointment?.updatedAt || new Date().toISOString(),
    completedAt: appointment?.completedAt || null,
    cancelledAt: appointment?.cancelledAt || appointment?.cancelled_at || null,
    cancelledBy: normalizeText(appointment?.cancelledBy || appointment?.cancelled_by) || null,
    cancellationReason: normalizeText(appointment?.cancellationReason || appointment?.cancellation_reason) || null,
    schedulingIntegrity: appointment?.schedulingIntegrity || null,
  }
}

const CLOSED_APPOINTMENT_STATUSES = new Set(['cancelled', 'declined', 'completed', 'no_show'])

function assertAppointmentWrite(appointment = {}) {
  if (!APPOINTMENT_STATUSES.includes(appointment.status)) {
    const error = new Error('Choose a recognised appointment status. This record needs review.')
    error.code = 'APPOINTMENT_INVALID_STATUS'
    throw error
  }
  if (['completed', 'no_show'].includes(appointment.status)
    && (!Number.isFinite(getAppointmentStartMs(appointment)) || getAppointmentStartMs(appointment) > Date.now())) {
    const error = new Error('Record completion or a no-show after the appointment has started.')
    error.code = 'APPOINTMENT_OUTCOME_IN_FUTURE'
    throw error
  }
}

function prepareAppointmentUpdate(current, updater, { organisationId, actor } = {}) {
  const candidate = mergeAppointmentSchedule(current, updater)
  const nextStatus = normalizeAppointmentStatus(candidate.status)
  const timingChanged = ['date', 'startTime', 'endTime', 'dateTime', 'endDateTime', 'durationMinutes', 'timezone', 'allDay']
    .some(key => Object.hasOwn(updater, key) && updater[key] !== current[key])
  if (CLOSED_APPOINTMENT_STATUSES.has(current.status) && (nextStatus !== current.status || timingChanged)) {
    const error = new Error('This appointment is closed. Create a new appointment instead of reopening or moving it.')
    error.code = 'APPOINTMENT_CLOSED'
    throw error
  }
  const closing = CLOSED_APPOINTMENT_STATUSES.has(nextStatus)
  // A status-only closure must work even if old scheduling fields need review.
  const merged = normalizeAppointmentRecord({
    ...candidate,
    appointmentId: current.appointmentId,
    organisationId: current.organisationId,
    updatedAt: new Date().toISOString(),
  }, { organisationId, validateSchedule: timingChanged || !closing })
  assertAppointmentWrite(merged)
  if (merged.status === 'cancelled' && !merged.cancelledAt) {
    merged.cancelledAt = new Date().toISOString()
    merged.cancelledBy = normalizeText(actor?.id) || null
  }
  return merged
}

function upsertParticipants(store, appointmentId, participants = []) {
  const targetId = normalizeText(appointmentId)
  if (!targetId) return []
  const cleaned = (Array.isArray(participants) ? participants : []).filter((participant) =>
    Boolean(normalizeText(participant?.appointmentId || targetId)),
  )
  store.appointmentParticipants = (store.appointmentParticipants || []).filter(
    (participant) => normalizeText(participant?.appointmentId) !== targetId,
  )
  store.appointmentParticipants = [...store.appointmentParticipants, ...cleaned]
  return cleaned
}

function readAppointmentParticipants(store, appointmentId) {
  const targetId = normalizeText(appointmentId)
  if (!targetId) return []
  const persisted = (store?.appointmentParticipants || []).filter(
    (participant) => normalizeText(participant?.appointmentId) === targetId,
  )
  return persisted
}

function attachAppointmentParticipants(store, appointments = []) {
  return (Array.isArray(appointments) ? appointments : []).map((appointment) => ({
    ...appointment,
    participants: readAppointmentParticipants(store, appointment?.appointmentId),
  }))
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
    if (scopedListingId && normalizeLowerText(row?.listingId || row?.listing_id) !== scopedListingId) {
      return false
    }

    if (!includeAll && scopedAgentKeys.size) {
      if (!appointmentMatchesAgent(row, { identityKeys: [...scopedAgentKeys] })) return false
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

function buildSchedulingConflictErrorMessage(conflicts = []) {
  const first = (Array.isArray(conflicts) ? conflicts : [])[0]
  if (!first) return 'Scheduling conflict detected.'
  const firstMessage = normalizeText(first?.message) || 'Scheduling conflict detected.'
  if ((conflicts || []).length <= 1) return firstMessage
  return `${firstMessage} (${conflicts.length} conflicts found)`
}

export function createLeadTask(organisationId, leadId, payload = {}, { actor = null } = {}) {
  assertLocalFallbackAllowed('agencyPipelineService.createLeadTask', organisationId)
  const store = safeReadStore(organisationId)
  const assigned = resolveAgentSnapshot(payload?.assignedAgent || actor || {})
  const created = {
    taskId: createId('task'),
    organisationId: normalizeText(organisationId) || null,
    leadId: normalizeText(leadId),
    assignedAgentId: assigned.id || null,
    assignedAgentName: assigned.name || null,
    assignedAgentEmail: assigned.email || null,
    title: normalizeText(payload?.title) || 'Follow-up',
    description: normalizeText(payload?.description),
    dueDate: payload?.dueDate || null,
    status: normalizeListValue(payload?.status, TASK_STATUSES, 'Pending'),
    priority: normalizeListValue(payload?.priority, TASK_PRIORITIES, 'Medium'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  store.tasks = [created, ...store.tasks]
  writeStore(organisationId, store)
  addLeadActivity(organisationId, leadId, {
    agent: actor || assigned,
    activityType: 'Follow-up',
    activityNote: `Task created: ${created.title}`,
    outcome: created.status,
    activityDate: new Date().toISOString(),
  })
  return created
}

export function updateLeadTask(organisationId, taskId, updater = {}, { actor = null, suppressActivity = false } = {}) {
  assertLocalFallbackAllowed('agencyPipelineService.updateLeadTask', organisationId)
  const store = safeReadStore(organisationId)
  const targetId = normalizeText(taskId)
  let updatedTask = null

  store.tasks = store.tasks.map((row) => {
    if (normalizeText(row?.taskId) !== targetId) return row
    const merged = {
      ...row,
      ...updater,
      status: resolveTaskStatus({ ...row, ...updater }),
      priority: normalizeListValue(updater?.priority || row?.priority, TASK_PRIORITIES, 'Medium'),
      updatedAt: new Date().toISOString(),
    }
    updatedTask = merged
    return merged
  })

  writeStore(organisationId, store)
  if (!suppressActivity && updatedTask && normalizeText(updatedTask.leadId)) {
    addLeadActivity(organisationId, updatedTask.leadId, {
      agent: actor || {},
      activityType: 'Follow-up',
      activityNote: `Task updated: ${updatedTask.title}`,
      outcome: updatedTask.status,
      activityDate: new Date().toISOString(),
    })
  }
  return updatedTask
}

export function deleteLeadTask(organisationId, taskId) {
  assertLocalFallbackAllowed('agencyPipelineService.deleteLeadTask', organisationId)
  const store = safeReadStore(organisationId)
  const targetId = normalizeText(taskId)
  if (!targetId) return false
  const originalCount = store.tasks.length
  store.tasks = store.tasks.filter((row) => normalizeText(row?.taskId) !== targetId)
  writeStore(organisationId, store)
  return store.tasks.length !== originalCount
}

export function listLeadTasks(organisationId, leadId, { includeAll = false, agentId = '' } = {}) {
  const store = safeReadStore(organisationId)
  const targetLeadId = normalizeText(leadId)
  const normalizedAgentId = normalizeText(agentId).toLowerCase()
  const rows = store.tasks
    .filter((row) => normalizeText(row?.leadId) === targetLeadId)
    .map((task) => ({
      ...task,
      status: resolveTaskStatus(task),
    }))
  if (includeAll || !normalizedAgentId) return rows
  return rows.filter((row) => {
    const id = normalizeText(row?.assignedAgentId).toLowerCase()
    const email = normalizeText(row?.assignedAgentEmail).toLowerCase()
    return id === normalizedAgentId || email === normalizedAgentId
  })
}

export function createLeadAppointment(organisationId, leadId, payload = {}, { actor = null } = {}) {
  assertLocalFallbackAllowed('agencyPipelineService.createLeadAppointment', organisationId)
  return createAppointment(
    organisationId,
    {
      ...payload,
      leadId,
    },
    { actor },
  )
}

export function createAppointment(organisationId, payload = {}, { actor = null } = {}) {
  assertLocalFallbackAllowed('agencyPipelineService.createAppointment', organisationId)
  const store = safeReadStore(organisationId)
  const assigned = resolveAgentSnapshot(payload?.assignedAgent || payload?.agent || actor || {})
  const nextId = toNullableUuid(payload.commandId) || createUuid()
  const nowIso = new Date().toISOString()
  const appointment = normalizeAppointmentRecord(
    {
      appointmentId: nextId,
      organisationId,
      assignedAgentId: assigned.id || null,
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
      resourceId: payload?.resourceId,
      allowOutsideBusinessHours: payload?.allowOutsideBusinessHours === true,
      schedulingOverrideReason: payload?.schedulingOverrideReason,
      status: payload?.status || 'requested',
      notes: payload?.notes,
      createdBy: actor?.id || actor?.email || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    { organisationId, validateSchedule: true },
  )
  assertAppointmentWrite(appointment)
  const participants = (Array.isArray(payload?.participants) ? payload.participants : []).map((participant) =>
    normalizeParticipantRecord(participant, {
      appointmentId: appointment.appointmentId,
      organisationId: appointment.organisationId,
    }),
  )
  const hasAgentParticipant = participants.some((participant) => normalizeLabel(participant?.participantRole).toLowerCase() === 'agent')
  const defaultParticipants = hasAgentParticipant
    ? participants
    : [
        ...participants,
        normalizeParticipantRecord(
          {
            name: assigned.name || 'Agent',
            email: assigned.email || '',
            userId: assigned.id || null,
            participantRole: 'Agent',
            rsvpStatus: 'Pending',
          },
          { appointmentId: appointment.appointmentId, organisationId: appointment.organisationId },
        ),
      ]

  const migratedAppointments = store.appointments.map((row) =>
    normalizeAppointmentRecord(row, { organisationId }),
  )

  const schedulingIntegrity = checkAppointmentConflicts(
    {
      ...appointment,
      participants: defaultParticipants,
    },
    {
      appointments: migratedAppointments,
      excludeAppointmentId: appointment.appointmentId,
      businessHours: DEFAULT_APPOINTMENT_BUSINESS_HOURS,
      allowOutsideBusinessHours: appointment.allowOutsideBusinessHours === true,
      maxSuggestions: 5,
      slotMinutes: Number(getAppointmentTypeDefinition(appointment.appointmentType)?.defaultDuration || 30),
    },
  )
  if (schedulingIntegrity.hasHardConflicts) {
    const conflictError = new Error(buildSchedulingConflictErrorMessage(schedulingIntegrity.hardConflicts))
    conflictError.code = 'APPOINTMENT_HARD_CONFLICT'
    conflictError.schedulingConflicts = schedulingIntegrity
    throw conflictError
  }

  store.appointments = [appointment, ...migratedAppointments]
  upsertParticipants(store, appointment.appointmentId, defaultParticipants)
  writeStore(organisationId, store)

  if (normalizeText(appointment.leadId)) {
    addLeadActivity(organisationId, appointment.leadId, {
      agent: actor || assigned,
      activityType: 'Appointment Created',
      activityNote: `${appointment.appointmentTypeLabel || getAppointmentTypeLabel(appointment.appointmentType)} appointment created`,
      outcome: appointment.status,
      activityDate: appointment.dateTime || appointment.createdAt,
    })
  }

  return {
    ...appointment,
    participants: defaultParticipants,
    schedulingIntegrity,
  }
}

export function updateAppointment(organisationId, appointmentId, updater = {}, { actor = null } = {}) {
  assertLocalFallbackAllowed('agencyPipelineService.updateAppointment', organisationId)
  const store = safeReadStore(organisationId)
  const targetId = normalizeText(appointmentId)
  if (!targetId) return null

  let updatedAppointment = null
  const existingRows = store.appointments.map((row) => normalizeAppointmentRecord(row, { organisationId }))
  const draftRows = existingRows.map((row) => {
    if (normalizeText(row?.appointmentId) !== targetId) return row
    const merged = prepareAppointmentUpdate(row, updater, { organisationId, actor })
    if (merged.status === 'completed' && !merged.completedAt) {
      merged.completedAt = new Date().toISOString()
    }
    updatedAppointment = merged
    return merged
  })

  if (!updatedAppointment) {
    return null
  }

  if (Array.isArray(updater?.participants)) {
    const normalizedParticipants = updater.participants.map((participant) =>
      normalizeParticipantRecord(participant, {
        appointmentId: updatedAppointment.appointmentId,
        organisationId: updatedAppointment.organisationId,
      }),
    )
    upsertParticipants(store, updatedAppointment.appointmentId, normalizedParticipants)
  }

  const nextParticipants = readAppointmentParticipants(store, updatedAppointment.appointmentId)
  const otherAppointments = draftRows.filter((row) => normalizeText(row?.appointmentId) !== targetId)
  const schedulingIntegrity = checkAppointmentConflicts(
    {
      ...updatedAppointment,
      participants: nextParticipants,
    },
    {
      appointments: otherAppointments,
      excludeAppointmentId: targetId,
      businessHours: DEFAULT_APPOINTMENT_BUSINESS_HOURS,
      allowOutsideBusinessHours: updatedAppointment.allowOutsideBusinessHours === true,
      maxSuggestions: 5,
      slotMinutes: Number(getAppointmentTypeDefinition(updatedAppointment.appointmentType)?.defaultDuration || 30),
    },
  )
  if (schedulingIntegrity.hasHardConflicts) {
    const conflictError = new Error(buildSchedulingConflictErrorMessage(schedulingIntegrity.hardConflicts))
    conflictError.code = 'APPOINTMENT_HARD_CONFLICT'
    conflictError.schedulingConflicts = schedulingIntegrity
    throw conflictError
  }

  store.appointments = draftRows.map((row) => (
    normalizeText(row?.appointmentId) === targetId
      ? { ...row, schedulingIntegrity }
      : row
  ))

  writeStore(organisationId, store)

  if (normalizeText(updatedAppointment.leadId)) {
    if (Object.prototype.hasOwnProperty.call(updater, 'status')) {
      let statusActivityType = 'Appointment Booked'
      if (updatedAppointment.status === 'confirmed') statusActivityType = 'Appointment Confirmed'
      if (updatedAppointment.status === 'completed') statusActivityType = 'Appointment Completed'
      addLeadActivity(organisationId, updatedAppointment.leadId, {
        agent: actor || {},
        activityType: statusActivityType,
        activityNote: `Appointment status updated: ${updatedAppointment.status}`,
        outcome: updatedAppointment.status,
        activityDate: new Date().toISOString(),
      })
    }
  }

  return {
    ...updatedAppointment,
    participants: readAppointmentParticipants(store, updatedAppointment.appointmentId),
    schedulingIntegrity,
  }
}

export function updateAppointmentParticipantRsvp(
  organisationId,
  appointmentId,
  participantId,
  payload = {},
  { actor = null } = {},
) {
  assertLocalFallbackAllowed('agencyPipelineService.updateAppointmentParticipantRsvp', organisationId)
  const store = safeReadStore(organisationId)
  const targetAppointmentId = normalizeText(appointmentId)
  const targetParticipantId = normalizeText(participantId)
  if (!targetAppointmentId || !targetParticipantId) return null

  const participants = readAppointmentParticipants(store, targetAppointmentId)
  const nextParticipants = participants.map((participant) => {
    if (normalizeText(participant?.participantId) !== targetParticipantId) return participant
    return normalizeParticipantRecord(
      {
        ...participant,
        ...payload,
        appointmentId: targetAppointmentId,
        rsvpStatus: payload?.rsvpStatus || participant?.rsvpStatus,
        proposedNewTime: payload?.proposedNewTime ?? participant?.proposedNewTime,
        respondedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { appointmentId: targetAppointmentId, organisationId },
    )
  })
  upsertParticipants(store, targetAppointmentId, nextParticipants)

  let appointment = store.appointments
    .map((row) => normalizeAppointmentRecord(row, { organisationId }))
    .find((row) => normalizeText(row?.appointmentId) === targetAppointmentId) || null

  if (!appointment) {
    writeStore(organisationId, store)
    return null
  }

  const hasDeclined = nextParticipants.some((participant) => participant.rsvpStatus === 'Declined')
  const hasProposed = nextParticipants.some((participant) => participant.rsvpStatus === 'Proposed New Time')
  const allAccepted = nextParticipants.length > 0 && nextParticipants.every((participant) => participant.rsvpStatus === 'Accepted')
  const nextStatus = hasDeclined
    ? 'declined'
    : hasProposed
      ? 'alternative_requested'
      : allAccepted
        ? 'confirmed'
        : 'requested'

  appointment = updateAppointment(
    organisationId,
    targetAppointmentId,
    { status: nextStatus },
    { actor },
  )
  return appointment
}

export function addAppointmentOutcome(organisationId, appointmentId, payload = {}, { actor = null } = {}) {
  assertLocalFallbackAllowed('agencyPipelineService.addAppointmentOutcome', organisationId)
  const updated = updateAppointment(
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

  if (updated && normalizeText(updated.leadId)) {
    addLeadActivity(organisationId, updated.leadId, {
      agent: actor || {},
      activityType: 'Appointment Feedback Added',
      activityNote: updated.outcomeSummary || 'Appointment feedback added',
      outcome: updated.status,
      activityDate: new Date().toISOString(),
    })
  }

  return updated
}

export function listAppointments(organisationId, { includeAll = false, agentId = '', agentEmail = '', agentKeys = [], listingId = '', from = null, to = null } = {}) {
  const store = safeReadStore(organisationId)
  const normalizedRows = attachAppointmentParticipants(
    store,
    store.appointments.map((row) => normalizeAppointmentRecord(row, { organisationId })),
  )
  return applyAppointmentScope(normalizedRows, { includeAll, agentId, agentEmail, agentKeys, listingId, from, to })
}

export function listLeadAppointments(organisationId, leadId, { includeAll = false, agentId = '', agentEmail = '', agentKeys = [] } = {}) {
  const targetLeadId = normalizeText(leadId)
  return listAppointments(organisationId, { includeAll, agentId, agentEmail, agentKeys }).filter(
    (row) => normalizeText(row?.leadId) === targetLeadId,
  )
}

export function buildAppointmentsDashboardSummary(rows = [], { now = new Date() } = {}) {
  const sortedRows = (Array.isArray(rows) ? rows : [])
    .slice()
    .sort((left, right) => new Date(right?.updatedAt || 0).getTime() - new Date(left?.updatedAt || 0).getTime())

  const nowDate = new Date(now)
  const todayStart = sastDayStart(nowDate).getTime()
  const todayEnd = addCalendarDays(sastDayStart(nowDate), 1).getTime()
  const weekStart = sastWeekStart(nowDate).getTime()
  const weekEnd = addCalendarDays(sastWeekStart(nowDate), 7).getTime()
  const scheduled = sortedRows.filter((row) => appointmentReadState(row, nowDate).scheduled)
  const pending = scheduled.filter((row) => appointmentReadState(row, nowDate).reservation === 'held')
  const reschedule = sortedRows.filter((row) => ['alternative_requested', 'alternative_proposed'].includes(appointmentReadState(row, nowDate).status) && !['draft', 'history', 'archived'].includes(appointmentReadState(row, nowDate).category))
  const upcoming = scheduled.filter((row) => appointmentReadState(row, nowDate).category === 'upcoming')
  const followUp = sortedRows.filter((row) => appointmentReadState(row, nowDate).category === 'follow_up')
  const today = scheduled.filter((row) => { const value = appointmentReadState(row, nowDate).start; return value >= todayStart && value < todayEnd })
  const thisWeek = scheduled.filter((row) => { const value = appointmentReadState(row, nowDate).start; return value >= weekStart && value < weekEnd })

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
    followUp,
    pending,
    reschedule,
    upcoming,
    today,
    thisWeek,
    statusCounts,
    typeCounts,
  }
}

export function getAppointmentsDashboardSummary(
  organisationId,
  {
    includeAll = false,
    agentId = '',
    agentEmail = '',
    agentKeys = [],
    now = new Date(),
  } = {},
) {
  const rows = listAppointments(organisationId, { includeAll, agentId, agentEmail, agentKeys })
  return buildAppointmentsDashboardSummary(rows, { now })
}

export function listDealRecords(organisationId, { includeAll = false, agentId = '' } = {}) {
  const store = safeReadStore(organisationId)
  const normalizedAgentId = normalizeText(agentId).toLowerCase()
  const transactionRows =
    Array.isArray(store.transactions) && store.transactions.length
      ? store.transactions
      : Array.isArray(store.deals)
        ? store.deals
        : []
  if (includeAll || !normalizedAgentId) return transactionRows
  return transactionRows.filter((row) => {
    const id = normalizeText(row?.assignedAgentId).toLowerCase()
    const email = normalizeText(row?.assignedAgentEmail).toLowerCase()
    return id === normalizedAgentId || email === normalizedAgentId
  })
}

export function buildPipelineMetrics({
  leads = [],
  tasks = [],
  appointments = [],
  deals = [],
} = {}) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const endOfToday = startOfToday + 24 * 60 * 60 * 1000
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay() + 1)
  startOfWeek.setHours(0, 0, 0, 0)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)

  const newLeads = leads.filter((lead) => {
    const createdAt = new Date(lead?.createdAt || 0).getTime()
    return Number.isFinite(createdAt) && createdAt >= startOfToday
  }).length

  const followUpsDueToday = tasks.filter((task) => {
    const status = resolveTaskStatus(task)
    if (status !== 'Pending' && status !== 'Overdue') return false
    const dueTime = new Date(task?.dueDate || 0).getTime()
    return Number.isFinite(dueTime) && dueTime >= startOfToday && dueTime < endOfToday
  }).length

  const overdueTasks = tasks.filter((task) => resolveTaskStatus(task) === 'Overdue').length

  const appointmentsThisWeek = appointments.filter((appointment) => {
    const value = new Date(appointment?.dateTime || 0).getTime()
    return Number.isFinite(value) && value >= startOfWeek.getTime() && value < endOfWeek.getTime()
  }).length

  const activeOpportunities = leads.filter((lead) => {
    const buyerStageKey = normalizeKnownBuyerProcessStageKey(lead?.stage || lead?.status)
    if (buyerStageKey) return ACTIVE_BUYER_PROCESS_STAGE_KEYS.has(buyerStageKey)
    return !['Lost', 'Deal Created', 'Converted to Transaction', 'Nurture / Follow-up Later'].includes(normalizeLabel(lead?.stage))
  }).length

  const dealsCreated = deals.length
  const pipelineValue = leads.reduce((sum, lead) => sum + (Number(lead?.estimatedValue || lead?.budget || 0) || 0), 0)

  return {
    newLeads,
    followUpsDueToday,
    appointmentsThisWeek,
    activeOpportunities,
    dealsCreated,
    overdueTasks,
    pipelineValue,
  }
}

export function buildPrincipalReporting({
  leads = [],
  activities = [],
  appointments = [],
  deals = [],
} = {}) {
  const leadSource = new Map()
  const activityByAgent = new Map()
  const buyerStages = new Map(
    BUYER_PROCESS_DEFINITION.stages.map((stage) => [
      stage.key,
      {
        key: stage.key,
        label: stage.label,
        count: 0,
      },
    ]),
  )
  const conversion = {
    totalLeads: leads.length,
    contacted: 0,
    qualified: 0,
    appointmentsScheduled: 0,
    dealsCreated: 0,
  }

  for (const lead of leads) {
    const source = normalizeText(lead?.leadSource) || 'Other'
    leadSource.set(source, (leadSource.get(source) || 0) + 1)

    const lifecycle = resolveLeadLifecyclePresentation(lead)
    if (inferLeadCategoryFromRecord(lead, 'buyer') === 'buyer' && buyerStages.has(lifecycle.key)) {
      buyerStages.get(lifecycle.key).count += 1
    }
    if (lifecycle.reporting.contacted) {
      conversion.contacted += 1
    }
    if (lifecycle.reporting.qualified) {
      conversion.qualified += 1
    }
    if (lifecycle.reporting.appointmentScheduled) {
      conversion.appointmentsScheduled += 1
    }
    if (lifecycle.reporting.dealCreated) {
      conversion.dealsCreated += 1
    }
  }

  for (const activity of activities) {
    const agent = normalizeText(activity?.agentName || activity?.agentEmail || 'Unassigned')
    if (!activityByAgent.has(agent)) {
      activityByAgent.set(agent, {
        agent,
        calls: 0,
        doorKnocks: 0,
        whatsapps: 0,
        followUps: 0,
        appointmentsBooked: 0,
        activitiesLogged: 0,
      })
    }
    const row = activityByAgent.get(agent)
    const type = normalizeText(activity?.activityType).toLowerCase()
    row.activitiesLogged += 1
    if (type === 'call') row.calls += 1
    if (type === 'door knock') row.doorKnocks += 1
    if (type === 'whatsapp') row.whatsapps += 1
    if (type === 'follow-up') row.followUps += 1
    if (type === 'appointment booked') row.appointmentsBooked += 1
  }

  return {
    leadSourceRows: Array.from(leadSource.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
    activityRows: Array.from(activityByAgent.values())
      .map((row) => {
        const agentLeads = leads.filter(
          (lead) =>
            normalizeText(lead?.assignedAgentName || lead?.assignedAgentEmail || '') === normalizeText(row.agent),
        )
        const agentDeals = deals.filter(
          (deal) =>
            normalizeText(deal?.assignedAgentName || deal?.assignedAgentEmail || '') === normalizeText(row.agent),
        )
        const conversionRate = agentLeads.length ? Math.round((agentDeals.length / agentLeads.length) * 100) : 0
        return {
          ...row,
          leadsCreated: agentLeads.length,
          dealsCreated: agentDeals.length,
          conversionRate,
        }
      })
      .sort((a, b) => b.activitiesLogged - a.activitiesLogged),
    conversion,
    buyerStageRows: Array.from(buyerStages.values()),
    appointmentStatusRows: APPOINTMENT_STATUSES.map((status) => ({
      status,
      count: appointments.filter((row) => normalizeLabel(row?.status) === status).length,
    })),
    appointmentTypeRows: APPOINTMENT_TYPES.map((type) => ({
      type: getAppointmentTypeLabel(type),
      count: appointments.filter((row) => normalizeLabel(row?.appointmentType) === type).length,
    })).filter((row) => row.count > 0),
  }
}

export function getAgencyCrmUpdatedEventName() {
  return CRM_UPDATED_EVENT
}

export {
  normalizeLabel as __normalizeLabel,
  normalizeText as __normalizeText,
  safeReadStore as __safeReadStore,
  localFallbackAllowed as __localFallbackAllowed,
  createEmptyStore as __createEmptyStore,
  getStorageKey as __getStorageKey,
  STORAGE_PREFIX as __STORAGE_PREFIX,
  normalizeLowerText as __normalizeLowerText,
  isUuidLike as __isUuidLike,
  assertLocalFallbackAllowed as __assertLocalFallbackAllowed,
  writeStore as __writeStore,
  emitAgencyCrmUpdated as __emitAgencyCrmUpdated,
  CRM_UPDATED_EVENT as __CRM_UPDATED_EVENT,
  normalizeListValue as __normalizeListValue,
  resolveAgentSnapshot as __resolveAgentSnapshot,
  createUuid as __createUuid,
  createId as __createId,
  toNullableUuid as __toNullableUuid,
  normalizeAppointmentRecord as __normalizeAppointmentRecord,
  normalizeAppointmentType as __normalizeAppointmentType,
  normalizeExternalCalendarStatus as __normalizeExternalCalendarStatus,
  normalizeAppointmentLocationType as __normalizeAppointmentLocationType,
  APPOINTMENT_LOCATION_TYPES as __APPOINTMENT_LOCATION_TYPES,
  normalizeAppointmentStatus as __normalizeAppointmentStatus,
  mapLegacyAppointmentStatus as __mapLegacyAppointmentStatus,
  assertAppointmentWrite as __assertAppointmentWrite,
  getAppointmentStartMs as __getAppointmentStartMs,
  deriveDateTime as __deriveDateTime,
  DEFAULT_APPOINTMENT_BUSINESS_HOURS as __DEFAULT_APPOINTMENT_BUSINESS_HOURS,
  normalizeParticipantRecord as __normalizeParticipantRecord,
  mapLegacyRsvpStatus as __mapLegacyRsvpStatus,
  buildSchedulingConflictErrorMessage as __buildSchedulingConflictErrorMessage,
  upsertParticipants as __upsertParticipants,
  prepareAppointmentUpdate as __prepareAppointmentUpdate,
  CLOSED_APPOINTMENT_STATUSES as __CLOSED_APPOINTMENT_STATUSES,
  readAppointmentParticipants as __readAppointmentParticipants,
  attachAppointmentParticipants as __attachAppointmentParticipants,
  applyAppointmentScope as __applyAppointmentScope,
}
