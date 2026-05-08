const STORAGE_PREFIX = 'itg:agency-crm:v1'
const CRM_UPDATED_EVENT = 'itg:agency-crm-updated'

export const LEAD_DIRECTIONS = ['Inbound', 'Outbound']
export const LEAD_CATEGORIES = ['Buyer', 'Seller', 'Landlord', 'Tenant', 'Investor', 'Developer', 'Other']
export const LEAD_STAGES = [
  'New Lead',
  'Contacted',
  'Qualified',
  'Appointment Scheduled',
  'Appointment Completed',
  'Follow-up',
  'Negotiating',
  'Deal Created',
  'Lost',
  'Nurture / Follow-up Later',
]
export const LEAD_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

export const ACTIVITY_TYPES = [
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
  'Deal Created',
]

export const TASK_STATUSES = ['Pending', 'Completed', 'Overdue', 'Cancelled']
export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

export const APPOINTMENT_TYPES = [
  'Viewing',
  'Mandate Discussion',
  'Seller Valuation',
  'Buyer Meeting',
  'Follow-up Meeting',
  'OTP / Offer Discussion',
  'Signing Appointment',
  'Property Inspection',
  'General Meeting',
  'Other',
]
export const APPOINTMENT_STATUSES = ['Draft', 'Pending Confirmation', 'Confirmed', 'Completed', 'Cancelled', 'Needs Reschedule']
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
    notes: normalizeText(lead.notes),
    createdAt: lead.createdAt || new Date().toISOString(),
    updatedAt: lead.updatedAt || new Date().toISOString(),
    convertedDealId: normalizeText(lead.convertedDealId) || null,
  }
}

export function getAgencyPipelineSnapshot(organisationId) {
  return safeReadStore(organisationId)
}

export function listAgencyLeads(organisationId, { agentId = '', includeAll = false } = {}) {
  const store = safeReadStore(organisationId)
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    organisationId,
  )

  store.leads = [nextLead, ...store.leads]
  writeStore(organisationId, store)

  addLeadActivity(organisationId, nextLead.leadId, {
    agent: actor || assignedAgent,
    activityType: 'Note',
    activityNote: 'Lead created',
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
  if (normalized === 'declined') return 'Cancelled'
  if (normalized === 'pending confirmation') return 'Pending Confirmation'
  if (normalized === 'confirmed') return 'Confirmed'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'cancelled') return 'Cancelled'
  if (normalized === 'needs reschedule') return 'Needs Reschedule'
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
  const normalized = normalizeLabel(value, 'Viewing')
  return APPOINTMENT_TYPES.includes(normalized) ? normalized : 'Other'
}

function normalizeAppointmentStatus(value) {
  const normalized = mapLegacyAppointmentStatus(value)
  return APPOINTMENT_STATUSES.includes(normalized) ? normalized : 'Pending Confirmation'
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

  return {
    appointmentId: normalizeText(appointment?.appointmentId || appointment?.id) || createId('appt'),
    organisationId: normalizeText(appointment?.organisationId || organisationId) || null,
    assignedAgentId: normalizeText(appointment?.assignedAgentId || appointment?.agentId),
    assignedAgentName: normalizeText(appointment?.assignedAgentName || appointment?.agentName),
    assignedAgentEmail: normalizeText(appointment?.assignedAgentEmail || appointment?.agentEmail).toLowerCase(),
    appointmentType: normalizeAppointmentType(appointment?.appointmentType),
    title: normalizeText(appointment?.title) || normalizeAppointmentType(appointment?.appointmentType),
    date: normalizedDate || null,
    startTime: normalizedStart || null,
    endTime: normalizedEnd || null,
    dateTime: derivedDateTime,
    location: normalizeText(appointment?.location),
    leadId: normalizeText(appointment?.leadId || fallbackLeadId) || null,
    contactId: normalizeText(appointment?.contactId) || null,
    listingId: normalizeText(appointment?.listingId) || null,
    transactionId: normalizeText(appointment?.transactionId) || null,
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
  }
}

