import { generateId } from './agentListingStorage'

const KEY_AGENT_DEMO_TRANSACTIONS = 'itg:agent-demo-transactions:v1'
const KEY_TRANSACTION_LIFECYCLE_EVENTS = 'itg:transaction-lifecycle-events:v1'

const DEFAULT_AGENT_SPLIT_PERCENTAGE = 70

function readJson(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, JSON.stringify(value))
}

function normalize(value) {
  return String(value || '').trim()
}

function asNumber(value) {
  const next = Number(value)
  return Number.isFinite(next) ? next : null
}

function money(value) {
  const amount = Number(value || 0)
  return Number.isFinite(amount) ? Math.max(0, amount) : 0
}

function normalizeFinanceType(value) {
  const key = normalize(value).toLowerCase()
  if (key === 'hybrid') return 'combination'
  if (key === 'bond') return 'bond'
  if (key === 'cash') return 'cash'
  if (key === 'combination') return 'combination'
  return 'unknown'
}

function getOrganisationId(input = {}) {
  return normalize(input?.organisationId || input?.listing?.organisationId || input?.offerRecord?.organisationId || null) || null
}

function resolveCommissionSnapshot({
  offerAmount = 0,
  listing = null,
  payload = {},
} = {}) {
  const grossCommissionPercentage =
    asNumber(payload?.grossCommissionPercentage) ??
    asNumber(payload?.gross_commission_percentage) ??
    asNumber(listing?.commission?.commission_percentage) ??
    null

  const grossCommissionAmount =
    asNumber(payload?.grossCommissionAmount) ??
    asNumber(payload?.gross_commission_amount) ??
    (grossCommissionPercentage !== null ? Number(((offerAmount * grossCommissionPercentage) / 100).toFixed(2)) : null)

  const agentSplitPercentage =
    asNumber(payload?.agentSplitPercentage) ??
    asNumber(payload?.agent_split_percentage_snapshot) ??
    asNumber(listing?.commission?.agent_split_percentage) ??
    DEFAULT_AGENT_SPLIT_PERCENTAGE

  const normalizedAgentSplit = Math.max(0, Math.min(100, Number(agentSplitPercentage || 0)))
  const agencySplitPercentage =
    asNumber(payload?.agencySplitPercentage) ??
    asNumber(payload?.agency_split_percentage_snapshot) ??
    Math.max(0, Number((100 - normalizedAgentSplit).toFixed(2)))

  const agentCommissionAmount =
    asNumber(payload?.agentCommissionAmount) ??
    asNumber(payload?.agent_commission_amount) ??
    (grossCommissionAmount !== null ? Number(((grossCommissionAmount * normalizedAgentSplit) / 100).toFixed(2)) : null)

  const agencyCommissionAmount =
    asNumber(payload?.agencyCommissionAmount) ??
    asNumber(payload?.agency_commission_amount) ??
    (grossCommissionAmount !== null ? Number((grossCommissionAmount - (agentCommissionAmount || 0)).toFixed(2)) : null)

  return {
    gross_commission_percentage: grossCommissionPercentage,
    gross_commission_amount: grossCommissionAmount,
    agent_split_percentage_snapshot: normalizedAgentSplit,
    agency_split_percentage_snapshot: agencySplitPercentage,
    agent_commission_amount: agentCommissionAmount,
    agency_commission_amount: agencyCommissionAmount,
    commission_snapshot_source: grossCommissionAmount !== null ? 'snapshot' : 'missing',
  }
}

function appendTransactionRow(transactionRow) {
  const existing = readJson(KEY_AGENT_DEMO_TRANSACTIONS, [])
  const rows = Array.isArray(existing) ? existing : []
  const nextRows = [transactionRow, ...rows.filter((row) => String(row?.transaction?.id || '') !== String(transactionRow?.transaction?.id || ''))]
  writeJson(KEY_AGENT_DEMO_TRANSACTIONS, nextRows)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('itg:transaction-updated'))
    window.dispatchEvent(new Event('itg:transaction-created'))
  }
}

function appendLifecycleEvent(event) {
  const existing = readJson(KEY_TRANSACTION_LIFECYCLE_EVENTS, [])
  const rows = Array.isArray(existing) ? existing : []
  writeJson(KEY_TRANSACTION_LIFECYCLE_EVENTS, [event, ...rows].slice(0, 1000))
}

