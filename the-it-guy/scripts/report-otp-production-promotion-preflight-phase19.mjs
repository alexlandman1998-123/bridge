import { writeFile } from 'node:fs/promises'

import {
  buildOtpProductionPromotionPreflightPhase19Audit,
  formatOtpProductionPromotionPreflightPhase19Markdown,
} from '../src/core/documents/otpProductionPromotionPreflightPhase19.js'

const report = buildOtpProductionPromotionPreflightPhase19Audit({
  checkedAt: process.env.OTP_PRODUCTION_PROMOTION_PREFLIGHT_PHASE19_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase19-production-promotion-preflight.md', import.meta.url)

await writeFile(outputUrl, formatOtpProductionPromotionPreflightPhase19Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
