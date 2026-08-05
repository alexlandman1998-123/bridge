import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_RUNTIME_INTEGRATION_PHASE11_VERSION,
  OTP_RUNTIME_INTEGRATION_READY_STATUS,
  OTP_RUNTIME_RENDERER_CONTRACT,
  buildOtpRuntimeIntegrationPhase11Audit,
  formatOtpRuntimeIntegrationPhase11Markdown,
} from '../src/core/documents/otpRuntimeIntegrationPhase11.js'
import {
  OTP_SETTINGS_ADMIN_READY_CONFIGURATION,
} from '../src/core/documents/otpSettingsAdminReadiness.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-runtime-integration-phase11'],
  'node scripts/otp-runtime-integration-phase11.test.mjs',
  'package.json should expose the OTP runtime integration Phase 11 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-runtime-integration-phase11'],
  'node scripts/report-otp-runtime-integration-phase11.mjs',
  'package.json should expose the OTP Phase 11 runtime integration report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-runtime-integration-phase11'),
  'OTP vNext verification should include Phase 11 runtime integration checks.',
)

assert.equal(OTP_RUNTIME_INTEGRATION_PHASE11_VERSION, 'otp_runtime_integration_phase11_v1')
assert.equal(OTP_RUNTIME_INTEGRATION_READY_STATUS, 'OTP_RUNTIME_INTEGRATION_READY_FOR_PDF_PROOF')
assert.equal(OTP_RUNTIME_RENDERER_CONTRACT, 'otp_native_structured_pdf_runtime_phase11_v1')

const audit = buildOtpRuntimeIntegrationPhase11Audit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.version, OTP_RUNTIME_INTEGRATION_PHASE11_VERSION)
assert.equal(audit.status, OTP_RUNTIME_INTEGRATION_READY_STATUS)
assert.equal(audit.mutatedData, false)
assert.equal(audit.canProceedToPdfProof, true)
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.readyRuntimeRouteCount, 2)
assert.equal(audit.summary.fallbackBlocked, true)
assert.equal(audit.summary.docxGenerationEnabled, 'false')
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])
assert.equal(audit.settingsReadiness.status, 'OTP_SETTINGS_ADMIN_READY_FOR_RENDERER_PROOF')

for (const route of audit.routeRows) {
  assert.equal(route.launchReadiness.status, 'ready')
  assert.equal(route.launchReadiness.shouldBlockGeneration, false)
  assert.equal(route.launchReadiness.canGenerateWithoutFallback, true)
  assert.equal(route.templateRenderMode, 'native_structured')
  assert.equal(route.artifactType, 'pdf')
  assert.equal(route.docxGenerationEnabled, false)
  assert.ok(route.shellSlotCount > 0)
  assert.ok(route.structuredGroupCount > 0)
  assert.ok(route.signingFieldCount > 0)
}

assert.deepEqual(
  audit.routeRows.map((row) => row.routeKey),
  ['resale_existing_property', 'new_development'],
)
assert.notEqual(
  audit.routeRows.find((row) => row.routeKey === 'resale_existing_property')?.templateKey,
  audit.routeRows.find((row) => row.routeKey === 'new_development')?.templateKey,
)
assert.equal(audit.fallbackProbe.status, 'blocked')
assert.equal(audit.fallbackProbe.shouldBlockGeneration, true)
assert.ok(audit.fallbackProbe.blockerCodes.includes('OTP_RUNTIME_UNAPPROVED_FALLBACK'))

