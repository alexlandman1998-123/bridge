import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_ROUTE_KEY,
  OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_SECTIONS,
  OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_STATUS_READY,
  OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_VERSION,
  OTP_NEW_DEVELOPMENT_REFERENCE_SOURCE,
  OTP_NEW_DEVELOPMENT_REFERENCE_TOPICS,
  buildOtpNewDevelopmentLegalContentReport,
  formatOtpNewDevelopmentLegalContentMarkdown,
  listOtpNewDevelopmentLegalContentSections,
} from '../src/core/documents/otpNewDevelopmentLegalContent.js'
import {
  buildOtpResaleLegalContentReport,
} from '../src/core/documents/otpResaleLegalContent.js'
import {
  getOtpFieldDefinition,
} from '../src/core/documents/otpFieldRegistry.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

assert.equal(
  packageJson.scripts?.['test:otp-new-development-legal-content-phase5'],
  'node scripts/otp-new-development-legal-content-phase5.test.mjs',
  'package.json should expose the OTP new-development legal content Phase 5 contract.',
)
assert.ok(
  packageJson.scripts?.['verify:otp-template-vnext']?.includes('npm run test:otp-resale-legal-content-phase4 && npm run test:otp-new-development-legal-content-phase5 && npm run test:otp-field-data-lock-phase4'),
  'OTP vNext verification should run new-development legal content after resale legal content and before the field/data lock.',
)

assert.equal(OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_VERSION, 'otp_new_development_legal_content_phase5_v1')
assert.equal(OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_STATUS_READY, 'OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW')
assert.equal(OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_ROUTE_KEY, 'new_development')
assert.equal(OTP_NEW_DEVELOPMENT_REFERENCE_SOURCE.sha256, '62d6776d8689ea6fd62cfba6963e1d6acb9586633f3e1abfb8ef57e478f48654')
assert.equal(OTP_NEW_DEVELOPMENT_REFERENCE_SOURCE.sourceFormat, 'doc')
assert.equal(OTP_NEW_DEVELOPMENT_REFERENCE_SOURCE.sourcePageCount, 23)
assert.equal(OTP_NEW_DEVELOPMENT_REFERENCE_SOURCE.projectSignal, 'JUNOAH ESTATE')
assert.equal(OTP_NEW_DEVELOPMENT_REFERENCE_SOURCE.contractorSignal, 'SAMLIN CONSTRUCTION CC')

const sections = listOtpNewDevelopmentLegalContentSections()
assert.equal(sections.length, 27)
assert.equal(OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_SECTIONS.length, 27)
assert.equal(OTP_NEW_DEVELOPMENT_REFERENCE_TOPICS.length, 27)
assert.deepEqual(
  sections.map((section) => section.reference_topic_key),
  OTP_NEW_DEVELOPMENT_REFERENCE_TOPICS,
  'Phase 5 section order should mirror the extracted Samlin/Junoah topic order.',
)

for (const section of sections) {
  assert.equal(section.route_key, 'new_development')
  assert.deepEqual(section.variants, ['new_development'])
  assert.equal(section.metadata_json.content_version, OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_VERSION)
  assert.equal(section.metadata_json.route_key, 'new_development')
  assert.equal(section.metadata_json.reference_topic_key, section.reference_topic_key)
  assert.equal(section.metadata_json.reference_source_sha256, OTP_NEW_DEVELOPMENT_REFERENCE_SOURCE.sha256)
  assert.equal(section.metadata_json.legal_review_required, true)
  assert.equal(section.metadata_json.counsel_approval_required, true)
  assert.equal(section.metadata_json.copied_from_reference_verbatim, false)
  assert.ok(section.legal_text.length >= 160, `${section.section_key} should have substantive counsel-review wording.`)
  assert.ok(section.source_owners.every(Boolean), `${section.section_key} should not contain blank source owners.`)
  for (const token of section.placeholder_keys) {
    const definition = getOtpFieldDefinition(token)
    assert.ok(definition, `${token} should exist in the OTP field registry.`)
    assert.ok(definition.variants.includes('new_development'), `${token} should be allowed on the new-development route.`)
    assert.equal(section.source_owners.includes(definition.owner), true, `${section.section_key} should declare ${definition.owner} for ${token}.`)
    assert.equal(/^seller_|^mandatory_disclosure|^fixtures_|^subject_sale_|^rates_and_taxes|^homeowners_association/.test(token), false, `${token} should not appear in new-development legal content.`)
  }
}

