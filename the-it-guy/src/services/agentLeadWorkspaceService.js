import { listAgencyCrmLeadContacts, fetchAgencyCrmLeadWorkspace } from '../lib/agencyCrmRepository'
import { listAppointmentsAsync } from '../lib/agencyPipelineService'
import { listCanonicalOffersForLead } from '../lib/buyerLifecycleService'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getLeadSlaStatus, listLeadAssignmentHistory, listLeadAssignmentMetrics } from './leadAssignmentService'
import { buildCommunicationTimeline, listLeadCommunications } from './leadCommunicationService'
import {
  buildDefaultLeadCommunicationPreferences,
  listCommunicationDeliveries,
  normalizeLeadCommunicationPreferences,
} from './communicationDeliveryService'
import { listLeadListingInterests } from './leadListingInterestService'
import { listLeadPropertyShares, listLeadSavedSearches } from './leadPropertySharingService'
import { listRecommendations } from './leadRecommendationService'
import { buildRequirementSummary, listLeadRequirements } from './leadRequirementService'
import { getSuggestionsForLead } from './leadSuggestionService'
import { getPrivateListing } from './privateListingService'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return UUID_PATTERN.test(normalizeText(value))
}

function readId(row = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(row?.[key])
    if (value) return value
  }
  return ''
}

function getContactName(contact = {}) {
  return normalizeText(contact?.fullName) ||
    [contact?.firstName || contact?.first_name, contact?.lastName || contact?.last_name].map(normalizeText).filter(Boolean).join(' ')
}

function getLeadName(lead = {}, contact = null) {
  return getContactName(contact) ||
    [lead?.firstName || lead?.sellerName, lead?.lastName || lead?.sellerSurname].map(normalizeText).filter(Boolean).join(' ') ||
    normalizeText(lead?.name) ||
    'Unnamed lead'
}

function getLeadContact(lead = {}, contactsById = new Map()) {
  return contactsById.get(readId(lead, ['contactId', 'contact_id'])) || null
}

function getLeadId(row = {}) {
  return readId(row, ['leadId', 'lead_id', 'id', 'buyerLeadId', 'buyer_lead_id', 'sellerLeadId', 'seller_lead_id'])
}

function getContactId(row = {}) {
  return readId(row, ['contactId', 'contact_id', 'buyerContactId', 'buyer_contact_id', 'sellerContactId', 'seller_contact_id'])
}

function getListingId(row = {}) {
  return readId(row, ['listingId', 'listing_id', 'privateListingId', 'private_listing_id'])
}

function getTransactionId(row = {}) {
  return readId(row, ['transactionId', 'transaction_id', 'convertedTransactionId', 'converted_transaction_id', 'id'])
}

function getAppointmentId(row = {}) {
  return readId(row, ['appointmentId', 'appointment_id', 'id', 'viewingAppointmentId', 'viewing_appointment_id'])
}

function matchesLeadContext(row = {}, context = {}) {
  const rowLeadId = getLeadId(row)
  const rowContactId = getContactId(row)
  const rowListingId = getListingId(row)
  const rowTransactionId = getTransactionId(row)
  return (
    (context.leadId && rowLeadId === context.leadId) ||
    (context.contactId && rowContactId === context.contactId) ||
    (context.listingId && rowListingId === context.listingId) ||
    (context.convertedTransactionId && rowTransactionId === context.convertedTransactionId)
  )
}

function sortByNewest(left = {}, right = {}) {
  return new Date(right.updatedAt || right.updated_at || right.createdAt || right.created_at || 0).getTime() -
    new Date(left.updatedAt || left.updated_at || left.createdAt || left.created_at || 0).getTime()
}

function sortTasksByDueDate(left = {}, right = {}) {
  const leftMs = left?.dueDate || left?.due_date ? new Date(left.dueDate || left.due_date).getTime() : Number.POSITIVE_INFINITY
  const rightMs = right?.dueDate || right?.due_date ? new Date(right.dueDate || right.due_date).getTime() : Number.POSITIVE_INFINITY
  return leftMs - rightMs
}

function isOpenTask(task = {}) {
  const status = normalizeLower(task?.status)
  return !['completed', 'cancelled', 'done'].includes(status)
}

