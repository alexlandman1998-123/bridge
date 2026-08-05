import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildOtpCommercialTermsPersistencePhase24Audit,
} from '../src/core/documents/otpCommercialTermsPersistencePhase24.js'
import {
  buildOtpCommercialTermsReviewPhase25Audit,
} from '../src/core/documents/otpCommercialTermsReviewPhase25.js'
import {
  buildOtpCommercialTermsRuntimePhase26Audit,
} from '../src/core/documents/otpCommercialTermsRuntimePhase26.js'
import {
  OTP_GENERATED_PDF_PROOF_CONTRACT,
  OTP_GENERATED_PDF_PROOF_PHASE27_VERSION,
  OTP_GENERATED_PDF_PROOF_READY_STATUS,
  buildOtpGeneratedPdfProofPhase27Audit,
  formatOtpGeneratedPdfProofPhase27Markdown,
} from '../src/core/documents/otpGeneratedPdfProofPhase27.js'
import { renderOtpGeneratedPdfProofPhase27 } from './render-otp-generated-pdf-proof-phase27.mjs'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const migrationSql = await readFile(new URL('../../supabase/migrations/202608050010_otp_commercial_terms_persistence.sql', import.meta.url), 'utf8')
const persistenceServiceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsPersistenceService.js', import.meta.url), 'utf8')
const reviewComponentSource = await readFile(new URL('../src/components/documents/OtpCommercialTermsReviewPanel.jsx', import.meta.url), 'utf8')
const runtimeServiceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsRuntimeService.js', import.meta.url), 'utf8')
const rendererSource = await readFile(new URL('./render-otp-generated-pdf-proof-phase27.mjs', import.meta.url), 'utf8')
const pythonRendererSource = await readFile(new URL('./python/render_otp_phase27_pdf.py', import.meta.url), 'utf8')

assert.equal(
  packageJson.scripts?.['test:otp-generated-pdf-proof-phase27'],
  'node scripts/otp-generated-pdf-proof-phase27.test.mjs',
  'package.json should expose the OTP generated PDF proof Phase 27 test.',
)
assert.equal(
  packageJson.scripts?.['report:otp-generated-pdf-proof-phase27'],
  'node scripts/report-otp-generated-pdf-proof-phase27.mjs',
  'package.json should expose the OTP generated PDF proof Phase 27 report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-generated-pdf-proof-phase27'),
  'OTP vNext verification should include Phase 27 generated PDF proof.',
)

assert.equal(OTP_GENERATED_PDF_PROOF_PHASE27_VERSION, 'otp_generated_pdf_proof_phase27_v1')
assert.equal(OTP_GENERATED_PDF_PROOF_READY_STATUS, 'OTP_GENERATED_PDF_PROOF_READY_FOR_PHASE28_MATTER_ATTORNEY_QUOTE_PORTAL_FLOW')
assert.equal(OTP_GENERATED_PDF_PROOF_CONTRACT, 'otp-vnext-generated-pdf-proof-phase27-v1')

for (const token of [
  'renderOtpGeneratedPdfProofPhase27',
  'OTP_Phase27_Resale_Proof.pdf',
  'OTP_Phase27_New_Development_Proof.pdf',
  'pdftoppm',
  'buildOtpCommercialTermsRuntimeInput',
]) {
  assert.ok(rendererSource.includes(token), `Phase 27 renderer should include ${token}`)
}
for (const token of [
  'reportlab',
  'pdfplumber',
  'PdfReader',
  'ARCH9',
  'Witness 1',
  'Page {doc.page} of',
  'Signatures, Dates And Initials',
]) {
  assert.ok(pythonRendererSource.includes(token), `Python PDF renderer should include ${token}`)
}

const phase24Audit = buildOtpCommercialTermsPersistencePhase24Audit({
  checkedAt: '2026-08-05T15:30:00.000Z',
  migrationSql,
  serviceSource: persistenceServiceSource,
})
const phase25Audit = buildOtpCommercialTermsReviewPhase25Audit({
  checkedAt: '2026-08-05T15:30:00.000Z',
  phase24Audit,
  reviewComponentSource,
})
const phase26Audit = buildOtpCommercialTermsRuntimePhase26Audit({
  checkedAt: '2026-08-05T15:30:00.000Z',
  phase25Audit,
  serviceSource: runtimeServiceSource,
})

const renderEvidence = await renderOtpGeneratedPdfProofPhase27()
assert.equal(renderEvidence.files.length, 2)

