import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_PRODUCTION_ACTIVATION_RECEIPT_CONTRACT,
  OTP_PRODUCTION_ACTIVATION_RECEIPT_PHASE21_VERSION,
  OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE,
  OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_STATUS,
  buildOtpProductionActivationReceiptPhase21Audit,
  formatOtpProductionActivationReceiptPhase21Markdown,
} from '../src/core/documents/otpProductionActivationReceiptPhase21.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-production-activation-receipt-phase21'],
  'node scripts/otp-production-activation-receipt-phase21.test.mjs',
  'package.json should expose the OTP production activation receipt Phase 21 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-production-activation-receipt-phase21'],
  'node scripts/report-otp-production-activation-receipt-phase21.mjs',
  'package.json should expose the OTP Phase 21 production activation receipt report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-production-activation-receipt-phase21'),
  'OTP vNext verification should include Phase 21 production activation receipt checks.',
)

assert.equal(OTP_PRODUCTION_ACTIVATION_RECEIPT_PHASE21_VERSION, 'otp_production_activation_receipt_phase21_v1')
assert.equal(OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_STATUS, 'OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_FOR_LIVE_WRITE_GUARD')
assert.equal(OTP_PRODUCTION_ACTIVATION_RECEIPT_CONTRACT, 'otp-vnext-production-activation-receipt-phase21-v1')

const audit = buildOtpProductionActivationReceiptPhase21Audit({ checkedAt: '2026-08-05T11:00:00.000Z' })
assert.equal(audit.version, OTP_PRODUCTION_ACTIVATION_RECEIPT_PHASE21_VERSION)
assert.equal(audit.contract, OTP_PRODUCTION_ACTIVATION_RECEIPT_CONTRACT)
assert.equal(audit.status, OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.canProceedToLiveWriteGuard, true)
assert.equal(audit.controlledActivationDryRun.status, 'OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_READY_FOR_PRODUCTION_ACTIVATION_RECEIPT')
assert.equal(audit.receipt.receiptId, 'otp-vnext-production-activation-receipt-2026-08-05')
assert.equal(audit.receipt.receiptStatus, 'authority_format_recorded')
assert.equal(audit.receipt.targetEnvironment, 'production')
assert.equal(audit.receipt.targetProjectRef, 'production-project-ref')
assert.ok(audit.receipt.sourceActivationFingerprint.startsWith('otp-prod-activation:'))
assert.ok(audit.receipt.receiptFingerprint.startsWith('otp-prod-receipt:'))
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.validRouteReceiptCount, 2)
assert.equal(audit.summary.authorityPresent, true)
assert.equal(audit.summary.timeWindowValid, true)
assert.equal(audit.summary.activationFingerprintMatches, true)
assert.equal(audit.summary.preflightFingerprintMatches, true)
assert.equal(audit.summary.lockFingerprintMatches, true)
assert.equal(audit.summary.approvalReferenceMatches, true)
assert.equal(audit.summary.targetBound, true)
assert.equal(audit.summary.rollbackBound, true)
assert.equal(audit.summary.writeTermsSafe, true)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

const resale = audit.routeRows.find((row) => row.routeKey === 'resale_existing_property')
const development = audit.routeRows.find((row) => row.routeKey === 'new_development')
assert.equal(resale.plannedOperationCount, 3)
assert.equal(resale.expectedOperationCount, 3)
assert.equal(resale.receiptRequiredBeforeWrite, true)
assert.equal(resale.pass, true)
assert.equal(development.plannedOperationCount, 3)
assert.equal(development.expectedOperationCount, 3)
assert.equal(development.receiptRequiredBeforeWrite, true)
assert.equal(development.pass, true)