function normalizeOffer(row = {}) {
  return {
    ...row,
    id: readId(row, ['id', 'offerId', 'offer_id']),
    leadId: getLeadId(row),
    contactId: getContactId(row),
    listingId: getListingId(row),
    appointmentId: getAppointmentId(row),
    transactionId: readId(row, ['transactionId', 'transaction_id']),
    status: normalizeText(row?.status) || 'draft',
    amount: Number(row?.offerAmount ?? row?.offer_amount ?? row?.amount ?? 0) || 0,
    createdAt: row?.createdAt || row?.created_at || null,
    updatedAt: row?.updatedAt || row?.updated_at || row?.submittedAt || row?.submitted_at || row?.createdAt || row?.created_at || null,
  }
}

function normalizeTransaction(row = {}) {
  return {
    ...row,
    id: readId(row, ['id', 'transactionId', 'transaction_id']),
    leadId: readId(row, ['originatingBuyerLeadId', 'originating_buyer_lead_id', 'leadId', 'lead_id']),
    contactId: getContactId(row),
    listingId: getListingId(row),
    currentMainStage: normalizeText(row?.currentMainStage || row?.current_main_stage),
    onboardingStatus: normalizeText(row?.onboardingStatus || row?.onboarding_status),
    onboardingCompletedAt: row?.onboardingCompletedAt || row?.onboarding_completed_at || null,
    lifecycleState: normalizeText(row?.lifecycleState || row?.lifecycle_state),
    cancelledAt: row?.cancelledAt || row?.cancelled_at || null,
    status: normalizeText(row?.status || row?.stage || row?.current_stage) || 'Transaction',
    createdAt: row?.createdAt || row?.created_at || null,
    updatedAt: row?.updatedAt || row?.updated_at || row?.createdAt || row?.created_at || null,
  }
}

function normalizeListing(row = {}) {
  const listingId = getListingId(row) || readId(row, ['id'])
  return {
    ...row,
    id: listingId,
    listingId,
    leadId: readId(row, ['sellerLeadId', 'seller_lead_id', 'originatingCrmLeadId', 'originating_crm_lead_id']),
    assignedAgentId: readId(row, ['assignedAgentId', 'assigned_agent_id']),
    assignedAgentEmail: normalizeText(row?.assignedAgentEmail || row?.assigned_agent_email).toLowerCase(),
    status: normalizeText(row?.listingStatus || row?.listing_status),
    title: normalizeText(row?.title || row?.property_address || row?.propertyAddress || row?.suburb),
  }
}

function isRecoverableReadError(error, tableName = '') {
  const code = normalizeText(error?.code).toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === 'pgrst205' || code === 'pgrst204' || code === '42703' ||
    (tableName && message.includes(tableName.toLowerCase()) && message.includes('does not exist')) ||
    message.includes('row-level security') || message.includes('permission denied')
}

