import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildMandateTemplateWordingVNext,
  formatMandateTemplateWordingVNextMarkdown,
  listMandateTemplateWordingVNextSections,
  MANDATE_TEMPLATE_WORDING_VNEXT_VERSION,
} from '../src/core/documents/mandateTemplateWordingVNext.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  packageJson.scripts?.['test:mandate-template-wording-vnext-phase4'],
  'node scripts/mandate-template-wording-vnext-phase4.test.mjs',
  'package.json should expose the mandate template wording vNext Phase 4 contract.',
)
assert.equal(
  packageJson.scripts?.['report:mandate-template-wording-vnext'],
  'node scripts/report-mandate-template-wording-vnext.mjs',
  'package.json should expose the mandate template wording vNext reporter.',
)

const sections = listMandateTemplateWordingVNextSections()
assert.equal(sections.length, 16, 'Phase 4 should preserve the default mandate flow plus six conditional content sections.')
assert.equal(sections.filter((section) => section.section_type === 'signature_zone').length, 1)
assert.deepEqual(
  sections.map((section) => section.section_key),
  [
    'introduction_purpose',
    'parties',
    'seller_individual_capacity_pack',
    'seller_company_authority_pack',
    'seller_trust_authority_pack',
    'seller_spouse_consent_pack',
    'property_details',
    'property_full_title_pack',
    'property_sectional_title_pack',
    'mandate_terms',
    'commission_terms',
    'marketing_listing_terms',
    'special_conditions',
    'general_terms',
    'popia_fica',
    'signature_pages',
  ],
)

const intro = sections.find((section) => section.section_key === 'introduction_purpose')
assert.ok(intro.legal_text.includes('The Seller appoints {{organisation_trading_name}} and {{agent_full_name}}'))
assert.ok(intro.legal_text.includes('completed mandatory disclosure form'))
assert.ok(intro.legal_text.includes('valid Fidelity Fund Certificates'))
assert.ok(intro.legal_text.includes('incorporated as an annexure or supporting disclosure record'))
assert.deepEqual(intro.placeholder_keys, ['organisation_trading_name', 'agent_full_name'])
assert.doesNotMatch(intro.legal_text, /mandate_introduction_purpose|mandatory_disclosure_status|mandatory_disclosure_annexure/)
assert.ok(!intro.legal_text.includes('{{organisation_name}}'))
assert.ok(!intro.legal_text.includes('{{agency_legal_name}}'))

const parties = sections.find((section) => section.section_key === 'parties')
assert.ok(parties.placeholder_keys.includes('organisation_legal_name'))
assert.ok(parties.placeholder_keys.includes('organisation_trading_name'))
assert.ok(parties.placeholder_keys.includes('organisation_ffc_number'))
assert.ok(parties.placeholder_keys.includes('agent_ffc_number'))

for (const section of sections) {
  assert.doesNotMatch(section.section_label, /\b(pack|packet)\b/i, `${section.section_key} should not expose internal pack/packet wording in the client label.`)
  assert.doesNotMatch(section.legal_text.split(/\r?\n/)[0] || '', /\b(pack|packet)\b/i, `${section.section_key} should not expose internal pack/packet wording in the rendered heading.`)
  assert.equal(section.metadata_json.wording_version, MANDATE_TEMPLATE_WORDING_VNEXT_VERSION)
}

for (const key of [
  'seller_company_authority_pack',
  'seller_trust_authority_pack',
  'seller_spouse_consent_pack',
  'property_full_title_pack',
  'property_sectional_title_pack',
]) {
  const section = sections.find((item) => item.section_key === key)
  assert.equal(section.is_required, false)
  assert.equal(section.metadata_json.conditional_pack, true)
  assert.equal(section.condition_json.enabled, true)
  assert.ok(section.condition_json.rule?.field || section.condition_json.any?.length, `${key} should have a visibility condition.`)
}

const marketingListing = sections.find((item) => item.section_key === 'marketing_listing_terms')
assert.equal(marketingListing.is_required, true)
assert.equal(marketingListing.section_type, 'legal_text')
assert.deepEqual(marketingListing.placeholder_keys, [])
assert.deepEqual(marketingListing.condition_json, {})
assert.doesNotMatch(marketingListing.legal_text, /{{[^{}]+}}/)
assert.ok(marketingListing.legal_text.includes('reasonable access to the Property'))
assert.ok(marketingListing.legal_text.includes('publish the listing on approved channels'))

