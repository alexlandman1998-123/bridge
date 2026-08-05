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
  OTP_POST_RENEWAL_MONITORING_CLOSEOUT_CONTRACT,
  OTP_POST_RENEWAL_MONITORING_CLOSEOUT_PHASE53_VERSION,
  OTP_POST_RENEWAL_MONITORING_CLOSEOUT_READY_STATUS,
  buildOtpPostRenewalMonitoringCloseoutPhase53Audit,
  buildOtpPostRenewalMonitoringCloseoutReceipt,
  formatOtpPostRenewalMonitoringCloseoutPhase53Markdown,
} from '../src/core/documents/otpPostRenewalMonitoringCloseoutPhase53.js'

const checkedAt = '2026-08-06T10:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase53Source = await readFile(new URL('../src/core/documents/otpPostRenewalMonitoringCloseoutPhase53.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-post-renewal-monitoring-closeout-phase53'],
  'node scripts/otp-post-renewal-monitoring-closeout-phase53.test.mjs',
  'package.json should expose the OTP post-renewal monitoring closeout Phase 53 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-post-renewal-monitoring-closeout-phase53'],
  'node scripts/report-otp-post-renewal-monitoring-closeout-phase53.mjs',
  'package.json should expose the OTP post-renewal monitoring closeout Phase 53 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-post-renewal-monitoring-closeout-phase53'),
  'OTP vNext verification should include Phase 53 post-renewal monitoring closeout.',
)

assert.equal(OTP_POST_RENEWAL_MONITORING_CLOSEOUT_PHASE53_VERSION, 'otp_post_renewal_monitoring_closeout_phase53_v1')
assert.equal(OTP_POST_RENEWAL_MONITORING_CLOSEOUT_CONTRACT, 'otp-vnext-post-renewal-monitoring-closeout-phase53-v1')
assert.equal(OTP_POST_RENEWAL_MONITORING_CLOSEOUT_READY_STATUS, 'OTP_POST_RENEWAL_MONITORING_CLOSEOUT_READY_FOR_STEADY_STATE_RENEWAL_GOVERNANCE')

for (const token of [
  'PHASE53_ROUTE_DRIFT_TRIGGERS_ROLLBACK',
  'PHASE53_VERSION_POINTER_DRIFT_TRIGGERS_ROLLBACK',
  'PHASE53_ROLLBACK_UNAVAILABLE_BLOCKED',
  'PHASE53_MISSING_ARCHIVE_ENTRY_BLOCKED',
  'PHASE53_DOCX_REGRESSION_TRIGGERS_ROLLBACK',
  'PHASE53_APPLY_RECEIPT_FINGERPRINT_MISMATCH_BLOCKED',
  'rollback_trigger',
]) {
  assert.ok(phase53Source.includes(token), `phase53 source should include ${token}`)
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
const audit = buildOtpPostRenewalMonitoringCloseoutPhase53Audit({
  checkedAt,
  phase52Audit,
  packageJson,
})

assert.equal(audit.version, OTP_POST_RENEWAL_MONITORING_CLOSEOUT_PHASE53_VERSION)
assert.equal(audit.contract, OTP_POST_RENEWAL_MONITORING_CLOSEOUT_CONTRACT)
assert.equal(audit.status, OTP_POST_RENEWAL_MONITORING_CLOSEOUT_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.mutatedData, false)
assert.equal(audit.nextPhase.phase, 54)
assert.equal(audit.nextPhase.key, 'otp_template_renewal_steady_state_review')

for (const check of [
  'PHASE53_PHASE52_APPLY_RECEIPT_READY',
  'PHASE53_GOOD_POST_RENEWAL_CLOSEOUT_READY',
  'PHASE53_ACTIVATION_BOUND_TO_PHASE52_RECEIPT',
  'PHASE53_MONITORING_WINDOW_BOUNDED',
  'PHASE53_BOTH_RENEWED_ROUTES_MONITORED_AND_ARCHIVED',
  'PHASE53_ROUTE_DEFAULTS_ENVELOPES_AND_OUTPUTS_STABLE',
  'PHASE53_VERSION_POINTER_STABLE',
  'PHASE53_ROLLBACK_REMAINS_AVAILABLE_AND_ARCHIVED',
  'PHASE53_REQUIRED_ARCHIVE_ENTRIES_CAPTURED',
  'PHASE53_ROUTE_DRIFT_TRIGGERS_ROLLBACK',
  'PHASE53_VERSION_POINTER_DRIFT_TRIGGERS_ROLLBACK',
  'PHASE53_ROLLBACK_UNAVAILABLE_BLOCKED',
  'PHASE53_MISSING_ARCHIVE_ENTRY_BLOCKED',
  'PHASE53_DOCX_REGRESSION_TRIGGERS_ROLLBACK',
  'PHASE53_OPEN_INCIDENTS_BLOCK_CLOSEOUT',
  'PHASE53_MISSING_CLOSEOUT_APPROVAL_BLOCKED',
  'PHASE53_UNBOUNDED_MONITORING_WINDOW_BLOCKED',
  'PHASE53_APPLY_RECEIPT_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE53_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodApplyReceipt = phase52Audit.applyReceipts.find((receipt) => receipt.canPermitFinalLiveWriteAuthority)
const blockedCloseout = buildOtpPostRenewalMonitoringCloseoutReceipt({
  checkedAt,
  applyReceipt: goodApplyReceipt,
  activationObservation: {
    activationObservationId: '',
    observedAt: checkedAt,
    environment: 'staging',
    sourceApplyReceiptId: 'wrong-receipt',
    sourceApplyReceiptFingerprint: 'wrong-fingerprint',
    sourceGuardFingerprint: 'wrong-guard-fingerprint',
    previousVersionKey: 'wrong-previous',
    activatedVersionKey: 'wrong-target',
    versionPointerFingerprint: 'wrong-pointer',
    activationEventRecorded: false,
    productionWriteCountObserved: 2,
    activationPerformedBySeparateApplyCommand: false,
    rollbackPlanReference: 'wrong-rollback',
  },
  routeHealthSnapshots: [],
})

assert.equal(blockedCloseout.canClosePostRenewal, false)
assert.ok(blockedCloseout.blockerCodes.includes('renewal_activation_observation_id_missing'))
assert.ok(blockedCloseout.blockerCodes.includes('renewal_activation_environment_not_production'))
assert.ok(blockedCloseout.blockerCodes.includes('renewal_activation_apply_receipt_fingerprint_mismatch'))
assert.ok(blockedCloseout.blockerCodes.includes('renewal_activation_write_count_unexpected'))
assert.ok(blockedCloseout.blockerCodes.includes('post_renewal_missing_route_snapshot:new_development'))

const markdown = formatOtpPostRenewalMonitoringCloseoutPhase53Markdown(audit)
for (const token of [
  'OTP Generator Phase 53 Post-Renewal Monitoring And Closeout',
  'OTP_POST_RENEWAL_MONITORING_CLOSEOUT_READY_FOR_STEADY_STATE_RENEWAL_GOVERNANCE',
  'rollback_trigger:post_renewal_template_default_drift:resale_existing_property',
  'phase52_apply_receipt',
  'Phase 54: Template Renewal Steady-State Review',
  'resale_existing_property',
  'new_development',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP post-renewal monitoring closeout Phase 53 contract passed.')