export function buildAgentLeadRows({
  leads = [],
  contacts = [],
  leadActivities = [],
  tasks = [],
  appointments = [],
  offers = [],
  transactions = [],
  listings = [],
  listingInterests = [],
  requirements = [],
  communications = [],
  communicationDeliveries = [],
  communicationPreferences = [],
  suggestions = [],
  recommendations = [],
  savedSearches = [],
  propertyShares = [],
  assignmentHistory = [],
} = {}) {
  const contactsById = new Map(contacts.map((contact) => [readId(contact, ['contactId', 'contact_id', 'id']), contact]).filter(([id]) => id))
  const normalizedOffers = offers.map(normalizeOffer).filter((offer) => offer.id || offer.leadId || offer.contactId || offer.listingId)
  const normalizedTransactions = transactions.map(normalizeTransaction).filter((transaction) => transaction.id || transaction.leadId || transaction.contactId)
  const normalizedListings = listings.map(normalizeListing).filter((listing) => listing.id || listing.leadId)

  return leads.map((lead) => {
    const leadId = getLeadId(lead)
    const contact = getLeadContact(lead, contactsById)
    const contactId = readId(lead, ['contactId', 'contact_id']) || readId(contact || {}, ['contactId', 'contact_id'])
    const listingId = getListingId(lead)
    const convertedTransactionId = readId(lead, ['convertedTransactionId', 'converted_transaction_id', 'convertedDealId'])
    const context = { leadId, contactId, listingId, convertedTransactionId }
    const relatedActivities = leadActivities
      .filter((activity) => getLeadId(activity) === leadId)
      .sort((left, right) => new Date(right.activityDate || right.activity_date || right.createdAt || right.created_at || 0) - new Date(left.activityDate || left.activity_date || left.createdAt || left.created_at || 0))
    const relatedTasks = tasks.filter((task) => getLeadId(task) === leadId).sort(sortTasksByDueDate)
    const relatedAppointments = appointments.filter((appointment) => matchesLeadContext(appointment, context))
    const relatedOffers = normalizedOffers.filter((offer) => matchesLeadContext(offer, context) || relatedAppointments.some((appointment) => getAppointmentId(appointment) && getAppointmentId(appointment) === offer.appointmentId))
    const relatedTransactions = normalizedTransactions.filter((transaction) => matchesLeadContext(transaction, context))
    const relatedListings = normalizedListings.filter((listing) => matchesLeadContext(listing, context))
    const relatedListingInterests = listingInterests.filter((interest) => getLeadId(interest) === leadId || readId(interest, ['leadId', 'lead_id']) === leadId)
    const relatedSuggestions = suggestions
      .filter((suggestion) => getLeadId(suggestion) === leadId || readId(suggestion, ['leadId', 'lead_id']) === leadId)
      .sort((left, right) => Number(right.score || 0) - Number(left.score || 0) || new Date(right.generatedAt || right.generated_at || 0).getTime() - new Date(left.generatedAt || left.generated_at || 0).getTime())
    const relatedRecommendations = recommendations
      .filter((recommendation) => getLeadId(recommendation) === leadId || readId(recommendation, ['leadId', 'lead_id']) === leadId)
      .sort((left, right) => {
        const statusRank = { pending: 0, accepted: 1, completed: 2, dismissed: 3, expired: 4 }
        const leftStatus = normalizeLower(left.status)
        const rightStatus = normalizeLower(right.status)
        if ((statusRank[leftStatus] ?? 9) !== (statusRank[rightStatus] ?? 9)) return (statusRank[leftStatus] ?? 9) - (statusRank[rightStatus] ?? 9)
        const leftDue = left.dueDate || left.due_date ? new Date(left.dueDate || left.due_date).getTime() : Number.POSITIVE_INFINITY
        const rightDue = right.dueDate || right.due_date ? new Date(right.dueDate || right.due_date).getTime() : Number.POSITIVE_INFINITY
        return leftDue - rightDue || new Date(right.createdAt || right.created_at || 0).getTime() - new Date(left.createdAt || left.created_at || 0).getTime()
      })
    const relatedSavedSearches = savedSearches
      .filter((savedSearch) => getLeadId(savedSearch) === leadId || readId(savedSearch, ['leadId', 'lead_id']) === leadId)
      .sort((left, right) => new Date(right.updatedAt || right.updated_at || right.createdAt || right.created_at || 0).getTime() - new Date(left.updatedAt || left.updated_at || left.createdAt || left.created_at || 0).getTime())
    const relatedPropertyShares = propertyShares
      .filter((share) => getLeadId(share) === leadId || readId(share, ['leadId', 'lead_id']) === leadId)
      .sort((left, right) => new Date(right.sentAt || right.occurredAt || right.occurred_at || 0).getTime() - new Date(left.sentAt || left.occurredAt || left.occurred_at || 0).getTime())
    const relatedCommunications = communications
      .filter((communication) => getLeadId(communication) === leadId || readId(communication, ['leadId', 'lead_id']) === leadId)
      .sort((left, right) => new Date(right.occurredAt || right.occurred_at || right.createdAt || right.created_at || 0).getTime() - new Date(left.occurredAt || left.occurred_at || left.createdAt || left.created_at || 0).getTime())
    const relatedCommunicationDeliveries = communicationDeliveries
      .filter((delivery) => getLeadId(delivery) === leadId || readId(delivery, ['leadId', 'lead_id']) === leadId)
      .sort((left, right) => new Date(right.createdAt || right.created_at || right.preparedAt || right.prepared_at || 0).getTime() - new Date(left.createdAt || left.created_at || left.preparedAt || left.prepared_at || 0).getTime())
    const relatedCommunicationPreferences = normalizeLeadCommunicationPreferences(
      communicationPreferences.find((preferences) => getLeadId(preferences) === leadId || readId(preferences, ['leadId', 'lead_id']) === leadId) ||
      buildDefaultLeadCommunicationPreferences({ organisationId: lead.organisationId || lead.organisation_id, leadId }),
    )
    const relatedRequirements = requirements
      .map((requirement) => requirement?.requirementId || requirement?.requirement_id ? requirement : requirement)
      .filter((requirement) => getLeadId(requirement) === leadId || readId(requirement, ['leadId', 'lead_id']) === leadId)
      .sort((left, right) => {
        if (Boolean(left.isPrimary ?? left.is_primary) !== Boolean(right.isPrimary ?? right.is_primary)) return (left.isPrimary ?? left.is_primary) ? -1 : 1
        return new Date(right.updatedAt || right.updated_at || right.createdAt || right.created_at || 0).getTime() - new Date(left.updatedAt || left.updated_at || left.createdAt || left.created_at || 0).getTime()
      })
    const primaryRequirement = relatedRequirements.find((requirement) => requirement.isPrimary || requirement.is_primary) || relatedRequirements[0] || null
    const nextTask = relatedTasks.find(isOpenTask) || null
    const latestActivity = relatedActivities[0] || null
    const relatedAssignmentHistory = assignmentHistory
      .filter((assignment) => getLeadId(assignment) === leadId || readId(assignment, ['leadId', 'lead_id']) === leadId)
      .sort((left, right) => new Date(right.createdAt || right.created_at || 0).getTime() - new Date(left.createdAt || left.created_at || 0).getTime())
    const communicationTimeline = buildCommunicationTimeline({
      communications: relatedCommunications,
      communicationDeliveries: relatedCommunicationDeliveries,
      leadActivities: relatedActivities,
      assignmentHistory: relatedAssignmentHistory,
      tasks: relatedTasks,
      appointments: relatedAppointments,
      offers: relatedOffers,
      transactions: relatedTransactions,
    })
    const assignedAt = lead?.assignedAt || lead?.assigned_at || null
    const firstContactedAt = lead?.firstContactedAt || lead?.first_contacted_at || null
    const responseTimeHours = assignedAt && firstContactedAt
      ? Math.max(0, Math.round((new Date(firstContactedAt).getTime() - new Date(assignedAt).getTime()) / 360_000) / 10)
      : null

    return {
      ...lead,
      id: leadId,
      leadId,
      contact,
      contactId,
      name: getLeadName(lead, contact),
      phone: normalizeText(contact?.phone || contact?.phone_number || lead?.phone || lead?.sellerPhone),
      email: normalizeText(contact?.email || lead?.email || lead?.sellerEmail).toLowerCase(),
      source: normalizeText(lead?.leadSource || lead?.lead_source) || 'Unknown',
      stage: normalizeText(lead?.stage || lead?.status) || 'Unknown',
      status: normalizeText(lead?.status || lead?.stage) || 'Unknown',
      assignedAgentId: readId(lead, ['assignedAgentId', 'assigned_agent_id', 'assignedUserId', 'assigned_user_id']) || readId(relatedListings[0] || {}, ['assignedAgentId', 'assigned_agent_id']),
      assignedAgentEmail: normalizeText(lead?.assignedAgentEmail || lead?.assigned_agent_email || relatedListings[0]?.assignedAgentEmail || relatedListings[0]?.assigned_agent_email).toLowerCase(),
      assignedAgent: normalizeText(lead?.assignedAgentName || lead?.assigned_agent_name || lead?.assignedAgentEmail || lead?.assigned_agent_email || relatedListings[0]?.assignedAgentEmail || relatedListings[0]?.assigned_agent_email || lead?.assignedAgentId || lead?.assigned_agent_id) || 'Unassigned',
      assignedQueueId: readId(lead, ['assignedQueueId', 'assigned_queue_id']),
      assignedQueue: normalizeText(lead?.assignedQueueId || lead?.assigned_queue_id) || '—',
      assignedAt,
      firstContactedAt,
      slaDueAt: lead?.slaDueAt || lead?.sla_due_at || null,
      ownershipStatus: normalizeText(lead?.ownershipStatus || lead?.ownership_status) || 'awaiting_assignment',
      slaStatus: getLeadSlaStatus(lead),
      responseTimeHours,
      assignmentHistory: relatedAssignmentHistory,
      createdAt: lead?.createdAt || lead?.created_at || null,
      updatedAt: lead?.updatedAt || lead?.updated_at || null,
      listingId,
      convertedTransactionId,
      latestActivity,
      nextTask,
      activities: relatedActivities,
      tasks: relatedTasks,
      appointments: relatedAppointments,
      offers: relatedOffers,
      transactions: relatedTransactions,
      listings: relatedListings,
      listingInterests: relatedListingInterests,
      requirements: relatedRequirements,
      communications: relatedCommunications,
      communicationDeliveries: relatedCommunicationDeliveries,
      communicationPreferences: relatedCommunicationPreferences,
      suggestions: relatedSuggestions,
      recommendations: relatedRecommendations,
      savedSearches: relatedSavedSearches,
      propertyShares: relatedPropertyShares,
      communicationTimeline,
      primaryRequirement,
      requirementSummary: buildRequirementSummary(primaryRequirement),
      listingCount: Math.max(relatedListingInterests.length, relatedListings.length || (listingId ? 1 : 0)),
      appointmentCount: relatedAppointments.length,
      offerCount: relatedOffers.length,
      transactionCount: relatedTransactions.length || (convertedTransactionId ? 1 : 0),
    }
  }).sort(sortByNewest)
}

