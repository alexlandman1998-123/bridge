const DESTRUCTIVE_PATTERN = /\b(drop\s+table|drop\s+schema|truncate(?:\s+table)?|delete\s+from)\b/ig
const SECURITY_DEFINER_PATTERN = /\bsecurity\s+definer\b/i

function text(value) {
  return String(value ?? '')
}

function transactional(sql) {
  const normalized = text(sql)
    .replace(/^\s*--[^\n]*(?:\n|$)/gm, '')
    .trim()
    .toLowerCase()
  return normalized.startsWith('begin;') && normalized.endsWith('commit;')
}

export function assessRentalFoundationSqlSafetyReview({ sourceLock = {}, sources = [] } = {}) {
  const reviewedSources = Array.isArray(sources) ? sources : []
  const missingTransactionBoundaries = reviewedSources
    .filter((source) => !transactional(source.sql))
    .map((source) => source.path)
  const destructiveOperations = reviewedSources.flatMap((source) => (
    [...text(source.sql).matchAll(DESTRUCTIVE_PATTERN)].map((match) => ({ path: source.path, operation: match[1].toLowerCase() }))
  ))
  const securityDefinerFiles = reviewedSources
    .filter((source) => SECURITY_DEFINER_PATTERN.test(text(source.sql)))
    .map((source) => source.path)
  const staticChecksPass = missingTransactionBoundaries.length === 0 && destructiveOperations.length === 0
  const privilegedCodeReviewed = securityDefinerFiles.length === 0
  const safetyReviewPassed = staticChecksPass && privilegedCodeReviewed

  return {
    version: 'arch9_rental_foundation_sql_safety_review_phase7_v1',
    status: sourceLock.authoringAllowed && safetyReviewPassed
      ? 'READY_FOR_MANAGED_MIGRATION_PEER_REVIEW'
      : 'BLOCKED_PENDING_SQL_SAFETY_REVIEW',
    sourceCount: reviewedSources.length,
    missingTransactionBoundaries,
    destructiveOperations,
    securityDefinerFiles,
    staticChecksPass,
    privilegedCodeReviewed,
    safetyReviewPassed,
    authoringAllowed: sourceLock.authoringAllowed === true && safetyReviewPassed,
    applyAllowed: false,
    nextAction: securityDefinerFiles.length
      ? 'Replace SECURITY DEFINER functions with safe invoker alternatives where possible, or attach a separately reviewed least-privilege exception for each function.'
      : safetyReviewPassed
        ? 'Proceed to peer review only; database application remains separately controlled.'
        : 'Resolve transaction-boundary or destructive-operation findings before managed migration authoring.',
  }
}
