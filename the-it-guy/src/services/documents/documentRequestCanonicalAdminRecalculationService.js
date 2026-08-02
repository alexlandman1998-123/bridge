export const DOCUMENT_REQUEST_CANONICAL_ADMIN_RECALCULATION_VERSION =
  'document_request_phase8_admin_recalculation_v1'

export const DOCUMENT_REQUEST_CANONICAL_ADMIN_RECALCULATION_DEFAULT_MAX_TRANSACTIONS = 50

function normalizeTransactionId(value) {
  return String(value || '').trim()
}

function normalizeTransactionIds(transactionIds = []) {
  const values = Array.isArray(transactionIds) ? transactionIds : [transactionIds]
  return [...new Set(values.map(normalizeTransactionId).filter(Boolean))]
}

export function resolveCanonicalDocumentRequestRecalculationDryRun({ commit = false, dryRun = undefined } = {}) {
  if (dryRun === true) return true
  return commit !== true
}

export function buildCanonicalDocumentRequestRecalculationPlan({
  transactionIds = [],
  commit = false,
  dryRun = undefined,
  allowLargeBatch = false,
  maxTransactions = DOCUMENT_REQUEST_CANONICAL_ADMIN_RECALCULATION_DEFAULT_MAX_TRANSACTIONS,
} = {}) {
  const normalizedTransactionIds = normalizeTransactionIds(transactionIds)
  if (!normalizedTransactionIds.length) {
    throw new Error('At least one transaction id is required.')
  }

  if (
    allowLargeBatch !== true &&
    normalizedTransactionIds.length > maxTransactions
  ) {
    throw new Error(
      `Canonical document request recalculation is limited to ${maxTransactions} transactions per run.`,
    )
  }

  const resolvedDryRun = resolveCanonicalDocumentRequestRecalculationDryRun({ commit, dryRun })

  return {
    version: DOCUMENT_REQUEST_CANONICAL_ADMIN_RECALCULATION_VERSION,
    transactionIds: normalizedTransactionIds,
    total: normalizedTransactionIds.length,
    dryRun: resolvedDryRun,
    commit: commit === true && resolvedDryRun !== true,
    maxTransactions,
  }
}

function countRows(result = {}) {
  if (Array.isArray(result.rows)) return result.rows.length
  if (Array.isArray(result.persistedRows)) return result.persistedRows.length
  return Number(result.rows || result.rowCount || 0) || 0
}

function normalizeRecalculationResult({ transactionId, result = null, error = null } = {}) {
  if (error) {
    return {
      transactionId,
      ok: false,
      skipped: true,
      reason: 'sync_failed',
      error: error?.message || String(error),
      synced: 0,
      rows: 0,
      derivedAudience: '',
    }
  }

  return {
    transactionId,
    ok: true,
    skipped: result?.skipped === true,
    reason: result?.reason || null,
    synced: Number(result?.synced || 0) || 0,
    rows: countRows(result),
    derivedAudience: result?.derivedAudience || result?.audience || '',
    requestedAudience: result?.requestedAudience || '',
    pendingPolicySkipped: result?.skippedPendingPolicyKeys || [],
  }
}

export function summarizeCanonicalDocumentRequestRecalculation({
  plan,
  results = [],
} = {}) {
  const normalizedResults = results.map((result) => normalizeRecalculationResult(result))
  const failed = normalizedResults.filter((result) => result.ok !== true).length
  const skipped = normalizedResults.filter((result) => result.skipped === true).length

  return {
    version: DOCUMENT_REQUEST_CANONICAL_ADMIN_RECALCULATION_VERSION,
    dryRun: plan?.dryRun !== false,
    commit: plan?.commit === true,
    total: plan?.total || normalizedResults.length,
    completed: normalizedResults.length - failed,
    failed,
    skipped,
    synced: normalizedResults.reduce((total, result) => total + result.synced, 0),
    rows: normalizedResults.reduce((total, result) => total + result.rows, 0),
    results: normalizedResults,
  }
}

export async function runCanonicalDocumentRequestRecalculationBatch({
  transactionIds = [],
  syncTransaction,
  options = {},
} = {}) {
  if (typeof syncTransaction !== 'function') {
    throw new Error('A transaction sync function is required.')
  }

  const {
    commit = false,
    dryRun = undefined,
    allowLargeBatch = false,
    maxTransactions = DOCUMENT_REQUEST_CANONICAL_ADMIN_RECALCULATION_DEFAULT_MAX_TRANSACTIONS,
    ...syncOptions
  } = options || {}

  const plan = buildCanonicalDocumentRequestRecalculationPlan({
    transactionIds,
    commit,
    dryRun,
    allowLargeBatch,
    maxTransactions,
  })

  const results = []
  for (const transactionId of plan.transactionIds) {
    try {
      const result = await syncTransaction(transactionId, {
        ...syncOptions,
        dryRun: plan.dryRun,
      })
      results.push({ transactionId, result })
    } catch (error) {
      results.push({ transactionId, error })
    }
  }

  return summarizeCanonicalDocumentRequestRecalculation({ plan, results })
}
