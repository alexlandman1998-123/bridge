import { writeFile } from 'node:fs/promises'

import {
  buildOtpFinalCompletionDryRunPhase17Audit,
  formatOtpFinalCompletionDryRunPhase17Markdown,
} from '../src/core/documents/otpFinalCompletionDryRunPhase17.js'

const report = buildOtpFinalCompletionDryRunPhase17Audit({
  checkedAt: process.env.OTP_FINAL_COMPLETION_DRY_RUN_PHASE17_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase17-final-completion-dry-run.md', import.meta.url)

await writeFile(outputUrl, formatOtpFinalCompletionDryRunPhase17Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
