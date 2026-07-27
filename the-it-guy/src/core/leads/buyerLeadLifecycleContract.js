export const BUYER_LEAD_DOMAIN = 'residential_buyer'

export const BUYER_LEAD_LIFECYCLE_STATUSES = Object.freeze({
  open: 'open',
  paused: 'paused',
  converted: 'converted',
  closed: 'closed',
  lost: 'lost',
})

export const BUYER_LEAD_LIFECYCLE_STAGES = Object.freeze({
  enquiryReceived: 'enquiry_received',
  assigned: 'assigned',
  firstContact: 'first_contact',
  qualified: 'qualified',
  matched: 'matched',
  viewingScheduled: 'viewing_scheduled',
  viewingCompleted: 'viewing_completed',
  offerDraft: 'offer_draft',
  offerSubmitted: 'offer_submitted',
  negotiating: 'negotiating',
  offerAccepted: 'offer_accepted',
  onboarding: 'onboarding',
  transactionCreated: 'transaction_created',
  finance: 'finance',
  transfer: 'transfer',
  registered: 'registered',
  nurture: 'nurture',
  lost: 'lost',
})

export const BUYER_LEAD_LIFECYCLE_STAGE_VALUES = Object.freeze(
  Object.values(BUYER_LEAD_LIFECYCLE_STAGES),
)

export const BUYER_LEAD_STAGE_DEFINITIONS = Object.freeze({
  [BUYER_LEAD_LIFECYCLE_STAGES.enquiryReceived]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.enquiryReceived,
    label: 'New Lead',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.open,
    order: 10,
    funnelStage: 'Lead',
    columnId: 'lead',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.assigned]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.assigned,
    label: 'Assigned',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.open,
    order: 20,
    funnelStage: 'Lead',
    columnId: 'lead',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.firstContact]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.firstContact,
    label: 'Contacted',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.open,
    order: 30,
    funnelStage: 'Contacted',
    columnId: 'viewing_contacted',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.qualified]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.qualified,
    label: 'Qualified',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.open,
    order: 40,
    funnelStage: 'Qualified',
    columnId: 'viewing_contacted',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.matched]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.matched,
    label: 'Matched',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.open,
    order: 50,
    funnelStage: 'Matched',
    columnId: 'viewing_contacted',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.viewingScheduled]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.viewingScheduled,
    label: 'Viewing Scheduled',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.open,
    order: 60,
    funnelStage: 'Viewing Scheduled',
    columnId: 'viewing_contacted',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.viewingCompleted]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.viewingCompleted,
    label: 'Viewing Completed',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.open,
    order: 70,
    funnelStage: 'Viewed',
    columnId: 'viewing_contacted',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.offerDraft]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.offerDraft,
    label: 'Offer Draft',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.open,
    order: 80,
    funnelStage: 'Offer Discussed',
    columnId: 'offer',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.offerSubmitted]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.offerSubmitted,
    label: 'Offer Submitted',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.open,
    order: 90,
    funnelStage: 'Offer Discussed',
    columnId: 'offer',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.negotiating]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.negotiating,
    label: 'Negotiating',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.open,
    order: 100,
    funnelStage: 'Offer Discussed',
    columnId: 'offer',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.offerAccepted]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.offerAccepted,
    label: 'Offer Accepted',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.open,
    order: 110,
    funnelStage: 'Offer Accepted',
    columnId: 'offer',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.onboarding]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.onboarding,
    label: 'Onboarding',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.open,
    order: 120,
    funnelStage: 'Onboarding',
    columnId: 'viewing_contacted',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.transactionCreated]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.transactionCreated,
    label: 'Transaction Created',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.converted,
    order: 130,
    funnelStage: 'Converted',
    columnId: 'deal_otp',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.finance]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.finance,
    label: 'Finance',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.converted,
    order: 140,
    funnelStage: 'Converted',
    columnId: 'finance',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.transfer]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.transfer,
    label: 'Transfer',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.converted,
    order: 150,
    funnelStage: 'Converted',
    columnId: 'transfer',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.registered]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.registered,
    label: 'Registered',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.closed,
    order: 160,
    funnelStage: 'Converted',
    columnId: 'registered',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.nurture]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.nurture,
    label: 'Nurture',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.paused,
    order: 900,
    funnelStage: 'Contacted',
    columnId: 'viewing_contacted',
  }),
  [BUYER_LEAD_LIFECYCLE_STAGES.lost]: Object.freeze({
    key: BUYER_LEAD_LIFECYCLE_STAGES.lost,
    label: 'Lost',
    lifecycleStatus: BUYER_LEAD_LIFECYCLE_STATUSES.lost,
    order: 999,
    funnelStage: 'Archived',
    columnId: 'lost',
  }),
})

