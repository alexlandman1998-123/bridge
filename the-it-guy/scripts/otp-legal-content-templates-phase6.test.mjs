import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_LEGAL_CONTENT_LAYOUT_CONTRACT,
  OTP_LEGAL_CONTENT_TEMPLATE_VERSION,
  buildOtpLegalContentTemplateReport,
  formatOtpLegalContentTemplateMarkdown,
  listOtpLegalContentTemplateSections,
} from '../src/core/documents/otpLegalContentTemplates.js'
import { buildOtpFieldRegistryAudit } from '../src/core/documents/otpFieldRegistry.js'
import { buildOtpBrandedShellAudit } from '../src/core/documents/otpTemplateBrandedShell.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-legal-content-templates-phase6'],
  'node scripts/otp-legal-content-templates-phase6.test.mjs',
  'package.json should expose the OTP legal content templates Phase 6 contract.',
)
assert.equal(
  packageJson.scripts?.['report:otp-legal-content-templates'],
  'node scripts/report-otp-legal-content-templates.mjs',
  'package.json should expose the OTP legal content templates report.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('test:otp-legal-content-templates-phase6'),
  'OTP vNext verification should include Phase 6 legal content checks.',
)

assert.equal(OTP_LEGAL_CONTENT_TEMPLATE_VERSION, 'otp_legal_content_templates_phase6_v1')
assert.equal(OTP_LEGAL_CONTENT_LAYOUT_CONTRACT, 'otp_legal_content_section_phase6_v1')

const allSections = listOtpLegalContentTemplateSections()
assert.equal(allSections.length, 18)
assert.deepEqual(
  allSections.map((section) => section.section_key),
  [
    'definitions_shared',
    'development_parties',
    'resale_parties',
    'development_unit',
    'resale_property',
    'purchase_price',
    'development_vat_purchase_price',
    'finance_suspensive_conditions',
    'subject_to_sale',
    'development_handover',
    'resale_occupation_rent',
    'development_compliance_body_corporate',
    'resale_disclosure_fixtures_compliance',
    'transfer_conveyancer',
    'buyer_cost_obligations',
    'otp_commission_variation',
    'special_conditions_annexures',
    'popia_fica',
  ],
)

for (const section of allSections) {
  assert.equal(section.metadata_json.wording_version, OTP_LEGAL_CONTENT_TEMPLATE_VERSION)
  assert.equal(section.metadata_json.legal_review_required, true)
  assert.equal(section.metadata_json.native_pdf_layout.contract, OTP_LEGAL_CONTENT_LAYOUT_CONTRACT)
  assert.doesNotMatch(section.section_label, /\b(pack|packet)\b/i)
  assert.doesNotMatch(section.legal_text.split(/\r?\n/)[0] || '', /\b(pack|packet)\b/i)
  assert.doesNotMatch(section.legal_text, /^\s*{{[^{}]+}}\s*$/m, `${section.section_key} should not contain placeholder-only lines.`)
}

const resaleSections = listOtpLegalContentTemplateSections({ variant: 'resale_existing_property' })
const developmentSections = listOtpLegalContentTemplateSections({ variant: 'new_development' })
const resaleKeys = new Set(resaleSections.map((section) => section.section_key))
const developmentKeys = new Set(developmentSections.map((section) => section.section_key))

assert.equal(resaleSections.length, 13)
assert.equal(developmentSections.length, 13)
assert.equal(resaleKeys.has('resale_disclosure_fixtures_compliance'), true)
assert.equal(resaleKeys.has('subject_to_sale'), true)
assert.equal(resaleKeys.has('resale_occupation_rent'), true)
assert.equal(resaleKeys.has('development_unit'), false)
assert.equal(resaleKeys.has('development_handover'), false)
assert.equal(developmentKeys.has('development_unit'), true)
assert.equal(developmentKeys.has('development_vat_purchase_price'), true)
assert.equal(developmentKeys.has('development_handover'), true)
assert.equal(developmentKeys.has('development_compliance_body_corporate'), true)
assert.equal(developmentKeys.has('resale_disclosure_fixtures_compliance'), false)
assert.equal(developmentKeys.has('subject_to_sale'), false)
assert.equal(resaleKeys.has('buyer_cost_obligations'), true)
assert.equal(resaleKeys.has('otp_commission_variation'), true)
assert.equal(developmentKeys.has('buyer_cost_obligations'), true)
assert.equal(developmentKeys.has('otp_commission_variation'), true)

const subjectToSale = allSections.find((section) => section.section_key === 'subject_to_sale')
assert.equal(subjectToSale.is_required, false)
assert.equal(subjectToSale.metadata_json.conditional_pack, true)
assert.equal(subjectToSale.condition_json.enabled, true)
assert.ok(subjectToSale.condition_json.any?.length)
assert.ok(subjectToSale.placeholder_keys.includes('subject_sale_minimum_price'))

const resaleDisclosure = allSections.find((section) => section.section_key === 'resale_disclosure_fixtures_compliance')
for (const token of ['mandatory_disclosure_annexure', 'fixtures_included', 'fixtures_excluded', 'compliance_certificate_schedule']) {
  assert.ok(resaleDisclosure.placeholder_keys.includes(token), `resale disclosure should include ${token}.`)
}
assert.equal(resaleDisclosure.source_owners.includes('buyer_onboarding'), false)

