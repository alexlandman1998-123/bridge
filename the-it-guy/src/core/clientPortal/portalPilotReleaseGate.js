import { TRANSACTION_JOURNEY_MATRIX_PHASE3_FIXTURE } from '../../services/transactionJourneyMatrixFixtureService.js'

export const PORTAL_PILOT_RELEASE_PHASE = 'phase5'

export const PORTAL_PILOT_BROWSER_ROLES = Object.freeze(['buyer', 'seller', 'agent', 'developer'])
export const PORTAL_PILOT_SYNC_ROLES = Object.freeze(Object.keys(TRANSACTION_JOURNEY_MATRIX_PHASE3_FIXTURE.rolePlayers))

const requiredBrowserChecks = Object.freeze(['desktopPassed', 'mobilePassed', 'primaryActionsPassed', 'recoveryPassed'])

function normalizedRole(row = {}) {
  return String(row.role || '').trim().toLowerCase()
}

function isCompleteBrowserWalkthrough(row = {}) {
  return requiredBrowserChecks.every((key) => row[key] === true)
}

function hasValidWarningOwner(warning = {}) {
  return Boolean(String(warning.owner || '').trim() && String(warning.dueDate || '').trim())
}

function hasValidSyncEvidence(row = {}) {
  return row.activitySynced === true && row.visibilityIsolated === true && row.refreshPersisted === true
}

/**
 * Converts a human portal rehearsal into a deliberately limited pilot decision.
 * This is pure/read-only: it neither changes portal access nor authorises a
 * production rollout. A clean result authorises only a small non-production
 * internal pilot after a named reviewer has supplied the evidence.
 */
export function buildPortalPilotReleaseGate({
  environment = 'unknown',
  transactionId = '',
  reviewedBy = '',
  reviewedAt = '',
  walkthroughs = [],
  syncEvidence = [],
  findings = [],
} = {}) {
  const blockers = []
  const normalizedEnvironment = String(environment || 'unknown').trim().toLowerCase()
  const walkthroughByRole = new Map(walkthroughs.map((row) => [normalizedRole(row), row]))
  const syncByRole = new Map(syncEvidence.map((row) => [normalizedRole(row), row]))

  if (normalizedEnvironment !== 'non-production') blockers.push('non_production_environment_required')
  if (!String(transactionId).trim()) blockers.push('transaction_id_required')
  if (!String(reviewedBy).trim()) blockers.push('reviewer_required')
  if (!String(reviewedAt).trim()) blockers.push('review_timestamp_required')

  for (const role of PORTAL_PILOT_BROWSER_ROLES) {
    const walkthrough = walkthroughByRole.get(role)
    if (!walkthrough) {
      blockers.push(`missing_${role}_walkthrough`)
      continue
    }
    if (!isCompleteBrowserWalkthrough(walkthrough)) blockers.push(`${role}_walkthrough_incomplete`)
    if (['buyer', 'seller'].includes(role) && walkthrough.uploadPassed !== true) blockers.push(`${role}_upload_not_verified`)
  }

  for (const role of PORTAL_PILOT_SYNC_ROLES) {
    if (!hasValidSyncEvidence(syncByRole.get(role))) blockers.push(`${role}_sync_or_visibility_unverified`)
  }

  const warnings = findings.filter((finding) => String(finding.severity || '').toLowerCase() === 'warning')
  const unresolvedBlockers = findings.filter((finding) => String(finding.severity || '').toLowerCase() === 'blocker')
  if (unresolvedBlockers.length) blockers.push('unresolved_rehearsal_blocker')
  if (warnings.some((warning) => !hasValidWarningOwner(warning))) blockers.push('warning_without_owner_or_due_date')

  const uniqueBlockers = Object.freeze([...new Set(blockers)])
  const ready = uniqueBlockers.length === 0

  return Object.freeze({
    phase: PORTAL_PILOT_RELEASE_PHASE,
    environment: normalizedEnvironment,
    transactionId: String(transactionId || '').trim() || null,
    checkedRoles: Object.freeze({ browser: PORTAL_PILOT_BROWSER_ROLES, sync: PORTAL_PILOT_SYNC_ROLES }),
    blockers: uniqueBlockers,
    warnings: Object.freeze(warnings),
    readyForInternalPilot: ready,
    productionReleaseAllowed: false,
    decision: ready ? 'ready_for_internal_pilot' : 'blocked',
    nextStep: ready
      ? 'Run the approved, limited internal pilot and retain this receipt with the Phase 4 screenshots.'
      : 'Resolve every blocker, refresh the Phase 4 evidence, and rerun this read-only gate.',
  })
}
