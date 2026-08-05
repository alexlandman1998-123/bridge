import { writeFile } from 'node:fs/promises'

import {
  buildOtpSignerSessionQaPhase16Audit,
  formatOtpSignerSessionQaPhase16Markdown,
} from '../src/core/documents/otpSignerSessionQaPhase16.js'

const report = buildOtpSignerSessionQaPhase16Audit({
  checkedAt: process.env.OTP_SIGNER_SESSION_QA_PHASE16_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase16-signer-session-qa.md', import.meta.url)

await writeFile(outputUrl, formatOtpSignerSessionQaPhase16Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
