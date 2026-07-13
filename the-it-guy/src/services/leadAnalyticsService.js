import { listAgencyCrmLeadContacts } from '../lib/agencyCrmRepository'
import { listAppointmentsAsync } from '../lib/agencyPipelineService'
import { listCanonicalOffersForLead } from '../lib/buyerLifecycleService'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import {
  getCommunicationPerformanceMetrics,
  getListingDeliveryStatistics,
} from './communicationDeliveryService'
import { getCommunicationProviderHealth } from './communicationProviderService'
import { getRecommendationMetrics } from './leadRecommendationService'
import { inferLeadCategoryFromRecord } from '../lib/leadCategory'
import {
  buildSellerJourney,
  isSellerLead,
} from './sellerJourneyService.js'
import { getSellerReadiness } from './sellerReadinessService.js'

const SOURCE_VALUES = ['Property24', 'Private Property', 'Website', 'WhatsApp', 'Referral', 'Facebook', 'Google', 'Show Day', 'Walk-In', 'Manual Import', 'Other']

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeSource(value = '') {
  const normalized = normalizeLower(value).replace(/[-_\s]+/g, ' ')
  const found = SOURCE_VALUES.find((source) => normalizeLower(source).replace(/[-_\s]+/g, ' ') === normalized)
  return found || (normalized ? normalizeText(value) : 'Other')
}

function readId(row = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(row?.[key])
    if (value) return value
  }
  return ''
}

