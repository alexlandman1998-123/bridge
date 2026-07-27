import { listAgencyCrmLeadContacts, fetchAgencyCrmLeadWorkspace } from '../lib/agencyCrmRepository'
import { listAppointmentsAsync } from '../lib/agencyPipelineService'
import { listCanonicalOffersForLead } from '../lib/buyerLifecycleService'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getLeadSlaStatus, listLeadAssignmentHistory } from './leadAssignmentService'
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
import { listOrganisationUsers } from '../lib/settingsApi'
import { inferLeadCategoryFromRecord } from '../lib/leadCategory'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LEAD_WORKSPACE_CAN_VIEW_ALL_ROLES = new Set(['owner', 'principal', 'admin', 'admin_staff'])

function normalizeRoleText(value = '') {
  return normalizeLower(value).replace(/[\s_-]+/g, ' ')
}

function isPrincipalOrOwnerRole(roleText = '') {
  const normalized = normalizeRoleText(roleText)
  return normalized.includes('principal') || normalized.includes('owner')
}

function isAdminRole(roleText = '') {
  const normalized = normalizeRoleText(roleText)
  return normalized.includes('admin') || normalized === 'principal / owner' || normalized === 'agency owner' || normalized === 'firm admin'
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeLeadSourceLabel(lead = {}) {
  const explicit = normalizeText(lead?.leadSource || lead?.lead_source || lead?.source || lead?.source_label || lead?.origin)
  if (explicit && !['unknown', 'other'].includes(normalizeLower(explicit))) return explicit
  const canvassingProspectId = normalizeText(lead?.canvassingProspectId || lead?.canvassing_prospect_id)
  const notes = normalizeText(lead?.notes)
  if (canvassingProspectId || /canvassing prospect id:/i.test(notes) || normalizeLower(explicit).includes('canvassing')) {
    return 'Canvassing'
  }
  return explicit || 'Unknown'
}

function normalizeAgentDirectoryValue(value = '') {
  return normalizeLower(value)
}

function normalizeAgentDirectoryName(agent = {}) {
  const fullName = normalizeText(agent?.fullName || agent?.name)
  const firstName = normalizeText(agent?.firstName)
  const lastName = normalizeText(agent?.lastName)
  return fullName || [firstName, lastName].filter(Boolean).join(' ').trim() || normalizeAgentDirectoryValue(agent?.email).split('@')[0] || 'Agent'
}

function normalizeAgentDirectoryRow(agent = {}) {
  const entry = {
    id: normalizeText(agent?.id),
    userId: normalizeText(agent?.userId || agent?.user_id),
    email: normalizeAgentDirectoryValue(agent?.email),
    name: normalizeAgentDirectoryName(agent),
  }
  return {
    id: entry.id,
    userId: normalizeAgentDirectoryValue(entry.userId),
    email: entry.email,
    name: entry.name,
    fullName: entry.name,
  }
}

function buildAgentDirectoryLookup(users = []) {
  const byId = new Map()
  const byEmail = new Map()
  for (const row of Array.isArray(users) ? users : []) {
    const normalized = normalizeAgentDirectoryRow(row)
    const idKeys = [normalized.id, normalized.userId].filter(Boolean)
    const email = normalized.email
    for (const key of idKeys) {
      byId.set(key, { ...normalized })
    }
    if (email) byEmail.set(email, { ...normalized, email })
  }
  return { byId, byEmail }
}

function resolveDirectoryAgent(lead = {}, listing = null, directoryLookup = {}) {
  const directoryById = directoryLookup?.byId || new Map()
  const directoryByEmail = directoryLookup?.byEmail || new Map()
  const leadAssignedAgentId = normalizeAgentDirectoryValue(readId(lead, ['assignedAgentId', 'assigned_agent_id', 'assignedUserId', 'assigned_user_id']))
  const leadAssignedAgentEmail = normalizeAgentDirectoryValue(readId(lead, ['assignedAgentEmail', 'assigned_agent_email']))
  const listingAssignedAgentId = normalizeAgentDirectoryValue(readId(listing || {}, ['assignedAgentId', 'assigned_agent_id']))
  const listingAssignedAgentEmail = normalizeAgentDirectoryValue(readId(listing || {}, ['assignedAgentEmail', 'assigned_agent_email']))
  return directoryById.get(leadAssignedAgentId) ||
    directoryByEmail.get(leadAssignedAgentEmail) ||
    directoryById.get(listingAssignedAgentId) ||
    directoryByEmail.get(listingAssignedAgentEmail) ||
    null
}

function normalizeActorRole(actor = {}) {
  return normalizeRoleText(actor?.workspaceRole || actor?.organisationRole || actor?.role || actor?.roleKey || actor?.workspace_role || actor?.organisation_role)
}

function canViewAllWorkspaceLeads(actor = {}) {
  const normalizedRole = normalizeActorRole(actor)
  if (LEAD_WORKSPACE_CAN_VIEW_ALL_ROLES.has(normalizedRole)) return true
  if (isPrincipalOrOwnerRole(normalizedRole) || isAdminRole(normalizedRole)) return true
  const fallbackRole = normalizeRoleText(actor?.role || actor?.workspaceRole || actor?.organisationRole || actor?.roleKey)
  return LEAD_WORKSPACE_CAN_VIEW_ALL_ROLES.has(fallbackRole) || isPrincipalOrOwnerRole(fallbackRole) || isAdminRole(fallbackRole)
}

function getActorIdentitySet(actor = {}) {
  const identities = new Set()
  const actorId = normalizeLower(normalizeText(actor?.id || actor?.user_id || actor?.userId))
  const actorEmail = normalizeLower(normalizeText(actor?.email || actor?.userEmail || actor?.contactEmail))
  if (actorId) identities.add(actorId)
  if (actorEmail) identities.add(actorEmail)
  return identities
}

function isLeadVisibleToActor(row = {}, actor = {}) {
  if (canViewAllWorkspaceLeads(actor)) return true
  const actorIds = getActorIdentitySet(actor)
  if (!actorIds.size) return false
  const actorIdsLower = actorIds
  const assignedAgentId = normalizeLower(readId(row, ['assignedAgentId', 'assigned_agent_id', 'assignedUserId', 'assigned_user_id']))
  const assignedAgentEmail = normalizeLower(readId(row, ['assignedAgentEmail', 'assigned_agent_email']))
  const createdBy = normalizeLower(readId(row, ['createdBy', 'created_by']))
  const ownerUserId = normalizeLower(readId(row, ['ownerUserId', 'owner_user_id']))
  const ownerEmail = normalizeLower(readId(row, ['ownerAgentEmail', 'owner_agent_email']))
  return (
    actorIdsLower.has(assignedAgentId) ||
    actorIdsLower.has(assignedAgentEmail) ||
    actorIdsLower.has(ownerUserId) ||
    actorIdsLower.has(ownerEmail) ||
    actorIdsLower.has(createdBy)
  )
}

function buildLeadWorkspaceAssignmentMetrics(rows = []) {
  const normalizedRows = Array.isArray(rows) ? rows : []
  const byAgentMap = new Map()
  for (const lead of normalizedRows) {
    const assignedAgentId = normalizeLower(readId(lead, ['assignedAgentId', 'assigned_agent_id']))
    if (assignedAgentId) byAgentMap.set(assignedAgentId, (byAgentMap.get(assignedAgentId) || 0) + 1)
  }
  return {
    unassigned: normalizedRows.filter((lead) => {
      const assignedAgentId = normalizeLower(readId(lead, ['assignedAgentId', 'assigned_agent_id']))
      const assignedQueueId = normalizeLower(readId(lead, ['assignedQueueId', 'assigned_queue_id']))
      return !assignedAgentId && (!assignedQueueId || assignedQueueId === 'unassigned')
    }).length,
    assigned: normalizedRows.filter((lead) => {
      const assignedAgentId = normalizeLower(readId(lead, ['assignedAgentId', 'assigned_agent_id']))
      const assignedQueueId = normalizeLower(readId(lead, ['assignedQueueId', 'assigned_queue_id']))
      return assignedAgentId || (assignedQueueId && assignedQueueId !== 'unassigned')
    }).length,
    overdue: normalizedRows.filter((lead) => getLeadSlaStatus(lead) === 'overdue').length,
    escalated: normalizedRows.filter((lead) => normalizeLower(lead?.ownershipStatus || lead?.ownership_status) === 'escalated').length,
    byAgent: [...byAgentMap.entries()].map(([agentId, count]) => ({ agentId, count })),
  }
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

function isPlaceholderLeadName(value = '') {
  const normalized = normalizeLower(value).replace(/[^a-z0-9]+/g, ' ').trim()
  return !normalized ||
    normalized === 'lead' ||
    normalized === 'unnamed' ||
    normalized === 'unnamed lead' ||
    normalized === 'unnamed seller' ||
    normalized === 'unnamed buyer' ||
    normalized === 'unnamed contact' ||
    normalized === 'seller lead' ||
    normalized === 'buyer lead' ||
    normalized === 'seller listing' ||
    normalized === 'untitled listing' ||
    normalized === 'property not linked'
}

function getSellerOnboardingFormData(source = {}) {
  if (!isPlainObject(source)) return {}
  const onboarding = isPlainObject(source.sellerOnboarding)
    ? source.sellerOnboarding
    : isPlainObject(source.seller_onboarding)
      ? source.seller_onboarding
      : isPlainObject(source.sellerOnboardingRecord)
        ? source.sellerOnboardingRecord
        : isPlainObject(source.seller_onboarding_record)
          ? source.seller_onboarding_record
          : {}
  if (isPlainObject(onboarding.formData)) return onboarding.formData
  if (isPlainObject(onboarding.form_data)) return onboarding.form_data
  if (isPlainObject(source.sellerOnboardingFormData)) return source.sellerOnboardingFormData
  if (isPlainObject(source.seller_onboarding_form_data)) return source.seller_onboarding_form_data
  return {}
}

function getSellerNameFromFormData(formData = {}) {
  if (!isPlainObject(formData)) return ''
  const firstName = normalizeText(formData.firstName || formData.first_name || formData.sellerFirstName || formData.seller_first_name)
  const lastName = normalizeText(formData.lastName || formData.last_name || formData.surname || formData.sellerSurname || formData.seller_surname)
  return normalizeText(
    formData.fullName ||
      formData.full_name ||
      formData.displayName ||
      formData.display_name ||
      formData.sellerName ||
      formData.seller_name ||
      [firstName, lastName].filter(Boolean).join(' '),
  )
}

function getSellerNameFromCanonicalFacts(source = {}) {
  const facts = isPlainObject(source?.sellerCanonicalFacts)
    ? source.sellerCanonicalFacts
    : isPlainObject(source?.seller_canonical_facts_json)
      ? source.seller_canonical_facts_json
      : isPlainObject(source?.sellerOnboarding?.canonicalFacts)
        ? source.sellerOnboarding.canonicalFacts
        : isPlainObject(source?.seller_onboarding?.canonical_facts)
          ? source.seller_onboarding.canonical_facts
          : {}
  const firstName = normalizeText(facts.firstName || facts.first_name || facts.sellerFirstName || facts.seller_first_name)
  const lastName = normalizeText(facts.lastName || facts.last_name || facts.surname || facts.sellerSurname || facts.seller_surname)
  return normalizeText(
    facts.fullName ||
      facts.full_name ||
      facts.displayName ||
      facts.display_name ||
      facts.sellerName ||
      facts.seller_name ||
      facts.name ||
      [firstName, lastName].filter(Boolean).join(' '),
  )
}

function getSellerPropertyDisplayName(lead = {}, listing = null, rowFormData = {}, listingFormData = {}) {
  const value = normalizeText(
    lead?.sellerPropertyAddress ||
      lead?.seller_property_address ||
      lead?.propertyAddress ||
      lead?.property_address ||
      lead?.formattedAddress ||
      lead?.formatted_address ||
      rowFormData.propertyAddress ||
      rowFormData.property_address ||
      listingFormData.propertyAddress ||
      listingFormData.property_address ||
      listing?.propertyAddress ||
      listing?.property_address ||
      listing?.formattedAddress ||
      listing?.formatted_address ||
      listing?.address ||
      listing?.title ||
      lead?.propertyInterest ||
      lead?.property_interest,
  )
  if (!value || isPlaceholderLeadName(value)) return ''
  return `Seller lead - ${value}`
}

function getLeadName(lead = {}, contact = null, listing = null) {
  const rowFormData = getSellerOnboardingFormData(lead)
  const listingFormData = getSellerOnboardingFormData(listing || {})
  const candidates = [
    getContactName(contact),
    [lead?.firstName || lead?.first_name || lead?.sellerName || lead?.seller_name, lead?.lastName || lead?.last_name || lead?.sellerSurname || lead?.seller_surname].map(normalizeText).filter(Boolean).join(' '),
    normalizeText(lead?.name),
    getSellerNameFromFormData(rowFormData),
    getSellerNameFromFormData(listingFormData),
    normalizeText(listing?.sellerName || listing?.seller_name || listing?.seller?.name),
    getSellerNameFromCanonicalFacts(listing || {}),
    getSellerNameFromCanonicalFacts(lead || {}),
    getSellerPropertyDisplayName(lead, listing, rowFormData, listingFormData),
    normalizeText(
      rowFormData.email ||
        rowFormData.sellerEmail ||
        rowFormData.seller_email ||
        listingFormData.email ||
        listingFormData.sellerEmail ||
        listingFormData.seller_email ||
        lead?.email ||
        lead?.sellerEmail ||
        lead?.seller_email ||
        listing?.sellerEmail ||
        listing?.seller_email ||
        listing?.seller?.email,
    ),
  ]
  return candidates.find((value) => value && !isPlaceholderLeadName(value)) || 'Seller lead'
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

function getLeadListingInterestListingId(row = {}) {
  return readId(row, ['listingId', 'listing_id'])
}

function sortLeadListingInterestsForBuyer(left = {}, right = {}) {
  const leftDismissed = normalizeLower(left.status) === 'dismissed'
  const rightDismissed = normalizeLower(right.status) === 'dismissed'
  if (leftDismissed !== rightDismissed) return leftDismissed ? 1 : -1
  if (Boolean(left.isOriginalEnquiry ?? left.is_original_enquiry) !== Boolean(right.isOriginalEnquiry ?? right.is_original_enquiry)) {
    return (left.isOriginalEnquiry ?? left.is_original_enquiry) ? -1 : 1
  }
  const statusRank = {
    converted: 0,
    offer_submitted: 1,
    viewing_scheduled: 2,
    viewed: 3,
    sent: 4,
    shortlisted: 5,
    interested: 6,
    suggested: 7,
    dismissed: 99,
  }
  const leftStatusRank = statusRank[normalizeLower(left.status)] ?? 50
  const rightStatusRank = statusRank[normalizeLower(right.status)] ?? 50
  if (leftStatusRank !== rightStatusRank) return leftStatusRank - rightStatusRank
  return new Date(right.updatedAt || right.updated_at || right.createdAt || right.created_at || 0).getTime() -
    new Date(left.updatedAt || left.updated_at || left.createdAt || left.created_at || 0).getTime()
}

function getCanonicalBuyerLeadListingId(lead = {}, listingInterests = []) {
  const canonicalInterest = [...(Array.isArray(listingInterests) ? listingInterests : [])]
    .sort(sortLeadListingInterestsForBuyer)
    .find((interest) => getLeadListingInterestListingId(interest))
  return getLeadListingInterestListingId(canonicalInterest || {}) || getListingId(lead)
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
  const relatedEntityType = normalizeLower(row?.relatedEntityType || row?.related_entity_type)
  const relatedEntityId = readId(row, ['relatedEntityId', 'related_entity_id'])
  return (
    (context.leadId && rowLeadId === context.leadId) ||
    (context.leadId && ['lead', 'seller_lead', 'crm_lead'].includes(relatedEntityType) && relatedEntityId === context.leadId) ||
    (context.contactId && rowContactId === context.contactId) ||
    (context.listingId && rowListingId === context.listingId) ||
    (context.listingId && ['listing', 'private_listing', 'seller_listing'].includes(relatedEntityType) && relatedEntityId === context.listingId) ||
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
  const sellerOnboarding = row?.sellerOnboarding || row?.seller_onboarding || null
  const onboardingFormData = getSellerOnboardingFormData(row)
  const propertyAddress = normalizeText(
    row?.title ||
      row?.listingTitle ||
      row?.listing_title ||
      row?.propertyTitle ||
      row?.property_title ||
      row?.property_address ||
      row?.propertyAddress ||
      row?.address ||
      row?.addressLine1 ||
      row?.address_line_1 ||
      onboardingFormData.propertyAddress ||
      onboardingFormData.property_address ||
      onboardingFormData.propertyAddressLine1 ||
      onboardingFormData.property_address_line_1 ||
      onboardingFormData.propertyAddressSearch ||
      onboardingFormData.property_address_search,
  )
  const sellerOnboardingStatus = normalizeText(
    row?.sellerOnboardingStatus ||
      row?.seller_onboarding_status ||
      sellerOnboarding?.status,
  )
  return {
    ...row,
    id: listingId,
    listingId,
    leadId: readId(row, ['sellerLeadId', 'seller_lead_id', 'originatingCrmLeadId', 'originating_crm_lead_id']),
    assignedAgentId: readId(row, ['assignedAgentId', 'assigned_agent_id']),
    assignedAgentEmail: normalizeText(row?.assignedAgentEmail || row?.assigned_agent_email).toLowerCase(),
    listingStatus: normalizeText(row?.listingStatus || row?.listing_status || row?.status),
    listingVisibility: normalizeText(row?.listingVisibility || row?.listing_visibility),
    mandateStatus: normalizeText(row?.mandateStatus || row?.mandate_status),
    mandatePacketId: readId(row, ['mandatePacketId', 'mandate_packet_id']),
    sellerOnboardingStatus,
    status: normalizeText(row?.listingStatus || row?.listing_status || row?.status),
    title: propertyAddress || normalizeText(row?.suburb),
    propertyAddress,
    addressLine1: normalizeText(row?.addressLine1 || row?.address_line_1 || row?.property_address || onboardingFormData.propertyAddressLine1 || onboardingFormData.propertyAddress || onboardingFormData.propertyAddressSearch),
    suburb: normalizeText(row?.suburb || row?.area || onboardingFormData.suburb),
    city: normalizeText(row?.city || onboardingFormData.city),
    askingPrice: row?.asking_price ?? row?.askingPrice ?? row?.price ?? onboardingFormData.askingPrice ?? null,
  }
}

function sourceContextFromPacket(packet = {}) {
  return packet?.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : packet?.sourceContextJson && typeof packet.sourceContextJson === 'object'
      ? packet.sourceContextJson
      : {}
}

function normalizeDocumentPacket(row = {}) {
  const sourceContext = sourceContextFromPacket(row)
  return {
    ...row,
    id: readId(row, ['id', 'packetId', 'packet_id']),
    packetId: readId(row, ['id', 'packetId', 'packet_id']),
    leadId: readId(row, ['leadId', 'lead_id']) || readId(sourceContext, ['leadId', 'lead_id', 'sellerLeadId', 'seller_lead_id', 'crmLeadId', 'crm_lead_id']),
    listingId: readId(sourceContext, ['listingId', 'listing_id', 'privateListingId', 'private_listing_id']),
    packetType: normalizeText(row?.packetType || row?.packet_type),
    status: normalizeText(row?.status),
    completedAt: row?.completedAt || row?.completed_at || null,
    updatedAt: row?.updatedAt || row?.updated_at || row?.createdAt || row?.created_at || null,
    sourceContextJson: sourceContext,
  }
}

function packetMatchesLeadContext(packet = {}, context = {}) {
  const normalized = normalizeDocumentPacket(packet)
  const sourceContext = normalized.sourceContextJson || {}
  const packetLeadIds = [
    normalized.leadId,
    readId(packet, ['sellerLeadId', 'seller_lead_id', 'crmLeadId', 'crm_lead_id', 'relatedEntityId', 'related_entity_id']),
    readId(sourceContext, ['leadId', 'lead_id', 'sellerLeadId', 'seller_lead_id', 'crmLeadId', 'crm_lead_id', 'relatedEntityId', 'related_entity_id']),
  ].map(normalizeText).filter(Boolean)
  const packetListingIds = [
    normalized.listingId,
    readId(sourceContext, ['listingId', 'listing_id', 'privateListingId', 'private_listing_id']),
  ].map(normalizeText).filter(Boolean)
  return Boolean(
    (context.leadId && packetLeadIds.includes(context.leadId)) ||
    (context.listingId && packetListingIds.includes(context.listingId)),
  )
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
  documentPackets = [],
  assignmentHistory = [],
  agentDirectory = {},
} = {}) {
  const contactsById = new Map(contacts.map((contact) => [readId(contact, ['contactId', 'contact_id', 'id']), contact]).filter(([id]) => id))
  const normalizedOffers = offers.map(normalizeOffer).filter((offer) => offer.id || offer.leadId || offer.contactId || offer.listingId)
  const normalizedTransactions = transactions.map(normalizeTransaction).filter((transaction) => transaction.id || transaction.leadId || transaction.contactId)
  const normalizedListings = listings.map(normalizeListing).filter((listing) => listing.id || listing.leadId)
  const normalizedDocumentPackets = documentPackets.map(normalizeDocumentPacket).filter((packet) => packet.id)

  return leads.map((lead) => {
    const leadId = getLeadId(lead)
    const contact = getLeadContact(lead, contactsById)
    const contactId = readId(lead, ['contactId', 'contact_id']) || readId(contact || {}, ['contactId', 'contact_id'])
    const convertedTransactionId = readId(lead, ['convertedTransactionId', 'converted_transaction_id', 'convertedDealId'])
    const relatedListingInterests = listingInterests
      .filter((interest) => getLeadId(interest) === leadId || readId(interest, ['leadId', 'lead_id']) === leadId)
      .sort(sortLeadListingInterestsForBuyer)
    const isBuyerLead = inferLeadCategoryFromRecord(lead, 'buyer') === 'buyer'
    const canonicalBuyerListingId = isBuyerLead ? getCanonicalBuyerLeadListingId(lead, relatedListingInterests) : ''
    const listingId = isBuyerLead ? canonicalBuyerListingId : getListingId(lead)
    const context = { leadId, contactId, listingId, convertedTransactionId }
    const relatedActivities = leadActivities
      .filter((activity) => getLeadId(activity) === leadId)
      .sort((left, right) => new Date(right.activityDate || right.activity_date || right.createdAt || right.created_at || 0) - new Date(left.activityDate || left.activity_date || left.createdAt || left.created_at || 0))
    const relatedTasks = tasks.filter((task) => getLeadId(task) === leadId).sort(sortTasksByDueDate)
    const canonicalBuyerListingIds = isBuyerLead
      ? new Set(relatedListingInterests.map(getLeadListingInterestListingId).filter(Boolean))
      : new Set()
    const relatedListings = normalizedListings.filter((listing) => {
      const normalizedListingId = getNormalizedListingId(listing)
      if (isBuyerLead && canonicalBuyerListingIds.size) return canonicalBuyerListingIds.has(normalizedListingId)
      return matchesLeadContext(listing, context)
    })
    const expandedContext = {
      ...context,
      listingId: context.listingId || getListingId(relatedListings[0] || {}) || readId(relatedListings[0] || {}, ['id']),
    }
    const relatedDocumentPackets = normalizedDocumentPackets
      .filter((packet) => packetMatchesLeadContext(packet, expandedContext))
      .sort((left, right) => new Date(right.updatedAt || right.completedAt || 0).getTime() - new Date(left.updatedAt || left.completedAt || 0).getTime())
    const mandatePacket = relatedDocumentPackets.find((packet) => normalizeLower(packet.packetType || packet.packet_type || packet.title).includes('mandate')) || null
    const relatedAppointments = appointments.filter((appointment) => matchesLeadContext(appointment, expandedContext))
    const relatedOffers = normalizedOffers.filter((offer) => matchesLeadContext(offer, expandedContext) || relatedAppointments.some((appointment) => getAppointmentId(appointment) && getAppointmentId(appointment) === offer.appointmentId))
    const relatedTransactions = normalizedTransactions.filter((transaction) => matchesLeadContext(transaction, expandedContext))
    const relatedSuggestions = suggestions
      .filter((suggestion) => getLeadId(suggestion) === leadId || readId(suggestion, ['leadId', 'lead_id']) === leadId)
      .sort((left, right) => Number(right.score || 0) - Number(left.score || 0) || new Date(right.generatedAt || right.generated_at || 0).getTime() - new Date(left.generatedAt || left.generated_at || 0).getTime())
    const resolvedDirectoryAgent = resolveDirectoryAgent(lead, relatedListings[0], agentDirectory)
    const resolvedDirectoryName = normalizeText(
      resolvedDirectoryAgent?.name ||
      resolvedDirectoryAgent?.fullName ||
      resolvedDirectoryAgent?.email,
    )
    const relatedListingAssignedAgentEmail = normalizeText(relatedListings[0]?.assignedAgentEmail || relatedListings[0]?.assigned_agent_email).toLowerCase()
    const leadAssignedAgentEmail = normalizeText(lead?.assignedAgentEmail || lead?.assigned_agent_email).toLowerCase()
    const resolvedAssignedAgentEmail = normalizeText(
      resolvedDirectoryAgent?.email ||
      leadAssignedAgentEmail ||
      lead?.assignedAgentEmail ||
      lead?.assigned_agent_email ||
      relatedListingAssignedAgentEmail,
    ).toLowerCase()
    const resolvedAssignedAgentId = normalizeText(
      resolvedDirectoryAgent?.id ||
      readId(lead, ['assignedAgentId', 'assigned_agent_id', 'assignedUserId', 'assigned_user_id']) ||
      readId(relatedListings[0] || {}, ['assignedAgentId', 'assigned_agent_id']),
    )
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
    const enquiryListingId = readId(lead, ['enquiredListingId', 'enquired_listing_id'])
    const enquiryListing = enquiryListingId ? relatedListings.find((listing) => getListingId(listing) === enquiryListingId) || null : null
    const sellerListing = relatedListings[0] || null
    const sellerOnboarding = lead?.sellerOnboarding || lead?.seller_onboarding || sellerListing?.sellerOnboarding || sellerListing?.seller_onboarding || null
    const sellerFormData = {
      ...getSellerOnboardingFormData(sellerListing || {}),
      ...getSellerOnboardingFormData(lead || {}),
    }
    const sellerOnboardingStatus = normalizeText(
      lead?.sellerOnboardingStatus ||
        lead?.seller_onboarding_status ||
        sellerOnboarding?.status ||
        sellerListing?.sellerOnboardingStatus ||
        sellerListing?.seller_onboarding_status,
    )
    const sellerAddress = normalizeText(lead?.sellerPropertyAddress || lead?.seller_property_address || sellerListing?.propertyAddress)
    const sellerAddressLower = normalizeLower(sellerAddress)
    const sellerSuburb = normalizeText(sellerListing?.suburb || lead?.areaInterest || lead?.area_interest)
    const sellerCity = normalizeText(sellerListing?.city)
    const sellerAddressParts = [
      sellerAddress,
      sellerSuburb && !sellerAddressLower.includes(normalizeLower(sellerSuburb)) ? sellerSuburb : '',
      sellerCity && !sellerAddressLower.includes(normalizeLower(sellerCity)) ? sellerCity : '',
    ].filter(Boolean)

    return {
      ...lead,
      id: leadId,
      leadId,
      assignedUserId: readId(lead, ['assignedUserId', 'assigned_user_id']),
      createdBy: readId(lead, ['createdBy', 'created_by']),
      contact,
      contactId,
      name: getLeadName(lead, contact, sellerListing),
      phone: normalizeText(contact?.phone || contact?.phone_number || lead?.phone || lead?.sellerPhone || lead?.seller_phone || sellerFormData.phone || sellerFormData.sellerPhone || sellerFormData.seller_phone || sellerListing?.sellerPhone || sellerListing?.seller_phone || sellerListing?.seller?.phone),
      email: normalizeText(contact?.email || lead?.email || lead?.sellerEmail || lead?.seller_email || sellerFormData.email || sellerFormData.sellerEmail || sellerFormData.seller_email || sellerListing?.sellerEmail || sellerListing?.seller_email || sellerListing?.seller?.email).toLowerCase(),
      source: normalizeLeadSourceLabel(lead),
      stage: normalizeText(lead?.stage || lead?.status) || 'Unknown',
      status: normalizeText(lead?.status || lead?.stage) || 'Unknown',
      assignedAgentId: resolvedAssignedAgentId || readId(relatedListings[0] || {}, ['assignedAgentId', 'assigned_agent_id']),
      assignedAgentEmail: resolvedAssignedAgentEmail,
      assignedAgent: resolvedDirectoryName || lead?.assignedAgentName || lead?.assigned_agent_name || resolvedAssignedAgentEmail || 'Unassigned',
      assignedAgentName: resolvedDirectoryName || lead?.assignedAgentName || lead?.assigned_agent_name || resolvedAssignedAgentEmail || 'Unassigned',
      assigned_agent_name: resolvedDirectoryName || lead?.assignedAgentName || lead?.assigned_agent_name || resolvedAssignedAgentEmail || 'Unassigned',
      assignedQueueId: readId(lead, ['assignedQueueId', 'assigned_queue_id']),
      assignedQueue: normalizeText(lead?.assignedQueueId || lead?.assigned_queue_id) || '—',
      assignedAt,
      firstContactedAt,
      slaDueAt: lead?.slaDueAt || lead?.sla_due_at || null,
      enquiredListingId: enquiryListingId,
      enquiredPropertyTitle: normalizeText(
        lead?.enquiredPropertyTitle || lead?.enquired_property_title || enquiryListing?.title,
      ),
      enquiredPropertyAddress: normalizeText(
        lead?.enquiredPropertyAddress || lead?.enquired_property_address ||
        `${normalizeText(enquiryListing?.propertyAddress)} ${normalizeText(enquiryListing?.suburb)}`.trim(),
      ),
      enquiredPropertyPrice: (() => {
        const rawPrice = enquiryListing?.askingPrice ?? lead?.enquiredPropertyPrice ?? lead?.enquired_property_price
        return rawPrice === undefined || rawPrice === null || rawPrice === '' ? null : Number(rawPrice) || null
      })(),
      sellerPropertyAddress: normalizeText(lead?.sellerPropertyAddress || lead?.seller_property_address) || sellerAddressParts.join(', '),
      ownershipStatus: normalizeText(lead?.ownershipStatus || lead?.ownership_status) || 'awaiting_assignment',
      slaStatus: getLeadSlaStatus(lead),
      responseTimeHours,
      assignmentHistory: relatedAssignmentHistory,
      createdAt: lead?.createdAt || lead?.created_at || null,
      updatedAt: lead?.updatedAt || lead?.updated_at || null,
      listingId: listingId || expandedContext.listingId,
      privateListingId: listingId || expandedContext.listingId,
      mandatePacketId: lead?.mandatePacketId || lead?.mandate_packet_id || sellerListing?.mandatePacketId || sellerListing?.mandate_packet_id,
      sellerOnboarding,
      sellerOnboardingStatus,
      seller_onboarding_status: sellerOnboardingStatus,
      sellerOnboardingToken: lead?.sellerOnboardingToken || lead?.seller_onboarding_token || sellerOnboarding?.token || sellerListing?.sellerOnboardingToken || sellerListing?.seller_onboarding_token,
      sellerOnboardingLink: lead?.sellerOnboardingLink || lead?.seller_onboarding_link || sellerOnboarding?.link || sellerListing?.sellerOnboardingLink || sellerListing?.seller_onboarding_link,
      sellerOnboardingSubmittedAt: lead?.sellerOnboardingSubmittedAt || lead?.seller_onboarding_submitted_at || sellerOnboarding?.submittedAt || sellerOnboarding?.submitted_at || sellerOnboarding?.completedAt,
      sellerOnboardingCompletedAt: lead?.sellerOnboardingCompletedAt || lead?.seller_onboarding_completed_at || sellerOnboarding?.completedAt || sellerOnboarding?.submittedAt || sellerOnboarding?.submitted_at,
      sellerCanonicalFacts: lead?.sellerCanonicalFacts || lead?.seller_canonical_facts_json || sellerListing?.sellerCanonicalFacts || sellerListing?.seller_canonical_facts_json,
      sellerCanonicalFactReadiness: lead?.sellerCanonicalFactReadiness || lead?.seller_canonical_fact_readiness_json || sellerListing?.sellerCanonicalFactReadiness || sellerListing?.seller_canonical_fact_readiness_json,
      propertyDetails: lead?.propertyDetails || sellerListing?.propertyDetails || sellerListing?.property_details,
      documentRequirements: Array.isArray(lead?.documentRequirements) ? lead.documentRequirements : Array.isArray(sellerListing?.documentRequirements) ? sellerListing.documentRequirements : [],
      documents: Array.isArray(lead?.documents) ? lead.documents : Array.isArray(sellerListing?.documents) ? sellerListing.documents : [],
      convertedTransactionId,
      latestActivity,
      nextTask,
      activities: relatedActivities,
      tasks: relatedTasks,
      appointments: relatedAppointments,
      offers: relatedOffers,
      transactions: relatedTransactions,
      listings: relatedListings,
      documentPackets: relatedDocumentPackets,
      mandatePacket,
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

function buildAgentLeadSearchText(row = {}) {
  const contact = row?.contact || {}
  const nextTask = row?.nextTask || {}
  const listingTokens = (Array.isArray(row?.listings) ? row.listings : [])
    .flatMap((listing) => [
      listing?.title,
      listing?.label,
      listing?.listingTitle,
      listing?.propertyTitle,
      listing?.propertyName,
      listing?.propertyAddress,
      listing?.address,
      listing?.addressLine1,
      listing?.suburb,
      listing?.city,
      listing?.province,
    ])

  return [
    row?.name,
    row?.phone,
    row?.email,
    contact?.firstName,
    contact?.lastName,
    contact?.phone,
    contact?.email,
    row?.source,
    row?.leadSource,
    row?.assignedAgent,
    row?.assignedAgentName,
    row?.assignedAgentEmail,
    row?.propertyInterest,
    row?.enquiredPropertyTitle,
    row?.enquiredPropertyAddress,
    row?.sellerPropertyAddress,
    row?.formattedAddress,
    row?.streetAddress,
    row?.suburb,
    row?.city,
    row?.areaInterest,
    nextTask?.title,
    nextTask?.description,
    ...listingTokens,
  ].map(normalizeLower).join(' ')
}

export function filterAgentLeadRows(rows = [], filters = {}) {
  const search = normalizeLower(filters.search)
  const stage = normalizeLower(filters.stage)
  const source = normalizeLower(filters.source)
  const agent = normalizeLower(filters.agent)
  const createdFrom = normalizeText(filters.createdFrom || filters.dateFrom || filters.dateAdded || '')
  const createdTo = normalizeText(filters.createdTo || filters.dateTo || filters.dateAdded || '')
  const dateFrom = createdFrom ? new Date(`${createdFrom}T00:00:00`).getTime() : null
  const dateTo = createdTo ? new Date(`${createdTo}T23:59:59.999`).getTime() : null

  return rows.filter((row) => {
    if (search) {
      const haystack = buildAgentLeadSearchText(row)
      if (!haystack.includes(search)) return false
    }
    if (stage && stage !== 'all' && normalizeLower(row.stage) !== stage && normalizeLower(row.status) !== stage) return false
    if (source && source !== 'all' && normalizeLower(row.source) !== source) return false
    if (agent && agent !== 'all' && normalizeLower(row.assignedAgent) !== agent) return false
    const createdMs = row.createdAt ? new Date(row.createdAt).getTime() : null
    if ((dateFrom || dateTo) && (!createdMs || (dateFrom && createdMs < dateFrom) || (dateTo && createdMs > dateTo))) return false
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
    'id, organisation_id, seller_lead_id, originating_crm_lead_id, assigned_agent_id, listing_status, listing_visibility, mandate_status, mandate_packet_id, seller_onboarding_status, title, address_line_1, property_address, suburb, city, asking_price, estimated_value, property_type, property_category, seller_canonical_facts_json, seller_canonical_fact_readiness_json, created_at, updated_at',
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

async function safeReadDocumentPackets(organisationId = '') {
  if (!isSupabaseConfigured || !supabase || !isUuidLike(organisationId)) return []
  const selectVariants = [
    'id, organisation_id, lead_id, packet_type, title, status, source_context_json, completed_at, created_at, updated_at',
    'id, organisation_id, lead_id, packet_type, title, status, source_context_json, created_at, updated_at',
    'id, organisation_id, lead_id, packet_type, title, status, created_at, updated_at',
    'id, organisation_id, lead_id, packet_type, title, status, source_context_json, created_at',
    'id, organisation_id, lead_id, packet_type, title, status, created_at',
  ]
  let data = []
  let error = null
  for (const fields of selectVariants) {
    const result = await supabase
      .from('document_packets')
      .select(fields)
      .eq('organisation_id', organisationId)
      .order('updated_at', { ascending: false })
      .limit(1000)
    data = result.data
    error = result.error
    if (!error || !isRecoverableReadError(error, 'document_packets')) break
  }
  if (error) {
    if (isRecoverableReadError(error, 'document_packets')) return []
    throw error
  }
  return Array.isArray(data) ? data : []
}

async function safeReadHydratedPrivateListing(listingId = '') {
  if (!isSupabaseConfigured || !supabase) return null
  if (!isUuidLike(listingId)) return null
  try {
    return await getPrivateListing(listingId, { includeRequirementsAndDocuments: false })
  } catch (error) {
    if (isRecoverableReadError(error, 'private_listing_document_requirements') || isRecoverableReadError(error, 'private_listing_documents')) {
      try {
        return await getPrivateListing(listingId, { includeRequirementsAndDocuments: false })
      } catch (fallbackError) {
        if (isRecoverableReadError(fallbackError, 'private_listings')) return null
        throw fallbackError
      }
    }
    if (isRecoverableReadError(error, 'private_listings')) return null
    throw error
  }
}

async function safeReadSellerOnboardingForListing(listingId = '') {
  if (!isSupabaseConfigured || !supabase || !isUuidLike(listingId)) return null
  const { data, error } = await supabase
    .from('private_listing_seller_onboarding')
    .select('id, private_listing_id, token, token_expires_at, seller_type, ownership_structure, marital_regime, form_data, status, submitted_at, created_at, updated_at')
    .eq('private_listing_id', listingId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) {
    if (isRecoverableReadError(error, 'private_listing_seller_onboarding')) return null
    throw error
  }
  return Array.isArray(data) ? data[0] || null : null
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

export async function listAgentLeadWorkspaceRows({ organisationId = '', actor = null } = {}) {
  const snapshot = await listAgencyCrmLeadContacts(organisationId)
  const directory = await listOrganisationUsers().catch(() => [])
  const directoryLookup = buildAgentDirectoryLookup(directory)
  const [appointments, offers, transactions, listings, listingInterests, requirements, recommendations, savedSearches, propertyShares, communicationDeliveries, communicationPreferences, ownershipRows] = await Promise.all([
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
    agentDirectory: directoryLookup,
  })
  const scopedRows = canViewAllWorkspaceLeads(actor || {})
    ? rows
    : rows.filter((row) => isLeadVisibleToActor(row, actor || {}))
  const assignmentMetrics = buildLeadWorkspaceAssignmentMetrics(scopedRows)
  return {
    ...snapshot,
    rows: scopedRows,
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

export async function fetchAgentLeadWorkspace({ organisationId = '', leadId = '', actor = null } = {}) {
  const workspace = await fetchAgencyCrmLeadWorkspace(organisationId, leadId)
  const lead = workspace.leads[0] || null
  if (!lead) {
    return {
      ...workspace,
      row: null,
      appointments: [],
      offers: [],
      transactions: [],
      listings: [],
      notFound: workspace.leadWorkspaceStatus === 'not_found',
      unavailable: workspace.leadWorkspaceStatus === 'unavailable',
    }
  }

  const contact = workspace.contacts[0] || null
  const resolvedWorkspaceListingId = normalizeText(workspace?.listingId || workspace?.listing_id)
  const context = {
    leadId: getLeadId(lead),
    contactId: getContactId(contact) || getContactId(lead),
    listingId: getListingId(lead) || resolvedWorkspaceListingId,
    convertedTransactionId: readId(lead, ['convertedTransactionId', 'converted_transaction_id', 'convertedDealId']),
  }
  const [allAppointments, transactions, listings, documentPackets, listingInterests, requirements, communications, suggestions, recommendations, savedSearches, propertyShares, communicationDeliveries, communicationPreferences, assignmentHistory, ownershipRows] = await Promise.all([
    safeReadAppointments(organisationId),
    safeReadTransactions(organisationId, context),
    safeReadPrivateListings(organisationId),
    safeReadDocumentPackets(organisationId),
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
  const directory = await listOrganisationUsers().catch(() => [])
  const directoryLookup = buildAgentDirectoryLookup(directory)
  const isBuyerLead = inferLeadCategoryFromRecord(lead, 'buyer') === 'buyer'
  const canonicalBuyerListingId = isBuyerLead ? getCanonicalBuyerLeadListingId(lead, listingInterests) : ''
  const canonicalContext = {
    ...context,
    listingId: isBuyerLead ? (canonicalBuyerListingId || context.listingId) : context.listingId,
  }
  const normalizedListings = listings.map(normalizeListing)
  const canonicalBuyerListingIds = isBuyerLead
    ? new Set(listingInterests.map(getLeadListingInterestListingId).filter(Boolean))
    : new Set()
  const linkedListing = normalizedListings.find((listing) => {
    const listingId = getNormalizedListingId(listing)
    if (isBuyerLead && canonicalBuyerListingIds.size) return canonicalBuyerListingIds.has(listingId)
    return matchesLeadContext(listing, canonicalContext)
  }) || null
  const normalizedDocumentPackets = documentPackets.map(normalizeDocumentPacket)
  const packetListingIds = normalizedDocumentPackets
    .filter((packet) => packetMatchesLeadContext(packet, canonicalContext))
    .map((packet) => packet.listingId)
    .filter(Boolean)
  const candidateListingIds = [
    canonicalContext.listingId,
    resolvedWorkspaceListingId,
    linkedListing?.id,
    linkedListing?.listingId,
    ...packetListingIds,
  ].map(normalizeText).filter(Boolean)
  let hydratedLinkedListing = null
  for (const candidateListingId of [...new Set(candidateListingIds)]) {
    hydratedLinkedListing = await safeReadHydratedPrivateListing(candidateListingId)
    if (hydratedLinkedListing) break
  }
  const fallbackListingId = [...new Set(candidateListingIds)][0] || ''
  const fallbackSellerOnboarding = fallbackListingId ? await safeReadSellerOnboardingForListing(fallbackListingId) : null
  const hydratedListingSource = hydratedLinkedListing && fallbackSellerOnboarding
    ? {
        ...hydratedLinkedListing,
        sellerOnboarding: hydratedLinkedListing.sellerOnboarding || hydratedLinkedListing.seller_onboarding || fallbackSellerOnboarding,
        seller_onboarding: hydratedLinkedListing.seller_onboarding || hydratedLinkedListing.sellerOnboarding || fallbackSellerOnboarding,
      }
    : hydratedLinkedListing
  const hydratedListing = hydratedListingSource ? normalizeListing(hydratedListingSource) : null
  const fallbackListing = !hydratedListing && fallbackListingId && fallbackSellerOnboarding
    ? normalizeListing({
        id: fallbackListingId,
        listing_id: fallbackListingId,
        listingId: fallbackListingId,
        organisation_id: lead?.organisation_id,
        leadId: context.leadId,
        sellerLeadId: context.leadId,
        seller_lead_id: context.leadId,
        originatingCrmLeadId: context.leadId,
        originating_crm_lead_id: context.leadId,
        assignedAgentId: lead?.assignedAgentId || lead?.assigned_agent_id,
        assigned_agent_id: lead?.assignedAgentId || lead?.assigned_agent_id,
        title: lead?.property_interest || lead?.seller_property_address || lead?.formatted_address || 'Seller listing',
        property_address: lead?.seller_property_address || lead?.formatted_address || '',
        sellerOnboarding: fallbackSellerOnboarding,
        seller_onboarding: fallbackSellerOnboarding,
        sellerOnboardingStatus: fallbackSellerOnboarding.status,
        seller_onboarding_status: fallbackSellerOnboarding.status,
      })
    : null
  const hydratedListingId = getNormalizedListingId(hydratedListing)
  const candidateListingIdSet = new Set(candidateListingIds)
  const workspaceListings = normalizedListings
    .map((listing) => (hydratedListingId && getNormalizedListingId(listing) === hydratedListingId ? hydratedListing : listing))
    .filter((listing) => {
      const listingId = getNormalizedListingId(listing)
      if (isBuyerLead && canonicalBuyerListingIds.size) return canonicalBuyerListingIds.has(listingId)
      return matchesLeadContext(listing, canonicalContext) || candidateListingIdSet.has(listingId)
    })
  if (hydratedListing && !workspaceListings.some((listing) => getNormalizedListingId(listing) === hydratedListingId)) {
    workspaceListings.push(hydratedListing)
  }
  if (fallbackListing && !workspaceListings.some((listing) => getNormalizedListingId(listing) === getNormalizedListingId(fallbackListing))) {
    workspaceListings.push(fallbackListing)
  }
  const expandedContext = {
    ...canonicalContext,
    listingId: canonicalContext.listingId || getListingId(workspaceListings[0] || {}) || getNormalizedListingId(workspaceListings[0] || {}),
  }
  const appointments = (Array.isArray(allAppointments) ? allAppointments : []).filter((appointment) => matchesLeadContext(appointment, expandedContext))
  const listingIds = [...new Set([expandedContext.listingId, ...appointments.map(getListingId)].filter(Boolean))]
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
  const rows = buildAgentLeadRows({
    leads: enrichLeadsWithOwnership(workspace.leads, ownershipRows),
    contacts: workspace.contacts,
    leadActivities: workspace.leadActivities,
    tasks: workspace.tasks,
    appointments,
    offers,
    transactions,
    listings: workspaceListings,
    documentPackets,
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
    agentDirectory: directoryLookup,
  })
  if (!canViewAllWorkspaceLeads(actor) && !isLeadVisibleToActor(rows[0] || {}, actor || {})) {
    return {
      ...workspace,
      row: null,
      appointments: [],
      offers: [],
      transactions: [],
      listings: [],
      listingInterests: [],
      requirements: [],
      communications: [],
      suggestions: [],
      recommendations: [],
      savedSearches: [],
      propertyShares: [],
      communicationDeliveries: [],
      communicationPreferences: [],
      timeline: [],
      assignmentHistory: [],
    }
  }
  return {
    ...workspace,
    row: rows[0] || null,
    appointments,
    offers: offers.map(normalizeOffer),
    transactions: transactions.map(normalizeTransaction).filter((transaction) => matchesLeadContext(transaction, expandedContext)),
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
