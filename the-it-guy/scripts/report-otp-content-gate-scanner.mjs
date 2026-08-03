import { writeFile } from 'node:fs/promises'

import {
  buildOtpContentGateReport,
  formatOtpContentGateReportMarkdown,
} from '../src/core/documents/otpContentGateReport.js'

const report = buildOtpContentGateReport({
  generatedAt: process.env.OTP_CONTENT_GATE_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase7-content-gate-scanner.md', import.meta.url)

await writeFile(outputUrl, formatOtpContentGateReportMarkdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
