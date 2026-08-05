import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_LIVE_WRITE_GUARD_CONTRACT,
  OTP_LIVE_WRITE_GUARD_PHASE22_VERSION,
  OTP_LIVE_WRITE_GUARD_READY_EVIDENCE,
  OTP_LIVE_WRITE_GUARD_READY_STATUS,
  buildOtpLiveWriteGuardPhase22Audit,
  formatOtpLiveWriteGuardPhase22Markdown,
} from '../src/core/documents/otpLiveWriteGuardPhase22.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-live-write-guard-phase22'],
  'node scripts/otp-live-write-guard-phase22.test.mjs',
  'package.json should expose the OTP live write guard Phase 22 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-live-write-guard-phase22'],
  'node scripts/report-otp-live-write-guard-phase22.mjs',
  'package.json should expose the OTP Phase 22 live write guard report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-live-write-guard-phase22'),
  'OTP vNext verification should include Phase 22 live write guard checks.',
)

assert.equal(OTP_LIVE_WRITE_GUARD_PHASE22_VERSION, 'otp_live_write_guard_phase22_v1')
assert.equal(OTP_LIVE_WRITE_GUARD_READY_STATUS, 'OTP_LIVE_WRITE_GUARD_READY_FOR_APPLY_COMMAND_REHEARSAL')
assert.equal(OTP_LIVE_WRITE_GUARD_CONTRACT, 'otp-vnext-live-write-guard-phase22-v1')

const audit = buildOtpLiveWriteGuardPhase22Audit({ checkedAt: '2026-08-05T11:00:00.000Z' })
assert.equal(audit.version, OTP_LIVE_WRITE_GUARD_PHASE22_VERSION)
assert.equal(audit.contract, OTP_LIVE_WRITE_GUARD_CONTRACT)
assert.equal(audit.status, OTP_LIVE_WRITE_GUARD_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.canProceedToApplyCommandRehearsal, true)
assert.equal(audit.productionActivationReceipt.status, 'OTP_PRODUCTION_ACTIVATION_RECEIPT_READY_FOR_LIVE_WRITE_GUARD')
assert.equal(audit.guard.guardId, 'otp-vnext-live-write-guard-2026-08-05')
assert.equal(audit.guard.mode, 'guard_evaluation_only')
assert.equal(audit.guard.operatorConfirmation, 'OTP_VNEXT_PRODUCTION_ACTIVATION_CONFIRMED')
assert.equal(audit.guard.targetProjectRef, 'production-project-ref')
assert.ok(audit.guard.sourceReceiptFingerprint.startsWith('otp-prod-receipt:'))
assert.ok(audit.guard.guardFingerprint.startsWith('otp-live-guard:'))
assert.equal(audit.summary.decisionCount, 6)
assert.equal(audit.summary.expectedDecisionCount, 6)
assert.equal(audit.summary.passingDecisionCount, 6)
assert.equal(audit.summary.receiptFingerprintMatches, true)
assert.equal(audit.summary.operatorConfirmationMatches, true)
assert.equal(audit.summary.projectRefMatches, true)
assert.equal(audit.summary.rollbackPlanMatches, true)
assert.equal(audit.summary.routeFingerprintMatches, true)
assert.equal(audit.summary.exactOperationsAuthorised, true)
assert.equal(audit.summary.denyByDefault, true)
assert.equal(audit.summary.noProductionWriteExecuted, true)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

