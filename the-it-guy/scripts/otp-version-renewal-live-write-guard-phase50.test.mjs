import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildOtpControlledVersionRenewalActivationDryRunPhase48Audit,
} from '../src/core/documents/otpControlledVersionRenewalActivationDryRunPhase48.js'
import {
  OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_STATUS,
  buildOtpVersionRenewalActivationReceiptPhase49Audit,
} from '../src/core/documents/otpVersionRenewalActivationReceiptPhase49.js'
import {
  OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_CONTRACT,
  OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_PHASE50_VERSION,
  OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_READY_STATUS,
  buildOtpVersionRenewalLiveWriteGuard,
  buildOtpVersionRenewalLiveWriteGuardPhase50Audit,
  formatOtpVersionRenewalLiveWriteGuardPhase50Markdown,
} from '../src/core/documents/otpVersionRenewalLiveWriteGuardPhase50.js'

const checkedAt = '2026-08-06T09:15:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase50Source = await readFile(new URL('../src/core/documents/otpVersionRenewalLiveWriteGuardPhase50.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-version-renewal-live-write-guard-phase50'],
  'node scripts/otp-version-renewal-live-write-guard-phase50.test.mjs',
  'package.json should expose the OTP version renewal live write guard Phase 50 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-version-renewal-live-write-guard-phase50'],
  'node scripts/report-otp-version-renewal-live-write-guard-phase50.mjs',
  'package.json should expose the OTP version renewal live write guard Phase 50 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-version-renewal-live-write-guard-phase50'),
  'OTP vNext verification should include Phase 50 version renewal live write guard.',
)

assert.equal(OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_PHASE50_VERSION, 'otp_version_renewal_live_write_guard_phase50_v1')
assert.equal(OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_CONTRACT, 'otp-vnext-version-renewal-live-write-guard-phase50-v1')
assert.equal(OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_READY_STATUS, 'OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_READY_FOR_CONTROLLED_APPLY_DRY_RUN')

for (const token of [
  'PHASE50_BLOCKED_PHASE49_RECEIPT_REJECTED',
  'PHASE50_RECEIPT_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE50_ROUTE_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE50_VERSION_POINTER_MISMATCH_BLOCKED',
  'PHASE50_UNAUTHORISED_OPERATION_BLOCKED',
  'PHASE50_LIVE_WRITE_OBSERVED_BLOCKED',
  'receipt_fingerprint_required',
  'no_write_during_guard',
]) {
  assert.ok(phase50Source.includes(token), `phase50 source should include ${token}`)
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
assert.equal(phase49Audit.status, OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_STATUS)

const audit = buildOtpVersionRenewalLiveWriteGuardPhase50Audit({
  checkedAt,
  phase49Audit,
  packageJson,
})

assert.equal(audit.version, OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_PHASE50_VERSION)
assert.equal(audit.contract, OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_CONTRACT)
assert.equal(audit.status, OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.canProceedToControlledApplyDryRun, true)
assert.equal(audit.nextPhase.phase, 51)
assert.equal(audit.nextPhase.key, 'otp_controlled_version_renewal_apply_dry_run')
assert.equal(audit.mutatedData, false)

for (const check of [
  'PHASE50_PHASE49_ACTIVATION_RECEIPT_READY',
  'PHASE50_GOOD_LIVE_WRITE_GUARD_READY',
  'PHASE50_RECEIPT_FINGERPRINT_MATCHES',
  'PHASE50_ROUTE_OPERATIONS_BOUND',
  'PHASE50_VERSION_POINTER_OPERATION_BOUND',
  'PHASE50_GUARD_TERMS_DENY_BY_DEFAULT',
  'PHASE50_NO_LIVE_WRITE_EXECUTED',
  'PHASE50_GUARD_FINGERPRINT_MATCHES',
  'PHASE50_BLOCKED_PHASE49_RECEIPT_REJECTED',
  'PHASE50_RECEIPT_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE50_OPERATOR_MISMATCH_BLOCKED',
  'PHASE50_ROUTE_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE50_VERSION_POINTER_MISMATCH_BLOCKED',
  'PHASE50_UNAUTHORISED_OPERATION_BLOCKED',
  'PHASE50_ROLLBACK_MISMATCH_BLOCKED',
  'PHASE50_UNSAFE_GUARD_TERMS_BLOCKED',
  'PHASE50_LIVE_WRITE_OBSERVED_BLOCKED',
  'PHASE50_GUARD_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE50_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodReceipt = phase49Audit.activationReceipts.find((receipt) => receipt.canProceedToLiveWriteGuard)
const blockedGuard = buildOtpVersionRenewalLiveWriteGuard({
  checkedAt,
  activationReceipt: goodReceipt,
  guardEvidence: {
    guardId: '',
    sourceReceiptId: 'wrong-receipt',
    sourceReceiptFingerprint: 'wrong-fingerprint',
    targetEnvironment: 'staging',
    targetVersionKey: 'wrong-version',
    previousVersionKey: 'wrong-previous',
    rollbackPlanReference: 'wrong-rollback',
    operator: 'wrong-operator',
    operatorConfirmationPhrase: 'wrong-confirmation',
    mode: 'apply',
    denyByDefault: false,
    writesExecuted: true,
    mutatedData: true,
    guardTerms: {
      receiptFingerprintRequired: false,
      operatorConfirmationRequired: false,
      rollbackPlanRequired: false,
      routeFingerprintRequired: false,
      versionPointerFingerprintRequired: false,
      exactOperationRequired: false,
      denyByDefault: false,
      noWriteDuringGuard: false,
      terms: [],
    },
    routeDecisions: [],
    versionPointerDecision: {},
    stopConditions: [],
    noWriteProof: {
      guardOnly: false,
      mutatedData: true,
      writeExecuted: true,
      liveDefaultMutationCount: 1,
      signingEnvelopeMutationCount: 1,
      versionPointerMutationCount: 1,
      signingDispatchMutationCount: 1,
    },
  },
})

assert.equal(blockedGuard.canProceedToControlledApplyDryRun, false)
assert.ok(blockedGuard.blockerCodes.includes('guard_id_missing'))
assert.ok(blockedGuard.blockerCodes.includes('guard_source_receipt_fingerprint_mismatch'))
assert.ok(blockedGuard.blockerCodes.includes('route_decision_count_mismatch'))
assert.ok(blockedGuard.blockerCodes.includes('version_pointer_operation_not_authorised'))
assert.ok(blockedGuard.blockerCodes.includes('guard_writes_executed'))

const markdown = formatOtpVersionRenewalLiveWriteGuardPhase50Markdown(audit)
for (const token of [
  'OTP Generator Phase 50 Version Renewal Live Write Guard',
  'OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_READY_FOR_CONTROLLED_APPLY_DRY_RUN',
  'receipt_fingerprint_required',
  'switch_version_pointer',
  'Phase 51: Controlled Version Renewal Apply Dry Run',
  'resale_existing_property',
  'new_development',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP version renewal live write guard Phase 50 contract passed.')
