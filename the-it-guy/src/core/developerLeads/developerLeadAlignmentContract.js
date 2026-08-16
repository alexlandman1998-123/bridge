import {
  AGENCY_FED_REDACTED_FIELDS,
  DEVELOPER_LEAD_OWNERSHIP_MODELS,
  DEVELOPER_LEAD_SELLING_MODELS,
  DEVELOPER_LEAD_VISIBILITY_STATES,
  buildDeveloperLeadAccessProfile,
} from './developerLeadContract.js'

export const DEVELOPER_LEAD_PHASE19_CONTRACT = 'developer-leads-phase19-agent-developer-alignment-v1'

export const DEVELOPER_SALE_SELLING_MODELS = Object.freeze([
  Object.freeze({
    key: 'developer_direct',
    label: 'Developer Direct',
    leadOwner: 'developer',
    ownershipModel: 'developer_direct',
    sellingModel: 'developer_led',
    buyerDetailPolicy: 'developer_full',
  }),
  Object.freeze({
    key: 'developer_assigned_agent',
    label: 'Developer Assigned Agent',
    leadOwner: 'developer',
    ownershipModel: 'developer_assigned',
    sellingModel: 'agent_led',
    buyerDetailPolicy: 'developer_full',
  }),
  Object.freeze({
    key: 'agency_introduced',
    label: 'Agency Introduced',
    leadOwner: 'agency',
    ownershipModel: 'agency_introduced',
    sellingModel: 'agent_led',
    buyerDetailPolicy: 'agency_protected_until_handover',
  }),
])

export const DEVELOPER_SALE_LEAD_LIFECYCLE = Object.freeze([
  Object.freeze({
    key: 'developer_captured',
    label: 'Developer captured',
    ownerSurface: 'developer_leads',
    visibleToDeveloper: true,
  }),
  Object.freeze({
    key: 'agency_captured',
    label: 'Agency captured',
    ownerSurface: 'agent_portal',
    visibleToDeveloper: false,
  }),
  Object.freeze({
    key: 'protected_lead_shared',
    label: 'Protected lead shared',
    ownerSurface: 'developer_leads',
    visibilityState: 'limited',
  }),
  Object.freeze({
    key: 'handover_requested',
    label: 'Handover requested',
    ownerSurface: 'developer_leads',
    visibilityState: 'consent_pending',
  }),
  Object.freeze({
    key: 'buyer_details_released',
    label: 'Buyer details released',
    ownerSurface: 'developer_leads',
    visibilityState: 'handed_over',
  }),
  Object.freeze({
    key: 'qualified',
    label: 'Qualified',
    ownerSurface: 'developer_leads',
    leadStatus: 'qualified',
  }),
  Object.freeze({
    key: 'reserved',
    label: 'Reserved',
    ownerSurface: 'developer_leads',
    leadStatus: 'reserved',
    reservationState: 'reserved',
  }),
  Object.freeze({
    key: 'converted_to_transaction',
    label: 'Converted to transaction',
    ownerSurface: 'shared_transaction',
    leadStatus: 'converted',
  }),
  Object.freeze({
    key: 'buyer_onboarding_sent',
    label: 'Buyer onboarding sent',
    ownerSurface: 'shared_transaction',
    transactionMilestone: 'buyer_onboarding_sent',
  }),
])

export const DEVELOPER_SALE_ALIGNMENT_FIELDS = Object.freeze([
  'developerOrgId',
  'sourceAgencyOrgId',
  'sourceAgentUserId',
  'assignedAgentId',
  'primaryDevelopmentId',
  'preferredUnitId',
  'visibilityState',
  'leadOwner',
  'ownershipModel',
  'sellingModel',
  'reservationState',
  'leadStatus',
  'convertedTransactionId',
])

