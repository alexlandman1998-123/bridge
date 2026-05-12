import { isSupabaseConfigured, supabase } from './supabaseClient'
import { createTransactionFromLeadOverride } from './transactionLifecycleService'
import { MOCK_DATA_ENABLED } from './mockData'
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
  getParticipantAvailability,
} from './appointmentAvailabilityEngine'
import {
  cancelAppointmentReminders,
  notifyAppointmentParticipants,
  scheduleAppointmentReminders,
} from '../services/appointmentNotificationService'

const STORAGE_PREFIX = 'itg:agency-crm:v1'
const CRM_UPDATED_EVENT = 'itg:agency-crm-updated'
const APPOINTMENTS_DEMO_FALLBACK_REASON = {
  UNSCOPED_ORG: 'unscoped_organisation',
  SUPABASE_NOT_CONFIGURED: 'supabase_not_configured',
}

export const LEAD_DIRECTIONS = ['Inbound', 'Outbound']
export const LEAD_CATEGORIES = ['Buyer', 'Seller', 'Landlord', 'Tenant', 'Investor', 'Developer', 'Other']
export const LEAD_STAGES = [
  'New Lead',
  'Contacted',
  'Onboarding Sent',
  'Onboarding Completed',
  'Qualified',
  'Appointment Scheduled',
  'Appointment Completed',
  'Mandate Ready',
  'Mandate Generated',
  'Mandate Sent',
  'Mandate Signed',
  'Converted To Listing',
  'Offer Submitted',
  'Offer Accepted',
  'Follow-up',
  'Negotiating',
  'Converted to Transaction',
  'Deal Created',
  'Lost',
  'Nurture / Follow-up Later',
]
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
  'Mandate Generated',
  'Mandate Sent',
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
export const APPOINTMENT_STATUSES = ['Draft', 'Pending Confirmation', 'Proposed', 'Confirmed', 'Completed', 'Cancelled', 'Declined', 'Needs Reschedule', 'Reschedule Requested']
export const APPOINTMENT_PARTICIPANT_ROLES = [
  'Buyer',
  'Seller',
  'Agent',
  'Co-agent',
  'Principal',
  'Attorney',
  'Bond Originator',
  'Other Contact',
]
export const APPOINTMENT_RSVP_STATUSES = ['Pending', 'Accepted', 'Declined', 'Proposed New Time']