const byTopic = new Map(sections.map((section) => [section.reference_topic_key, section]))
assert.ok(byTopic.get('front_schedule_parties')?.placeholder_keys.includes('developer_name'))
assert.ok(byTopic.get('front_schedule_parties')?.placeholder_keys.includes('contractor_company_name'))
assert.ok(byTopic.get('sectional_title_property')?.placeholder_keys.includes('property_unit_number'))
assert.ok(byTopic.get('sectional_title_property')?.placeholder_keys.includes('garage_allocation'))
assert.ok(byTopic.get('vat_inclusive_purchase_price')?.placeholder_keys.includes('vat_inclusive_purchase_price'))
assert.ok(byTopic.get('mortgage_finance')?.placeholder_keys.includes('bond_approval_deadline'))
assert.ok(byTopic.get('utility_connection_charges')?.placeholder_keys.includes('utility_connection_charges'))
assert.ok(byTopic.get('building_contractor_nhbrc')?.placeholder_keys.includes('property_nhbrc_certificate_number'))
assert.ok(byTopic.get('body_corporate_before_transfer')?.placeholder_keys.includes('body_corporate_rules_annexure'))
assert.ok(byTopic.get('rectification_of_defects')?.placeholder_keys.includes('snagging_period_days'))
assert.ok(byTopic.get('direct_marketing_cpa')?.legal_text.includes('direct marketing'))
assert.ok(byTopic.get('consumer_protection_acknowledgement')?.legal_text.includes('Consumer Protection Act'))
assert.ok(byTopic.get('nhbrc_certificate')?.legal_text.includes('NHBRC'))
assert.ok(byTopic.get('multi_party_signatures')?.placeholder_keys.includes('contractor_signature'))
assert.ok(byTopic.get('multi_party_signatures')?.placeholder_keys.includes('agent_signature'))
assert.equal(byTopic.get('multi_party_signatures')?.placeholder_keys.includes('seller_signature'), false)

for (const [fieldKey, owner] of new Map([
  ['developer_representative', 'development_setup'],
  ['developer_contact_email', 'development_setup'],
  ['contractor_registration_number', 'development_setup'],
  ['contractor_signature', 'signing_runtime'],
  ['agent_signature', 'signing_runtime'],
])) {
  assert.equal(getOtpFieldDefinition(fieldKey)?.owner, owner, `${fieldKey} should be owned by ${owner}.`)
  assert.ok(getOtpFieldDefinition(fieldKey)?.variants.includes('new_development'), `${fieldKey} should be new-development eligible.`)
}

const resaleReport = buildOtpResaleLegalContentReport({ generatedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(resaleReport.status, 'OTP_RESALE_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW')
assert.equal(resaleReport.routeKey, 'resale_existing_property')
assert.equal(resaleReport.tokens.includes('contractor_signature'), false)
assert.equal(resaleReport.tokens.includes('developer_name'), false)

const report = buildOtpNewDevelopmentLegalContentReport({ generatedAt: '2026-08-05T00:00:00.000Z' })
assert.equal(report.version, OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_VERSION)
assert.equal(report.status, OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_STATUS_READY)
assert.equal(report.mutatedData, false)
assert.equal(report.routeKey, 'new_development')
assert.equal(report.summary.sectionCount, 27)
assert.equal(report.summary.referenceTopicCount, 27)
assert.equal(report.summary.tokenCount, 54)
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
  'PHASE5_DEVELOPMENT_27_LEGAL_SECTIONS_PRESENT',
  'PHASE5_DEVELOPMENT_REFERENCE_TOPICS_COVERED',
  'PHASE5_DEVELOPMENT_ROUTE_ONLY',
  'PHASE5_DEVELOPMENT_TOKENS_CANONICAL',
  'PHASE5_DEVELOPMENT_TOKENS_IN_FIELD_REGISTRY',
  'PHASE5_DEVELOPMENT_EXCLUDES_RESALE_TOKENS',
  'PHASE5_DEVELOPMENT_REFERENCE_METADATA_LOCKED',
  'PHASE5_DEVELOPMENT_SOURCE_OWNERS_DECLARED',
  'PHASE5_DEVELOPMENT_CONTENT_DEPTH_PRESENT',
  'PHASE5_DEVELOPMENT_NHBRC_COVERED',
  'PHASE5_DEVELOPMENT_BODY_CORPORATE_COVERED',
  'PHASE5_DEVELOPMENT_SNAGGING_DEFECTS_COVERED',
  'PHASE5_DEVELOPMENT_CPA_COVERED',
  'PHASE5_DEVELOPMENT_MULTI_PARTY_SIGNATURES_COVERED',
]) {
  assert.equal(report.checks.find((check) => check.code === code)?.pass, true, `${code} should pass.`)
}

const markdown = formatOtpNewDevelopmentLegalContentMarkdown(report)
for (const token of [
  'OTP Template vNext Phase 5 New Development Legal Content',
  'OTP_NEW_DEVELOPMENT_LEGAL_CONTENT_READY_FOR_COUNSEL_REVIEW',
  'new_development',
  'building_contractor_nhbrc',
  'multi_party_signatures',
  'Samlin/Junoah agreement',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}.`)
}

console.log('OTP new-development legal content Phase 5 contract passed.')
