import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_CONTRACT,
  OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_PHASE20_VERSION,
  OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE,
  OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_STATUS,
  buildOtpControlledProductionActivationDryRunPhase20Audit,
  formatOtpControlledProductionActivationDryRunPhase20Markdown,
} from '../src/core/documents/otpControlledProductionActivationDryRunPhase20.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-controlled-production-activation-dry-run-phase20'],
  'node scripts/otp-controlled-production-activation-dry-run-phase20.test.mjs',
  'package.json should expose the OTP controlled production activation dry-run Phase 20 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-controlled-production-activation-dry-run-phase20'],
  'node scripts/report-otp-controlled-production-activation-dry-run-phase20.mjs',
  'package.json should expose the OTP Phase 20 controlled production activation dry-run report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-controlled-production-activation-dry-run-phase20'),
  'OTP vNext verification should include Phase 20 controlled production activation dry-run checks.',
)

assert.equal(OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_PHASE20_VERSION, 'otp_controlled_production_activation_dry_run_phase20_v1')
assert.equal(OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_STATUS, 'OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_FOR_PRODUCTION_ACTIVATION_RECEIPT')
assert.equal(OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_CONTRACT, 'otp-vnext-controlled-production-activation-dry-run-phase20-v1')

const audit = buildOtpControlledProductionActivationDryRunPhase20Audit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.version, OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_PHASE20_VERSION)
assert.equal(audit.contract, OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_CONTRACT)
assert.equal(audit.status, OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.canProceedToProductionActivationReceipt, true)
assert.equal(audit.productionPromotionPreflight.status, 'OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_FOR_CONTROLLED_PRODUCTION_ACTIVATION')
assert.equal(audit.activation.activationId, 'otp-vnext-controlled-production-activation-dry-run-2026-08-05')
assert.equal(audit.activation.mode, 'controlled_activation_dry_run')
assert.equal(audit.activation.targetEnvironment, 'production')
assert.equal(audit.activation.targetProjectRef, 'production-project-ref')
assert.ok(audit.activation.sourcePreflightFingerprint.startsWith('otp-prod-preflight:'))
assert.ok(audit.activation.activationFingerprint.startsWith('otp-prod-activation:'))
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.simulatedRouteCount, 2)
assert.equal(audit.summary.plannedOperationCount, 6)
assert.equal(audit.summary.executedOperationCount, 0)
assert.equal(audit.summary.unstoppedOperationCount, 0)
assert.equal(audit.summary.rollbackGapCount, 0)
assert.equal(audit.summary.targetConfirmed, true)
assert.equal(audit.summary.preflightFingerprintMatches, true)
assert.equal(audit.summary.lockFingerprintMatches, true)
assert.equal(audit.summary.approvalReferenceMatches, true)
assert.equal(audit.summary.runtimeWriteGuardLocked, true)
assert.equal(audit.summary.rollbackReady, true)
assert.equal(audit.summary.noProductionMutation, true)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

const resale = audit.routeRows.find((row) => row.routeKey === 'resale_existing_property')
const development = audit.routeRows.find((row) => row.routeKey === 'new_development')
assert.equal(resale.operationCount, 3)
assert.equal(resale.executedOperationCount, 0)
assert.equal(resale.unstoppedOperationCount, 0)
assert.equal(resale.rollbackGapCount, 0)
assert.equal(resale.pass, true)
assert.equal(development.operationCount, 3)
assert.equal(development.executedOperationCount, 0)
assert.equal(development.unstoppedOperationCount, 0)
assert.equal(development.rollbackGapCount, 0)
assert.equal(development.pass, true)

