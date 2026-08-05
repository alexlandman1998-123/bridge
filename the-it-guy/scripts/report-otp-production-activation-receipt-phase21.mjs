import { writeFile } from 'node:fs/promises'

import {
  buildOtpProductionActivationReceiptPhase21Audit,
  formatOtpProductionActivationReceiptPhase21Markdown,
} from '../src/core/documents/otpProductionActivationReceiptPhase21.js'

const report = buildOtpProductionActivationReceiptPhase21Audit({
  checkedAt: process.env.OTP_PRODUCTION_ACTIVATION_RECEIPT_PHASE21_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase21-production-activation-receipt.md', import.meta.url)

await writeFile(outputUrl, formatOtpProductionActivationReceiptPhase21Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