function buildTransactionRow({
  listing = null,
  offerRecord = null,
  lead = null,
  actor = null,
  payload = {},
  source = 'manual_override',
} = {}) {
  const transactionId = generateId('transaction')
  const onboardingToken = `buyer-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
  const onboardingUrl = `${typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://app.bridgenine.co.za'}/client/onboarding/${onboardingToken}`

  const offerAmount = money(
    payload?.offerAmount ??
      payload?.purchasePrice ??
      payload?.dealValue ??
      offerRecord?.offer?.offerAmount ??
      listing?.askingPrice ??
      lead?.estimatedValue ??
      lead?.budget ??
      0,
  )
  const commissionSnapshot = resolveCommissionSnapshot({
    offerAmount,
    listing,
    payload,
  })

  const nowIso = new Date().toISOString()
  const stage = 'Available'
  const mainStage = 'AVAIL'
  const organisationId = getOrganisationId({ organisationId: payload?.organisationId, listing, offerRecord })

  const assignedAgentId = normalize(
    payload?.assignedAgentId || listing?.assignedAgentId || lead?.assignedAgentId || actor?.id || offerRecord?.agentId || null,
  )
  const assignedAgentName = normalize(
    payload?.assignedAgentName || listing?.assignedAgentName || lead?.assignedAgentName || actor?.name || listing?.assignedAgent || 'Agent',
  )
  const assignedAgentEmail = normalize(
    payload?.assignedAgentEmail || listing?.assignedAgentEmail || lead?.assignedAgentEmail || actor?.email || null,
  ).toLowerCase()

  const buyerName = normalize(
    payload?.buyerName || offerRecord?.buyer?.fullName || lead?.contactName || `${lead?.firstName || ''} ${lead?.lastName || ''}`,
  ) || 'Buyer pending'

  const workflowHealthIssues = []
  if (!normalize(offerRecord?.id || payload?.acceptedOfferId)) {
    workflowHealthIssues.push('missing_accepted_offer')
  }
  if (!normalize(listing?.id || payload?.listingId)) {
    workflowHealthIssues.push('missing_listing')
  }
  if (!commissionSnapshot.gross_commission_amount) {
    workflowHealthIssues.push('missing_commission_snapshot')
  }

  const transactionRow = {
    unit: {
      id: String(listing?.id || payload?.listingId || ''),
      development_id: listing?.developmentId || null,
      unit_number: listing?.listingTitle || payload?.listingTitle || 'Listing',
      price: offerAmount,
      list_price: money(listing?.askingPrice || offerAmount),
      status: stage,
      created_at: nowIso,
      updated_at: nowIso,
    },
    development: listing?.developmentId
      ? {
          id: listing?.developmentId,
          name: listing?.developmentName || 'Development',
          location: listing?.suburb || '',
        }
      : null,
    transaction: {
      id: transactionId,
      transaction_reference: `AG-${String(transactionId).slice(-6).toUpperCase()}`,
      transaction_type: listing?.developmentId ? 'development' : 'private_property',
      development_id: listing?.developmentId || null,
      unit_id: listing?.id || payload?.listingId || null,
      buyer_id: offerRecord?.buyerLeadId || payload?.originatingBuyerLeadId || lead?.leadId || null,
      property_address_line_1: listing?.propertyAddress || listing?.listingTitle || payload?.propertyAddress || null,
      suburb: listing?.suburb || payload?.suburb || null,
      city: listing?.city || payload?.city || null,
      province: listing?.province || payload?.province || null,
      property_description: listing?.listingTitle || payload?.propertyDescription || null,
      sales_price: offerAmount,
      purchase_price: offerAmount,
      finance_type: normalizeFinanceType(payload?.financeType || offerRecord?.offer?.financeType || null),
      purchaser_type: 'individual',
      stage,
      current_main_stage: mainStage,
      next_action: workflowHealthIssues.length ? 'Resolve workflow health warnings' : 'Buyer onboarding pending',
      comment:
        source === 'accepted_offer'
          ? 'Transaction auto-created from accepted offer.'
          : 'Transaction created from lead with manual override (accepted offer missing).',
      assigned_agent: assignedAgentName || null,
      assigned_agent_email: assignedAgentEmail || null,
      lifecycle_state: 'active',
      is_active: true,
      onboarding_status: 'buyer_onboarding_pending',
      onboarding_token: onboardingToken,
      onboarding_url: onboardingUrl,
      transaction_workflow_stage: 'created',
      organisation_id: organisationId,
      listing_id: listing?.id || payload?.listingId || null,
      originating_buyer_lead_id: offerRecord?.buyerLeadId || payload?.originatingBuyerLeadId || lead?.leadId || null,
      originating_seller_lead_id: listing?.sellerLeadId || payload?.originatingSellerLeadId || null,
      accepted_offer_id: offerRecord?.id || payload?.acceptedOfferId || null,
      assigned_agent_id: assignedAgentId || null,
      buyer_contact_id: payload?.buyerContactId || null,
      seller_contact_id: payload?.sellerContactId || null,
      otp_packet_id: payload?.otpPacketId || null,
      mandate_packet_id: payload?.mandatePacketId || listing?.mandatePacketId || null,
      commission_snapshot_id: payload?.commissionSnapshotId || null,
      gross_commission_percentage: commissionSnapshot.gross_commission_percentage,
      gross_commission_amount: commissionSnapshot.gross_commission_amount,
      agent_split_percentage_snapshot: commissionSnapshot.agent_split_percentage_snapshot,
      agency_split_percentage_snapshot: commissionSnapshot.agency_split_percentage_snapshot,
      agent_commission_amount: commissionSnapshot.agent_commission_amount,
      agency_commission_amount: commissionSnapshot.agency_commission_amount,
      commission_snapshot_source: commissionSnapshot.commission_snapshot_source,
      workflow_health_issues: workflowHealthIssues,
      created_at: nowIso,
      updated_at: nowIso,
    },
    buyer: {
      id: offerRecord?.buyerLeadId || payload?.originatingBuyerLeadId || lead?.leadId || `buyer-${String(offerRecord?.id || transactionId).slice(-8)}`,
      name: buyerName,
      phone: offerRecord?.buyer?.phone || payload?.buyerPhone || '',
      email: offerRecord?.buyer?.email || payload?.buyerEmail || '',
    },
    seller: listing?.seller || null,
    stage,
    mainStage,
    onboarding: {
      status: 'not_started',
    },
    documentSummary: {
      uploadedCount: 0,
      totalRequired: 0,
      missingCount: 0,
    },
  }

  return {
    transactionRow,
    onboardingToken,
    onboardingUrl,
    transactionId,
  }
}

export function createTransactionFromAcceptedOffer({
  listing,
  offerRecord,
  actor = null,
  payload = {},
} = {}) {
  if (!listing) {
    throw new Error('Listing not found.')
  }
  if (!offerRecord) {
    throw new Error('Offer record not found.')
  }

  const created = buildTransactionRow({
    listing,
    offerRecord,
    actor,
    payload,
    source: 'accepted_offer',
  })
  appendTransactionRow(created.transactionRow)
  appendLifecycleEvent({
    id: generateId('tx_event'),
    eventType: 'offer_accepted_transaction_created',
    transactionId: created.transactionId,
    organisationId: created.transactionRow?.transaction?.organisation_id || null,
    listingId: listing?.id || null,
    offerId: offerRecord?.id || null,
    agentId: created.transactionRow?.transaction?.assigned_agent_id || null,
    createdAt: new Date().toISOString(),
  })
  return created
}

export function createTransactionFromLeadManualOverride({
  lead,
  listing = null,
  actor = null,
  payload = {},
} = {}) {
  if (!lead) {
    throw new Error('Lead not found.')
  }
  const created = buildTransactionRow({
    listing,
    offerRecord: null,
    lead,
    actor,
    payload,
    source: 'manual_override',
  })
  appendTransactionRow(created.transactionRow)
  appendLifecycleEvent({
    id: generateId('tx_event'),
    eventType: 'lead_manual_override_transaction_created',
    transactionId: created.transactionId,
    organisationId: created.transactionRow?.transaction?.organisation_id || null,
    leadId: lead?.leadId || null,
    listingId: listing?.id || payload?.listingId || null,
    warning: 'missing_accepted_offer',
    agentId: created.transactionRow?.transaction?.assigned_agent_id || null,
    createdAt: new Date().toISOString(),
  })
  return created
}

export function listTransactionLifecycleEvents() {
  const rows = readJson(KEY_TRANSACTION_LIFECYCLE_EVENTS, [])
  return Array.isArray(rows) ? rows : []
}
