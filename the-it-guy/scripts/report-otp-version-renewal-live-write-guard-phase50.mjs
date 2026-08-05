import { readFile, writeFile } from 'node:fs/promises'

import {
  buildOtpControlledVersionRenewalActivationDryRunPhase48Audit,
} from '../src/core/documents/otpControlledVersionRenewalActivationDryRunPhase48.js'
import {
  buildOtpVersionRenewalActivationReceiptPhase49Audit,
} from '../src/core/documents/otpVersionRenewalActivationReceiptPhase49.js'
import {
  buildOtpVersionRenewalLiveWriteGuardPhase50Audit,
  formatOtpVersionRenewalLiveWriteGuardPhase50Markdown,
} from '../src/core/documents/otpVersionRenewalLiveWriteGuardPhase50.js'

const checkedAt = process.env.OTP_VERSION_RENEWAL_LIVE_WRITE_GUARD_REPORT_TIME || new Date().toISOString()
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
const report = buildOtpVersionRenewalLiveWriteGuardPhase50Audit({
  checkedAt,
  phase49Audit,
  packageJson,
})
const outputUrl = new URL('../docs/otp-version-renewal-live-write-guard-phase50.md', import.meta.url)

await writeFile(outputUrl, formatOtpVersionRenewalLiveWriteGuardPhase50Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