for (const check of [
  'PHASE20_PRODUCTION_PREFLIGHT_READY',
  'PHASE20_PRODUCTION_TARGET_STILL_CONFIRMED',
  'PHASE20_PREFLIGHT_AND_LOCK_BOUND',
  'PHASE20_RUNTIME_WRITE_GUARD_LOCKED',
  'PHASE20_ROLLBACK_CONTROLS_ARMED',
  'PHASE20_NO_PRODUCTION_MUTATION_PROVED',
  'PHASE20_STOP_BEFORE_LIVE_TEMPLATE_OR_ROUTE_DEFAULT',
  'PHASE20_BOTH_ROUTES_ACTIVATION_SIMULATED',
  'PHASE20_ROUTE_ACTIVATION_FINGERPRINTS_BOUND',
  'PHASE20_ROLLBACK_AVAILABLE_BEFORE_EACH_OPERATION',
  'PHASE20_ACTIVATION_FINGERPRINT_MATCHES',
  'PHASE20_AUDIT_EVENTS_PLANNED',
  'PHASE20_STOP_CONDITIONS_BOUND',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const wrongPreflight = buildOtpControlledProductionActivationDryRunPhase20Audit({
  activationEvidence: {
    ...OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE,
    sourcePreflightFingerprint: 'otp-prod-preflight:00000000:0',
  },
})
assert.equal(wrongPreflight.status, 'OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(wrongPreflight.checks.find((item) => item.code === 'PHASE20_PREFLIGHT_AND_LOCK_BOUND')?.pass, false)

const writeGuardUnlocked = buildOtpControlledProductionActivationDryRunPhase20Audit({
  activationEvidence: {
    ...OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE,
    runtimeWriteGuard: {
      ...OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE.runtimeWriteGuard,
      productionWritesEnabled: true,
    },
  },
})
assert.equal(writeGuardUnlocked.status, 'OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(writeGuardUnlocked.checks.find((item) => item.code === 'PHASE20_RUNTIME_WRITE_GUARD_LOCKED')?.pass, false)

const rollbackMissing = buildOtpControlledProductionActivationDryRunPhase20Audit({
  activationEvidence: {
    ...OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE,
    rollbackControls: {
      ...OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE.rollbackControls,
      rollbackPrearmed: false,
    },
  },
})
assert.equal(rollbackMissing.status, 'OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(rollbackMissing.checks.find((item) => item.code === 'PHASE20_ROLLBACK_CONTROLS_ARMED')?.pass, false)

const operationExecuted = buildOtpControlledProductionActivationDryRunPhase20Audit({
  activationEvidence: {
    ...OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE,
    operations: OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE.operations.map((operation, index) => index === 0
      ? { ...operation, executed: true, stoppedBeforeMutation: false }
      : operation),
  },
})
assert.equal(operationExecuted.status, 'OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(operationExecuted.checks.find((item) => item.code === 'PHASE20_STOP_BEFORE_LIVE_TEMPLATE_OR_ROUTE_DEFAULT')?.pass, false)
assert.equal(operationExecuted.checks.find((item) => item.code === 'PHASE20_NO_PRODUCTION_MUTATION_PROVED')?.pass, false)

const routeFingerprintMismatch = buildOtpControlledProductionActivationDryRunPhase20Audit({
  activationEvidence: {
    ...OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE,
    routes: OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE.routes.map((route) => route.routeKey === 'new_development'
      ? { ...route, routeFingerprint: 'otp-rc-route-new_development:00000000:0' }
      : route),
  },
})
assert.equal(routeFingerprintMismatch.status, 'OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(routeFingerprintMismatch.checks.find((item) => item.code === 'PHASE20_ROUTE_ACTIVATION_FINGERPRINTS_BOUND')?.pass, false)

const activationFingerprintMismatch = buildOtpControlledProductionActivationDryRunPhase20Audit({
  activationEvidence: {
    ...OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE,
    activationFingerprint: 'otp-prod-activation:00000000:0',
  },
})
assert.equal(activationFingerprintMismatch.status, 'OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(activationFingerprintMismatch.checks.find((item) => item.code === 'PHASE20_ACTIVATION_FINGERPRINT_MATCHES')?.pass, false)

const markdown = formatOtpControlledProductionActivationDryRunPhase20Markdown(audit)
for (const token of [
  'OTP Template vNext Phase 20 Controlled Production Activation Dry Run',
  'OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_FOR_PRODUCTION_ACTIVATION_RECEIPT',
  'PHASE20_STOP_BEFORE_LIVE_TEMPLATE_OR_ROUTE_DEFAULT',
  'production-project-ref',
  'otp-prod-activation:',
  'otp-vnext-production-promotion-rollback-2026-08-05',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpControlledProductionActivationDryRunPhase20.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_PHASE20_VERSION',
  'OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_EVIDENCE',
  'buildOtpProductionPromotionPreflightPhase19Audit',
  'controlled_activation_dry_run',
  'productionWritesEnabled: false',
  'live_template_write_attempted',
  'route_default_write_attempted',
  'rollback_controls_not_armed',
  'mutatedData: false',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP controlled production activation dry-run Phase 20 contract passed.')
