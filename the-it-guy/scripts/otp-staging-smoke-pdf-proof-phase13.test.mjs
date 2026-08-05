import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_STAGING_SMOKE_PDF_PROOF_CONTRACT,
  OTP_STAGING_SMOKE_PDF_PROOF_PHASE13_VERSION,
  OTP_STAGING_SMOKE_PDF_PROOF_READY_STATUS,
  OTP_STAGING_SMOKE_PDF_READY_EVIDENCE,
  buildOtpStagingSmokePdfProofPhase13Audit,
  formatOtpStagingSmokePdfProofPhase13Markdown,
} from '../src/core/documents/otpStagingSmokePdfProofPhase13.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-staging-smoke-pdf-proof-phase13'],
  'node scripts/otp-staging-smoke-pdf-proof-phase13.test.mjs',
  'package.json should expose the OTP staging smoke PDF proof Phase 13 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-staging-smoke-pdf-proof-phase13'],
  'node scripts/report-otp-staging-smoke-pdf-proof-phase13.mjs',
  'package.json should expose the OTP Phase 13 staging smoke PDF proof report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-staging-smoke-pdf-proof-phase13'),
  'OTP vNext verification should include Phase 13 staging smoke PDF proof checks.',
)

assert.equal(OTP_STAGING_SMOKE_PDF_PROOF_PHASE13_VERSION, 'otp_staging_smoke_pdf_proof_phase13_v1')
assert.equal(OTP_STAGING_SMOKE_PDF_PROOF_READY_STATUS, 'OTP_STAGING_SMOKE_PDF_PROOF_READY_FOR_SIGNING_QA')
assert.equal(OTP_STAGING_SMOKE_PDF_PROOF_CONTRACT, 'otp-vnext-staging-smoke-pdf-proof-phase13-v1')

const audit = buildOtpStagingSmokePdfProofPhase13Audit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.version, OTP_STAGING_SMOKE_PDF_PROOF_PHASE13_VERSION)
assert.equal(audit.contract, OTP_STAGING_SMOKE_PDF_PROOF_CONTRACT)
assert.equal(audit.status, OTP_STAGING_SMOKE_PDF_PROOF_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.canProceedToSigningQa, true)
assert.equal(audit.stagingActivation.status, 'OTP_STAGING_ACTIVATION_READY_FOR_GUARDED_ENABLEMENT')
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.provedRouteCount, 2)
assert.equal(audit.summary.pdfArtifactCount, 2)
assert.equal(audit.summary.nativePdfVerifiedCount, 2)
assert.equal(audit.summary.persistedPdfCount, 2)
assert.equal(audit.summary.fallbackUsedCount, 0)
assert.equal(audit.summary.docxArtifactCount, 0)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])
assert.deepEqual(
  audit.routeRows.map((row) => row.routeKey),
  ['resale_existing_property', 'new_development'],
)

for (const row of audit.routeRows) {
  assert.equal(row.renderedMediaType, 'application/pdf')
  assert.equal(row.renderer, 'native_structured')
  assert.equal(row.nativePdfVerified, true)
  assert.equal(row.transactionPdfPersisted, true)
  assert.equal(row.fallbackUsed, false)
  assert.equal(row.docxGenerated, false)
  assert.equal(row.missingVisualKeys.length, 0)
  assert.equal(row.markerLeakage.length, 0)
  assert.ok(row.renderedFileName.endsWith('.pdf'))
  assert.ok(row.renderedSha256.startsWith('sha256:'))
}

