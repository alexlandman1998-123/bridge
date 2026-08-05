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
  buildOtpTemplateRenewalChangeIntakePhase55Audit,
} from '../src/core/documents/otpTemplateRenewalChangeIntakePhase55.js'
import {
  OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_CONTRACT,
  OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_PHASE56_VERSION,
  OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_READY_STATUS,
  buildOtpTemplateRenewalScopingAndTriagePhase56Audit,
  buildOtpTemplateRenewalScopingAndTriageReceipt,
  formatOtpTemplateRenewalScopingAndTriagePhase56Markdown,
} from '../src/core/documents/otpTemplateRenewalScopingAndTriagePhase56.js'

const checkedAt = '2026-08-06T14:30:00.000Z'
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase56Source = await readFile(new URL('../src/core/documents/otpTemplateRenewalScopingAndTriagePhase56.js', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-template-renewal-scoping-and-triage-phase56'],
  'node scripts/otp-template-renewal-scoping-and-triage-phase56.test.mjs',
  'package.json should expose the OTP template renewal scoping and triage Phase 56 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-template-renewal-scoping-and-triage-phase56'],
  'node scripts/report-otp-template-renewal-scoping-and-triage-phase56.mjs',
  'package.json should expose the OTP template renewal scoping and triage Phase 56 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-template-renewal-scoping-and-triage-phase56'),
  'OTP vNext verification should include Phase 56 template renewal scoping and triage.',
)

assert.equal(OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_PHASE56_VERSION, 'otp_template_renewal_scoping_and_triage_phase56_v1')
assert.equal(OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_CONTRACT, 'otp-vnext-template-renewal-scoping-and-triage-phase56-v1')
assert.equal(OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_READY_STATUS, 'OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_READY_FOR_WORK_PACKAGE_DRAFT')

for (const token of [
  'PHASE56_INTAKE_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE56_MISSING_ROUTE_SCOPE_BLOCKED',
  'PHASE56_DOCX_SOURCE_BLOCKED',
  'PHASE56_INCOMPLETE_ROUTE_SCOPE_BLOCKED',
  'PHASE56_RISK_ESCALATION_BLOCKED',
  'PHASE56_ATTORNEY_TRIAGE_BLOCKED',
  'PHASE56_PRODUCTION_WRITE_BLOCKED',
]) {
  assert.ok(phase56Source.includes(token), `phase56 source should include ${token}`)
}

const phase48Audit = buildOtpControlledVersionRenewalActivationDryRunPhase48Audit({ checkedAt, packageJson })
const phase49Audit = buildOtpVersionRenewalActivationReceiptPhase49Audit({ checkedAt, phase48Audit, packageJson })
const phase50Audit = buildOtpVersionRenewalLiveWriteGuardPhase50Audit({ checkedAt, phase49Audit, packageJson })
const phase51Audit = buildOtpControlledVersionRenewalApplyDryRunPhase51Audit({ checkedAt, phase50Audit, packageJson })
const phase52Audit = buildOtpVersionRenewalApplyReceiptPhase52Audit({ checkedAt, phase51Audit, packageJson })
const phase53Audit = buildOtpPostRenewalMonitoringCloseoutPhase53Audit({ checkedAt, phase52Audit, packageJson })
const phase54Audit = buildOtpTemplateRenewalSteadyStateReviewPhase54Audit({ checkedAt, phase53Audit, packageJson })
const phase55Audit = buildOtpTemplateRenewalChangeIntakePhase55Audit({ checkedAt, phase54Audit, packageJson })
const audit = buildOtpTemplateRenewalScopingAndTriagePhase56Audit({
  checkedAt,
  phase55Audit,
  packageJson,
})

assert.equal(audit.version, OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_PHASE56_VERSION)
assert.equal(audit.contract, OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_CONTRACT)
assert.equal(audit.status, OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_READY_STATUS)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.mutatedData, false)
assert.equal(audit.nextPhase.phase, 57)
assert.equal(audit.nextPhase.key, 'otp_template_renewal_work_package_draft')

