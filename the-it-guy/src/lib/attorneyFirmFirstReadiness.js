const BLOCKING_ISSUES = new Set([
  'multiple_open_transfer_firm_allocations',
  'staff_assignment_open_before_firm_acceptance',
  'person_linked_before_internal_assignment',
  'staff_assigned_state_missing_primary_attorney',
  'active_matter_missing_firm_or_person_gate',
  'declined_firm_still_has_active_roleplayer',
])

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

export function buildAttorneyFirmFirstReadinessReport(rows = [], { source = 'transfer_firm_allocation_lifecycle_v2' } = {}) {
  const normalizedRows = Array.isArray(rows) ? rows : []
  const blockedRows = normalizedRows.filter((row) => normalize(row.lifecycle_health) === 'blocked' || BLOCKING_ISSUES.has(normalize(row.lifecycle_issue)))
  const attentionRows = normalizedRows.filter((row) => normalize(row.lifecycle_health) === 'attention' && !blockedRows.includes(row))
  const overdueRows = normalizedRows.filter((row) => ['firm_acceptance_sla_overdue', 'internal_assignment_sla_overdue'].includes(normalize(row.lifecycle_issue)))
  const issueCounts = countBy(normalizedRows.filter((row) => row.lifecycle_issue), 'lifecycle_issue')
  const requiredActionCounts = countBy(normalizedRows.filter((row) => row.required_action), 'required_action')
  const stateCounts = countBy(normalizedRows, 'allocation_state')
  const gateStatus = blockedRows.length ? 'blocked' : attentionRows.length || !normalizedRows.length ? 'warning' : 'pass'

  const actions = Object.entries(requiredActionCounts)
    .map(([key, count]) => ({ key, count, severity: key === 'nominate_replacement_firm' ? 'critical' : 'warning' }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))

  return {
    version: 'attorney_firm_first_release_readiness_v1',
    source,
    generatedAt: new Date().toISOString(),
    dryRun: true,
    summary: {
      transactionCount: normalizedRows.length,
      healthyCount: normalizedRows.length - blockedRows.length - attentionRows.length,
      attentionCount: attentionRows.length,
      blockedCount: blockedRows.length,
      overdueCount: overdueRows.length,
      replacementCount: normalizedRows.filter((row) => row.replaces_assignment_id).length,
      stateCounts,
      issueCounts,
      requiredActionCounts,
    },
    gate: {
      status: gateStatus,
      releaseRecommended: gateStatus === 'pass',
      reason: blockedRows.length
        ? `${blockedRows.length} blocking firm-first lifecycle issue${blockedRows.length === 1 ? '' : 's'} require manual reconciliation.`
        : attentionRows.length
          ? `${attentionRows.length} lifecycle warning${attentionRows.length === 1 ? '' : 's'} require review before broad rollout.`
          : !normalizedRows.length
            ? 'No firm-first transfer lifecycle rows are visible; validate the environment and pilot fixtures.'
            : 'Firm-first transfer allocation release checks passed.',
    },
    actions,
    blockingTransactions: blockedRows.map((row) => row.transaction_id).filter(Boolean),
    attentionTransactions: attentionRows.map((row) => row.transaction_id).filter(Boolean),
  }
}
