import { writeFile } from 'node:fs/promises'

import {
  buildOtpSigningEnvelopeQaPhase14Audit,
  formatOtpSigningEnvelopeQaPhase14Markdown,
} from '../src/core/documents/otpSigningEnvelopeQaPhase14.js'

const report = buildOtpSigningEnvelopeQaPhase14Audit({
  checkedAt: process.env.OTP_SIGNING_ENVELOPE_QA_PHASE14_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase14-signing-envelope-qa.md', import.meta.url)

await writeFile(outputUrl, formatOtpSigningEnvelopeQaPhase14Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