export function getLeadFilterOptions(rows = []) {
  const unique = (values) => [...new Set(values.map(normalizeText).filter(Boolean))].sort((left, right) => left.localeCompare(right))
  return {
    stages: unique(rows.flatMap((row) => [row.stage, row.status])),
    sources: unique(rows.map((row) => row.source)),
    agents: unique(rows.map((row) => row.assignedAgent)),
  }
}

export function filterAgentLeadRows(rows = [], filters = {}) {
  const search = normalizeLower(filters.search)
  const stage = normalizeLower(filters.stage)
  const source = normalizeLower(filters.source)
  const agent = normalizeLower(filters.agent)
  const createdFrom = filters.createdFrom ? new Date(filters.createdFrom).getTime() : null
  const createdTo = filters.createdTo ? new Date(`${filters.createdTo}T23:59:59`).getTime() : null

  return rows.filter((row) => {
    if (search) {
      const haystack = [row.name, row.phone, row.email].map(normalizeLower).join(' ')
      if (!haystack.includes(search)) return false
    }
    if (stage && stage !== 'all' && normalizeLower(row.stage) !== stage && normalizeLower(row.status) !== stage) return false
    if (source && source !== 'all' && normalizeLower(row.source) !== source) return false
    if (agent && agent !== 'all' && normalizeLower(row.assignedAgent) !== agent) return false
    const createdMs = row.createdAt ? new Date(row.createdAt).getTime() : null
    if (createdFrom && (!createdMs || createdMs < createdFrom)) return false
    if (createdTo && (!createdMs || createdMs > createdTo)) return false
    return true
  })
}

