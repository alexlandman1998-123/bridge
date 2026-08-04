import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_TEMPLATE_SHELL_TARGET_RENDER_MODE,
  OTP_TEMPLATE_SHELL_TARGET_SCOPE,
  OTP_TEMPLATE_SHELL_TARGET_VERSION,
  buildOtpTemplateShellTarget,
  buildOtpTemplateShellTargetAudit,
  formatOtpTemplateShellTargetMarkdown,
  listOtpTemplateShellTargets,
} from '../src/core/documents/otpTemplateShellTarget.js'
import {
  OTP_BRANDED_SHELL_LAYOUT_CONTRACT,
  OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT,
  OTP_TEMPLATE_BRANDED_SHELL_VERSION,
} from '../src/core/documents/otpTemplateBrandedShell.js'
import {
  OTP_LEGAL_CONTENT_TEMPLATE_VERSION,
} from '../src/core/documents/otpLegalContentTemplates.js'
import {
  OTP_TRANSITION_TEMPLATE_KEY,
} from '../src/core/documents/otpTemplateTargetFreeze.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-template-shell-target-phase1'],
  'node scripts/otp-template-shell-target-phase1.test.mjs',
  'package.json should expose the OTP template shell target Phase 1 contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.startsWith('npm run test:otp-template-target-freeze-phase0 && npm run test:otp-template-shell-target-phase1'),
  'OTP vNext verification should run the Phase 1 shell target after the Phase 0 target freeze.',
)

assert.equal(OTP_TEMPLATE_SHELL_TARGET_VERSION, 'otp_template_shell_target_phase1_v1')
assert.equal(OTP_TEMPLATE_SHELL_TARGET_RENDER_MODE, 'native_structured')
assert.equal(OTP_TEMPLATE_SHELL_TARGET_SCOPE, 'global_route_default')

const targets = listOtpTemplateShellTargets()
assert.equal(targets.length, 2)
assert.deepEqual(
  targets.map((target) => target.targetTemplateKey),
  ['otp_resale_existing_property_v1', 'otp_new_development_v1'],
)
assert.equal(targets.some((target) => target.targetTemplateKey === OTP_TRANSITION_TEMPLATE_KEY), false)

const resaleTarget = buildOtpTemplateShellTarget({ routeKey: 'resale_existing_property' })
const developmentTarget = buildOtpTemplateShellTarget({ routeKey: 'new_development' })

for (const target of [resaleTarget, developmentTarget]) {
  assert.equal(target.packetType, 'otp')
  assert.equal(target.templateFormat, 'html')
  assert.equal(target.renderMode, OTP_TEMPLATE_SHELL_TARGET_RENDER_MODE)
  assert.equal(target.templateScope, OTP_TEMPLATE_SHELL_TARGET_SCOPE)
  assert.equal(target.status, 'target_shell_ready_for_persistence')
  assert.equal(target.metadataJson.transition_from, OTP_TRANSITION_TEMPLATE_KEY)
  assert.equal(target.metadataJson.shell_version, OTP_TEMPLATE_BRANDED_SHELL_VERSION)
  assert.equal(target.metadataJson.shell_layout_contract, OTP_BRANDED_SHELL_LAYOUT_CONTRACT)
  assert.equal(target.metadataJson.signature_layout_contract, OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT)
  assert.equal(target.metadataJson.legal_content_version, OTP_LEGAL_CONTENT_TEMPLATE_VERSION)
  assert.equal(target.metadataJson.legal_review_required, true)
  assert.equal(target.metadataJson.counsel_approval_required, true)
  assert.equal(target.metadataJson.render_validation_required, true)
  assert.equal(target.shellSections.length, target.shellManifest.slots.length)
  assert.ok(target.contentSections.length > 0)
  assert.ok(target.requiredPublicationGates.some((gate) => gate.code === 'counsel_approval_recorded'))
  assert.ok(target.shellSections.every((section) => section.metadata_json.shell_layout_contract === OTP_BRANDED_SHELL_LAYOUT_CONTRACT))
}

assert.equal(resaleTarget.routeKey, 'resale_existing_property')
assert.equal(resaleTarget.targetTemplateKey, 'otp_resale_existing_property_v1')
assert.equal(resaleTarget.defaultRole, 'primary_resale_otp')
assert.equal(resaleTarget.metadataJson.otp_document_variant, 'resale_existing_property')

const resaleTopLeft = resaleTarget.shellManifest.slots.find((slot) => slot.region === 'top_left')
assert.equal(resaleTopLeft.key, 'brand_header')
assert.equal(resaleTopLeft.layout.logoPlacement, 'top_left')
assert.ok(resaleTopLeft.placeholderKeys.includes('organisation_logo_url'))

const resaleTopRight = resaleTarget.shellManifest.slots.find((slot) => slot.region === 'top_right')
assert.equal(resaleTopRight.key, 'document_header_details')
assert.equal(resaleTopRight.layout.detailsPlacement, 'top_right')
assert.ok(resaleTopRight.placeholderKeys.includes('otp_document_variant'))
assert.ok(resaleTopRight.placeholderKeys.includes('transaction_reference'))

