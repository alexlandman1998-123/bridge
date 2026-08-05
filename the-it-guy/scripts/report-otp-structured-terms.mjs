import { writeFile } from 'node:fs/promises'

import {
  buildOtpStructuredTermsAudit,
  formatOtpStructuredTermsAuditMarkdown,
} from '../src/core/documents/otpStructuredTerms.js'

const report = buildOtpStructuredTermsAudit({
  checkedAt: process.env.OTP_STRUCTURED_TERMS_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase7-structured-terms.md', import.meta.url)

await writeFile(outputUrl, formatOtpStructuredTermsAuditMarkdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
