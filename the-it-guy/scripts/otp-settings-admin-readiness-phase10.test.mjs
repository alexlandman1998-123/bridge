import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_SETTINGS_ADMIN_READY_CONFIGURATION,
  OTP_SETTINGS_ADMIN_READY_STATUS,
  OTP_SETTINGS_ADMIN_READINESS_VERSION,
  buildOtpSettingsAdminReadiness,
  formatOtpSettingsAdminReadinessMarkdown,
} from '../src/core/documents/otpSettingsAdminReadiness.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-settings-admin-readiness-phase10'],
  'node scripts/otp-settings-admin-readiness-phase10.test.mjs',
  'package.json should expose the OTP Settings admin readiness Phase 10 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-settings-admin-readiness'],
  'node scripts/report-otp-settings-admin-readiness.mjs',
  'package.json should expose the OTP Phase 10 Settings admin readiness report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-settings-admin-readiness-phase10'),
  'OTP vNext verification should include Phase 10 Settings admin readiness checks.',
)

assert.equal(OTP_SETTINGS_ADMIN_READINESS_VERSION, 'otp_settings_admin_readiness_phase10_v1')
assert.equal(OTP_SETTINGS_ADMIN_READY_STATUS, 'OTP_SETTINGS_ADMIN_READY_FOR_RENDERER_PROOF')

const ready = buildOtpSettingsAdminReadiness({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(ready.version, OTP_SETTINGS_ADMIN_READINESS_VERSION)
assert.equal(ready.status, OTP_SETTINGS_ADMIN_READY_STATUS)
assert.equal(ready.mutatedData, false)
assert.equal(ready.canProceedToRendererProof, true)
assert.equal(ready.summary.routeCount, 2)
assert.equal(ready.summary.upstreamAuditCount, 5)
assert.equal(ready.summary.blockerCount, 0)
assert.deepEqual(ready.blockers, [])
assert.equal(ready.requiredSettings.find((row) => row.key === 'docx_generation_enabled')?.actualValue, false)
assert.equal(ready.requiredSettings.find((row) => row.key === 'document_renderer')?.actualValue, 'native_structured_pdf')
assert.equal(ready.requiredSettings.find((row) => row.key === 'phase9_content_scanner_required')?.actualValue, true)
assert.deepEqual(
  ready.routeSettings.map((row) => row.routeKey),
  ['resale_existing_property', 'new_development'],
)
assert.notEqual(
  ready.routeSettings.find((row) => row.routeKey === 'resale_existing_property')?.templateKey,
  ready.routeSettings.find((row) => row.routeKey === 'new_development')?.templateKey,
)

for (const check of [
  'PHASE10_UPSTREAM_AUDITS_READY',
  'PHASE10_REQUIRED_ADMIN_SETTINGS_LOCKED',
  'PHASE10_DOCX_GENERATION_DISABLED',
  'PHASE10_NATIVE_PDF_RENDERING_SELECTED',
  'PHASE10_GENERIC_FALLBACK_DISABLED',
  'PHASE10_RESALE_AND_DEVELOPMENT_ROUTES_SEPARATE',
  'PHASE10_BRANDING_REQUIRED',
  'PHASE10_APPROVAL_AND_SCANNER_REQUIRED',
]) {
  assert.equal(ready.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const docxEnabled = buildOtpSettingsAdminReadiness({
  settings: {
    ...OTP_SETTINGS_ADMIN_READY_CONFIGURATION,
    docx_generation_enabled: true,
  },
})
assert.equal(docxEnabled.status, 'OTP_SETTINGS_ADMIN_REMEDIATION_REQUIRED')
assert.ok(docxEnabled.blockers.some((issue) => issue.code === 'OTP_SETTINGS_DOCX_GENERATION_ENABLED_NOT_READY'))
assert.equal(docxEnabled.checks.find((item) => item.code === 'PHASE10_DOCX_GENERATION_DISABLED')?.pass, false)

const fallbackEnabled = buildOtpSettingsAdminReadiness({
  settings: {
    ...OTP_SETTINGS_ADMIN_READY_CONFIGURATION,
    template_fallback_enabled: true,
  },
})
assert.equal(fallbackEnabled.status, 'OTP_SETTINGS_ADMIN_REMEDIATION_REQUIRED')
assert.ok(fallbackEnabled.blockers.some((issue) => issue.code === 'OTP_SETTINGS_TEMPLATE_FALLBACK_ENABLED_NOT_READY'))
assert.equal(fallbackEnabled.checks.find((item) => item.code === 'PHASE10_GENERIC_FALLBACK_DISABLED')?.pass, false)

const collapsedRoutes = buildOtpSettingsAdminReadiness({
  settings: {
    ...OTP_SETTINGS_ADMIN_READY_CONFIGURATION,
    route_defaults: {
      resale_existing_property: 'otp_shared_native_pdf',
      new_development: 'otp_shared_native_pdf',
    },
  },
})
assert.equal(collapsedRoutes.status, 'OTP_SETTINGS_ADMIN_REMEDIATION_REQUIRED')
assert.ok(collapsedRoutes.blockers.some((issue) => issue.code === 'OTP_SETTINGS_ROUTE_TEMPLATES_NOT_SEPARATE'))
assert.equal(collapsedRoutes.checks.find((item) => item.code === 'PHASE10_RESALE_AND_DEVELOPMENT_ROUTES_SEPARATE')?.pass, false)

const upstreamBlocked = buildOtpSettingsAdminReadiness({
  audits: {
    contentScanner: {
      version: 'test',
      status: 'OTP_CONTENT_SCANNER_PHASE9_REMEDIATION_REQUIRED',
      summary: { blockerCount: 1 },
    },
  },
})
assert.equal(upstreamBlocked.status, 'OTP_SETTINGS_ADMIN_REMEDIATION_REQUIRED')
assert.ok(upstreamBlocked.blockers.some((issue) => issue.code === 'OTP_SETTINGS_UPSTREAM_AUDIT_NOT_READY'))
assert.equal(upstreamBlocked.upstreamAudits.find((row) => row.key === 'contentScanner')?.pass, false)

const markdown = formatOtpSettingsAdminReadinessMarkdown(ready)
for (const token of [
  'OTP Template vNext Phase 10 Settings And Admin Readiness',
  'OTP_SETTINGS_ADMIN_READY_FOR_RENDERER_PROOF',
  'PHASE10_DOCX_GENERATION_DISABLED',
  'PHASE10_RESALE_AND_DEVELOPMENT_ROUTES_SEPARATE',
  'native_structured_pdf',
  'otp_resale_existing_property_native_pdf_v1',
  'otp_new_development_native_pdf_v1',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpSettingsAdminReadiness.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_SETTINGS_ADMIN_READINESS_VERSION',
  'OTP_SETTINGS_ADMIN_READY_CONFIGURATION',
  'docx_generation_enabled',
  'template_fallback_enabled',
  'resale_existing_property',
  'new_development',
  'buildOtpContentScannerPhase9Audit',
  'buildOtpSettingsAdminReadiness',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP Settings admin readiness Phase 10 contract passed.')
