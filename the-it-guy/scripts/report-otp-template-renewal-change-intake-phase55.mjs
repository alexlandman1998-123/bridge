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
} from '../src/core/documents/otpPostRenewalMonitoringCloseoutPhase53.js'
import {
  buildOtpTemplateRenewalSteadyStateReviewPhase54Audit,
} from '../src/core/documents/otpTemplateRenewalSteadyStateReviewPhase54.js'
import {
  buildOtpTemplateRenewalChangeIntakePhase55Audit,
  formatOtpTemplateRenewalChangeIntakePhase55Markdown,
} from '../src/core/documents/otpTemplateRenewalChangeIntakePhase55.js'

const checkedAt = process.env.OTP_TEMPLATE_RENEWAL_CHANGE_INTAKE_REPORT_TIME || new Date().toISOString()
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
const phase53Audit = buildOtpPostRenewalMonitoringCloseoutPhase53Audit({
  checkedAt,
  phase52Audit,
  packageJson,
})
const phase54Audit = buildOtpTemplateRenewalSteadyStateReviewPhase54Audit({
  checkedAt,
  phase53Audit,
  packageJson,
})
const report = buildOtpTemplateRenewalChangeIntakePhase55Audit({
  checkedAt,
  phase54Audit,
  packageJson,
})
const outputUrl = new URL('../docs/otp-template-renewal-change-intake-phase55.md', import.meta.url)

await writeFile(outputUrl, formatOtpTemplateRenewalChangeIntakePhase55Markdown(report), 'utf8')

console.log(`Wrote ${outputUrl.pathname}`)
