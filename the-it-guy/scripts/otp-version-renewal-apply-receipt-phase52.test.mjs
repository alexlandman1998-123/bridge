import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildOtpControlledVersionRenewalActivationDryRunPhase48Audit,
} from '../src/core/documents/otpControlledVersionRenewalActivationDryRunPhase48.js'
import {
  buildOtpVersionRenewalActivationReceiptPhase49Audit,
} from '../src/core/documents/otpVersionRenewalActivationReceiptPhase49.js'
import {
  buildOtpVersionRenewalLiveWriteGuardPhase50Audit,
} from '../src/core/documents/otpVersionRenewalLiveWriteGuardPhase50.js'
import {
  buildOtpControlledVersionRenewalApplyDryRunPhase51Audit,
} from '../src/core/documents/otpControlledVersionRenewalApplyDryRunPhase51.js'
import {
  OTP_VERSION_RENEWAL_APPLY_RECEIPT_CONTRACT,
  OTP_VERSION_RENEWAL_APPLY_RECEIPT_PHASE52_VERSION,
  OTP_VERSION_RENEWAL_APPLY_RECEIPT_READY_STATUS,
  buildOtpVersionRenewalApplyReceipt,
  buildOtpVersionRenewalApplyReceiptPhase52Audit,
  formatOtpVersionRenewalApplyReceiptPhase52Markdown,
} from '../src/core/documents/otpVersionRenewalApplyReceiptPhase52.js'

const checkedAt = '2026-08-06T09:45:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase52Source = await readFile(new URL('../src/core/documents/otpVersionRenewalApplyReceiptPhase52.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-version-renewal-apply-receipt-phase52'],
  'node scripts/otp-version-renewal-apply-receipt-phase52.test.mjs',
  'package.json should expose the OTP version renewal apply receipt Phase 52 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-version-renewal-apply-receipt-phase52'],
  'node scripts/report-otp-version-renewal-apply-receipt-phase52.mjs',
  'package.json should expose the OTP version renewal apply receipt Phase 52 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-version-renewal-apply-receipt-phase52'),
  'OTP vNext verification should include Phase 52 version renewal apply receipt.',
)

assert.equal(OTP_VERSION_RENEWAL_APPLY_RECEIPT_PHASE52_VERSION, 'otp_version_renewal_apply_receipt_phase52_v1')
assert.equal(OTP_VERSION_RENEWAL_APPLY_RECEIPT_CONTRACT, 'otp-vnext-version-renewal-apply-receipt-phase52-v1')
assert.equal(OTP_VERSION_RENEWAL_APPLY_RECEIPT_READY_STATUS, 'OTP_VERSION_RENEWAL_APPLY_RECEIPT_READY_FOR_FINAL_LIVE_WRITE_AUTHORITY')

