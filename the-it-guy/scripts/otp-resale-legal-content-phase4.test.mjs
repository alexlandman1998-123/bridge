import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_RESALE_LEGAL_CONTENT_ROUTE_KEY,
  OTP_RESALE_LEGAL_CONTENT_SECTIONS,
  OTP_RESALE_LEGAL_CONTENT_STATUS_READY,
  OTP_RESALE_LEGAL_CONTENT_VERSION,
  buildOtpResaleLegalContentReport,
  formatOtpResaleLegalContentMarkdown,
  listOtpResaleLegalContentSections,
} from '../src/core/documents/otpResaleLegalContent.js'
import {
  listOtpResaleReferenceLegalSections,
} from '../src/core/documents/otpReferenceExtraction.js'
import {
  buildOtpFieldRegistryPhase3Audit,
  getOtpFieldDefinition,
} from '../src/core/documents/otpFieldRegistry.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-resale-legal-content-phase4'],
  'node scripts/otp-resale-legal-content-phase4.test.mjs',
  'package.json should expose the OTP resale legal content Phase 4 contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('npm run test:otp-resale-legal-content-phase4 && npm run test:otp-new-development-legal-content-phase5 && npm run test:otp-field-data-lock-phase4'),
  'OTP vNext verification should run resale and new-development legal content before the field/data lock.',
)

assert.equal(OTP_RESALE_LEGAL_CONTENT_VERSION, 'otp_resale_legal_content_phase4_v1')
assert.equal(OTP_RESALE_LEGAL_CONTENT_STATUS_READY, 'OTP_RESALE_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW')
assert.equal(OTP_RESALE_LEGAL_CONTENT_ROUTE_KEY, 'resale_existing_property')

const referenceSections = listOtpResaleReferenceLegalSections()
const sections = listOtpResaleLegalContentSections()
assert.equal(referenceSections.length, 28)
assert.equal(sections.length, 28)
assert.equal(OTP_RESALE_LEGAL_CONTENT_SECTIONS.length, 28)

assert.deepEqual(
  sections.map((section) => section.reference_section_number),
  Array.from({ length: 28 }, (_, index) => index + 3),
  'Phase 4 should cover reference sections 3 through 30 in order.',
)
assert.deepEqual(
  sections.map((section) => section.reference_section_key),
  referenceSections.map((section) => section.key),
  'Phase 4 section keys should mirror the Phase 1 reference legal section keys.',
)

for (const section of sections) {
  assert.equal(section.route_key, 'resale_existing_property')
  assert.deepEqual(section.variants, ['resale_existing_property'])
  assert.equal(section.metadata_json.content_version, OTP_RESALE_LEGAL_CONTENT_VERSION)
  assert.equal(section.metadata_json.route_key, 'resale_existing_property')
  assert.equal(section.metadata_json.reference_section_number, section.reference_section_number)
  assert.equal(section.metadata_json.reference_section_key, section.reference_section_key)
  assert.ok(section.metadata_json.reference_source_sha256)
  assert.equal(section.metadata_json.legal_review_required, true)
  assert.equal(section.metadata_json.counsel_approval_required, true)
  assert.equal(section.metadata_json.copied_from_reference_verbatim, false)
  assert.ok(section.legal_text.length >= 160, `${section.section_key} should have substantive counsel-review wording.`)
  assert.ok(section.anchor_codes.length >= 1, `${section.section_key} should have at least one source anchor.`)
  assert.ok(section.source_owners.every(Boolean), `${section.section_key} should not contain blank source owners.`)
  for (const token of section.placeholder_keys) {
    const definition = getOtpFieldDefinition(token)
    assert.ok(definition, `${token} should exist in the OTP field registry.`)
    assert.ok(definition.variants.includes('resale_existing_property'), `${token} should be allowed on the resale route.`)
    assert.equal(section.source_owners.includes(definition.owner), true, `${section.section_key} should declare ${definition.owner} for ${token}.`)
    assert.equal(/^developer_|^development_|^body_corporate|^contractor_|^sectional_plan|^snagging_|^participation_quota|^parking_bay|^garage_allocation/.test(token), false, `${token} should not appear in resale legal content.`)
  }
}

