import { readFile, writeFile } from 'node:fs/promises'

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
  buildOtpGeneratedPdfProofPhase27Audit,
  formatOtpGeneratedPdfProofPhase27Markdown,
} from '../src/core/documents/otpGeneratedPdfProofPhase27.js'
import { renderOtpGeneratedPdfProofPhase27 } from './render-otp-generated-pdf-proof-phase27.mjs'

const checkedAt = process.env.OTP_GENERATED_PDF_PROOF_REPORT_TIME || new Date().toISOString()
const migrationSql = await readFile(new URL('../../supabase/migrations/202608050010_otp_commercial_terms_persistence.sql', import.meta.url), 'utf8')
const persistenceServiceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsPersistenceService.js', import.meta.url), 'utf8')
const reviewComponentSource = await readFile(new URL('../src/components/documents/OtpCommercialTermsReviewPanel.jsx', import.meta.url), 'utf8')
const runtimeServiceSource = await readFile(new URL('../src/services/documents/otpCommercialTermsRuntimeService.js', import.meta.url), 'utf8')

const phase24Audit = buildOtpCommercialTermsPersistencePhase24Audit({
  checkedAt,
  migrationSql,
  serviceSource: persistenceServiceSource,
})
const phase25Audit = buildOtpCommercialTermsReviewPhase25Audit({
  checkedAt,
  phase24Audit,
  reviewComponentSource,
})
const phase26Audit = buildOtpCommercialTermsRuntimePhase26Audit({
  checkedAt,
  phase25Audit,
  serviceSource: runtimeServiceSource,
})
const renderEvidence = await renderOtpGeneratedPdfProofPhase27()
const report = buildOtpGeneratedPdfProofPhase27Audit({
  checkedAt,
  phase26Audit,
  renderEvidence,
})
const outputUrl = new URL('../docs/otp-generated-pdf-proof-phase27.md', import.meta.url)

await writeFile(outputUrl, formatOtpGeneratedPdfProofPhase27Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