function extractParticipantsFromAppointment(appointment = {}, { appointmentId = '', organisationId = '' } = {}) {
  const nested = Array.isArray(appointment?.participants) ? appointment.participants : []
  return nested.map((participant) =>
    normalizeParticipantRecord(participant, { appointmentId, organisationId }),
  )
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

export function createAppointment(organisationId, payload = {}, { actor = null } = {}) {
  const store = safeReadStore(organisationId)
  const assigned = resolveAgentSnapshot(payload?.assignedAgent || payload?.agent || actor || {})
  const nextId = createId('appt')
  const nowIso = new Date().toISOString()
  const appointment = normalizeAppointmentRecord(
    {
      appointmentId: nextId,
      organisationId,
      assignedAgentId: assigned.id || null,
      assignedAgentName: assigned.name || null,
      assignedAgentEmail: assigned.email || null,
      appointmentType: payload?.appointmentType || 'Viewing',
      title: payload?.title || payload?.appointmentType || 'Appointment',
      date: payload?.date,
      startTime: payload?.startTime,
      endTime: payload?.endTime,
      dateTime: payload?.dateTime,
      location: payload?.location,
      leadId: payload?.leadId,
      contactId: payload?.contactId,
      listingId: payload?.listingId,
      transactionId: payload?.transactionId,
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
  store.appointments = [appointment, ...migratedAppointments]
  upsertParticipants(store, appointment.appointmentId, defaultParticipants)
  writeStore(organisationId, store)

  if (normalizeText(appointment.leadId)) {
    addLeadActivity(organisationId, appointment.leadId, {
      agent: actor || assigned,
      activityType: 'Appointment Created',
      activityNote: `${appointment.appointmentType} appointment created`,
      outcome: appointment.status,
      activityDate: appointment.dateTime || appointment.createdAt,
    })
  }

  return {
    ...appointment,
    participants: defaultParticipants,
  }
}

export function updateAppointment(organisationId, appointmentId, updater = {}, { actor = null } = {}) {
  const store = safeReadStore(organisationId)
  const targetId = normalizeText(appointmentId)
  if (!targetId) return null

  let updatedAppointment = null
  const existingRows = store.appointments.map((row) => normalizeAppointmentRecord(row, { organisationId }))
  store.appointments = existingRows.map((row) => {
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
  const normalizedAgentId = normalizeText(agentId).toLowerCase()
  const fromMs = from ? new Date(from).getTime() : null
  const toMs = to ? new Date(to).getTime() : null

  const normalizedRows = attachAppointmentParticipants(
    store,
    store.appointments.map((row) => normalizeAppointmentRecord(row, { organisationId })),
  )

  return normalizedRows.filter((row) => {
    if (!includeAll && normalizedAgentId) {
      const id = normalizeText(row?.assignedAgentId).toLowerCase()
      const email = normalizeText(row?.assignedAgentEmail).toLowerCase()
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

export function listLeadAppointments(organisationId, leadId, { includeAll = false, agentId = '' } = {}) {
  const targetLeadId = normalizeText(leadId)
  return listAppointments(organisationId, { includeAll, agentId }).filter(
    (row) => normalizeText(row?.leadId) === targetLeadId,
  )
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

  const pending = rows.filter((row) => row.status === 'Pending Confirmation')
  const reschedule = rows.filter((row) => row.status === 'Needs Reschedule')
  const upcoming = rows.filter((row) => {
    if (!['Pending Confirmation', 'Confirmed', 'Needs Reschedule'].includes(row?.status)) return false
    const value = new Date(row?.dateTime || 0).getTime()
    return Number.isFinite(value) && value >= nowDate.getTime()
  })
  const today = rows.filter((row) => {
    const value = new Date(row?.dateTime || 0).getTime()
    return Number.isFinite(value) && value >= todayStart && value < todayEnd
  })
  const thisWeek = rows.filter((row) => {
    const value = new Date(row?.dateTime || 0).getTime()
    return Number.isFinite(value) && value >= weekStart && value < weekEnd
  })

  const statusCounts = APPOINTMENT_STATUSES.map((status) => ({
    status,
    count: rows.filter((row) => row.status === status).length,
  }))
  const typeMap = new Map()
  for (const row of rows) {
    const type = normalizeAppointmentType(row?.appointmentType)
    typeMap.set(type, (typeMap.get(type) || 0) + 1)
  }
  const typeCounts = Array.from(typeMap.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((left, right) => right.count - left.count)

  return {
    rows,
    pending,
    reschedule,
    upcoming,
    today,
    thisWeek,
    statusCounts,
    typeCounts,
  }
}

export function convertLeadToDealRecord(organisationId, leadId, payload = {}, { actor = null } = {}) {
  const store = safeReadStore(organisationId)
  const targetLeadId = normalizeText(leadId)
  const lead = store.leads.find((row) => normalizeText(row?.leadId) === targetLeadId)
  if (!lead) {
    throw new Error('Lead not found.')
  }

  const assigned = resolveAgentSnapshot(payload?.assignedAgent || actor || {})
  const dealId = createId('deal')
  const deal = {
    dealId,
    organisationId: normalizeText(organisationId) || null,
    leadId: targetLeadId,
    assignedAgentId: normalizeText(lead?.assignedAgentId || assigned.id),
    assignedAgentName: normalizeText(lead?.assignedAgentName || assigned.name),
    assignedAgentEmail: normalizeText(lead?.assignedAgentEmail || assigned.email),
    contactId: normalizeText(lead?.contactId),
    title: normalizeText(payload?.title) || `${lead?.leadCategory || 'Lead'} Deal`,
    stage: normalizeText(payload?.stage || 'Opportunity Created'),
    dealValue: Number(payload?.dealValue || lead?.estimatedValue || lead?.budget || 0) || 0,
    status: normalizeText(payload?.status || 'Active'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  store.deals = [deal, ...store.deals]
  store.leads = store.leads.map((row) =>
    normalizeText(row?.leadId) === targetLeadId
      ? {
          ...row,
          stage: 'Deal Created',
          status: 'Deal Created',
          convertedDealId: dealId,
          updatedAt: new Date().toISOString(),
        }
      : row,
  )
  writeStore(organisationId, store)

  addLeadActivity(organisationId, leadId, {
    agent: actor || assigned,
    activityType: 'Deal Created',
    activityNote: `Converted to deal ${dealId}`,
    outcome: deal.status,
    activityDate: new Date().toISOString(),
  })
  return deal
}

export function listDealRecords(organisationId, { includeAll = false, agentId = '' } = {}) {
  const store = safeReadStore(organisationId)
  const normalizedAgentId = normalizeText(agentId).toLowerCase()
  if (includeAll || !normalizedAgentId) return store.deals
  return store.deals.filter((row) => {
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
    !['Lost', 'Deal Created', 'Nurture / Follow-up Later'].includes(normalizeLabel(lead?.stage)),
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
    if (['Contacted', 'Qualified', 'Appointment Scheduled', 'Appointment Completed', 'Follow-up', 'Negotiating', 'Deal Created'].includes(stage)) {
      conversion.contacted += 1
    }
    if (['Qualified', 'Appointment Scheduled', 'Appointment Completed', 'Follow-up', 'Negotiating', 'Deal Created'].includes(stage)) {
      conversion.qualified += 1
    }
    if (['Appointment Scheduled', 'Appointment Completed', 'Follow-up', 'Negotiating', 'Deal Created'].includes(stage)) {
      conversion.appointmentsScheduled += 1
    }
    if (stage === 'Deal Created') {
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
      type,
      count: appointments.filter((row) => normalizeLabel(row?.appointmentType) === type).length,
    })).filter((row) => row.count > 0),
  }
}

export function getAgencyCrmUpdatedEventName() {
  return CRM_UPDATED_EVENT
}
