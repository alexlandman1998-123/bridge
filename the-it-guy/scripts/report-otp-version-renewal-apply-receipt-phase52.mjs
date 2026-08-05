import { readFile, writeFile } from 'node:fs/promises'

import {
  buildOtpControlledVersionRenewalActivationDryRunPhase48Audit,
} from '../src/core/documents/otpControlledVersionRenewalActivationDryRunPhase48.js'
import {
  buildOtpVersionRenewalActivationReceiptPhase49Audit,
} from '../src/core/documents/otpVersionRenewalActivationReceiptPhase49.js'
import {
  buildOtpVersionRenewalLiveWriteGuardPhase50Audit,
} from '../src/core/documents/otpVersionRenewalLiveWriteGuardPhase50.js'
import {
  buildOtpControlledVersionRenewalApplyDryRunPhase51Audit,
} from '../src/core/documents/otpControlledVersionRenewalApplyDryRunPhase51.js'
import {
  buildOtpVersionRenewalApplyReceiptPhase52Audit,
  formatOtpVersionRenewalApplyReceiptPhase52Markdown,
} from '../src/core/documents/otpVersionRenewalApplyReceiptPhase52.js'

const checkedAt = process.env.OTP_VERSION_RENEWAL_APPLY_RECEIPT_REPORT_TIME || new Date().toISOString()
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const phase48Audit = buildOtpControlledVersionRenewalActivationDryRunPhase48Audit({
  checkedAt,
  packageJson,
})
const phase49Audit = buildOtpVersionRenewalActivationReceiptPhase49Audit({
  checkedAt,
  phase48Audit,
  packageJson,
})
const phase50Audit = buildOtpVersionRenewalLiveWriteGuardPhase50Audit({
  checkedAt,
  phase49Audit,
  packageJson,
})
const phase51Audit = buildOtpControlledVersionRenewalApplyDryRunPhase51Audit({
  checkedAt,
  phase50Audit,
  packageJson,
})
const report = buildOtpVersionRenewalApplyReceiptPhase52Audit({
  checkedAt,
  phase51Audit,
  packageJson,
})
const outputUrl = new URL('../docs/otp-version-renewal-apply-receipt-phase52.md', import.meta.url)

await writeFile(outputUrl, formatOtpVersionRenewalApplyReceiptPhase52Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
