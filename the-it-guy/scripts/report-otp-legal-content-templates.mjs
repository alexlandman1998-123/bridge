import { writeFile } from 'node:fs/promises'

import {
  buildOtpLegalContentTemplateReport,
  formatOtpLegalContentTemplateMarkdown,
} from '../src/core/documents/otpLegalContentTemplates.js'

const report = buildOtpLegalContentTemplateReport({
  generatedAt: process.env.OTP_LEGAL_CONTENT_REPORT_TIME || new Date().toISOString(),
})
const outputUrl = new URL('../docs/otp-template-vnext-phase6-legal-content-templates.md', import.meta.url)

await writeFile(outputUrl, formatOtpLegalContentTemplateMarkdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