for (const token of [
  'PHASE52_BLOCKED_PHASE51_DRY_RUN_REJECTED',
  'PHASE52_SOURCE_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE52_ROUTE_APPLY_RECEIPT_MISMATCH_BLOCKED',
  'PHASE52_VERSION_POINTER_RECEIPT_MISMATCH_BLOCKED',
  'PHASE52_LIVE_WRITE_BY_RECEIPT_BLOCKED',
  'apply_receipt_required_before_version_renewal_write',
]) {
  assert.ok(phase52Source.includes(token), `phase52 source should include ${token}`)
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
const phase51Audit = buildOtpControlledVersionRenewalApplyDryRunPhase51Audit({
  checkedAt,
  phase50Audit,
  packageJson,
})
const audit = buildOtpVersionRenewalApplyReceiptPhase52Audit({
  checkedAt,
  phase51Audit,
  packageJson,
})

assert.equal(audit.version, OTP_VERSION_RENEWAL_APPLY_RECEIPT_PHASE52_VERSION)
assert.equal(audit.contract, OTP_VERSION_RENEWAL_APPLY_RECEIPT_CONTRACT)
assert.equal(audit.status, OTP_VERSION_RENEWAL_APPLY_RECEIPT_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.canPermitFinalLiveWriteAuthority, true)
assert.equal(audit.mutatedData, false)
assert.equal(audit.nextPhase.phase, 53)
assert.equal(audit.nextPhase.key, 'otp_post_renewal_monitoring_closeout')

for (const check of [
  'PHASE52_PHASE51_APPLY_DRY_RUN_READY',
  'PHASE52_GOOD_APPLY_RECEIPT_READY',
  'PHASE52_RECEIPT_AUTHORITY_PRESENT',
  'PHASE52_RECEIPT_TIME_WINDOW_VALID',
  'PHASE52_SOURCE_APPLY_DRY_RUN_BOUND',
  'PHASE52_BOTH_ROUTE_APPLY_RECEIPTS_BOUND',
  'PHASE52_VERSION_POINTER_APPLY_RECEIPT_BOUND',
  'PHASE52_WRITE_TERMS_REQUIRE_SEPARATE_APPLY_AND_FINGERPRINTS',
  'PHASE52_RECEIPT_ONLY_NO_WRITE',
  'PHASE52_APPLY_RECEIPT_FINGERPRINT_MATCHES',
  'PHASE52_BLOCKED_PHASE51_DRY_RUN_REJECTED',
  'PHASE52_MISSING_AUTHORITY_BLOCKED',
  'PHASE52_EXPIRED_RECEIPT_BLOCKED',
  'PHASE52_SOURCE_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE52_ROUTE_APPLY_RECEIPT_MISMATCH_BLOCKED',
  'PHASE52_VERSION_POINTER_RECEIPT_MISMATCH_BLOCKED',
  'PHASE52_UNSAFE_WRITE_TERMS_BLOCKED',
  'PHASE52_OPERATOR_MISMATCH_BLOCKED',
  'PHASE52_ROLLBACK_PLAN_BLOCKED',
  'PHASE52_LIVE_WRITE_BY_RECEIPT_BLOCKED',
  'PHASE52_APPLY_RECEIPT_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE52_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodApplyDryRun = phase51Audit.applyDryRunReceipts.find((receipt) => receipt.canIssueApplyReceipt)
const readyReceipt = audit.applyReceipts.find((receipt) => receipt.canPermitFinalLiveWriteAuthority)
const blockedReceipt = buildOtpVersionRenewalApplyReceipt({
  checkedAt,
  applyDryRunReceipt: goodApplyDryRun,
  receiptEvidence: {
    ...readyReceipt.receiptEvidence,
    receiptId: '',
    sourceApplyDryRunFingerprint: 'wrong-apply-dry-run-fingerprint',
    routeApplyReceipts: readyReceipt.receiptEvidence.routeApplyReceipts.filter((row) => row.routeVariant !== 'new_development'),
    versionPointerApplyReceipt: {
      ...readyReceipt.receiptEvidence.versionPointerApplyReceipt,
      operation: 'manual_pointer_change',
    },
    noWriteProof: {
      ...readyReceipt.receiptEvidence.noWriteProof,
      productionWriteAttempted: true,
    },
  },
})

assert.equal(blockedReceipt.canPermitFinalLiveWriteAuthority, false)
assert.ok(blockedReceipt.blockerCodes.includes('apply_receipt_id_missing'))
assert.ok(blockedReceipt.blockerCodes.includes('source_apply_dry_run_fingerprint_mismatch'))
assert.ok(blockedReceipt.blockerCodes.includes('apply_route_receipt_missing:new_development'))
assert.ok(blockedReceipt.blockerCodes.includes('apply_version_pointer_receipt_operation_invalid'))
assert.ok(blockedReceipt.blockerCodes.includes('apply_receipt_no_write_proof_production_write_attempted'))

const markdown = formatOtpVersionRenewalApplyReceiptPhase52Markdown(audit)
for (const token of [
  'OTP Generator Phase 52 Version Renewal Apply Receipt',
  'OTP_VERSION_RENEWAL_APPLY_RECEIPT_READY_FOR_FINAL_LIVE_WRITE_AUTHORITY',
  'apply_receipt_required_before_version_renewal_write',
  'Phase 53: Post-Renewal Monitoring And Closeout',
  'resale_existing_property',
  'new_development',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP version renewal apply receipt Phase 52 contract passed.')
