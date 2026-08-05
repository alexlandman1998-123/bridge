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
  buildOtpVersionRenewalApplyReceiptPhase52Audit,
} from '../src/core/documents/otpVersionRenewalApplyReceiptPhase52.js'
import {
  buildOtpPostRenewalMonitoringCloseoutPhase53Audit,
} from '../src/core/documents/otpPostRenewalMonitoringCloseoutPhase53.js'
import {
  OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_CONTRACT,
  OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_PHASE54_VERSION,
  OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_READY_STATUS,
  buildOtpTemplateRenewalSteadyStateReviewPhase54Audit,
  buildOtpTemplateRenewalSteadyStateReviewReceipt,
  formatOtpTemplateRenewalSteadyStateReviewPhase54Markdown,
} from '../src/core/documents/otpTemplateRenewalSteadyStateReviewPhase54.js'

const checkedAt = '2026-08-06T12:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase54Source = await readFile(new URL('../src/core/documents/otpTemplateRenewalSteadyStateReviewPhase54.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-template-renewal-steady-state-review-phase54'],
  'node scripts/otp-template-renewal-steady-state-review-phase54.test.mjs',
  'package.json should expose the OTP template renewal steady-state review Phase 54 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-template-renewal-steady-state-review-phase54'],
  'node scripts/report-otp-template-renewal-steady-state-review-phase54.mjs',
  'package.json should expose the OTP template renewal steady-state review Phase 54 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-steady-state-review-phase54'),
  'OTP vNext verification should include Phase 54 template renewal steady-state review.',
)

assert.equal(OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_PHASE54_VERSION, 'otp_template_renewal_steady_state_review_phase54_v1')
assert.equal(OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_CONTRACT, 'otp-vnext-template-renewal-steady-state-review-phase54-v1')
assert.equal(OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_READY_STATUS, 'OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_READY_FOR_RENEWAL_CHANGE_INTAKE')

for (const token of [
  'PHASE54_STALE_REVIEW_CYCLE_BLOCKED',
  'PHASE54_ROUTE_DRIFT_BLOCKED',
  'PHASE54_VERSION_POINTER_DRIFT_BLOCKED',
  'PHASE54_DOCX_REGRESSION_BLOCKED',
  'PHASE54_ARCHIVE_INTEGRITY_BLOCKED',
  'PHASE54_NEXT_RENEWAL_READINESS_BLOCKED',
]) {
  assert.ok(phase54Source.includes(token), `phase54 source should include ${token}`)
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
const phase52Audit = buildOtpVersionRenewalApplyReceiptPhase52Audit({
  checkedAt,
  phase51Audit,
  packageJson,
})
const phase53Audit = buildOtpPostRenewalMonitoringCloseoutPhase53Audit({
  checkedAt,
  phase52Audit,
  packageJson,
})
const audit = buildOtpTemplateRenewalSteadyStateReviewPhase54Audit({
  checkedAt,
  phase53Audit,
  packageJson,
})

assert.equal(audit.version, OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_PHASE54_VERSION)
assert.equal(audit.contract, OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_CONTRACT)
assert.equal(audit.status, OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.mutatedData, false)
assert.equal(audit.nextPhase.phase, 55)
assert.equal(audit.nextPhase.key, 'otp_template_renewal_change_intake')

for (const check of [
  'PHASE54_PHASE53_CLOSEOUT_READY',
  'PHASE54_GOOD_STEADY_STATE_REVIEW_READY',
  'PHASE54_BOTH_RENEWED_ROUTES_REVIEWED',
  'PHASE54_RENEWED_ROUTE_OUTPUTS_STABLE',
  'PHASE54_RENEWED_VERSION_POINTER_STABLE',
  'PHASE54_REQUIRED_REVIEW_SIGNALS_GREEN',
  'PHASE54_ROLLBACK_RETENTION_STILL_READY',
  'PHASE54_NEXT_RENEWAL_INTAKE_READY',
  'PHASE54_STALE_REVIEW_CYCLE_BLOCKED',
  'PHASE54_ROUTE_DRIFT_BLOCKED',
  'PHASE54_VERSION_POINTER_DRIFT_BLOCKED',
  'PHASE54_DOCX_REGRESSION_BLOCKED',
  'PHASE54_ARCHIVE_INTEGRITY_BLOCKED',
  'PHASE54_ROLLBACK_RETENTION_BLOCKED',
  'PHASE54_INCIDENTS_BLOCKED',
  'PHASE54_NEXT_RENEWAL_READINESS_BLOCKED',
  'PHASE54_MISSING_ATTESTATION_BLOCKED',
  'PHASE54_BAD_SIGNAL_BLOCKED',
  'PHASE54_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodCloseout = phase53Audit.closeoutReceipts.find((receipt) => receipt.canClosePostRenewal)
const blockedReview = buildOtpTemplateRenewalSteadyStateReviewReceipt({
  checkedAt,
  closeoutReceipt: goodCloseout,
  routeReviewRows: [],
  reviewSignals: [
    { key: 'renewed_route_default_stability', status: 'red', owner: '', evidencePath: '' },
  ],
  nextRenewalReadiness: {
    nextReviewDueAt: '2026-01-01T00:00:00.000Z',
    nextRenewalDueAt: '2028-01-01T00:00:00.000Z',
    templateOwnerAssigned: false,
    changeIntakeOpen: false,
    unapprovedChangeCount: 2,
    emergencyOverrideCount: 1,
  },
})

assert.equal(blockedReview.canContinueRenewalSteadyState, false)
assert.ok(blockedReview.blockerCodes.includes('renewal_review_missing_route:new_development'))
assert.ok(blockedReview.blockerCodes.includes('renewal_review_signal_not_green:renewed_route_default_stability'))
assert.ok(blockedReview.blockerCodes.includes('renewal_review_next_review_overdue'))
assert.ok(blockedReview.blockerCodes.includes('renewal_review_unapproved_changes'))

const markdown = formatOtpTemplateRenewalSteadyStateReviewPhase54Markdown(audit)
for (const token of [
  'OTP Generator Phase 54 Template Renewal Steady-State Review',
  'OTP_TEMPLATE_RENEWAL_STEADY_STATE_REVIEW_READY_FOR_RENEWAL_CHANGE_INTAKE',
  'renewal_review_docx_source_observed:new_development',
  'renewed_version_pointer_stability',
  'Phase 55: Template Renewal Change Intake',
  'resale_existing_property',
  'new_development',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP template renewal steady-state review Phase 54 contract passed.')
