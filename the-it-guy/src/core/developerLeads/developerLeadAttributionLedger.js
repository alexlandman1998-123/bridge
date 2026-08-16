export const DEVELOPER_LEAD_PHASE25_CONTRACT = 'developer-leads-phase25-attribution-ledger-v1'

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

function resolveAttributionType(lead = {}) {
  if (isAgencyIntroducedLead(lead)) return 'agency_introduced'
  if (normalizeText(lead.assignedAgentId)) return 'developer_assigned'
  return 'developer_direct'
}

function resolveCreditedAgentId(lead = {}) {
  return normalizeText(lead.sourceAgentUserId) || normalizeText(lead.assignedAgentId)
}

function resolveLedgerKey(lead = {}) {
  return [
    resolveAttributionType(lead),
    normalizeText(lead.sourceAgencyOrgId) || 'developer',
    resolveCreditedAgentId(lead) || 'unassigned',
    normalizeText(lead.primaryDevelopmentId) || 'unallocated',
  ].join('|')
}

function createLedgerRow(lead = {}) {
  const attributionType = resolveAttributionType(lead)
  return {
    contract: DEVELOPER_LEAD_PHASE25_CONTRACT,
    attributionType,
    ledgerKey: resolveLedgerKey(lead),
    sourceAgencyOrgId: normalizeText(lead.sourceAgencyOrgId),
    sourceAgentUserId: normalizeText(lead.sourceAgentUserId),
    assignedAgentId: normalizeText(lead.assignedAgentId),
    creditedAgentId: resolveCreditedAgentId(lead),
    primaryDevelopmentId: normalizeText(lead.primaryDevelopmentId),
    leadIds: [],
    totalLeads: 0,
    protectedCount: 0,
    handoverRequestedCount: 0,
    releasedCount: 0,
    qualifiedOrReservedCount: 0,
    convertedCount: 0,
    lostCount: 0,
    activeCount: 0,
    latestActivityAt: null,
  }
}

function updateLatestActivity(row, lead = {}) {
  const candidate = lead.convertedAt || lead.updatedAt || lead.createdAt || null
  if (!candidate) return
  if (!row.latestActivityAt || new Date(candidate) > new Date(row.latestActivityAt)) {
    row.latestActivityAt = candidate
  }
}

function finalizeRow(row) {
  const total = Math.max(1, row.totalLeads)
  return Object.freeze({
    ...row,
    leadIds: Object.freeze(row.leadIds),
    conversionRate: row.convertedCount / total,
    handoverRate: (row.handoverRequestedCount + row.releasedCount + row.convertedCount) / total,
    ledgerStatus: row.convertedCount > 0
      ? 'converted'
      : row.releasedCount > 0
        ? 'released'
        : row.handoverRequestedCount > 0
          ? 'handover_requested'
          : row.protectedCount > 0
            ? 'protected'
            : 'active',
  })
}

export function buildDeveloperLeadAttributionLedger(leads = []) {
  const rows = Array.isArray(leads) ? leads : []
  const grouped = new Map()

  for (const lead of rows) {
    const key = resolveLedgerKey(lead)
    if (!grouped.has(key)) grouped.set(key, createLedgerRow(lead))
    const row = grouped.get(key)
    const status = normalizeLower(lead.leadStatus) || 'new'
    const visibilityState = normalizeLower(lead.visibilityState)

    row.leadIds.push(normalizeText(lead.developerLeadId))
    row.totalLeads += 1
    row.protectedCount += visibilityState === 'limited' ? 1 : 0
    row.handoverRequestedCount += visibilityState === 'consent_pending' ? 1 : 0
    row.releasedCount += visibilityState === 'handed_over' && !isConvertedLead(lead) ? 1 : 0
    row.qualifiedOrReservedCount += ['qualified', 'reserved'].includes(status) ? 1 : 0
    row.convertedCount += isConvertedLead(lead) ? 1 : 0
    row.lostCount += status === 'lost' ? 1 : 0
    row.activeCount += ['converted', 'lost'].includes(status) ? 0 : 1
    updateLatestActivity(row, lead)
  }

  const ledgerRows = Array.from(grouped.values())
    .map(finalizeRow)
    .sort((left, right) => {
      if (right.convertedCount !== left.convertedCount) return right.convertedCount - left.convertedCount
      if (right.totalLeads !== left.totalLeads) return right.totalLeads - left.totalLeads
      return left.ledgerKey.localeCompare(right.ledgerKey)
    })

  const totalLeads = rows.length
  const convertedCount = rows.filter(isConvertedLead).length
  const agencyIntroducedCount = rows.filter(isAgencyIntroducedLead).length
  const developerOwnedCount = totalLeads - agencyIntroducedCount

  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE25_CONTRACT,
    totalLeads,
    ledgerRowCount: ledgerRows.length,
    agencyIntroducedCount,
    developerOwnedCount,
    convertedCount,
    conversionRate: totalLeads ? convertedCount / totalLeads : 0,
    rows: Object.freeze(ledgerRows),
  })
}

export function summarizeDeveloperLeadAttributionLedger(leads = []) {
  const ledger = buildDeveloperLeadAttributionLedger(leads)
  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE25_CONTRACT,
    status: ledger.ledgerRowCount > 0 ? 'attention' : 'ready',
    label: ledger.ledgerRowCount > 0
      ? `${ledger.ledgerRowCount} attribution lane${ledger.ledgerRowCount === 1 ? '' : 's'}`
      : 'No attribution lanes',
    detail: ledger.totalLeads > 0
      ? `${ledger.convertedCount} of ${ledger.totalLeads} developer lead${ledger.totalLeads === 1 ? '' : 's'} converted.`
      : 'Developer lead attribution will appear once leads are captured.',
  })
}
