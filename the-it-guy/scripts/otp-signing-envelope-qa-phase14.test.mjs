import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_SIGNING_ENVELOPE_QA_CONTRACT,
  OTP_SIGNING_ENVELOPE_QA_PHASE14_VERSION,
  OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE,
  OTP_SIGNING_ENVELOPE_QA_READY_STATUS,
  buildOtpSigningEnvelopeQaPhase14Audit,
  formatOtpSigningEnvelopeQaPhase14Markdown,
} from '../src/core/documents/otpSigningEnvelopeQaPhase14.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-signing-envelope-qa-phase14'],
  'node scripts/otp-signing-envelope-qa-phase14.test.mjs',
  'package.json should expose the OTP signing envelope QA Phase 14 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-signing-envelope-qa-phase14'],
  'node scripts/report-otp-signing-envelope-qa-phase14.mjs',
  'package.json should expose the OTP Phase 14 signing envelope QA report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-signing-envelope-qa-phase14'),
  'OTP vNext verification should include Phase 14 signing envelope QA checks.',
)

assert.equal(OTP_SIGNING_ENVELOPE_QA_PHASE14_VERSION, 'otp_signing_envelope_qa_phase14_v1')
assert.equal(OTP_SIGNING_ENVELOPE_QA_READY_STATUS, 'OTP_SIGNING_ENVELOPE_QA_READY_FOR_SIGNING_DISPATCH_DRY_RUN')
assert.equal(OTP_SIGNING_ENVELOPE_QA_CONTRACT, 'otp-vnext-signing-envelope-qa-phase14-v1')

const audit = buildOtpSigningEnvelopeQaPhase14Audit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.version, OTP_SIGNING_ENVELOPE_QA_PHASE14_VERSION)
assert.equal(audit.contract, OTP_SIGNING_ENVELOPE_QA_CONTRACT)
assert.equal(audit.status, OTP_SIGNING_ENVELOPE_QA_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.canProceedToDispatchDryRun, true)
assert.equal(audit.pdfProof.status, 'OTP_STAGING_SMOKE_PDF_PROOF_READY_FOR_SIGNING_QA')
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.provedEnvelopeCount, 2)
assert.equal(audit.summary.signerCount, 6)
assert.equal(audit.summary.fieldCount, 136)
assert.equal(audit.summary.initialsGapCount, 0)
assert.equal(audit.summary.routeLeakCount, 0)
assert.equal(audit.summary.dispatchedEnvelopeCount, 0)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

const resale = audit.routeRows.find((row) => row.routeKey === 'resale_existing_property')
const development = audit.routeRows.find((row) => row.routeKey === 'new_development')
assert.deepEqual(resale.signerRoles, ['purchaser_1', 'seller'])
assert.equal(resale.signerCount, 2)
assert.equal(resale.fieldCount, 40)
assert.equal(resale.pageCount, 18)
assert.equal(resale.pass, true)
assert.deepEqual(development.signerRoles, ['purchaser_1', 'developer_authorised_signatory', 'contractor_authorised_signatory', 'agent'])
assert.equal(development.signerCount, 4)
assert.equal(development.fieldCount, 96)
assert.equal(development.pageCount, 22)
assert.equal(development.pass, true)

for (const check of [
  'PHASE14_PDF_PROOF_READY',
  'PHASE14_BOTH_ROUTE_ENVELOPES_PROVED',
  'PHASE14_EXACT_GENERATED_VERSION_BOUND',
  'PHASE14_REQUIRED_SIGNERS_PRESENT',
  'PHASE14_SIGNATURE_FIELDS_PRESENT',
  'PHASE14_DATE_FIELDS_PRESENT',
  'PHASE14_INITIALS_ON_EVERY_PAGE',
  'PHASE14_FIELD_GEOMETRY_VALID',
  'PHASE14_ROUTE_SIGNING_ROLES_SEPARATE',
  'PHASE14_ENVELOPES_NOT_DISPATCHED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const missingInitial = buildOtpSigningEnvelopeQaPhase14Audit({
  envelopeEvidence: OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE.map((item) => item.routeKey === 'resale_existing_property'
    ? {
        ...item,
        fields: item.fields.filter((field) => !(field.signerRole === 'seller' && field.fieldType === 'initial' && field.pageNumber === 3)),
      }
    : item),
})
assert.equal(missingInitial.status, 'OTP_SIGNING_ENVELOPE_QA_REMEDIATION_REQUIRED')
assert.equal(missingInitial.checks.find((item) => item.code === 'PHASE14_INITIALS_ON_EVERY_PAGE')?.pass, false)

const missingDate = buildOtpSigningEnvelopeQaPhase14Audit({
  envelopeEvidence: OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE.map((item) => item.routeKey === 'new_development'
    ? {
        ...item,
        fields: item.fields.filter((field) => !(field.signerRole === 'agent' && field.fieldType === 'date')),
      }
    : item),
})
assert.equal(missingDate.status, 'OTP_SIGNING_ENVELOPE_QA_REMEDIATION_REQUIRED')
assert.equal(missingDate.checks.find((item) => item.code === 'PHASE14_DATE_FIELDS_PRESENT')?.pass, false)

const routeLeak = buildOtpSigningEnvelopeQaPhase14Audit({
  envelopeEvidence: OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE.map((item) => item.routeKey === 'resale_existing_property'
    ? {
        ...item,
        signers: [
          ...item.signers,
          {
            packetId: item.packetId,
            packetVersionId: item.versionId,
            organisationId: item.canaryOrganisationId,
            signerRole: 'developer_authorised_signatory',
            signerName: 'Developer authorised signatory',
            signerEmail: 'developer@test.example',
            signingOrder: 3,
            status: 'pending',
            required: true,
          },
        ],
      }
    : item),
})
assert.equal(routeLeak.status, 'OTP_SIGNING_ENVELOPE_QA_REMEDIATION_REQUIRED')
assert.equal(routeLeak.checks.find((item) => item.code === 'PHASE14_ROUTE_SIGNING_ROLES_SEPARATE')?.pass, false)

const dispatched = buildOtpSigningEnvelopeQaPhase14Audit({
  envelopeEvidence: OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE.map((item) => item.routeKey === 'new_development'
    ? {
        ...item,
        dispatchStatus: 'sent',
        signerLinksCreated: true,
      }
    : item),
})
assert.equal(dispatched.status, 'OTP_SIGNING_ENVELOPE_QA_REMEDIATION_REQUIRED')
assert.equal(dispatched.checks.find((item) => item.code === 'PHASE14_ENVELOPES_NOT_DISPATCHED')?.pass, false)

const markdown = formatOtpSigningEnvelopeQaPhase14Markdown(audit)
for (const token of [
  'OTP Template vNext Phase 14 Signing Envelope QA',
  'OTP_SIGNING_ENVELOPE_QA_READY_FOR_SIGNING_DISPATCH_DRY_RUN',
  'PHASE14_INITIALS_ON_EVERY_PAGE',
  'PHASE14_ROUTE_SIGNING_ROLES_SEPARATE',
  'developer_authorised_signatory',
  'contractor_authorised_signatory',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpSigningEnvelopeQaPhase14.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_SIGNING_ENVELOPE_QA_PHASE14_VERSION',
  'OTP_SIGNING_ENVELOPE_QA_READY_EVIDENCE',
  'buildOtpStagingSmokePdfProofPhase13Audit',
  'buildOtpSignatureInitialsManifest',
  'every_page',
  'per_signer_signature_date',
  'not_dispatched',
  'native_pdf_signature_layout',
  'mutatedData: false',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP signing envelope QA Phase 14 contract passed.')
