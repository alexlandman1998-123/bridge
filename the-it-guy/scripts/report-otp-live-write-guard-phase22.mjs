import { writeFile } from 'node:fs/promises'

import {
  buildOtpLiveWriteGuardPhase22Audit,
  formatOtpLiveWriteGuardPhase22Markdown,
} from '../src/core/documents/otpLiveWriteGuardPhase22.js'

const report = buildOtpLiveWriteGuardPhase22Audit({
  checkedAt: process.env.OTP_LIVE_WRITE_GUARD_PHASE22_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase22-live-write-guard.md', import.meta.url)

await writeFile(outputUrl, formatOtpLiveWriteGuardPhase22Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
