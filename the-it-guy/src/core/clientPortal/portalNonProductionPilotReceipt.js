import { PORTAL_PILOT_BROWSER_ROLES, PORTAL_PILOT_SYNC_ROLES } from './portalPilotReleaseGate.js'

export const PORTAL_NON_PRODUCTION_PILOT_PHASE = 'phase6'

function roleKey(row = {}) {
  return String(row.role || '').trim().toLowerCase()
}

function hasText(value) {
  return Boolean(String(value || '').trim())
}

function hasCompleteBrowserEvidence(row = {}) {
  return row.passed === true && hasText(row.desktopScreenshot) && hasText(row.mobileScreenshot) && hasText(row.observedAt)
}

function hasCompleteSyncEvidence(row = {}) {
  return row.passed === true && hasText(row.evidenceReference) && hasText(row.observedAt)
}

/**
 * Validates the evidence captured during a single, non-production portal pilot.
 * The function is intentionally local and read-only; it does not create users,
 * transactions, access links, uploads, or release access.
 */
export function buildPortalNonProductionPilotReceipt({
  phase5Gate = {},
  pilot = {},
  browserEvidence = [],
  syncEvidence = [],
  incident = {},
} = {}) {
  const blockers = []
  const browserByRole = new Map(browserEvidence.map((row) => [roleKey(row), row]))
  const syncByRole = new Map(syncEvidence.map((row) => [roleKey(row), row]))

  if (phase5Gate?.decision !== 'ready_for_internal_pilot' || phase5Gate?.readyForInternalPilot !== true) {
    blockers.push('phase5_internal_pilot_gate_not_ready')
  }
  if (String(pilot.environment || '').trim().toLowerCase() !== 'non-production') blockers.push('non_production_environment_required')
  if (!hasText(pilot.transactionId)) blockers.push('transaction_id_required')
  if (pilot.testDataConfirmed !== true) blockers.push('test_data_confirmation_required')
  if (pilot.maxTransactions !== 1) blockers.push('single_transaction_limit_required')
  if (!hasText(pilot.operator) || !hasText(pilot.startedAt) || !hasText(pilot.completedAt)) blockers.push('pilot_accountability_or_timing_missing')
  if (pilot.stopCriteriaConfirmed !== true || !hasText(pilot.rollbackOwner)) blockers.push('stop_or_rollback_control_missing')

  for (const role of PORTAL_PILOT_BROWSER_ROLES) {
    if (!hasCompleteBrowserEvidence(browserByRole.get(role))) blockers.push(`${role}_browser_evidence_incomplete`)
  }
  for (const role of PORTAL_PILOT_SYNC_ROLES) {
    if (!hasCompleteSyncEvidence(syncByRole.get(role))) blockers.push(`${role}_sync_evidence_incomplete`)
  }

  if (incident.open === true) blockers.push('open_pilot_incident')
  if (incident.open === false && !hasText(incident.summary)) blockers.push('incident_summary_required')

  const uniqueBlockers = Object.freeze([...new Set(blockers)])
  const passed = uniqueBlockers.length === 0
  return Object.freeze({
    phase: PORTAL_NON_PRODUCTION_PILOT_PHASE,
    transactionId: hasText(pilot.transactionId) ? String(pilot.transactionId).trim() : null,
    environment: String(pilot.environment || '').trim().toLowerCase() || 'unknown',
    pilotLimit: Object.freeze({ maxTransactions: pilot.maxTransactions ?? null, testDataOnly: pilot.testDataConfirmed === true }),
    checkedRoles: Object.freeze({ browser: PORTAL_PILOT_BROWSER_ROLES, sync: PORTAL_PILOT_SYNC_ROLES }),
    blockers: uniqueBlockers,
    passed,
    decision: passed ? 'non_production_pilot_evidence_recorded' : 'blocked',
    productionReleaseAllowed: false,
    nextStep: passed
      ? 'Review the receipt and decide whether to prepare a separately authorised, limited live pilot.'
      : 'Do not proceed. Resolve the listed evidence or safety controls and rerun the non-production pilot.',
  })
}
