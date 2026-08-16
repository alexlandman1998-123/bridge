export const DEVELOPER_LEAD_PHASE21_CONTRACT = 'developer-leads-phase21-protected-intake-queue-v1'

const HIDDEN_BUYER_FIELDS = Object.freeze([
  'buyerFullName',
  'buyerEmail',
  'buyerPhone',
  'buyerIdNumber',
  'privateNotes',
  'rawPayload',
])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function isAgencyFedLead(lead = {}) {
  return lead.leadOwner === 'agency' || lead.accessProfile?.agencyFed === true
}

function requiresAgencyHandover(lead = {}) {
  return isAgencyFedLead(lead) && lead.accessProfile?.requiresHandoverBeforePrivateDetails === true
}

function resolveQueueState(lead = {}) {
  if (!isAgencyFedLead(lead)) return 'not_agency_fed'
  if (lead.visibilityState === 'handed_over') return 'released'
  if (lead.visibilityState === 'consent_pending') return 'handover_requested'
  return 'protected'
}

function buildDisplayTitle(lead = {}) {
  return normalizeText(lead.protectedSummary) || normalizeText(lead.publicReference) || 'Agency protected buyer'
}

function hasLeakedBuyerFields(card = {}) {
  return HIDDEN_BUYER_FIELDS.some((field) => normalizeText(card[field]))
}

export function buildProtectedDeveloperLeadQueue(leads = []) {
  const rows = Array.isArray(leads) ? leads : []
  const agencyRows = rows.filter(isAgencyFedLead)
  const protectedRows = agencyRows.filter((lead) => requiresAgencyHandover(lead) || lead.visibilityState === 'consent_pending')
  const releasedRows = agencyRows.filter((lead) => lead.visibilityState === 'handed_over')

  const cards = protectedRows.map((lead) => {
    const state = resolveQueueState(lead)
    const requested = state === 'handover_requested'
    return Object.freeze({
      contract: DEVELOPER_LEAD_PHASE21_CONTRACT,
      developerLeadId: normalizeText(lead.developerLeadId),
      publicReference: normalizeText(lead.publicReference),
      sourceAgencyOrgId: normalizeText(lead.sourceAgencyOrgId),
      sourceAgentUserId: normalizeText(lead.sourceAgentUserId),
      assignedAgentId: normalizeText(lead.assignedAgentId),
      primaryDevelopmentId: normalizeText(lead.primaryDevelopmentId),
      preferredUnitId: normalizeText(lead.preferredUnitId),
      protectedSummary: buildDisplayTitle(lead),
      unitTypeInterest: normalizeText(lead.unitTypeInterest) || 'Any unit',
      budgetMin: lead.budgetMin ?? null,
      budgetMax: lead.budgetMax ?? null,
      leadStatus: normalizeLower(lead.leadStatus) || 'new',
      reservationState: normalizeLower(lead.reservationState) || 'none',
      visibilityState: normalizeLower(lead.visibilityState) || 'limited',
      queueState: state,
      handoverAction: requested ? 'await_agency_release' : 'request_handover',
      canRequestHandover: !requested,
      canConvert: false,
      privacyLabel: requested ? 'Handover requested' : 'Protected until handover',
      hiddenBuyerFields: HIDDEN_BUYER_FIELDS,
    })
  })

  const leakedCards = cards.filter(hasLeakedBuyerFields)

  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE21_CONTRACT,
    totalAgencyFed: agencyRows.length,
    protectedCount: cards.length,
    handoverRequestedCount: cards.filter((card) => card.queueState === 'handover_requested').length,
    handoverReadyCount: cards.filter((card) => card.queueState === 'protected').length,
    releasedCount: releasedRows.length,
    privacyLeaks: leakedCards.length,
    ready: leakedCards.length === 0,
    cards,
  })
}

export function summarizeProtectedDeveloperLeadQueue(leads = []) {
  const queue = buildProtectedDeveloperLeadQueue(leads)
  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE21_CONTRACT,
    status: queue.privacyLeaks > 0 ? 'blocked' : queue.protectedCount > 0 ? 'attention' : 'ready',
    label: queue.protectedCount > 0
      ? `${queue.protectedCount} protected agency lead${queue.protectedCount === 1 ? '' : 's'}`
      : 'No protected agency leads',
    detail: queue.handoverRequestedCount > 0
      ? `${queue.handoverRequestedCount} handover request${queue.handoverRequestedCount === 1 ? '' : 's'} awaiting agency release.`
      : 'Buyer private details remain hidden until the agency releases handover.',
  })
}