const resaleSummary = resaleTarget.shellManifest.slots.find((slot) => slot.key === 'resale_transaction_summary')
assert.ok(resaleSummary.placeholderKeys.includes('seller_full_name'))
assert.ok(resaleSummary.placeholderKeys.includes('property_address'))
assert.ok(resaleSummary.placeholderKeys.includes('purchase_price'))

const resaleSignature = resaleTarget.shellManifest.slots.find((slot) => slot.slotType === 'signature_zone')
assert.ok(resaleSignature.placeholderKeys.includes('seller_signature'))
assert.equal(resaleSignature.placeholderKeys.includes('developer_signature'), false)
assert.deepEqual(
  resaleSignature.signing.planned_fields.map((field) => field.signer_role),
  ['purchaser_1', 'seller'],
)

assert.equal(developmentTarget.routeKey, 'new_development')
assert.equal(developmentTarget.targetTemplateKey, 'otp_new_development_v1')
assert.equal(developmentTarget.defaultRole, 'primary_new_development_otp')
assert.equal(developmentTarget.metadataJson.otp_document_variant, 'new_development')

const developmentTopLeft = developmentTarget.shellManifest.slots.find((slot) => slot.region === 'top_left')
assert.equal(developmentTopLeft.key, 'brand_header')
assert.equal(developmentTopLeft.layout.logoPlacement, 'top_left')
assert.ok(developmentTopLeft.placeholderKeys.includes('organisation_logo_url'))

const developmentTopRight = developmentTarget.shellManifest.slots.find((slot) => slot.region === 'top_right')
assert.equal(developmentTopRight.key, 'document_header_details')
assert.equal(developmentTopRight.layout.detailsPlacement, 'top_right')
assert.ok(developmentTopRight.placeholderKeys.includes('otp_document_variant'))
assert.ok(developmentTopRight.placeholderKeys.includes('document_reference'))

const developmentSummary = developmentTarget.shellManifest.slots.find((slot) => slot.key === 'development_transaction_summary')
assert.ok(developmentSummary.placeholderKeys.includes('developer_name'))
assert.ok(developmentSummary.placeholderKeys.includes('development_name'))
assert.ok(developmentSummary.placeholderKeys.includes('property_unit_number'))
assert.ok(developmentSummary.placeholderKeys.includes('vat_inclusive_purchase_price'))

const developmentSignature = developmentTarget.shellManifest.slots.find((slot) => slot.slotType === 'signature_zone')
assert.ok(developmentSignature.placeholderKeys.includes('developer_signature'))
assert.equal(developmentSignature.placeholderKeys.includes('seller_signature'), false)
assert.deepEqual(
  developmentSignature.signing.planned_fields.map((field) => field.signer_role),
  ['purchaser_1', 'developer_authorised_signatory'],
)

assert.equal(buildOtpTemplateShellTarget({ routeKey: 'unknown' }), null)

const audit = buildOtpTemplateShellTargetAudit({ checkedAt: '2026-08-03T00:00:00.000Z' })
assert.equal(audit.version, OTP_TEMPLATE_SHELL_TARGET_VERSION)
assert.equal(audit.status, 'OTP_TEMPLATE_SHELL_TARGET_READY_FOR_PERSISTENCE')
assert.equal(audit.mutatedData, false)
assert.equal(audit.summary.routeTargetCount, 2)
assert.equal(audit.summary.topLeftLogo, true)
assert.equal(audit.summary.topRightDetails, true)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

for (const code of [
  'PHASE1_TWO_ROUTE_TARGET_SHELLS',
  'PHASE1_TRANSITION_TEMPLATE_NOT_TARGET',
  'PHASE1_TOP_LEFT_LOGO_ON_EVERY_TARGET',
  'PHASE1_TOP_RIGHT_DETAILS_ON_EVERY_TARGET',
  'PHASE1_RESALE_SUMMARY_BOUND',
  'PHASE1_DEVELOPMENT_SUMMARY_BOUND',
  'PHASE1_RESALE_SIGNATURE_BOUND',
  'PHASE1_DEVELOPMENT_SIGNATURE_BOUND',
  'PHASE1_LAYOUT_CONTRACT_ON_EVERY_SLOT',
]) {
  assert.equal(audit.checks.find((check) => check.code === code)?.pass, true, `${code} should pass.`)
}

const markdown = formatOtpTemplateShellTargetMarkdown(audit)
for (const token of [
  'OTP Template vNext Phase 1 Template Shell',
  'OTP_TEMPLATE_SHELL_TARGET_READY_FOR_PERSISTENCE',
  'Top-left logo',
  'Top-right details',
  'otp_resale_existing_property_v1',
  'otp_new_development_v1',
  'seller_signature',
  'developer_signature',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

console.log('OTP template shell target Phase 1 contract passed.')
