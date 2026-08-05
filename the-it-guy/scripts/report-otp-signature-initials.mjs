import { writeFile } from 'node:fs/promises'

import {
  buildOtpSignatureInitialsAudit,
  formatOtpSignatureInitialsAuditMarkdown,
} from '../src/core/documents/otpSignatureInitials.js'

const report = buildOtpSignatureInitialsAudit({
  checkedAt: process.env.OTP_SIGNATURE_INITIALS_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase8-signatures-and-initials.md', import.meta.url)

await writeFile(outputUrl, formatOtpSignatureInitialsAuditMarkdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
