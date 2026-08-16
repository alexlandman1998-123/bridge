export const DEVELOPER_LEAD_PHASE24_CONTRACT = 'developer-leads-phase24-agency-conversion-receipts-v1'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function isAgencyIntroducedLead(lead = {}) {
  return lead.leadOwner === 'agency' || lead.ownershipModel === 'agency_introduced' || lead.accessProfile?.agencyFed === true
}

function isConvertedLead(lead = {}) {
  return normalizeLower(lead.leadStatus) === 'converted'
}

function isReleasedLead(lead = {}) {
  return normalizeLower(lead.visibilityState) === 'handed_over'
}

function formatReceiptReference(transactionId = '') {
  const normalized = normalizeText(transactionId)
  if (!normalized) return 'Transaction created'
  return `Transaction ...${normalized.slice(-8)}`
}

export function buildAgencyDeveloperLeadConversionReceiptQueue(leads = []) {
  const rows = Array.isArray(leads) ? leads : []
  const agencyRows = rows.filter(isAgencyIntroducedLead)
  const convertedRows = agencyRows.filter(isConvertedLead)
  const releasedRows = agencyRows.filter((lead) => isReleasedLead(lead) && !isConvertedLead(lead))
  const protectedRows = agencyRows.filter((lead) => !isReleasedLead(lead) && !isConvertedLead(lead))

  const cards = convertedRows.map((lead) => {
    const convertedTransactionId = normalizeText(lead.convertedTransactionId)
    return Object.freeze({
      contract: DEVELOPER_LEAD_PHASE24_CONTRACT,
      developerLeadId: normalizeText(lead.developerLeadId),
      developerOrgId: normalizeText(lead.developerOrgId),
      sourceAgencyOrgId: normalizeText(lead.sourceAgencyOrgId),
      sourceAgentUserId: normalizeText(lead.sourceAgentUserId),
      primaryDevelopmentId: normalizeText(lead.primaryDevelopmentId),
      preferredUnitId: normalizeText(lead.preferredUnitId),
      buyerFullName: normalizeText(lead.buyerFullName) || 'Buyer',
      buyerEmail: normalizeLower(lead.buyerEmail),
      buyerPhone: normalizeText(lead.buyerPhone),
      protectedSummary: normalizeText(lead.protectedSummary) || 'Agency-introduced buyer',
      leadStatus: 'converted',
      visibilityState: normalizeLower(lead.visibilityState) || 'handed_over',
      convertedAt: lead.convertedAt || null,
      convertedTransactionId,
      transactionReceipt: formatReceiptReference(convertedTransactionId),
      receiptStatus: convertedTransactionId ? 'transaction_created' : 'converted_without_reference',
      receiptLabel: convertedTransactionId ? 'Developer transaction created' : 'Converted',
      agencyCanOpenTransaction: false,
      onboardingLinkVisible: false,
    })
  })

  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE24_CONTRACT,
    totalAgencyFed: agencyRows.length,
    convertedCount: convertedRows.length,
    releasedAwaitingConversionCount: releasedRows.length,
    protectedOrPendingCount: protectedRows.length,
    cards,
  })
}

export function summarizeAgencyDeveloperLeadConversionReceiptQueue(leads = []) {
  const queue = buildAgencyDeveloperLeadConversionReceiptQueue(leads)
  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE24_CONTRACT,
    status: queue.convertedCount > 0 ? 'attention' : 'ready',
    label: queue.convertedCount > 0
      ? `${queue.convertedCount} converted lead${queue.convertedCount === 1 ? '' : 's'}`
      : 'No conversion receipts',
    detail: queue.convertedCount > 0
      ? 'Converted agency-introduced leads are visible as receipts without transaction workspace access.'
      : 'Conversion receipts will appear here after the developer converts a released lead.',
  })
}
