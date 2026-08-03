import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_BRANDED_SHELL_LAYOUT_CONTRACT,
  OTP_BRANDED_SHELL_PAGE_BASELINE,
  OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT,
  OTP_TEMPLATE_BRANDED_SHELL_VERSION,
  buildOtpBrandedShellAudit,
  buildOtpBrandedShellManifest,
  estimateOtpBrandedShellLayout,
  formatOtpBrandedShellAuditMarkdown,
  listOtpBrandedShellSlots,
} from '../src/core/documents/otpTemplateBrandedShell.js'
import { buildOtpFieldRegistryAudit } from '../src/core/documents/otpFieldRegistry.js'
import { validateTemplateTokensAgainstRegistry } from '../src/core/documents/mergeFieldRegistry.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-branded-shell-phase5'],
  'node scripts/otp-branded-shell-phase5.test.mjs',
  'package.json should expose the OTP branded shell Phase 5 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-branded-shell'],
  'node scripts/report-otp-branded-shell.mjs',
  'package.json should expose the OTP branded shell report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-branded-shell-phase5'),
  'OTP vNext verification should include Phase 5 branded shell checks.',
)

assert.equal(OTP_TEMPLATE_BRANDED_SHELL_VERSION, 'otp_template_vnext_phase5_branded_shell_v1')
assert.equal(OTP_BRANDED_SHELL_LAYOUT_CONTRACT, 'otp_branded_template_shell_phase5_v1')
assert.equal(OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT, 'arch9-otp-route-aware-signature-layout-v1')
assert.equal(OTP_BRANDED_SHELL_PAGE_BASELINE.pageWidth, 595.28)
assert.equal(OTP_BRANDED_SHELL_PAGE_BASELINE.pageHeight, 841.89)
assert.equal(OTP_BRANDED_SHELL_PAGE_BASELINE.logoMaxWidth, 150)

const resaleManifest = buildOtpBrandedShellManifest({ variant: 'resale_existing_property' })
const developmentManifest = buildOtpBrandedShellManifest({ variant: 'new_development' })

assert.equal(resaleManifest.documentVariant, 'resale_existing_property')
assert.equal(developmentManifest.documentVariant, 'new_development')
assert.equal(resaleManifest.slots[0].key, 'brand_header')
assert.equal(developmentManifest.slots[0].key, 'brand_header')
assert.equal(resaleManifest.slots.at(-1).slotType, 'signature_zone')
assert.equal(developmentManifest.slots.at(-1).slotType, 'signature_zone')

const brandHeader = listOtpBrandedShellSlots({ variant: 'resale_existing_property', region: 'top_left' })[0]
assert.equal(brandHeader.key, 'brand_header')
assert.equal(brandHeader.layout.logoPlacement, 'top_left')
assert.ok(brandHeader.placeholderKeys.includes('organisation_logo_url'))
assert.ok(brandHeader.layout.allowTextFallback)

const topRightDetails = listOtpBrandedShellSlots({ variant: 'new_development', region: 'top_right' })[0]
assert.equal(topRightDetails.key, 'document_header_details')
assert.equal(topRightDetails.layout.detailsPlacement, 'top_right')
assert.equal(topRightDetails.layout.includesRouteBadge, true)
assert.ok(topRightDetails.placeholderKeys.includes('otp_document_variant'))
assert.ok(topRightDetails.placeholderKeys.includes('transaction_reference'))
assert.ok(topRightDetails.placeholderKeys.includes('document_reference'))

assert.ok(resaleManifest.placeholderKeys.includes('seller_full_name'))
assert.ok(resaleManifest.placeholderKeys.includes('property_address'))
assert.equal(resaleManifest.placeholderKeys.includes('developer_signature'), false)
assert.ok(developmentManifest.placeholderKeys.includes('developer_name'))
assert.ok(developmentManifest.placeholderKeys.includes('development_name'))
assert.ok(developmentManifest.placeholderKeys.includes('vat_inclusive_purchase_price'))
assert.ok(developmentManifest.placeholderKeys.includes('developer_signature'))
assert.equal(developmentManifest.placeholderKeys.includes('seller_signature'), false)

const resaleSignature = resaleManifest.slots.find((slot) => slot.slotType === 'signature_zone')
assert.deepEqual(
  resaleSignature.signing.planned_fields.map((field) => `${field.signer_role}:${field.field_type}:${field.required}`),
  ['purchaser_1:signature:true', 'seller:signature:true'],
)
assert.equal(resaleSignature.layout.signatureLayoutContract, OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT)
assert.equal(resaleSignature.layout.suppressSectionBody, true)

