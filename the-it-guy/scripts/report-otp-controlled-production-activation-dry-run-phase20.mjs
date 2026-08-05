import { writeFile } from 'node:fs/promises'

import {
  buildOtpControlledProductionActivationDryRunPhase20Audit,
  formatOtpControlledProductionActivationDryRunPhase20Markdown,
} from '../src/core/documents/otpControlledProductionActivationDryRunPhase20.js'

const report = buildOtpControlledProductionActivationDryRunPhase20Audit({
  checkedAt: process.env.OTP_CONTROLLED_PRODUCTION_ACTIVATION_DRY_RUN_PHASE20_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase20-controlled-production-activation-dry-run.md', import.meta.url)

await writeFile(outputUrl, formatOtpControlledProductionActivationDryRunPhase20Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
