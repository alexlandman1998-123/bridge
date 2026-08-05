import { writeFile } from 'node:fs/promises'

import {
  buildOtpRuntimeIntegrationPhase11Audit,
  formatOtpRuntimeIntegrationPhase11Markdown,
} from '../src/core/documents/otpRuntimeIntegrationPhase11.js'

const report = buildOtpRuntimeIntegrationPhase11Audit({
  checkedAt: process.env.OTP_RUNTIME_INTEGRATION_PHASE11_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase11-runtime-integration.md', import.meta.url)

await writeFile(outputUrl, formatOtpRuntimeIntegrationPhase11Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
