import { writeFile } from 'node:fs/promises'

import {
  buildOtpStagingSmokePdfProofPhase13Audit,
  formatOtpStagingSmokePdfProofPhase13Markdown,
} from '../src/core/documents/otpStagingSmokePdfProofPhase13.js'

const report = buildOtpStagingSmokePdfProofPhase13Audit({
  checkedAt: process.env.OTP_STAGING_SMOKE_PDF_PROOF_PHASE13_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase13-staging-smoke-pdf-proof.md', import.meta.url)

await writeFile(outputUrl, formatOtpStagingSmokePdfProofPhase13Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
