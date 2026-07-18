const BLOCKING_ISSUES = new Set([
  'promotion_missing',
  'promotion_target_mismatch',
  'promoted_document_missing',
  'promoted_status_mismatch',
  'transaction_canonical_link_missing',
  'transaction_canonical_context_mismatch',
  'approved_requirement_not_satisfied_in_transaction',
  'duplicate_transaction_seller_document',
  'approved_document_re_requested',
])

function normalize(value) {
  return String(value || '').trim().toLowerCase()
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

export function buildSellerDocumentTransactionContinuityReport(rows = [], {
  source = 'seller_document_transaction_continuity_v2',
  generatedAt = new Date().toISOString(),
} = {}) {
  const continuityRows = Array.isArray(rows) ? rows : []
  const blockedRows = continuityRows.filter((row) =>
    normalize(row.continuity_health) === 'blocked' || BLOCKING_ISSUES.has(normalize(row.continuity_issue)))
  const pendingRows = continuityRows.filter((row) =>
    !blockedRows.includes(row) && ['pending', 'attention'].includes(normalize(row.continuity_health)))
  const healthyRows = continuityRows.filter((row) => !blockedRows.includes(row) && !pendingRows.includes(row))
  const gateStatus = blockedRows.length ? 'blocked' : pendingRows.length || !continuityRows.length ? 'warning' : 'pass'

  return {
    version: 'seller_document_transaction_continuity_p0_6_v1',
    source,
    generatedAt,
    dryRun: true,
    summary: {
      documentCount: continuityRows.length,
      healthyCount: healthyRows.length,
      pendingCount: pendingRows.length,
      blockedCount: blockedRows.length,
      approvedSourceCount: continuityRows.filter((row) => ['approved', 'completed'].includes(normalize(row.source_status))).length,
      promotedCount: continuityRows.filter((row) => row.promoted_document_id).length,
      issueCounts: countBy(continuityRows.filter((row) => row.continuity_issue), 'continuity_issue'),
      actionCounts: countBy(continuityRows.filter((row) => row.required_action), 'required_action'),
    },
    gate: {
      status: gateStatus,
      releaseRecommended: gateStatus === 'pass',
      attorneyHandoffReady: gateStatus === 'pass',
      reason: blockedRows.length
        ? `${blockedRows.length} seller document promotion${blockedRows.length === 1 ? '' : 's'} break transaction or attorney continuity.`
        : pendingRows.length
          ? `${pendingRows.length} seller document${pendingRows.length === 1 ? '' : 's'} are waiting for a transaction or review completion.`
          : !continuityRows.length
            ? 'No seller document transaction-continuity rows are visible; verify the scoped transaction fixtures.'
            : 'Approved seller documents are transaction- and attorney-ready without duplicate requests.',
    },
    blockingDocumentIds: unique(blockedRows.map((row) => row.private_listing_document_id)),
    pendingDocumentIds: unique(pendingRows.map((row) => row.private_listing_document_id)),
    affectedTransactionIds: unique(blockedRows.map((row) => row.transaction_id || row.promoted_transaction_id)),
    rows: continuityRows,
  }
}

export { BLOCKING_ISSUES }