const specialConditions = sections.find((item) => item.section_key === 'special_conditions')
assert.equal(specialConditions.is_required, false)
assert.equal(specialConditions.metadata_json.hide_when_empty, true)
assert.ok(specialConditions.condition_json.any?.length, 'special_conditions should hide unless relevant data exists.')
assert.doesNotMatch(specialConditions.legal_text, /^\s*{{[^{}]+}}\s*$/m, 'special_conditions should not contain placeholder-only lines.')

const report = buildMandateTemplateWordingVNext({
  generatedAt: '2026-07-28T12:00:00.000Z',
})
assert.equal(report.version, MANDATE_TEMPLATE_WORDING_VNEXT_VERSION)
assert.equal(report.mutatedData, false)
assert.equal(report.summary.status, 'WORDING_VNEXT_READY_FOR_COUNSEL_REVIEW')
assert.equal(report.summary.sectionCount, 16)
assert.equal(report.summary.signatureSectionCount, 1)
assert.equal(report.summary.wordingGapCount, 0)
assert.equal(report.summary.headingIssueCount, 0)
assert.equal(report.summary.blankRenderRiskCount, 0)
assert.equal(report.summary.aliasFieldCount, 0)
assert.equal(report.summary.unknownFieldCount, 0)
assert.equal(report.summary.contentBlockerCount, 0)
assert.equal(report.registryValidation.unknown.length, 0)
assert.equal(report.registryValidation.deprecated.length, 0)
assert.ok(report.tokens.includes('organisation_legal_name'))
assert.ok(report.tokens.includes('organisation_trading_name'))
for (const removedField of [
  'mandate_introduction_purpose',
  'mandatory_disclosure_status',
  'mandatory_disclosure_annexure',
  'mandate_authority_granted',
  'mandate_access_instructions',
  'mandate_marketing_permissions',
]) {
  assert.equal(report.tokens.includes(removedField), false, `${removedField} should not be visible in vNext wording.`)
}
assert.ok(report.contentScan.presentPackKeys.includes('seller_company_authority_pack'))
assert.ok(report.contentScan.presentPackKeys.includes('property_sectional_title_pack'))

const mandateTerms = sections.find((section) => section.section_key === 'mandate_terms')
assert.deepEqual(mandateTerms.placeholder_keys, ['mandate_type', 'mandate_start_date', 'mandate_end_date'])
assert.doesNotMatch(mandateTerms.legal_text, /mandate_authority_granted|mandate_access_instructions/)

const commission = sections.find((section) => section.section_key === 'commission_terms')
for (const phrase of ['effective cause', 'registration of transfer', 'protection period', 'VAT treatment']) {
  assert.ok(commission.legal_text.includes(phrase), `commission wording should include ${phrase}.`)
}

const popia = sections.find((section) => section.section_key === 'popia_fica')
for (const phrase of ['conveyancers', 'bond originators', 'compliance providers', 'transaction service providers']) {
  assert.ok(popia.legal_text.includes(phrase), `POPIA/FICA wording should include ${phrase}.`)
}

const markdown = formatMandateTemplateWordingVNextMarkdown(report)
for (const token of [
  'Mandate Template vNext Phase 4 Wording',
  'WORDING_VNEXT_READY_FOR_COUNSEL_REVIEW',
  'appointment wording is now the opening paragraph',
  'Counsel Review Boundary',
]) {
  assert.ok(markdown.includes(token), `markdown should include ${token}`)
}

const source = await readFile(new URL('../src/core/documents/mandateTemplateWordingVNext.js', import.meta.url), 'utf8')
for (const token of [
  'MANDATE_TEMPLATE_WORDING_VNEXT_VERSION',
  'MANDATE_TEMPLATE_WORDING_VNEXT_SECTIONS',
  'buildMandateTemplateWordingVNext',
  'formatMandateTemplateWordingVNextMarkdown',
  'organisation_trading_name',
]) {
  assert.ok(source.includes(token), `source should include ${token}`)
}

console.log('Mandate template wording vNext Phase 4 contract passed.')
