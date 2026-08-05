import { writeFile } from 'node:fs/promises'

import {
  buildOtpStagingActivationPhase12Audit,
  formatOtpStagingActivationPhase12Markdown,
} from '../src/core/documents/otpStagingActivationPhase12.js'

const report = buildOtpStagingActivationPhase12Audit({
  checkedAt: process.env.OTP_STAGING_ACTIVATION_PHASE12_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase12-staging-activation.md', import.meta.url)

await writeFile(outputUrl, formatOtpStagingActivationPhase12Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
