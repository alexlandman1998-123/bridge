import { writeFile } from 'node:fs/promises'

import {
  buildOtpReleaseCandidateLockPhase18Audit,
  formatOtpReleaseCandidateLockPhase18Markdown,
} from '../src/core/documents/otpReleaseCandidateLockPhase18.js'

const report = buildOtpReleaseCandidateLockPhase18Audit({
  checkedAt: process.env.OTP_RELEASE_CANDIDATE_LOCK_PHASE18_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase18-release-candidate-lock.md', import.meta.url)

await writeFile(outputUrl, formatOtpReleaseCandidateLockPhase18Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
