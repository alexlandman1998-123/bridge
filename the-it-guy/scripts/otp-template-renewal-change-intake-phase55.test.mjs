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
  buildOtpTemplateRenewalSteadyStateReviewPhase54Audit,
} from '../src/core/documents/otpTemplateRenewalSteadyStateReviewPhase54.js'
import {
  OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_CONTRACT,
  OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_PHASE55_VERSION,
  OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_READY_STATUS,
  buildOtpTemplateRenewalChangeIntakePhase55Audit,
  buildOtpTemplateRenewalChangeIntakeReceipt,
  formatOtpTemplateRenewalChangeIntakePhase55Markdown,
} from '../src/core/documents/otpTemplateRenewalChangeIntakePhase55.js'

const checkedAt = '2026-08-06T13:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase55Source = await readFile(new URL('../src/core/documents/otpTemplateRenewalChangeIntakePhase55.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-template-renewal-change-intake-phase55'],
  'node scripts/otp-template-renewal-change-intake-phase55.test.mjs',
  'package.json should expose the OTP template renewal change intake Phase 55 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-template-renewal-change-intake-phase55'],
  'node scripts/report-otp-template-renewal-change-intake-phase55.mjs',
  'package.json should expose the OTP template renewal change intake Phase 55 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-change-intake-phase55'),
  'OTP vNext verification should include Phase 55 template renewal change intake.',
)

assert.equal(OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_PHASE55_VERSION, 'otp_template_renewal_change_intake_phase55_v1')
assert.equal(OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_CONTRACT, 'otp-vnext-template-renewal-change-intake-phase55-v1')
assert.equal(OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_READY_STATUS, 'OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_READY_FOR_SCOPING_AND_TRIAGE')

for (const token of [
  'PHASE55_UNSUPPORTED_CHANGE_TYPE_BLOCKED',
  'PHASE55_MISSING_ROUTE_IMPACT_BLOCKED',
  'PHASE55_DOCX_SOURCE_BLOCKED',
  'PHASE55_ATTORNEY_SCREENING_BLOCKED',
  'PHASE55_ROLLBACK_EXPECTATION_BLOCKED',
  'PHASE55_PRODUCTION_WRITE_BLOCKED',
  'PHASE55_BAD_EVIDENCE_BLOCKED',
]) {
  assert.ok(phase55Source.includes(token), `phase55 source should include ${token}`)
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
const phase54Audit = buildOtpTemplateRenewalSteadyStateReviewPhase54Audit({
  checkedAt,
  phase53Audit,
  packageJson,
})
const audit = buildOtpTemplateRenewalChangeIntakePhase55Audit({
  checkedAt,
  phase54Audit,
  packageJson,
})

assert.equal(audit.version, OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_PHASE55_VERSION)
assert.equal(audit.contract, OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_CONTRACT)
assert.equal(audit.status, OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.mutatedData, false)
assert.equal(audit.nextPhase.phase, 56)
assert.equal(audit.nextPhase.key, 'otp_template_renewal_scoping_and_triage')

for (const check of [
  'PHASE55_PHASE54_REVIEW_READY',
  'PHASE55_GOOD_INTAKE_READY',
  'PHASE55_INTAKE_BOUND_TO_PHASE54_REVIEW',
  'PHASE55_BOTH_ROUTES_SCREENED',
  'PHASE55_REQUIRED_TRIAGE_STEPS_PASSED',
  'PHASE55_ATTORNEY_SCREENING_QUEUED_NOT_APPROVED',
  'PHASE55_NO_PRODUCTION_WRITE_ALLOWED',
  'PHASE55_UNSUPPORTED_CHANGE_TYPE_BLOCKED',
  'PHASE55_MISSING_ROUTE_IMPACT_BLOCKED',
  'PHASE55_DOCX_SOURCE_BLOCKED',
  'PHASE55_ATTORNEY_SCREENING_BLOCKED',
  'PHASE55_ROLLBACK_EXPECTATION_BLOCKED',
  'PHASE55_PRODUCTION_WRITE_BLOCKED',
  'PHASE55_MISSING_APPROVAL_BLOCKED',
  'PHASE55_BAD_EVIDENCE_BLOCKED',
  'PHASE55_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodReview = phase54Audit.reviewReceipts.find((receipt) => receipt.canContinueRenewalSteadyState)
const blockedReceipt = buildOtpTemplateRenewalChangeIntakeReceipt({
  checkedAt,
  phase54Review: goodReview,
  intakeRequest: {
    intakeRequestId: '',
    status: 'draft',
    requestedAt: '',
    requestSummary: '',
    businessReason: '',
    requester: '',
    templateOwner: '',
    governanceOwner: '',
    affectedRoutes: ['resale_existing_property'],
    changeTypes: ['unknown_change'],
    riskLevel: '',
    productionWriteRequested: true,
    emergencyOverride: true,
    intakeOnly: false,
  },
  routeImpactEntries: [],
  triageSteps: [],
  attorneyScreening: {
    reviewRequired: false,
    legalReviewQueued: false,
    approvalStatus: 'approved',
    attorneyApprovalGranted: true,
    unresolvedLegalHoldCount: 1,
    screeningReference: '',
    notesArchived: false,
  },
  rollbackExpectation: {
    rollbackPlanRequired: false,
    rollbackOwner: '',
    rollbackExpectationReference: '',
    dryRunReviewRequired: false,
    restorePreviousDefaultsExpected: false,
    stopSigningDispatchExpected: false,
    productionWriteNotAllowed: false,
  },
  approvals: [],
  evidence: [],
  noWriteProof: {
    intakeOnly: false,
    productionWriteAttempted: true,
    liveWriteGuardBypassed: true,
    templateDefaultMutationCount: 1,
    versionPointerMutationCount: 1,
    signingEnvelopeMutationCount: 1,
    dispatchMutationCount: 1,
  },
})

assert.equal(blockedReceipt.canAcceptChangeIntake, false)
for (const blocker of [
  'intake_request_id_missing',
  'intake_request_not_submitted',
  'intake_unsupported_change_type:unknown_change',
  'intake_affected_route_missing:new_development',
  'intake_route_impact_missing:resale_existing_property',
  'intake_route_impact_missing:new_development',
  'intake_triage_step_missing:duplicate_check',
  'attorney_screening_not_queued',
  'attorney_screening_premature_approval',
  'intake_rollback_owner_missing',
  'intake_acknowledgement_missing:template_owner',
  'intake_evidence_missing:no_write_attestation',
  'intake_production_write_attempted',
]) {
  assert.ok(blockedReceipt.blockerCodes.includes(blocker), `blocked receipt should include ${blocker}`)
}

const markdown = formatOtpTemplateRenewalChangeIntakePhase55Markdown(audit)
for (const token of [
  'OTP Generator Phase 55 Template Renewal Change Intake',
  'OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_READY_FOR_SCOPING_AND_TRIAGE',
  'attorney_screening',
  'Phase 56: Template Renewal Scoping And Triage',
  'resale_existing_property',
  'new_development',
  'intake_docx_source_observed:resale_existing_property',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP template renewal change intake Phase 55 contract passed.')