const byReferenceKey = new Map(sections.map((section) => [section.reference_section_key, section]))
assert.ok(byReferenceKey.get('definitions')?.legal_text.includes('Agreement'))
assert.ok(byReferenceKey.get('purchase_price')?.placeholder_keys.includes('purchase_price'))
assert.ok(byReferenceKey.get('purchase_price')?.placeholder_keys.includes('seller_vat_number'))
assert.ok(byReferenceKey.get('the_property')?.placeholder_keys.includes('property_township'))
assert.ok(byReferenceKey.get('the_property')?.placeholder_keys.includes('homeowners_association_name'))
assert.ok(byReferenceKey.get('suspensive_conditions')?.placeholder_keys.includes('structured_suspensive_conditions'))
assert.ok(byReferenceKey.get('warranties')?.placeholder_keys.includes('mandatory_disclosure_annexure'))
assert.ok(byReferenceKey.get('nomination_capacity_parties')?.placeholder_keys.includes('buyer_representative_capacity'))
assert.ok(byReferenceKey.get('commission')?.placeholder_keys.includes('agent_ffc_number'))
assert.ok(byReferenceKey.get('certificates')?.placeholder_keys.includes('compliance_certificate_schedule'))
assert.ok(byReferenceKey.get('rates_taxes_consumption_charges')?.placeholder_keys.includes('seller_bond_institution'))
assert.ok(byReferenceKey.get('domicilium_notices')?.placeholder_keys.includes('buyer_domicilium_address'))
assert.ok(byReferenceKey.get('domicilium_notices')?.placeholder_keys.includes('seller_domicilium_address'))
assert.ok(byReferenceKey.get('marital_status_purchaser')?.placeholder_keys.includes('buyer_marital_regime'))
assert.equal(byReferenceKey.has('applicable_law'), true)

const fieldRegistryAudit = buildOtpFieldRegistryPhase3Audit({ checkedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(fieldRegistryAudit.status, 'OTP_FIELD_REGISTRY_PHASE3_READY_FOR_DATA_LOCK')
assert.deepEqual(fieldRegistryAudit.mergeRegistryGaps, [])

const report = buildOtpResaleLegalContentReport({ generatedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(report.version, OTP_RESALE_LEGAL_CONTENT_VERSION)
assert.equal(report.status, OTP_RESALE_LEGAL_CONTENT_STATUS_READY)
assert.equal(report.mutatedData, false)
assert.equal(report.routeKey, 'resale_existing_property')
assert.equal(report.summary.sectionCount, 28)
assert.equal(report.summary.referenceSectionCount, 28)
assert.equal(report.summary.tokenCount, 59)
assert.equal(report.summary.blockerCount, 0)
assert.equal(report.summary.warningCount, 0)
assert.deepEqual(report.blockers, [])
assert.deepEqual(report.warnings, [])
assert.deepEqual(report.registryValidation.unknown, [])
assert.deepEqual(report.registryValidation.deprecated, [])
assert.deepEqual(report.fieldRegistryGaps, [])
assert.deepEqual(report.routeForbiddenTokens, [])
assert.deepEqual(report.metadataGaps, [])
assert.deepEqual(report.sourceOwnerGaps, [])
assert.deepEqual(report.contentDepthGaps, [])

for (const code of [
  'PHASE4_RESALE_28_LEGAL_SECTIONS_PRESENT',
  'PHASE4_RESALE_REFERENCE_NUMBERS_COVERED',
  'PHASE4_RESALE_REFERENCE_KEYS_COVERED',
  'PHASE4_RESALE_ROUTE_ONLY',
  'PHASE4_RESALE_TOKENS_CANONICAL',
  'PHASE4_RESALE_TOKENS_IN_FIELD_REGISTRY',
  'PHASE4_RESALE_EXCLUDES_DEVELOPMENT_TOKENS',
  'PHASE4_RESALE_REFERENCE_METADATA_LOCKED',
  'PHASE4_RESALE_SOURCE_OWNERS_DECLARED',
  'PHASE4_RESALE_CONTENT_DEPTH_PRESENT',
  'PHASE4_RESALE_SELLER_ADMIN_COVERED',
  'PHASE4_RESALE_DOMICILIUM_COVERED',
  'PHASE4_RESALE_MARITAL_STATUS_COVERED',
  'PHASE4_RESALE_AGENT_COMMISSION_COVERED',
]) {
  assert.equal(report.checks.find((check) => check.code === code)?.pass, true, `${code} should pass.`)
}

const markdown = formatOtpResaleLegalContentMarkdown(report)
for (const token of [
  'OTP Template vNext Phase 4 Resale Legal Content',
  'OTP_RESALE_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW',
  'resale_existing_property',
  'rates_taxes_consumption_charges',
  'domicilium_notices',
  'Phase 4 creates resale-only counsel-review legal content',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}.`)
}

console.log('OTP resale legal content Phase 4 contract passed.')
