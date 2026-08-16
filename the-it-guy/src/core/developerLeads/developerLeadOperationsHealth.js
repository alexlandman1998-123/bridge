import { buildDeveloperLeadTransactionHandoff } from './developerLeadTransactionHandoff.js'

export const DEVELOPER_LEAD_PHASE26_CONTRACT = 'developer-leads-phase26-operations-health-v1'

const DEFAULT_STALE_AFTER_DAYS = 2
const DEFAULT_HANDOVER_SLA_DAYS = 1
const DEFAULT_CONVERSION_SLA_DAYS = 1

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysBetween(start, end) {
  const startDate = parseDate(start)
  const endDate = parseDate(end)
  if (!startDate || !endDate) return 0
  return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000))
}

function isAgencyIntroducedLead(lead = {}) {
  return lead.leadOwner === 'agency' || lead.ownershipModel === 'agency_introduced' || lead.accessProfile?.agencyFed === true
}

function isConvertedLead(lead = {}) {
  return Boolean(normalizeText(lead.convertedTransactionId)) || normalizeLower(lead.leadStatus) === 'converted'
}

function isClosedLead(lead = {}) {
  const status = normalizeLower(lead.leadStatus)
  return status === 'lost' || isConvertedLead(lead)
}

function latestOperationalDate(lead = {}) {
  return lead.updatedAt || lead.handoverRequestedAt || lead.handoverAcceptedAt || lead.createdAt || null
}

function leadDisplayName(lead = {}) {
  return normalizeText(lead.buyerFullName) ||
    normalizeText(lead.protectedSummary) ||
    normalizeText(lead.publicReference) ||
    normalizeText(lead.developerLeadId) ||
    'Developer lead'
}

function buildAlert({ type, severity, lead, message, checkedAt, ageDays = 0, handoff = null }) {
  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE26_CONTRACT,
    type,
    severity,
    developerLeadId: normalizeText(lead.developerLeadId),
    leadLabel: leadDisplayName(lead),
    leadStatus: normalizeLower(lead.leadStatus) || 'new',
    visibilityState: normalizeLower(lead.visibilityState) || 'full',
    primaryDevelopmentId: normalizeText(lead.primaryDevelopmentId),
    assignedAgentId: normalizeText(lead.assignedAgentId),
    sourceAgencyOrgId: normalizeText(lead.sourceAgencyOrgId),
    latestActivityAt: latestOperationalDate(lead),
    ageDays,
    message,
    handoffStatus: handoff?.status || null,
    handoffBlockers: Object.freeze((handoff?.blockers || []).map((blocker) => blocker.code)),
    checkedAt,
  })
}

function sortAlerts(left, right) {
  const severityRank = { blocker: 0, attention: 1, watch: 2 }
  const leftRank = severityRank[left.severity] ?? 9
  const rightRank = severityRank[right.severity] ?? 9
  if (leftRank !== rightRank) return leftRank - rightRank
  if (right.ageDays !== left.ageDays) return right.ageDays - left.ageDays
  return left.developerLeadId.localeCompare(right.developerLeadId)
}

