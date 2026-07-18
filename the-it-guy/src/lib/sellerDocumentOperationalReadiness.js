const BLOCKING_ISSUES = new Set([
  'false_completion',
  'cross_listing_document_link',
  'canonical_requirement_mismatch',
  'required_request_not_issued',
  'completed_onboarding_without_requirements',
])

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function countBy(rows = [], key = '') {
  return rows.reduce((counts, row) => {
    const value = normalize(row?.[key]) || 'unknown'
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

export function buildSellerDocumentOperationalReadinessReport(rows = [], {
  source = 'private_listing_seller_document_operational_readiness_v1',
  generatedAt = new Date().toISOString(),
} = {}) {
  const listingRows = Array.isArray(rows) ? rows : []
  const blockedRows = listingRows.filter((row) =>
    normalize(row.lifecycle_health) === 'blocked' ||
    BLOCKING_ISSUES.has(normalize(row.lifecycle_issue)) ||
    number(row.blocking_issue_count) > 0)
  const attentionRows = listingRows.filter((row) =>
    !blockedRows.includes(row) && (normalize(row.lifecycle_health) === 'attention' || number(row.attention_issue_count) > 0))
  const healthyRows = listingRows.filter((row) => !blockedRows.includes(row) && !attentionRows.includes(row))
  const gateStatus = blockedRows.length ? 'blocked' : attentionRows.length || !listingRows.length ? 'warning' : 'pass'

  const totals = listingRows.reduce((summary, row) => {
    summary.required += number(row.required_count)
    summary.satisfied += number(row.satisfied_count)
    summary.receivedPendingApproval += number(row.received_pending_approval_count)
    summary.missing += number(row.missing_count)
    summary.rejected += number(row.rejected_count)
    summary.overdue += number(row.overdue_count)
    summary.unissued += number(row.unissued_request_count)
    summary.falseCompletions += number(row.false_completion_count)
    summary.crossListingLinks += number(row.cross_listing_link_count)
    summary.canonicalMismatches += number(row.canonical_mismatch_count)
    return summary
  }, {
    required: 0,
    satisfied: 0,
    receivedPendingApproval: 0,
    missing: 0,
    rejected: 0,
    overdue: 0,
    unissued: 0,
    falseCompletions: 0,
    crossListingLinks: 0,
    canonicalMismatches: 0,
  })

  return {
    version: 'seller_document_operational_readiness_p0_5_v1',
    source,
    generatedAt,
    dryRun: true,
    summary: {
      listingCount: listingRows.length,
      healthyCount: healthyRows.length,
      attentionCount: attentionRows.length,
      blockedCount: blockedRows.length,
      ...totals,
      lifecycleHealthCounts: countBy(listingRows, 'lifecycle_health'),
      lifecycleIssueCounts: countBy(listingRows.filter((row) => row.lifecycle_issue), 'lifecycle_issue'),
      requiredActionCounts: countBy(listingRows.filter((row) => row.required_action), 'required_action'),
    },
    gate: {
      status: gateStatus,
      releaseRecommended: gateStatus === 'pass',
      reason: blockedRows.length
        ? `${blockedRows.length} seller document file${blockedRows.length === 1 ? '' : 's'} have integrity or issuance blockers.`
        : attentionRows.length
          ? `${attentionRows.length} seller document file${attentionRows.length === 1 ? '' : 's'} need operational attention before broad rollout.`
          : !listingRows.length
            ? 'No seller document readiness rows are visible; verify the environment, access scope and pilot data.'
            : 'Seller document automation release checks passed.',
    },
    blockingListingIds: unique(blockedRows.map((row) => row.private_listing_id || row.listing_id)),
    attentionListingIds: unique(attentionRows.map((row) => row.private_listing_id || row.listing_id)),
    actions: Object.entries(countBy(listingRows.filter((row) => row.required_action), 'required_action'))
      .map(([key, count]) => ({ key, count, severity: BLOCKING_ISSUES.has(key) ? 'critical' : 'warning' }))
      .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key)),
    rows: listingRows,
  }
}

export { BLOCKING_ISSUES }
