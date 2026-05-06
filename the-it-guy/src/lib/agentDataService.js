import { OFFER_STATUS, readAgentPrivateListings, readAgentSellerLeads } from './agentListingStorage'
import { getAgentDemoTransactionRowsFromStorage } from './agentDemoSeed'
import { normalizeOfferWorkflowStatus, OFFER_WORKFLOW_STATUS } from './listingOffersService'

const KEY_PIPELINE = 'itg:pipeline-leads:v1'
const KEY_AGENT_DIRECTORY = 'itg:agent-directory:v1'
const AGENT_LEADERSHIP_EMAIL_ALLOWLIST = new Set(['alexlandman1998@gmail.com'])

function safeReadJson(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function resolveAgentDirectoryMap() {
  const directory = safeReadJson(KEY_AGENT_DIRECTORY, null)
  const agents = Array.isArray(directory?.agents) ? directory.agents : []
  const map = new Map()
  for (const agent of agents) {
    const key = normalizeText(agent?.id || agent?.email)
    if (!key) continue
    map.set(key, {
      id: agent?.id || '',
      email: agent?.email || '',
      name: agent?.name || agent?.fullName || agent?.email || 'Assigned Agent',
      agencyId: agent?.agencyId || '',
      principalId: agent?.principalId || '',
    })
  }
  return map
}

function listingStatusKey(listing) {
  const explicit = normalizeText(listing?.status || listing?.listingStatus || listing?.stage)
  if (explicit.includes('registered')) return 'registered'
  if (explicit.includes('sold')) return 'sold'
  if (explicit.includes('under_offer') || explicit.includes('under offer')) return 'under_offer'
  if (explicit.includes('active')) return 'active'
  if (explicit.includes('mandate_signed')) return 'mandate_signed'
  if (explicit.includes('mandate_sent')) return 'mandate_sent'
  if (explicit.includes('mandate_ready')) return 'mandate_ready'
  if (explicit.includes('onboarding_completed')) return 'onboarding_completed'
  if (explicit.includes('onboarding')) return 'onboarding_pending'
  if (explicit.includes('draft')) return 'draft'

  const offers = Array.isArray(listing?.offers) ? listing.offers : []
  if (
    offers.some((offer) => {
      const status = normalizeOfferWorkflowStatus(offer?.status)
      return status === OFFER_WORKFLOW_STATUS.ACCEPTED || status === OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION || status === OFFER_STATUS.ACCEPTED
    })
  ) {
    return 'under_offer'
  }

  return 'active'
}

function mapListingStatusToStage(statusKey) {
  if (statusKey === 'registered') {
    return { stage: 'Registered', mainStage: 'REG' }
  }
  if (statusKey === 'sold') {
    return { stage: 'Transfer in Progress', mainStage: 'XFER' }
  }
  if (statusKey === 'under_offer') {
    return { stage: 'Reserved', mainStage: 'OTP' }
  }
  if (statusKey === 'mandate_signed' || statusKey === 'active') {
    return { stage: 'Reserved', mainStage: 'DEP' }
  }
  if (statusKey === 'mandate_sent' || statusKey === 'mandate_ready' || statusKey === 'onboarding_completed') {
    return { stage: 'Available', mainStage: 'AVAIL' }
  }
  return { stage: 'Available', mainStage: 'AVAIL' }
}

function deriveFinanceType(listing) {
  const explicit = normalizeText(listing?.financeType || listing?.finance_type)
  if (['cash', 'bond', 'combination', 'hybrid'].includes(explicit)) {
    return explicit === 'hybrid' ? 'combination' : explicit
  }

  const offers = Array.isArray(listing?.offers) ? listing.offers : []
  const activeOffer = offers.find((offer) => {
    const status = normalizeOfferWorkflowStatus(offer?.status)
    return [
      OFFER_WORKFLOW_STATUS.ACCEPTED,
      OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION,
      OFFER_WORKFLOW_STATUS.SUBMITTED,
      OFFER_WORKFLOW_STATUS.SELLER_REVIEW,
      OFFER_WORKFLOW_STATUS.AGENT_REVIEW,
      OFFER_WORKFLOW_STATUS.BUYER_REVIEW_COUNTER,
      OFFER_STATUS.ACCEPTED,
      OFFER_STATUS.PENDING,
    ].includes(status)
  })
  const condition = normalizeText(activeOffer?.conditions)
  if (condition.includes('cash')) return 'cash'
  if (condition.includes('bond')) return 'bond'

  return 'unknown'
}

function resolveLeadSource(listing) {
  return String(listing?.marketing?.source || listing?.leadSource || listing?.source || 'Referral').trim() || 'Referral'
}

function resolveOfferBuyer(listing) {
  const offers = Array.isArray(listing?.offers) ? listing.offers : []
  const accepted = offers.find((offer) => {
    const status = normalizeOfferWorkflowStatus(offer?.status)
    return status === OFFER_WORKFLOW_STATUS.ACCEPTED || status === OFFER_WORKFLOW_STATUS.CONVERTED_TO_TRANSACTION || status === OFFER_STATUS.ACCEPTED
  })
  if (accepted) return accepted
  const pending = offers.find((offer) => {
    const status = normalizeOfferWorkflowStatus(offer?.status)
    return [
      OFFER_WORKFLOW_STATUS.SUBMITTED,
      OFFER_WORKFLOW_STATUS.AGENT_REVIEW,
      OFFER_WORKFLOW_STATUS.SELLER_REVIEW,
      OFFER_WORKFLOW_STATUS.BUYER_REVIEW_COUNTER,
      OFFER_STATUS.PENDING,
    ].includes(status)
  })
  return pending || offers[0] || null
}

function documentSummaryFromListing(listing) {
  const docs = Array.isArray(listing?.requiredDocuments) ? listing.requiredDocuments : []
  const uploadedCount = docs.filter((doc) => {
    const status = normalizeText(doc?.status)
    return ['uploaded', 'approved', 'verified', 'completed'].includes(status)
  }).length
  const totalRequired = docs.filter((doc) => Boolean(doc?.required)).length
  const requiredComplete = docs.filter((doc) => Boolean(doc?.required)).filter((doc) => {
    const status = normalizeText(doc?.status)
    return ['approved', 'verified', 'completed'].includes(status)
  }).length

  return {
    uploadedCount,
    totalRequired,
    missingCount: Math.max(totalRequired - requiredComplete, 0),
  }
}

function listingMatchesScope(listing, { profile = null, scope = 'agent' } = {}) {
  const profileEmail = normalizeText(profile?.email)
  const isLeadership = Boolean(profileEmail && AGENT_LEADERSHIP_EMAIL_ALLOWLIST.has(profileEmail))
  if (scope !== 'agent' || isLeadership) return true

  const profileId = normalizeText(profile?.id)
  if (!profileEmail && !profileId) return true

  const candidates = [
    listing?.agentId,
    listing?.assignedAgentEmail,
    listing?.assigned_agent_email,
    listing?.commission?.agent_id,
  ].map((value) => normalizeText(value)).filter(Boolean)

  if (!candidates.length) return true
  return candidates.some((candidate) => candidate === profileEmail || candidate === profileId)
}

function makeDerivedTransactionRow(listing, agentMap) {
  const listingId = String(listing?.id || '').trim() || `listing-${Math.random().toString(36).slice(2, 8)}`
  const statusKey = listingStatusKey(listing)
  const stageMeta = mapListingStatusToStage(statusKey)
  const offer = resolveOfferBuyer(listing)
  const financeType = deriveFinanceType(listing)
  const salesPrice = Number(offer?.offerPrice || listing?.askingPrice || 0) || 0
  const listPrice = Number(listing?.askingPrice || salesPrice || 0) || 0
  const agentId = normalizeText(listing?.commission?.agent_id || listing?.agentId || listing?.assignedAgentEmail)
  const agent = agentMap.get(agentId)

  return {
    unit: {
      id: listingId,
      development_id: listing?.developmentId || null,
      unit_number: listing?.listingTitle || listing?.propertyAddress || `Listing ${listingId.slice(0, 6)}`,
      price: salesPrice || listPrice,
      list_price: listPrice || salesPrice,
      status: stageMeta.stage,
      created_at: listing?.createdAt || new Date().toISOString(),
      updated_at: listing?.updatedAt || listing?.createdAt || new Date().toISOString(),
      property_type: listing?.propertyType || null,
    },
    development: listing?.developmentId
      ? {
          id: listing?.developmentId,
          name: listing?.developmentName || 'Development Listing',
          location: listing?.suburb || '',
        }
      : null,
    transaction: {
      id: `listing-trx-${listingId}`,
      transaction_reference: `AG-${String(listingId).slice(-6).toUpperCase()}`,
      transaction_type: listing?.developmentId ? 'development' : 'private',
      development_id: listing?.developmentId || null,
      unit_id: listingId,
      buyer_id: offer ? `buyer-${String(offer?.id || listingId).slice(-8)}` : null,
      property_address_line_1: listing?.propertyAddress || listing?.listingTitle || null,
      property_address_line_2: null,
      suburb: listing?.suburb || null,
      city: listing?.city || null,
      province: listing?.province || null,
      property_description: listing?.listingTitle || null,
      sales_price: salesPrice || listPrice,
      purchase_price: salesPrice || listPrice,
      finance_type: financeType,
      purchaser_type: 'individual',
      stage: stageMeta.stage,
      current_main_stage: stageMeta.mainStage,
      next_action:
        statusKey === 'onboarding_pending'
          ? 'Awaiting seller onboarding completion'
          : statusKey === 'onboarding_completed'
            ? 'Generate and send mandate'
            : statusKey === 'mandate_ready'
              ? 'Send mandate to seller'
              : statusKey === 'mandate_sent'
                ? 'Awaiting seller signature'
                : statusKey === 'under_offer'
                  ? 'Prepare OTP pack and buyer onboarding'
                  : statusKey === 'sold'
                    ? 'Coordinate transfer workflow'
                    : statusKey === 'registered'
                      ? 'Transaction completed'
                      : 'Maintain listing activity',
      comment: listing?.notes || listing?.marketing?.notes || '',
      marketing_source: resolveLeadSource(listing),
      assigned_agent: listing?.assignedAgent || listing?.assignedAgentName || agent?.name || 'Assigned Agent',
      assigned_agent_email: listing?.assignedAgentEmail || agent?.email || null,
      lifecycle_state: statusKey === 'registered' ? 'completed' : 'active',
      is_active: statusKey !== 'registered',
      updated_at: listing?.updatedAt || listing?.createdAt || new Date().toISOString(),
      created_at: listing?.createdAt || new Date().toISOString(),
      commission_amount:
        String(listing?.commission?.commission_type || '').trim().toLowerCase() === 'fixed'
          ? Number(listing?.commission?.commission_amount || 0) || 0
          : 0,
    },
    buyer: offer
      ? {
          id: `buyer-${String(offer?.id || listingId).slice(-8)}`,
          name: offer?.buyerName || 'Buyer pending',
          phone: null,
          email: null,
        }
      : {
          id: null,
          name: 'Buyer pending',
          phone: null,
          email: null,
        },
    seller: listing?.seller || null,
    stage: stageMeta.stage,
    mainStage: stageMeta.mainStage,
    onboarding: {
      status: statusKey === 'onboarding_pending' ? 'in_progress' : statusKey === 'seller_lead' ? 'not_started' : 'submitted',
    },
    documentSummary: documentSummaryFromListing(listing),
  }
}

function dedupeRows(rows = []) {
  const map = new Map()
  for (const row of rows) {
    const id = String(row?.transaction?.id || row?.unit?.id || '').trim()
    if (!id) continue
    const existing = map.get(id)
    if (!existing) {
      map.set(id, row)
      continue
    }
    const existingUpdated = new Date(existing?.transaction?.updated_at || existing?.unit?.updated_at || 0).getTime()
    const nextUpdated = new Date(row?.transaction?.updated_at || row?.unit?.updated_at || 0).getTime()
    if (nextUpdated >= existingUpdated) {
      map.set(id, row)
    }
  }
  return [...map.values()]
}

export function readAgentPipelineLeads() {
  const rows = safeReadJson(KEY_PIPELINE, [])
  return Array.isArray(rows) ? rows : []
}

export function readAgentDirectory() {
  return safeReadJson(KEY_AGENT_DIRECTORY, { agency: null, principals: [], agents: [] })
}

export function getDerivedAgentTransactionRowsFromListings({ profile = null, scope = 'agent' } = {}) {
  const listings = readAgentPrivateListings()
  const agentMap = resolveAgentDirectoryMap()
  return listings
    .filter((listing) => listingMatchesScope(listing, { profile, scope }))
    .map((listing) => makeDerivedTransactionRow(listing, agentMap))
}

export function getUnifiedAgentRows({ liveRows = [], profile = null, scope = 'agent' } = {}) {
  const seededRows = getAgentDemoTransactionRowsFromStorage()
  const derivedRows = getDerivedAgentTransactionRowsFromListings({ profile, scope })
  return dedupeRows([...(Array.isArray(liveRows) ? liveRows : []), ...(Array.isArray(seededRows) ? seededRows : []), ...derivedRows])
}

export function getListingCount(listings = []) {
  return (Array.isArray(listings) ? listings : []).length
}

export function getActiveDealCount(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const main = String(row?.mainStage || row?.transaction?.current_main_stage || '').toUpperCase()
    const lifecycle = normalizeText(row?.transaction?.lifecycle_state)
    return main !== 'REG' && !lifecycle.includes('cancel')
  }).length
}

