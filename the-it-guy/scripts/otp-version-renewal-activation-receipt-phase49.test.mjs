import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_STATUS,
  buildOtpControlledVersionRenewalActivationDryRunPhase48Audit,
} from '../src/core/documents/otpControlledVersionRenewalActivationDryRunPhase48.js'
import {
  OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_CONTRACT,
  OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_PHASE49_VERSION,
  OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_STATUS,
  buildOtpVersionRenewalActivationReceipt,
  buildOtpVersionRenewalActivationReceiptPhase49Audit,
  formatOtpVersionRenewalActivationReceiptPhase49Markdown,
} from '../src/core/documents/otpVersionRenewalActivationReceiptPhase49.js'

const checkedAt = '2026-08-06T08:45:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase49Source = await readFile(new URL('../src/core/documents/otpVersionRenewalActivationReceiptPhase49.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-version-renewal-activation-receipt-phase49'],
  'node scripts/otp-version-renewal-activation-receipt-phase49.test.mjs',
  'package.json should expose the OTP version renewal activation receipt Phase 49 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-version-renewal-activation-receipt-phase49'],
  'node scripts/report-otp-version-renewal-activation-receipt-phase49.mjs',
  'package.json should expose the OTP version renewal activation receipt Phase 49 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-version-renewal-activation-receipt-phase49'),
  'OTP vNext verification should include Phase 49 version renewal activation receipt.',
)

assert.equal(OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_PHASE49_VERSION, 'otp_version_renewal_activation_receipt_phase49_v1')
assert.equal(OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_CONTRACT, 'otp-vnext-version-renewal-activation-receipt-phase49-v1')
assert.equal(OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_STATUS, 'OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_FOR_LIVE_WRITE_GUARD')

for (const token of [
  'PHASE49_BLOCKED_PHASE48_DRY_RUN_REJECTED',
  'PHASE49_ROUTE_RECEIPT_MISMATCH_BLOCKED',
  'PHASE49_VERSION_POINTER_MISMATCH_BLOCKED',
  'PHASE49_UNSAFE_WRITE_TERMS_BLOCKED',
  'PHASE49_OPERATOR_MISMATCH_BLOCKED',
  'PHASE49_RECEIPT_FINGERPRINT_MISMATCH_BLOCKED',
  'receipt_required_before_version_renewal_write',
  'productionWritesAllowedByThisReceipt: false',
]) {
  assert.ok(phase49Source.includes(token), `phase49 source should include ${token}`)
}

const phase48Audit = buildOtpControlledVersionRenewalActivationDryRunPhase48Audit({
  checkedAt,
  packageJson,
})
assert.equal(phase48Audit.status, OTP_CONTROLLED_VERSION_RENEWAL_ACTIVATION_DRY_RUN_READY_STATUS)

const audit = buildOtpVersionRenewalActivationReceiptPhase49Audit({
  checkedAt,
  phase48Audit,
  packageJson,
})

assert.equal(audit.version, OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_PHASE49_VERSION)
assert.equal(audit.contract, OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_CONTRACT)
assert.equal(audit.status, OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.canProceedToLiveWriteGuard, true)
assert.equal(audit.nextPhase.phase, 50)
assert.equal(audit.nextPhase.key, 'otp_version_renewal_live_write_guard')
assert.equal(audit.mutatedData, false)

