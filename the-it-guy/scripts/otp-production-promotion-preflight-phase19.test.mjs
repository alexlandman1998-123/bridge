import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_PRODUCTION_PROMOTION_PREFLIGHT_CONTRACT,
  OTP_PRODUCTION_PROMOTION_PREFLIGHT_PHASE19_VERSION,
  OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE,
  OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_STATUS,
  buildOtpProductionPromotionPreflightPhase19Audit,
  formatOtpProductionPromotionPreflightPhase19Markdown,
} from '../src/core/documents/otpProductionPromotionPreflightPhase19.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-production-promotion-preflight-phase19'],
  'node scripts/otp-production-promotion-preflight-phase19.test.mjs',
  'package.json should expose the OTP production promotion preflight Phase 19 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-production-promotion-preflight-phase19'],
  'node scripts/report-otp-production-promotion-preflight-phase19.mjs',
  'package.json should expose the OTP Phase 19 production promotion preflight report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-production-promotion-preflight-phase19'),
  'OTP vNext verification should include Phase 19 production promotion preflight checks.',
)

assert.equal(OTP_PRODUCTION_PROMOTION_PREFLIGHT_PHASE19_VERSION, 'otp_production_promotion_preflight_phase19_v1')
assert.equal(OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_STATUS, 'OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_FOR_CONTROLLED_PRODUCTION_ACTIVATION')
assert.equal(OTP_PRODUCTION_PROMOTION_PREFLIGHT_CONTRACT, 'otp-vnext-production-promotion-preflight-phase19-v1')

const audit = buildOtpProductionPromotionPreflightPhase19Audit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.version, OTP_PRODUCTION_PROMOTION_PREFLIGHT_PHASE19_VERSION)
assert.equal(audit.contract, OTP_PRODUCTION_PROMOTION_PREFLIGHT_CONTRACT)
assert.equal(audit.status, OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.canProceedToControlledProductionActivation, true)
assert.equal(audit.releaseCandidateLock.status, 'OTP_RELEASE_CANDIDATE_LOCK_READY_FOR_PRODUCTION_PROMOTION_PREFLIGHT')
assert.equal(audit.preflight.preflightId, 'otp-vnext-production-promotion-preflight-2026-08-05')
assert.equal(audit.preflight.mode, 'no_write_dry_run')
assert.equal(audit.preflight.targetEnvironment, 'production')
assert.equal(audit.preflight.targetProjectRef, 'production-project-ref')
assert.ok(audit.preflight.sourceLockFingerprint.startsWith('otp-rc-lock:'))
assert.ok(audit.preflight.preflightFingerprint.startsWith('otp-prod-preflight:'))
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.preflightedRouteCount, 2)
assert.equal(audit.summary.targetConfirmed, true)
assert.equal(audit.summary.projectConfirmed, true)
assert.equal(audit.summary.approvalReferenceMatches, true)
assert.equal(audit.summary.lockFingerprintMatches, true)
assert.equal(audit.summary.runtimeFlagsSafe, true)
assert.equal(audit.summary.rollbackReady, true)
assert.equal(audit.summary.noWriteDryRun, true)
assert.equal(audit.summary.executedWriteCount, 0)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

const resale = audit.routeRows.find((row) => row.routeKey === 'resale_existing_property')
const development = audit.routeRows.find((row) => row.routeKey === 'new_development')
assert.equal(resale.targetEnvironment, 'production')
assert.equal(resale.targetProjectRef, 'production-project-ref')
assert.equal(resale.noWrite, true)
assert.equal(resale.pass, true)
assert.equal(development.targetEnvironment, 'production')
assert.equal(development.targetProjectRef, 'production-project-ref')
assert.equal(development.noWrite, true)
assert.equal(development.pass, true)

