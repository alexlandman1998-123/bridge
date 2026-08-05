import { writeFile } from 'node:fs/promises'

import {
  buildOtpCommercialTermsFoundationAudit,
  formatOtpCommercialTermsFoundationMarkdown,
} from '../src/core/documents/otpCommercialTermsFoundation.js'

const report = buildOtpCommercialTermsFoundationAudit({
  checkedAt: process.env.OTP_COMMERCIAL_TERMS_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-commercial-terms-phase1-foundation.md', import.meta.url)

await writeFile(outputUrl, formatOtpCommercialTermsFoundationMarkdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