const INBOUND_BUYER_SOURCES = [
  'Property24',
  'Private Property',
  'Website',
  'Facebook Ads',
  'Google Ads',
  'Referral',
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

export function getLeadSourceOptions({ leadDirection = 'Inbound', leadCategory = 'Buyer' } = {}) {
  const direction = normalizeLabel(leadDirection)
  const category = normalizeLabel(leadCategory)
  if (direction === 'Outbound') {
    if (category === 'Seller') return OUTBOUND_SELLER_SOURCES
    return OUTBOUND_BUYER_SOURCES
  }
  if (category === 'Seller') return INBOUND_SELLER_SOURCES
  return INBOUND_BUYER_SOURCES
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function toNullableUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function normalizeTimeText(value) {
  const text = normalizeText(value)
  if (!text) return null
  return text.slice(0, 5)
}

function isMissingColumnError(error, columnName = '') {
  const message = String(error?.message || error?.details || '')
  const normalizedColumn = normalizeText(columnName).toLowerCase()
  if (normalizedColumn && message.toLowerCase().includes(normalizedColumn)) {
    return true
  }
  return error?.code === '42703' || /column .* does not exist/i.test(message)
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

function isPermissionDeniedError(error) {
  const status = Number(error?.status || error?.statusCode || 0)
  const code = normalizeText(error?.code)
  const message = normalizeLowerText(error?.message || error?.details || '')
  return status === 403 || code === '42501' || message.includes('permission denied') || message.includes('row-level security')
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

const APPOINTMENT_WORKFLOW_DB_FIELDS = [
  'linked_workflow',
  'linked_workflow_stage',
  'linked_task_id',
  'linked_transaction_stage',
  'workflow_completion_effect',
  'visibility_scope',
  'completion_behavior',
  'appointment_instructions',
  'required_documents',
  'calendar_event_uid',
  'ics_generated_at',
  'external_calendar_status',
  'external_calendar_provider',
  'external_calendar_event_id',
  'resource_id',
  'allow_outside_business_hours',
  'scheduling_override_reason',
]

const DEFAULT_APPOINTMENT_BUSINESS_HOURS = {
  timezone: 'Africa/Johannesburg',
  days: [1, 2, 3, 4, 5],
  start: '08:00',
  end: '17:00',
}

function stripAppointmentWorkflowDbFields(payload = {}) {
  const clone = { ...payload }
  for (const field of APPOINTMENT_WORKFLOW_DB_FIELDS) {
    delete clone[field]
  }
  return clone
}

async function runAppointmentNotificationTask(taskName, callback) {
  try {
    return await callback()
  } catch (error) {
    console.warn(`[appointments][notifications] ${taskName} failed`, error)
    return null
  }
}

function getStorageKey(organisationId) {
  const org = normalizeText(organisationId) || 'default'
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function safeReadStore(organisationId) {
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
    }
  } catch {
    return createEmptyStore(organisationId)
  }
}

function writeStore(organisationId, store) {
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

export function recoverAgencyPipelineStoreForOrganisation(organisationId) {
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

  merged.contacts = dedupeRecordsByKey(selected.snapshot.contacts, (row) => row?.contactId || row?.id)
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  merged.leads = dedupeRecordsByKey(selected.snapshot.leads, (row) => row?.leadId || row?.id)
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  merged.leadActivities = dedupeRecordsByKey(selected.snapshot.leadActivities, (row) => row?.activityId || row?.id)
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  merged.tasks = dedupeRecordsByKey(selected.snapshot.tasks, (row) => row?.taskId || row?.id)
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  merged.appointments = dedupeRecordsByKey(selected.snapshot.appointments, (row) => row?.appointmentId || row?.id)
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  merged.appointmentParticipants = dedupeRecordsByKey(selected.snapshot.appointmentParticipants, (row) => row?.participantId || row?.id)
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  merged.deals = dedupeRecordsByKey(selected.snapshot.deals, (row) => row?.transactionId || row?.dealId || row?.id)
    .map((row) => ({ ...row, organisationId: targetOrgId }))
  merged.transactions = dedupeRecordsByKey(
    Array.isArray(selected.snapshot.transactions) && selected.snapshot.transactions.length
      ? selected.snapshot.transactions
      : selected.snapshot.deals,
    (row) => row?.transactionId || row?.dealId || row?.id,
  ).map((row) => ({ ...row, organisationId: targetOrgId }))

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
  const email = normalizeText(input?.email).toLowerCase()
  const phone = normalizeText(input?.phone)
  const firstName = normalizeText(input?.firstName || input?.name)
  const lastName = normalizeText(input?.lastName)

  const existing = store.contacts.find((row) => {
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
    contactId: createId('contact'),
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
  return {
    leadId: normalizeText(lead.leadId),
    organisationId: normalizeText(lead.organisationId || organisationId) || null,
    assignedAgentId: normalizeText(lead.assignedAgentId),
    assignedAgentName: normalizeText(lead.assignedAgentName),
    assignedAgentEmail: normalizeText(lead.assignedAgentEmail).toLowerCase(),
    contactId: normalizeText(lead.contactId),
    leadCategory: normalizeListValue(lead.leadCategory, LEAD_CATEGORIES, 'Buyer'),
    leadDirection: normalizeListValue(lead.leadDirection, LEAD_DIRECTIONS, 'Inbound'),
    leadSource: normalizeText(lead.leadSource) || 'Other',
    stage: normalizeListValue(lead.stage, LEAD_STAGES, 'New Lead'),
    status: normalizeText(lead.status || lead.stage || 'New Lead'),
    priority: normalizeListValue(lead.priority, LEAD_PRIORITIES, 'Medium'),
    budget: Number(lead.budget || 0) || 0,
    areaInterest: normalizeText(lead.areaInterest),
    propertyInterest: normalizeText(lead.propertyInterest),
    sellerPropertyAddress: normalizeText(lead.sellerPropertyAddress),
    estimatedValue: Number(lead.estimatedValue || 0) || 0,
    notes,
    canvassingProspectId: normalizeText(lead.canvassingProspectId || canvassingProspectIdFromNotes),
    sellerOnboardingToken: normalizeText(lead.sellerOnboardingToken),
    sellerOnboardingLink: normalizeText(lead.sellerOnboardingLink),
    sellerOnboardingStatus: normalizeText(lead.sellerOnboardingStatus),
    sellerWorkflowLeadId: normalizeText(lead.sellerWorkflowLeadId),
    mandatePacketId: normalizeText(lead.mandatePacketId),
    listingId: normalizeText(lead.listingId),
    createdAt: lead.createdAt || new Date().toISOString(),
    updatedAt: lead.updatedAt || new Date().toISOString(),
    convertedDealId: normalizeText(lead.convertedDealId) || null,
    convertedTransactionId: normalizeText(lead.convertedTransactionId) || normalizeText(lead.convertedDealId) || null,
  }
}

export function getAgencyPipelineSnapshot(organisationId) {
  const store = safeReadStore(organisationId)
  const dedupeMap = new Map()
  for (const row of Array.isArray(store.leads) ? store.leads : []) {
    const normalized = normalizeLeadRecord(row, organisationId)
    const dedupeKey = normalized.canvassingProspectId
      ? `prospect:${normalizeLowerText(normalized.canvassingProspectId)}`
      : `lead:${normalizeLowerText(normalized.leadId)}`
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
  const store = safeReadStore(organisationId)
  const assignedAgent = resolveAgentSnapshot(payload?.assignedAgent || actor || {})
  const contact = findOrCreateContact(store, payload?.contact || {}, organisationId, assignedAgent)
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
      leadId: createId('lead'),
      organisationId,
      assignedAgentId: assignedAgent.id || null,
      assignedAgentName: assignedAgent.name || null,
      assignedAgentEmail: assignedAgent.email || null,
      contactId: contact.contactId,
      leadCategory: payload?.leadCategory || 'Buyer',
      leadDirection: payload?.leadDirection || 'Inbound',
      leadSource: payload?.leadSource || 'Other',
      stage: payload?.stage || 'New Lead',
      status: payload?.stage || 'New Lead',
      priority: payload?.priority || 'Medium',
      budget: payload?.budget || 0,
      areaInterest: payload?.areaInterest || '',
      propertyInterest: payload?.propertyInterest || '',
      sellerPropertyAddress: payload?.sellerPropertyAddress || '',
      estimatedValue: payload?.estimatedValue || 0,
      notes: payload?.notes || '',
      canvassingProspectId,
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
  const store = safeReadStore(organisationId)
  const targetId = normalizeText(leadId)
  let updatedLead = null

  store.leads = store.leads.map((row) => {
    if (normalizeText(row?.leadId) !== targetId) return row
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

export function deleteAgencyLead(organisationId, leadId) {
  const store = safeReadStore(organisationId)
  const targetId = normalizeText(leadId)
  if (!targetId) return false

  const originalCount = store.leads.length
  store.leads = store.leads.filter((row) => normalizeText(row?.leadId) !== targetId)
  store.leadActivities = store.leadActivities.filter((row) => normalizeText(row?.leadId) !== targetId)
  store.tasks = store.tasks.filter((row) => normalizeText(row?.leadId) !== targetId)
  store.appointments = store.appointments.map((row) =>
    normalizeText(row?.leadId) === targetId ? { ...row, leadId: '', updatedAt: new Date().toISOString() } : row,
  )

  writeStore(organisationId, store)
  return store.leads.length !== originalCount
}

export function addLeadActivity(organisationId, leadId, payload = {}) {
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
  if (!normalized) return 'Pending Confirmation'
  if (normalized === 'pending') return 'Pending Confirmation'
  if (normalized === 'declined') return 'Declined'
  if (normalized === 'pending confirmation') return 'Pending Confirmation'
  if (normalized === 'proposed') return 'Proposed'
  if (normalized === 'confirmed') return 'Confirmed'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'cancelled') return 'Cancelled'
  if (normalized === 'needs reschedule') return 'Needs Reschedule'
  if (normalized === 'reschedule requested') return 'Reschedule Requested'
  return 'Pending Confirmation'
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
  const normalized = mapLegacyAppointmentStatus(value)
  return APPOINTMENT_STATUSES.includes(normalized) ? normalized : 'Pending Confirmation'
}

function normalizeExternalCalendarStatus(value) {
  const normalized = normalizeText(value).toLowerCase()
  if (['not_synced', 'ics_generated', 'sync_pending', 'synced', 'sync_failed'].includes(normalized)) {
    return normalized
  }
  return 'not_synced'
}

function deriveDateTime({ date = '', startTime = '' } = {}) {
  if (!normalizeText(date)) return null
  const safeTime = normalizeText(startTime) || '00:00'
  const dateTime = new Date(`${date}T${safeTime}`)
  if (Number.isNaN(dateTime.getTime())) return null
  return dateTime.toISOString()
}

function normalizeParticipantRecord(participant = {}, { appointmentId = '', organisationId = '' } = {}) {
  const participantRole = normalizeLabel(participant?.participantRole || participant?.role || 'Other Contact')
  const normalizedRole = APPOINTMENT_PARTICIPANT_ROLES.includes(participantRole) ? participantRole : 'Other Contact'
  const rsvpStatus = mapLegacyRsvpStatus(participant?.rsvpStatus || participant?.responseStatus || participant?.response_status)
  return {
    participantId: normalizeText(participant?.participantId || participant?.id) || createId('participant'),
    appointmentId: normalizeText(participant?.appointmentId || appointmentId),
    organisationId: normalizeText(participant?.organisationId || organisationId) || null,
    name: normalizeText(participant?.name),
    email: normalizeText(participant?.email).toLowerCase(),
    phone: normalizeText(participant?.phone),
    participantRole: normalizedRole,
    rsvpStatus,
    proposedNewTime: normalizeText(participant?.proposedNewTime || participant?.proposed_new_time) || null,
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
  const normalizedEnd = normalizeText(appointment?.endTime || appointment?.end_time)
  const derivedDateTime = hasDateTime ? parsedDateTime.toISOString() : deriveDateTime({ date: normalizedDate, startTime: normalizedStart })
  const appointmentType = normalizeAppointmentType(appointment?.appointmentType || appointment?.appointment_type)
  const appointmentTypeDefinition = getAppointmentTypeDefinition(appointmentType)
  const appointmentTypeTemplate = getAppointmentTypeTemplate(appointmentType)
  const templated = applyAppointmentTemplate(appointmentType, {
    ...appointment,
    date: normalizedDate || null,
    startTime: normalizedStart || null,
    endTime: normalizedEnd || null,
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
    assignedAgentName: normalizeText(appointment?.assignedAgentName || appointment?.agentName),
    assignedAgentEmail: normalizeText(appointment?.assignedAgentEmail || appointment?.agentEmail).toLowerCase(),
    appointmentType,
    appointmentTypeLabel: getAppointmentTypeLabel(appointmentType),
    title: normalizeText(templated?.title) || appointmentTypeDefinition.title,
    date: normalizedDate || null,
    startTime: normalizedStart || null,
    endTime: normalizedEnd || null,
    dateTime: derivedDateTime,
    location: normalizeText(appointment?.location),
    leadId: normalizeText(appointment?.leadId || fallbackLeadId) || null,
    contactId: normalizeText(appointment?.contactId) || null,
    listingId: normalizeText(appointment?.listingId) || null,
    transactionId: normalizeText(appointment?.transactionId) || null,
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
    createdBy: normalizeText(appointment?.createdBy) || null,
    createdAt: appointment?.createdAt || new Date().toISOString(),
    updatedAt: appointment?.updatedAt || new Date().toISOString(),
    completedAt: appointment?.completedAt || null,
    schedulingIntegrity: appointment?.schedulingIntegrity || null,
  }
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

function mapDbAppointmentRow(row = {}, organisationId = '') {
  return normalizeAppointmentRecord(
    {
      appointmentId: row?.appointment_id,
      organisationId: row?.organisation_id || organisationId,
      assignedAgentId: row?.agent_id,
      appointmentType: row?.appointment_type,
      title: row?.title,
      date: row?.appointment_date,
      startTime: normalizeTimeText(row?.start_time),
      endTime: normalizeTimeText(row?.end_time),
      dateTime: row?.date_time,
      location: row?.location,
      leadId: row?.lead_id,
      contactId: row?.contact_id,
      listingId: row?.listing_id,
      transactionId: row?.transaction_id,
      linkedWorkflow: row?.linked_workflow,
      linkedWorkflowStage: row?.linked_workflow_stage,
      linkedTaskId: row?.linked_task_id,
      linkedTransactionStage: row?.linked_transaction_stage,
      workflowCompletionEffect: row?.workflow_completion_effect,
      visibility: row?.visibility_scope,
      completionBehavior: row?.completion_behavior,
      instructions: row?.appointment_instructions,
      requiredDocuments: row?.required_documents,
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
      createdBy: row?.created_by,
      createdAt: row?.created_at,
      updatedAt: row?.updated_at,
      completedAt: row?.completed_at,
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
      name: row?.name,
      email: row?.email,
      phone: row?.phone,
      participantRole: row?.participant_role,
      rsvpStatus: row?.rsvp_status,
      proposedNewTime: row?.proposed_new_time,
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

function mapAppointmentToDbInsert(appointment = {}, organisationId = '') {
  const normalized = normalizeAppointmentRecord(appointment, { organisationId })
  return {
    organisation_id: normalizeText(normalized.organisationId || organisationId),
    lead_id: toNullableUuid(normalized.leadId),
    agent_id: toNullableUuid(normalized.assignedAgentId),
    appointment_type: normalizeAppointmentType(normalized.appointmentType),
    title: normalizeText(normalized.title) || getAppointmentTypeLabel(normalized.appointmentType),
    appointment_date: normalized.date || null,
    start_time: normalizeTimeText(normalized.startTime),
    end_time: normalizeTimeText(normalized.endTime),
    date_time: normalized.dateTime || deriveDateTime({ date: normalized.date, startTime: normalized.startTime }) || new Date().toISOString(),
    location: normalizeText(normalized.location) || null,
    contact_id: toNullableUuid(normalized.contactId),
    listing_id: normalizeText(normalized.listingId) || null,
    transaction_id: toNullableUuid(normalized.transactionId),
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
    created_by: toNullableUuid(normalized.createdBy),
    completed_at: normalized.status === 'Completed' ? normalized.completedAt || new Date().toISOString() : normalized.completedAt || null,
  }
}

function mapParticipantToDbInsert(participant = {}, { appointmentId = '', organisationId = '' } = {}) {
  const normalized = normalizeParticipantRecord(participant, { appointmentId, organisationId })
  return {
    appointment_id: normalizeText(normalized.appointmentId || appointmentId),
    organisation_id: normalizeText(normalized.organisationId || organisationId),
    name: normalizeText(normalized.name) || 'Participant',
    email: normalizeText(normalized.email) || null,
    phone: normalizeText(normalized.phone) || null,
    participant_role: normalizeLabel(normalized.participantRole, 'Other Contact'),
    rsvp_status: mapLegacyRsvpStatus(normalized.rsvpStatus),
    proposed_new_time: normalized.proposedNewTime || null,
    responded_at: normalized.respondedAt || null,
  }
}

function applyAppointmentScope(rows = [], { includeAll = false, agentId = '', from = null, to = null } = {}) {
  const normalizedAgentId = normalizeLowerText(agentId)
  const fromMs = from ? new Date(from).getTime() : null
  const toMs = to ? new Date(to).getTime() : null

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!includeAll && normalizedAgentId) {
      const id = normalizeLowerText(row?.assignedAgentId)
      const email = normalizeLowerText(row?.assignedAgentEmail)
      if (id !== normalizedAgentId && email !== normalizedAgentId) {
        return false
      }
    }

    if (fromMs || toMs) {
      const value = new Date(row?.dateTime || deriveDateTime({ date: row?.date, startTime: row?.startTime }) || 0).getTime()
      if (!Number.isFinite(value)) return false
      if (Number.isFinite(fromMs) && value < fromMs) return false
      if (Number.isFinite(toMs) && value >= toMs) return false
    }
    return true
  })
}

async function listAppointmentsFromSupabase(organisationId, { includeAll = false, agentId = '', from = null, to = null } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const selectWithWorkflow =
    'appointment_id, organisation_id, lead_id, agent_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, contact_id, listing_id, transaction_id, linked_workflow, linked_workflow_stage, linked_task_id, linked_transaction_stage, workflow_completion_effect, visibility_scope, completion_behavior, appointment_instructions, required_documents, calendar_event_uid, ics_generated_at, external_calendar_status, external_calendar_provider, external_calendar_event_id, resource_id, allow_outside_business_hours, scheduling_override_reason, status, notes, outcome_summary, client_feedback, agent_notes, next_step, follow_up_date, created_by, created_at, updated_at, completed_at'
  const selectLegacy =
    'appointment_id, organisation_id, lead_id, agent_id, appointment_type, title, appointment_date, start_time, end_time, date_time, location, contact_id, listing_id, transaction_id, status, notes, outcome_summary, client_feedback, agent_notes, next_step, follow_up_date, created_by, created_at, updated_at, completed_at'

  const buildQuery = (select) => {
    const query = supabase
      .from('appointments')
      .select(select)
      .eq('organisation_id', scopedOrganisationId)
      .order('date_time', { ascending: true })
    if (!includeAll && isUuidLike(agentId)) {
      query.eq('agent_id', normalizeText(agentId))
    }
    return query
  }

  let result = await buildQuery(selectWithWorkflow)
  if (result.error && isMissingColumnError(result.error)) {
    result = await buildQuery(selectLegacy)
  }
  const { data: appointmentRows, error: appointmentError } = result
  if (appointmentError) throw appointmentError

  const appointmentIds = (Array.isArray(appointmentRows) ? appointmentRows : [])
    .map((row) => normalizeText(row?.appointment_id))
    .filter(Boolean)
  const participantMap = new Map()

  if (appointmentIds.length) {
    const { data: participantRows, error: participantError } = await supabase
      .from('appointment_participants')
      .select(
        'participant_id, appointment_id, organisation_id, name, email, phone, participant_role, rsvp_status, proposed_new_time, responded_at, created_at, updated_at',
      )
      .eq('organisation_id', scopedOrganisationId)
      .in('appointment_id', appointmentIds)

    if (participantError) {
      throw participantError
    }

    for (const row of Array.isArray(participantRows) ? participantRows : []) {
      const mapped = mapDbParticipantRow(row)
      const key = normalizeText(mapped?.appointmentId)
      if (!participantMap.has(key)) {
        participantMap.set(key, [])
      }
      participantMap.get(key).push(mapped)
    }
  }

  const rows = (Array.isArray(appointmentRows) ? appointmentRows : []).map((row) => {
    const mapped = mapDbAppointmentRow(row, scopedOrganisationId)
    return {
      ...mapped,
      participants: participantMap.get(normalizeText(mapped?.appointmentId)) || [],
    }
  })

  return applyAppointmentScope(rows, { includeAll, agentId, from, to })
}

async function replaceAppointmentParticipantsInSupabase({
  organisationId,
  appointmentId,
  participants = [],
} = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  const scopedAppointmentId = normalizeText(appointmentId)
  if (!scopedOrganisationId || !scopedAppointmentId) return

  const { error: deleteError } = await supabase
    .from('appointment_participants')
    .delete()
    .eq('organisation_id', scopedOrganisationId)
    .eq('appointment_id', scopedAppointmentId)
  if (deleteError) throw deleteError

  const inserts = (Array.isArray(participants) ? participants : [])
    .map((participant) =>
      mapParticipantToDbInsert(participant, {
        appointmentId: scopedAppointmentId,
        organisationId: scopedOrganisationId,
      }),
    )
    .filter((participant) => normalizeText(participant?.name))

  if (!inserts.length) return

  const { error: insertError } = await supabase.from('appointment_participants').insert(inserts)
  if (insertError) throw insertError
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

async function listAppointmentResourcesFromSupabase(organisationId, { includeInactive = false } = {}) {
  const scopedOrganisationId = normalizeText(organisationId)
  let query = supabase
    .from('appointment_resources')
    .select('id, organisation_id, resource_name, resource_type, is_active, created_at, updated_at')
    .eq('organisation_id', scopedOrganisationId)
    .order('resource_name', { ascending: true })

  if (!includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query
  if (error) {
    if (error?.code === '42P01' || error?.code === 'PGRST205') {
      return []
    }
    throw error
  }

  return (Array.isArray(data) ? data : []).map((row) => normalizeAppointmentResourceRow(row))
}

export async function listAppointmentResourcesAsync(organisationId, { includeInactive = false } = {}) {
  const fallbackReason = resolveAppointmentsDemoFallbackReason(organisationId)
  if (fallbackReason) {
    return []
  }
  const scopedOrganisationId = normalizeText(organisationId)
  if (!isUuidLike(scopedOrganisationId)) return []
  if (!isSupabaseConfigured || !supabase) return []
  return listAppointmentResourcesFromSupabase(scopedOrganisationId, { includeInactive })
}

function buildSchedulingConflictErrorMessage(conflicts = []) {
  const first = (Array.isArray(conflicts) ? conflicts : [])[0]
  if (!first) return 'Scheduling conflict detected.'
  const firstMessage = normalizeText(first?.message) || 'Scheduling conflict detected.'
  if ((conflicts || []).length <= 1) return firstMessage
  return `${firstMessage} (${conflicts.length} conflicts found)`
}

function getSchedulingRangeForAppointment(appointment = {}) {
  const startDate = appointment?.dateTime ? new Date(appointment.dateTime) : deriveDateTime({
    date: appointment?.date,
    startTime: appointment?.startTime,
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

export function createLeadTask(organisationId, leadId, payload = {}, { actor = null } = {}) {
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

export function updateLeadTask(organisationId, taskId, updater = {}, { actor = null } = {}) {
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
  if (updatedTask && normalizeText(updatedTask.leadId)) {
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
  return createAppointment(
    organisationId,
    {
      ...payload,
      leadId,
    },
    { actor },
  )
}

export async function createAppointmentAsync(organisationId, payload = {}, { actor = null } = {}) {
  const fallbackReason = resolveAppointmentsDemoFallbackReason(organisationId)
  if (fallbackReason) {
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
  const nextId = createUuid()
  const nowIso = new Date().toISOString()
  const appointment = normalizeAppointmentRecord(
    {
      appointmentId: nextId,
      organisationId: scopedOrganisationId,
      assignedAgentId: assigned.id || null,
      assignedAgentName: assigned.name || null,
      assignedAgentEmail: assigned.email || null,
      appointmentType: payload?.appointmentType || 'viewing',
      title: payload?.title || getAppointmentTypeLabel(payload?.appointmentType || 'viewing') || 'Appointment',
      date: payload?.date,
      startTime: payload?.startTime,
      endTime: payload?.endTime,
      dateTime: payload?.dateTime,
      location: payload?.location,
      leadId: payload?.leadId,
      contactId: payload?.contactId,
      listingId: payload?.listingId,
      transactionId: payload?.transactionId,
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
      status: payload?.status || 'Pending Confirmation',
      notes: payload?.notes,
      createdBy: actor?.id || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    { organisationId: scopedOrganisationId },
  )

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

  const dbInsert = {
    appointment_id: appointment.appointmentId,
    ...mapAppointmentToDbInsert(appointment, scopedOrganisationId),
  }
  let insertResult = await supabase.from('appointments').insert(dbInsert)
  if (insertResult.error && isMissingColumnError(insertResult.error)) {
    insertResult = await supabase.from('appointments').insert(stripAppointmentWorkflowDbFields(dbInsert))
  }
  if (insertResult.error) throw insertResult.error

  await replaceAppointmentParticipantsInSupabase({
    organisationId: scopedOrganisationId,
    appointmentId: appointment.appointmentId,
    participants: defaultParticipants,
  })

  if (normalizeText(appointment.leadId)) {
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
  }

  if (normalizeText(appointment.transactionId)) {
    try {
      await supabase.from('transaction_events').insert({
        transaction_id: appointment.transactionId,
        event_type: 'appointment_scheduled',
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
          title: `${appointment.appointmentTypeLabel} appointment scheduled`,
          description: `A ${appointment.appointmentTypeLabel.toLowerCase()} appointment has been scheduled.`,
        },
      })
    } catch {
      // Keep appointment creation resilient even if event logging is unavailable.
    }
  }

  const saved = await fetchAppointmentByIdFromSupabase(scopedOrganisationId, appointment.appointmentId)
  const notificationSource = saved || { ...appointment, participants: defaultParticipants }
  await runAppointmentNotificationTask('appointment_scheduled', async () => {
    await notifyAppointmentParticipants(notificationSource.appointmentId, 'appointment_scheduled', {
      visibility: notificationSource.visibility,
      metadata: {
        source: 'createAppointmentAsync',
      },
    })
    await scheduleAppointmentReminders(notificationSource.appointmentId)
    if (Array.isArray(notificationSource.requiredDocuments) && notificationSource.requiredDocuments.length > 0) {
      await notifyAppointmentParticipants(notificationSource.appointmentId, 'appointment_documents_required', {
        visibility: notificationSource.visibility,
        metadata: {
          source: 'createAppointmentAsync',
          requiredDocuments: notificationSource.requiredDocuments,
        },
      })
    }
    if (normalizeLowerText(notificationSource.status).includes('pending')) {
      await notifyAppointmentParticipants(notificationSource.appointmentId, 'appointment_confirmation_required', {
        visibility: notificationSource.visibility,
        metadata: {
          source: 'createAppointmentAsync',
        },
      })
    }
  })
  emitAgencyCrmUpdated()
  return {
    ...notificationSource,
    schedulingIntegrity,
  }
}

export async function updateAppointmentAsync(organisationId, appointmentId, updater = {}, { actor = null } = {}) {
  const fallbackReason = resolveAppointmentsDemoFallbackReason(organisationId)
  if (fallbackReason) {
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
  if (!scopedOrganisationId || !scopedAppointmentId) return null

  const current = await fetchAppointmentByIdFromSupabase(scopedOrganisationId, scopedAppointmentId)
  if (!current) return null

  const merged = normalizeAppointmentRecord(
    {
      ...current,
      ...updater,
      appointmentId: scopedAppointmentId,
      organisationId: scopedOrganisationId,
      updatedAt: new Date().toISOString(),
    },
    { organisationId: scopedOrganisationId },
  )
  const scheduleChanged =
    normalizeText(current?.date) !== normalizeText(merged?.date) ||
    normalizeText(current?.startTime) !== normalizeText(merged?.startTime) ||
    normalizeText(current?.endTime) !== normalizeText(merged?.endTime) ||
    normalizeText(current?.dateTime) !== normalizeText(merged?.dateTime) ||
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

  if (merged.status === 'Completed' && !merged.completedAt) {
    merged.completedAt = new Date().toISOString()
  }

  const dbUpdate = mapAppointmentToDbInsert(merged, scopedOrganisationId)
  let updateResult = await supabase
    .from('appointments')
    .update(dbUpdate)
    .eq('appointment_id', scopedAppointmentId)
    .eq('organisation_id', scopedOrganisationId)
  if (updateResult.error && isMissingColumnError(updateResult.error)) {
    updateResult = await supabase
      .from('appointments')
      .update(stripAppointmentWorkflowDbFields(dbUpdate))
      .eq('appointment_id', scopedAppointmentId)
      .eq('organisation_id', scopedOrganisationId)
  }
  if (updateResult.error) throw updateResult.error

  if (Array.isArray(updater?.participants)) {
    await replaceAppointmentParticipantsInSupabase({
      organisationId: scopedOrganisationId,
      appointmentId: scopedAppointmentId,
      participants: nextParticipants,
    })
  }

  if (normalizeText(merged.leadId) && Object.prototype.hasOwnProperty.call(updater, 'status')) {
    let statusActivityType = 'Appointment Booked'
    if (merged.status === 'Confirmed') statusActivityType = 'Appointment Confirmed'
    if (merged.status === 'Completed') statusActivityType = 'Appointment Completed'
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
  }

  const saved = await fetchAppointmentByIdFromSupabase(scopedOrganisationId, scopedAppointmentId)
  const updatedRecord = saved || merged
  if (normalizeText(updatedRecord?.status).toLowerCase() === 'completed' && normalizeText(updatedRecord?.linkedTaskId)) {
    try {
      await supabase
        .from('transaction_checklist_items')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', updatedRecord.linkedTaskId)
    } catch {
      // Linked task completion should not block appointment state updates.
    }
  }
  if (normalizeText(updatedRecord?.transactionId)) {
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
  await runAppointmentNotificationTask('appointment_updated', async () => {
    const currentStatus = normalizeLowerText(updatedRecord?.status)
    await notifyAppointmentParticipants(updatedRecord.appointmentId, 'appointment_updated', {
      visibility: updatedRecord.visibility,
      metadata: {
        source: 'updateAppointmentAsync',
      },
    })
    if (currentStatus.includes('cancel') || currentStatus.includes('declin')) {
      await cancelAppointmentReminders(updatedRecord.appointmentId)
      await notifyAppointmentParticipants(updatedRecord.appointmentId, 'appointment_cancelled', {
        visibility: updatedRecord.visibility,
        metadata: {
          source: 'updateAppointmentAsync',
        },
      })
      return
    }
    if (currentStatus.includes('complete')) {
      await cancelAppointmentReminders(updatedRecord.appointmentId)
      await notifyAppointmentParticipants(updatedRecord.appointmentId, 'appointment_completed', {
        visibility: updatedRecord.visibility,
        metadata: {
          source: 'updateAppointmentAsync',
        },
      })
      return
    }
    if (currentStatus.includes('confirm')) {
      await notifyAppointmentParticipants(updatedRecord.appointmentId, 'appointment_confirmed', {
        visibility: updatedRecord.visibility,
        metadata: {
          source: 'updateAppointmentAsync',
        },
      })
      return
    }
    if (currentStatus.includes('reschedule') || currentStatus.includes('proposed')) {
      await notifyAppointmentParticipants(updatedRecord.appointmentId, 'appointment_rescheduled', {
        visibility: updatedRecord.visibility,
        metadata: {
          source: 'updateAppointmentAsync',
        },
      })
      await scheduleAppointmentReminders(updatedRecord.appointmentId)
      return
    }
    await scheduleAppointmentReminders(updatedRecord.appointmentId)
  })
  emitAgencyCrmUpdated()
  return {
    ...updatedRecord,
    schedulingIntegrity,
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

  const participantUpdate = {
    rsvp_status: mapLegacyRsvpStatus(payload?.rsvpStatus),
    proposed_new_time: payload?.proposedNewTime || null,
    responded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error: participantError } = await supabase
    .from('appointment_participants')
    .update(participantUpdate)
    .eq('organisation_id', scopedOrganisationId)
    .eq('appointment_id', scopedAppointmentId)
    .eq('participant_id', scopedParticipantId)
  if (participantError) {
    throw participantError
  }

  const appointment = await fetchAppointmentByIdFromSupabase(scopedOrganisationId, scopedAppointmentId)
  if (!appointment) return null
  const participants = Array.isArray(appointment.participants) ? appointment.participants : []
  const hasDeclined = participants.some((participant) => participant.rsvpStatus === 'Declined')
  const hasProposed = participants.some((participant) => participant.rsvpStatus === 'Proposed New Time')
  const allAccepted = participants.length > 0 && participants.every((participant) => participant.rsvpStatus === 'Accepted')
  const nextStatus = hasDeclined
    ? 'Cancelled'
    : hasProposed
      ? 'Needs Reschedule'
      : allAccepted
        ? 'Confirmed'
        : 'Pending Confirmation'

  const normalizedRsvp = normalizeLowerText(participantUpdate?.rsvp_status)
  await runAppointmentNotificationTask('participant_rsvp_updated', async () => {
    if (normalizedRsvp === 'accepted') {
      await notifyAppointmentParticipants(scopedAppointmentId, 'appointment_confirmed', {
        visibility: appointment.visibility,
        metadata: {
          source: 'updateAppointmentParticipantRsvpAsync',
          rsvpStatus: 'accepted',
        },
      })
      return
    }
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
    }
  })

  return updateAppointmentAsync(
    scopedOrganisationId,
    scopedAppointmentId,
    { status: nextStatus },
    { actor },
  )
}

export async function addAppointmentOutcomeAsync(organisationId, appointmentId, payload = {}, { actor = null } = {}) {
  const fallbackReason = resolveAppointmentsDemoFallbackReason(organisationId)
  if (fallbackReason) {
    return addAppointmentOutcome(organisationId, appointmentId, payload, { actor })
  }

  const updated = await updateAppointmentAsync(
    organisationId,
    appointmentId,
    {
      status: payload?.status || 'Completed',
      outcomeSummary: payload?.outcomeSummary,
      clientFeedback: payload?.clientFeedback,
      agentNotes: payload?.agentNotes,
      nextStep: payload?.nextStep,
      followUpDate: payload?.followUpDate,
    },
    { actor },
  )

  if (updated && normalizeText(updated.leadId)) {
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

export function createAppointment(organisationId, payload = {}, { actor = null } = {}) {
  const store = safeReadStore(organisationId)
  const assigned = resolveAgentSnapshot(payload?.assignedAgent || payload?.agent || actor || {})
  const nextId = createUuid()
  const nowIso = new Date().toISOString()
  const appointment = normalizeAppointmentRecord(
    {
      appointmentId: nextId,
      organisationId,
      assignedAgentId: assigned.id || null,
      assignedAgentName: assigned.name || null,
      assignedAgentEmail: assigned.email || null,
      appointmentType: payload?.appointmentType || 'viewing',
      title: payload?.title || getAppointmentTypeLabel(payload?.appointmentType || 'viewing') || 'Appointment',
      date: payload?.date,
      startTime: payload?.startTime,
      endTime: payload?.endTime,
      dateTime: payload?.dateTime,
      location: payload?.location,
      leadId: payload?.leadId,
      contactId: payload?.contactId,
      listingId: payload?.listingId,
      transactionId: payload?.transactionId,
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
      status: payload?.status || 'Pending Confirmation',
      notes: payload?.notes,
      createdBy: actor?.id || actor?.email || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    { organisationId },
  )
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
  const store = safeReadStore(organisationId)
  const targetId = normalizeText(appointmentId)
  if (!targetId) return null

  let updatedAppointment = null
  const existingRows = store.appointments.map((row) => normalizeAppointmentRecord(row, { organisationId }))
  const draftRows = existingRows.map((row) => {
    if (normalizeText(row?.appointmentId) !== targetId) return row
    const merged = normalizeAppointmentRecord(
      {
        ...row,
        ...updater,
        appointmentId: row.appointmentId,
        organisationId: row.organisationId,
        updatedAt: new Date().toISOString(),
      },
      { organisationId },
    )
    if (merged.status === 'Completed' && !merged.completedAt) {
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
      if (updatedAppointment.status === 'Confirmed') statusActivityType = 'Appointment Confirmed'
      if (updatedAppointment.status === 'Completed') statusActivityType = 'Appointment Completed'
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
    ? 'Cancelled'
    : hasProposed
      ? 'Needs Reschedule'
      : allAccepted
        ? 'Confirmed'
        : 'Pending Confirmation'

  appointment = updateAppointment(
    organisationId,
    targetAppointmentId,
    { status: nextStatus },
    { actor },
  )
  return appointment
}

export function addAppointmentOutcome(organisationId, appointmentId, payload = {}, { actor = null } = {}) {
  const updated = updateAppointment(
    organisationId,
    appointmentId,
    {
      status: payload?.status || 'Completed',
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

export function listAppointments(organisationId, { includeAll = false, agentId = '', from = null, to = null } = {}) {
  const store = safeReadStore(organisationId)
  const normalizedRows = attachAppointmentParticipants(
    store,
    store.appointments.map((row) => normalizeAppointmentRecord(row, { organisationId })),
  )
  return applyAppointmentScope(normalizedRows, { includeAll, agentId, from, to })
}

export function listLeadAppointments(organisationId, leadId, { includeAll = false, agentId = '' } = {}) {
  const targetLeadId = normalizeText(leadId)
  return listAppointments(organisationId, { includeAll, agentId }).filter(
    (row) => normalizeText(row?.leadId) === targetLeadId,
  )
}

export function buildAppointmentsDashboardSummary(rows = [], { now = new Date() } = {}) {
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

  const pending = sortedRows.filter((row) => row.status === 'Pending Confirmation')
  const reschedule = sortedRows.filter((row) => row.status === 'Needs Reschedule')
  const upcoming = sortedRows.filter((row) => {
    if (!['Pending Confirmation', 'Confirmed', 'Needs Reschedule'].includes(row?.status)) return false
    const value = new Date(row?.dateTime || 0).getTime()
    return Number.isFinite(value) && value >= nowDate.getTime()
  })
  const today = sortedRows.filter((row) => {
    const value = new Date(row?.dateTime || 0).getTime()
    return Number.isFinite(value) && value >= todayStart && value < todayEnd
  })
  const thisWeek = sortedRows.filter((row) => {
    const value = new Date(row?.dateTime || 0).getTime()
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

export function getAppointmentsDashboardSummary(
  organisationId,
  {
    includeAll = false,
    agentId = '',
    now = new Date(),
  } = {},
) {
  const rows = listAppointments(organisationId, { includeAll, agentId })
  return buildAppointmentsDashboardSummary(rows, { now })
}

export async function listAppointmentsAsync(organisationId, { includeAll = false, agentId = '', from = null, to = null } = {}) {
  const fallbackReason = resolveAppointmentsDemoFallbackReason(organisationId)
  if (fallbackReason) {
    return listAppointments(organisationId, { includeAll, agentId, from, to })
  }
  if (!isUuidLike(normalizeText(organisationId))) {
    return listAppointments(organisationId, { includeAll, agentId, from, to })
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Appointment scheduling requires the database connection.')
  }
  try {
    return await listAppointmentsFromSupabase(organisationId, { includeAll, agentId, from, to })
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return listAppointments(organisationId, { includeAll, agentId, from, to })
    }
    throw error
  }
}

export async function getAppointmentsDashboardSummaryAsync(
  organisationId,
  {
    includeAll = false,
    agentId = '',
    now = new Date(),
  } = {},
) {
  const rows = await listAppointmentsAsync(organisationId, { includeAll, agentId })
  return buildAppointmentsDashboardSummary(rows, { now })
}

export async function convertLeadToTransactionRecord(organisationId, leadId, payload = {}, { actor = null } = {}) {
  const store = safeReadStore(organisationId)
  const targetLeadId = normalizeText(leadId)
  const lead = store.leads.find((row) => normalizeText(row?.leadId) === targetLeadId)
  if (!lead) {
    throw new Error('Lead not found.')
  }

  const assigned = resolveAgentSnapshot(payload?.assignedAgent || actor || {})
  const listingId = normalizeText(payload?.listingId)
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
      stage: normalizeText(payload?.stage || 'Reserved'),
      originatingBuyerLeadId: targetLeadId,
      originatingLeadId: targetLeadId,
      acceptedOfferId: normalizeText(payload?.acceptedOfferId) || null,
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

  const activeOpportunities = leads.filter((lead) =>
    !['Lost', 'Deal Created', 'Converted to Transaction', 'Nurture / Follow-up Later'].includes(normalizeLabel(lead?.stage)),
  ).length

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

    const stage = normalizeLabel(lead?.stage)
    if (
      ['Contacted', 'Qualified', 'Appointment Scheduled', 'Appointment Completed', 'Offer Submitted', 'Offer Accepted', 'Follow-up', 'Negotiating', 'Deal Created', 'Converted to Transaction'].includes(stage)
    ) {
      conversion.contacted += 1
    }
    if (
      ['Qualified', 'Appointment Scheduled', 'Appointment Completed', 'Offer Submitted', 'Offer Accepted', 'Follow-up', 'Negotiating', 'Deal Created', 'Converted to Transaction'].includes(stage)
    ) {
      conversion.qualified += 1
    }
    if (
      ['Appointment Scheduled', 'Appointment Completed', 'Offer Submitted', 'Offer Accepted', 'Follow-up', 'Negotiating', 'Deal Created', 'Converted to Transaction'].includes(stage)
    ) {
      conversion.appointmentsScheduled += 1
    }
    if (stage === 'Deal Created' || stage === 'Converted to Transaction') {
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
