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
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-branded-pdf-shell-phase6'),
  'OTP vNext verification should include Phase 6 branded PDF shell checks.',
)

assert.equal(OTP_TEMPLATE_BRANDED_SHELL_VERSION, 'otp_template_vnext_phase6_branded_pdf_shell_v1')
assert.equal(OTP_BRANDED_SHELL_LAYOUT_CONTRACT, 'otp_branded_pdf_shell_phase6_v1')
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
assert.equal(topRightDetails.layout.companyDetailsPlacement, 'top_right')
assert.equal(topRightDetails.layout.includesRouteBadge, true)
for (const token of [
  'organisation_trading_name',
  'organisation_legal_name',
  'organisation_registration_number',
  'organisation_registered_address',
  'agent_full_name',
  'agent_email',
  'agent_phone',
]) {
  assert.ok(topRightDetails.placeholderKeys.includes(token), `top-right details should include ${token}.`)
}
assert.ok(topRightDetails.placeholderKeys.includes('otp_document_variant'))
assert.ok(topRightDetails.placeholderKeys.includes('transaction_reference'))
assert.ok(topRightDetails.placeholderKeys.includes('document_reference'))

const footerLeft = listOtpBrandedShellSlots({ variant: 'resale_existing_property', region: 'bottom_left' })[0]
assert.equal(footerLeft.key, 'agency_footer_left')
assert.equal(footerLeft.layout.footerPlacement, 'bottom_left')
assert.equal(footerLeft.layout.align, 'left')
assert.ok(footerLeft.placeholderKeys.includes('organisation_trading_name'))

const footerMiddle = listOtpBrandedShellSlots({ variant: 'resale_existing_property', region: 'bottom_middle' })[0]
assert.equal(footerMiddle.key, 'page_number_footer_middle')
assert.equal(footerMiddle.slotType, 'footer_page_number')
assert.equal(footerMiddle.sourceOwners.includes('rendering_runtime'), true)
assert.equal(footerMiddle.blankRenderPolicy, 'runtime_generated')
assert.equal(footerMiddle.layout.pageNumberFormat, 'Page {page} of {totalPages}')

const footerRight = listOtpBrandedShellSlots({ variant: 'new_development', region: 'bottom_right' })[0]
assert.equal(footerRight.key, 'website_footer_right')
assert.equal(footerRight.layout.footerPlacement, 'bottom_right')
assert.equal(footerRight.layout.align, 'right')
assert.ok(footerRight.placeholderKeys.includes('organisation_website'))

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
  resaleSignature.signing.planned_fields.map((field) => `${field.signer_role}:${field.field_type}:${field.required}:${field.repeat || ''}`),
  [
    'purchaser_1:signature:true:',
    'purchaser_1:initial:true:every_page',
    'purchaser_1:date:true:',
    'seller:signature:true:',
    'seller:initial:true:every_page',
    'seller:date:true:',
  ],
)
assert.equal(resaleSignature.layout.signatureLayoutContract, OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT)
assert.equal(resaleSignature.layout.suppressSectionBody, true)
assert.equal(resaleSignature.layout.initialsRequiredOnEveryPage, true)

const developmentSignature = developmentManifest.slots.find((slot) => slot.slotType === 'signature_zone')
assert.deepEqual(
  developmentSignature.signing.planned_fields.map((field) => `${field.signer_role}:${field.field_type}:${field.required}:${field.repeat || ''}`),
  [
    'purchaser_1:signature:true:',
    'purchaser_1:initial:true:every_page',
    'purchaser_1:date:true:',
    'developer_authorised_signatory:signature:true:',
    'developer_authorised_signatory:initial:true:every_page',
    'developer_authorised_signatory:date:true:',
    'contractor_authorised_signatory:signature:true:',
    'contractor_authorised_signatory:initial:true:every_page',
    'contractor_authorised_signatory:date:true:',
    'agent:signature:true:',
    'agent:initial:true:every_page',
    'agent:date:true:',
  ],
)
assert.equal(developmentSignature.layout.signatureLayoutContract, OTP_BRANDED_SHELL_SIGNATURE_LAYOUT_CONTRACT)
assert.equal(developmentSignature.layout.suppressSectionBody, true)
assert.equal(developmentSignature.layout.initialsRequiredOnEveryPage, true)

for (const manifest of [resaleManifest, developmentManifest]) {
  for (const slot of manifest.slots) {
    assert.equal(slot.layout.contract, OTP_BRANDED_SHELL_LAYOUT_CONTRACT, `${slot.key} should carry the branded PDF shell layout contract.`)
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
assert.equal(audit.summary.slotCount, 10)
assert.equal(audit.summary.topLeftLogo, true)
assert.equal(audit.summary.topRightDetails, true)
assert.equal(audit.summary.topRightCompanyDetails, true)
assert.equal(audit.summary.footerAgencyLeft, true)
assert.equal(audit.summary.footerPageNumberMiddle, true)
assert.equal(audit.summary.footerWebsiteRight, true)
assert.equal(audit.summary.blockerCount, 0)
assert.deepEqual(audit.blockers, [])

for (const check of [
  'PHASE5_TOP_LEFT_LOGO_SLOT_PRESENT',
  'PHASE5_TOP_RIGHT_DETAILS_SLOT_PRESENT',
  'PHASE6_COMPANY_DETAILS_TOP_RIGHT_PRESENT',
  'PHASE6_FOOTER_AGENCY_NAME_BOTTOM_LEFT_PRESENT',
  'PHASE6_FOOTER_PAGE_NUMBER_BOTTOM_MIDDLE_PRESENT',
  'PHASE6_FOOTER_WEBSITE_BOTTOM_RIGHT_PRESENT',
  'PHASE6_REFERENCE_BRANDED_CHROME_COMPLETE',
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
    'organisation_website',
    'developer_signature',
    'developer_initials',
    'contractor_signature',
    'contractor_initials',
    'agent_signature',
    'agent_initials',
  ],
})
assert.deepEqual(tokenValidation.unknown, [])
assert.equal(tokenValidation.isValid, true)

const fieldAudit = buildOtpFieldRegistryAudit({ checkedAt: '2026-08-02T00:00:00.000Z' })
assert.equal(fieldAudit.status, 'OTP_FIELD_REGISTRY_READY_FOR_CONTENT_RULES')
assert.deepEqual(fieldAudit.mergeRegistryGaps, [])

const markdown = formatOtpBrandedShellAuditMarkdown(audit)
for (const token of [
  'OTP Template vNext Phase 6 Branded PDF Shell',
  'OTP_BRANDED_SHELL_READY_FOR_CONTENT_RULES',
  'Top-left logo',
  'Top-right details',
  'Footer website right',
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
  'bottom_left',
  'bottom_middle',
  'bottom_right',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP branded PDF shell Phase 6 contract passed.')