for (const check of [
  'PHASE11_SETTINGS_ADMIN_READY',
  'PHASE11_RUNTIME_ROUTES_READY',
  'PHASE11_GENERATES_WITHOUT_FALLBACK',
  'PHASE11_ROUTE_TEMPLATE_KEYS_DISTINCT',
  'PHASE11_NATIVE_PDF_RUNTIME_BOUND',
  'PHASE11_DOCX_RUNTIME_PATH_DISABLED',
  'PHASE11_BRANDED_SHELL_BOUND',
  'PHASE11_STRUCTURED_TERMS_BOUND',
  'PHASE11_SIGNING_PLAN_BOUND',
  'PHASE11_FALLBACK_GENERATION_BLOCKED',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const docxBlocked = buildOtpRuntimeIntegrationPhase11Audit({
  settings: {
    ...OTP_SETTINGS_ADMIN_READY_CONFIGURATION,
    docx_generation_enabled: true,
  },
})
assert.equal(docxBlocked.status, 'OTP_RUNTIME_INTEGRATION_REMEDIATION_REQUIRED')
assert.equal(docxBlocked.checks.find((item) => item.code === 'PHASE11_SETTINGS_ADMIN_READY')?.pass, false)
assert.equal(docxBlocked.checks.find((item) => item.code === 'PHASE11_DOCX_RUNTIME_PATH_DISABLED')?.pass, false)

const collapsedRoutes = buildOtpRuntimeIntegrationPhase11Audit({
  settings: {
    ...OTP_SETTINGS_ADMIN_READY_CONFIGURATION,
    route_defaults: {
      resale_existing_property: 'otp_shared_native_pdf',
      new_development: 'otp_shared_native_pdf',
    },
  },
})
assert.equal(collapsedRoutes.status, 'OTP_RUNTIME_INTEGRATION_REMEDIATION_REQUIRED')
assert.equal(collapsedRoutes.checks.find((item) => item.code === 'PHASE11_ROUTE_TEMPLATE_KEYS_DISTINCT')?.pass, false)

const markdown = formatOtpRuntimeIntegrationPhase11Markdown(audit)
for (const token of [
  'OTP Template vNext Phase 11 Runtime Integration',
  'OTP_RUNTIME_INTEGRATION_READY_FOR_PDF_PROOF',
  'PHASE11_DOCX_RUNTIME_PATH_DISABLED',
  'PHASE11_FALLBACK_GENERATION_BLOCKED',
  'otp_native_structured_pdf_runtime_phase11_v1',
  'OTP_RUNTIME_UNAPPROVED_FALLBACK',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpRuntimeIntegrationPhase11.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_RUNTIME_INTEGRATION_PHASE11_VERSION',
  'buildOtpTemplateRuntimeLaunchReadiness',
  'buildOtpSettingsAdminReadiness',
  'docx_generation_enabled',
  'legal_scenario_variant',
  'legal_scenario_fallback',
  'buildOtpBrandedShellManifest',
  'buildOtpStructuredTermsManifest',
  'buildOtpSignatureInitialsManifest',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

const packetServiceSource = await readFile(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')
for (const token of [
  'buildOtpTemplateRuntimeContentGate',
  'buildOtpTemplateRuntimeLaunchReadiness',
  "normalizedPacketType === 'otp'",
  'OTPs are never eligible for a browser-owned DOCX path',
  "return templateUsesNativeRenderer(template, normalizedPacketType)",
  'OTP_TEMPLATE_LAUNCH_READINESS_BLOCKED',
  'otpTemplateLaunchReadiness',
]) {
  assert.ok(packetServiceSource.includes(token), `packetService should preserve runtime integration token ${token}.`)
}

const otpNativeRendererIndex = packetServiceSource.indexOf("if (normalizedPacketType === 'otp')")
const docxCommentIndex = packetServiceSource.indexOf('OTPs are never eligible for a browser-owned DOCX path', otpNativeRendererIndex)
const nativeReturnIndex = packetServiceSource.indexOf('return templateUsesNativeRenderer(template, normalizedPacketType)', docxCommentIndex)
assert.ok(otpNativeRendererIndex > -1 && docxCommentIndex > otpNativeRendererIndex && nativeReturnIndex > docxCommentIndex, 'OTP runtime should route through native renderer instead of DOCX fallback.')

console.log('OTP runtime integration Phase 11 contract passed.')
