const BLOCKING_ISSUES = new Set([
  'multiple_open_transfer_firm_allocations',
  'staff_assignment_open_before_firm_acceptance',
  'person_linked_before_internal_assignment',
  'staff_assigned_state_missing_primary_attorney',
  'active_matter_missing_firm_or_person_gate',
  'declined_firm_still_has_active_roleplayer',
])

export const ATTORNEY_FIRM_FIRST_LIFECYCLE_VIEW = 'transfer_firm_allocation_lifecycle_v2'
export const ATTORNEY_FIRM_FIRST_RELEASE_READINESS_VIEW = 'transfer_firm_allocation_release_readiness_v1'
export const ATTORNEY_FIRM_FIRST_RECONCILIATION_VIEW = 'transfer_firm_allocation_reconciliation_candidates_v1'

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = normalize(row?.[key]) || 'unknown'
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

function normalizeReleaseRow(row = {}) {
  return {
    organisationId: row.organisation_id || row.organisationId || '',
    transactionCount: Number(row.transaction_count ?? row.transactionCount ?? 0) || 0,
    healthyCount: Number(row.healthy_count ?? row.healthyCount ?? 0) || 0,
    attentionCount: Number(row.attention_count ?? row.attentionCount ?? 0) || 0,
    blockedCount: Number(row.blocked_count ?? row.blockedCount ?? 0) || 0,
    firmAcceptanceOverdueCount: Number(row.firm_acceptance_overdue_count ?? row.firmAcceptanceOverdueCount ?? 0) || 0,
    internalAssignmentOverdueCount: Number(row.internal_assignment_overdue_count ?? row.internalAssignmentOverdueCount ?? 0) || 0,
    awaitingFirmAcceptanceCount: Number(row.awaiting_firm_acceptance_count ?? row.awaitingFirmAcceptanceCount ?? 0) || 0,
    awaitingStaffAssignmentCount: Number(row.awaiting_staff_assignment_count ?? row.awaitingStaffAssignmentCount ?? 0) || 0,
    staffAssignedCount: Number(row.staff_assigned_count ?? row.staffAssignedCount ?? 0) || 0,
    activeCount: Number(row.active_count ?? row.activeCount ?? 0) || 0,
    declinedCount: Number(row.declined_count ?? row.declinedCount ?? 0) || 0,
    replacementCount: Number(row.replacement_count ?? row.replacementCount ?? 0) || 0,
    rolloutStatus: normalize(row.rollout_status || row.rolloutStatus),
    lastLifecycleUpdate: row.last_lifecycle_update || row.lastLifecycleUpdate || null,
  }
}

function normalizeReconciliationCandidate(row = {}) {
  return {
    transactionId: row.transaction_id || row.transactionId || '',
    organisationId: row.organisation_id || row.organisationId || '',
    assignmentId: row.assignment_id || row.assignmentId || '',
    attorneyFirmId: row.attorney_firm_id || row.attorneyFirmId || '',
    allocationState: normalize(row.allocation_state || row.allocationState),
    lifecycleHealth: normalize(row.lifecycle_health || row.lifecycleHealth),
    lifecycleIssue: normalize(row.lifecycle_issue || row.lifecycleIssue),
    requiredAction: normalize(row.required_action || row.requiredAction),
    hoursInAllocationState: Number(row.hours_in_allocation_state ?? row.hoursInAllocationState ?? 0) || 0,
    recommendedResolution: row.recommended_resolution || row.recommendedResolution || '',
    automaticRepairAllowed: row.automatic_repair_allowed === true || row.automaticRepairAllowed === true,
    replacesAssignmentId: row.replaces_assignment_id || row.replacesAssignmentId || null,
    replacementSequence: Number(row.replacement_sequence ?? row.replacementSequence ?? 0) || 0,
    lifecycleUpdatedAt: row.lifecycle_updated_at || row.lifecycleUpdatedAt || null,
  }
}

function aggregateReleaseRows(rows = []) {
  const normalizedRows = rows.map(normalizeReleaseRow)
  if (!normalizedRows.length) return null
  const blockedCount = normalizedRows.reduce((sum, row) => sum + row.blockedCount, 0)
  const attentionCount = normalizedRows.reduce((sum, row) => sum + row.attentionCount, 0)
  return {
    rows: normalizedRows,
    transactionCount: normalizedRows.reduce((sum, row) => sum + row.transactionCount, 0),
    healthyCount: normalizedRows.reduce((sum, row) => sum + row.healthyCount, 0),
    attentionCount,
    blockedCount,
    overdueCount: normalizedRows.reduce((sum, row) => sum + row.firmAcceptanceOverdueCount + row.internalAssignmentOverdueCount, 0),
    replacementCount: normalizedRows.reduce((sum, row) => sum + row.replacementCount, 0),
    rolloutStatus: blockedCount ? 'blocked' : attentionCount ? 'warning' : 'pass',
  }
}