for (const check of [
  'PHASE49_PHASE48_CONTROLLED_DRY_RUN_READY',
  'PHASE49_GOOD_ACTIVATION_RECEIPT_READY',
  'PHASE49_RECEIPT_AUTHORITY_PRESENT',
  'PHASE49_RECEIPT_TIME_WINDOW_VALID',
  'PHASE49_BOTH_ROUTE_RECEIPTS_BOUND',
  'PHASE49_VERSION_POINTER_RECEIPT_BOUND',
  'PHASE49_WRITE_TERMS_REQUIRE_SEPARATE_LIVE_WRITE_GUARD',
  'PHASE49_RECEIPT_FINGERPRINT_MATCHES',
  'PHASE49_BLOCKED_PHASE48_DRY_RUN_REJECTED',
  'PHASE49_MISSING_AUTHORITY_BLOCKED',
  'PHASE49_EXPIRED_RECEIPT_BLOCKED',
  'PHASE49_ROUTE_RECEIPT_MISMATCH_BLOCKED',
  'PHASE49_VERSION_POINTER_MISMATCH_BLOCKED',
  'PHASE49_UNSAFE_WRITE_TERMS_BLOCKED',
  'PHASE49_OPERATOR_MISMATCH_BLOCKED',
  'PHASE49_ROLLBACK_PLAN_BLOCKED',
  'PHASE49_RECEIPT_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE49_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodDryRun = phase48Audit.dryRunReceipts.find((receipt) => receipt.canIssueActivationReceipt)
const blockedReceipt = buildOtpVersionRenewalActivationReceipt({
  checkedAt,
  activationDryRunReceipt: goodDryRun,
  receiptEvidence: {
    receiptId: '',
    receiptStatus: 'draft',
    issuedAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2026-08-02T00:00:00.000Z',
    issuedByRole: '',
    authorisedByRole: '',
    authorityScope: '',
    approvalReference: '',
    sourceDryRunVersion: 'wrong-version',
    sourceDryRunStatus: 'wrong-status',
    sourceGuardOperationId: 'wrong-operation',
    sourceSimulationId: 'wrong-simulation',
    sourceSimulationFingerprint: 'wrong-fingerprint',
    target: {
      environment: 'staging',
      versionKey: 'wrong-target',
      previousVersionKey: 'wrong-previous',
      routeVariants: ['resale_existing_property'],
    },
    operatorConfirmation: {
      operator: 'wrong-operator',
      confirmedBy: 'wrong-confirmer',
      mfaVerified: false,
    },
    versionPointerReceipt: {
      previousVersionKey: 'wrong-previous',
      targetVersionKey: 'wrong-target',
      pointerFingerprint: 'wrong-fingerprint',
      receiptRequiredBeforeWrite: false,
    },
    rollbackPlanReference: '',
    writeTerms: {
      requiredBeforeVersionRenewalWrite: false,
      productionWritesAllowedByThisReceipt: true,
      requiresSeparateApplyCommand: false,
      requiresMatchingReceiptFingerprint: false,
      requiresOperatorConfirmation: false,
      requiresRollbackPlan: false,
      noUncontrolledWriteAllowed: false,
      terms: [],
    },
    routeReceipts: [],
    stopConditions: [],
    archiveReceipt: {},
    noWriteProof: {
      receiptOnly: false,
      mutatedData: true,
      productionWriteAttempted: true,
      liveDefaultMutationCount: 1,
      versionPointerMutationCount: 1,
      signingDispatchMutationCount: 1,
    },
  },
})

assert.equal(blockedReceipt.canProceedToLiveWriteGuard, false)
assert.ok(blockedReceipt.blockerCodes.includes('receipt_id_missing'))
assert.ok(blockedReceipt.blockerCodes.includes('source_simulation_fingerprint_mismatch'))
assert.ok(blockedReceipt.blockerCodes.includes('route_receipt_missing:new_development'))
assert.ok(blockedReceipt.blockerCodes.includes('write_terms_allow_production_write'))
assert.ok(blockedReceipt.blockerCodes.includes('receipt_no_write_proof_production_write_attempted'))

const markdown = formatOtpVersionRenewalActivationReceiptPhase49Markdown(audit)
for (const token of [
  'OTP Generator Phase 49 Version Renewal Activation Receipt',
  'OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_READY_FOR_LIVE_WRITE_GUARD',
  'receipt_required_before_version_renewal_write',
  'Phase 50: Version Renewal Live Write Guard',
  'resale_existing_property',
  'new_development',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP version renewal activation receipt Phase 49 contract passed.')