const developmentSignature = developmentManifest.slots.find((slot) => slot.slotType === 'signature_zone')
assert.deepEqual(
  developmentSignature.signing.planned_fields.map((field) => `${field.signer_role}:${field.field_type}:${field.required}`),
  ['purchaser_1:signature:true', 'developer_authorised_signatory:signature:true'],
)
assert.equal(developmentSignature.layout.signatureLayoutContract, OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT)
assert.equal(developmentSignature.layout.suppressSectionBody, true)

for (const manifest of [resaleManifest, developmentManifest]) {
  for (const slot of manifest.slots) {
    assert.equal(slot.layout.contract, OTP_BRANDED_SHELL_LAYOUT_CONTRACT, `${slot.key} should carry the Phase 5 layout contract.`)
    assert.ok(slot.fallbackText || slot.blankRenderPolicy === 'runtime_generated', `${slot.key} should not be a blank-render risk.`)
  }
}

const resaleEstimate = estimateOtpBrandedShellLayout({ variant: 'resale_existing_property' })
const developmentEstimate = estimateOtpBrandedShellLayout({ variant: 'new_development' })
assert.equal(resaleEstimate.firstPageHasClauseSpace, true)
assert.equal(developmentEstimate.firstPageHasClauseSpace, true)
assert.ok(developmentEstimate.reservedFirstPageHeight > resaleEstimate.reservedFirstPageHeight)

const audit = buildOtpBrandedShellAudit({ checkedAt: '2026-08-02T00:00:00.000Z' })
assert.equal(audit.version, OTP_TEMPLATE_BRANDED_SHELL_VERSION)
assert.equal(audit.mutatedData, false)
assert.equal(audit.status, 'OTP_BRANDED_SHELL_READY_FOR_CONTENT_RULES')
assert.equal(audit.summary.variantCount, 2)
assert.equal(audit.summary.slotCount, 8)
assert.equal(audit.summary.topLeftLogo, true)
assert.equal(audit.summary.topRightDetails, true)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

for (const check of [
  'PHASE5_TOP_LEFT_LOGO_SLOT_PRESENT',
  'PHASE5_TOP_RIGHT_DETAILS_SLOT_PRESENT',
  'PHASE5_RESALE_AND_DEVELOPMENT_SHELLS_PRESENT',
  'PHASE5_SHELL_TOKENS_CANONICAL',
  'PHASE5_SHELL_SOURCE_OWNERS_KNOWN',
  'PHASE5_LAYOUT_CONTRACT_ON_EVERY_SLOT',
  'PHASE5_BLANK_RENDER_RISK_CONTROLLED',
  'PHASE5_BUYER_ONBOARDING_NOT_DUMPING_GROUND',
  'PHASE5_RESALE_SUMMARY_USES_SELLER',
  'PHASE5_DEVELOPMENT_SUMMARY_USES_DEVELOPER',
  'PHASE5_DEVELOPMENT_SIGNATURE_NOT_RESALE_SIGNATURE',
  'PHASE5_FIRST_PAGE_HAS_CLAUSE_SPACE',
]) {
  assert.equal(audit.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

const tokenValidation = validateTemplateTokensAgainstRegistry({
  packetType: 'otp',
  tokens: [
    'organisation_logo_url',
    'organisation_trading_name',
    'otp_document_variant',
    'transaction_reference',
    'document_reference',
    'template_version',
    'developer_signature',
  ],
})
assert.deepEqual(tokenValidation.unknown, [])
assert.equal(tokenValidation.isValid, true)

const fieldAudit = buildOtpFieldRegistryAudit({ checkedAt: '2026-08-02T00:00:00.000Z' })
assert.equal(fieldAudit.status, 'OTP_FIELD_REGISTRY_READY_FOR_CONTENT_RULES')
assert.deepEqual(fieldAudit.mergeRegistryGaps, [])

const markdown = formatOtpBrandedShellAuditMarkdown(audit)
for (const token of [
  'OTP Template vNext Phase 5 Branded Shell',
  'OTP_BRANDED_SHELL_READY_FOR_CONTENT_RULES',
  'Top-left logo',
  'Top-right details',
  'New development OTP',
  'developer_signature',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpTemplateBrandedShell.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_TEMPLATE_BRANDED_SHELL_VERSION',
  'OTP_BRANDED_SHELL_LAYOUT_CONTRACT',
  'OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT',
  'buildOtpBrandedShellAudit',
  'formatOtpBrandedShellAuditMarkdown',
  'top_left',
  'top_right',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP branded shell Phase 5 contract passed.')