export const DEVELOPER_SALE_MODULE_SURFACES = Object.freeze({
  developer: Object.freeze({
    developmentsPath: '/developments',
    leadsPath: '/developer/leads',
    transactionsPath: '/units',
    ownsProtectedHandoverRequest: true,
    ownsLeadConversion: true,
  }),
  agent: Object.freeze({
    developmentsPath: '/listings/developments',
    sharedDevelopmentsPath: '/developments',
    transactionsPath: '/transactions',
    ownsProtectedLeadCapture: true,
    ownsBuyerDetailRelease: true,
  }),
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function getLifecycleIndex(key = '') {
  return DEVELOPER_SALE_LEAD_LIFECYCLE.findIndex((item) => item.key === key)
}

function hasBuyerOnboardingSent(lead = {}) {
  return Boolean(
    normalizeText(lead.buyerOnboardingSentAt) ||
      normalizeText(lead.buyer_onboarding_sent_at) ||
      normalizeText(lead.onboardingEmailSentAt) ||
      normalizeText(lead.onboarding_email_sent_at),
  )
}

export function resolveDeveloperSaleLeadLifecycleStage(lead = {}) {
  const accessProfile = lead.accessProfile || buildDeveloperLeadAccessProfile(lead)
  const leadStatus = normalizeLower(accessProfile.leadStatus || lead.leadStatus || lead.lead_status)
  const visibilityState = normalizeLower(accessProfile.visibilityState || lead.visibilityState || lead.visibility_state)
  const reservationState = normalizeLower(accessProfile.reservationState || lead.reservationState || lead.reservation_state)

  if (hasBuyerOnboardingSent(lead)) return 'buyer_onboarding_sent'
  if (normalizeText(lead.convertedTransactionId || lead.converted_transaction_id) || leadStatus === 'converted') {
    return 'converted_to_transaction'
  }
  if (leadStatus === 'reserved' || reservationState === 'reserved') return 'reserved'
  if (leadStatus === 'qualified') return 'qualified'
  if (accessProfile.agencyFed) {
    if (visibilityState === 'handed_over') return 'buyer_details_released'
    if (visibilityState === 'consent_pending') return 'handover_requested'
    if (normalizeText(lead.developerLeadId || lead.developer_lead_id)) return 'protected_lead_shared'
    return 'agency_captured'
  }
  return 'developer_captured'
}

export function buildDeveloperSaleLeadAlignmentProfile(lead = {}) {
  const accessProfile = lead.accessProfile || buildDeveloperLeadAccessProfile(lead)
  const lifecycleStage = resolveDeveloperSaleLeadLifecycleStage({
    ...lead,
    accessProfile,
  })
  const lifecycleIndex = getLifecycleIndex(lifecycleStage)
  const sellingModel = DEVELOPER_SALE_SELLING_MODELS.find((model) =>
    model.leadOwner === accessProfile.leadOwner &&
    model.ownershipModel === accessProfile.ownershipModel &&
    model.sellingModel === accessProfile.sellingModel,
  ) || null

  const blockers = []
  const warnings = []

  if (!DEVELOPER_LEAD_OWNERSHIP_MODELS.includes(accessProfile.ownershipModel)) {
    blockers.push('unknown_ownership_model')
  }
  if (!DEVELOPER_LEAD_SELLING_MODELS.includes(accessProfile.sellingModel)) {
    blockers.push('unknown_selling_model')
  }
  if (!DEVELOPER_LEAD_VISIBILITY_STATES.includes(accessProfile.visibilityState)) {
    blockers.push('unknown_visibility_state')
  }
  if (accessProfile.agencyFed && !normalizeText(lead.sourceAgencyOrgId || lead.source_agency_org_id)) {
    blockers.push('source_agency_missing')
  }
  if (accessProfile.sellingModel === 'agent_led' && !normalizeText(lead.assignedAgentId || lead.assigned_agent_id || lead.sourceAgentUserId || lead.source_agent_user_id)) {
    warnings.push('agent_assignment_missing')
  }
  if (accessProfile.agencyFed && !normalizeText(lead.protectedSummary || lead.protected_summary)) {
    warnings.push('protected_summary_missing')
  }

  const canMoveToTransaction =
    ['qualified', 'reserved', 'converted_to_transaction', 'buyer_onboarding_sent'].includes(lifecycleStage) &&
    accessProfile.canDeveloperSeePrivateDetails &&
    Boolean(normalizeText(lead.primaryDevelopmentId || lead.primary_development_id)) &&
    Boolean(normalizeText(lead.preferredUnitId || lead.preferred_unit_id))

  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE19_CONTRACT,
    aligned: blockers.length === 0,
    blockers,
    warnings,
    accessProfile,
    sellingModel,
    lifecycleStage,
    lifecycleIndex,
    redactedFields: accessProfile.requiresHandoverBeforePrivateDetails ? AGENCY_FED_REDACTED_FIELDS : [],
    requiredSharedFields: DEVELOPER_SALE_ALIGNMENT_FIELDS,
    surfaces: DEVELOPER_SALE_MODULE_SURFACES,
    canMoveToTransaction,
  })
}

export function assertDeveloperSaleLifecycleCanAdvance(currentStage, nextStage) {
  const currentIndex = getLifecycleIndex(currentStage)
  const nextIndex = getLifecycleIndex(nextStage)
  if (currentIndex === -1 || nextIndex === -1) return false
  return nextIndex >= currentIndex
}
