import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildOtpControlledVersionRenewalActivationDryRunPhase48Audit,
} from '../src/core/documents/otpControlledVersionRenewalActivationDryRunPhase48.js'
import {
  buildOtpVersionRenewalActivationReceiptPhase49Audit,
} from '../src/core/documents/otpVersionRenewalActivationReceiptPhase49.js'
import {
  OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_READY_STATUS,
  buildOtpVersionRenewalLiveWriteGuardPhase50Audit,
} from '../src/core/documents/otpVersionRenewalLiveWriteGuardPhase50.js'
import {
  OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_CONTRACT,
  OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_PHASE51_VERSION,
  OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_READY_STATUS,
  buildOtpControlledVersionRenewalApplyDryRunPhase51Audit,
  buildOtpControlledVersionRenewalApplyDryRunReceipt,
  formatOtpControlledVersionRenewalApplyDryRunPhase51Markdown,
} from '../src/core/documents/otpControlledVersionRenewalApplyDryRunPhase51.js'

const checkedAt = '2026-08-06T09:45:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase51Source = await readFile(new URL('../src/core/documents/otpControlledVersionRenewalApplyDryRunPhase51.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-controlled-version-renewal-apply-dry-run-phase51'],
  'node scripts/otp-controlled-version-renewal-apply-dry-run-phase51.test.mjs',
  'package.json should expose the OTP controlled version renewal apply dry-run Phase 51 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-controlled-version-renewal-apply-dry-run-phase51'],
  'node scripts/report-otp-controlled-version-renewal-apply-dry-run-phase51.mjs',
  'package.json should expose the OTP controlled version renewal apply dry-run Phase 51 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-controlled-version-renewal-apply-dry-run-phase51'),
  'OTP vNext verification should include Phase 51 controlled version renewal apply dry-run.',
)

assert.equal(OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_PHASE51_VERSION, 'otp_controlled_version_renewal_apply_dry_run_phase51_v1')
assert.equal(OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_CONTRACT, 'otp-vnext-controlled-version-renewal-apply-dry-run-phase51-v1')
assert.equal(OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_READY_STATUS, 'OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_READY_FOR_APPLY_RECEIPT')

for (const token of [
  'PHASE51_BLOCKED_PHASE50_GUARD_REJECTED',
  'PHASE51_ROUTE_APPLY_MISMATCH_BLOCKED',
  'PHASE51_VERSION_POINTER_MISMATCH_BLOCKED',
  'PHASE51_LIVE_MUTATION_BLOCKED',
  'PHASE51_MISSING_AUDIT_EVENT_BLOCKED',
  'controlled_version_renewal_apply_dry_run',
  'apply_dry_run_stopped_before_live_write',
]) {
  assert.ok(phase51Source.includes(token), `phase51 source should include ${token}`)
}

const phase48Audit = buildOtpControlledVersionRenewalActivationDryRunPhase48Audit({
  checkedAt,
  packageJson,
})
const phase49Audit = buildOtpVersionRenewalActivationReceiptPhase49Audit({
  checkedAt,
  phase48Audit,
  packageJson,
})
const phase50Audit = buildOtpVersionRenewalLiveWriteGuardPhase50Audit({
  checkedAt,
  phase49Audit,
  packageJson,
})
assert.equal(phase50Audit.status, OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_READY_STATUS)

const audit = buildOtpControlledVersionRenewalApplyDryRunPhase51Audit({
  checkedAt,
  phase50Audit,
  packageJson,
})

assert.equal(audit.version, OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_PHASE51_VERSION)
assert.equal(audit.contract, OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_CONTRACT)
assert.equal(audit.status, OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.canProceedToApplyReceipt, true)
assert.equal(audit.nextPhase.phase, 52)
assert.equal(audit.nextPhase.key, 'otp_version_renewal_apply_receipt')
assert.equal(audit.mutatedData, false)

for (const check of [
  'PHASE51_PHASE50_LIVE_WRITE_GUARD_READY',
  'PHASE51_GOOD_CONTROLLED_APPLY_DRY_RUN_READY',
  'PHASE51_RESALE_AND_NEW_DEVELOPMENT_APPLY_SIMULATED',
  'PHASE51_VERSION_POINTER_APPLY_SIMULATED',
  'PHASE51_NO_LIVE_WRITE_OR_POINTER_MUTATION',
  'PHASE51_BLOCKED_PHASE50_GUARD_REJECTED',
  'PHASE51_OPERATION_MISMATCH_BLOCKED',
  'PHASE51_MISSING_ROUTE_BLOCKED',
  'PHASE51_ROUTE_APPLY_MISMATCH_BLOCKED',
  'PHASE51_VERSION_POINTER_MISMATCH_BLOCKED',
  'PHASE51_LIVE_MUTATION_BLOCKED',
  'PHASE51_POST_VALIDATION_BLOCKED',
  'PHASE51_ROLLBACK_PREVIEW_BLOCKED',
  'PHASE51_MISSING_EVIDENCE_BLOCKED',
  'PHASE51_MISSING_AUDIT_EVENT_BLOCKED',
  'PHASE51_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodGuard = phase50Audit.guardReceipts.find((receipt) => receipt.canProceedToControlledApplyDryRun)
const blockedReceipt = buildOtpControlledVersionRenewalApplyDryRunReceipt({
  checkedAt,
  guardReceipt: goodGuard,
  applyPlan: {
    applyDryRunId: '',
    sourceGuardId: 'wrong-guard',
    sourceGuardFingerprint: 'wrong-fingerprint',
    sourceReceiptId: 'wrong-receipt',
    sourceReceiptFingerprint: 'wrong-receipt-fingerprint',
    operationType: 'manual_apply',
    targetEnvironment: 'staging',
    previousVersionKey: 'wrong-previous',
    targetVersionKey: 'wrong-target',
    rollbackPlanReference: 'wrong-rollback',
    operator: 'wrong-operator',
    dryRunOnly: false,
    productionWriteRequested: true,
    liveDefaultMutationRequested: true,
    versionPointerMutationRequested: true,
    signingDispatchRequested: true,
  },
  routeApplySimulations: [],
  versionPointerApplySimulation: {},
  noWriteProof: {
    dryRunOnly: false,
    mutatedData: true,
    productionWriteAttempted: true,
    liveDefaultMutationCount: 1,
    signingEnvelopeMutationCount: 1,
    versionPointerMutationCount: 1,
    generatedArtifactMutationCount: 1,
    signingDispatchMutationCount: 1,
  },
  auditEvents: [],
  evidence: [],
  archiveReceipt: {},
})

assert.equal(blockedReceipt.canIssueApplyReceipt, false)
assert.ok(blockedReceipt.blockerCodes.includes('apply_dry_run_id_missing'))
assert.ok(blockedReceipt.blockerCodes.includes('apply_source_guard_fingerprint_mismatch'))
assert.ok(blockedReceipt.blockerCodes.includes('apply_route_missing:new_development'))
assert.ok(blockedReceipt.blockerCodes.includes('apply_version_pointer_operation_invalid'))
assert.ok(blockedReceipt.blockerCodes.includes('no_write_proof_production_write_attempted'))

const markdown = formatOtpControlledVersionRenewalApplyDryRunPhase51Markdown(audit)
for (const token of [
  'OTP Generator Phase 51 Controlled Version Renewal Apply Dry Run',
  'OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_READY_FOR_APPLY_RECEIPT',
  'apply_dry_run_stopped_before_live_write',
  'Phase 52: Version Renewal Apply Receipt',
  'resale_existing_property',
  'new_development',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP controlled version renewal apply dry-run Phase 51 contract passed.')