async function safeReadAllOffers(organisationId = '') {
  if (!isSupabaseConfigured || !supabase || !isUuidLike(organisationId)) return []
  const { data, error } = await supabase
    .from('offers')
    .select('*')
    .eq('organisation_id', organisationId)
    .order('updated_at', { ascending: false })
    .limit(1000)
  if (error) {
    if (isRecoverableReadError(error, 'offers')) return []
    throw error
  }
  return Array.isArray(data) ? data : []
}

async function safeReadTransactions(organisationId = '', context = {}) {
  if (!isSupabaseConfigured || !supabase || !isUuidLike(organisationId)) return []
  const fields = 'id, organisation_id, originating_buyer_lead_id, buyer_contact_id, seller_contact_id, listing_id, current_stage, current_main_stage, stage, status, onboarding_status, onboarding_completed_at, lifecycle_state, cancelled_at, created_at, updated_at'
  let query = supabase.from('transactions').select(fields).eq('organisation_id', organisationId).order('updated_at', { ascending: false }).limit(1000)
  if (context.convertedTransactionId) query = query.eq('id', context.convertedTransactionId)
  const { data, error } = await query
  if (error) {
    if (isRecoverableReadError(error, 'transactions')) return []
    throw error
  }
  return Array.isArray(data) ? data : []
}

