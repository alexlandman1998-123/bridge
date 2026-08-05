import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_SIGNING_DISPATCH_DRY_RUN_CONTRACT,
  OTP_SIGNING_DISPATCH_DRY_RUN_PHASE15_VERSION,
  OTP_SIGNING_DISPATCH_DRY_RUN_READY_EVIDENCE,
  OTP_SIGNING_DISPATCH_DRY_RUN_READY_STATUS,
  buildOtpSigningDispatchDryRunPhase15Audit,
  formatOtpSigningDispatchDryRunPhase15Markdown,
} from '../src/core/documents/otpSigningDispatchDryRunPhase15.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-signing-dispatch-dry-run-phase15'],
  'node scripts/otp-signing-dispatch-dry-run-phase15.test.mjs',
  'package.json should expose the OTP signing dispatch dry-run Phase 15 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-signing-dispatch-dry-run-phase15'],
  'node scripts/report-otp-signing-dispatch-dry-run-phase15.mjs',
  'package.json should expose the OTP Phase 15 signing dispatch dry-run report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-signing-dispatch-dry-run-phase15'),
  'OTP vNext verification should include Phase 15 signing dispatch dry-run checks.',
)

assert.equal(OTP_SIGNING_DISPATCH_DRY_RUN_PHASE15_VERSION, 'otp_signing_dispatch_dry_run_phase15_v1')
assert.equal(OTP_SIGNING_DISPATCH_DRY_RUN_READY_STATUS, 'OTP_SIGNING_DISPATCH_DRY_RUN_READY_FOR_SIGNER_SESSION_QA')
assert.equal(OTP_SIGNING_DISPATCH_DRY_RUN_CONTRACT, 'otp-vnext-signing-dispatch-dry-run-phase15-v1')

const audit = buildOtpSigningDispatchDryRunPhase15Audit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.version, OTP_SIGNING_DISPATCH_DRY_RUN_PHASE15_VERSION)
assert.equal(audit.contract, OTP_SIGNING_DISPATCH_DRY_RUN_CONTRACT)
assert.equal(audit.status, OTP_SIGNING_DISPATCH_DRY_RUN_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.canProceedToSignerSessionQa, true)
assert.equal(audit.envelopeQa.status, 'OTP_SIGNING_ENVELOPE_QA_READY_FOR_SIGNING_DISPATCH_DRY_RUN')
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.provedDryRunCount, 2)
assert.equal(audit.summary.recipientCount, 6)
assert.equal(audit.summary.insecureLinkCount, 0)
assert.equal(audit.summary.routeLeakCount, 0)
assert.equal(audit.summary.unsuppressedDeliveryCount, 0)
assert.equal(audit.summary.missingAuditEventCount, 0)
assert.equal(audit.summary.missingStopConditionCount, 0)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

const resale = audit.routeRows.find((row) => row.routeKey === 'resale_existing_property')
const development = audit.routeRows.find((row) => row.routeKey === 'new_development')
assert.deepEqual(resale.recipientRoles, ['purchaser_1', 'seller'])
assert.equal(resale.recipientCount, 2)
assert.equal(resale.deliverySuppressed, true)
assert.deepEqual(development.recipientRoles, ['purchaser_1', 'developer_authorised_signatory', 'contractor_authorised_signatory', 'agent'])
assert.equal(development.recipientCount, 4)
assert.equal(development.deliverySuppressed, true)