for (const check of [
  'PHASE19_RELEASE_CANDIDATE_LOCK_READY',
  'PHASE19_PRODUCTION_TARGET_CONFIRMED',
  'PHASE19_PROJECT_REF_CONFIRMED',
  'PHASE19_APPROVAL_REFERENCE_MATCHES_LOCK',
  'PHASE19_LOCK_FINGERPRINT_MATCHES',
  'PHASE19_RUNTIME_FLAGS_SAFE',
  'PHASE19_ROLLBACK_PLAN_BOUND',
  'PHASE19_NO_WRITE_DRY_RUN_PROVED',
  'PHASE19_BOTH_ROUTES_PREFLIGHTED',
  'PHASE19_ROUTE_FINGERPRINTS_BOUND',
  'PHASE19_PREFLIGHT_FINGERPRINT_MATCHES',
  'PHASE19_AUDIT_EVENTS_PLANNED',
  'PHASE19_STOP_CONDITIONS_BOUND',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const projectMismatch = buildOtpProductionPromotionPreflightPhase19Audit({
  preflightEvidence: {
    ...OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE,
    target: {
      ...OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE.target,
      confirmProjectRef: 'wrong-production-project-ref',
    },
  },
})
assert.equal(projectMismatch.status, 'OTP_PRODUCTION_PROMOTION_PREFLIGHT_REMEDIATION_REQUIRED')
assert.equal(projectMismatch.checks.find((item) => item.code === 'PHASE19_PROJECT_REF_CONFIRMED')?.pass, false)

const approvalMismatch = buildOtpProductionPromotionPreflightPhase19Audit({
  preflightEvidence: {
    ...OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE,
    approvalReference: 'wrong-approval-reference',
  },
})
assert.equal(approvalMismatch.status, 'OTP_PRODUCTION_PROMOTION_PREFLIGHT_REMEDIATION_REQUIRED')
assert.equal(approvalMismatch.checks.find((item) => item.code === 'PHASE19_APPROVAL_REFERENCE_MATCHES_LOCK')?.pass, false)

const lockFingerprintMismatch = buildOtpProductionPromotionPreflightPhase19Audit({
  preflightEvidence: {
    ...OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE,
    sourceLockFingerprint: 'otp-rc-lock:00000000:0',
  },
})
assert.equal(lockFingerprintMismatch.status, 'OTP_PRODUCTION_PROMOTION_PREFLIGHT_REMEDIATION_REQUIRED')
assert.equal(lockFingerprintMismatch.checks.find((item) => item.code === 'PHASE19_LOCK_FINGERPRINT_MATCHES')?.pass, false)

const unsafeRuntimeFlags = buildOtpProductionPromotionPreflightPhase19Audit({
  preflightEvidence: {
    ...OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE,
    runtimeFlags: {
      ...OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE.runtimeFlags,
      productionWritesEnabled: true,
    },
  },
})
assert.equal(unsafeRuntimeFlags.status, 'OTP_PRODUCTION_PROMOTION_PREFLIGHT_REMEDIATION_REQUIRED')
assert.equal(unsafeRuntimeFlags.checks.find((item) => item.code === 'PHASE19_RUNTIME_FLAGS_SAFE')?.pass, false)

const missingRollback = buildOtpProductionPromotionPreflightPhase19Audit({
  preflightEvidence: {
    ...OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE,
    rollbackPlan: {
      ...OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE.rollbackPlan,
      rehearsed: false,
    },
  },
})
assert.equal(missingRollback.status, 'OTP_PRODUCTION_PROMOTION_PREFLIGHT_REMEDIATION_REQUIRED')
assert.equal(missingRollback.checks.find((item) => item.code === 'PHASE19_ROLLBACK_PLAN_BOUND')?.pass, false)

const dryRunMutated = buildOtpProductionPromotionPreflightPhase19Audit({
  preflightEvidence: {
    ...OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE,
    dryRun: {
      ...OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE.dryRun,
      mutatedData: true,
      writeOperations: OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE.dryRun.writeOperations.map((operation, index) => index === 0
        ? { ...operation, executed: true }
        : operation),
    },
  },
})
assert.equal(dryRunMutated.status, 'OTP_PRODUCTION_PROMOTION_PREFLIGHT_REMEDIATION_REQUIRED')
assert.equal(dryRunMutated.checks.find((item) => item.code === 'PHASE19_NO_WRITE_DRY_RUN_PROVED')?.pass, false)

const markdown = formatOtpProductionPromotionPreflightPhase19Markdown(audit)
for (const token of [
  'OTP Template vNext Phase 19 Production Promotion Preflight',
  'OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_FOR_CONTROLLED_PRODUCTION_ACTIVATION',
  'PHASE19_NO_WRITE_DRY_RUN_PROVED',
  'production-project-ref',
  'otp-vnext-phase18-release-candidate-lock',
  'otp-prod-preflight:',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpProductionPromotionPreflightPhase19.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_PRODUCTION_PROMOTION_PREFLIGHT_PHASE19_VERSION',
  'OTP_PRODUCTION_PROMOTION_PREFLIGHT_READY_EVIDENCE',
  'buildOtpReleaseCandidateLockPhase18Audit',
  'productionWritesEnabled: false',
  'rollbackPlan',
  'no_write_dry_run',
  'release_candidate_lock_fingerprint_mismatch',
  'no_write_dry_run_mutated_data',
  'mutatedData: false',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP production promotion preflight Phase 19 contract passed.')
