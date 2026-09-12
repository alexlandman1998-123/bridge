import { TRANSFER_TAX_CROSS_ROLE_AUDIENCES } from './transferTaxCrossRoleAssurance.js'

export const TRANSFER_TAX_PHASE8_REQUIRED_MIGRATIONS = Object.freeze([
  '20260910080011_transfer_tax_decision_phase2_reconciliation',
  '20260910080705_transfer_tax_conditional_workflow_phase3',
  '20260910092527_shared_journey_safe_tax_milestones',
  '20260910094209_transfer_tax_cross_role_safe_reader_phase7',
])

function text(value = '') {
  return String(value || '').trim()
}

function issue(code, remediation, details = {}) {
  return { code, remediation, ...details }
}

/**
 * Release-only decision. It performs no deployment and never treats an
 * unverified migration history as safe. Production promotion remains an
 * explicit operation after this gate returns READY_FOR_CONTROLLED_RELEASE.
 */
export function buildTransferTaxPhase8ReleaseGate({
  phase7Report = null,
  appliedMigrations = [],
  smokeChecks = [],
  environment = '',
  rollback = {},
} = {}) {
  const blockers = []
  const applied = new Set((Array.isArray(appliedMigrations) ? appliedMigrations : [])
    .map((migration) => text(typeof migration === 'string' ? migration : migration?.name || migration?.version)))
  const missingMigrations = TRANSFER_TAX_PHASE8_REQUIRED_MIGRATIONS.filter((migration) => !applied.has(migration))
  if (missingMigrations.length) blockers.push(issue(
    'MIGRATION_HISTORY_INCOMPLETE',
    'Apply and reconcile every required transfer-tax migration before promotion.',
    { missingMigrations },
  ))
  if (phase7Report?.ready !== true || phase7Report?.status !== 'ROLE_SYNC_READY') blockers.push(issue(
    'PHASE7_ROLE_ASSURANCE_FAILED',
    'Run the cross-role assurance suite successfully against the release candidate.',
  ))
  if (text(environment) !== 'production') blockers.push(issue(
    'PRODUCTION_TARGET_NOT_CONFIRMED',
    'Bind this gate to the production release target only after staging certification.',
  ))

  const roles = new Set((Array.isArray(smokeChecks) ? smokeChecks : [])
    .filter((check) => check?.passed === true && text(check?.evidencePath))
    .map((check) => text(check.role)))
  const missingRoleSmokes = TRANSFER_TAX_CROSS_ROLE_AUDIENCES.filter((role) => !roles.has(role))
  if (missingRoleSmokes.length) blockers.push(issue(
    'ROLE_SMOKE_INCOMPLETE',
    'Record a successful, evidenced smoke check for every affected role.',
    { missingRoleSmokes },
  ))
  if (rollback?.killSwitchVerified !== true || !text(rollback?.runbookPath) || !text(rollback?.owner)) blockers.push(issue(
    'ROLLBACK_NOT_READY',
    'Assign an owner and verify a kill switch and rollback runbook before controlled release.',
  ))

  return {
    contract: 'arch9-transfer-tax-phase8-release-gate-v1',
    status: blockers.length ? 'HOLD' : 'READY_FOR_CONTROLLED_RELEASE',
    releaseReady: blockers.length === 0,
    requiredMigrations: TRANSFER_TAX_PHASE8_REQUIRED_MIGRATIONS,
    blockers,
  }
}
