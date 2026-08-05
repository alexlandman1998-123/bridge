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
  formatOtpControlledVersionRenewalApplyDryRunPhase51Markdown,
} from '../src/core/documents/otpControlledVersionRenewalApplyDryRunPhase51.js'

const checkedAt = process.env.OTP_CONTROLLED_VERSION_RENEWAL_APPLY_DRY_RUN_REPORT_TIME || new Date().toISOString()
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
const report = buildOtpControlledVersionRenewalApplyDryRunPhase51Audit({
  checkedAt,
  phase50Audit,
  packageJson,
})
const outputUrl = new URL('../docs/otp-controlled-version-renewal-apply-dry-run-phase51.md', import.meta.url)

await writeFile(outputUrl, formatOtpControlledVersionRenewalApplyDryRunPhase51Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
