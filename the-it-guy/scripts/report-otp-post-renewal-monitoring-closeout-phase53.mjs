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
} from '../src/core/documents/otpVersionRenewalApplyReceiptPhase52.js'
import {
  buildOtpPostRenewalMonitoringCloseoutPhase53Audit,
  formatOtpPostRenewalMonitoringCloseoutPhase53Markdown,
} from '../src/core/documents/otpPostRenewalMonitoringCloseoutPhase53.js'

const checkedAt = process.env.OTP_POST_RENEWAL_MONITORING_CLOSEOUT_REPORT_TIME || new Date().toISOString()
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
const phase52Audit = buildOtpVersionRenewalApplyReceiptPhase52Audit({
  checkedAt,
  phase51Audit,
  packageJson,
})
const report = buildOtpPostRenewalMonitoringCloseoutPhase53Audit({
  checkedAt,
  phase52Audit,
  packageJson,
})
const outputUrl = new URL('../docs/otp-post-renewal-monitoring-closeout-phase53.md', import.meta.url)

await writeFile(outputUrl, formatOtpPostRenewalMonitoringCloseoutPhase53Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
