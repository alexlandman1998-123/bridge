import { buildDeveloperLeadTransactionHandoff } from './developerLeadTransactionHandoff.js'

export const DEVELOPER_LEAD_PHASE23_CONTRACT = 'developer-leads-phase23-released-conversion-queue-v1'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function isAgencyIntroducedLead(lead = {}) {
  return lead.leadOwner === 'agency' || lead.ownershipModel === 'agency_introduced' || lead.accessProfile?.agencyFed === true
}

function isReleasedAgencyLead(lead = {}) {
  return isAgencyIntroducedLead(lead) && normalizeLower(lead.visibilityState) === 'handed_over'
}

function isConvertedLead(lead = {}) {
  return Boolean(normalizeText(lead.convertedTransactionId)) || normalizeLower(lead.leadStatus) === 'converted'
}

function resolveNextAction(handoff = {}) {
  return handoff.blockers?.[0]?.message ||
    handoff.warnings?.[0]?.message ||
    'Convert to a development transaction and send buyer onboarding.'
}

export function buildReleasedDeveloperLeadConversionQueue(leads = []) {
  const rows = Array.isArray(leads) ? leads : []
  const releasedRows = rows.filter(isReleasedAgencyLead)
  const convertedRows = releasedRows.filter(isConvertedLead)
  const activeRows = releasedRows.filter((lead) => !isConvertedLead(lead))

  const cards = activeRows.map((lead) => {
    const handoff = buildDeveloperLeadTransactionHandoff(lead)
    return Object.freeze({
      contract: DEVELOPER_LEAD_PHASE23_CONTRACT,
      lead,
      developerLeadId: normalizeText(lead.developerLeadId),
      developerOrgId: normalizeText(lead.developerOrgId),
      sourceAgencyOrgId: normalizeText(lead.sourceAgencyOrgId),
      sourceAgentUserId: normalizeText(lead.sourceAgentUserId),
      assignedAgentId: normalizeText(lead.assignedAgentId),
      primaryDevelopmentId: normalizeText(lead.primaryDevelopmentId),
      preferredUnitId: normalizeText(lead.preferredUnitId),
      publicReference: normalizeText(lead.publicReference),
      buyerFullName: normalizeText(lead.buyerFullName) || 'Buyer details released',
      buyerEmail: normalizeLower(lead.buyerEmail),
      buyerPhone: normalizeText(lead.buyerPhone),
      protectedSummary: normalizeText(lead.protectedSummary) || 'Agency-introduced buyer',
      unitTypeInterest: normalizeText(lead.unitTypeInterest) || 'Any unit',
      leadStatus: normalizeLower(lead.leadStatus) || 'new',
      reservationState: normalizeLower(lead.reservationState) || 'none',
      visibilityState: 'handed_over',
      handoverAcceptedAt: lead.handoverAcceptedAt || null,
      handoffStatus: handoff.status,
      handoffLabel: handoff.label,
      canConvert: handoff.eligible,
      canSendBuyerOnboarding: handoff.eligible,
      blockers: handoff.blockers,
      warnings: handoff.warnings,
      nextAction: resolveNextAction(handoff),
    })
  })

  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE23_CONTRACT,
    totalReleased: releasedRows.length,
    activeReleasedCount: activeRows.length,
    convertedCount: convertedRows.length,
    readyToConvertCount: cards.filter((card) => card.canConvert).length,
    attentionCount: cards.filter((card) => card.handoffStatus === 'attention').length,
    blockedCount: cards.filter((card) => !card.canConvert).length,
    cards,
  })
}

export function summarizeReleasedDeveloperLeadConversionQueue(leads = []) {
  const queue = buildReleasedDeveloperLeadConversionQueue(leads)
  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE23_CONTRACT,
    status: queue.blockedCount > 0 ? 'blocked' : queue.readyToConvertCount > 0 ? 'attention' : 'ready',
    label: queue.readyToConvertCount > 0
      ? `${queue.readyToConvertCount} released lead${queue.readyToConvertCount === 1 ? '' : 's'} ready`
      : 'No released leads ready',
    detail: queue.activeReleasedCount > 0
      ? `${queue.activeReleasedCount} released agency lead${queue.activeReleasedCount === 1 ? '' : 's'} awaiting conversion checks.`
      : 'Released agency leads will appear here after handover, before transaction conversion.',
  })
}