export function buildAttorneyFirmFirstReadinessReport(
  rows = [],
  {
    source = ATTORNEY_FIRM_FIRST_LIFECYCLE_VIEW,
    releaseReadinessRows = [],
    reconciliationCandidates = [],
  } = {},
) {
  const normalizedRows = Array.isArray(rows) ? rows : []
  const blockedRows = normalizedRows.filter((row) => normalize(row.lifecycle_health) === 'blocked' || BLOCKING_ISSUES.has(normalize(row.lifecycle_issue)))
  const attentionRows = normalizedRows.filter((row) => normalize(row.lifecycle_health) === 'attention' && !blockedRows.includes(row))
  const overdueRows = normalizedRows.filter((row) => ['firm_acceptance_sla_overdue', 'internal_assignment_sla_overdue'].includes(normalize(row.lifecycle_issue)))
  const issueCounts = countBy(normalizedRows.filter((row) => row.lifecycle_issue), 'lifecycle_issue')
  const requiredActionCounts = countBy(normalizedRows.filter((row) => row.required_action), 'required_action')
  const stateCounts = countBy(normalizedRows, 'allocation_state')
  const releaseSummary = aggregateReleaseRows(Array.isArray(releaseReadinessRows) ? releaseReadinessRows : [])
  const normalizedCandidates = (Array.isArray(reconciliationCandidates) ? reconciliationCandidates : [])
    .map(normalizeReconciliationCandidate)
  const gateStatus = releaseSummary?.rolloutStatus ||
    (blockedRows.length ? 'blocked' : attentionRows.length || !normalizedRows.length ? 'warning' : 'pass')

  const actions = Object.entries(requiredActionCounts)
    .map(([key, count]) => ({ key, count, severity: key === 'nominate_replacement_firm' ? 'critical' : 'warning' }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
  for (const candidate of normalizedCandidates) {
    if (!candidate.requiredAction || actions.some((action) => action.key === candidate.requiredAction)) continue
    actions.push({
      key: candidate.requiredAction,
      count: 1,
      severity: BLOCKING_ISSUES.has(candidate.lifecycleIssue) ? 'critical' : 'warning',
    })
  }

  return {
    version: 'attorney_firm_first_release_readiness_v1',
    source,
    generatedAt: new Date().toISOString(),
    dryRun: true,
    summary: {
      transactionCount: releaseSummary?.transactionCount ?? normalizedRows.length,
      healthyCount: releaseSummary?.healthyCount ?? normalizedRows.length - blockedRows.length - attentionRows.length,
      attentionCount: releaseSummary?.attentionCount ?? attentionRows.length,
      blockedCount: releaseSummary?.blockedCount ?? blockedRows.length,
      overdueCount: releaseSummary?.overdueCount ?? overdueRows.length,
      replacementCount: releaseSummary?.replacementCount ?? normalizedRows.filter((row) => row.replaces_assignment_id).length,
      stateCounts,
      issueCounts,
      requiredActionCounts,
    },
    releaseReadiness: releaseSummary?.rows || [],
    reconciliationCandidates: normalizedCandidates,
    gate: {
      status: gateStatus,
      releaseRecommended: gateStatus === 'pass',
      reason: blockedRows.length
        ? `${blockedRows.length} blocking firm-first lifecycle issue${blockedRows.length === 1 ? '' : 's'} require manual reconciliation.`
        : releaseSummary?.blockedCount
          ? `${releaseSummary.blockedCount} blocking firm-first lifecycle issue${releaseSummary.blockedCount === 1 ? '' : 's'} require manual reconciliation.`
        : attentionRows.length
          ? `${attentionRows.length} lifecycle warning${attentionRows.length === 1 ? '' : 's'} require review before broad rollout.`
          : releaseSummary?.attentionCount
            ? `${releaseSummary.attentionCount} lifecycle warning${releaseSummary.attentionCount === 1 ? '' : 's'} require review before broad rollout.`
          : !normalizedRows.length && !releaseSummary?.transactionCount
            ? 'No firm-first transfer lifecycle rows are visible; validate the environment and pilot fixtures.'
            : 'Firm-first transfer allocation release checks passed.',
    },
    actions,
    blockingTransactions: blockedRows.map((row) => row.transaction_id).filter(Boolean),
    attentionTransactions: attentionRows.map((row) => row.transaction_id).filter(Boolean),
  }
}
