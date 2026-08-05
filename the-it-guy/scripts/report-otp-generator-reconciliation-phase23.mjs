import { writeFile } from 'node:fs/promises'

import {
  buildOtpGeneratorReconciliationPhase23Audit,
  formatOtpGeneratorReconciliationPhase23Markdown,
} from '../src/core/documents/otpGeneratorReconciliationPhase23.js'

const report = buildOtpGeneratorReconciliationPhase23Audit({
  checkedAt: process.env.OTP_GENERATOR_RECONCILIATION_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-generator-phase23-reconciliation.md', import.meta.url)

await writeFile(outputUrl, formatOtpGeneratorReconciliationPhase23Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
