import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_FINAL_COMPLETION_DRY_RUN_CONTRACT,
  OTP_FINAL_COMPLETION_DRY_RUN_PHASE17_VERSION,
  OTP_FINAL_COMPLETION_DRY_RUN_READY_EVIDENCE,
  OTP_FINAL_COMPLETION_DRY_RUN_READY_STATUS,
  buildOtpFinalCompletionDryRunPhase17Audit,
  formatOtpFinalCompletionDryRunPhase17Markdown,
} from '../src/core/documents/otpFinalCompletionDryRunPhase17.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-final-completion-dry-run-phase17'],
  'node scripts/otp-final-completion-dry-run-phase17.test.mjs',
  'package.json should expose the OTP final completion dry-run Phase 17 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-final-completion-dry-run-phase17'],
  'node scripts/report-otp-final-completion-dry-run-phase17.mjs',
  'package.json should expose the OTP Phase 17 final completion dry-run report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-final-completion-dry-run-phase17'),
  'OTP vNext verification should include Phase 17 final completion dry-run checks.',
)

assert.equal(OTP_FINAL_COMPLETION_DRY_RUN_PHASE17_VERSION, 'otp_final_completion_dry_run_phase17_v1')
assert.equal(OTP_FINAL_COMPLETION_DRY_RUN_READY_STATUS, 'OTP_FINAL_COMPLETION_DRY_RUN_READY_FOR_RELEASE_CANDIDATE_LOCK')
assert.equal(OTP_FINAL_COMPLETION_DRY_RUN_CONTRACT, 'otp-vnext-final-completion-dry-run-phase17-v1')

const audit = buildOtpFinalCompletionDryRunPhase17Audit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.version, OTP_FINAL_COMPLETION_DRY_RUN_PHASE17_VERSION)
assert.equal(audit.contract, OTP_FINAL_COMPLETION_DRY_RUN_CONTRACT)
assert.equal(audit.status, OTP_FINAL_COMPLETION_DRY_RUN_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.canProceedToReleaseCandidateLock, true)
assert.equal(audit.signerSessionQa.status, 'OTP_SIGNER_SESSION_QA_READY_FOR_FINAL_COMPLETION_DRY_RUN')
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.provedCompletionCount, 2)
assert.equal(audit.summary.requiredSignerCount, 6)
assert.equal(audit.summary.completedSignerCount, 6)
assert.equal(audit.summary.requiredFieldCount, 136)
assert.equal(audit.summary.completedRequiredFieldCount, 136)
assert.equal(audit.summary.finalArtifactMutationCount, 0)
assert.equal(audit.summary.providerCallbackLeakCount, 0)
assert.equal(audit.summary.routeLeakCount, 0)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

const resale = audit.routeRows.find((row) => row.routeKey === 'resale_existing_property')
const development = audit.routeRows.find((row) => row.routeKey === 'new_development')
assert.equal(resale.requiredSignerCount, 2)
assert.equal(resale.requiredFieldCount, 40)
assert.deepEqual(resale.completedSignerRoles, ['purchaser_1', 'seller'])
assert.equal(resale.pass, true)
assert.equal(development.requiredSignerCount, 4)
assert.equal(development.requiredFieldCount, 96)
assert.deepEqual(development.completedSignerRoles, ['purchaser_1', 'developer_authorised_signatory', 'contractor_authorised_signatory', 'agent'])
assert.equal(development.pass, true)

