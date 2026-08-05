import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_STAGING_ACTIVATION_CONTRACT,
  OTP_STAGING_ACTIVATION_PHASE12_VERSION,
  OTP_STAGING_ACTIVATION_READY_PLAN,
  OTP_STAGING_ACTIVATION_READY_STATUS,
  buildOtpStagingActivationPhase12Audit,
  formatOtpStagingActivationPhase12Markdown,
} from '../src/core/documents/otpStagingActivationPhase12.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-staging-activation-phase12'],
  'node scripts/otp-staging-activation-phase12.test.mjs',
  'package.json should expose the OTP staging activation Phase 12 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-staging-activation-phase12'],
  'node scripts/report-otp-staging-activation-phase12.mjs',
  'package.json should expose the OTP Phase 12 staging activation report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-staging-activation-phase12'),
  'OTP vNext verification should include Phase 12 staging activation checks.',
)

assert.equal(OTP_STAGING_ACTIVATION_PHASE12_VERSION, 'otp_staging_activation_phase12_v1')
assert.equal(OTP_STAGING_ACTIVATION_READY_STATUS, 'OTP_STAGING_ACTIVATION_READY_FOR_GUARDED_ENABLEMENT')
assert.equal(OTP_STAGING_ACTIVATION_CONTRACT, 'otp-vnext-staging-activation-phase12-v1')

const audit = buildOtpStagingActivationPhase12Audit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.version, OTP_STAGING_ACTIVATION_PHASE12_VERSION)
assert.equal(audit.contract, OTP_STAGING_ACTIVATION_CONTRACT)
assert.equal(audit.status, OTP_STAGING_ACTIVATION_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.canActivateStaging, true)
assert.equal(audit.activationPlan.environment, 'staging')
assert.equal(audit.activationPlan.activationMode, 'guarded_staging_canary')
assert.equal(audit.activationPlan.dryRunOnly, true)
assert.equal(audit.activationPlan.runtimeFlags.otp_vnext_docx_generation_enabled, false)
assert.equal(audit.activationPlan.runtimeFlags.otp_vnext_generic_fallback_enabled, false)
assert.equal(audit.runtimeIntegration.status, 'OTP_RUNTIME_INTEGRATION_READY_FOR_PDF_PROOF')
assert.equal(audit.runtimeIntegration.fallbackBlocked, true)
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.activatedRouteCount, 2)
assert.equal(audit.summary.runtimeReadyRouteCount, 2)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])
assert.deepEqual(
  audit.routeRows.map((row) => row.routeKey),
  ['resale_existing_property', 'new_development'],
)

for (const check of [
  'PHASE12_RUNTIME_INTEGRATION_READY',
  'PHASE12_ACTIVATION_CONTRACT_CURRENT',
  'PHASE12_STAGING_TARGET_LOCKED',
  'PHASE12_GUARDED_CANARY_MODE',
  'PHASE12_TEST_SUITE_READ_ONLY',
  'PHASE12_CANARY_ORGANISATION_SCOPED',
  'PHASE12_BOTH_ROUTES_ACTIVATED',
  'PHASE12_NATIVE_PDF_FLAGS_ENABLED',
  'PHASE12_DOCX_FLAG_DISABLED',
  'PHASE12_GENERIC_FALLBACK_FLAG_DISABLED',
  'PHASE12_APPROVAL_REFERENCES_PRESENT',
  'PHASE12_ROLLBACK_REFERENCE_PRESENT',
  'PHASE12_REQUIRED_EVIDENCE_BOUND',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const productionTarget = buildOtpStagingActivationPhase12Audit({
  plan: {
    ...OTP_STAGING_ACTIVATION_READY_PLAN,
    environment: 'production',
  },
})
assert.equal(productionTarget.status, 'OTP_STAGING_ACTIVATION_REMEDIATION_REQUIRED')
assert.equal(productionTarget.checks.find((item) => item.code === 'PHASE12_STAGING_TARGET_LOCKED')?.pass, false)

const writePlan = buildOtpStagingActivationPhase12Audit({
  plan: {
    ...OTP_STAGING_ACTIVATION_READY_PLAN,
    dryRunOnly: false,
  },
})
assert.equal(writePlan.status, 'OTP_STAGING_ACTIVATION_REMEDIATION_REQUIRED')
assert.equal(writePlan.checks.find((item) => item.code === 'PHASE12_TEST_SUITE_READ_ONLY')?.pass, false)

const docxFlag = buildOtpStagingActivationPhase12Audit({
  plan: {
    ...OTP_STAGING_ACTIVATION_READY_PLAN,
    runtimeFlags: {
      ...OTP_STAGING_ACTIVATION_READY_PLAN.runtimeFlags,
      otp_vnext_docx_generation_enabled: true,
    },
  },
})
assert.equal(docxFlag.status, 'OTP_STAGING_ACTIVATION_REMEDIATION_REQUIRED')
assert.equal(docxFlag.checks.find((item) => item.code === 'PHASE12_DOCX_FLAG_DISABLED')?.pass, false)

const missingRoute = buildOtpStagingActivationPhase12Audit({
  plan: {
    ...OTP_STAGING_ACTIVATION_READY_PLAN,
    enabledRoutes: ['resale_existing_property'],
  },
})
assert.equal(missingRoute.status, 'OTP_STAGING_ACTIVATION_REMEDIATION_REQUIRED')
assert.equal(missingRoute.checks.find((item) => item.code === 'PHASE12_BOTH_ROUTES_ACTIVATED')?.pass, false)

const runtimeBlocked = buildOtpStagingActivationPhase12Audit({
  runtimeAudit: {
    version: 'test',
    status: 'OTP_RUNTIME_INTEGRATION_REMEDIATION_REQUIRED',
    summary: { fallbackBlocked: false, blockerCount: 1 },
    routeRows: [],
  },
})
assert.equal(runtimeBlocked.status, 'OTP_STAGING_ACTIVATION_REMEDIATION_REQUIRED')
assert.equal(runtimeBlocked.checks.find((item) => item.code === 'PHASE12_RUNTIME_INTEGRATION_READY')?.pass, false)

const markdown = formatOtpStagingActivationPhase12Markdown(audit)
for (const token of [
  'OTP Template vNext Phase 12 Staging Activation',
  'OTP_STAGING_ACTIVATION_READY_FOR_GUARDED_ENABLEMENT',
  'PHASE12_DOCX_FLAG_DISABLED',
  'PHASE12_GENERIC_FALLBACK_FLAG_DISABLED',
  'guarded_staging_canary',
  'staging-otp-sandbox-agency',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpStagingActivationPhase12.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_STAGING_ACTIVATION_PHASE12_VERSION',
  'OTP_STAGING_ACTIVATION_READY_PLAN',
  'buildOtpRuntimeIntegrationPhase11Audit',
  'guarded_staging_canary',
  'otp_vnext_docx_generation_enabled',
  'otp_vnext_generic_fallback_enabled',
  'phase11_runtime_integration',
  'mutatedData: false',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP staging activation Phase 12 contract passed.')