for (const check of [
  'PHASE15_SIGNING_ENVELOPE_QA_READY',
  'PHASE15_BOTH_ROUTE_DISPATCH_DRY_RUNS_PROVED',
  'PHASE15_EXACT_ENVELOPE_BOUND',
  'PHASE15_RECIPIENT_MAPPING_COMPLETE',
  'PHASE15_SECURE_LINKS_READY',
  'PHASE15_EMAIL_AND_PROVIDER_SUPPRESSED',
  'PHASE15_ROUTE_RECIPIENTS_SEPARATE',
  'PHASE15_AUDIT_EVENTS_PLANNED',
  'PHASE15_STOP_CONDITIONS_BOUND',
  'PHASE15_ROLLBACK_REFERENCE_BOUND',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const missingRecipient = buildOtpSigningDispatchDryRunPhase15Audit({
  dispatchEvidence: OTP_SIGNING_DISPATCH_DRY_RUN_READY_EVIDENCE.map((item) => item.routeKey === 'resale_existing_property'
    ? {
        ...item,
        recipients: item.recipients.filter((recipient) => recipient.signerRole !== 'seller'),
      }
    : item),
})
assert.equal(missingRecipient.status, 'OTP_SIGNING_DISPATCH_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(missingRecipient.checks.find((item) => item.code === 'PHASE15_RECIPIENT_MAPPING_COMPLETE')?.pass, false)

const insecureLink = buildOtpSigningDispatchDryRunPhase15Audit({
  dispatchEvidence: OTP_SIGNING_DISPATCH_DRY_RUN_READY_EVIDENCE.map((item) => item.routeKey === 'new_development'
    ? {
        ...item,
        recipients: item.recipients.map((recipient) => recipient.signerRole === 'agent'
          ? { ...recipient, secureLinkReady: false, tokenDigest: '' }
          : recipient),
      }
    : item),
})
assert.equal(insecureLink.status, 'OTP_SIGNING_DISPATCH_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(insecureLink.checks.find((item) => item.code === 'PHASE15_SECURE_LINKS_READY')?.pass, false)

const unsuppressedEmail = buildOtpSigningDispatchDryRunPhase15Audit({
  dispatchEvidence: OTP_SIGNING_DISPATCH_DRY_RUN_READY_EVIDENCE.map((item) => item.routeKey === 'new_development'
    ? {
        ...item,
        emailsSent: true,
        emailDeliverySuppressed: false,
      }
    : item),
})
assert.equal(unsuppressedEmail.status, 'OTP_SIGNING_DISPATCH_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(unsuppressedEmail.checks.find((item) => item.code === 'PHASE15_EMAIL_AND_PROVIDER_SUPPRESSED')?.pass, false)

const missingAudit = buildOtpSigningDispatchDryRunPhase15Audit({
  dispatchEvidence: OTP_SIGNING_DISPATCH_DRY_RUN_READY_EVIDENCE.map((item) => item.routeKey === 'resale_existing_property'
    ? {
        ...item,
        auditEventsPlanned: ['otp_signing_dispatch_dry_run_prepared'],
      }
    : item),
})
assert.equal(missingAudit.status, 'OTP_SIGNING_DISPATCH_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(missingAudit.checks.find((item) => item.code === 'PHASE15_AUDIT_EVENTS_PLANNED')?.pass, false)

const markdown = formatOtpSigningDispatchDryRunPhase15Markdown(audit)
for (const token of [
  'OTP Template vNext Phase 15 Signing Dispatch Dry Run',
  'OTP_SIGNING_DISPATCH_DRY_RUN_READY_FOR_SIGNER_SESSION_QA',
  'PHASE15_SECURE_LINKS_READY',
  'PHASE15_EMAIL_AND_PROVIDER_SUPPRESSED',
  'otp-vnext-disable-staging-signing-dispatch',
  'developer_authorised_signatory',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpSigningDispatchDryRunPhase15.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_SIGNING_DISPATCH_DRY_RUN_PHASE15_VERSION',
  'OTP_SIGNING_DISPATCH_DRY_RUN_READY_EVIDENCE',
  'buildOtpSigningEnvelopeQaPhase14Audit',
  'dry_run_prepare_only',
  'emailDeliverySuppressed',
  'providerEnvelopeCreated',
  'otp_signer_secure_link_dry_run_prepared',
  'rollback_unavailable',
  'mutatedData: false',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP signing dispatch dry-run Phase 15 contract passed.')
