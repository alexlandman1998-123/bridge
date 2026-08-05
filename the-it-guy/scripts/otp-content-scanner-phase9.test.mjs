import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_CONTENT_SCANNER_PHASE9_VERSION,
  buildOtpContentScannerPhase9Audit,
  formatOtpContentScannerPhase9AuditMarkdown,
} from '../src/core/documents/otpContentScannerPhase9.js'
import {
  listOtpLegalContentTemplateSections,
} from '../src/core/documents/otpLegalContentTemplates.js'
import {
  scanOtpContentSections,
} from '../src/core/documents/otpContentScanner.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-content-scanner-phase9'],
  'node scripts/otp-content-scanner-phase9.test.mjs',
  'package.json should expose the OTP content scanner Phase 9 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-content-scanner-phase9'],
  'node scripts/report-otp-content-scanner-phase9.mjs',
  'package.json should expose the OTP Phase 9 content scanner report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-content-scanner-phase9'),
  'OTP vNext verification should include Phase 9 content scanner checks.',
)

assert.equal(OTP_CONTENT_SCANNER_PHASE9_VERSION, 'otp_content_scanner_phase9_v1')

const audit = buildOtpContentScannerPhase9Audit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(audit.version, OTP_CONTENT_SCANNER_PHASE9_VERSION)
assert.equal(audit.status, 'OTP_CONTENT_SCANNER_PHASE9_READY_FOR_RENDERER_WIRING')
assert.equal(audit.mutatedData, false)
assert.equal(audit.summary.routeCount, 2)
assert.equal(audit.summary.legalSectionCount, 26)
assert.equal(audit.summary.shellSectionCount, 16)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])
assert.deepEqual(audit.legalScanBlockers, [])
assert.deepEqual(audit.shellScanBlockers, [])
assert.deepEqual(audit.registryGaps, [])
assert.deepEqual(audit.structuredTokenGaps, [])
assert.deepEqual(audit.signatureBodyRisks, [])
assert.deepEqual(audit.shellCanonicalGaps, [])
assert.deepEqual(audit.routeForbiddenTokenGaps, [])
assert.deepEqual(audit.docxReferenceRisks, [])

for (const check of [
  'PHASE9_CONTENT_SCANNER_BOTH_ROUTES_PRESENT',
  'PHASE9_LEGAL_CONTENT_ROUTE_SCAN_PASSES',
  'PHASE9_FULL_CONTENT_SURFACE_SCAN_PASSES',
  'PHASE9_ALL_SCANNED_TOKENS_CANONICAL',
  'PHASE9_STRUCTURED_TERMS_RENDER_IN_LEGAL_CONTENT',
  'PHASE9_SIGNATURE_FIELDS_STAY_IN_SIGNING_PLAN',
  'PHASE9_SHELL_TOKENS_SCANNED_AND_CANONICAL',
  'PHASE9_FORBIDDEN_ROUTE_TOKENS_BLOCKED',
  'PHASE9_NO_DOCX_REFERENCE_IN_CONTENT',
  'PHASE9_ROUTE_SIGNAL_COVERAGE_COMPLETE',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const resaleScan = audit.routeScans.find((route) => route.variant === 'resale_existing_property')
const developmentScan = audit.routeScans.find((route) => route.variant === 'new_development')
assert.ok(resaleScan.shellScan.presentSignalGroupKeys.includes('resale_disclosure_fixtures'))
assert.ok(resaleScan.shellScan.presentSignalGroupKeys.includes('subject_to_sale'))
assert.equal(resaleScan.allContentTokens.includes('developer_signature'), false)
assert.equal(resaleScan.allContentTokens.includes('seller_signature'), true)
assert.ok(developmentScan.shellScan.presentSignalGroupKeys.includes('development_body_corporate'))
assert.ok(developmentScan.shellScan.presentSignalGroupKeys.includes('development_handover'))
assert.equal(developmentScan.allContentTokens.includes('seller_signature'), false)
assert.equal(developmentScan.allContentTokens.includes('developer_signature'), true)
assert.equal(developmentScan.allContentTokens.includes('contractor_initials'), true)
assert.equal(developmentScan.allContentTokens.includes('development_compliance_certificate_schedule'), true)

for (const token of [
  'mandate_commission_snapshot',
  'otp_commission_proposal',
  'otp_commission_variation_status',
  'otp_commission_approval_reference',
  'otp_buyer_cost_obligations',
  'otp_pending_cost_obligations',
  'matter_attorney_cost_quote_status',
]) {
  assert.equal(resaleScan.allContentTokens.includes(token), true, `resale scan should include ${token}.`)
  assert.equal(developmentScan.allContentTokens.includes(token), true, `development scan should include ${token}.`)
}

const resaleSections = listOtpLegalContentTemplateSections({ variant: 'resale_existing_property' })
const developmentSections = listOtpLegalContentTemplateSections({ variant: 'new_development' })
const developmentLeak = developmentSections.find((section) => section.section_key === 'development_handover')
const leakScan = scanOtpContentSections([...resaleSections, developmentLeak], { routeKey: 'resale_existing_property' })
assert.equal(leakScan.isValidForPublish, false)
assert.ok(leakScan.blockers.some((issue) => issue.code === 'OTP_FORBIDDEN_ROUTE_SIGNAL' && issue.signalGroupKey === 'development_handover'))

const markdown = formatOtpContentScannerPhase9AuditMarkdown(audit)
for (const token of [
  'OTP Template vNext Phase 9 Content Scanner',
  'OTP_CONTENT_SCANNER_PHASE9_READY_FOR_RENDERER_WIRING',
  'PHASE9_STRUCTURED_TERMS_RENDER_IN_LEGAL_CONTENT',
  'development_body_corporate',
  'resale_disclosure_fixtures',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpContentScannerPhase9.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_CONTENT_SCANNER_PHASE9_VERSION',
  'buildOtpContentScannerPhase9Audit',
  'buildOtpStructuredTermsManifest',
  'buildOtpSignatureInitialsManifest',
  'buildOtpBrandedShellManifest',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP content scanner Phase 9 contract passed.')
