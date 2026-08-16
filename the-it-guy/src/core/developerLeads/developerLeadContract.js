export const DEVELOPER_LEAD_PHASE10_CONTRACT = 'developer-leads-phase10-foundation-v1'

export const DEVELOPER_LEAD_OWNERS = Object.freeze(['developer', 'agency'])
export const DEVELOPER_LEAD_OWNERSHIP_MODELS = Object.freeze([
  'developer_direct',
  'developer_assigned',
  'agency_introduced',
])
export const DEVELOPER_LEAD_SELLING_MODELS = Object.freeze(['developer_led', 'agent_led'])
export const DEVELOPER_LEAD_VISIBILITY_STATES = Object.freeze([
  'full',
  'limited',
  'consent_pending',
  'handed_over',
])
export const DEVELOPER_LEAD_RESERVATION_STATES = Object.freeze([
  'none',
  'provisional',
  'reserved',
  'expired',
  'converted',
])
export const DEVELOPER_LEAD_STATUSES = Object.freeze([
  'new',
  'contacted',
  'qualified',
  'reserved',
  'converted',
  'lost',
])

export const AGENCY_FED_LIMITED_DEVELOPER_FIELDS = Object.freeze([
  'developerLeadId',
  'developerOrgId',
  'sourceAgencyOrgId',
  'sourceAgentUserId',
  'assignedAgentId',
  'primaryDevelopmentId',
  'preferredUnitId',
  'ownershipModel',
  'leadOwner',
  'sellingModel',
  'visibilityState',
  'reservationState',
  'leadStatus',
  'leadSource',
  'budgetMin',
  'budgetMax',
  'unitTypeInterest',
  'publicReference',
  'protectedSummary',
  'consentRequestedAt',
  'handoverAcceptedAt',
  'convertedTransactionId',
  'createdAt',
  'updatedAt',
])

export const AGENCY_FED_REDACTED_FIELDS = Object.freeze([
  'buyerFullName',
  'buyerEmail',
  'buyerPhone',
  'buyerIdNumber',
  'privateNotes',
  'rawPayload',
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeToken(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function firstKnown(value, allowed, fallback) {
  const normalized = normalizeToken(value)
  return allowed.includes(normalized) ? normalized : fallback
}

function uniq(values = []) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

export function normalizeDeveloperLeadOwner(value) {
  return firstKnown(value, DEVELOPER_LEAD_OWNERS, 'developer')
}

export function normalizeDeveloperLeadOwnershipModel(value, { leadOwner = '' } = {}) {
  const owner = normalizeDeveloperLeadOwner(leadOwner)
  return firstKnown(
    value,
    DEVELOPER_LEAD_OWNERSHIP_MODELS,
    owner === 'agency' ? 'agency_introduced' : 'developer_direct',
  )
}

export function normalizeDeveloperLeadSellingModel(value, { leadOwner = '', ownershipModel = '' } = {}) {
  const owner = normalizeDeveloperLeadOwner(leadOwner)
  const model = normalizeDeveloperLeadOwnershipModel(ownershipModel, { leadOwner: owner })
  return firstKnown(
    value,
    DEVELOPER_LEAD_SELLING_MODELS,
    owner === 'agency' || model === 'agency_introduced' || model === 'developer_assigned'
      ? 'agent_led'
      : 'developer_led',
  )
}

export function normalizeDeveloperLeadVisibilityState(value, { leadOwner = '' } = {}) {
  const owner = normalizeDeveloperLeadOwner(leadOwner)
  const fallback = owner === 'agency' ? 'limited' : 'full'
  const normalized = firstKnown(value, DEVELOPER_LEAD_VISIBILITY_STATES, fallback)
  if (owner === 'agency' && normalized === 'full') return 'limited'
  if (owner === 'developer' && normalized !== 'full') return 'full'
  return normalized
}

export function normalizeDeveloperLeadReservationState(value) {
  return firstKnown(value, DEVELOPER_LEAD_RESERVATION_STATES, 'none')
}

export function normalizeDeveloperLeadStatus(value) {
  return firstKnown(value, DEVELOPER_LEAD_STATUSES, 'new')
}

export function resolveDeveloperLeadDevelopmentScope(lead = {}) {
  const ids = uniq([
    lead.primaryDevelopmentId,
    lead.primary_development_id,
    ...(lead.interestedDevelopmentIds || []),
    ...(lead.interested_development_ids || []),
  ])
  if (ids.length === 0) return 'none'
  if (ids.length === 1) return 'one'
  return 'many'
}

export function buildDeveloperLeadAccessProfile(lead = {}) {
  const leadOwner = normalizeDeveloperLeadOwner(lead.leadOwner || lead.lead_owner)
  const ownershipModel = normalizeDeveloperLeadOwnershipModel(
    lead.ownershipModel || lead.ownership_model,
    { leadOwner },
  )
  const sellingModel = normalizeDeveloperLeadSellingModel(
    lead.sellingModel || lead.selling_model,
    { leadOwner, ownershipModel },
  )
  const visibilityState = normalizeDeveloperLeadVisibilityState(
    lead.visibilityState || lead.visibility_state,
    { leadOwner },
  )
  const reservationState = normalizeDeveloperLeadReservationState(
    lead.reservationState || lead.reservation_state,
  )
  const leadStatus = normalizeDeveloperLeadStatus(lead.leadStatus || lead.lead_status || lead.status)
  const developmentScope = resolveDeveloperLeadDevelopmentScope(lead)
  const agencyFed = leadOwner === 'agency' || ownershipModel === 'agency_introduced'
  const canDeveloperSeePrivateDetails = !agencyFed || visibilityState === 'handed_over'

  return {
    contract: DEVELOPER_LEAD_PHASE10_CONTRACT,
    leadOwner,
    ownershipModel,
    sellingModel,
    visibilityState,
    reservationState,
    leadStatus,
    developmentScope,
    agencyFed,
    canDeveloperSeePrivateDetails,
    requiresHandoverBeforePrivateDetails: agencyFed && !canDeveloperSeePrivateDetails,
    developerVisibleFields: agencyFed && !canDeveloperSeePrivateDetails
      ? AGENCY_FED_LIMITED_DEVELOPER_FIELDS
      : 'all_authorized_fields',
    redactedFields: agencyFed && !canDeveloperSeePrivateDetails ? AGENCY_FED_REDACTED_FIELDS : [],
  }
}

export function maskDeveloperLeadForDeveloper(lead = {}) {
  const profile = buildDeveloperLeadAccessProfile(lead)
  if (profile.canDeveloperSeePrivateDetails) {
    return {
      ...lead,
      accessProfile: profile,
    }
  }

  const allowed = new Set(AGENCY_FED_LIMITED_DEVELOPER_FIELDS)
  const masked = {}
  for (const [key, value] of Object.entries(lead)) {
    if (allowed.has(key)) masked[key] = value
  }
  for (const field of AGENCY_FED_REDACTED_FIELDS) {
    masked[field] = null
  }
  return {
    ...masked,
    accessProfile: profile,
  }
}
