export const DEVELOPER_LEAD_PHASE22_CONTRACT = 'developer-leads-phase22-agency-handover-release-v1'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function hasBuyerName(lead = {}) {
  return Boolean(normalizeText(lead.buyerFullName))
}

function hasBuyerContact(lead = {}) {
  return Boolean(normalizeText(lead.buyerEmail) || normalizeText(lead.buyerPhone))
}

function isAgencyIntroducedLead(lead = {}) {
  return lead.leadOwner === 'agency' || lead.ownershipModel === 'agency_introduced' || lead.accessProfile?.agencyFed === true
}

function resolveReleaseBlockers(lead = {}) {
  const blockers = []
  if (!normalizeText(lead.developerLeadId)) blockers.push('Lead id is missing.')
  if (!normalizeText(lead.developerOrgId)) blockers.push('Developer workspace is missing.')
  if (!normalizeText(lead.sourceAgencyOrgId)) blockers.push('Source agency workspace is missing.')
  if (!hasBuyerName(lead)) blockers.push('Buyer full name is missing.')
  if (!hasBuyerContact(lead)) blockers.push('Buyer email or phone is missing.')
  if (normalizeLower(lead.visibilityState) !== 'consent_pending') blockers.push('Developer has not requested handover yet.')
  return blockers
}

export function buildAgencyDeveloperLeadHandoverReleaseQueue(leads = []) {
  const rows = Array.isArray(leads) ? leads : []
  const agencyRows = rows.filter(isAgencyIntroducedLead)
  const requestedRows = agencyRows.filter((lead) => normalizeLower(lead.visibilityState) === 'consent_pending')
  const protectedRows = agencyRows.filter((lead) => normalizeLower(lead.visibilityState) === 'limited')
  const releasedRows = agencyRows.filter((lead) => normalizeLower(lead.visibilityState) === 'handed_over')

  const cards = requestedRows.map((lead) => {
    const blockers = resolveReleaseBlockers(lead)
    return Object.freeze({
      contract: DEVELOPER_LEAD_PHASE22_CONTRACT,
      developerLeadId: normalizeText(lead.developerLeadId),
      developerOrgId: normalizeText(lead.developerOrgId),
      sourceAgencyOrgId: normalizeText(lead.sourceAgencyOrgId),
      primaryDevelopmentId: normalizeText(lead.primaryDevelopmentId),
      preferredUnitId: normalizeText(lead.preferredUnitId),
      publicReference: normalizeText(lead.publicReference),
      buyerFullName: normalizeText(lead.buyerFullName),
      buyerEmail: normalizeText(lead.buyerEmail),
      buyerPhone: normalizeText(lead.buyerPhone),
      protectedSummary: normalizeText(lead.protectedSummary) || 'Agency-introduced buyer',
      unitTypeInterest: normalizeText(lead.unitTypeInterest) || 'Any unit',
      leadStatus: normalizeLower(lead.leadStatus) || 'new',
      visibilityState: normalizeLower(lead.visibilityState),
      consentRequestedAt: lead.consentRequestedAt || null,
      canRelease: blockers.length === 0,
      releaseBlockers: blockers,
      releaseAction: blockers.length === 0 ? 'release_buyer_details' : 'complete_private_details',
    })
  })

  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE22_CONTRACT,
    totalAgencyFed: agencyRows.length,
    requestedCount: requestedRows.length,
    readyToReleaseCount: cards.filter((card) => card.canRelease).length,
    blockedReleaseCount: cards.filter((card) => !card.canRelease).length,
    protectedCount: protectedRows.length,
    releasedCount: releasedRows.length,
    cards,
  })
}

export function summarizeAgencyDeveloperLeadHandoverReleaseQueue(leads = []) {
  const queue = buildAgencyDeveloperLeadHandoverReleaseQueue(leads)
  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE22_CONTRACT,
    status: queue.blockedReleaseCount > 0 ? 'blocked' : queue.readyToReleaseCount > 0 ? 'attention' : 'ready',
    label: queue.readyToReleaseCount > 0
      ? `${queue.readyToReleaseCount} handover${queue.readyToReleaseCount === 1 ? '' : 's'} ready`
      : 'No handovers waiting',
    detail: queue.requestedCount > 0
      ? `${queue.requestedCount} developer handover request${queue.requestedCount === 1 ? '' : 's'} in the agency queue.`
      : 'No developer handover requests are awaiting agency release.',
  })
}