async function safeReadPrivateListings(organisationId = '') {
  if (!isSupabaseConfigured || !supabase || !isUuidLike(organisationId)) return []
  const selectVariants = [
    'id, organisation_id, seller_lead_id, originating_crm_lead_id, assigned_agent_id, assigned_agent_email, listing_status, property_address, suburb, city, asking_price, created_at, updated_at',
    'id, organisation_id, seller_lead_id, originating_crm_lead_id, assigned_agent_id, listing_status, property_address, suburb, city, asking_price, created_at, updated_at',
    'id, organisation_id, seller_lead_id, originating_crm_lead_id, listing_status, property_address, suburb, city, asking_price, created_at, updated_at',
  ]
  let data = []
  let error = null
  for (const fields of selectVariants) {
    const result = await supabase
      .from('private_listings')
      .select(fields)
      .eq('organisation_id', organisationId)
      .order('updated_at', { ascending: false })
      .limit(1000)
    data = result.data
    error = result.error
    if (!error || !isRecoverableReadError(error, 'private_listings')) break
  }
  if (error) {
    if (isRecoverableReadError(error, 'private_listings')) return []
    throw error
  }
  return Array.isArray(data) ? data : []
}

async function safeReadHydratedPrivateListing(listingId = '') {
  if (!isSupabaseConfigured || !supabase) return null
  if (!isUuidLike(listingId)) return null
  try {
    return await getPrivateListing(listingId, { includeRequirementsAndDocuments: true })
  } catch (error) {
    if (isRecoverableReadError(error, 'private_listings') || isRecoverableReadError(error, 'private_listing_documents')) return null
    throw error
  }
}

function getNormalizedListingId(row = {}) {
  return normalizeText(row?.id || row?.listingId || row?.listing_id || row?.privateListingId || row?.private_listing_id)
}

async function safeReadLeadListingInterests(organisationId = '') {
  if (!isSupabaseConfigured || !supabase || !isUuidLike(organisationId)) return []
  const { data, error } = await supabase
    .from('lead_listing_interests')
    .select('*')
    .eq('organisation_id', organisationId)
    .order('updated_at', { ascending: false })
    .limit(2000)
  if (error) {
    if (isRecoverableReadError(error, 'lead_listing_interests')) return []
    throw error
  }
  return Array.isArray(data) ? data : []
}

async function safeReadLeadRequirements(organisationId = '') {
  if (!isSupabaseConfigured || !supabase || !isUuidLike(organisationId)) return []
  const { data, error } = await supabase
    .from('lead_requirements')
    .select('*')
    .eq('organisation_id', organisationId)
    .order('updated_at', { ascending: false })
    .limit(2000)
  if (error) {
    if (isRecoverableReadError(error, 'lead_requirements')) return []
    throw error
  }
  return Array.isArray(data) ? data : []
}

async function safeReadLeadCommunicationPreferences(organisationId = '') {
  if (!isSupabaseConfigured || !supabase || !isUuidLike(organisationId)) return []
  const { data, error } = await supabase
    .from('lead_communication_preferences')
    .select('*')
    .eq('organisation_id', organisationId)
    .order('updated_at', { ascending: false })
    .limit(2000)
  if (error) {
    if (isRecoverableReadError(error, 'lead_communication_preferences')) return []
    throw error
  }
  return Array.isArray(data) ? data : []
}

async function safeReadLeadOwnershipRows(organisationId = '') {
  if (!isSupabaseConfigured || !supabase || !isUuidLike(organisationId)) return []
  const selectVariants = [
    'lead_id, assigned_queue_id, assigned_at, first_contacted_at, sla_due_at, ownership_status',
    'lead_id, assigned_queue_id, assigned_at, first_contacted_at, sla_due_at',
    'lead_id, assigned_queue_id, assigned_at, sla_due_at',
    'lead_id, assigned_at',
    'lead_id',
  ]
  let data = []
  let error = null
  for (const fields of selectVariants) {
    const result = await supabase
      .from('leads')
      .select(fields)
      .eq('organisation_id', organisationId)
      .limit(2000)
    data = result.data
    error = result.error
    if (!error || !isRecoverableReadError(error, 'leads')) break
  }
  if (error) {
    if (isRecoverableReadError(error, 'leads')) return []
    throw error
  }
  return Array.isArray(data) ? data : []
}

