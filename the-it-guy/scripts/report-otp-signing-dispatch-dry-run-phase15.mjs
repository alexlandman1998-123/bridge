import { writeFile } from 'node:fs/promises'

import {
  buildOtpSigningDispatchDryRunPhase15Audit,
  formatOtpSigningDispatchDryRunPhase15Markdown,
} from '../src/core/documents/otpSigningDispatchDryRunPhase15.js'

const report = buildOtpSigningDispatchDryRunPhase15Audit({
  checkedAt: process.env.OTP_SIGNING_DISPATCH_DRY_RUN_PHASE15_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase15-signing-dispatch-dry-run.md', import.meta.url)

await writeFile(outputUrl, formatOtpSigningDispatchDryRunPhase15Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
