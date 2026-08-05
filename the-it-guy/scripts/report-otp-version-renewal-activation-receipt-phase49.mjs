import { readFile, writeFile } from 'node:fs/promises'

import {
  buildOtpControlledVersionRenewalActivationDryRunPhase48Audit,
} from '../src/core/documents/otpControlledVersionRenewalActivationDryRunPhase48.js'
import {
  buildOtpVersionRenewalActivationReceiptPhase49Audit,
  formatOtpVersionRenewalActivationReceiptPhase49Markdown,
} from '../src/core/documents/otpVersionRenewalActivationReceiptPhase49.js'

const checkedAt = process.env.OTP_VERSION_RENEWAL_ACTIVATION_RECEIPT_REPORT_TIME || new Date().toISOString()
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase48Audit = buildOtpControlledVersionRenewalActivationDryRunPhase48Audit({
  checkedAt,
  packageJson,
})
const report = buildOtpVersionRenewalActivationReceiptPhase49Audit({
  checkedAt,
  phase48Audit,
  packageJson,
})
const outputUrl = new URL('../docs/otp-version-renewal-activation-receipt-phase49.md', import.meta.url)

await writeFile(outputUrl, formatOtpVersionRenewalActivationReceiptPhase49Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
