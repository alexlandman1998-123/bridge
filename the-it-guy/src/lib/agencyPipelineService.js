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
  'Appointment Booked',
  'Deal Created',
]

export const TASK_STATUSES = ['Pending', 'Completed', 'Overdue', 'Cancelled']
export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

export const APPOINTMENT_TYPES = ['Viewing', 'Seller Valuation', 'Buyer Meeting', 'Mandate Meeting', 'Follow-up Meeting']
export const APPOINTMENT_STATUSES = ['Pending', 'Confirmed', 'Declined', 'Needs Reschedule', 'Completed']

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
  const store = safeReadStore(organisationId)
  const assigned = resolveAgentSnapshot(payload?.agent || actor || {})
  const appointment = {
    appointmentId: createId('appt'),
    organisationId: normalizeText(organisationId) || null,
    leadId: normalizeText(leadId),
    agentId: assigned.id || null,
    agentName: assigned.name || null,
    agentEmail: assigned.email || null,
    appointmentType: normalizeListValue(payload?.appointmentType, APPOINTMENT_TYPES, 'Viewing'),
    dateTime: payload?.dateTime || null,
    location: normalizeText(payload?.location),
    status: normalizeListValue(payload?.status, APPOINTMENT_STATUSES, 'Pending'),
    notes: normalizeText(payload?.notes),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  store.appointments = [appointment, ...store.appointments]
  writeStore(organisationId, store)
  addLeadActivity(organisationId, leadId, {
    agent: actor || assigned,
    activityType: 'Appointment Booked',
    activityNote: `${appointment.appointmentType} booked`,
    outcome: appointment.status,
    activityDate: appointment.dateTime || new Date().toISOString(),
  })
  return appointment
}

export function listLeadAppointments(organisationId, leadId, { includeAll = false, agentId = '' } = {}) {
  const store = safeReadStore(organisationId)
  const targetLeadId = normalizeText(leadId)
  const normalizedAgentId = normalizeText(agentId).toLowerCase()
  const rows = store.appointments.filter((row) => normalizeText(row?.leadId) === targetLeadId)
  if (includeAll || !normalizedAgentId) return rows
  return rows.filter((row) => {
    const id = normalizeText(row?.agentId).toLowerCase()
    const email = normalizeText(row?.agentEmail).toLowerCase()
    return id === normalizedAgentId || email === normalizedAgentId
  })
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
  }
}

export function getAgencyCrmUpdatedEventName() {
  return CRM_UPDATED_EVENT
}
