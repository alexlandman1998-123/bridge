import { writeFile } from 'node:fs/promises'

import {
  buildOtpSettingsAdminReadiness,
  formatOtpSettingsAdminReadinessMarkdown,
} from '../src/core/documents/otpSettingsAdminReadiness.js'

const report = buildOtpSettingsAdminReadiness({
  checkedAt: process.env.OTP_SETTINGS_ADMIN_READINESS_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase10-settings-admin-readiness.md', import.meta.url)

await writeFile(outputUrl, formatOtpSettingsAdminReadinessMarkdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