export const BUYER_LEAD_EXISTING_STAGE_ALIASES = Object.freeze({
  [BUYER_LEAD_LIFECYCLE_STAGES.enquiryReceived]: Object.freeze([
    'Lead',
    'New',
    'New Lead',
    'Canvassing',
    'Prospecting',
    'New Prospect',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.assigned]: Object.freeze([
    'Assigned',
    'Awaiting Assignment',
    'Assigned To Agent',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.firstContact]: Object.freeze([
    'Contacted',
    'First Contact',
    'First Contact Logged',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.qualified]: Object.freeze([
    'Qualified',
    'Requirement Created',
    'Requirements Captured',
    'Buyer Qualified',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.matched]: Object.freeze([
    'Matched',
    'Suggested',
    'Shortlisted',
    'Sent',
    'Viewed',
    'Property Sent',
    'Listing Sent',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.viewingScheduled]: Object.freeze([
    'Viewing',
    'Viewing Scheduled',
    'Appointment Scheduled',
    'Buyer Meeting',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.viewingCompleted]: Object.freeze([
    'Viewing Completed',
    'Appointment Completed',
    'Viewed Property',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.offerDraft]: Object.freeze([
    'Offer Draft',
    'Offer Created',
    'Sent To Buyer',
    'Buyer Viewed',
    'Changes Requested',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.offerSubmitted]: Object.freeze([
    'Offer Submitted',
    'Submitted',
    'Agent Review',
    'Seller Review',
    'Sent To Seller',
    'Seller Viewed',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.negotiating]: Object.freeze([
    'Negotiating',
    'Negotiation',
    'Countered',
    'Buyer Review Counter',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.offerAccepted]: Object.freeze([
    'Offer Accepted',
    'Accepted',
    'Approved',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.onboarding]: Object.freeze([
    'Onboarding',
    'Onboarding Sent',
    'Onboarding Completed',
    'Buyer Onboarding',
    'Buyer Onboarding Pending',
    'Client Onboarding',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.transactionCreated]: Object.freeze([
    'Converted',
    'Converted To Transaction',
    'Deal Created',
    'Transaction Created',
    'OTP',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.finance]: Object.freeze([
    'Finance',
    'Bond',
    'Bond Submitted',
    'Bond Approved',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.transfer]: Object.freeze([
    'Transfer',
    'Attorney',
    'Conveyancing',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.registered]: Object.freeze([
    'Registered',
    'Registered / Closed',
    'Closed',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.nurture]: Object.freeze([
    'Nurture',
    'Nurture / Follow-up Later',
    'Follow-up Later',
    'Dormant',
  ]),
  [BUYER_LEAD_LIFECYCLE_STAGES.lost]: Object.freeze([
    'Lost',
    'Archived',
    'Rejected',
    'Declined',
    'Withdrawn',
    'Expired',
  ]),
})

const STAGE_ALIAS_BY_KEY = Object.freeze(
  Object.entries(BUYER_LEAD_EXISTING_STAGE_ALIASES).reduce((aliases, [stage, values]) => {
    aliases[stage] = stage
    for (const value of values) aliases[normalizeKey(value)] = stage
    return aliases
  }, {}),
)

const BUYER_EVENT_STAGE_ALIASES = Object.freeze({
  new_lead: BUYER_LEAD_LIFECYCLE_STAGES.enquiryReceived,
  lead_assigned: BUYER_LEAD_LIFECYCLE_STAGES.assigned,
  first_contact_logged: BUYER_LEAD_LIFECYCLE_STAGES.firstContact,
  requirement_created: BUYER_LEAD_LIFECYCLE_STAGES.qualified,
  suggestion_accepted: BUYER_LEAD_LIFECYCLE_STAGES.matched,
  property_sent: BUYER_LEAD_LIFECYCLE_STAGES.matched,
  viewing_created: BUYER_LEAD_LIFECYCLE_STAGES.viewingScheduled,
  viewing_scheduled: BUYER_LEAD_LIFECYCLE_STAGES.viewingScheduled,
  viewing_completed: BUYER_LEAD_LIFECYCLE_STAGES.viewingCompleted,
  offer_created: BUYER_LEAD_LIFECYCLE_STAGES.offerDraft,
  offer_submitted: BUYER_LEAD_LIFECYCLE_STAGES.offerSubmitted,
  offer_countered: BUYER_LEAD_LIFECYCLE_STAGES.negotiating,
  offer_accepted: BUYER_LEAD_LIFECYCLE_STAGES.offerAccepted,
  onboarding_started: BUYER_LEAD_LIFECYCLE_STAGES.onboarding,
  transaction_created: BUYER_LEAD_LIFECYCLE_STAGES.transactionCreated,
  registration_confirmed: BUYER_LEAD_LIFECYCLE_STAGES.registered,
})

const OFFER_STATUS_STAGE_ALIASES = Object.freeze({
  draft: BUYER_LEAD_LIFECYCLE_STAGES.offerDraft,
  sent_to_buyer: BUYER_LEAD_LIFECYCLE_STAGES.offerDraft,
  buyer_viewed: BUYER_LEAD_LIFECYCLE_STAGES.offerDraft,
  changes_requested: BUYER_LEAD_LIFECYCLE_STAGES.offerDraft,
  submitted: BUYER_LEAD_LIFECYCLE_STAGES.offerSubmitted,
  pending: BUYER_LEAD_LIFECYCLE_STAGES.offerSubmitted,
  agent_review: BUYER_LEAD_LIFECYCLE_STAGES.offerSubmitted,
  review: BUYER_LEAD_LIFECYCLE_STAGES.offerSubmitted,
  sent_to_seller: BUYER_LEAD_LIFECYCLE_STAGES.offerSubmitted,
  seller_review: BUYER_LEAD_LIFECYCLE_STAGES.offerSubmitted,
  seller_viewed: BUYER_LEAD_LIFECYCLE_STAGES.offerSubmitted,
  countered: BUYER_LEAD_LIFECYCLE_STAGES.negotiating,
  buyer_review_counter: BUYER_LEAD_LIFECYCLE_STAGES.negotiating,
  accepted: BUYER_LEAD_LIFECYCLE_STAGES.offerAccepted,
  approved: BUYER_LEAD_LIFECYCLE_STAGES.offerAccepted,
  converted_to_transaction: BUYER_LEAD_LIFECYCLE_STAGES.transactionCreated,
  rejected: BUYER_LEAD_LIFECYCLE_STAGES.lost,
  declined: BUYER_LEAD_LIFECYCLE_STAGES.lost,
  withdrawn: BUYER_LEAD_LIFECYCLE_STAGES.lost,
  expired: BUYER_LEAD_LIFECYCLE_STAGES.lost,
})

const LISTING_INTEREST_STAGE_ALIASES = Object.freeze({
  interested: BUYER_LEAD_LIFECYCLE_STAGES.matched,
  suggested: BUYER_LEAD_LIFECYCLE_STAGES.matched,
  shortlisted: BUYER_LEAD_LIFECYCLE_STAGES.matched,
  sent: BUYER_LEAD_LIFECYCLE_STAGES.matched,
  viewed: BUYER_LEAD_LIFECYCLE_STAGES.matched,
  viewing_scheduled: BUYER_LEAD_LIFECYCLE_STAGES.viewingScheduled,
  offer_submitted: BUYER_LEAD_LIFECYCLE_STAGES.offerSubmitted,
  converted: BUYER_LEAD_LIFECYCLE_STAGES.transactionCreated,
  dismissed: BUYER_LEAD_LIFECYCLE_STAGES.nurture,
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function readFirst(source = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(source?.[key])
    if (value) return value
  }
  return ''
}

function resolveStageFromSignals(source = {}) {
  const explicit = readFirst(source, [
    'canonicalBuyerLeadStage',
    'buyerLeadLifecycleStage',
    'buyer_lead_lifecycle_stage',
    'stage',
    'current_stage',
    'currentStage',
    'status',
  ])
  const explicitStage = normalizeBuyerLeadLifecycleStage(explicit, '')
  if (explicitStage) return explicitStage

  const eventStage = BUYER_EVENT_STAGE_ALIASES[normalizeKey(readFirst(source, ['eventType', 'event_type', 'event']))]
  if (eventStage) return eventStage

  const offerStage = OFFER_STATUS_STAGE_ALIASES[normalizeKey(readFirst(source, ['offerStatus', 'offer_status']))]
  if (offerStage) return offerStage

  const interestStage = LISTING_INTEREST_STAGE_ALIASES[normalizeKey(readFirst(source, ['listingInterestStatus', 'listing_interest_status', 'interestStatus', 'interest_status']))]
  if (interestStage) return interestStage

  if (readFirst(source, ['convertedTransactionId', 'converted_transaction_id', 'transactionId', 'transaction_id'])) {
    return BUYER_LEAD_LIFECYCLE_STAGES.transactionCreated
  }
  if (readFirst(source, ['firstContactedAt', 'first_contacted_at'])) return BUYER_LEAD_LIFECYCLE_STAGES.firstContact
  if (readFirst(source, ['assignedAgentId', 'assigned_agent_id', 'assignedUserId', 'assigned_user_id', 'assignedQueueId', 'assigned_queue_id'])) {
    return BUYER_LEAD_LIFECYCLE_STAGES.assigned
  }

  return BUYER_LEAD_LIFECYCLE_STAGES.enquiryReceived
}

export function normalizeBuyerLeadLifecycleStage(value = '', fallback = BUYER_LEAD_LIFECYCLE_STAGES.enquiryReceived) {
  const normalized = normalizeKey(value)
  if (!normalized) return fallback
  return STAGE_ALIAS_BY_KEY[normalized] || fallback
}

export function getBuyerLeadLifecycleStageDefinition(stage = '') {
  const normalizedStage = normalizeBuyerLeadLifecycleStage(stage)
  return BUYER_LEAD_STAGE_DEFINITIONS[normalizedStage] || BUYER_LEAD_STAGE_DEFINITIONS[BUYER_LEAD_LIFECYCLE_STAGES.enquiryReceived]
}

export function getBuyerLeadLifecycleStatusForStage(stage = '') {
  return getBuyerLeadLifecycleStageDefinition(stage).lifecycleStatus
}

export function resolveBuyerLeadLifecycle(source = {}) {
  const stage = typeof source === 'string'
    ? normalizeBuyerLeadLifecycleStage(source)
    : resolveStageFromSignals(source)
  const definition = getBuyerLeadLifecycleStageDefinition(stage)
  return {
    domain: BUYER_LEAD_DOMAIN,
    stage,
    label: definition.label,
    lifecycleStatus: definition.lifecycleStatus,
    order: definition.order,
    funnelStage: definition.funnelStage,
    columnId: definition.columnId,
  }
}

export const __buyerLeadLifecycleContractTestUtils = {
  normalizeKey,
}
