import { writeFile } from 'node:fs/promises'

import {
  buildOtpContentScannerPhase9Audit,
  formatOtpContentScannerPhase9AuditMarkdown,
} from '../src/core/documents/otpContentScannerPhase9.js'

const report = buildOtpContentScannerPhase9Audit({
  checkedAt: process.env.OTP_CONTENT_SCANNER_PHASE9_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase9-content-scanner.md', import.meta.url)

await writeFile(outputUrl, formatOtpContentScannerPhase9AuditMarkdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