for (const check of [
  'PHASE56_PHASE55_INTAKE_READY',
  'PHASE56_GOOD_SCOPING_READY',
  'PHASE56_SCOPING_BOUND_TO_INTAKE',
  'PHASE56_ROUTE_WORK_PACKAGES_SEPARATED',
  'PHASE56_ROUTE_SCOPE_FIELDS_COMPLETE',
  'PHASE56_ATTORNEY_TRIAGE_QUEUED_NOT_APPROVED',
  'PHASE56_TEST_PLAN_SCOPED',
  'PHASE56_NO_PRODUCTION_WRITE_ALLOWED',
  'PHASE56_INTAKE_FINGERPRINT_MISMATCH_BLOCKED',
  'PHASE56_MISSING_ROUTE_SCOPE_BLOCKED',
  'PHASE56_DOCX_SOURCE_BLOCKED',
  'PHASE56_INCOMPLETE_ROUTE_SCOPE_BLOCKED',
  'PHASE56_RISK_ESCALATION_BLOCKED',
  'PHASE56_ASSIGNMENT_BLOCKED',
  'PHASE56_ATTORNEY_TRIAGE_BLOCKED',
  'PHASE56_TEST_PLAN_BLOCKED',
  'PHASE56_ROLLBACK_PLAN_BLOCKED',
  'PHASE56_PRODUCTION_WRITE_BLOCKED',
  'PHASE56_PACKAGE_SCRIPTS_WIRED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const goodIntake = phase55Audit.intakeReceipts.find((receipt) => receipt.canAcceptChangeIntake)
const blockedReceipt = buildOtpTemplateRenewalScopingAndTriageReceipt({
  checkedAt,
  intakeReceipt: goodIntake,
  scopeDecision: {
    scopingId: '',
    status: 'draft',
    scopedAt: '',
    intakeFingerprint: 'wrong',
    priority: '',
    scopeOwner: '',
    triageOwner: '',
    attorneyCoordinator: '',
    routeSeparationMode: 'combined',
    scopeSummary: '',
    inScopeChangeTypes: ['unknown_change'],
    outOfScopeChangeTypes: [],
    productionWriteRequested: true,
    emergencyOverride: true,
    scopedOnly: false,
  },
  routeScopePlans: [],
  riskClassification: {
    overallRisk: '',
    legalRisk: '',
    operationalRisk: '',
    signingRisk: '',
    dataMigrationRequired: true,
    productionMutationRequired: true,
    downtimeExpected: true,
    riskOwner: '',
    escalationRequired: true,
  },
  assignments: [],
  attorneyTriage: {
    reviewRequired: false,
    routeLegalReviewQueued: false,
    attorneyApprovalGranted: true,
    unresolvedLegalHoldCount: 1,
    reviewMode: 'approved',
    attorneyTriageReference: '',
    evidencePath: '',
  },
  testPlan: [],
  rollbackPlan: {
    rollbackScopeReference: '',
    owner: '',
    restorePreviousDefaultsPlanned: false,
    restorePreviousSigningEnvelopesPlanned: false,
    restoreVersionPointerPlanned: false,
    stopSigningDispatchPlanned: false,
    dryRunRequired: false,
    productionWriteNotAllowed: false,
  },
  noWriteProof: {
    scopedOnly: false,
    productionWriteAttempted: true,
    templateDefaultMutationCount: 1,
    signingEnvelopeMutationCount: 1,
    versionPointerMutationCount: 1,
    dispatchMutationCount: 1,
  },
})

assert.equal(blockedReceipt.canPrepareWorkPackageDraft, false)
for (const blocker of [
  'scoping_id_missing',
  'scoping_status_not_scoped',
  'scoping_intake_fingerprint_mismatch',
  'scoping_route_missing:resale_existing_property',
  'scoping_route_missing:new_development',
  'scoping_data_migration_requested',
  'scoping_assignment_missing:attorney_coordinator',
  'scoping_attorney_approval_premature',
  'scoping_test_plan_missing:generated_pdf_proof',
  'scoping_rollback_owner_missing',
  'scoping_production_write_attempted',
]) {
  assert.ok(blockedReceipt.blockerCodes.includes(blocker), `blocked receipt should include ${blocker}`)
}

const markdown = formatOtpTemplateRenewalScopingAndTriagePhase56Markdown(audit)
for (const token of [
  'OTP Generator Phase 56 Template Renewal Scoping And Triage',
  'OTP_TEMPLATE_RENEWAL_SCOPING_AND_TRIAGE_READY_FOR_WORK_PACKAGE_DRAFT',
  'Phase 57: Template Renewal Work Package Draft',
  'resale_existing_property',
  'new_development',
  'otp-renewal-resale-work-package-phase56',
  'otp-renewal-new-development-work-package-phase56',
  'scoping_docx_source_observed:resale_existing_property',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP template renewal scoping and triage Phase 56 contract passed.')