export function buildDeveloperLeadOperationsHealth(leads = [], {
  checkedAt = new Date().toISOString(),
  staleAfterDays = DEFAULT_STALE_AFTER_DAYS,
  handoverSlaDays = DEFAULT_HANDOVER_SLA_DAYS,
  conversionSlaDays = DEFAULT_CONVERSION_SLA_DAYS,
} = {}) {
  const rows = Array.isArray(leads) ? leads : []
  const activeRows = rows.filter((lead) => !isClosedLead(lead))
  const alerts = []

  let agencyIntroducedCount = 0
  let developerOwnedCount = 0
  let unassignedCount = 0
  let unallocatedDevelopmentCount = 0
  let staleCount = 0
  let protectedAwaitingRequestCount = 0
  let handoverPendingCount = 0
  let releasedAwaitingConversionCount = 0
  let conversionBlockedCount = 0

  for (const lead of activeRows) {
    const agencyIntroduced = isAgencyIntroducedLead(lead)
    const visibilityState = normalizeLower(lead.visibilityState) || 'full'
    const leadStatus = normalizeLower(lead.leadStatus) || 'new'
    const latestDate = latestOperationalDate(lead)
    const activeAgeDays = daysBetween(latestDate, checkedAt)
    const handoff = buildDeveloperLeadTransactionHandoff(lead)
    let hasSpecificBlockingAlert = false

    agencyIntroducedCount += agencyIntroduced ? 1 : 0
    developerOwnedCount += agencyIntroduced ? 0 : 1

    if (!agencyIntroduced && !normalizeText(lead.assignedAgentId)) {
      unassignedCount += 1
      alerts.push(buildAlert({
        type: 'unassigned_developer_lead',
        severity: 'attention',
        lead,
        checkedAt,
        ageDays: activeAgeDays,
        message: 'Developer-owned lead has no assigned agent.',
        handoff,
      }))
    }

    if (!normalizeText(lead.primaryDevelopmentId)) {
      unallocatedDevelopmentCount += 1
      alerts.push(buildAlert({
        type: 'development_unallocated',
        severity: 'blocker',
        lead,
        checkedAt,
        ageDays: activeAgeDays,
        message: 'Lead is not allocated to a primary development.',
        handoff,
      }))
      hasSpecificBlockingAlert = true
    }

    if (activeAgeDays > staleAfterDays) {
      staleCount += 1
      alerts.push(buildAlert({
        type: 'stale_follow_up',
        severity: 'watch',
        lead,
        checkedAt,
        ageDays: activeAgeDays,
        message: `No visible lead movement for ${activeAgeDays} days.`,
        handoff,
      }))
    }

    if (agencyIntroduced && visibilityState === 'limited') {
      protectedAwaitingRequestCount += 1
      alerts.push(buildAlert({
        type: 'protected_handover_not_requested',
        severity: 'attention',
        lead,
        checkedAt,
        ageDays: activeAgeDays,
        message: 'Agency-fed lead is protected and handover has not been requested.',
        handoff,
      }))
    }

    if (agencyIntroduced && visibilityState === 'consent_pending') {
      handoverPendingCount += 1
      const pendingDays = daysBetween(lead.handoverRequestedAt || latestDate, checkedAt)
      if (pendingDays >= handoverSlaDays) {
        alerts.push(buildAlert({
          type: 'handover_sla_due',
          severity: 'attention',
          lead,
          checkedAt,
          ageDays: pendingDays,
          message: `Agency handover has been pending for ${pendingDays} days.`,
          handoff,
        }))
      }
    }

    if (agencyIntroduced && visibilityState === 'handed_over') {
      releasedAwaitingConversionCount += 1
      const releasedDays = daysBetween(lead.handoverAcceptedAt || latestDate, checkedAt)
      if (releasedDays >= conversionSlaDays) {
        alerts.push(buildAlert({
          type: 'released_conversion_due',
          severity: handoff.eligible ? 'attention' : 'blocker',
          lead,
          checkedAt,
          ageDays: releasedDays,
          message: handoff.eligible
            ? `Released buyer lead has been ready for conversion for ${releasedDays} days.`
            : 'Released buyer lead still has conversion blockers.',
          handoff,
        }))
        hasSpecificBlockingAlert = hasSpecificBlockingAlert || !handoff.eligible
      }
    }

    if (
      ['qualified', 'reserved'].includes(leadStatus) &&
      (!agencyIntroduced || visibilityState === 'handed_over') &&
      !handoff.eligible
    ) {
      conversionBlockedCount += 1
      if (!hasSpecificBlockingAlert) {
        alerts.push(buildAlert({
          type: 'conversion_blocked',
          severity: 'blocker',
          lead,
          checkedAt,
          ageDays: activeAgeDays,
          message: handoff.blockers[0]?.message || 'Qualified lead cannot be converted yet.',
          handoff,
        }))
      }
    }
  }

  const sortedAlerts = alerts.sort(sortAlerts)
  const blockerCount = sortedAlerts.filter((alert) => alert.severity === 'blocker').length
  const attentionCount = sortedAlerts.filter((alert) => alert.severity === 'attention').length
  const watchCount = sortedAlerts.filter((alert) => alert.severity === 'watch').length

  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE26_CONTRACT,
    checkedAt,
    totalLeads: rows.length,
    activeLeads: activeRows.length,
    agencyIntroducedCount,
    developerOwnedCount,
    unassignedCount,
    unallocatedDevelopmentCount,
    staleCount,
    protectedAwaitingRequestCount,
    handoverPendingCount,
    releasedAwaitingConversionCount,
    conversionBlockedCount,
    blockerCount,
    attentionCount,
    watchCount,
    status: blockerCount > 0 ? 'blocked' : attentionCount > 0 ? 'attention' : watchCount > 0 ? 'watch' : 'ready',
    alerts: Object.freeze(sortedAlerts),
  })
}

export function summarizeDeveloperLeadOperationsHealth(leads = [], options = {}) {
  const health = buildDeveloperLeadOperationsHealth(leads, options)
  return Object.freeze({
    contract: DEVELOPER_LEAD_PHASE26_CONTRACT,
    status: health.status,
    label: health.blockerCount > 0
      ? `${health.blockerCount} blocker${health.blockerCount === 1 ? '' : 's'}`
      : health.attentionCount > 0
        ? `${health.attentionCount} attention item${health.attentionCount === 1 ? '' : 's'}`
        : health.watchCount > 0
          ? `${health.watchCount} watch item${health.watchCount === 1 ? '' : 's'}`
          : 'Operations clear',
    detail: health.activeLeads > 0
      ? `${health.activeLeads} active lead${health.activeLeads === 1 ? '' : 's'} across developer and agency-fed lanes.`
      : 'No active developer leads need operational follow-up.',
  })
}