for (const check of [
  'PHASE21_CONTROLLED_ACTIVATION_DRY_RUN_READY',
  'PHASE21_RECEIPT_AUTHORITY_PRESENT',
  'PHASE21_RECEIPT_TIME_WINDOW_VALID',
  'PHASE21_ACTIVATION_AUTHORITY_CHAIN_BOUND',
  'PHASE21_PRODUCTION_TARGET_BOUND',
  'PHASE21_ROLLBACK_PLAN_BOUND',
  'PHASE21_WRITE_TERMS_REQUIRE_RECEIPT_AND_SEPARATE_APPLY',
  'PHASE21_BOTH_ROUTE_RECEIPTS_RECORDED',
  'PHASE21_ROUTE_RECEIPT_FINGERPRINTS_BOUND',
  'PHASE21_RECEIPT_FINGERPRINT_MATCHES',
  'PHASE21_RECEIPT_STOP_CONDITIONS_BOUND',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const missingAuthority = buildOtpProductionActivationReceiptPhase21Audit({
  checkedAt: '2026-08-05T11:00:00.000Z',
  receiptEvidence: {
    ...OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE,
    authorisedByRole: '',
  },
})
assert.equal(missingAuthority.status, 'OTP_PRODUCTION_ACTIVATION_RECEIPT_REMEDIATION_REQUIRED')
assert.equal(missingAuthority.checks.find((item) => item.code === 'PHASE21_RECEIPT_AUTHORITY_PRESENT')?.pass, false)

const expiredReceipt = buildOtpProductionActivationReceiptPhase21Audit({
  checkedAt: '2026-08-07T11:00:00.000Z',
})
assert.equal(expiredReceipt.status, 'OTP_PRODUCTION_ACTIVATION_RECEIPT_REMEDIATION_REQUIRED')
assert.equal(expiredReceipt.checks.find((item) => item.code === 'PHASE21_RECEIPT_TIME_WINDOW_VALID')?.pass, false)

const wrongActivationFingerprint = buildOtpProductionActivationReceiptPhase21Audit({
  checkedAt: '2026-08-05T11:00:00.000Z',
  receiptEvidence: {
    ...OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE,
    sourceActivationFingerprint: 'otp-prod-activation:00000000:0',
  },
})
assert.equal(wrongActivationFingerprint.status, 'OTP_PRODUCTION_ACTIVATION_RECEIPT_REMEDIATION_REQUIRED')
assert.equal(wrongActivationFingerprint.checks.find((item) => item.code === 'PHASE21_ACTIVATION_AUTHORITY_CHAIN_BOUND')?.pass, false)

const missingRollback = buildOtpProductionActivationReceiptPhase21Audit({
  checkedAt: '2026-08-05T11:00:00.000Z',
  receiptEvidence: {
    ...OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE,
    rollbackPlanId: 'wrong-rollback-plan',
  },
})
assert.equal(missingRollback.status, 'OTP_PRODUCTION_ACTIVATION_RECEIPT_REMEDIATION_REQUIRED')
assert.equal(missingRollback.checks.find((item) => item.code === 'PHASE21_ROLLBACK_PLAN_BOUND')?.pass, false)

const unsafeWriteTerms = buildOtpProductionActivationReceiptPhase21Audit({
  checkedAt: '2026-08-05T11:00:00.000Z',
  receiptEvidence: {
    ...OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE,
    writeTerms: {
      ...OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE.writeTerms,
      productionWritesAllowedByThisReceipt: true,
    },
  },
})
assert.equal(unsafeWriteTerms.status, 'OTP_PRODUCTION_ACTIVATION_RECEIPT_REMEDIATION_REQUIRED')
assert.equal(unsafeWriteTerms.checks.find((item) => item.code === 'PHASE21_WRITE_TERMS_REQUIRE_RECEIPT_AND_SEPARATE_APPLY')?.pass, false)

const routeOperationMissing = buildOtpProductionActivationReceiptPhase21Audit({
  checkedAt: '2026-08-05T11:00:00.000Z',
  receiptEvidence: {
    ...OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE,
    routeReceipts: OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE.routeReceipts.map((route) => route.routeKey === 'new_development'
      ? { ...route, operationNames: route.operationNames.slice(1) }
      : route),
  },
})
assert.equal(routeOperationMissing.status, 'OTP_PRODUCTION_ACTIVATION_RECEIPT_REMEDIATION_REQUIRED')
assert.equal(routeOperationMissing.checks.find((item) => item.code === 'PHASE21_BOTH_ROUTE_RECEIPTS_RECORDED')?.pass, false)

const receiptFingerprintMismatch = buildOtpProductionActivationReceiptPhase21Audit({
  checkedAt: '2026-08-05T11:00:00.000Z',
  receiptEvidence: {
    ...OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE,
    receiptFingerprint: 'otp-prod-receipt:00000000:0',
  },
})
assert.equal(receiptFingerprintMismatch.status, 'OTP_PRODUCTION_ACTIVATION_RECEIPT_REMEDIATION_REQUIRED')
assert.equal(receiptFingerprintMismatch.checks.find((item) => item.code === 'PHASE21_RECEIPT_FINGERPRINT_MATCHES')?.pass, false)

const markdown = formatOtpProductionActivationReceiptPhase21Markdown(audit)
for (const token of [
  'OTP Template vNext Phase 21 Production Activation Receipt',
  'OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_FOR_LIVE_WRITE_GUARD',
  'PHASE21_WRITE_TERMS_REQUIRE_RECEIPT_AND_SEPARATE_APPLY',
  'receipt_required_before_production_write',
  'otp-prod-receipt:',
  'accountable_production_release_owner',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpProductionActivationReceiptPhase21.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_PRODUCTION_ACTIVATION_RECEIPT_PHASE21_VERSION',
  'OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_EVIDENCE',
  'buildOtpControlledProductionActivationDryRunPhase20Audit',
  'receipt_required_before_production_write',
  'productionWritesAllowedByThisReceipt: false',
  'requiresSeparateApplyCommand',
  'write_terms_unsafe',
  'receipt_expired',
  'mutatedData: false',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP production activation receipt Phase 21 contract passed.')