function readDate(row = {}, keys = []) {
  for (const key of keys) {
    const value = row?.[key]
    if (!value) continue
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return null
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function uniqueCount(values = []) {
  return new Set(values.map(normalizeText).filter(Boolean)).size
}

function percent(numerator, denominator) {
  const top = Number(numerator || 0)
  const bottom = Number(denominator || 0)
  return bottom > 0 ? Math.round((top / bottom) * 1000) / 10 : 0
}

function hoursBetween(start, end) {
  const startMs = new Date(start || 0).getTime()
  const endMs = new Date(end || 0).getTime()
  if (!start || !end || Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null
  return Math.round(((endMs - startMs) / 3_600_000) * 10) / 10
}

function daysBetweenDates(start, end) {
  const hours = hoursBetween(start, end)
  return hours === null ? null : Math.round((hours / 24) * 10) / 10
}

function average(values = []) {
  const numbers = values.map(Number).filter((value) => Number.isFinite(value))
  if (!numbers.length) return 0
  return Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 10) / 10
}

function median(values = []) {
  const numbers = values.map(Number).filter((value) => Number.isFinite(value)).sort((left, right) => left - right)
  if (!numbers.length) return 0
  const middle = Math.floor(numbers.length / 2)
  return numbers.length % 2 ? numbers[middle] : Math.round(((numbers[middle - 1] + numbers[middle]) / 2) * 10) / 10
}

function groupRows(rows = [], keyFn) {
  const map = new Map()
  rows.forEach((row) => {
    const key = normalizeText(keyFn(row)) || 'Unknown'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(row)
  })
  return map
}

function increment(map, key, amount = 1) {
  const normalized = normalizeText(key) || 'Unknown'
  map.set(normalized, (map.get(normalized) || 0) + amount)
}

function topEntries(map, limit = 8) {
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, limit)
}

function getLeadId(row = {}) {
  return readId(row, ['leadId', 'lead_id', 'id', 'buyerLeadId', 'buyer_lead_id', 'sellerLeadId', 'seller_lead_id'])
}

function getContactId(row = {}) {
  return readId(row, ['contactId', 'contact_id', 'buyerContactId', 'buyer_contact_id', 'sellerContactId', 'seller_contact_id'])
}

function getListingId(row = {}) {
  return readId(row, ['listingId', 'listing_id', 'privateListingId', 'private_listing_id', 'id'])
}

function getTransactionLeadId(row = {}) {
  return readId(row, ['originating_buyer_lead_id', 'originatingBuyerLeadId', 'lead_id', 'leadId', 'buyer_lead_id', 'buyerLeadId'])
}

function rowMatchesLead(row = {}, leadId = '') {
  return (
    getLeadId(row) === leadId ||
    getTransactionLeadId(row) === leadId ||
    readId(row, ['leadId', 'lead_id']) === leadId
  )
}

function isAcceptedOffer(row = {}) {
  return normalizeLower(row.status || row.offerStatus || row.offer_status).includes('accepted')
}

function isRegisteredTransaction(row = {}) {
  const status = normalizeLower(row.status || row.stage || row.current_stage)
  return status.includes('registered') || status.includes('registration')
}

function isViewingCompleted(row = {}) {
  const status = normalizeLower(row.status || row.viewingStatus || row.viewing_status)
  return ['completed', 'done', 'viewed', 'attended'].some((value) => status.includes(value))
}

function isViewingScheduled(row = {}) {
  const status = normalizeLower(row.status || row.viewingStatus || row.viewing_status)
  return !['cancelled', 'canceled', 'declined'].some((value) => status.includes(value))
}

function isQualifiedLead(lead = {}, requirementsByLead = new Map()) {
  const leadId = getLeadId(lead)
  const stage = normalizeLower(lead.stage || lead.status)
  return (
    (requirementsByLead.get(leadId) || []).some((requirement) => normalizeLower(requirement.status || 'active') === 'active') ||
    ['qualified', 'contacted', 'searching', 'working', 'viewing', 'offer', 'converted'].some((token) => stage.includes(token))
  )
}

function eventDateForLead(rows = [], leadId = '', dateKeys = ['createdAt', 'created_at']) {
  const dates = rows
    .filter((row) => rowMatchesLead(row, leadId))
    .map((row) => readDate(row, dateKeys))
    .filter(Boolean)
    .sort()
  return dates[0] || null
}

async function safeRead(table, select = '*', { organisationId = '', organisationColumn = 'organisation_id', order = 'created_at', limit = 3000 } = {}) {
  if (!isSupabaseConfigured || !supabase) return []
  let query = supabase.from(table).select(select)
  if (organisationId && organisationColumn) query = query.eq(organisationColumn, organisationId)
  if (order) query = query.order(order, { ascending: false })
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (!error) return Array.isArray(data) ? data : []
  const message = `${error?.code || ''} ${error?.message || ''}`.toLowerCase()
  if (message.includes('42p01') || message.includes('42703') || message.includes('pgrst205') || message.includes('does not exist') || message.includes('schema cache')) return []
  throw error
}

async function fetchLeadAnalyticsSnapshot({ organisationId = '' } = {}) {
  const crm = await listAgencyCrmLeadContacts(organisationId).catch(() => ({ leads: [], contacts: [], leadActivities: [], tasks: [] }))
  const [ingestionLogs, requirements, interests, suggestions, recommendations, communications, communicationDeliveries, appointments, offers, transactions, listings, documentPackets] = await Promise.all([
    safeRead('lead_ingestion_logs', '*', { organisationId, order: 'created_at' }),
    safeRead('lead_requirements', '*', { organisationId, order: 'updated_at' }),
    safeRead('lead_listing_interests', '*', { organisationId, order: 'updated_at' }),
    safeRead('lead_listing_suggestions', '*', { organisationId, order: 'generated_at' }),
    safeRead('lead_recommendations', '*', { organisationId, order: 'created_at' }),
    safeRead('lead_communication_events', '*', { organisationId, order: 'occurred_at' }),
    safeRead('communication_deliveries', '*', { organisationId, order: 'created_at' }),
    listAppointmentsAsync(organisationId, { includeAll: true }).catch(() => []),
    safeRead('offers', '*', { organisationId, order: 'updated_at' }),
    safeRead('transactions', '*', { organisationId, order: 'updated_at' }),
    safeRead('private_listings', '*', { organisationId, order: 'updated_at' }),
    safeRead('document_packets', '*', { organisationId, order: 'updated_at' }),
  ])

  let canonicalOffers = []
  if (!offers.length && crm.leads?.length) {
    const firstLead = crm.leads[0]
    canonicalOffers = await listCanonicalOffersForLead({
      organisationId,
      leadId: getLeadId(firstLead),
      contactId: getContactId(firstLead),
    }).catch(() => [])
  }

  return {
    leads: crm.leads || [],
    contacts: crm.contacts || [],
    leadActivities: crm.leadActivities || [],
    tasks: crm.tasks || [],
    ingestionLogs,
    requirements,
    interests,
    suggestions,
    recommendations,
    communications,
    communicationDeliveries,
    appointments,
    offers: offers.length ? offers : canonicalOffers,
    transactions,
    listings,
    documentPackets,
  }
}

function buildIndexes(data = {}) {
  const requirementsByLead = groupRows(data.requirements || [], (row) => getLeadId(row) || readId(row, ['lead_id', 'leadId']))
  const interestsByLead = groupRows(data.interests || [], (row) => getLeadId(row) || readId(row, ['lead_id', 'leadId']))
  const appointmentsByLead = groupRows(data.appointments || [], (row) => getLeadId(row) || readId(row, ['lead_id', 'leadId']))
  const offersByLead = groupRows(data.offers || [], (row) => getLeadId(row) || readId(row, ['lead_id', 'leadId', 'buyer_lead_id', 'buyerLeadId']))
  const transactionsByLead = groupRows(data.transactions || [], getTransactionLeadId)
  const communicationsByLead = groupRows(data.communications || [], (row) => getLeadId(row) || readId(row, ['lead_id', 'leadId']))
  return { requirementsByLead, interestsByLead, appointmentsByLead, offersByLead, transactionsByLead, communicationsByLead }
}

export function getLeadFunnelMetrics(data = {}) {
  const leads = data.leads || []
  const ingestionLogs = data.ingestionLogs || []
  const interests = data.interests || []
  const appointments = data.appointments || []
  const offers = data.offers || []
  const transactions = data.transactions || []
  const { requirementsByLead } = buildIndexes(data)
  const leadIds = leads.map(getLeadId).filter(Boolean)

  const qualifiedLeadIds = leadIds.filter((leadId) => isQualifiedLead(leads.find((lead) => getLeadId(lead) === leadId), requirementsByLead))
  const matchedLeadIds = interests.map((interest) => getLeadId(interest) || readId(interest, ['lead_id', 'leadId'])).filter(Boolean)
  const viewingScheduledLeadIds = [
    ...appointments.filter(isViewingScheduled).map(getLeadId),
    ...interests.filter((interest) => normalizeLower(interest.status).includes('viewing_scheduled')).map(getLeadId),
  ].filter(Boolean)
  const viewingCompletedLeadIds = [
    ...appointments.filter(isViewingCompleted).map(getLeadId),
    ...interests.filter((interest) => normalizeLower(interest.status).includes('viewed')).map(getLeadId),
  ].filter(Boolean)
  const offerLeadIds = offers.map((offer) => getLeadId(offer) || readId(offer, ['lead_id', 'leadId', 'buyer_lead_id', 'buyerLeadId'])).filter(Boolean)
  const acceptedOfferLeadIds = offers.filter(isAcceptedOffer).map((offer) => getLeadId(offer) || readId(offer, ['lead_id', 'leadId', 'buyer_lead_id', 'buyerLeadId'])).filter(Boolean)
  const transactionLeadIds = transactions.map(getTransactionLeadId).filter(Boolean)
  const registeredLeadIds = transactions.filter(isRegisteredTransaction).map(getTransactionLeadId).filter(Boolean)

  const rawStages = [
    { key: 'enquiries', label: 'Enquiries', volume: ingestionLogs.length || leads.length },
    { key: 'leads', label: 'Leads', volume: leads.length },
    { key: 'qualified', label: 'Qualified', volume: uniqueCount(qualifiedLeadIds) },
    { key: 'matched', label: 'Matched', volume: uniqueCount(matchedLeadIds) },
    { key: 'viewing_scheduled', label: 'Viewing Scheduled', volume: uniqueCount(viewingScheduledLeadIds) },
    { key: 'viewing_completed', label: 'Viewing Completed', volume: uniqueCount(viewingCompletedLeadIds) },
    { key: 'offer_submitted', label: 'Offer Submitted', volume: uniqueCount(offerLeadIds) || offers.length },
    { key: 'offer_accepted', label: 'Offer Accepted', volume: uniqueCount(acceptedOfferLeadIds) || offers.filter(isAcceptedOffer).length },
    { key: 'transaction_created', label: 'Transaction Created', volume: uniqueCount(transactionLeadIds) || transactions.length },
    { key: 'registered', label: 'Registered', volume: uniqueCount(registeredLeadIds) || transactions.filter(isRegisteredTransaction).length },
  ]

  return rawStages.map((stage, index) => {
    const previous = index === 0 ? stage.volume : rawStages[index - 1].volume
    const first = rawStages[0]?.volume || 0
    const leadTimes = leadIds.map((leadId) => {
      const lead = leads.find((row) => getLeadId(row) === leadId) || {}
      const createdAt = readDate(lead, ['createdAt', 'created_at'])
      const stageDate = stage.key === 'matched'
        ? eventDateForLead(interests, leadId, ['createdAt', 'created_at'])
        : stage.key.startsWith('viewing')
          ? eventDateForLead(appointments, leadId, ['startTime', 'start_time', 'date', 'createdAt', 'created_at'])
          : stage.key.startsWith('offer')
            ? eventDateForLead(offers, leadId, ['submittedAt', 'submitted_at', 'createdAt', 'created_at'])
            : stage.key.startsWith('transaction') || stage.key === 'registered'
              ? eventDateForLead(transactions, leadId, ['createdAt', 'created_at'])
              : createdAt
      return hoursBetween(createdAt, stageDate)
    }).filter((value) => value !== null)
    return {
      ...stage,
      conversionPercent: index === 0 ? 100 : percent(stage.volume, previous),
      overallConversionPercent: percent(stage.volume, first),
      dropOffPercent: index === 0 ? 0 : Math.max(0, 100 - percent(stage.volume, previous)),
      averageTimeInStageHours: average(leadTimes),
    }
  })
}

export function getLeadSourceMetrics(data = {}) {
  const sources = new Map()
  const ensure = (source) => {
    const key = normalizeSource(source)
    if (!sources.has(key)) sources.set(key, { source: key, enquiries: 0, leads: 0, qualified: 0, viewings: 0, offers: 0, transactions: 0, registrations: 0 })
    return sources.get(key)
  }
  SOURCE_VALUES.forEach(ensure)

  const { requirementsByLead, appointmentsByLead, offersByLead, transactionsByLead } = buildIndexes(data)
  ;(data.ingestionLogs || []).forEach((log) => { ensure(log.source).enquiries += 1 })
  ;(data.leads || []).forEach((lead) => {
    const leadId = getLeadId(lead)
    const row = ensure(lead.leadSource || lead.lead_source || lead.source)
    row.leads += 1
    if (isQualifiedLead(lead, requirementsByLead)) row.qualified += 1
    row.viewings += (appointmentsByLead.get(leadId) || []).length
    row.offers += (offersByLead.get(leadId) || []).length
    const transactions = transactionsByLead.get(leadId) || []
    row.transactions += transactions.length
    row.registrations += transactions.filter(isRegisteredTransaction).length
  })

  return [...sources.values()]
    .filter((row) => row.enquiries || row.leads || row.viewings || row.offers || row.transactions)
    .map((row) => ({ ...row, leadConversionPercent: percent(row.leads, row.enquiries || row.leads), transactionConversionPercent: percent(row.transactions, row.leads) }))
    .sort((left, right) => right.leads - left.leads || right.enquiries - left.enquiries)
}

export function getLeadConversionMetrics(data = {}) {
  const funnel = getLeadFunnelMetrics(data)
  const first = funnel[0]?.volume || 0
  const transactions = funnel.find((stage) => stage.key === 'transaction_created')?.volume || 0
  const registered = funnel.find((stage) => stage.key === 'registered')?.volume || 0
  return {
    enquiryToLeadPercent: funnel[1] ? funnel[1].conversionPercent : 0,
    leadToViewingPercent: percent(funnel.find((stage) => stage.key === 'viewing_scheduled')?.volume || 0, funnel.find((stage) => stage.key === 'leads')?.volume || 0),
    leadToOfferPercent: percent(funnel.find((stage) => stage.key === 'offer_submitted')?.volume || 0, funnel.find((stage) => stage.key === 'leads')?.volume || 0),
    leadToTransactionPercent: percent(transactions, funnel.find((stage) => stage.key === 'leads')?.volume || 0),
    enquiryToRegistrationPercent: percent(registered, first),
    transactions,
    registered,
  }
}

export function getResponseTimeMetrics(data = {}) {
  const leads = data.leads || []
  const responseHours = leads
    .map((lead) => hoursBetween(lead.assignedAt || lead.assigned_at, lead.firstContactedAt || lead.first_contacted_at))
    .filter((value) => value !== null)
  const now = Date.now()
  return {
    averageResponseHours: average(responseHours),
    medianResponseHours: median(responseHours),
    overdueLeads: leads.filter((lead) => {
      const dueMs = new Date(lead.slaDueAt || lead.sla_due_at || 0).getTime()
      return !lead.firstContactedAt && !lead.first_contacted_at && dueMs && !Number.isNaN(dueMs) && dueMs < now
    }).length,
    uncontactedLeads: leads.filter((lead) => !(lead.firstContactedAt || lead.first_contacted_at)).length,
    escalatedLeads: leads.filter((lead) => normalizeLower(lead.ownershipStatus || lead.ownership_status) === 'escalated').length,
    respondedLeads: responseHours.length,
  }
}

export function getAgentLeadMetrics(data = {}) {
  const { appointmentsByLead, offersByLead, transactionsByLead, communicationsByLead } = buildIndexes(data)
  const agents = new Map()
  const ensure = (agentId, fallback = 'Unassigned') => {
    const key = normalizeText(agentId) || 'unassigned'
    if (!agents.has(key)) agents.set(key, { agentId: key, agentName: fallback || key, leadsAssigned: 0, leadsContacted: 0, responseHours: [], viewingsBooked: 0, offersSubmitted: 0, transactionsCreated: 0, communications: 0 })
    return agents.get(key)
  }
  ;(data.leads || []).forEach((lead) => {
    const leadId = getLeadId(lead)
    const agentId = readId(lead, ['assignedAgentId', 'assigned_agent_id', 'assignedUserId', 'assigned_user_id'])
    const row = ensure(agentId, normalizeText(lead.assignedAgentName || lead.assigned_agent_name || lead.assignedAgentEmail || lead.assigned_agent_email || 'Unassigned'))
    row.leadsAssigned += 1
    if (lead.firstContactedAt || lead.first_contacted_at || (communicationsByLead.get(leadId) || []).length) row.leadsContacted += 1
    const response = hoursBetween(lead.assignedAt || lead.assigned_at, lead.firstContactedAt || lead.first_contacted_at)
    if (response !== null) row.responseHours.push(response)
    row.viewingsBooked += (appointmentsByLead.get(leadId) || []).length
    row.offersSubmitted += (offersByLead.get(leadId) || []).length
    row.transactionsCreated += (transactionsByLead.get(leadId) || []).length
    row.communications += (communicationsByLead.get(leadId) || []).length
  })
  return [...agents.values()].map((row) => ({
    ...row,
    averageResponseHours: average(row.responseHours),
    conversionPercent: percent(row.transactionsCreated, row.leadsAssigned),
  })).sort((left, right) => right.transactionsCreated - left.transactionsCreated || right.leadsAssigned - left.leadsAssigned)
}

export function getListingLeadMetrics(data = {}) {
  const offersByListing = groupRows(data.offers || [], getListingId)
  const appointmentsByListing = groupRows(data.appointments || [], getListingId)
  const transactionsByListing = groupRows(data.transactions || [], getListingId)
  const interestsByListing = groupRows(data.interests || [], (row) => readId(row, ['listingId', 'listing_id']))
  const listingIds = new Set([
    ...(data.listings || []).map(getListingId),
    ...(data.interests || []).map((row) => readId(row, ['listingId', 'listing_id'])),
  ].filter(Boolean))

  return [...listingIds].map((listingId) => {
    const listing = (data.listings || []).find((row) => getListingId(row) === listingId) || {}
    const interests = interestsByListing.get(listingId) || []
    const appointments = appointmentsByListing.get(listingId) || []
    const offers = offersByListing.get(listingId) || []
    const transactions = transactionsByListing.get(listingId) || []
    return {
      listingId,
      title: normalizeText(listing.title || listing.listingTitle || listing.property_address || listing.propertyAddress || listing.suburb) || 'Untitled listing',
      enquiries: interests.filter((interest) => interest.isOriginalEnquiry || interest.is_original_enquiry).length,
      matches: interests.length,
      viewings: appointments.length || interests.filter((interest) => ['viewed', 'viewing_scheduled'].includes(normalizeLower(interest.status))).length,
      offers: offers.length,
      transactions: transactions.length,
      conversionPercent: percent(transactions.length, interests.length),
    }
  }).sort((left, right) => right.matches - left.matches || right.viewings - left.viewings)
}

export function getRequirementGapMetrics(data = {}) {
  const suburbs = new Map()
  const areas = new Map()
  const propertyTypes = new Map()
  const features = new Map()
  const bedrooms = new Map()
  const budgetBands = new Map()
  ;(data.requirements || []).forEach((requirement) => {
    ;(Array.isArray(requirement.suburbs) ? requirement.suburbs : []).forEach((value) => increment(suburbs, value))
    ;(Array.isArray(requirement.areas) ? requirement.areas : []).forEach((value) => increment(areas, value))
    ;(Array.isArray(requirement.propertyTypes || requirement.property_types) ? (requirement.propertyTypes || requirement.property_types) : []).forEach((value) => increment(propertyTypes, value))
    ;(Array.isArray(requirement.mustHaves || requirement.must_haves) ? (requirement.mustHaves || requirement.must_haves) : []).forEach((value) => increment(features, value))
    const bedroomValue = toNumber(requirement.bedroomsMin ?? requirement.bedrooms_min)
    if (bedroomValue) increment(bedrooms, `${bedroomValue}+ bed`)
    const max = toNumber(requirement.budgetMax ?? requirement.budget_max)
    const band = max <= 0 ? 'Budget unknown' : max <= 1_000_000 ? 'Up to R1m' : max <= 2_000_000 ? 'R1m-R2m' : max <= 3_000_000 ? 'R2m-R3m' : 'R3m+'
    increment(budgetBands, band)
  })
  return {
    totalRequirements: (data.requirements || []).length,
    leadsWithoutRequirements: (data.leads || []).filter((lead) => !(data.requirements || []).some((requirement) => getLeadId(requirement) === getLeadId(lead) || readId(requirement, ['lead_id', 'leadId']) === getLeadId(lead))).length,
    topSuburbs: topEntries(suburbs),
    topAreas: topEntries(areas),
    topPropertyTypes: topEntries(propertyTypes),
    topFeatures: topEntries(features),
    bedroomDemand: topEntries(bedrooms),
    budgetBands: topEntries(budgetBands),
  }
}

export function getCommunicationMetrics(data = {}) {
  const counts = { call: 0, email: 0, whatsapp: 0, sms: 0, meeting: 0, note: 0, system: 0 }
  ;(data.communications || []).forEach((event) => {
    const type = normalizeLower(event.communicationType || event.communication_type)
    if (Object.prototype.hasOwnProperty.call(counts, type)) counts[type] += 1
  })
  const { interestsByLead, appointmentsByLead, offersByLead, transactionsByLead, communicationsByLead } = buildIndexes(data)
  const averageBefore = (targetMap) => {
    const countsBeforeTarget = (data.leads || [])
      .map((lead) => {
        const leadId = getLeadId(lead)
        return (targetMap.get(leadId) || []).length ? (communicationsByLead.get(leadId) || []).length : null
      })
      .filter((value) => value !== null)
    return average(countsBeforeTarget)
  }
  return {
    ...counts,
    total: (data.communications || []).length,
    averageCallsBeforeViewing: averageBefore(appointmentsByLead),
    averageCallsBeforeOffer: averageBefore(offersByLead),
    averageTouchpointsBeforeTransaction: averageBefore(transactionsByLead),
    matchesCreated: (data.interests || []).length,
    matchesViewed: (data.interests || []).filter((interest) => normalizeLower(interest.status) === 'viewed').length,
    matchesDismissed: (data.interests || []).filter((interest) => normalizeLower(interest.status) === 'dismissed').length,
    viewingsGenerated: [...interestsByLead.values()].filter((rows) => rows.some((interest) => normalizeLower(interest.status).includes('viewing'))).length,
  }
}

function isPropertyShareEvent(event = {}) {
  const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {}
  return metadata.shareType === 'property_share' || normalizeLower(event.source) === 'property_share'
}

export function getPropertyShareMetrics(data = {}) {
  const shares = (data.communications || []).filter(isPropertyShareEvent)
  const listingCount = (event) => {
    const listingIds = event.metadata?.listingIds || event.metadata?.listing_ids || []
    return Array.isArray(listingIds) && listingIds.length ? listingIds.length : 1
  }
  return {
    sentVolume: shares.length,
    propertiesSent: shares.reduce((sum, event) => sum + listingCount(event), 0),
    emailsSent: shares.filter((event) => normalizeLower(event.communicationType || event.communication_type) === 'email').length,
    whatsAppsSent: shares.filter((event) => normalizeLower(event.communicationType || event.communication_type) === 'whatsapp').length,
    pendingSends: shares.filter((event) => normalizeLower(event.status) === 'pending').length,
    sentSends: shares.filter((event) => normalizeLower(event.status) === 'sent').length,
  }
}

export function getSuggestionMetrics(data = {}) {
  const suggestions = data.suggestions || []
  const accepted = suggestions.filter((suggestion) => normalizeLower(suggestion.status) === 'accepted')
  const rejected = suggestions.filter((suggestion) => normalizeLower(suggestion.status) === 'rejected')
  const expired = suggestions.filter((suggestion) => normalizeLower(suggestion.status) === 'expired')
  const suggestionLeadListingPairs = new Set(suggestions.map((suggestion) => `${readId(suggestion, ['leadId', 'lead_id'])}:${readId(suggestion, ['listingId', 'listing_id'])}`))
  const suggestionInterests = (data.interests || []).filter((interest) => {
    const source = normalizeLower(interest.source)
    const pair = `${readId(interest, ['leadId', 'lead_id'])}:${readId(interest, ['listingId', 'listing_id'])}`
    return source === 'automated_suggestion' || suggestionLeadListingPairs.has(pair)
  })
  const suggestionInterestPairs = new Set(suggestionInterests.map((interest) => `${readId(interest, ['leadId', 'lead_id'])}:${readId(interest, ['listingId', 'listing_id'])}`))
  const viewings = (data.appointments || []).filter((appointment) => suggestionInterestPairs.has(`${readId(appointment, ['leadId', 'lead_id'])}:${readId(appointment, ['listingId', 'listing_id'])}`))
  const offers = (data.offers || []).filter((offer) => suggestionInterestPairs.has(`${readId(offer, ['leadId', 'lead_id', 'buyer_lead_id', 'buyerLeadId'])}:${readId(offer, ['listingId', 'listing_id'])}`))
  const transactions = (data.transactions || []).filter((transaction) => suggestionInterestPairs.has(`${getTransactionLeadId(transaction)}:${readId(transaction, ['listingId', 'listing_id'])}`))
  return {
    generated: suggestions.length,
    accepted: accepted.length,
    rejected: rejected.length,
    expired: expired.length,
    pending: suggestions.filter((suggestion) => normalizeLower(suggestion.status) === 'pending').length,
    acceptanceRate: percent(accepted.length, suggestions.length),
    rejectionRate: percent(rejected.length, suggestions.length),
    suggestionToViewingRate: percent(viewings.length, suggestions.length),
    suggestionToOfferRate: percent(offers.length, suggestions.length),
    suggestionToTransactionRate: percent(transactions.length, suggestions.length),
    viewings: viewings.length,
    offers: offers.length,
    transactions: transactions.length,
  }
}

export function getLeadPipelineMetrics(data = {}) {
  const response = getResponseTimeMetrics(data)
  const now = Date.now()
  const latestByLead = new Map()
  ;[...(data.leadActivities || []), ...(data.communications || [])].forEach((event) => {
    const leadId = getLeadId(event) || readId(event, ['lead_id', 'leadId'])
    const date = readDate(event, ['occurredAt', 'occurred_at', 'activityDate', 'activity_date', 'createdAt', 'created_at'])
    if (!leadId || !date) return
    if (!latestByLead.has(leadId) || new Date(date).getTime() > new Date(latestByLead.get(leadId)).getTime()) latestByLead.set(leadId, date)
  })
  const leads = data.leads || []
  const newLeads = leads.filter((lead) => normalizeLower(lead.status || lead.stage).includes('new')).length || leads.filter((lead) => {
    const createdMs = new Date(lead.createdAt || lead.created_at || 0).getTime()
    return createdMs && now - createdMs <= 7 * 24 * 60 * 60 * 1000
  }).length
  return {
    newLeads,
    assignedLeads: leads.filter((lead) => readId(lead, ['assignedAgentId', 'assigned_agent_id', 'assignedUserId', 'assigned_user_id'])).length,
    unassignedLeads: leads.filter((lead) => !readId(lead, ['assignedAgentId', 'assigned_agent_id', 'assignedUserId', 'assigned_user_id'])).length,
    overdueLeads: response.overdueLeads,
    escalatedLeads: response.escalatedLeads,
    hotLeads: leads.filter((lead) => {
      const leadId = getLeadId(lead)
      return (data.interests || []).some((interest) => getLeadId(interest) === leadId && ['viewing_scheduled', 'offer_submitted', 'sent', 'viewed'].includes(normalizeLower(interest.status)))
    }).length,
    noActivity7Days: leads.filter((lead) => {
      const leadId = getLeadId(lead)
      const latest = latestByLead.get(leadId) || readDate(lead, ['createdAt', 'created_at'])
      return latest && now - new Date(latest).getTime() > 7 * 24 * 60 * 60 * 1000
    }).length,
    noActivity30Days: leads.filter((lead) => {
      const leadId = getLeadId(lead)
      const latest = latestByLead.get(leadId) || readDate(lead, ['createdAt', 'created_at'])
      return latest && now - new Date(latest).getTime() > 30 * 24 * 60 * 60 * 1000
    }).length,
  }
}

export function getLeadCategoryMetrics(data = {}) {
  const counts = { combined: 0, buyer: 0, seller: 0, other: 0 }
  for (const lead of data.leads || []) {
    const category = inferLeadCategoryFromRecord(lead, 'other')
    counts.combined += 1
    counts[category] = (counts[category] || 0) + 1
  }
  return counts
}

function getSellerLinkedLeadIds(row = {}) {
  return [
    row?.sellerLeadId,
    row?.seller_lead_id,
    row?.originatingCrmLeadId,
    row?.originating_crm_lead_id,
    row?.leadId,
    row?.lead_id,
    row?.relatedEntityId,
    row?.related_entity_id,
    row?.crmLeadId,
    row?.crm_lead_id,
  ].map(normalizeText).filter(Boolean)
}

function getSellerLeadIdFromPacket(packet = {}) {
  const context = packet?.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : packet?.sourceContextJson && typeof packet.sourceContextJson === 'object'
      ? packet.sourceContextJson
      : {}
  return readId(packet, ['sellerLeadId', 'seller_lead_id', 'leadId', 'lead_id', 'crmLeadId', 'crm_lead_id', 'relatedEntityId', 'related_entity_id']) ||
    readId(context, ['sellerLeadId', 'seller_lead_id', 'leadId', 'lead_id', 'crmLeadId', 'crm_lead_id'])
}

function getSellerListingForLead(lead = {}, listings = []) {
  const leadId = getLeadId(lead)
  const leadListingId = readId(lead, ['listingId', 'listing_id', 'privateListingId', 'private_listing_id'])
  return (Array.isArray(listings) ? listings : []).find((listing) => {
    const listingId = getListingId(listing)
    if (leadListingId && listingId && leadListingId === listingId) return true
    return Boolean(leadId && getSellerLinkedLeadIds(listing).includes(leadId))
  }) || null
}

function getMandatePacketForLead(lead = {}, packets = []) {
  const leadId = getLeadId(lead)
  const packetId = readId(lead, ['mandatePacketId', 'mandate_packet_id'])
  return (Array.isArray(packets) ? packets : []).find((packet) => {
    const id = readId(packet, ['id', 'packetId', 'packet_id'])
    return (packetId && id && packetId === id) || (leadId && getSellerLeadIdFromPacket(packet) === leadId)
  }) || null
}

function dateFromRows(row = {}, keys = []) {
  return readDate(row || {}, keys)
}

function sourceContext(packet = {}) {
  return packet?.source_context_json && typeof packet.source_context_json === 'object'
    ? packet.source_context_json
    : packet?.sourceContextJson && typeof packet.sourceContextJson === 'object'
      ? packet.sourceContextJson
      : {}
}

function firstDate(...dates) {
  return dates.find(Boolean) || null
}

function getSellerJourneyAnalyticsRows(data = {}) {
  return (data.leads || []).filter(isSellerLead).map((lead) => {
    const leadId = getLeadId(lead)
    const listing = getSellerListingForLead(lead, data.listings || [])
    const packet = getMandatePacketForLead(lead, data.documentPackets || [])
    const mandatePacketStatus = packet ? { packet, state: packet.status || packet.packetStatus || packet.packet_status } : null
    const journey = buildSellerJourney({ lead, listing, mandatePacketStatus, mandatePacket: packet })
    const readiness = getSellerReadiness({ lead, listing, mandatePacketStatus, mandatePacket: packet, journey })
    const context = sourceContext(packet || {})
    const leadCreatedAt = dateFromRows(lead, ['createdAt', 'created_at'])
    const mandateSentAt = ['sent', 'signed'].includes(journey.mandateStatus)
      ? firstDate(
        dateFromRows(packet, ['sentAt', 'sent_at', 'createdAt', 'created_at']),
        dateFromRows(context, ['mandateSentAt', 'mandate_sent_at']),
        dateFromRows(lead, ['updatedAt', 'updated_at']),
      )
      : null
    const mandateSignedAt = journey.mandateStatus === 'signed'
      ? firstDate(
        dateFromRows(packet, ['signedAt', 'signed_at', 'updatedAt', 'updated_at']),
        dateFromRows(context, ['mandateSignedAt', 'mandate_signed_at']),
      )
      : null
    const listingCreatedAt = journey.listingCreated
      ? firstDate(
        dateFromRows(listing, ['createdAt', 'created_at']),
        dateFromRows(lead, ['listingCreatedAt', 'listing_created_at', 'updatedAt', 'updated_at']),
      )
      : null
    const listingLiveAt = journey.listingLive
      ? firstDate(
        dateFromRows(listing, ['activatedAt', 'activated_at', 'publishedAt', 'published_at', 'liveAt', 'live_at', 'updatedAt', 'updated_at']),
        listingCreatedAt,
      )
      : null
    return {
      lead,
      leadId,
      journey,
      readiness,
      source: normalizeSource(lead.leadSource || lead.lead_source || lead.source),
      agentId: readId(lead, ['assignedAgentId', 'assigned_agent_id', 'assignedUserId', 'assigned_user_id']) || 'unassigned',
      agentName: normalizeText(lead.assignedAgentName || lead.assigned_agent_name || lead.assignedAgentEmail || lead.assigned_agent_email || 'Unassigned'),
      branchId: readId(lead, ['branchId', 'branch_id', 'officeId', 'office_id', 'organisationBranchId', 'organisation_branch_id']) || 'unassigned',
      branchName: normalizeText(lead.branchName || lead.branch_name || lead.officeName || lead.office_name || 'Unassigned'),
      dates: {
        seller_leads: leadCreatedAt,
        contacted: firstDate(dateFromRows(lead, ['firstContactedAt', 'first_contacted_at']), leadCreatedAt),
        mandates_sent: mandateSentAt,
        mandates_signed: mandateSignedAt,
        listings_created: listingCreatedAt,
        listings_live: listingLiveAt,
      },
    }
  })
}

const SELLER_FUNNEL_STAGES = [
  { key: 'seller_leads', label: 'Seller Leads', test: () => true },
  { key: 'contacted', label: 'Contacted', test: () => true },
  { key: 'mandates_sent', label: 'Mandates Sent', test: (row) => ['sent', 'signed'].includes(row.journey.mandateStatus) },
  { key: 'mandates_signed', label: 'Mandates Signed', test: (row) => row.journey.mandateStatus === 'signed' },
  { key: 'listings_created', label: 'Listings Created', test: (row) => row.journey.listingCreated },
  { key: 'listings_live', label: 'Listings Live', test: (row) => row.journey.listingLive },
]

const SELLER_FUNNEL_ACTIVE_STAGE_KEYS = {
  seller_leads: 'contacted',
  contacted: 'contacted',
  mandates_sent: 'mandate_sent',
  mandates_signed: 'mandate_signed',
  listings_created: 'listing_created',
  listings_live: 'listing_live',
}

export function getSellerFunnelMetrics(data = {}) {
  const rows = getSellerJourneyAnalyticsRows(data)
  const currentByStage = rows.reduce((map, row) => {
    increment(map, row.journey.stage?.key || 'contacted')
    return map
  }, new Map())
  return SELLER_FUNNEL_STAGES.map((stage, index) => {
    const matchingRows = rows.filter(stage.test)
    const previousStage = index === 0 ? stage : SELLER_FUNNEL_STAGES[index - 1]
    const previousRows = index === 0 ? matchingRows : rows.filter(previousStage.test)
    const firstCount = rows.length
    const leadStageDays = matchingRows
      .map((row) => daysBetweenDates(row.dates.seller_leads, row.dates[stage.key]))
      .filter((value) => value !== null)
    const previousStageDays = matchingRows
      .map((row) => daysBetweenDates(row.dates[previousStage.key], row.dates[stage.key]))
      .filter((value) => value !== null)
    const volume = matchingRows.length
    return {
      key: stage.key,
      label: stage.label,
      count: volume,
      volume,
      activeCount: currentByStage.get(SELLER_FUNNEL_ACTIVE_STAGE_KEYS[stage.key] || stage.key) || 0,
      conversionPercent: index === 0 ? 100 : percent(volume, previousRows.length),
      overallConversionPercent: percent(volume, firstCount),
      dropOffPercent: index === 0 ? 0 : Math.max(0, 100 - percent(volume, previousRows.length)),
      averageDaysFromPrevious: average(previousStageDays),
      averageDaysFromLead: average(leadStageDays),
      averageTimeInStageHours: average(previousStageDays) * 24,
    }
  })
}

function buildSellerPerformanceRows(rows = [], keyFn, labelKeys = {}) {
  const groups = groupRows(rows, keyFn)
  return [...groups.entries()].map(([key, groupedRows]) => {
    const first = groupedRows[0] || {}
    const listingsLiveRows = groupedRows.filter((row) => row.journey.listingLive)
    const averageDaysToListingLive = average(listingsLiveRows
      .map((row) => daysBetweenDates(row.dates.seller_leads, row.dates.listings_live))
      .filter((value) => value !== null))
    return {
      id: key,
      source: labelKeys.source ? key : undefined,
      agentId: labelKeys.agent ? key : undefined,
      agentName: labelKeys.agent ? first.agentName : undefined,
      branchId: labelKeys.branch ? key : undefined,
      branchName: labelKeys.branch ? first.branchName : undefined,
      sellerLeads: groupedRows.length,
      mandatesSent: groupedRows.filter((row) => ['sent', 'signed'].includes(row.journey.mandateStatus)).length,
      mandatesSigned: groupedRows.filter((row) => row.journey.mandateStatus === 'signed').length,
      listingsCreated: groupedRows.filter((row) => row.journey.listingCreated).length,
      listingsLive: listingsLiveRows.length,
      mandateConversionPercent: percent(groupedRows.filter((row) => row.journey.mandateStatus === 'signed').length, groupedRows.length),
      listingLiveConversionPercent: percent(listingsLiveRows.length, groupedRows.length),
      averageDaysToListingLive,
    }
  }).sort((left, right) => right.sellerLeads - left.sellerLeads || right.listingsLive - left.listingsLive)
}

export function getSellerSourceMetrics(data = {}) {
  return buildSellerPerformanceRows(getSellerJourneyAnalyticsRows(data), (row) => row.source, { source: true })
}

export function getSellerAgentMetrics(data = {}) {
  return buildSellerPerformanceRows(getSellerJourneyAnalyticsRows(data), (row) => row.agentId || 'unassigned', { agent: true })
}

export function getSellerBranchMetrics(data = {}) {
  return buildSellerPerformanceRows(getSellerJourneyAnalyticsRows(data), (row) => row.branchId || 'unassigned', { branch: true })
}

export function getSellerAnalyticsMetrics(data = {}) {
  const rows = getSellerJourneyAnalyticsRows(data)
  const funnel = getSellerFunnelMetrics(data)
  const liveRows = rows.filter((row) => row.journey.listingLive)
  const signedMandateRows = rows.filter((row) => row.journey.mandateStatus === 'signed')
  const listingCreatedRows = rows.filter((row) => row.journey.listingCreated)
  const readinessDistribution = rows.reduce((map, row) => {
    const status = row.readiness?.readinessStatus || 'ready'
    map[status] = (map[status] || 0) + 1
    return map
  }, { ready: 0, action_required: 0, blocked: 0, completed: 0 })
  const blockerCounts = new Map()
  rows.forEach((row) => {
    ;(row.readiness?.blockers || []).forEach((blocker) => increment(blockerCounts, blocker.label))
  })
  const activeSellersByStage = rows.reduce((map, row) => {
    const stage = row.journey.stage?.label || 'Contacted'
    map[stage] = (map[stage] || 0) + 1
    return map
  }, {})
  return {
    overview: {
      sellerLeads: rows.length,
      mandatesSent: rows.filter((row) => ['sent', 'signed'].includes(row.journey.mandateStatus)).length,
      mandatesSigned: rows.filter((row) => row.journey.mandateStatus === 'signed').length,
      listingsCreated: rows.filter((row) => row.journey.listingCreated).length,
      listingsLive: liveRows.length,
      readyForListing: rows.filter((row) => row.readiness?.nextAction?.id === 'create_listing' && row.readiness?.readinessStatus === 'ready').length,
      blockedListings: rows.filter((row) => row.journey.listingCreated && row.readiness?.readinessStatus === 'blocked').length,
      mandatesAwaitingSignature: rows.filter((row) => row.journey.mandateStatus === 'sent').length,
      listingsAwaitingActivation: rows.filter((row) => row.journey.listingCreated && !row.journey.listingLive).length,
      mandateConversionRate: percent(rows.filter((row) => row.journey.mandateStatus === 'signed').length, rows.length),
      listingLiveConversionRate: percent(liveRows.length, rows.length),
      averageDaysToMandate: average(signedMandateRows
        .map((row) => daysBetweenDates(row.dates.seller_leads, row.dates.mandates_signed))
        .filter((value) => value !== null)),
      averageDaysToListing: average(listingCreatedRows
        .map((row) => daysBetweenDates(row.dates.seller_leads, row.dates.listings_created))
        .filter((value) => value !== null)),
      averageDaysToListingLive: average(liveRows
        .map((row) => daysBetweenDates(row.dates.seller_leads, row.dates.listings_live))
        .filter((value) => value !== null)),
      activeSellersByStage,
      readinessDistribution,
    },
    funnel,
    sources: getSellerSourceMetrics(data),
    agents: getSellerAgentMetrics(data),
    branches: getSellerBranchMetrics(data),
    readiness: {
      distribution: readinessDistribution,
      commonBlockers: topEntries(blockerCounts, 8),
    },
  }
}

export function buildLeadAnalyticsModel(data = {}) {
  const categoryMetrics = getLeadCategoryMetrics(data)
  const seller = getSellerAnalyticsMetrics(data)
  return {
    generatedAt: new Date().toISOString(),
    overview: {
      totalLeads: (data.leads || []).length,
      buyerLeads: categoryMetrics.buyer,
      sellerLeads: categoryMetrics.seller,
      otherLeads: categoryMetrics.other,
      totalEnquiries: (data.ingestionLogs || []).length,
      totalRequirements: (data.requirements || []).length,
      totalMatches: (data.interests || []).length,
      totalSuggestions: (data.suggestions || []).length,
      totalRecommendations: (data.recommendations || []).length,
      totalPropertyShares: getPropertyShareMetrics(data).sentVolume,
      totalViewings: (data.appointments || []).length,
      totalOffers: (data.offers || []).length,
      totalTransactions: (data.transactions || []).length,
      sellerListingsLive: seller.overview.listingsLive,
    },
    categories: categoryMetrics,
    funnel: getLeadFunnelMetrics(data),
    sources: getLeadSourceMetrics(data),
    conversion: getLeadConversionMetrics(data),
    agents: getAgentLeadMetrics(data),
    listings: getListingLeadMetrics(data),
    response: getResponseTimeMetrics(data),
    requirements: getRequirementGapMetrics(data),
    communication: getCommunicationMetrics(data),
    communicationPerformance: getCommunicationPerformanceMetrics(data.communicationDeliveries || []),
    communicationInfrastructure: getCommunicationProviderHealth({ deliveries: data.communicationDeliveries || [] }),
    propertyShares: getPropertyShareMetrics(data),
    suggestions: getSuggestionMetrics(data),
    recommendations: getRecommendationMetrics(data.recommendations || []),
    pipeline: getLeadPipelineMetrics(data),
    seller,
  }
}

export async function getLeadAnalyticsDashboard({ organisationId = '' } = {}) {
  const snapshot = await fetchLeadAnalyticsSnapshot({ organisationId })
  return buildLeadAnalyticsModel(snapshot)
}

export async function getLeadFunnelMetricsAsync({ organisationId = '' } = {}) {
  return getLeadFunnelMetrics(await fetchLeadAnalyticsSnapshot({ organisationId }))
}

export async function getLeadSourceMetricsAsync({ organisationId = '' } = {}) {
  return getLeadSourceMetrics(await fetchLeadAnalyticsSnapshot({ organisationId }))
}

export async function getLeadConversionMetricsAsync({ organisationId = '' } = {}) {
  return getLeadConversionMetrics(await fetchLeadAnalyticsSnapshot({ organisationId }))
}

export async function getAgentLeadMetricsAsync({ organisationId = '' } = {}) {
  return getAgentLeadMetrics(await fetchLeadAnalyticsSnapshot({ organisationId }))
}

export async function getListingLeadMetricsAsync({ organisationId = '' } = {}) {
  return getListingLeadMetrics(await fetchLeadAnalyticsSnapshot({ organisationId }))
}

export async function getResponseTimeMetricsAsync({ organisationId = '' } = {}) {
  return getResponseTimeMetrics(await fetchLeadAnalyticsSnapshot({ organisationId }))
}

export async function getRequirementGapMetricsAsync({ organisationId = '' } = {}) {
  return getRequirementGapMetrics(await fetchLeadAnalyticsSnapshot({ organisationId }))
}

export async function getLeadPipelineMetricsAsync({ organisationId = '' } = {}) {
  return getLeadPipelineMetrics(await fetchLeadAnalyticsSnapshot({ organisationId }))
}

export async function getLeadCategoryMetricsAsync({ organisationId = '' } = {}) {
  return getLeadCategoryMetrics(await fetchLeadAnalyticsSnapshot({ organisationId }))
}

export function buildLeadWorkspaceAnalyticsSummary(lead = {}) {
  const communications = Array.isArray(lead.communications) ? lead.communications : []
  const timeline = Array.isArray(lead.communicationTimeline) ? lead.communicationTimeline : []
  const touchpoints = communications.length || timeline.filter((item) => ['communication', 'activity'].includes(item.kind)).length
  return {
    responseTimeHours: lead.responseTimeHours,
    responseTimeLabel: lead.responseTimeHours !== null && lead.responseTimeHours !== undefined ? `${lead.responseTimeHours}h` : 'Pending',
    touchpoints,
    matches: Array.isArray(lead.listingInterests) ? lead.listingInterests.length : toNumber(lead.listingCount),
    viewings: Array.isArray(lead.appointments) ? lead.appointments.length : toNumber(lead.appointmentCount),
    offers: Array.isArray(lead.offers) ? lead.offers.length : toNumber(lead.offerCount),
    sentProperties: Array.isArray(lead.propertyShares) ? lead.propertyShares.length : 0,
  }
}

export function buildListingWorkspaceAnalyticsSummary({ interests = [], viewings = [], offers = [], transactions = [], propertyShares = [], communicationDeliveries = [] } = {}) {
  const deliveryStats = getListingDeliveryStatistics(communicationDeliveries)
  return {
    totalEnquiries: interests.filter((interest) => interest.isOriginalEnquiry || interest.is_original_enquiry).length,
    matchedLeads: interests.length,
    viewings: viewings.length || interests.filter((interest) => ['viewed', 'viewing_scheduled'].includes(normalizeLower(interest.status))).length,
    offers: offers.length,
    transactions: transactions.length,
    sentToLeads: propertyShares.length,
    deliveryTimesShared: deliveryStats.timesShared,
    deliveryUniqueBuyers: deliveryStats.uniqueBuyers,
    deliverySent: deliveryStats.sent,
    deliveryDelivered: deliveryStats.delivered,
    deliveryFailed: deliveryStats.failed,
  }
}

function escapeCsv(value) {
  const text = normalizeText(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function rowsToCsv(rows = []) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  return [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(',')),
  ].join('\n')
}

export function buildLeadAnalyticsCsvExport(type = 'funnel', analytics = {}) {
  const normalizedType = normalizeLower(type)
  const rows = normalizedType === 'sources'
    ? analytics.sources || []
    : normalizedType === 'agents'
      ? analytics.agents || []
      : normalizedType === 'listings'
        ? analytics.listings || []
        : normalizedType === 'suggestions'
          ? Object.entries(analytics.suggestions || {}).map(([metric, value]) => ({ metric, value }))
          : normalizedType === 'recommendations'
            ? Object.entries(analytics.recommendations || {}).map(([metric, value]) => ({ metric, value }))
            : normalizedType === 'communication_deliveries'
              ? Object.entries(analytics.communicationPerformance || {}).filter(([, value]) => !Array.isArray(value) && typeof value !== 'object').map(([metric, value]) => ({ metric, value }))
              : normalizedType === 'property_shares'
              ? Object.entries(analytics.propertyShares || {}).map(([metric, value]) => ({ metric, value }))
              : normalizedType === 'seller_funnel'
                ? analytics.seller?.funnel || []
                : normalizedType === 'seller_sources'
                  ? analytics.seller?.sources || []
                  : normalizedType === 'seller_agents'
                    ? analytics.seller?.agents || []
                    : normalizedType === 'seller_branches'
                      ? analytics.seller?.branches || []
              : normalizedType === 'leads'
                ? Object.entries(analytics.pipeline || {}).map(([metric, value]) => ({ metric, value }))
                : analytics.funnel || []
  return rowsToCsv(rows)
}

export const __leadAnalyticsServiceTestUtils = {
  average,
  buildLeadAnalyticsCsvExport,
  buildLeadAnalyticsModel,
  buildLeadWorkspaceAnalyticsSummary,
  buildListingWorkspaceAnalyticsSummary,
  getAgentLeadMetrics,
  getCommunicationMetrics,
  getCommunicationPerformanceMetrics,
  getLeadConversionMetrics,
  getLeadCategoryMetrics,
  getLeadFunnelMetrics,
  getLeadPipelineMetrics,
  getLeadSourceMetrics,
  getListingLeadMetrics,
  getRequirementGapMetrics,
  getRecommendationMetrics,
  getPropertyShareMetrics,
  getResponseTimeMetrics,
  getSellerAgentMetrics,
  getSellerAnalyticsMetrics,
  getSellerBranchMetrics,
  getSellerFunnelMetrics,
  getSellerSourceMetrics,
  getSuggestionMetrics,
  median,
  percent,
  rowsToCsv,
}