function enrichLeadsWithOwnership(leads = [], ownershipRows = []) {
  const ownershipById = new Map(ownershipRows.map((row) => [readId(row, ['lead_id', 'leadId']), row]).filter(([id]) => id))
  return leads.map((lead) => {
    const leadId = getLeadId(lead)
    const ownership = ownershipById.get(leadId) || {}
    return {
      ...lead,
      assignedQueueId: ownership.assigned_queue_id || lead.assignedQueueId,
      assigned_queue_id: ownership.assigned_queue_id || lead.assigned_queue_id,
      assignedAt: ownership.assigned_at || lead.assignedAt,
      assigned_at: ownership.assigned_at || lead.assigned_at,
      firstContactedAt: ownership.first_contacted_at || lead.firstContactedAt,
      first_contacted_at: ownership.first_contacted_at || lead.first_contacted_at,
      slaDueAt: ownership.sla_due_at || lead.slaDueAt,
      sla_due_at: ownership.sla_due_at || lead.sla_due_at,
      ownershipStatus: ownership.ownership_status || lead.ownershipStatus,
      ownership_status: ownership.ownership_status || lead.ownership_status,
    }
  })
}

async function safeReadAppointments(organisationId = '') {
  try {
    return await listAppointmentsAsync(organisationId, { includeAll: true })
  } catch (error) {
    if (isRecoverableReadError(error, 'appointments')) return []
    throw error
  }
}

export async function listAgentLeadWorkspaceRows({ organisationId = '' } = {}) {
  const snapshot = await listAgencyCrmLeadContacts(organisationId)
  const [appointments, offers, transactions, listings, listingInterests, requirements, recommendations, savedSearches, propertyShares, communicationDeliveries, communicationPreferences, ownershipRows, assignmentMetrics] = await Promise.all([
    safeReadAppointments(organisationId),
    safeReadAllOffers(organisationId),
    safeReadTransactions(organisationId),
    safeReadPrivateListings(organisationId),
    safeReadLeadListingInterests(organisationId),
    safeReadLeadRequirements(organisationId),
    listRecommendations({ organisationId }).catch(() => []),
    listLeadSavedSearches({ organisationId }).catch(() => []),
    listLeadPropertyShares({ organisationId }).catch(() => []),
    listCommunicationDeliveries({ organisationId }).catch(() => []),
    safeReadLeadCommunicationPreferences(organisationId),
    safeReadLeadOwnershipRows(organisationId),
    listLeadAssignmentMetrics({ organisationId }).catch(() => ({ unassigned: 0, assigned: 0, overdue: 0, escalated: 0, byAgent: [] })),
  ])
  const rows = buildAgentLeadRows({
    leads: enrichLeadsWithOwnership(snapshot.leads, ownershipRows),
    contacts: snapshot.contacts,
    leadActivities: snapshot.leadActivities,
    tasks: snapshot.tasks,
    appointments,
    offers,
    transactions,
    listings,
    listingInterests,
    requirements,
    recommendations,
    savedSearches,
    propertyShares,
    communicationDeliveries,
    communicationPreferences,
  })
  return {
    ...snapshot,
    rows,
    appointments,
    offers: offers.map(normalizeOffer),
    transactions: transactions.map(normalizeTransaction),
    listings: listings.map(normalizeListing),
    listingInterests,
    requirements,
    recommendations,
    savedSearches,
    propertyShares,
    communicationDeliveries,
    communicationPreferences,
    assignmentMetrics,
  }
}