const resale = renderEvidence.files.find((file) => file.routeVariant === 'resale_existing_property')
const development = renderEvidence.files.find((file) => file.routeVariant === 'new_development')
assert.ok(resale, 'resale proof PDF should be generated')
assert.ok(development, 'new-development proof PDF should be generated')
assert.ok(resale.path.endsWith('OTP_Phase27_Resale_Proof.pdf'))
assert.ok(development.path.endsWith('OTP_Phase27_New_Development_Proof.pdf'))
assert.equal(resale.renderedMediaType, 'application/pdf')
assert.equal(development.renderedMediaType, 'application/pdf')
assert.equal(resale.docxGenerated, false)
assert.equal(development.docxGenerated, false)
assert.ok(resale.renderedSha256.startsWith('sha256:'))
assert.ok(development.renderedSha256.startsWith('sha256:'))
assert.ok(resale.firstPagePngPath.endsWith('.png'))
assert.ok(development.firstPagePngPath.endsWith('.png'))
assert.ok(resale.firstPagePngByteLength > 10000)
assert.ok(development.firstPagePngByteLength > 10000)
assert.ok(resale.pageCount >= 4)
assert.ok(development.pageCount >= 4)
assert.equal(resale.renderedPagePngPaths.length, resale.pageCount)
assert.equal(development.renderedPagePngPaths.length, development.pageCount)
assert.ok(resale.renderedPagePngByteLengths.every((length) => length > 10000))
assert.ok(development.renderedPagePngByteLengths.every((length) => length > 10000))

for (const marker of ['ARCH9', 'Arch9 Property Group', 'Page 1 of', 'OTP-P27-COMM-APPROVED', 'Municipal rates and taxes', 'Body corporate levy estimate', 'Section 30', 'Witness 1', 'Witness 2']) {
  assert.ok(resale.text.includes(marker), `resale PDF text should include ${marker}`)
}
for (const marker of ['Development levy estimate', 'Utility connection charges', 'Developer authorised signatory', 'Contractor authorised signatory', 'Logo top left', 'Generated PDF proof', 'Route marker', 'Legal Wording Proof']) {
  assert.equal(resale.text.includes(marker), false, `resale PDF text should exclude ${marker}`)
}
for (const marker of ['ARCH9', 'Arch9 Property Group', 'Page 1 of', 'Development levy estimate', 'Utility connection charges', 'Developer authorised signatory', 'Contractor authorised signatory', 'Section 30', 'Witness 1', 'Witness 2']) {
  assert.ok(development.text.includes(marker), `new-development PDF text should include ${marker}`)
}
for (const marker of ['Municipal rates and taxes', 'Body corporate levy estimate', 'seller_signature', 'Logo top left', 'Generated PDF proof', 'Route marker', 'Legal Wording Proof']) {
  assert.equal(development.text.includes(marker), false, `new-development PDF text should exclude ${marker}`)
}

const audit = buildOtpGeneratedPdfProofPhase27Audit({
  checkedAt: '2026-08-05T15:30:00.000Z',
  phase26Audit,
  renderEvidence,
})

assert.equal(audit.version, OTP_GENERATED_PDF_PROOF_PHASE27_VERSION)
assert.equal(audit.contract, OTP_GENERATED_PDF_PROOF_CONTRACT)
assert.equal(audit.status, OTP_GENERATED_PDF_PROOF_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.summary.blockerCount, 0)
assert.equal(audit.summary.pdfCount, 2)
assert.ok(audit.summary.renderedPngCount >= 8)
assert.equal(audit.nextPhase.phase, 28)
assert.equal(audit.nextPhase.key, 'matter_attorney_quote_portal_flow')
assert.deepEqual(audit.blockers, [])

for (const check of [
  'PHASE27_PHASE26_RUNTIME_READY',
  'PHASE27_BOTH_ROUTE_PDFS_GENERATED',
  'PHASE27_BRANDED_SHELL_VISUALLY_PROVED',
  'PHASE27_ROUTE_COMMERCIAL_TERMS_AND_LEGAL_MARKERS_PROVED',
  'PHASE27_SIGNATURES_AND_INITIALS_RENDERED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const blocked = buildOtpGeneratedPdfProofPhase27Audit({
  checkedAt: '2026-08-05T15:30:00.000Z',
  phase26Audit: { ...phase26Audit, status: 'OTP_COMMERCIAL_TERMS_RUNTIME_REMEDIATION_REQUIRED' },
  renderEvidence,
})
assert.equal(blocked.status, 'OTP_GENERATED_PDF_PROOF_REMEDIATION_REQUIRED')
assert.equal(blocked.nextPhase, null)

const markdown = formatOtpGeneratedPdfProofPhase27Markdown(audit)
for (const token of [
  'OTP Generator Phase 27 Generated PDF Proof',
  'OTP_GENERATED_PDF_PROOF_READY_FOR_PHASE28_MATTER_ATTORNEY_QUOTE_PORTAL_FLOW',
  'OTP_Phase27_Resale_Proof.pdf',
  'OTP_Phase27_New_Development_Proof.pdf',
  'Phase 28: Matter Attorney Quote Portal Flow',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP generated PDF proof Phase 27 contract passed.')
