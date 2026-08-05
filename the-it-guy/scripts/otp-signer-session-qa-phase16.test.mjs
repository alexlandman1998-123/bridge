import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_SIGNER_SESSION_QA_CONTRACT,
  OTP_SIGNER_SESSION_QA_PHASE16_VERSION,
  OTP_SIGNER_SESSION_QA_READY_EVIDENCE,
  OTP_SIGNER_SESSION_QA_READY_STATUS,
  buildOtpSignerSessionQaPhase16Audit,
  formatOtpSignerSessionQaPhase16Markdown,
} from '../src/core/documents/otpSignerSessionQaPhase16.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-signer-session-qa-phase16'],
  'node scripts/otp-signer-session-qa-phase16.test.mjs',
  'package.json should expose the OTP signer-session QA Phase 16 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-signer-session-qa-phase16'],
  'node scripts/report-otp-signer-session-qa-phase16.mjs',
  'package.json should expose the OTP Phase 16 signer-session QA report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-signer-session-qa-phase16'),
  'OTP vNext verification should include Phase 16 signer-session QA checks.',
)

assert.equal(OTP_SIGNER_SESSION_QA_PHASE16_VERSION, 'otp_signer_session_qa_phase16_v1')
assert.equal(OTP_SIGNER_SESSION_QA_READY_STATUS, 'OTP_SIGNER_SESSION_QA_READY_FOR_FINAL_COMPLETION_DRY_RUN')
assert.equal(OTP_SIGNER_SESSION_QA_CONTRACT, 'otp-vnext-signer-session-qa-phase16-v1')

const audit = buildOtpSignerSessionQaPhase16Audit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.version, OTP_SIGNER_SESSION_QA_PHASE16_VERSION)
assert.equal(audit.contract, OTP_SIGNER_SESSION_QA_CONTRACT)
assert.equal(audit.status, OTP_SIGNER_SESSION_QA_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.canProceedToFinalCompletionDryRun, true)
assert.equal(audit.dispatchDryRun.status, 'OTP_SIGNING_DISPATCH_DRY_RUN_READY_FOR_SIGNER_SESSION_QA')
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.provedSessionRouteCount, 2)
assert.equal(audit.summary.sessionCount, 6)
assert.equal(audit.summary.visibleOtherSignerFieldCount, 0)
assert.equal(audit.summary.completedFieldCount, 0)
assert.equal(audit.summary.invalidSessionCount, 0)
assert.equal(audit.summary.missingAuditEventCount, 0)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

const resale = audit.routeRows.find((row) => row.routeKey === 'resale_existing_property')
const development = audit.routeRows.find((row) => row.routeKey === 'new_development')
assert.deepEqual(resale.sessionRoles, ['purchaser_1', 'seller'])
assert.equal(resale.sessionCount, 2)
assert.equal(resale.pass, true)
assert.deepEqual(development.sessionRoles, ['purchaser_1', 'developer_authorised_signatory', 'contractor_authorised_signatory', 'agent'])
assert.equal(development.sessionCount, 4)
assert.equal(development.pass, true)

for (const check of [
  'PHASE16_DISPATCH_DRY_RUN_READY',
  'PHASE16_BOTH_ROUTE_SIGNER_SESSIONS_PROVED',
  'PHASE16_EXACT_DISPATCH_BOUND',
  'PHASE16_ALL_SIGNER_SESSIONS_OPEN',
  'PHASE16_EXACT_PDF_AND_FIELD_SCOPE_VALID',
  'PHASE16_NO_CROSS_SIGNER_FIELD_VISIBILITY',
  'PHASE16_COMPLETION_SUPPRESSED',
  'PHASE16_CROSS_SIGNER_MUTATION_BLOCKED',
  'PHASE16_SESSION_AUDIT_EVENTS_PLANNED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const missingSession = buildOtpSignerSessionQaPhase16Audit({
  sessionEvidence: OTP_SIGNER_SESSION_QA_READY_EVIDENCE.map((item) => item.routeKey === 'resale_existing_property'
    ? {
        ...item,
        sessions: item.sessions.filter((session) => session.signerRole !== 'seller'),
      }
    : item),
})
assert.equal(missingSession.status, 'OTP_SIGNER_SESSION_QA_REMEDIATION_REQUIRED')
assert.equal(missingSession.checks.find((item) => item.code === 'PHASE16_ALL_SIGNER_SESSIONS_OPEN')?.pass, false)

const crossVisible = buildOtpSignerSessionQaPhase16Audit({
  sessionEvidence: OTP_SIGNER_SESSION_QA_READY_EVIDENCE.map((item) => item.routeKey === 'new_development'
    ? {
        ...item,
        sessions: item.sessions.map((session) => session.signerRole === 'agent'
          ? { ...session, visibleOtherSignerFieldCount: 1 }
          : session),
      }
    : item),
})
assert.equal(crossVisible.status, 'OTP_SIGNER_SESSION_QA_REMEDIATION_REQUIRED')
assert.equal(crossVisible.checks.find((item) => item.code === 'PHASE16_NO_CROSS_SIGNER_FIELD_VISIBILITY')?.pass, false)

const completedField = buildOtpSignerSessionQaPhase16Audit({
  sessionEvidence: OTP_SIGNER_SESSION_QA_READY_EVIDENCE.map((item) => item.routeKey === 'new_development'
    ? {
        ...item,
        sessions: item.sessions.map((session) => session.signerRole === 'purchaser_1'
          ? { ...session, canComplete: true, completedFieldCount: 1 }
          : session),
      }
    : item),
})
assert.equal(completedField.status, 'OTP_SIGNER_SESSION_QA_REMEDIATION_REQUIRED')
assert.equal(completedField.checks.find((item) => item.code === 'PHASE16_COMPLETION_SUPPRESSED')?.pass, false)

const wrongPdf = buildOtpSignerSessionQaPhase16Audit({
  sessionEvidence: OTP_SIGNER_SESSION_QA_READY_EVIDENCE.map((item) => item.routeKey === 'resale_existing_property'
    ? {
        ...item,
        sessions: item.sessions.map((session) => session.signerRole === 'seller'
          ? { ...session, renderedSha256: 'sha256:wrong-pdf' }
          : session),
      }
    : item),
})
assert.equal(wrongPdf.status, 'OTP_SIGNER_SESSION_QA_REMEDIATION_REQUIRED')
assert.equal(wrongPdf.checks.find((item) => item.code === 'PHASE16_EXACT_PDF_AND_FIELD_SCOPE_VALID')?.pass, false)

const markdown = formatOtpSignerSessionQaPhase16Markdown(audit)
for (const token of [
  'OTP Template vNext Phase 16 Signer Session QA',
  'OTP_SIGNER_SESSION_QA_READY_FOR_FINAL_COMPLETION_DRY_RUN',
  'PHASE16_NO_CROSS_SIGNER_FIELD_VISIBILITY',
  'PHASE16_COMPLETION_SUPPRESSED',
  'developer_authorised_signatory',
  'contractor_authorised_signatory',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpSignerSessionQaPhase16.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_SIGNER_SESSION_QA_PHASE16_VERSION',
  'OTP_SIGNER_SESSION_QA_READY_EVIDENCE',
  'buildOtpSigningDispatchDryRunPhase15Audit',
  'completionSuppressed',
  'crossSignerMutationBlocked',
  'exactPdfVisible',
  'visibleOtherSignerFieldCount',
  'otp_signer_session_qa_scope_verified',
  'mutatedData: false',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP signer-session QA Phase 16 contract passed.')