for (const check of [
  'PHASE17_SIGNER_SESSION_QA_READY',
  'PHASE17_BOTH_ROUTE_COMPLETIONS_PROVED',
  'PHASE17_ALL_REQUIRED_SIGNERS_COMPLETE',
  'PHASE17_ALL_REQUIRED_FIELDS_COMPLETE',
  'PHASE17_EXACT_ENVELOPE_AND_PDF_BOUND',
  'PHASE17_FINAL_ARTIFACT_MUTATION_SUPPRESSED',
  'PHASE17_PROVIDER_CALLBACK_SUPPRESSED',
  'PHASE17_ROUTE_COMPLETION_SEPARATION_PROVED',
  'PHASE17_AUDIT_EVENTS_PLANNED',
  'PHASE17_STOP_CONDITIONS_BOUND',
  'PHASE17_ROLLBACK_REFERENCE_BOUND',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const missingSigner = buildOtpFinalCompletionDryRunPhase17Audit({
  completionEvidence: OTP_FINAL_COMPLETION_DRY_RUN_READY_EVIDENCE.map((item) => item.routeKey === 'resale_existing_property'
    ? {
        ...item,
        completedSignerRoles: item.completedSignerRoles.filter((role) => role !== 'seller'),
      }
    : item),
})
assert.equal(missingSigner.status, 'OTP_FINAL_COMPLETION_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(missingSigner.checks.find((item) => item.code === 'PHASE17_ALL_REQUIRED_SIGNERS_COMPLETE')?.pass, false)

const missingField = buildOtpFinalCompletionDryRunPhase17Audit({
  completionEvidence: OTP_FINAL_COMPLETION_DRY_RUN_READY_EVIDENCE.map((item) => item.routeKey === 'new_development'
    ? {
        ...item,
        completedRequiredFieldIds: item.completedRequiredFieldIds.slice(1),
      }
    : item),
})
assert.equal(missingField.status, 'OTP_FINAL_COMPLETION_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(missingField.checks.find((item) => item.code === 'PHASE17_ALL_REQUIRED_FIELDS_COMPLETE')?.pass, false)

const realArtifactMutation = buildOtpFinalCompletionDryRunPhase17Audit({
  completionEvidence: OTP_FINAL_COMPLETION_DRY_RUN_READY_EVIDENCE.map((item) => item.routeKey === 'resale_existing_property'
    ? {
        ...item,
        finalArtifactCreated: true,
      }
    : item),
})
assert.equal(realArtifactMutation.status, 'OTP_FINAL_COMPLETION_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(realArtifactMutation.checks.find((item) => item.code === 'PHASE17_FINAL_ARTIFACT_MUTATION_SUPPRESSED')?.pass, false)

const callbackLeak = buildOtpFinalCompletionDryRunPhase17Audit({
  completionEvidence: OTP_FINAL_COMPLETION_DRY_RUN_READY_EVIDENCE.map((item) => item.routeKey === 'new_development'
    ? {
        ...item,
        providerCompletionCallbackSuppressed: false,
      }
    : item),
})
assert.equal(callbackLeak.status, 'OTP_FINAL_COMPLETION_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(callbackLeak.checks.find((item) => item.code === 'PHASE17_PROVIDER_CALLBACK_SUPPRESSED')?.pass, false)

const wrongPdf = buildOtpFinalCompletionDryRunPhase17Audit({
  completionEvidence: OTP_FINAL_COMPLETION_DRY_RUN_READY_EVIDENCE.map((item) => item.routeKey === 'resale_existing_property'
    ? {
        ...item,
        renderedSha256: 'sha256:wrong-final-completion-pdf',
      }
    : item),
})
assert.equal(wrongPdf.status, 'OTP_FINAL_COMPLETION_DRY_RUN_REMEDIATION_REQUIRED')
assert.equal(wrongPdf.checks.find((item) => item.code === 'PHASE17_EXACT_ENVELOPE_AND_PDF_BOUND')?.pass, false)

const markdown = formatOtpFinalCompletionDryRunPhase17Markdown(audit)
for (const token of [
  'OTP Template vNext Phase 17 Final Completion Dry Run',
  'OTP_FINAL_COMPLETION_DRY_RUN_READY_FOR_RELEASE_CANDIDATE_LOCK',
  'PHASE17_ALL_REQUIRED_SIGNERS_COMPLETE',
  'PHASE17_FINAL_ARTIFACT_MUTATION_SUPPRESSED',
  'developer_authorised_signatory',
  'contractor_authorised_signatory',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpFinalCompletionDryRunPhase17.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_FINAL_COMPLETION_DRY_RUN_PHASE17_VERSION',
  'OTP_FINAL_COMPLETION_DRY_RUN_READY_EVIDENCE',
  'buildOtpSignerSessionQaPhase16Audit',
  'completionMode',
  'dry_run_simulation',
  'finalArtifactCreated: false',
  'providerCompletionCallbackSuppressed',
  'databaseMutationSuppressed',
  'mutatedData: false',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP final completion dry-run Phase 17 contract passed.')