export async function fetchAgentLeadWorkspace({ organisationId = '', leadId = '' } = {}) {
  const workspace = await fetchAgencyCrmLeadWorkspace(organisationId, leadId)
  const lead = workspace.leads[0] || null
  if (!lead) {
    return { ...workspace, row: null, appointments: [], offers: [], transactions: [], listings: [] }
  }

  const contact = workspace.contacts[0] || null
  const context = {
    leadId: getLeadId(lead),
    contactId: getContactId(contact) || getContactId(lead),
    listingId: getListingId(lead),
    convertedTransactionId: readId(lead, ['convertedTransactionId', 'converted_transaction_id', 'convertedDealId']),
  }
  const appointments = (await safeReadAppointments(organisationId)).filter((appointment) => matchesLeadContext(appointment, context))
  const listingIds = [...new Set([context.listingId, ...appointments.map(getListingId)].filter(Boolean))]
  let offers = []
  try {
    offers = await listCanonicalOffersForLead({
      organisationId,
      leadId: context.leadId,
      contactId: context.contactId,
      appointmentIds: appointments.map(getAppointmentId).filter(Boolean),
      listingIds,
      buyerEmail: contact?.email || lead?.email || '',
      buyerPhone: contact?.phone || lead?.phone || '',
      buyerName: getLeadName(lead, contact),
    })
  } catch (error) {
    if (!isRecoverableReadError(error, 'offers')) throw error
    offers = []
  }
  const [transactions, listings, listingInterests, requirements, communications, suggestions, recommendations, savedSearches, propertyShares, communicationDeliveries, communicationPreferences, assignmentHistory, ownershipRows] = await Promise.all([
    safeReadTransactions(organisationId, context),
    safeReadPrivateListings(organisationId),
    listLeadListingInterests({ organisationId, leadId: context.leadId }),
    listLeadRequirements({ organisationId, leadId: context.leadId }),
    listLeadCommunications({ organisationId, leadId: context.leadId }).catch(() => []),
    getSuggestionsForLead({ organisationId, leadId: context.leadId }).catch(() => []),
    listRecommendations({ organisationId, leadId: context.leadId }).catch(() => []),
    listLeadSavedSearches({ organisationId, leadId: context.leadId }).catch(() => []),
    listLeadPropertyShares({ organisationId, leadId: context.leadId }).catch(() => []),
    listCommunicationDeliveries({ organisationId, leadId: context.leadId }).catch(() => []),
    safeReadLeadCommunicationPreferences(organisationId),
    listLeadAssignmentHistory({ organisationId, leadId: context.leadId }).catch(() => []),
    safeReadLeadOwnershipRows(organisationId),
  ])
  const normalizedListings = listings.map(normalizeListing)
  const linkedListing = normalizedListings.find((listing) => matchesLeadContext(listing, context)) || null
  const hydratedLinkedListing = await safeReadHydratedPrivateListing(context.listingId || linkedListing?.id || linkedListing?.listingId)
  const hydratedListing = hydratedLinkedListing ? normalizeListing(hydratedLinkedListing) : null
  const hydratedListingId = getNormalizedListingId(hydratedListing)
  const workspaceListings = normalizedListings
    .map((listing) => (hydratedListingId && getNormalizedListingId(listing) === hydratedListingId ? hydratedListing : listing))
    .filter((listing) => matchesLeadContext(listing, context))
  if (hydratedListing && !workspaceListings.some((listing) => getNormalizedListingId(listing) === hydratedListingId)) {
    workspaceListings.push(hydratedListing)
  }
  const rows = buildAgentLeadRows({
    leads: enrichLeadsWithOwnership(workspace.leads, ownershipRows),
    contacts: workspace.contacts,
    leadActivities: workspace.leadActivities,
    tasks: workspace.tasks,
    appointments,
    offers,
    transactions,
    listings: workspaceListings,
    listingInterests,
    requirements,
    communications,
    suggestions,
    recommendations,
    savedSearches,
    propertyShares,
    communicationDeliveries,
    communicationPreferences,
    assignmentHistory,
  })
  return {
    ...workspace,
    row: rows[0] || null,
    appointments,
    offers: offers.map(normalizeOffer),
    transactions: transactions.map(normalizeTransaction).filter((transaction) => matchesLeadContext(transaction, context)),
    listings: workspaceListings,
    listingInterests,
    requirements,
    communications,
    suggestions,
    recommendations,
    savedSearches,
    propertyShares,
    communicationDeliveries,
    communicationPreferences,
    timeline: rows[0]?.communicationTimeline || [],
    assignmentHistory,
  }
}
