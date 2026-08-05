import { writeFile } from 'node:fs/promises'

import {
  buildOtpBrandedShellAudit,
  formatOtpBrandedShellAuditMarkdown,
} from '../src/core/documents/otpTemplateBrandedShell.js'

const report = buildOtpBrandedShellAudit({
  checkedAt: process.env.OTP_BRANDED_SHELL_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase6-branded-pdf-shell.md', import.meta.url)

await writeFile(outputUrl, formatOtpBrandedShellAuditMarkdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