export function getRegisteredCount(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const main = String(row?.mainStage || row?.transaction?.current_main_stage || '').toUpperCase()
    return main === 'REG'
  }).length
}

export function getPipelineValue(rows = []) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
    const main = String(row?.mainStage || row?.transaction?.current_main_stage || '').toUpperCase()
    if (main === 'REG') return sum
    const value = Number(row?.transaction?.sales_price || row?.transaction?.purchase_price || row?.unit?.price || 0)
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0)
}

export function getEstimatedCommission(rows = [], defaultPct = 0.03) {
  const explicit = (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
    const value = Number(
      row?.transaction?.commission_earned ||
        row?.transaction?.agent_commission_earned ||
        row?.transaction?.agent_commission ||
        row?.transaction?.commission_amount ||
        0,
    )
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0)
  if (explicit > 0) return explicit

  const base = (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
    const value = Number(row?.transaction?.sales_price || row?.transaction?.purchase_price || row?.unit?.price || 0)
    return sum + (Number.isFinite(value) ? value : 0)
  }, 0)
  return base * defaultPct
}

export function getTopPerformingAgents(rows = [], limit = 5) {
  const map = new Map()
  const directory = readAgentDirectory()
  const directoryAgents = Array.isArray(directory?.agents) ? directory.agents : []
  const pipelineLeads = readAgentPipelineLeads()

  const getKeyByIdentity = ({ id = '', email = '', name = '' } = {}) => {
    const normalizedId = normalizeText(id)
    if (normalizedId) return normalizedId
    const normalizedEmail = normalizeText(email)
    if (normalizedEmail) return normalizedEmail
    const normalizedName = normalizeText(name)
    return normalizedName || ''
  }

  const ensureEntry = ({ id = '', email = '', name = '' } = {}) => {
    const key = getKeyByIdentity({ id, email, name })
    if (!key) return null

    if (!map.has(key)) {
      map.set(key, {
        key,
        agent: String(name || email || 'Unassigned').trim() || 'Unassigned',
        email: String(email || '').trim().toLowerCase(),
        deals: 0,
        registered: 0,
        pipelineValue: 0,
        totalDays: 0,
      })
    }

    return map.get(key)
  }

  const resolveEntryByRow = (row) => {
    const agentEmail = String(row?.transaction?.assigned_agent_email || '').trim().toLowerCase()
    const agentName = String(row?.transaction?.assigned_agent || '').trim()
    const byEmail = agentEmail
      ? directoryAgents.find((agent) => normalizeText(agent?.email) === normalizeText(agentEmail))
      : null
    const byName = !byEmail && agentName
      ? directoryAgents.find((agent) => normalizeText(agent?.name) === normalizeText(agentName))
      : null
    const directoryMatch = byEmail || byName || null

    return ensureEntry({
      id: directoryMatch?.id || '',
      email: directoryMatch?.email || agentEmail,
      name: directoryMatch?.name || agentName || 'Unassigned',
    })
  }

  for (const agent of directoryAgents) {
    ensureEntry({ id: agent?.id, email: agent?.email, name: agent?.name || agent?.fullName })
  }

  for (const row of Array.isArray(rows) ? rows : []) {
    const entry = resolveEntryByRow(row)
    if (!entry) continue

    const main = String(row?.mainStage || row?.transaction?.current_main_stage || '').toUpperCase()
    const value = Number(row?.transaction?.sales_price || row?.transaction?.purchase_price || row?.unit?.price || 0) || 0
    const updatedAt = row?.transaction?.updated_at || row?.unit?.updated_at || row?.transaction?.created_at || row?.unit?.created_at || null
    const daysSinceUpdate = updatedAt
      ? Math.max(0, Math.round((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)))
      : 0
    entry.deals += 1
    entry.totalDays += Number.isFinite(daysSinceUpdate) ? daysSinceUpdate : 0
    if (main === 'REG') entry.registered += 1
    else entry.pipelineValue += value
  }

  for (const lead of Array.isArray(pipelineLeads) ? pipelineLeads : []) {
    const leadAgentEmail = String(lead?.assignedAgentEmail || lead?.agentEmail || '').trim().toLowerCase()
    const leadAgentName = String(lead?.assignedAgent || lead?.agentName || '').trim()
    const leadAgentId = String(lead?.agent_id || lead?.agentId || '').trim()
    const byEmail = leadAgentEmail
      ? directoryAgents.find((agent) => normalizeText(agent?.email) === normalizeText(leadAgentEmail))
      : null
    const byId = !byEmail && leadAgentId
      ? directoryAgents.find((agent) => normalizeText(agent?.id) === normalizeText(leadAgentId))
      : null
    const byName = !byEmail && !byId && leadAgentName
      ? directoryAgents.find((agent) => normalizeText(agent?.name) === normalizeText(leadAgentName))
      : null
    const directoryMatch = byEmail || byId || byName || null

    const entry = ensureEntry({
      id: directoryMatch?.id || leadAgentId,
      email: directoryMatch?.email || leadAgentEmail,
      name: directoryMatch?.name || leadAgentName,
    })
    if (!entry) continue

    const budget = Number(lead?.budget || lead?.value || 0)
    if (Number.isFinite(budget) && budget > 0) {
      entry.pipelineValue += budget
    }
  }

  return [...map.values()]
    .map((item) => ({
      ...item,
      conversion: item.deals ? (item.registered / item.deals) * 100 : 0,
      avgDealTime: item.deals ? item.totalDays / item.deals : 0,
    }))
    .sort((left, right) => {
      if (right.pipelineValue !== left.pipelineValue) {
        return right.pipelineValue - left.pipelineValue
      }
      if (right.deals !== left.deals) {
        return right.deals - left.deals
      }
      return right.registered - left.registered
    })
    .slice(0, limit)
}

export function getActiveDeals(rows = [], limit = 10) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => String(row?.mainStage || row?.transaction?.current_main_stage || '').toUpperCase() !== 'REG')
    .sort((a, b) => new Date(b?.transaction?.updated_at || 0) - new Date(a?.transaction?.updated_at || 0))
    .slice(0, limit)
}

export function getAgentModuleSharedData({ liveRows = [], profile = null, scope = 'agent' } = {}) {
  const listings = readAgentPrivateListings().filter((listing) => listingMatchesScope(listing, { profile, scope }))
  const sellerLeads = readAgentSellerLeads().filter((lead) => listingMatchesScope(lead, { profile, scope }))
  const pipelineLeads = readAgentPipelineLeads()
  const rows = getUnifiedAgentRows({ liveRows, profile, scope })

  return {
    listings,
    sellerLeads,
    pipelineLeads,
    rows,
    dashboard: {
      listingCount: getListingCount(listings),
      activeDealCount: getActiveDealCount(rows),
      registeredCount: getRegisteredCount(rows),
      pipelineValue: getPipelineValue(rows),
      estimatedCommission: getEstimatedCommission(rows),
      topPerformingAgents: getTopPerformingAgents(rows),
      activeDeals: getActiveDeals(rows),
    },
  }
}