for (const check of [
  'PHASE22_PRODUCTION_ACTIVATION_RECEIPT_READY',
  'PHASE22_RECEIPT_FINGERPRINT_MATCHES',
  'PHASE22_OPERATOR_CONFIRMATION_MATCHES',
  'PHASE22_PROJECT_REF_MATCHES',
  'PHASE22_ROLLBACK_PLAN_MATCHES',
  'PHASE22_ROUTE_FINGERPRINTS_MATCH',
  'PHASE22_EXACT_OPERATIONS_AUTHORISED',
  'PHASE22_DENY_BY_DEFAULT_TERMS_BOUND',
  'PHASE22_ALL_GUARD_DECISIONS_PASS',
  'PHASE22_NO_PRODUCTION_WRITE_EXECUTED',
  'PHASE22_GUARD_FINGERPRINT_MATCHES',
  'PHASE22_STOP_CONDITIONS_BOUND',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const wrongReceiptFingerprint = buildOtpLiveWriteGuardPhase22Audit({
  checkedAt: '2026-08-05T11:00:00.000Z',
  guardEvidence: {
    ...OTP_LIVE_WRITE_GUARD_READY_EVIDENCE,
    sourceReceiptFingerprint: 'otp-prod-receipt:00000000:0',
  },
})
assert.equal(wrongReceiptFingerprint.status, 'OTP_LIVE_WRITE_GUARD_REMEDIATION_REQUIRED')
assert.equal(wrongReceiptFingerprint.checks.find((item) => item.code === 'PHASE22_RECEIPT_FINGERPRINT_MATCHES')?.pass, false)

const missingOperator = buildOtpLiveWriteGuardPhase22Audit({
  checkedAt: '2026-08-05T11:00:00.000Z',
  guardEvidence: {
    ...OTP_LIVE_WRITE_GUARD_READY_EVIDENCE,
    operatorConfirmation: '',
  },
})
assert.equal(missingOperator.status, 'OTP_LIVE_WRITE_GUARD_REMEDIATION_REQUIRED')
assert.equal(missingOperator.checks.find((item) => item.code === 'PHASE22_OPERATOR_CONFIRMATION_MATCHES')?.pass, false)

const wrongProject = buildOtpLiveWriteGuardPhase22Audit({
  checkedAt: '2026-08-05T11:00:00.000Z',
  guardEvidence: {
    ...OTP_LIVE_WRITE_GUARD_READY_EVIDENCE,
    targetProjectRef: 'wrong-production-project-ref',
  },
})
assert.equal(wrongProject.status, 'OTP_LIVE_WRITE_GUARD_REMEDIATION_REQUIRED')
assert.equal(wrongProject.checks.find((item) => item.code === 'PHASE22_PROJECT_REF_MATCHES')?.pass, false)

const wrongRollback = buildOtpLiveWriteGuardPhase22Audit({
  checkedAt: '2026-08-05T11:00:00.000Z',
  guardEvidence: {
    ...OTP_LIVE_WRITE_GUARD_READY_EVIDENCE,
    rollbackPlanId: 'wrong-rollback-plan',
  },
})
assert.equal(wrongRollback.status, 'OTP_LIVE_WRITE_GUARD_REMEDIATION_REQUIRED')
assert.equal(wrongRollback.checks.find((item) => item.code === 'PHASE22_ROLLBACK_PLAN_MATCHES')?.pass, false)

const wrongRouteFingerprint = buildOtpLiveWriteGuardPhase22Audit({
  checkedAt: '2026-08-05T11:00:00.000Z',
  guardEvidence: {
    ...OTP_LIVE_WRITE_GUARD_READY_EVIDENCE,
    decisions: OTP_LIVE_WRITE_GUARD_READY_EVIDENCE.decisions.map((decision, index) => index === 0
      ? { ...decision, routeFingerprint: 'otp-rc-route-resale_existing_property:00000000:0' }
      : decision),
  },
})
assert.equal(wrongRouteFingerprint.status, 'OTP_LIVE_WRITE_GUARD_REMEDIATION_REQUIRED')
assert.equal(wrongRouteFingerprint.checks.find((item) => item.code === 'PHASE22_ROUTE_FINGERPRINTS_MATCH')?.pass, false)

const wrongOperation = buildOtpLiveWriteGuardPhase22Audit({
  checkedAt: '2026-08-05T11:00:00.000Z',
  guardEvidence: {
    ...OTP_LIVE_WRITE_GUARD_READY_EVIDENCE,
    decisions: OTP_LIVE_WRITE_GUARD_READY_EVIDENCE.decisions.map((decision, index) => index === 1
      ? { ...decision, operation: 'unauthorised_production_write' }
      : decision),
  },
})
assert.equal(wrongOperation.status, 'OTP_LIVE_WRITE_GUARD_REMEDIATION_REQUIRED')
assert.equal(wrongOperation.checks.find((item) => item.code === 'PHASE22_EXACT_OPERATIONS_AUTHORISED')?.pass, false)

const executedWrite = buildOtpLiveWriteGuardPhase22Audit({
  checkedAt: '2026-08-05T11:00:00.000Z',
  guardEvidence: {
    ...OTP_LIVE_WRITE_GUARD_READY_EVIDENCE,
    writesExecuted: true,
    mutatedData: true,
    decisions: OTP_LIVE_WRITE_GUARD_READY_EVIDENCE.decisions.map((decision, index) => index === 2
      ? { ...decision, writeExecuted: true, mutationSuppressed: false }
      : decision),
  },
})
assert.equal(executedWrite.status, 'OTP_LIVE_WRITE_GUARD_REMEDIATION_REQUIRED')
assert.equal(executedWrite.checks.find((item) => item.code === 'PHASE22_NO_PRODUCTION_WRITE_EXECUTED')?.pass, false)

const guardFingerprintMismatch = buildOtpLiveWriteGuardPhase22Audit({
  checkedAt: '2026-08-05T11:00:00.000Z',
  guardEvidence: {
    ...OTP_LIVE_WRITE_GUARD_READY_EVIDENCE,
    guardFingerprint: 'otp-live-guard:00000000:0',
  },
})
assert.equal(guardFingerprintMismatch.status, 'OTP_LIVE_WRITE_GUARD_REMEDIATION_REQUIRED')
assert.equal(guardFingerprintMismatch.checks.find((item) => item.code === 'PHASE22_GUARD_FINGERPRINT_MATCHES')?.pass, false)

const markdown = formatOtpLiveWriteGuardPhase22Markdown(audit)
for (const token of [
  'OTP Template vNext Phase 22 Live Write Guard',
  'OTP_LIVE_WRITE_GUARD_READY_FOR_APPLY_COMMAND_REHEARSAL',
  'PHASE22_EXACT_OPERATIONS_AUTHORISED',
  'OTP_VNEXT_PRODUCTION_ACTIVATION_CONFIRMED',
  'receipt_fingerprint_required',
  'otp-live-guard:',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpLiveWriteGuardPhase22.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_LIVE_WRITE_GUARD_PHASE22_VERSION',
  'OTP_LIVE_WRITE_GUARD_READY_EVIDENCE',
  'buildOtpProductionActivationReceiptPhase21Audit',
  'receipt_fingerprint_required',
  'operatorConfirmationRequired',
  'denyByDefault',
  'operation_not_authorised',
  'write_executed_during_guard',
  'mutatedData: false',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP live write guard Phase 22 contract passed.')