for (const check of [
  'PHASE13_STAGING_ACTIVATION_READY',
  'PHASE13_BOTH_ROUTE_PDFS_PROVED',
  'PHASE13_ARTIFACTS_ARE_PDF',
  'PHASE13_NATIVE_RENDERER_VERIFIED',
  'PHASE13_TRANSACTION_PDFS_PERSISTED',
  'PHASE13_NO_FALLBACK_USED',
  'PHASE13_NO_DOCX_ARTIFACTS',
  'PHASE13_VISUAL_SHELL_AND_LAYOUT_PROVED',
  'PHASE13_ROUTE_CONTENT_SEPARATION_PROVED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const missingDevelopment = buildOtpStagingSmokePdfProofPhase13Audit({
  evidence: OTP_STAGING_SMOKE_PDF_READY_EVIDENCE.filter((item) => item.routeKey !== 'new_development'),
})
assert.equal(missingDevelopment.status, 'OTP_STAGING_SMOKE_PDF_PROOF_REMEDIATION_REQUIRED')
assert.equal(missingDevelopment.checks.find((item) => item.code === 'PHASE13_BOTH_ROUTE_PDFS_PROVED')?.pass, false)
assert.ok(missingDevelopment.blockers.some((item) => item.routeKey === 'new_development'))

const docxLeak = buildOtpStagingSmokePdfProofPhase13Audit({
  evidence: OTP_STAGING_SMOKE_PDF_READY_EVIDENCE.map((item) => item.routeKey === 'resale_existing_property'
    ? {
        ...item,
        renderedFileName: 'OTP_Resale_Staging_Smoke.docx',
        renderedFilePath: 'document-packets/staging/otp-smoke-resale/OTP_Resale_Staging_Smoke.docx',
        renderedMediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        docxGenerated: true,
      }
    : item),
})
assert.equal(docxLeak.status, 'OTP_STAGING_SMOKE_PDF_PROOF_REMEDIATION_REQUIRED')
assert.equal(docxLeak.checks.find((item) => item.code === 'PHASE13_ARTIFACTS_ARE_PDF')?.pass, false)
assert.equal(docxLeak.checks.find((item) => item.code === 'PHASE13_NO_DOCX_ARTIFACTS')?.pass, false)

const missingVisual = buildOtpStagingSmokePdfProofPhase13Audit({
  evidence: OTP_STAGING_SMOKE_PDF_READY_EVIDENCE.map((item) => item.routeKey === 'new_development'
    ? {
        ...item,
        visualSmoke: {
          ...item.visualSmoke,
          companyDetailsTopRight: false,
        },
      }
    : item),
})
assert.equal(missingVisual.status, 'OTP_STAGING_SMOKE_PDF_PROOF_REMEDIATION_REQUIRED')
assert.equal(missingVisual.checks.find((item) => item.code === 'PHASE13_VISUAL_SHELL_AND_LAYOUT_PROVED')?.pass, false)

const fallbackUsed = buildOtpStagingSmokePdfProofPhase13Audit({
  evidence: OTP_STAGING_SMOKE_PDF_READY_EVIDENCE.map((item) => item.routeKey === 'new_development'
    ? {
        ...item,
        fallbackUsed: true,
      }
    : item),
})
assert.equal(fallbackUsed.status, 'OTP_STAGING_SMOKE_PDF_PROOF_REMEDIATION_REQUIRED')
assert.equal(fallbackUsed.checks.find((item) => item.code === 'PHASE13_NO_FALLBACK_USED')?.pass, false)

const markdown = formatOtpStagingSmokePdfProofPhase13Markdown(audit)
for (const token of [
  'OTP Template vNext Phase 13 Staging Smoke / Generated PDF Proof',
  'OTP_STAGING_SMOKE_PDF_PROOF_READY_FOR_SIGNING_QA',
  'PHASE13_NO_DOCX_ARTIFACTS',
  'PHASE13_VISUAL_SHELL_AND_LAYOUT_PROVED',
  'OTP_Resale_Staging_Smoke.pdf',
  'OTP_New_Development_Staging_Smoke.pdf',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpStagingSmokePdfProofPhase13.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_STAGING_SMOKE_PDF_PROOF_PHASE13_VERSION',
  'OTP_STAGING_SMOKE_PDF_READY_EVIDENCE',
  'buildOtpStagingActivationPhase12Audit',
  'renderedMediaType',
  'application/pdf',
  'visualSmoke',
  'routeMarkers',
  'docxGenerated',
  'fallbackUsed',
  'mutatedData: false',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP staging smoke PDF proof Phase 13 contract passed.')