const developmentCompliance = allSections.find((section) => section.section_key === 'development_compliance_body_corporate')
for (const token of ['body_corporate_rules_annexure', 'development_levy_estimate', 'utility_connection_charges', 'development_compliance_certificate_schedule']) {
  assert.ok(developmentCompliance.placeholder_keys.includes(token), `development compliance should include ${token}.`)
}

const developmentVat = allSections.find((section) => section.section_key === 'development_vat_purchase_price')
assert.deepEqual(developmentVat.variants, ['new_development'])
assert.deepEqual(developmentVat.placeholder_keys, ['vat_inclusive_purchase_price'])

const buyerCosts = allSections.find((section) => section.section_key === 'buyer_cost_obligations')
for (const token of ['otp_buyer_cost_obligations', 'otp_pending_cost_obligations', 'matter_attorney_cost_quote_status']) {
  assert.ok(buyerCosts.placeholder_keys.includes(token), `buyer cost obligations should include ${token}.`)
}

const commissionVariation = allSections.find((section) => section.section_key === 'otp_commission_variation')
for (const token of ['mandate_commission_snapshot', 'otp_commission_proposal', 'otp_commission_variation_status', 'otp_commission_approval_reference']) {
  assert.ok(commissionVariation.placeholder_keys.includes(token), `commission variation should include ${token}.`)
}

const report = buildOtpLegalContentTemplateReport({ generatedAt: '2026-08-03T00:00:00.000Z' })
assert.equal(report.version, OTP_LEGAL_CONTENT_TEMPLATE_VERSION)
assert.equal(report.mutatedData, false)
assert.equal(report.status, 'OTP_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW')
assert.equal(report.summary.routeCount, 2)
assert.equal(report.summary.sectionCount, 18)
assert.equal(report.summary.resaleSectionCount, 13)
assert.equal(report.summary.developmentSectionCount, 13)
assert.equal(report.summary.blockerCount, 0)
assert.deepEqual(report.blockers, [])
assert.equal(report.shellAudit.status, 'OTP_BRANDED_SHELL_READY_FOR_CONTENT_RULES')

for (const check of [
  'PHASE6_BRANDED_SHELL_READY',
  'PHASE6_BOTH_PRIMARY_ROUTES_PRESENT',
  'PHASE6_RESALE_REQUIRED_CLAUSES_PRESENT',
  'PHASE6_DEVELOPMENT_REQUIRED_CLAUSES_PRESENT',
  'PHASE6_DEVELOPMENT_NOT_RESALE_WORDING',
  'PHASE6_RESALE_NOT_DEVELOPMENT_WORDING',
  'PHASE6_TOKENS_CANONICAL',
  'PHASE6_TOKENS_IN_FIELD_REGISTRY_AND_ROUTE',
  'PHASE6_DEFINITIONS_COVER_CLAUSES',
  'PHASE6_SOURCE_OWNERS_MATCH_FIELDS',
  'PHASE6_LAYOUT_CONTRACT_ON_EVERY_SECTION',
  'PHASE6_BLANK_RENDER_RISK_CONTROLLED',
  'PHASE6_CLIENT_HEADINGS_CLEAN',
]) {
  assert.equal(report.checks.find((item) => item.code === check)?.pass, true, `${check} should pass.`)
}

for (const routeAudit of report.routeAudits) {
  assert.deepEqual(routeAudit.registryValidation.unknown, [])
  assert.deepEqual(routeAudit.registryValidation.deprecated, [])
  assert.deepEqual(routeAudit.fieldRegistryGaps, [])
  assert.deepEqual(routeAudit.routeFieldGaps, [])
  assert.deepEqual(routeAudit.definitionGaps, [])
  assert.deepEqual(routeAudit.sourceOwnerGaps, [])
  assert.deepEqual(routeAudit.layoutContractGaps, [])
  assert.deepEqual(routeAudit.blankRenderRisks, [])
  assert.deepEqual(routeAudit.placeholderOnlyLines, [])
}

const fieldAudit = buildOtpFieldRegistryAudit({ checkedAt: '2026-08-03T00:00:00.000Z' })
assert.equal(fieldAudit.status, 'OTP_FIELD_REGISTRY_READY_FOR_CONTENT_RULES')
assert.deepEqual(fieldAudit.mergeRegistryGaps, [])

const shellAudit = buildOtpBrandedShellAudit({ checkedAt: '2026-08-03T00:00:00.000Z' })
assert.equal(shellAudit.status, 'OTP_BRANDED_SHELL_READY_FOR_CONTENT_RULES')

const markdown = formatOtpLegalContentTemplateMarkdown(report)
for (const token of [
  'OTP Template vNext Phase 6 Legal Content Templates',
  'OTP_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW',
  'resale_disclosure_fixtures_compliance',
  'development_compliance_body_corporate',
  'Counsel Review Boundary',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/otpLegalContentTemplates.js', import.meta.url), 'utf8')
for (const token of [
  'OTP_LEGAL_CONTENT_TEMPLATE_VERSION',
  'OTP_LEGAL_CONTENT_TEMPLATE_SECTIONS',
  'buildOtpLegalContentTemplateReport',
  'formatOtpLegalContentTemplateMarkdown',
  'development_vat_purchase_price',
  'subject_to_sale',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('OTP legal content templates Phase 6 contract passed.')
